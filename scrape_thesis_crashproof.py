import requests
import pandas as pd
import datetime
import time
import os
import google.generativeai as genai
from tqdm import tqdm

# === KEYS (loaded from secrets.toml or environment variables) ===
from config import POLYGON_API_KEY, FRED_API_KEY, EIA_API_KEY, FMP_API_KEY, GEMINI_API_KEY

# === SETTINGS ===
# The filename we will save to (and resume from)
MASTER_FILE = "BTC_Thesis_Master.parquet"
# Starts in the "Safe Zone" for Polygon Free Tier
START_DATE_DEFAULT = "2023-06-15" 
END_DATE = datetime.datetime.now().strftime("%Y-%m-%d")

# --- 1. SMART RESUME LOGIC ---
def get_start_date(ticker):
    """Checks if we have existing data and finds the last date to resume from."""
    if os.path.exists(MASTER_FILE):
        try:
            # Load existing file to find last date
            existing_df = pd.read_parquet(MASTER_FILE)
            if not existing_df.empty:
                last_date = existing_df.index.max()
                # Start from the NEXT day to avoid duplicates
                resume_date = last_date + datetime.timedelta(days=1)
                print(f"\n>> FOUND EXISTING DATA. Resuming download from {resume_date.date()}...")
                return resume_date.strftime("%Y-%m-%d"), existing_df
        except Exception as e:
            print(f"Warning: Could not read existing file ({e}). Starting fresh.")
    
    print(f"\n>> NO EXISTING DATA. Starting fresh from {START_DATE_DEFAULT}...")
    return START_DATE_DEFAULT, pd.DataFrame()

# --- 2. POLYGON (PRICE) WITH INCREMENTAL SAVE ---
def fetch_polygon_crashproof(ticker):
    start_date, master_df = get_start_date(ticker)
    
    current_start = datetime.datetime.strptime(start_date, "%Y-%m-%d")
    final_end = datetime.datetime.strptime(END_DATE, "%Y-%m-%d")
    
    if current_start >= final_end:
        print(">> Data is already up to date!")
        return master_df

    pbar = tqdm(total=(final_end - current_start).days, desc="Downloading")

    # Loop through time
    while current_start < final_end:
        current_end = current_start + datetime.timedelta(days=90) 
        if current_end > final_end: current_end = final_end
        
        if not POLYGON_API_KEY:
            print("Warning: POLYGON_API_KEY not set — Polygon requests will likely fail or be rate-limited.")

        url = (
            f"https://api.polygon.io/v2/aggs/ticker/{ticker}/range/1/minute/"
            f"{current_start.strftime('%Y-%m-%d')}/{current_end.strftime('%Y-%m-%d')}"
            f"?adjusted=true&sort=asc&limit=50000&apiKey={POLYGON_API_KEY}"
        )

        try:
            r = requests.get(url)
            if r.status_code == 200:
                data = r.json()
                if "results" in data and data["results"]:
                    new_chunk = []
                    for row in data["results"]:
                        new_chunk.append({
                            "Date": datetime.datetime.fromtimestamp(row["t"] / 1000.0),
                            f"{ticker}_Close": row["c"],
                            f"{ticker}_Vol": row["v"]
                        })
                    
                    # Convert chunk to DataFrame
                    chunk_df = pd.DataFrame(new_chunk)
                    chunk_df.set_index("Date", inplace=True)
                    
                    # === CRITICAL: APPEND & SAVE IMMEDIATELY ===
                    master_df = pd.concat([master_df, chunk_df])
                    # Remove duplicates just in case
                    master_df = master_df[~master_df.index.duplicated(keep='first')]
                    
                    # Save to disk NOW (so if it crashes, we have this chunk)
                    master_df.to_parquet(MASTER_FILE, compression='snappy')
                    
            elif r.status_code == 403:
                pass # Skip forbidden dates
            
            time.sleep(12) # Safety sleep
        except Exception as e:
            print(f"Error downloading chunk: {e}")
            # Even if error, we continue. Data is already saved.

        current_start = current_end
        pbar.update(90)
    
    pbar.close()
    return master_df

# --- 3. FMP (SENTIMENT) ---
def fetch_fmp_safe():
    print("\n--- Fetching Social Sentiment (FMP) ---")
    all_sent = []
    # Reduced to 10 pages to minimize crash risk
    for page in tqdm(range(0, 10), desc="Sentiment Pages"):
        if not FMP_API_KEY:
            # If sentiment API key is missing, the function will safely return empty below
            print("Note: FMP_API_KEY not set. Social sentiment fetch will be skipped.")

        url = f"https://financialmodelingprep.com/api/v4/historical/social-sentiment?symbol=BTCUSD&page={page}&apikey={FMP_API_KEY}"
        try:
            r = requests.get(url)
            if r.status_code == 403: 
                print("Note: FMP Locked (Premium Only). Skipping.")
                return pd.DataFrame()
            data = r.json()
            if not data: break
            for row in data:
                all_sent.append({
                    "Date": datetime.datetime.strptime(row['date'], "%Y-%m-%d %H:%M:%S"),
                    "Twitter_Sent": row.get('twitterSentiment', 0)
                })
            time.sleep(0.5)
        except: break
    df = pd.DataFrame(all_sent)
    if not df.empty:
        df.set_index("Date", inplace=True)
        df = df.resample('1h').mean()
    return df

# --- 4. GEMINI AI (NARRATIVE INDEX) ---
def fetch_narrative_ai(price_df):
    if price_df.empty: return pd.DataFrame()
    
    print("\n--- AI Analyst: Tagging Major Moves ---")
    try:
        if not GEMINI_API_KEY:
            print("Note: GEMINI_API_KEY not set. AI narrative tagging will be skipped.")
            return pd.DataFrame()

        genai.configure(api_key=GEMINI_API_KEY)
        # UPDATED: Using the best model from your list
        model = genai.GenerativeModel('gemini-3-pro-preview')
    except Exception as e:
        print(f"AI Config Error: {e}")
        return pd.DataFrame()

    # Calculate daily returns to find volatility
    daily = price_df.resample('1D').last().pct_change()
    
    # Robustness: use the first column available (Close price)
    if daily.empty or daily.shape[1] == 0:
        print("Not enough price data for AI analysis.")
        return pd.DataFrame()

    col = daily.columns[0]
    big_moves = daily[abs(daily[col]) > 0.05].index
    
    narratives = []
    
    print(f"Attempting to tag {len(big_moves[-5:])} major events...")

    for date in tqdm(big_moves[-5:], desc="AI Thinking"):
        try:
            prompt = f"In 3 words, cause of BTC price move on {date.strftime('%Y-%m-%d')}?"
            resp = model.generate_content(prompt)
            
            # Check if response is valid
            if resp and resp.text:
                narratives.append({"Date": date, "Narrative": resp.text.strip()})
            else:
                print(f"\nAI returned empty response for {date}")
                
            time.sleep(2) # Rate limit safety
        except Exception as e:
            print(f"\nAI Error on {date.date()}: {e}")

    # Handle Empty List safely
    if not narratives:
        print("Warning: No narratives generated. Skipping AI section.")
        return pd.DataFrame()

    return pd.DataFrame(narratives).set_index("Date")

# --- MAIN EXECUTION ---
if __name__ == "__main__":
    # 1. Fetch Price (With Resume Capability)
    btc = fetch_polygon_crashproof("X:BTCUSD")
    
    # 2. Fetch Context
    sentiment = fetch_fmp_safe()
    narrative = fetch_narrative_ai(btc)
    
    # 3. Merge & Final Save
    print("\n--- Finalizing Dataset ---")
    btc.sort_index(inplace=True)
    btc['Day'] = btc.index.normalize()
    
    if not sentiment.empty:
        btc = pd.merge_asof(btc, sentiment, left_index=True, right_index=True, direction='backward')
    
    if not narrative.empty:
        narrative['Day'] = narrative.index.normalize()
        btc = btc.merge(narrative[['Narrative', 'Day']], on='Day', how='left')
    
    btc.drop(columns=['Day'], inplace=True, errors='ignore')
    btc.to_parquet(MASTER_FILE, compression='snappy')
    print(f"\nSUCCESS! Dataset saved to {MASTER_FILE}")
    print(f"Total Rows: {len(btc)}")