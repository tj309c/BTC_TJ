# TradePulse Caching & Data Storage Strategy

## Overview

The TradePulse API server implements a professional-grade, multi-tier caching architecture similar to platforms like TradingView and Bloomberg. This ensures fast response times while minimizing API calls to external data providers.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      API Request                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  TIER 1: In-Memory Cache (MEMORY_CACHE)                         │
│  - Response time: ~0ms                                          │
│  - TTL: 5 minutes                                               │
│  - Thread-safe with CACHE_LOCK                                  │
└─────────────────────────────────────────────────────────────────┘
                              │ (cache miss)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  TIER 2: Parquet File Cache                                     │
│  - Response time: ~10-50ms                                      │
│  - Persistent across server restarts                            │
│  - Columnar storage for efficient I/O                           │
└─────────────────────────────────────────────────────────────────┘
                              │ (cache miss)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  TIER 3: External API Fetch                                     │
│  - Response time: ~500-2000ms                                   │
│  - Polygon.io (primary), Kraken (fallback)                      │
│  - Incremental updates only (fetch new data since last cache)   │
└─────────────────────────────────────────────────────────────────┘
```

## Cache Files

| File | Purpose | Location |
|------|---------|----------|
| `btc_ohlc_cache.parquet` | Raw OHLC price data | Project root |
| `btc_full_data_cache.parquet` | OHLC + all pre-computed indicators | Project root |
| `btc_indicators_cache.parquet` | Standalone indicators (legacy) | Project root |

## Data Flow

### 1. Bitcoin Chart Data (`/api/bitcoin-chart-data`)

```python
# Tier 1: Check memory cache
if MEMORY_CACHE['full_data'] is not None:
    if time.time() - MEMORY_CACHE['last_update'] < 300:  # 5 min TTL
        return MEMORY_CACHE['full_data']

# Tier 2: Load from parquet file
if os.path.exists(BTC_FULL_CACHE_FILE):
    df = pd.read_parquet(BTC_FULL_CACHE_FILE)
    data = sanitize_for_json(df.to_dict('list'))
    MEMORY_CACHE['full_data'] = data
    return data

# Tier 3: Fetch from API and compute indicators
ohlc = fetch_polygon_btc_ohlc(365)
full_data = build_full_data_cache(ohlc)
save_full_data_cache(full_data)
return full_data
```

### 2. Incremental Updates

The OHLC cache supports incremental updates to minimize API calls:

```python
# Only fetch data since last cached timestamp
last_ts = get_last_cached_timestamp()
new_data = fetch_incremental_btc_data(last_ts)
merged = merge_and_dedupe_ohlc(cached, new_data)
save_btc_cache(merged)
```

## Pre-Computed Indicators

All technical indicators are computed once and cached together with OHLC data:

- **Moving Averages**: SMA (20, 50, 200), EMA (12, 26)
- **Momentum**: RSI (14), MACD (12, 26, 9), Stochastic (14, 3)
- **Volatility**: Bollinger Bands (20, 2), ATR (14)
- **Volume**: OBV, MFI (14), VWAP
- **Trend**: ADX (14), CCI (20), Williams %R (14)
- **Ichimoku**: Calculated at request time (complex dependencies)

## JSON Serialization

Parquet files store `None` as `NaN` (numpy's Not-a-Number). Since `NaN` is not valid JSON, we sanitize data at the serialization boundary:

```python
def sanitize_for_json(data_dict):
    """Convert NaN/inf values to None for JSON serialization."""
    sanitized = {}
    for key, values in data_dict.items():
        if isinstance(values, list):
            sanitized[key] = [
                None if (isinstance(v, float) and (math.isnan(v) or math.isinf(v))) else v
                for v in values
            ]
        else:
            sanitized[key] = values
    return sanitized
```

**Important**: Sanitization only affects the JSON response. The parquet file retains the original numpy-compatible data with NaN values intact.

## Cache TTLs

| Endpoint | TTL | Rationale |
|----------|-----|-----------|
| `/api/bitcoin-chart-data` | 5 min | OHLC data changes once per day |
| `/api/bitcoin-price` | 30 sec | Price updates frequently |
| `/api/bitcoin-orderbook` | 5 sec | Order book is real-time |
| `/api/events` | 1 hour | Calendar events change infrequently |
| `/api/sec-filings` | 30 min | SEC filings update periodically |
| `/api/news` | 10 min | News updates moderately |
| `/api/crypto` | 2 min | Crypto prices change frequently |

## HTTP Cache Headers

Responses include cache headers for browser-side caching:

```python
response.headers['X-Cache'] = 'HIT' or 'MISS'
response.headers['Cache-Control'] = f'public, max-age={ttl}'
```

## Thread Safety

The memory cache uses a threading lock to prevent race conditions:

```python
CACHE_LOCK = threading.Lock()

with CACHE_LOCK:
    MEMORY_CACHE['full_data'] = data
    MEMORY_CACHE['last_update'] = time.time()
```

## Cache Invalidation

To force a full refresh:

1. Delete the parquet cache files:
   ```bash
   rm btc_full_data_cache.parquet
   rm btc_ohlc_cache.parquet
   ```

2. Restart the server - it will fetch fresh data from APIs

## Performance Characteristics

| Scenario | Response Time |
|----------|---------------|
| Memory cache hit | < 5ms |
| Parquet cache hit | 10-50ms |
| Full API fetch + compute | 500-2000ms |
| Incremental update | 100-300ms |

## Why Parquet?

1. **Columnar storage**: Efficient for analytical queries
2. **Compression**: ~10x smaller than JSON
3. **Type preservation**: Native support for numpy types including NaN
4. **Fast I/O**: Optimized for sequential reads
5. **Schema evolution**: Easy to add new columns/indicators
