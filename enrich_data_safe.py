import pandas as pd
import yfinance as yf
import pandas_ta as ta
import time

# === CONFIGURATION ===
# This must match the start date you used in your scraper
RECONSTRUCT_START_DATE = "2023-06-15 00:00:00" 

def enrich_dataset():
    print("--- 1. Loading & Repairing BTC Data ---")
    try:
        # Load data without assuming the index is correct yet
        df = pd.read_csv("BTC_Price_History_Clean.csv")
        
        # RECONSTRUCT TIMELINE: Create a new date index starting from 2023-06-15
        # valid for 1-minute bars
        print(f"Raw Rows Loaded: {len(df)}")
        time_index = pd.date_range(start=RECONSTRUCT_START_DATE, periods=len(df), freq="1min")
        df['Date'] = time_index
        df.set_index('Date', inplace=True)
        
        # Clean up any artifact columns
        if 'Unnamed: 0' in df.columns:
            df.drop(columns=['Unnamed: 0'], inplace=True)

        print(f"Timeline Repaired. Range: {df.index.min()} to {df.index.max()}")

    except FileNotFoundError:
        print("CRITICAL ERROR: 'BTC_Price_History_Clean.csv' not found.")
        return

    # Define dates for Yahoo Fetching
    start_date_str = df.index.min().strftime('%Y-%m-%d')
    end_date_obj = df.index.max() + pd.Timedelta(days=1)
    end_date_str = end_date_obj.strftime('%Y-%m-%d')

    print(f"\n--- 2. Fetching S&P 500 (SPY) [{start_date_str} to {end_date_str}] ---")
    try:
        spy = yf.download("SPY", start=start_date_str, end=end_date_str, interval="1h", progress=False)
        time.sleep(2) 
        
        print("--- 3. Fetching Volatility Index (VIX) ---")
        vix = yf.download("^VIX", start=start_date_str, end=end_date_str, interval="1h", progress=False)
        
        # Handle MultiIndex columns in new yfinance versions
        if isinstance(spy.columns, pd.MultiIndex):
            spy_close = spy[('Close', 'SPY')]
            vix_close = vix[('Close', '^VIX')]
        else:
            spy_close = spy['Close']
            vix_close = vix['Close']

        # Rename
        spy_series = spy_close.rename("SPY_Price")
        vix_series = vix_close.rename("VIX_Index")

        # Resample & Merge
        print("--- 4. Merging & Aligning Data ---")
        spy_minute = spy_series.resample('1min').ffill()
        vix_minute = vix_series.resample('1min').ffill()

        df = df.join(spy_minute, how='left')
        df = df.join(vix_minute, how='left')
        
        # Fill gaps
        df.ffill(inplace=True)
        df.bfill(inplace=True)

    except Exception as e:
        print(f"Warning: Yahoo Data Fetch Failed ({e}). Continuing with Price/Vol only...")

    print("--- 5. Calculating Technical Indicators (RSI, MACD, Bollinger) ---")
    # RSI
    df['RSI_14'] = ta.rsi(df['Close'], length=14)
    
    # MACD
    macd = ta.macd(df['Close'])
    df = pd.concat([df, macd], axis=1)
    
    # Bollinger Bands
    bb = ta.bbands(df['Close'], length=20, std=2)
    df = pd.concat([df, bb], axis=1)
    
    # Clean NaN
    df.dropna(inplace=True)

    # --- SAVE ---
    output_filename = "BTC_Price_History_Enriched.csv"
    print(f"\n--- 6. Saving to {output_filename} ---")
    df.to_csv(output_filename)
    
    print(f"SUCCESS! Final Dataset: {len(df)} rows")
    print("Columns:", df.columns.tolist())

if __name__ == "__main__":
    enrich_dataset()