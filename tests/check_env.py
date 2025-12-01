"""
Simple, safe checks (non-networking):
- Verify that top-level Python scraper modules read API keys from environment when present.
- This script prints OK/MISSING for each expected env var for each module. It does not print secret values.
"""
import importlib

MODS = ['scrape_thesis_crashproof', 'scrape_safe_final']
VARS = ['POLYGON_API_KEY', 'FMP_API_KEY', 'GEMINI_API_KEY', 'FRED_API_KEY', 'EIA_API_KEY']

def check_module(name):
    try:
        mod = importlib.import_module(name)
    except Exception as e:
        print(f"{name}: import error -> {e}")
        return

    print(f"{name}:")
    for v in VARS:
        present = bool(getattr(mod, v, None))
        print(f"  {v}: {'OK' if present else 'MISSING'}")

def main():
    for m in MODS:
        check_module(m)

if __name__ == '__main__':
    main()
