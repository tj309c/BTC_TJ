import pandas as pd
df = pd.read_parquet("BTC_Thesis_Master.parquet")
df.to_csv("BTC_Thesis_Master.csv")
print("Conversion Done. Upload BTC_Thesis_Master.csv")