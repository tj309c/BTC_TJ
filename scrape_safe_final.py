import requests
import pandas as pd
import datetime
import time
import os
import google.generativeai as genai
from tqdm import tqdm

# === KEYS (loaded from secrets.toml or environment variables) ===
from config import POLYGON_API_KEY, FRED_API_KEY, EIA_API_KEY, FMP_API_KEY, GEMINI_API_KEY

# === SAFE SETTINGS FOR FREE TIER ===
# Polygon Free Tier usually only gives last 2 years of Minute data.
# We try for 5, but the script handles empty returns safely.
START_DATE = "2020-01-01" 
END_DATE   = datetime.datetime.now().strftime("%Y-%m-%d")

# --- 1. POLYGON (PRICE & VOLUME) ---
def fetch_polygon_safe(ticker):
    print(f"\n--- Fetching {ticker} (Polygon Free Tier) ---")
    current_start = datetime.datetime.strptime(START_DATE, "%Y-%m-%d")
    final_end = datetime.datetime.strptime(END_DATE, "%Y-%m-%d")
    all_data = []
    
    # Polygon Free Limit: 5 requests per minute. We sleep 12s to be safe.
    pbar = tqdm(total=(final_end - current_start).days, desc="Downloading")

    while current_start < final_end:
        current_end = current_start + datetime.timedelta(days=90) # 3-month chunks
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
                    for row in data["results"]:
                        all_data.append({
                            "Date": datetime.datetime.fromtimestamp(row["t"] / 1000.0),
                            f"{ticker}_Close": row["c"],
                            f"{ticker}_Vol": row["v"]
                        })
            elif r.status_code == 403:
                print(f"Warning: Access Denied for {current_start.date()}. (Likely Free Tier Limit)")
            
            time.sleep(12) # MANDATORY SLEEP FOR FREE TIER
        except Exception as e:
            print(f"Error: {e}")

        current_start = current_end
        pbar.update(90)
    
    pbar.close()
    df = pd.DataFrame(all_data)
    if not df.empty: 
        df.set_index("Date", inplace=True)
        # Remove duplicates
        df = df[~df.index.duplicated(keep='first')]
    return df

# --- 2. FMP (SENTIMENT - TRY/CATCH) ---
def fetch_fmp_safe():
    print("\n--- Fetching Social Sentiment (FMP) ---")
    all_sent = []
    # Only pull last 10 pages to test access first
    for page in tqdm(range(0, 50), desc="Sentiment Pages"):
        if not FMP_API_KEY:
            print("Note: FMP_API_KEY not set. Social sentiment fetch will be skipped.")

        url = f"https://financialmodelingprep.com/api/v4/historical/social-sentiment?symbol=BTCUSD&page={page}&apikey={FMP_API_KEY}"
        try:
            r = requests.get(url)
            if r.status_code == 403:
                print("Note: FMP 'Historical Sentiment' is locked on your plan. Skipping.")
                return pd.DataFrame() # Return empty if locked
            
            data = r.json()
            if not data: break
            
            for row in data:
                all_sent.append({
                    "Date": datetime.datetime.strptime(row['date'], "%Y-%m-%d %H:%M:%S"),
                    "Twitter_Sent": row.get('twitterSentiment', 0),
                    "StockTwits_Sent": row.get('stocktwitsSentiment', 0)
                })
            time.sleep(0.5)
        except: break
    
    df = pd.DataFrame(all_sent)
    if not df.empty:
        df.set_index("Date", inplace=True)
        df = df.resample('1h').mean() # Align to hours to save space
    return df

# --- 3. GEMINI AI (NARRATIVE INDEX) ---
def fetch_narrative_ai(price_df):
    if price_df.empty: return pd.DataFrame()
    
    print("\n--- AI Analyst: Tagging Major Moves (Gemini) ---")
    if not GEMINI_API_KEY:
        print("Note: GEMINI_API_KEY not set. AI narrative tagging will be skipped.")
        return pd.DataFrame()

    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-1.5-flash')
    
    # Find days with >5% moves
    daily = price_df.resample('1D').last().pct_change()
    big_moves = daily[abs(daily['X:BTCUSD_Close']) > 0.05].index
    
    narratives = []
    print(f"Found {len(big_moves)} major volatility days to analyze...")
    
    # Limit to last 10 major events to save time/quota
    for date in tqdm(big_moves[-10:], desc="AI Thinking"):
        date_str = date.strftime('%Y-%m-%d')
        prompt = f"In 3 words, what caused Bitcoin price to move on {date_str}? (e.g. FTX Crash, China Ban)."
        try:
            resp = model.generate_content(prompt)
            narratives.append({"Date": date, "Narrative": resp.text.strip()})
            time.sleep(2) # Safety sleep
        except: pass
        
    return pd.DataFrame(narratives).set_index("Date")

# --- EXECUTION ---
if __name__ == "__main__":
    # A. Price Data
    btc = fetch_polygon_safe("X:BTCUSD")
    
    if btc.empty:
        print("CRITICAL: No BTC data found. Check API Key or Internet.")
    else:
        # B. Support Data
        sentiment = fetch_fmp_safe()
        narrative = fetch_narrative_ai(btc)
        
        # C. Merge
        print("\n--- Merging Datasets ---")
        btc.sort_index(inplace=True)
        btc['Day'] = btc.index.normalize()
        
        if not sentiment.empty:
            btc = pd.merge_asof(btc, sentiment, left_index=True, right_index=True, direction='backward')
            
        if not narrative.empty:
            # Join narrative on the 'Day' column
            narrative['Day'] = narrative.index.normalize()
            btc = btc.merge(narrative[['Narrative', 'Day']], on='Day', how='left')
        
        # D. Save
        btc.drop(columns=['Day'], inplace=True, errors='ignore')
        btc.to_parquet("BTC_Safe_Thesis_Data.parquet", compression='snappy')
        print(f"\nSUCCESS! Saved {len(btc)} rows to BTC_Safe_Thesis_Data.parquet")