import pandas as pd

def clean_and_export():
    print("--- Loading Master Thesis File ---")
    # 1. Load the rich Parquet file
    df = pd.read_parquet("BTC_Thesis_Master.parquet")

    # 2. Select ONLY the Quant Data
    # We drop 'Narrative' and keep Price/Volume
    clean_df = df[['X:BTCUSD_Close', 'X:BTCUSD_Vol']].copy()

    # 3. Rename columns to standard format (easier for other tools to read)
    clean_df.columns = ['Close', 'Volume']
    
    # 4. Ensure the Index is named "Date"
    clean_df.index.name = 'Date'

    # 5. Save as a lightweight CSV
    output_file = "BTC_Price_History_Clean.csv"
    clean_df.to_csv(output_file)
    
    print(f"SUCCESS: Created '{output_file}'")
    print("--- Preview ---")
    print(clean_df.head())

if __name__ == "__main__":
    clean_and_export()