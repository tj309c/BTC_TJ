# TradePulse Startup Guide

## Quick Start (Recommended)

### One-Click Launch

Double-click **`start_tradepulse.bat`** to:
- Check and clear ports 5000 and 3000
- Install any missing dependencies
- Start the backend API server
- Start the frontend dev server
- Open the browser automatically
- Monitor for idle timeout (auto-shutdown after 30 min of inactivity)

### Other Scripts

| Script | Purpose |
|--------|---------|
| `start_tradepulse.bat` | Start all services with idle monitoring |
| `stop_tradepulse.bat` | Stop all TradePulse services |
| `status_tradepulse.bat` | Check if services are running |

---

## Manual Start

### 1. Start the Backend API Server

```bash
cd c:\Users\603506\Desktop\Trevor_Python\BTC
python api_server.py
```

You should see:
```
Starting TradePulse API Server...
API Keys loaded:
  FMP: OK
  Finnhub: OK
  Polygon: OK
  ...
Server running on http://localhost:5000
```

**Keep this terminal open** - the server must be running for the frontend to work.

### 2. Start the Frontend (in a new terminal)

```bash
cd c:\Users\603506\Desktop\Trevor_Python\BTC\tradepulse
npm run dev
```

You should see:
```
▲ Next.js 15.x
- Local: http://localhost:3000
```

### 3. Open the App

Navigate to **http://localhost:3000** in your browser.

---

## Prerequisites

### Python Dependencies

```bash
pip install flask flask-cors flask-compress pandas numpy requests pyarrow
```

### Node.js Dependencies

```bash
cd tradepulse
npm install
```

### API Keys

Create a `secrets.toml` file in the project root with your API keys:

```toml
FMP_API_KEY = "your_key_here"
FINNHUB_API_KEY = "your_key_here"
POLYGON_API_KEY = "your_key_here"
ALPHA_VANTAGE_API_KEY = "your_key_here"
NEWS_API_KEY = "your_key_here"
GEMINI_API_KEY = "your_key_here"
```

**Where to get API keys:**
- [Polygon.io](https://polygon.io/) - Bitcoin OHLC data (free tier available)
- [Finnhub](https://finnhub.io/) - IPOs, earnings, SEC filings (free tier)
- [Financial Modeling Prep](https://financialmodelingprep.com/) - News, stock data
- [Alpha Vantage](https://www.alphavantage.co/) - Alternative market data
- [NewsAPI](https://newsapi.org/) - News aggregation
- [Google AI Studio](https://makersuite.google.com/) - Gemini API for AI analysis

---

## Troubleshooting

### "ModuleNotFoundError: No module named 'flask_cors'"

Install missing Python packages:
```bash
pip install flask-cors
```

Or install all dependencies at once:
```bash
pip install flask flask-cors flask-compress pandas numpy requests pyarrow
```

### "ERR_CONNECTION_REFUSED" in browser console

The backend server is not running. Start it with:
```bash
python api_server.py
```

### "Failed to fetch chart data: SyntaxError: Unexpected token 'N'"

The cache contains corrupted data. Delete the cache files and restart:
```bash
del btc_full_data_cache.parquet
del btc_ohlc_cache.parquet
python api_server.py
```

### Port 5000 already in use

Kill the existing process or use a different port:
```bash
# Find what's using port 5000
netstat -ano | findstr :5000

# Kill the process (replace PID with the actual process ID)
taskkill /PID <PID> /F
```

### Charts show "Loading..." forever

1. Check if the backend is running (http://localhost:5000/api/health)
2. Check browser console for errors
3. Verify API keys are configured in `secrets.toml`

---

## Project Structure

```
BTC/
├── api_server.py          # Flask backend API
├── config.py              # Configuration & API key loading
├── secrets.toml           # API keys (create this file)
├── btc_ohlc_cache.parquet # Cached OHLC data (auto-generated)
├── btc_full_data_cache.parquet # Cached indicators (auto-generated)
├── CACHING_STRATEGY.md    # Caching architecture docs
├── STARTUP_GUIDE.md       # This file
│
└── tradepulse/            # Next.js frontend
    ├── app/               # Pages & routes
    ├── components/        # React components
    │   └── charts/        # Chart components
    ├── package.json       # Node dependencies
    └── ...
```

---

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check & API key status |
| `GET /api/bitcoin-price` | Current BTC price & 24h stats |
| `GET /api/bitcoin-chart-data` | OHLC + all technical indicators |
| `GET /api/bitcoin-orderbook` | Order book depth from Kraken |
| `GET /api/bitcoin-ai-analysis` | AI-powered chart analysis (Gemini) |
| `GET /api/crypto` | Top movers from CoinGecko |
| `GET /api/events` | IPOs, earnings, economic events |
| `GET /api/sec-filings` | Recent SEC filings |
| `GET /api/news` | Market news |

---

## Development Tips

### Testing the API

```bash
# Check if server is healthy
curl http://localhost:5000/api/health

# Get Bitcoin price
curl http://localhost:5000/api/bitcoin-price

# Get chart data (large response)
curl http://localhost:5000/api/bitcoin-chart-data
```

### Clearing Cache

To force fresh data from APIs:
```bash
del btc_full_data_cache.parquet
del btc_ohlc_cache.parquet
```

Then restart the server.

### Hot Reload

- **Backend**: Flask runs in debug mode - changes auto-reload
- **Frontend**: Next.js has hot module replacement enabled

---

## Architecture Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│   Browser   │────▶│  Next.js    │────▶│  Flask API      │
│  (React)    │     │  Frontend   │     │  (port 5000)    │
└─────────────┘     │  (port 3000)│     └────────┬────────┘
                    └─────────────┘              │
                                                 ▼
                                    ┌─────────────────────┐
                                    │  External APIs      │
                                    │  - Polygon.io       │
                                    │  - Kraken           │
                                    │  - Finnhub          │
                                    │  - CoinGecko        │
                                    └─────────────────────┘
```
