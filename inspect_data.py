import pandas as pd

# Load your new masterpiece
df = pd.read_parquet("BTC_Thesis_Master.parquet")

print("--- DATASET STATS ---")
print(f"Total Rows: {len(df)}")
print(f"Date Range: {df.index.min()} to {df.index.max()}")
print("\n--- COLUMNS ---")
print(df.columns.tolist())

print("\n--- GEMINI 3 NARRATIVES (The 'Secret Sauce') ---")
# Show rows where we have a narrative tag
narratives = df[df['Narrative'].notna()]
if not narratives.empty:
    print(narratives[['Narrative']].head(10))
else:
    print("No narratives found (Did the AI match the dates correctly?)")

print("\n--- SAMPLE DATA (Last 5 Minutes) ---")
print(df.tail(5))