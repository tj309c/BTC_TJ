## Repo overview — high value for AI agents

This repository contains two main areas an AI agent should know about:

- Data pipeline (Python) — top-level scripts that scrape, merge, clean, and enrich Bitcoin price and context data. Key files: `scrape_thesis_crashproof.py`, `scrape_safe_final.py`, `export_clean_data.py`, `enrich_data_safe.py`, `convert.py`. Primary data artifacts: `BTC_Thesis_Master.parquet`, `BTC_Price_History_Clean.csv`, `BTC_Price_History_Enriched.csv`.
- Backend API (Python/Flask) — `api_server.py` serves real market data to the frontend from Finnhub, Polygon, Alpha Vantage, and CoinGecko APIs.
- Frontend (Next.js) — the web UI lives in `tradepulse/`. Key files: `tradepulse/package.json`, `tradepulse/app/page.tsx`, `tradepulse/components/**`, `tradepulse/hooks/useMarketData.ts`, `tradepulse/lib/api.ts`.

## Big picture / typical developer flows

1) Data pipeline (generate & prepare datasets):
   - Run the crash-proof scraper: `python scrape_thesis_crashproof.py` — it increments and saves to `BTC_Thesis_Master.parquet`.
   - Recreate a clean CSV for smaller tools: `python export_clean_data.py` → `BTC_Price_History_Clean.csv`.
   - Enrich with technical indicators and external assets: `python enrich_data_safe.py` → `BTC_Price_History_Enriched.csv`.
   - Small helpers: `convert.py` can convert parquet → CSV.

2) Frontend development:
   - First start the backend API: `python api_server.py` (runs on http://localhost:5000)
   - Then start frontend: `cd tradepulse` then `npm run dev` (works with npm/yarn/pnpm/bun — runs on http://localhost:3000).
   - Build: `npm run build`; start production server: `npm run start`.
   - Linting: `npm run lint`.

## Project-specific patterns & gotchas for agents

- The Python scraping/ingestion scripts write several data artifacts with fixed filenames (e.g. `BTC_Thesis_Master.parquet`, `BTC_Safe_Thesis_Data.parquet`, `BTC_Price_History_Clean.csv`). Avoid renaming artifacts unless also updating downstream scripts.
- The data pipeline expects a Date index named `Date` (see `export_clean_data.py` and `enrich_data_safe.py`) — many operations rely on index-based resampling & merges.
- The frontend fetches ALL real data from the backend API (`api_server.py`). No mock data is used.
- API keys are loaded via `config.py` which reads from `secrets.toml` or environment variables.

## Required environment variables / secrets.toml

Store API keys in `secrets.toml` (preferred) or environment variables:

- POLYGON_API_KEY — polygon.io minute data access
- FINNHUB_API_KEY — Finnhub IPO calendar, earnings, SEC filings, news
- ALPHA_VANTAGE_API_KEY — Alpha Vantage news sentiment
- FMP_API_KEY — Financial Modeling Prep (optional)
- GEMINI_API_KEY — Google Gemini / LLM (optional)
- FRED_API_KEY, EIA_API_KEY — auxiliary data sources (optional)
- OPENAI_API_KEY / ANTHROPIC_API_KEY — optional LLM keys

Use `secrets.toml` locally and *never commit* secrets. The `config.py` module handles loading secrets.

## API Endpoints (api_server.py)

- GET /api/events - IPOs, earnings, economic events (from Finnhub)
- GET /api/sec-filings - SEC filings (from Finnhub)
- GET /api/news - Market news (from Finnhub, Polygon, Alpha Vantage)
- GET /api/crypto - Cryptocurrency data (from CoinGecko)
- GET /api/health - Health check with API key status

## What good PRs look like

- Small, focused changes with tests or smoke-runs (if applicable).
- For frontend changes include a screenshot or link to the running instance at `http://localhost:3000` showing the change.

## Where to look for examples and helpful references

- Data flow & file names: `export_clean_data.py`, `enrich_data_safe.py`, `scrape_thesis_crashproof.py`.
- API configuration: `config.py` (centralized secrets loading)
- Backend API: `api_server.py` (Flask endpoints serving real market data)
- Frontend API client: `tradepulse/lib/api.ts` (fetches from backend)
- UI hooks and refresh patterns: `tradepulse/hooks/useMarketData.ts` (react-query patterns)

## Quick checklist for agents before making edits

- Never commit API keys — use `secrets.toml` or environment variables.
- When touching data pipelines respect the fixed filenames unless the change is deliberate and documented.
- Ensure the backend API server is running before testing frontend features.
