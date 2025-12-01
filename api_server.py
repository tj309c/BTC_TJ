"""
Backend API server that fetches real market data from various APIs.
Serves data to the TradePulse frontend.

OPTIMIZATIONS:
- In-memory caching with TTL for all endpoints
- Pre-computed indicators saved to parquet files
- Numpy vectorized calculations for speed
- Response compression via Flask-Compress
- Cache headers for browser caching
"""
from flask import Flask, jsonify, request, make_response
from flask_cors import CORS
import requests
from datetime import datetime, timedelta
import numpy as np
import json
import hashlib
from functools import wraps
from config import (
    FMP_API_KEY,
    FINNHUB_API_KEY,
    POLYGON_API_KEY,
    ALPHA_VANTAGE_API_KEY,
    NEWS_API_KEY,
    XAI_API_KEY,
    ANTHROPIC_API_KEY,
)

app = Flask(__name__)
CORS(app)  # Allow frontend to access


# Custom JSON provider that handles NaN and Infinity values
from flask.json.provider import DefaultJSONProvider
import math


class NaNSafeJSONProvider(DefaultJSONProvider):
    """JSON provider that converts NaN and Infinity to null."""

    def dumps(self, obj, **kwargs):
        return json.dumps(self._sanitize(obj), **kwargs)

    def _sanitize(self, obj):
        if isinstance(obj, dict):
            return {k: self._sanitize(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._sanitize(item) for item in obj]
        elif isinstance(obj, float):
            if math.isnan(obj) or math.isinf(obj):
                return None
        elif isinstance(obj, np.floating):
            if np.isnan(obj) or np.isinf(obj):
                return None
            return float(obj)
        elif isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, np.ndarray):
            return self._sanitize(obj.tolist())
        return obj


# Configure Flask to use our custom JSON provider
app.json_provider_class = NaNSafeJSONProvider
app.json = NaNSafeJSONProvider(app)

# Try to enable compression
try:
    from flask_compress import Compress
    Compress(app)
    print("Response compression enabled")
except ImportError:
    print("flask-compress not installed, responses won't be compressed")


# ============ IN-MEMORY CACHE WITH TTL ============

class SimpleCache:
    """Simple in-memory cache with TTL support."""
    def __init__(self):
        self._cache = {}
        self._timestamps = {}

    def get(self, key, ttl_seconds=300):
        """Get value from cache if not expired."""
        import time
        if key in self._cache:
            if time.time() - self._timestamps.get(key, 0) < ttl_seconds:
                return self._cache[key]
            else:
                # Expired, remove
                del self._cache[key]
                del self._timestamps[key]
        return None

    def set(self, key, value):
        """Set value in cache with current timestamp."""
        import time
        self._cache[key] = value
        self._timestamps[key] = time.time()

    def clear(self):
        """Clear all cache."""
        self._cache.clear()
        self._timestamps.clear()

# Global cache instance
API_CACHE = SimpleCache()

# Cache TTLs (in seconds)
CACHE_TTL = {
    'bitcoin_chart': 300,      # 5 min - OHLC data doesn't change fast
    'bitcoin_price': 30,       # 30 sec - price updates frequently
    'bitcoin_orderbook': 5,    # 5 sec - order book is real-time
    'events': 3600,            # 1 hour - calendar events
    'sec_filings': 1800,       # 30 min - SEC filings
    'news': 600,               # 10 min - news
    'crypto': 120,             # 2 min - crypto prices
}


def cache_response(cache_key, ttl_key='bitcoin_chart'):
    """Decorator to cache API responses."""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Try to get from cache
            cached = API_CACHE.get(cache_key, CACHE_TTL.get(ttl_key, 300))
            if cached is not None:
                response = make_response(jsonify(cached))
                response.headers['X-Cache'] = 'HIT'
                response.headers['Cache-Control'] = f'public, max-age={CACHE_TTL.get(ttl_key, 300)}'
                return response

            # Execute function and cache result
            result = f(*args, **kwargs)

            # If it's a Response object, get the JSON data
            if hasattr(result, 'get_json'):
                data = result.get_json()
            else:
                data = result

            API_CACHE.set(cache_key, data)

            response = make_response(jsonify(data))
            response.headers['X-Cache'] = 'MISS'
            response.headers['Cache-Control'] = f'public, max-age={CACHE_TTL.get(ttl_key, 300)}'
            return response
        return decorated_function
    return decorator


# ============ TECHNICAL INDICATOR CALCULATIONS (NUMPY OPTIMIZED) ============

def calculate_sma(prices, period):
    """Calculate Simple Moving Average using numpy for speed."""
    if len(prices) < period:
        return [None] * len(prices)

    # Convert to numpy array for vectorized operations
    arr = np.array(prices, dtype=np.float64)

    # Use cumsum for O(n) instead of O(n*period) calculation
    cumsum = np.cumsum(arr)
    cumsum = np.insert(cumsum, 0, 0)

    sma_values = (cumsum[period:] - cumsum[:-period]) / period

    # Prepend None values
    result = [None] * (period - 1) + sma_values.tolist()
    return result


def calculate_ema(prices, period):
    """Calculate Exponential Moving Average using numpy."""
    if len(prices) < period:
        return [None] * len(prices)

    arr = np.array(prices, dtype=np.float64)
    multiplier = 2 / (period + 1)

    # Initialize EMA with SMA
    ema = np.zeros(len(arr))
    ema[:period-1] = np.nan
    ema[period-1] = np.mean(arr[:period])

    # Vectorized EMA calculation
    for i in range(period, len(arr)):
        ema[i] = (arr[i] - ema[i-1]) * multiplier + ema[i-1]

    # Convert nan to None for JSON serialization
    result = [None if np.isnan(x) else x for x in ema]
    return result


def calculate_rsi(prices, period=14):
    """Calculate Relative Strength Index using numpy."""
    if len(prices) < period + 1:
        return [None] * len(prices)

    arr = np.array(prices, dtype=np.float64)

    # Calculate price changes
    deltas = np.diff(arr)
    gains = np.where(deltas > 0, deltas, 0)
    losses = np.where(deltas < 0, -deltas, 0)

    # Calculate average gain/loss using exponential smoothing
    avg_gain = np.zeros(len(deltas))
    avg_loss = np.zeros(len(deltas))

    # First average is simple mean
    avg_gain[period-1] = np.mean(gains[:period])
    avg_loss[period-1] = np.mean(losses[:period])

    # Subsequent averages use smoothing
    for i in range(period, len(deltas)):
        avg_gain[i] = (avg_gain[i-1] * (period - 1) + gains[i]) / period
        avg_loss[i] = (avg_loss[i-1] * (period - 1) + losses[i]) / period

    # Calculate RSI
    rs = np.divide(avg_gain, avg_loss, out=np.zeros_like(avg_gain), where=avg_loss != 0)
    rsi_values = 100 - (100 / (1 + rs))

    # Handle division by zero (avg_loss = 0 means RSI = 100)
    rsi_values = np.where(avg_loss == 0, 100, rsi_values)

    # Prepend None values
    result = [None] * period + rsi_values[period-1:].tolist()
    return result


def calculate_macd(prices, fast=12, slow=26, signal=9):
    """Calculate MACD, Signal line, and Histogram."""
    if len(prices) < slow:
        return [None] * len(prices), [None] * len(prices), [None] * len(prices)

    ema_fast = calculate_ema(prices, fast)
    ema_slow = calculate_ema(prices, slow)

    macd_line = []
    for i in range(len(prices)):
        if ema_fast[i] is None or ema_slow[i] is None:
            macd_line.append(None)
        else:
            macd_line.append(ema_fast[i] - ema_slow[i])

    # Calculate signal line (EMA of MACD)
    valid_macd = [x for x in macd_line if x is not None]
    if len(valid_macd) < signal:
        return macd_line, [None] * len(prices), [None] * len(prices)

    signal_line = [None] * (slow - 1)
    macd_for_signal = macd_line[slow-1:]
    signal_ema = calculate_ema(macd_for_signal, signal)
    signal_line.extend(signal_ema)

    # Calculate histogram
    histogram = []
    for i in range(len(prices)):
        if macd_line[i] is None or signal_line[i] is None:
            histogram.append(None)
        else:
            histogram.append(macd_line[i] - signal_line[i])

    return macd_line, signal_line, histogram


def calculate_bollinger_bands(prices, period=20, std_dev=2):
    """Calculate Bollinger Bands (upper, middle, lower)."""
    if len(prices) < period:
        return [None] * len(prices), [None] * len(prices), [None] * len(prices)

    middle = calculate_sma(prices, period)
    upper = []
    lower = []

    for i in range(len(prices)):
        if i < period - 1:
            upper.append(None)
            lower.append(None)
        else:
            std = np.std(prices[i-period+1:i+1])
            upper.append(middle[i] + std_dev * std)
            lower.append(middle[i] - std_dev * std)

    return upper, middle, lower


def calculate_atr(highs, lows, closes, period=14):
    """Calculate Average True Range."""
    if len(closes) < period + 1:
        return [None] * len(closes)

    tr = [highs[0] - lows[0]]  # First TR is just high - low
    for i in range(1, len(closes)):
        tr.append(max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i-1]),
            abs(lows[i] - closes[i-1])
        ))

    atr = [None] * (period - 1)
    atr.append(sum(tr[:period]) / period)

    for i in range(period, len(tr)):
        atr.append((atr[-1] * (period - 1) + tr[i]) / period)

    return atr


def calculate_vwap(highs, lows, closes, volumes):
    """Calculate Volume Weighted Average Price."""
    if len(closes) == 0:
        return []

    typical_prices = [(h + l + c) / 3 for h, l, c in zip(highs, lows, closes)]
    cumulative_tpv = 0
    cumulative_volume = 0
    vwap = []

    for i in range(len(closes)):
        cumulative_tpv += typical_prices[i] * volumes[i]
        cumulative_volume += volumes[i]
        if cumulative_volume > 0:
            vwap.append(cumulative_tpv / cumulative_volume)
        else:
            vwap.append(None)

    return vwap


def calculate_stochastic(highs, lows, closes, k_period=14, d_period=3):
    """Calculate Stochastic Oscillator (%K and %D)."""
    if len(closes) < k_period:
        return [None] * len(closes), [None] * len(closes)

    k_values = [None] * (k_period - 1)

    for i in range(k_period - 1, len(closes)):
        highest_high = max(highs[i-k_period+1:i+1])
        lowest_low = min(lows[i-k_period+1:i+1])
        if highest_high - lowest_low == 0:
            k_values.append(50)  # Neutral when no range
        else:
            k_values.append(100 * (closes[i] - lowest_low) / (highest_high - lowest_low))

    # %D is SMA of %K
    d_values = calculate_sma(k_values, d_period)

    return k_values, d_values


def calculate_obv(closes, volumes):
    """Calculate On-Balance Volume."""
    if len(closes) < 2:
        return [0] * len(closes)

    obv = [volumes[0]]
    for i in range(1, len(closes)):
        if closes[i] > closes[i-1]:
            obv.append(obv[-1] + volumes[i])
        elif closes[i] < closes[i-1]:
            obv.append(obv[-1] - volumes[i])
        else:
            obv.append(obv[-1])
    return obv


def calculate_mfi(highs, lows, closes, volumes, period=14):
    """Calculate Money Flow Index (volume-weighted RSI)."""
    if len(closes) < period + 1:
        return [None] * len(closes)

    typical_prices = [(h + l + c) / 3 for h, l, c in zip(highs, lows, closes)]
    raw_money_flow = [tp * v for tp, v in zip(typical_prices, volumes)]

    mfi = [None] * period
    for i in range(period, len(closes)):
        pos_flow = 0
        neg_flow = 0
        for j in range(i - period + 1, i + 1):
            if j > 0:
                if typical_prices[j] > typical_prices[j-1]:
                    pos_flow += raw_money_flow[j]
                elif typical_prices[j] < typical_prices[j-1]:
                    neg_flow += raw_money_flow[j]

        if neg_flow == 0:
            mfi.append(100)
        else:
            money_ratio = pos_flow / neg_flow
            mfi.append(100 - (100 / (1 + money_ratio)))

    return mfi


def calculate_cci(highs, lows, closes, period=20):
    """Calculate Commodity Channel Index."""
    if len(closes) < period:
        return [None] * len(closes)

    typical_prices = [(h + l + c) / 3 for h, l, c in zip(highs, lows, closes)]
    cci = [None] * (period - 1)

    for i in range(period - 1, len(closes)):
        tp_slice = typical_prices[i-period+1:i+1]
        sma_tp = sum(tp_slice) / period
        mean_dev = sum(abs(tp - sma_tp) for tp in tp_slice) / period
        if mean_dev == 0:
            cci.append(0)
        else:
            cci.append((typical_prices[i] - sma_tp) / (0.015 * mean_dev))

    return cci


def calculate_williams_r(highs, lows, closes, period=14):
    """Calculate Williams %R."""
    if len(closes) < period:
        return [None] * len(closes)

    williams_r = [None] * (period - 1)
    for i in range(period - 1, len(closes)):
        highest_high = max(highs[i-period+1:i+1])
        lowest_low = min(lows[i-period+1:i+1])
        if highest_high - lowest_low == 0:
            williams_r.append(-50)
        else:
            williams_r.append(-100 * (highest_high - closes[i]) / (highest_high - lowest_low))

    return williams_r


def calculate_adx(highs, lows, closes, period=14):
    """Calculate Average Directional Index (trend strength)."""
    if len(closes) < period * 2:
        return [None] * len(closes), [None] * len(closes), [None] * len(closes)

    # Calculate +DM and -DM
    plus_dm = [0]
    minus_dm = [0]
    tr = [highs[0] - lows[0]]

    for i in range(1, len(closes)):
        high_diff = highs[i] - highs[i-1]
        low_diff = lows[i-1] - lows[i]

        if high_diff > low_diff and high_diff > 0:
            plus_dm.append(high_diff)
        else:
            plus_dm.append(0)

        if low_diff > high_diff and low_diff > 0:
            minus_dm.append(low_diff)
        else:
            minus_dm.append(0)

        tr.append(max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i-1]),
            abs(lows[i] - closes[i-1])
        ))

    # Smooth the values
    atr = calculate_ema(tr, period)
    smooth_plus_dm = calculate_ema(plus_dm, period)
    smooth_minus_dm = calculate_ema(minus_dm, period)

    # Calculate +DI and -DI
    plus_di = []
    minus_di = []
    dx = []

    for i in range(len(closes)):
        if atr[i] is None or atr[i] == 0:
            plus_di.append(None)
            minus_di.append(None)
            dx.append(None)
        else:
            pdi = 100 * (smooth_plus_dm[i] or 0) / atr[i]
            mdi = 100 * (smooth_minus_dm[i] or 0) / atr[i]
            plus_di.append(pdi)
            minus_di.append(mdi)
            if pdi + mdi == 0:
                dx.append(0)
            else:
                dx.append(100 * abs(pdi - mdi) / (pdi + mdi))

    # ADX is smoothed DX
    adx = calculate_ema([d if d is not None else 0 for d in dx], period)

    return adx, plus_di, minus_di


def calculate_ichimoku(highs, lows, closes, tenkan=9, kijun=26, senkou_b=52):
    """Calculate Ichimoku Cloud components."""
    n = len(closes)
    if n < senkou_b:
        return {
            'tenkan_sen': [None] * n,
            'kijun_sen': [None] * n,
            'senkou_a': [None] * n,
            'senkou_b': [None] * n,
            'chikou_span': [None] * n
        }

    def period_high_low_avg(highs, lows, period, i):
        if i < period - 1:
            return None
        h = max(highs[i-period+1:i+1])
        l = min(lows[i-period+1:i+1])
        return (h + l) / 2

    tenkan_sen = [period_high_low_avg(highs, lows, tenkan, i) for i in range(n)]
    kijun_sen = [period_high_low_avg(highs, lows, kijun, i) for i in range(n)]

    # Senkou Span A: (Tenkan + Kijun) / 2, shifted forward 26 periods
    senkou_a = [None] * kijun
    for i in range(n):
        if tenkan_sen[i] is not None and kijun_sen[i] is not None:
            senkou_a.append((tenkan_sen[i] + kijun_sen[i]) / 2)

    # Senkou Span B: 52-period high-low avg, shifted forward 26 periods
    senkou_b_vals = [None] * kijun
    for i in range(n):
        val = period_high_low_avg(highs, lows, senkou_b, i)
        senkou_b_vals.append(val)

    # Chikou Span: Close shifted back 26 periods
    chikou_span = closes[kijun:] + [None] * kijun

    return {
        'tenkan_sen': tenkan_sen,
        'kijun_sen': kijun_sen,
        'senkou_a': senkou_a[:n],
        'senkou_b': senkou_b_vals[:n],
        'chikou_span': chikou_span
    }


def calculate_pivot_points(high, low, close):
    """Calculate daily pivot points (support/resistance levels)."""
    pivot = (high + low + close) / 3
    r1 = 2 * pivot - low
    r2 = pivot + (high - low)
    r3 = high + 2 * (pivot - low)
    s1 = 2 * pivot - high
    s2 = pivot - (high - low)
    s3 = low - 2 * (high - pivot)

    return {
        'pivot': pivot,
        'r1': r1, 'r2': r2, 'r3': r3,
        's1': s1, 's2': s2, 's3': s3
    }


def calculate_fibonacci_retracement(high, low):
    """Calculate Fibonacci retracement levels."""
    diff = high - low
    return {
        'level_0': low,
        'level_236': low + 0.236 * diff,
        'level_382': low + 0.382 * diff,
        'level_500': low + 0.5 * diff,
        'level_618': low + 0.618 * diff,
        'level_786': low + 0.786 * diff,
        'level_100': high
    }


# ============ IPO & EARNINGS CALENDAR ============

@app.route('/api/events')
def get_market_events():
    """Fetch IPOs, earnings, and economic events from Finnhub API."""
    events = []

    today = datetime.now().strftime('%Y-%m-%d')
    future = (datetime.now() + timedelta(days=90)).strftime('%Y-%m-%d')

    # 1. Finnhub IPO Calendar (primary source - works great!)
    if FINNHUB_API_KEY:
        try:
            url = f'https://finnhub.io/api/v1/calendar/ipo?from={today}&to={future}&token={FINNHUB_API_KEY}'
            r = requests.get(url, timeout=10)
            if r.status_code == 200:
                data = r.json()
                for item in data.get('ipoCalendar', [])[:30]:
                    shares = item.get('numberOfShares')
                    desc = f"Expected price: ${item.get('price', 'TBD')}"
                    if shares:
                        desc += f" | Shares: {shares:,}"
                    events.append({
                        'id': f"ipo-{item.get('symbol', '')}-{item.get('date', '')}",
                        'title': f"{item.get('name', item.get('symbol', 'Unknown'))} IPO",
                        'date': item.get('date', today),
                        'type': 'ipo',
                        'company': item.get('name', item.get('symbol', '')),
                        'description': desc
                    })
        except Exception as e:
            print(f"Finnhub IPO error: {e}")

    # 2. Finnhub Earnings Calendar
    if FINNHUB_API_KEY:
        try:
            url = f'https://finnhub.io/api/v1/calendar/earnings?from={today}&to={future}&token={FINNHUB_API_KEY}'
            r = requests.get(url, timeout=10)
            if r.status_code == 200:
                data = r.json()
                for item in data.get('earningsCalendar', [])[:30]:
                    eps = item.get('epsEstimate', 'N/A')
                    rev = item.get('revenueEstimate', 'N/A')
                    if rev and rev != 'N/A':
                        rev = f"${rev/1e9:.2f}B" if rev > 1e9 else f"${rev/1e6:.0f}M"
                    events.append({
                        'id': f"earn-{item.get('symbol', '')}-{item.get('date', '')}",
                        'title': f"{item.get('symbol', '')} Earnings",
                        'date': item.get('date', today),
                        'type': 'earnings',
                        'company': item.get('symbol', ''),
                        'description': f"EPS Est: ${eps} | Rev Est: {rev}"
                    })
        except Exception as e:
            print(f"Finnhub earnings error: {e}")

    # 3. Key economic events (major dates)
    economic_events = [
        {'date': '2024-12-06', 'title': 'Jobs Report', 'description': 'Non-farm payrolls release'},
        {'date': '2024-12-11', 'title': 'CPI Report', 'description': 'Consumer Price Index release'},
        {'date': '2024-12-18', 'title': 'FOMC Meeting', 'description': 'Federal Reserve interest rate decision'},
        {'date': '2025-01-03', 'title': 'Jobs Report', 'description': 'Non-farm payrolls release'},
        {'date': '2025-01-15', 'title': 'CPI Report', 'description': 'Consumer Price Index release'},
        {'date': '2025-01-29', 'title': 'FOMC Meeting', 'description': 'Federal Reserve interest rate decision'},
        {'date': '2025-02-07', 'title': 'Jobs Report', 'description': 'Non-farm payrolls release'},
        {'date': '2025-02-12', 'title': 'CPI Report', 'description': 'Consumer Price Index release'},
    ]
    for evt in economic_events:
        if evt['date'] >= today:
            events.append({
                'id': f"econ-{evt['title']}-{evt['date']}",
                'title': evt['title'],
                'date': evt['date'],
                'type': 'other',
                'description': evt['description']
            })

    # Sort by date
    events.sort(key=lambda x: x['date'])

    return jsonify(events)


# ============ SEC FILINGS ============

@app.route('/api/sec-filings')
def get_sec_filings():
    """Fetch recent SEC filings from Finnhub API."""
    filings = []

    # Use Finnhub SEC filings API for major companies
    if FINNHUB_API_KEY:
        symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'JPM', 'V', 'MA']
        counter = 0
        for symbol in symbols:
            try:
                url = f'https://finnhub.io/api/v1/stock/filings?symbol={symbol}&token={FINNHUB_API_KEY}'
                r = requests.get(url, timeout=10)
                if r.status_code == 200:
                    data = r.json()
                    for item in data[:3]:  # Get 3 most recent per company
                        counter += 1
                        # Get URL with proper fallback - empty strings should not pass
                        report_url = item.get('reportUrl', '') or item.get('filingUrl', '')
                        if not report_url or not report_url.strip():
                            # Build SEC EDGAR search URL as fallback
                            form_type = item.get('form', '')
                            accession = item.get('accessNumber', '')
                            if accession:
                                # Direct link to filing via accession number
                                acc_clean = accession.replace('-', '')
                                report_url = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={symbol}&type={form_type}&dateb=&owner=include&count=10"
                            else:
                                # Search for company filings
                                report_url = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company={symbol}&type={form_type}&owner=include&count=10"
                        filings.append({
                            'id': f"sec-{counter}-{item.get('symbol', '')}-{item.get('form', '')}",
                            'title': f"Form {item.get('form', 'Filing')} - {item.get('symbol', '')}",
                            'company': item.get('symbol', ''),
                            'type': item.get('form', 'Filing'),
                            'date': item.get('filedDate', datetime.now().strftime('%Y-%m-%d'))[:10],
                            'url': report_url
                        })
            except Exception as e:
                print(f"Finnhub SEC error for {symbol}: {e}")

    # Sort by date descending and dedupe
    filings.sort(key=lambda x: x['date'], reverse=True)

    return jsonify(filings[:20])


# ============ NEWS ============

@app.route('/api/news')
def get_news():
    """Fetch market news from multiple sources."""
    news = []

    # FMP Stock News
    if FMP_API_KEY:
        try:
            url = f"https://financialmodelingprep.com/api/v3/stock_news?limit=20&apikey={FMP_API_KEY}"
            r = requests.get(url, timeout=10)
            if r.status_code == 200:
                for item in r.json():
                    news.append({
                        'id': f"fmp-{item.get('symbol', '')}-{item.get('publishedDate', '')}",
                        'headline': item.get('title', ''),
                        'source': item.get('site', 'FMP'),
                        'datetime': int(datetime.fromisoformat(item.get('publishedDate', datetime.now().isoformat()).replace('Z', '')).timestamp() * 1000) if item.get('publishedDate') else int(datetime.now().timestamp() * 1000),
                        'url': item.get('url', ''),
                        'summary': item.get('text', '')[:200],
                        'category': 'market'
                    })
        except Exception as e:
            print(f"FMP news fetch error: {e}")

    # Finnhub News
    if FINNHUB_API_KEY:
        try:
            url = f"https://finnhub.io/api/v1/news?category=general&token={FINNHUB_API_KEY}"
            r = requests.get(url, timeout=10)
            if r.status_code == 200:
                for item in r.json()[:15]:
                    news.append({
                        'id': f"finn-{item.get('id', '')}",
                        'headline': item.get('headline', ''),
                        'source': item.get('source', 'Finnhub'),
                        'datetime': item.get('datetime', 0) * 1000,
                        'url': item.get('url', ''),
                        'summary': item.get('summary', '')[:200],
                        'category': item.get('category', 'market')
                    })
        except Exception as e:
            print(f"Finnhub news fetch error: {e}")

    # Sort by datetime descending
    news.sort(key=lambda x: x['datetime'], reverse=True)

    return jsonify(news[:30])


# ============ CRYPTO DATA ============

@app.route('/api/crypto')
def get_crypto():
    """Fetch crypto data - pass through to CoinGecko (no key needed)."""
    try:
        url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=price_change_percentage_24h_desc&per_page=50&page=1&sparkline=true&price_change_percentage=24h"
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            data = r.json()
            # Filter for >10% movers (handle None values)
            significant = [c for c in data if abs(c.get('price_change_percentage_24h') or 0) > 10]
            return jsonify(significant if significant else data[:15])
    except Exception as e:
        print(f"Crypto fetch error: {e}")

    return jsonify([])


# ============ BITCOIN OHLC DATA WITH INDICATORS ============

import os
import time as time_module

# ============ PROFESSIONAL-GRADE DATA CACHING ============
#
# Architecture similar to TradingView/Bloomberg:
# 1. Parquet files for columnar binary storage (fast disk I/O)
# 2. In-memory DataFrame cache for instant access
# 3. Pre-computed indicators stored alongside OHLC
# 4. Incremental updates (only fetch new data)
# 5. Multiple cache tiers: Memory -> Parquet -> API
#
# SERVERLESS MODE: Set SERVERLESS=true to disable parquet files
# (for deployment on Render, Railway, Vercel, etc.)

import threading

# Serverless mode detection - disables file-based caching
SERVERLESS_MODE = os.environ.get('SERVERLESS', 'false').lower() == 'true'
if SERVERLESS_MODE:
    print("Running in SERVERLESS mode - parquet file caching disabled")

# Cache file paths (only used when not in serverless mode)
CACHE_DIR = os.path.dirname(__file__)
BTC_CACHE_FILE = os.path.join(CACHE_DIR, 'btc_ohlc_cache.parquet')
BTC_FULL_CACHE_FILE = os.path.join(CACHE_DIR, 'btc_full_data_cache.parquet')
BTC_INDICATORS_CACHE_FILE = os.path.join(CACHE_DIR, 'btc_indicators_cache.parquet')

# In-memory cache for instant access (tier 1)
MEMORY_CACHE = {
    'ohlc': None,
    'full_data': None,  # OHLC + all indicators pre-computed
    'last_update': 0,
}
CACHE_LOCK = threading.Lock()

BTC_CACHE_LAST_UPDATE = None
BTC_INDICATORS_LAST_UPDATE = None


def fetch_polygon_btc_ohlc(days=365):
    """Fetch Bitcoin OHLC from Polygon.io - fast and reliable."""
    if not POLYGON_API_KEY:
        return None

    try:
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')

        url = f"https://api.polygon.io/v2/aggs/ticker/X:BTCUSD/range/1/day/{start_date}/{end_date}?adjusted=true&sort=asc&apiKey={POLYGON_API_KEY}"
        r = requests.get(url, timeout=15)
        if r.status_code == 200:
            data = r.json()
            results = data.get('results', [])
            if results:
                ohlc = []
                for item in results:
                    ohlc.append({
                        'time': item['t'] // 1000,  # Convert ms to seconds
                        'open': item['o'],
                        'high': item['h'],
                        'low': item['l'],
                        'close': item['c'],
                        'volume': item.get('v', 0)
                    })
                return ohlc
    except Exception as e:
        print(f"Polygon BTC fetch error: {e}")
    return None


def fetch_kraken_btc_ohlc():
    """Fallback to Kraken for BTC OHLC."""
    try:
        since = int(time_module.time()) - (365 * 24 * 60 * 60)
        url = f"https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440&since={since}"
        r = requests.get(url, timeout=15)
        if r.status_code == 200:
            data = r.json()
            if not data.get('error'):
                result = data.get('result', {})
                ohlc_data = result.get('XXBTZUSD', [])
                if not ohlc_data and result:
                    ohlc_data = list(result.values())[0] if not isinstance(list(result.values())[0], int) else []
                ohlc = []
                for item in ohlc_data:
                    if isinstance(item, list) and len(item) >= 6:
                        ohlc.append({
                            'time': int(item[0]),
                            'open': float(item[1]),
                            'high': float(item[2]),
                            'low': float(item[3]),
                            'close': float(item[4]),
                            'volume': float(item[6]) if len(item) > 6 else 0
                        })
                return ohlc if ohlc else None
    except Exception as e:
        print(f"Kraken BTC fetch error: {e}")
    return None


def load_btc_cache():
    """Load BTC data from parquet cache."""
    if SERVERLESS_MODE:
        return None  # Skip file-based cache in serverless
    try:
        import pandas as pd
        if os.path.exists(BTC_CACHE_FILE):
            df = pd.read_parquet(BTC_CACHE_FILE)
            return df.to_dict('records')
    except Exception as e:
        print(f"Cache load error: {e}")
    return None


def save_btc_cache(ohlc_data):
    """Save BTC data to parquet cache."""
    if SERVERLESS_MODE:
        return  # Skip file-based cache in serverless
    try:
        import pandas as pd
        df = pd.DataFrame(ohlc_data)
        df.to_parquet(BTC_CACHE_FILE, index=False)
        print(f"Cached {len(ohlc_data)} BTC OHLC records to {BTC_CACHE_FILE}")
    except Exception as e:
        print(f"Cache save error: {e}")


def get_last_cached_timestamp():
    """Get the most recent timestamp from cache."""
    cached = load_btc_cache()
    if cached and len(cached) > 0:
        return max(item['time'] for item in cached)
    return None


def merge_and_dedupe_ohlc(old_data, new_data):
    """Merge old and new OHLC data, removing duplicates by timestamp."""
    if not old_data:
        return new_data
    if not new_data:
        return old_data

    # Create dict keyed by timestamp for deduplication
    merged = {item['time']: item for item in old_data}
    for item in new_data:
        merged[item['time']] = item  # New data overwrites old for same timestamp

    # Sort by time and return as list
    return sorted(merged.values(), key=lambda x: x['time'])


def fetch_incremental_btc_data(last_timestamp):
    """Fetch only new BTC data since last cached timestamp."""
    if not POLYGON_API_KEY or not last_timestamp:
        return None

    try:
        # Fetch from day after last cached data
        start_date = datetime.fromtimestamp(last_timestamp + 86400).strftime('%Y-%m-%d')
        end_date = datetime.now().strftime('%Y-%m-%d')

        if start_date >= end_date:
            return []  # Already up to date

        url = f"https://api.polygon.io/v2/aggs/ticker/X:BTCUSD/range/1/day/{start_date}/{end_date}?adjusted=true&sort=asc&apiKey={POLYGON_API_KEY}"
        r = requests.get(url, timeout=15)
        if r.status_code == 200:
            data = r.json()
            results = data.get('results', [])
            if results:
                ohlc = []
                for item in results:
                    ohlc.append({
                        'time': item['t'] // 1000,
                        'open': item['o'],
                        'high': item['h'],
                        'low': item['l'],
                        'close': item['c'],
                        'volume': item.get('v', 0)
                    })
                print(f"Fetched {len(ohlc)} new candles from Polygon")
                return ohlc
    except Exception as e:
        print(f"Incremental fetch error: {e}")
    return None


def get_btc_ohlc_with_cache():
    """Get BTC OHLC data with SMART incremental caching.

    OPTIMIZATION: Only fetches new data since last cache update,
    appends to existing parquet file for instant startup.
    """
    global BTC_CACHE_LAST_UPDATE

    current_time = time_module.time()
    cached = load_btc_cache()

    # If we have recent cache (< 5 min old), use it directly
    if BTC_CACHE_LAST_UPDATE and (current_time - BTC_CACHE_LAST_UPDATE) < 300:
        if cached:
            return cached

    # Check if cache exists and try incremental update
    if cached and len(cached) > 0:
        last_ts = get_last_cached_timestamp()
        if last_ts:
            # Only fetch new data since last cache
            new_data = fetch_incremental_btc_data(last_ts)
            if new_data is not None:
                if len(new_data) > 0:
                    # Merge new data with cache
                    merged = merge_and_dedupe_ohlc(cached, new_data)
                    save_btc_cache(merged)
                    BTC_CACHE_LAST_UPDATE = current_time
                    return merged
                else:
                    # Cache is up to date
                    BTC_CACHE_LAST_UPDATE = current_time
                    return cached

    # No cache or incremental failed - do full fetch
    ohlc = fetch_polygon_btc_ohlc(365)
    if not ohlc:
        ohlc = fetch_kraken_btc_ohlc()

    if ohlc:
        save_btc_cache(ohlc)
        BTC_CACHE_LAST_UPDATE = current_time
        return ohlc

    # Fall back to cache if API failed
    if cached:
        return cached

    return []


@app.route('/api/bitcoin-ohlc')
def get_bitcoin_ohlc():
    """Fetch Bitcoin OHLC data - basic candles only for fast rendering."""
    ohlc = get_btc_ohlc_with_cache()

    # Return only last 90 days for basic chart
    if len(ohlc) > 90:
        ohlc = ohlc[-90:]

    # Return minimal data for fast rendering
    return jsonify([{
        'time': item['time'],
        'open': item['open'],
        'high': item['high'],
        'low': item['low'],
        'close': item['close']
    } for item in ohlc])


def load_indicators_cache():
    """Load pre-computed indicators from parquet cache."""
    if SERVERLESS_MODE:
        return None  # Skip file-based cache in serverless
    try:
        import pandas as pd
        if os.path.exists(BTC_INDICATORS_CACHE_FILE):
            df = pd.read_parquet(BTC_INDICATORS_CACHE_FILE)
            return df.to_dict('list')
    except Exception as e:
        print(f"Indicators cache load error: {e}")
    return None


def save_indicators_cache(indicators_dict):
    """Save computed indicators to parquet cache."""
    if SERVERLESS_MODE:
        return  # Skip file-based cache in serverless
    try:
        import pandas as pd
        df = pd.DataFrame(indicators_dict)
        df.to_parquet(BTC_INDICATORS_CACHE_FILE, index=False)
        print(f"Cached indicators to {BTC_INDICATORS_CACHE_FILE}")
    except Exception as e:
        print(f"Indicators cache save error: {e}")


def sanitize_for_json(data_dict):
    """Convert NaN/inf values to None for JSON serialization.

    Parquet files store None as NaN, which breaks JSON serialization.
    """
    import math
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


def load_full_data_cache():
    """Load pre-computed full data (OHLC + all indicators) from parquet.

    TIER 1: Check memory cache first (instant, ~0ms)
    TIER 2: Load from parquet file (~10-50ms) - skipped in serverless mode
    """
    global MEMORY_CACHE

    with CACHE_LOCK:
        # Tier 1: Memory cache
        if MEMORY_CACHE['full_data'] is not None:
            return MEMORY_CACHE['full_data']

    # Tier 2: Parquet file (skip in serverless mode)
    if SERVERLESS_MODE:
        return None
    try:
        import pandas as pd
        if os.path.exists(BTC_FULL_CACHE_FILE):
            df = pd.read_parquet(BTC_FULL_CACHE_FILE)
            data = df.to_dict('list')
            # Sanitize NaN values before caching
            data = sanitize_for_json(data)
            # Populate memory cache
            with CACHE_LOCK:
                MEMORY_CACHE['full_data'] = data
                MEMORY_CACHE['last_update'] = time_module.time()
            print(f"Loaded full data cache from parquet ({len(df)} rows)")
            return data
    except Exception as e:
        print(f"Full data cache load error: {e}")
    return None


def save_full_data_cache(data_dict):
    """Save pre-computed full data to parquet AND memory cache."""
    global MEMORY_CACHE

    # Sanitize for memory cache (parquet handles NaN fine, but JSON doesn't)
    sanitized = sanitize_for_json(data_dict)

    # Always update memory cache
    with CACHE_LOCK:
        MEMORY_CACHE['full_data'] = sanitized
        MEMORY_CACHE['last_update'] = time_module.time()

    # Save to parquet file only if not in serverless mode
    if not SERVERLESS_MODE:
        try:
            import pandas as pd
            df = pd.DataFrame(data_dict)
            df.to_parquet(BTC_FULL_CACHE_FILE, index=False)
            print(f"Saved full data cache ({len(df)} rows) to {BTC_FULL_CACHE_FILE}")
        except Exception as e:
            print(f"Full data cache save error: {e}")
    else:
        print(f"Memory cache updated ({len(data_dict.get('time', []))} rows) - serverless mode")


def build_full_data_cache(ohlc):
    """Build complete dataset with all indicators pre-computed.

    This is the key optimization - compute everything once, cache it,
    and serve instantly. Similar to how TradingView works.
    """
    if not ohlc or len(ohlc) < 50:
        return None

    # Extract price/volume arrays
    times = [item['time'] for item in ohlc]
    opens = [item['open'] for item in ohlc]
    highs = [item['high'] for item in ohlc]
    lows = [item['low'] for item in ohlc]
    closes = [item['close'] for item in ohlc]
    volumes = [item.get('volume', 0) for item in ohlc]

    # Calculate ALL indicators upfront
    sma_20 = calculate_sma(closes, 20)
    sma_50 = calculate_sma(closes, 50)
    sma_200 = calculate_sma(closes, 200)
    ema_12 = calculate_ema(closes, 12)
    ema_26 = calculate_ema(closes, 26)

    rsi = calculate_rsi(closes, 14)
    macd_line, signal_line, histogram = calculate_macd(closes)
    bb_upper, bb_middle, bb_lower = calculate_bollinger_bands(closes, 20, 2)
    atr = calculate_atr(highs, lows, closes, 14)

    stoch_k, stoch_d = calculate_stochastic(highs, lows, closes)
    obv = calculate_obv(closes, volumes)
    mfi = calculate_mfi(highs, lows, closes, volumes, 14)
    cci = calculate_cci(highs, lows, closes, 20)
    williams_r = calculate_williams_r(highs, lows, closes, 14)
    adx, plus_di, minus_di = calculate_adx(highs, lows, closes, 14)
    vwap = calculate_vwap(highs, lows, closes, volumes)

    # Build flat structure for efficient parquet storage
    full_data = {
        'time': times,
        'open': opens,
        'high': highs,
        'low': lows,
        'close': closes,
        'volume': volumes,
        'sma_20': sma_20,
        'sma_50': sma_50,
        'sma_200': sma_200,
        'ema_12': ema_12,
        'ema_26': ema_26,
        'rsi': rsi,
        'macd': macd_line,
        'macd_signal': signal_line,
        'macd_histogram': histogram,
        'bb_upper': bb_upper,
        'bb_middle': bb_middle,
        'bb_lower': bb_lower,
        'atr': atr,
        'stoch_k': stoch_k,
        'stoch_d': stoch_d,
        'obv': obv,
        'mfi': mfi,
        'cci': cci,
        'williams_r': williams_r,
        'adx': adx,
        'plus_di': plus_di,
        'minus_di': minus_di,
        'vwap': vwap,
    }

    return full_data


def get_full_chart_data():
    """Get complete chart data with all indicators.

    Uses 3-tier caching strategy:
    1. Memory cache (~0ms)
    2. Parquet file (~10-50ms)
    3. API fetch + compute (~500-2000ms)
    """
    global MEMORY_CACHE

    current_time = time_module.time()

    # Tier 1: Check memory cache (instant)
    with CACHE_LOCK:
        if MEMORY_CACHE['full_data'] is not None:
            # Check if cache is fresh (< 5 min)
            if current_time - MEMORY_CACHE['last_update'] < 300:
                return MEMORY_CACHE['full_data']

    # Tier 2: Load from parquet
    cached = load_full_data_cache()
    if cached is not None:
        return cached

    # Tier 3: Fetch from API and compute
    ohlc = get_btc_ohlc_with_cache()
    if ohlc:
        full_data = build_full_data_cache(ohlc)
        if full_data:
            save_full_data_cache(full_data)
            return full_data

    return None


@app.route('/api/bitcoin-chart-data')
@cache_response('bitcoin_chart_data', 'bitcoin_chart')
def get_bitcoin_chart_data():
    """Fetch Bitcoin OHLC with ALL technical indicators pre-calculated.

    PROFESSIONAL-GRADE OPTIMIZATION:
    - 3-tier cache: Memory (~0ms) -> Parquet (~10ms) -> API (~500ms)
    - All indicators pre-computed and cached together
    - Instant response after first load
    """
    # Use optimized 3-tier cache
    full_data = get_full_chart_data()

    if not full_data:
        # Fallback to direct calculation
        ohlc = get_btc_ohlc_with_cache()
        if not ohlc:
            return {'error': 'No data available', 'ohlc': [], 'indicators': {}}
        full_data = build_full_data_cache(ohlc)
        if full_data:
            save_full_data_cache(full_data)

    if not full_data:
        return {'error': 'No data available', 'ohlc': [], 'indicators': {}}

    # Build response from cached data (instant)
    n = len(full_data['time'])
    candles = []
    for i in range(n):
        candles.append({
            'time': full_data['time'][i],
            'open': full_data['open'][i],
            'high': full_data['high'][i],
            'low': full_data['low'][i],
            'close': full_data['close'][i],
            'volume': full_data['volume'][i]
        })

    # Calculate pivot points and fibonacci (dynamic based on recent data)
    closes = full_data['close']
    highs = full_data['high']
    lows = full_data['low']
    pivots = calculate_pivot_points(highs[-1], lows[-1], closes[-1]) if closes else {}
    fib = calculate_fibonacci_retracement(max(highs[-90:]), min(lows[-90:])) if len(highs) >= 90 else {}

    # Calculate Ichimoku (not pre-cached due to complexity)
    ichimoku = calculate_ichimoku(highs, lows, closes)
    # Sanitize ichimoku values for JSON
    ichimoku = sanitize_for_json(ichimoku)

    # Return dict (decorator handles jsonify) - all from pre-computed cache
    return {
        'ohlc': candles,
        'indicators': {
            'sma_20': full_data.get('sma_20', []),
            'sma_50': full_data.get('sma_50', []),
            'sma_200': full_data.get('sma_200', []),
            'ema_12': full_data.get('ema_12', []),
            'ema_26': full_data.get('ema_26', []),
            'rsi': full_data.get('rsi', []),
            'macd': full_data.get('macd', []),
            'macd_signal': full_data.get('macd_signal', []),
            'macd_histogram': full_data.get('macd_histogram', []),
            'bb_upper': full_data.get('bb_upper', []),
            'bb_middle': full_data.get('bb_middle', []),
            'bb_lower': full_data.get('bb_lower', []),
            'atr': full_data.get('atr', []),
            'stoch_k': full_data.get('stoch_k', []),
            'stoch_d': full_data.get('stoch_d', []),
            'obv': full_data.get('obv', []),
            'mfi': full_data.get('mfi', []),
            'cci': full_data.get('cci', []),
            'williams_r': full_data.get('williams_r', []),
            'adx': full_data.get('adx', []),
            'plus_di': full_data.get('plus_di', []),
            'minus_di': full_data.get('minus_di', []),
            'vwap': full_data.get('vwap', []),
            'ichimoku': ichimoku
        },
        'levels': {
            'pivot_points': pivots,
            'fibonacci': fib
        },
        'meta': {
            'symbol': 'BTC/USD',
            'timeframe': '1D',
            'candles': len(candles),
            'last_update': int(time_module.time()),
            'cache_tier': 'memory' if MEMORY_CACHE.get('full_data') else 'parquet'
        }
    }


@app.route('/api/bitcoin-price')
@cache_response('bitcoin_price', 'bitcoin_price')
def get_bitcoin_price():
    """Fetch current Bitcoin price and stats - uses Kraken public API.

    OPTIMIZED: 30 second cache for price updates.
    """
    # Try Kraken first (no geo-restrictions)
    try:
        url = "https://api.kraken.com/0/public/Ticker?pair=XBTUSD"
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            data = r.json()
            if not data.get('error'):
                result = data.get('result', {})
                ticker = result.get('XXBTZUSD', {})
                if ticker:
                    price = float(ticker.get('c', [0])[0])  # Last trade close price
                    open_price = float(ticker.get('o', 0))  # Today's opening price
                    volume_24h = float(ticker.get('v', [0, 0])[1]) * price  # 24h volume in USD
                    change_24h = ((price - open_price) / open_price * 100) if open_price > 0 else 0
                    market_cap = price * 19500000  # Approximate circulating supply
                    return {
                        'price': price,
                        'change_24h': change_24h,
                        'volume_24h': volume_24h,
                        'market_cap': market_cap
                    }
    except Exception as e:
        print(f"Kraken price fetch error: {e}")

    # Fallback to CoinGecko
    try:
        url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true"
        r = requests.get(url, timeout=10, headers={'Accept': 'application/json'})
        if r.status_code == 200:
            data = r.json().get('bitcoin', {})
            return {
                'price': data.get('usd', 0),
                'change_24h': data.get('usd_24h_change', 0),
                'volume_24h': data.get('usd_24h_vol', 0),
                'market_cap': data.get('usd_market_cap', 0)
            }
    except Exception as e:
        print(f"CoinGecko price fallback error: {e}")

    return {'price': 0, 'change_24h': 0, 'volume_24h': 0, 'market_cap': 0}


# ============ ORDER BOOK DATA ============

@app.route('/api/bitcoin-orderbook')
def get_bitcoin_orderbook():
    """Fetch Bitcoin order book data from Kraken for depth visualization."""
    try:
        # Kraken order book API - no auth needed
        url = "https://api.kraken.com/0/public/Depth?pair=XBTUSD&count=50"
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            data = r.json()
            if not data.get('error'):
                result = data.get('result', {})
                book = result.get('XXBTZUSD', {})
                if not book and result:
                    # Try alternate key
                    book = list(result.values())[0] if result else {}

                if book:
                    # Format: [[price, volume, timestamp], ...]
                    bids = [[float(b[0]), float(b[1])] for b in book.get('bids', [])[:30]]
                    asks = [[float(a[0]), float(a[1])] for a in book.get('asks', [])[:30]]

                    # Calculate totals and sentiment
                    total_bid_volume = sum(b[1] for b in bids)
                    total_ask_volume = sum(a[1] for a in asks)
                    total_volume = total_bid_volume + total_ask_volume

                    sentiment = 0
                    if total_volume > 0:
                        sentiment = ((total_bid_volume - total_ask_volume) / total_volume) * 100

                    # Calculate cumulative depth
                    bid_depth = []
                    cumulative = 0
                    for price, vol in sorted(bids, key=lambda x: x[0], reverse=True):
                        cumulative += vol
                        bid_depth.append({'price': price, 'volume': vol, 'cumulative': cumulative})

                    ask_depth = []
                    cumulative = 0
                    for price, vol in sorted(asks, key=lambda x: x[0]):
                        cumulative += vol
                        ask_depth.append({'price': price, 'volume': vol, 'cumulative': cumulative})

                    # Find mid price
                    best_bid = bids[0][0] if bids else 0
                    best_ask = asks[0][0] if asks else 0
                    mid_price = (best_bid + best_ask) / 2 if best_bid and best_ask else 0
                    spread = best_ask - best_bid if best_bid and best_ask else 0
                    spread_pct = (spread / mid_price * 100) if mid_price > 0 else 0

                    return jsonify({
                        'bids': bid_depth,
                        'asks': ask_depth,
                        'stats': {
                            'total_bid_volume': total_bid_volume,
                            'total_ask_volume': total_ask_volume,
                            'sentiment': round(sentiment, 2),  # Positive = bullish, negative = bearish
                            'mid_price': mid_price,
                            'best_bid': best_bid,
                            'best_ask': best_ask,
                            'spread': spread,
                            'spread_pct': round(spread_pct, 4),
                        },
                        'timestamp': int(time_module.time())
                    })
    except Exception as e:
        print(f"Order book fetch error: {e}")

    return jsonify({'bids': [], 'asks': [], 'stats': {}, 'error': 'Failed to fetch order book'})


# ============ AI PATTERN ANALYSIS (GEMINI) ============

from config import GEMINI_API_KEY

@app.route('/api/bitcoin-ai-analysis')
def get_bitcoin_ai_analysis():
    """Use Gemini AI to analyze Bitcoin chart patterns and provide insights."""
    if not GEMINI_API_KEY:
        return jsonify({'error': 'Gemini API key not configured', 'analysis': None})

    try:
        # Get recent OHLC data for analysis
        ohlc = get_btc_ohlc_with_cache()
        if not ohlc or len(ohlc) < 30:
            return jsonify({'error': 'Insufficient data for analysis', 'analysis': None})

        # Use last 90 days for analysis
        recent = ohlc[-90:]

        # Extract OHLCV data
        closes = [d['close'] for d in recent]
        highs = [d['high'] for d in recent]
        lows = [d['low'] for d in recent]
        opens = [d['open'] for d in recent]
        volumes = [d.get('volume', 0) for d in recent]

        current_price = closes[-1]
        high_90d = max(highs)
        low_90d = min(lows)

        # Price changes at multiple timeframes
        change_1d = ((closes[-1] - closes[-2]) / closes[-2] * 100) if len(closes) >= 2 else 0
        change_7d = ((closes[-1] - closes[-7]) / closes[-7] * 100) if len(closes) >= 7 else 0
        change_30d = ((closes[-1] - closes[-30]) / closes[-30] * 100) if len(closes) >= 30 else 0

        # Moving Averages
        sma_20 = sum(closes[-20:]) / 20 if len(closes) >= 20 else current_price
        sma_50 = sum(closes[-50:]) / 50 if len(closes) >= 50 else current_price

        # EMA calculation helper
        def calc_ema(data, period):
            if len(data) < period:
                return data[-1] if data else 0
            multiplier = 2 / (period + 1)
            ema = sum(data[:period]) / period
            for price in data[period:]:
                ema = (price - ema) * multiplier + ema
            return ema

        ema_12 = calc_ema(closes, 12)
        ema_26 = calc_ema(closes, 26)

        # MACD
        macd_line = ema_12 - ema_26
        # Signal line (9-period EMA of MACD) - simplified
        macd_values = []
        for i in range(26, len(closes)):
            e12 = calc_ema(closes[:i+1], 12)
            e26 = calc_ema(closes[:i+1], 26)
            macd_values.append(e12 - e26)
        signal_line = calc_ema(macd_values, 9) if len(macd_values) >= 9 else macd_line
        macd_histogram = macd_line - signal_line

        # RSI calculation (proper 14-period)
        gains = []
        losses = []
        for i in range(1, min(15, len(closes))):
            change = closes[-i] - closes[-i-1]
            if change > 0:
                gains.append(change)
            else:
                losses.append(abs(change))
        avg_gain = sum(gains) / 14 if gains else 0
        avg_loss = sum(losses) / 14 if losses else 0.001
        rsi = 100 - (100 / (1 + avg_gain / avg_loss))

        # Bollinger Bands (20-period, 2 std dev)
        bb_period = 20
        bb_closes = closes[-bb_period:]
        bb_sma = sum(bb_closes) / bb_period
        bb_std = (sum((x - bb_sma) ** 2 for x in bb_closes) / bb_period) ** 0.5
        bb_upper = bb_sma + (2 * bb_std)
        bb_lower = bb_sma - (2 * bb_std)
        bb_width = ((bb_upper - bb_lower) / bb_sma) * 100  # BB width as percentage
        bb_position = ((current_price - bb_lower) / (bb_upper - bb_lower)) * 100 if bb_upper != bb_lower else 50

        # Volume Analysis
        avg_volume_20 = sum(volumes[-20:]) / 20 if len(volumes) >= 20 else volumes[-1]
        current_volume = volumes[-1]
        volume_ratio = (current_volume / avg_volume_20) if avg_volume_20 > 0 else 1

        # Volume trend (is volume increasing or decreasing?)
        vol_5d_avg = sum(volumes[-5:]) / 5 if len(volumes) >= 5 else current_volume
        vol_20d_avg = sum(volumes[-20:]) / 20 if len(volumes) >= 20 else current_volume
        volume_trend = "increasing" if vol_5d_avg > vol_20d_avg else "decreasing"

        # Price volatility (ATR-like measure)
        true_ranges = []
        for i in range(1, min(14, len(closes))):
            tr = max(
                highs[-i] - lows[-i],
                abs(highs[-i] - closes[-i-1]),
                abs(lows[-i] - closes[-i-1])
            )
            true_ranges.append(tr)
        atr = sum(true_ranges) / len(true_ranges) if true_ranges else 0
        atr_percent = (atr / current_price) * 100

        # Support/Resistance levels (recent swing highs/lows)
        recent_highs = sorted(highs[-30:], reverse=True)[:3]
        recent_lows = sorted(lows[-30:])[:3]

        # Candlestick pattern detection (last 3 candles)
        last_3_candles = []
        for i in range(3):
            idx = -(i+1)
            body = closes[idx] - opens[idx]
            upper_wick = highs[idx] - max(opens[idx], closes[idx])
            lower_wick = min(opens[idx], closes[idx]) - lows[idx]
            candle_type = "bullish" if body > 0 else "bearish" if body < 0 else "doji"
            last_3_candles.append({
                'type': candle_type,
                'body_size': abs(body),
                'upper_wick': upper_wick,
                'lower_wick': lower_wick
            })

        # Determine candle pattern
        candle_pattern = "None detected"
        if last_3_candles[0]['type'] == 'bullish' and last_3_candles[1]['type'] == 'bearish' and last_3_candles[0]['lower_wick'] > last_3_candles[0]['body_size']:
            candle_pattern = "Hammer (bullish reversal)"
        elif last_3_candles[0]['type'] == 'bearish' and last_3_candles[1]['type'] == 'bullish' and last_3_candles[0]['upper_wick'] > last_3_candles[0]['body_size']:
            candle_pattern = "Shooting Star (bearish reversal)"
        elif last_3_candles[0]['type'] == 'bullish' and last_3_candles[1]['type'] == 'bearish' and last_3_candles[2]['type'] == 'bearish':
            candle_pattern = "Bullish Engulfing potential"
        elif last_3_candles[0]['type'] == 'bearish' and last_3_candles[1]['type'] == 'bullish' and last_3_candles[2]['type'] == 'bullish':
            candle_pattern = "Bearish Engulfing potential"

        # Build comprehensive prompt for Gemini
        prompt = f"""Analyze this Bitcoin (BTC/USD) market data and provide a professional technical analysis:

=== PRICE DATA ===
Current Price: ${current_price:,.2f}
24h Change: {change_1d:+.2f}%
7-Day Change: {change_7d:+.2f}%
30-Day Change: {change_30d:+.2f}%
90-Day Range: ${low_90d:,.0f} - ${high_90d:,.0f}

=== MOVING AVERAGES ===
SMA 20: ${sma_20:,.2f} (Price {'above' if current_price > sma_20 else 'below'} - {'bullish' if current_price > sma_20 else 'bearish'})
SMA 50: ${sma_50:,.2f} (Price {'above' if current_price > sma_50 else 'below'} - {'bullish' if current_price > sma_50 else 'bearish'})
EMA 12: ${ema_12:,.2f}
EMA 26: ${ema_26:,.2f}
MA Cross: {'Golden cross (bullish)' if sma_20 > sma_50 else 'Death cross (bearish)'}

=== MOMENTUM INDICATORS ===
RSI (14): {rsi:.1f} ({'Overbought >70' if rsi > 70 else 'Oversold <30' if rsi < 30 else 'Neutral 30-70'})
MACD Line: {macd_line:,.2f}
Signal Line: {signal_line:,.2f}
MACD Histogram: {macd_histogram:,.2f} ({'Bullish momentum' if macd_histogram > 0 else 'Bearish momentum'})
MACD Cross: {'MACD above signal (bullish)' if macd_line > signal_line else 'MACD below signal (bearish)'}

=== BOLLINGER BANDS (20,2) ===
Upper Band: ${bb_upper:,.2f}
Middle Band: ${bb_sma:,.2f}
Lower Band: ${bb_lower:,.2f}
BB Width: {bb_width:.2f}% ({'Squeeze - low volatility' if bb_width < 5 else 'Expansion - high volatility' if bb_width > 15 else 'Normal volatility'})
Price Position: {bb_position:.1f}% (0%=lower band, 100%=upper band)

=== VOLUME ANALYSIS ===
Current Volume: {current_volume:,.0f}
20-Day Avg Volume: {avg_volume_20:,.0f}
Volume Ratio: {volume_ratio:.2f}x average ({'High volume' if volume_ratio > 1.5 else 'Low volume' if volume_ratio < 0.5 else 'Normal volume'})
Volume Trend: {volume_trend}

=== VOLATILITY ===
ATR (14): ${atr:,.2f} ({atr_percent:.2f}% of price)

=== PRICE ACTION ===
Last 7 days closes: {', '.join([f'${p:,.0f}' for p in closes[-7:]])}
Recent Resistance Levels: {', '.join([f'${h:,.0f}' for h in recent_highs])}
Recent Support Levels: {', '.join([f'${l:,.0f}' for l in recent_lows])}
Candlestick Pattern: {candle_pattern}

=== ANALYSIS REQUEST ===
Based on this comprehensive data, provide:
1. **Overall Bias**: Clear bullish/bearish/neutral stance with confidence level
2. **Trend Analysis**: Primary trend, trend strength, and any divergences
3. **Key Levels**: Most important support/resistance with rationale
4. **Entry/Exit Zones**: Potential entry points and stop-loss levels
5. **Risk Assessment**: Current risk level and what could invalidate the analysis
6. **Short-term Outlook**: 1-7 day price expectation with reasoning

Be specific with price levels. Keep response under 300 words."""

        # Call Gemini API (gemini-2.0-flash is stable and fast)
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": 500,
            }
        }

        r = requests.post(url, json=payload, timeout=30)
        if r.status_code == 200:
            response = r.json()
            candidates = response.get('candidates', [])
            if candidates:
                content = candidates[0].get('content', {})
                parts = content.get('parts', [])
                if parts:
                    analysis_text = parts[0].get('text', '')

                    return jsonify({
                        'analysis': analysis_text,
                        'metrics': {
                            'current_price': current_price,
                            'rsi': round(rsi, 1),
                            'sma_20': sma_20,
                            'sma_50': sma_50,
                            'change_7d': round(change_7d, 2),
                            'change_30d': round(change_30d, 2),
                        },
                        'timestamp': int(time_module.time())
                    })
            # No candidates in response
            print(f"Gemini API returned no candidates: {response}")
            return jsonify({'error': 'No analysis generated. Try again.', 'analysis': None})

        # Handle specific error codes
        print(f"Gemini API error: {r.status_code} - {r.text[:500]}")
        error_msg = 'Gemini API error'
        if r.status_code == 429:
            error_msg = 'Rate limit exceeded. Please try again in a few minutes.'
        elif r.status_code == 403:
            error_msg = 'API key invalid or quota exceeded. Check your Gemini API key.'
        elif r.status_code == 400:
            error_msg = 'Invalid request to Gemini API.'
        elif r.status_code == 500:
            error_msg = 'Gemini service temporarily unavailable. Try again later.'
        return jsonify({'error': error_msg, 'analysis': None})

    except Exception as e:
        print(f"AI analysis error: {e}")
        return jsonify({'error': str(e), 'analysis': None})


# ============ GEMINI - HISTORICAL PATTERN ANALYSIS ============

@app.route('/api/bitcoin-historical-patterns')
def bitcoin_historical_patterns():
    """
    Use Gemini to analyze current BTC setup and find similar historical patterns.
    Returns structured data for visualization with overlaid price trajectories.
    Enhanced with full technical indicators for comprehensive analysis.
    """
    if not GEMINI_API_KEY:
        return jsonify({'error': 'Gemini API key not configured', 'patterns': None})

    try:
        # Fetch current market data
        btc_data = {}
        try:
            price_resp = requests.get(
                'https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false',
                timeout=10
            )
            if price_resp.ok:
                data = price_resp.json()
                market = data.get('market_data', {})
                btc_data = {
                    'price': market.get('current_price', {}).get('usd'),
                    'change_24h': market.get('price_change_percentage_24h'),
                    'change_7d': market.get('price_change_percentage_7d'),
                    'change_30d': market.get('price_change_percentage_30d'),
                    'change_60d': market.get('price_change_percentage_60d'),
                    'ath': market.get('ath', {}).get('usd'),
                    'ath_change': market.get('ath_change_percentage', {}).get('usd'),
                }
        except:
            pass

        # Get Fear & Greed for context
        fear_greed = None
        try:
            fg_resp = requests.get('https://api.alternative.me/fng/?limit=1', timeout=5)
            if fg_resp.ok:
                fg_data = fg_resp.json()
                if fg_data.get('data'):
                    fear_greed = int(fg_data['data'][0].get('value', 50))
        except:
            pass

        # Get OHLC data for technical indicators
        ohlc = get_btc_ohlc_with_cache()
        technicals = {}
        if ohlc and len(ohlc) >= 50:
            closes = [d['close'] for d in ohlc[-90:]]
            highs = [d['high'] for d in ohlc[-90:]]
            lows = [d['low'] for d in ohlc[-90:]]
            volumes = [d.get('volume', 0) for d in ohlc[-90:]]

            current_price = closes[-1] if closes else btc_data.get('price', 0)

            # Moving averages
            sma_20 = sum(closes[-20:]) / 20 if len(closes) >= 20 else current_price
            sma_50 = sum(closes[-50:]) / 50 if len(closes) >= 50 else current_price

            # EMA calculation
            def calc_ema(data, period):
                if len(data) < period:
                    return data[-1] if data else 0
                multiplier = 2 / (period + 1)
                ema = sum(data[:period]) / period
                for price in data[period:]:
                    ema = (price - ema) * multiplier + ema
                return ema

            ema_12 = calc_ema(closes, 12)
            ema_26 = calc_ema(closes, 26)
            macd_line = ema_12 - ema_26

            # RSI calculation
            gains, losses = [], []
            for i in range(1, min(15, len(closes))):
                change = closes[-i] - closes[-i-1]
                if change > 0:
                    gains.append(change)
                else:
                    losses.append(abs(change))
            avg_gain = sum(gains) / 14 if gains else 0
            avg_loss = sum(losses) / 14 if losses else 0.001
            rsi = 100 - (100 / (1 + avg_gain / avg_loss))

            # Bollinger Bands
            bb_period = 20
            bb_closes = closes[-bb_period:]
            bb_sma = sum(bb_closes) / bb_period
            bb_std = (sum((x - bb_sma) ** 2 for x in bb_closes) / bb_period) ** 0.5
            bb_upper = bb_sma + (2 * bb_std)
            bb_lower = bb_sma - (2 * bb_std)
            bb_position = ((current_price - bb_lower) / (bb_upper - bb_lower)) * 100 if bb_upper != bb_lower else 50

            # Volume analysis
            avg_volume_20 = sum(volumes[-20:]) / 20 if len(volumes) >= 20 else volumes[-1] if volumes else 0
            current_volume = volumes[-1] if volumes else 0
            volume_ratio = (current_volume / avg_volume_20) if avg_volume_20 > 0 else 1

            # 90-day range
            high_90d = max(highs) if highs else current_price
            low_90d = min(lows) if lows else current_price

            technicals = {
                'sma_20': sma_20,
                'sma_50': sma_50,
                'rsi': rsi,
                'macd': macd_line,
                'bb_position': bb_position,
                'volume_ratio': volume_ratio,
                'high_90d': high_90d,
                'low_90d': low_90d,
                'ma_trend': 'bullish' if sma_20 > sma_50 else 'bearish',
                'price_vs_sma20': 'above' if current_price > sma_20 else 'below',
            }

        # Gemini API
        url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}'

        # Build comprehensive prompt
        tech_section = ""
        if technicals:
            tech_section = f"""
=== TECHNICAL INDICATORS ===
- SMA 20: ${technicals.get('sma_20', 0):,.0f} (Price {technicals.get('price_vs_sma20', 'N/A')})
- SMA 50: ${technicals.get('sma_50', 0):,.0f}
- MA Trend: {technicals.get('ma_trend', 'N/A').upper()} (20 {'>' if technicals.get('ma_trend') == 'bullish' else '<'} 50)
- RSI (14): {technicals.get('rsi', 50):.1f} ({'Overbought' if technicals.get('rsi', 50) > 70 else 'Oversold' if technicals.get('rsi', 50) < 30 else 'Neutral'})
- MACD: {technicals.get('macd', 0):,.0f} ({'Bullish' if technicals.get('macd', 0) > 0 else 'Bearish'})
- Bollinger Position: {technicals.get('bb_position', 50):.0f}% (0=lower, 100=upper band)
- Volume Ratio: {technicals.get('volume_ratio', 1):.2f}x average
- 90-Day Range: ${technicals.get('low_90d', 0):,.0f} - ${technicals.get('high_90d', 0):,.0f}
"""

        prompt = f"""Analyze the current Bitcoin market conditions with full technical context and identify similar historical periods.

=== CURRENT MARKET CONDITIONS ===
- Price: ${btc_data.get('price', 0):,.0f}
- 24h Change: {btc_data.get('change_24h', 0):+.1f}%
- 7d Change: {btc_data.get('change_7d', 0):+.1f}%
- 30d Change: {btc_data.get('change_30d', 0):+.1f}%
- 60d Change: {btc_data.get('change_60d', 0):+.1f}%
- Distance from ATH (${btc_data.get('ath', 0):,.0f}): {btc_data.get('ath_change', 0):+.1f}%
- Fear & Greed Index: {fear_greed if fear_greed else 'N/A'} ({'Extreme Fear' if fear_greed and fear_greed < 25 else 'Fear' if fear_greed and fear_greed < 45 else 'Neutral' if fear_greed and fear_greed < 55 else 'Greed' if fear_greed and fear_greed < 75 else 'Extreme Greed' if fear_greed else 'N/A'})
{tech_section}
=== ANALYSIS REQUEST ===
Based on your knowledge of Bitcoin's complete price history (2010-2024), identify 3-4 periods with similar:
1. Technical setup (RSI, MA alignment, BB position)
2. Market sentiment (Fear & Greed level)
3. Price structure (% from ATH, recent momentum)

Return ONLY a JSON object with this exact structure:
{{
    "current_setup": {{
        "pattern_type": "<consolidation/correction/capitulation/accumulation/distribution/breakout/rally>",
        "key_characteristics": ["<characteristic 1>", "<characteristic 2>", "<characteristic 3>"],
        "technical_context": "<1-2 sentence describing current setup with specific indicator readings>",
        "bias": "<bullish/bearish/neutral>",
        "bias_strength": "<strong/moderate/weak>"
    }},
    "historical_matches": [
        {{
            "period": "<e.g., 'March 2020' or 'Q4 2018'>",
            "date_range": "<e.g., 'Mar 12-20, 2020'>",
            "similarity_score": <60-95>,
            "starting_conditions": "<brief description including key indicator values then>",
            "what_triggered_move": "<catalyst or event that caused the subsequent move>",
            "outcome_30d": "<what happened, e.g., '+45% rally to $X'>",
            "outcome_90d": "<what happened, e.g., '+120% to $X'>",
            "key_lesson": "<main takeaway for current traders>",
            "normalized_trajectory": [
                {{"day": 0, "pct": 0}},
                {{"day": 7, "pct": <pct change from start>}},
                {{"day": 14, "pct": <pct change>}},
                {{"day": 30, "pct": <pct change>}},
                {{"day": 60, "pct": <pct change>}},
                {{"day": 90, "pct": <pct change>}}
            ]
        }}
    ],
    "probability_weighted_forecast": {{
        "30_day_expected": "<expected range with % probabilities, e.g., '-5% to +15% (65% confidence)'>",
        "90_day_expected": "<expected range>",
        "confidence": <0-100>,
        "primary_scenario": "<most likely outcome with specific price target>",
        "risk_scenario": "<what would invalidate this outlook>"
    }},
    "key_levels": {{
        "immediate_resistance": "<price level>",
        "immediate_support": "<price level>",
        "critical_invalidation": "<price level that changes the outlook>"
    }},
    "risk_factors": ["<specific risk 1>", "<specific risk 2>", "<specific risk 3>"],
    "bullish_catalysts": ["<specific catalyst 1>", "<specific catalyst 2>"],
    "actionable_insight": "<1 sentence specific recommendation based on historical pattern analysis>",
    "summary": "<3-4 sentence comprehensive analysis combining technical indicators, historical patterns, and current sentiment>"
}}

IMPORTANT: Use REAL Bitcoin historical data with accurate dates and percentages. Return ONLY valid JSON, no markdown."""

        payload = {
            'contents': [{'parts': [{'text': prompt}]}],
            'generationConfig': {
                'temperature': 0.5,
                'maxOutputTokens': 2500
            }
        }

        r = requests.post(url, json=payload, timeout=45)

        if r.status_code == 200:
            result = r.json()
            content = result.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')

            # Parse JSON response
            try:
                content = content.strip()
                if content.startswith('```'):
                    content = content.split('```')[1]
                    if content.startswith('json'):
                        content = content[4:]
                content = content.strip()

                pattern_data = json.loads(content)

                return jsonify({
                    'patterns': pattern_data,
                    'current_price': btc_data.get('price'),
                    'fear_greed': fear_greed,
                    'timestamp': datetime.now().isoformat(),
                    'source': 'gemini-ai'
                })
            except json.JSONDecodeError as e:
                print(f"Gemini pattern JSON parse error: {e}")
                print(f"Raw content: {content[:500]}")
                return jsonify({
                    'error': 'Failed to parse pattern data',
                    'raw_analysis': content,
                    'patterns': None
                })
        else:
            error_msg = 'Gemini API error'
            print(f"Gemini pattern API error: {r.status_code} - {r.text[:500]}")
            if r.status_code == 429:
                error_msg = 'Rate limit exceeded. Try again later.'
            elif r.status_code == 403:
                error_msg = 'API key invalid or quota exceeded'
            return jsonify({'error': error_msg, 'patterns': None})

    except requests.exceptions.Timeout:
        return jsonify({'error': 'Gemini API timeout', 'patterns': None})
    except Exception as e:
        print(f"Historical pattern analysis error: {e}")
        return jsonify({'error': str(e), 'patterns': None})


# ============ GROK AI - X SOCIAL SENTIMENT ============

@app.route('/api/bitcoin-social-sentiment')
def bitcoin_social_sentiment():
    """
    Get Bitcoin social sentiment from X (Twitter) using Grok AI.
    Returns structured data for visualization: current sentiment + 30-day trend.
    """
    if not XAI_API_KEY:
        return jsonify({'error': 'XAI API key not configured', 'sentiment': None})

    try:
        # Get current Bitcoin price for context
        btc_price = None
        btc_change = 0
        try:
            price_resp = requests.get(
                'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true',
                timeout=5
            )
            if price_resp.ok:
                data = price_resp.json()
                btc_price = data.get('bitcoin', {}).get('usd')
                btc_change = data.get('bitcoin', {}).get('usd_24h_change', 0) or 0
        except:
            pass

        # Grok API endpoint (xAI)
        url = 'https://api.x.ai/v1/chat/completions'

        headers = {
            'Authorization': f'Bearer {XAI_API_KEY}',
            'Content-Type': 'application/json'
        }

        # Format price string safely
        price_str = f"${btc_price:,.0f}" if btc_price else "Unknown"
        change_str = f"{btc_change:+.1f}%" if btc_change else "N/A"

        # Ask Grok for structured sentiment analysis
        prompt = f"""Analyze current Bitcoin/crypto sentiment on X (Twitter) right now.

Current BTC Price: {price_str} (24h change: {change_str})

Return your analysis as a JSON object with this EXACT structure:
{{
    "current_sentiment": {{
        "score": <number from -100 (extremely bearish) to +100 (extremely bullish)>,
        "label": "<one of: 'Extremely Bearish', 'Bearish', 'Slightly Bearish', 'Neutral', 'Slightly Bullish', 'Bullish', 'Extremely Bullish'>",
        "confidence": <number 0-100>
    }},
    "trending_topics": [
        {{"topic": "<hashtag or topic>", "sentiment": <-100 to +100>, "volume": "<high/medium/low>"}},
        ... (top 5 topics)
    ],
    "key_influencers_sentiment": {{
        "bullish_voices": <count of notable bullish posts>,
        "bearish_voices": <count of notable bearish posts>,
        "notable_calls": ["<brief description of notable predictions>"]
    }},
    "sentiment_drivers": [
        "<what's driving positive sentiment>",
        "<what's driving negative sentiment>"
    ],
    "30_day_trend": [
        {{"period": "30 days ago", "score": <estimated score>}},
        {{"period": "3 weeks ago", "score": <estimated score>}},
        {{"period": "2 weeks ago", "score": <estimated score>}},
        {{"period": "1 week ago", "score": <estimated score>}},
        {{"period": "Today", "score": <current score>}}
    ],
    "summary": "<2-3 sentence summary of the current X sentiment landscape for Bitcoin>"
}}

Base your analysis on typical X/Twitter crypto sentiment patterns and current market conditions.
IMPORTANT: Return ONLY the JSON object, no markdown, no explanation."""

        payload = {
            'model': 'grok-3-latest',
            'messages': [
                {
                    'role': 'system',
                    'content': 'You are a crypto social media sentiment analyst with deep knowledge of X/Twitter crypto community. Return only valid JSON.'
                },
                {
                    'role': 'user',
                    'content': prompt
                }
            ],
            'temperature': 0.7,
            'max_tokens': 1000
        }

        r = requests.post(url, json=payload, headers=headers, timeout=30)

        if r.status_code == 200:
            result = r.json()
            content = result.get('choices', [{}])[0].get('message', {}).get('content', '')

            # Parse the JSON response
            try:
                # Clean up response (remove markdown code blocks if present)
                content = content.strip()
                if content.startswith('```'):
                    content = content.split('```')[1]
                    if content.startswith('json'):
                        content = content[4:]
                content = content.strip()

                sentiment_data = json.loads(content)

                return jsonify({
                    'sentiment': sentiment_data,
                    'btc_price': btc_price,
                    'btc_change_24h': btc_change,
                    'timestamp': datetime.now().isoformat(),
                    'source': 'grok-ai'
                })
            except json.JSONDecodeError as e:
                print(f"Grok JSON parse error: {e}")
                print(f"Raw content: {content[:500]}")
                return jsonify({
                    'error': 'Failed to parse sentiment data',
                    'raw_analysis': content,
                    'sentiment': None
                })
        else:
            error_msg = 'Grok API error'
            print(f"Grok API error: {r.status_code} - {r.text[:500]}")
            if r.status_code == 429:
                error_msg = 'Rate limit exceeded. Try again later.'
            elif r.status_code == 401:
                error_msg = 'Invalid XAI API key'
            elif r.status_code == 403:
                error_msg = 'API access forbidden - check your plan'
            return jsonify({'error': error_msg, 'sentiment': None})

    except requests.exceptions.Timeout:
        return jsonify({'error': 'Grok API timeout', 'sentiment': None})
    except Exception as e:
        print(f"Grok sentiment error: {e}")
        return jsonify({'error': str(e), 'sentiment': None})


# ============ CLAUDE AI - DEEP MARKET ANALYSIS ============

@app.route('/api/bitcoin-claude-analysis')
def bitcoin_claude_analysis():
    """
    Get deep Bitcoin market analysis using Claude AI.
    Claude excels at nuanced analysis and reasoning.
    """
    if not ANTHROPIC_API_KEY:
        return jsonify({'error': 'Anthropic API key not configured', 'analysis': None})

    try:
        # Fetch comprehensive market data
        btc_data = {}

        # Get price and market data
        try:
            price_resp = requests.get(
                'https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=true&developer_data=false',
                timeout=10
            )
            if price_resp.ok:
                data = price_resp.json()
                market = data.get('market_data', {})
                btc_data = {
                    'price': market.get('current_price', {}).get('usd'),
                    'market_cap': market.get('market_cap', {}).get('usd'),
                    'volume_24h': market.get('total_volume', {}).get('usd'),
                    'change_24h': market.get('price_change_percentage_24h'),
                    'change_7d': market.get('price_change_percentage_7d'),
                    'change_30d': market.get('price_change_percentage_30d'),
                    'ath': market.get('ath', {}).get('usd'),
                    'ath_change': market.get('ath_change_percentage', {}).get('usd'),
                    'circulating_supply': market.get('circulating_supply'),
                    'sentiment_up': data.get('sentiment_votes_up_percentage'),
                    'sentiment_down': data.get('sentiment_votes_down_percentage'),
                }
        except:
            pass

        # Get Fear & Greed Index
        fear_greed = None
        try:
            fg_resp = requests.get('https://api.alternative.me/fng/?limit=1', timeout=5)
            if fg_resp.ok:
                fg_data = fg_resp.json()
                if fg_data.get('data'):
                    fear_greed = {
                        'value': int(fg_data['data'][0].get('value', 50)),
                        'classification': fg_data['data'][0].get('value_classification', 'Neutral')
                    }
        except:
            pass

        # Claude API endpoint
        url = 'https://api.anthropic.com/v1/messages'

        headers = {
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
        }

        # Safely format market data values - convert to float to handle string responses
        def safe_float(val, default=0):
            try:
                return float(val) if val is not None else default
            except (ValueError, TypeError):
                return default

        price = safe_float(btc_data.get('price'))
        market_cap = safe_float(btc_data.get('market_cap'))
        volume_24h = safe_float(btc_data.get('volume_24h'))
        change_24h = safe_float(btc_data.get('change_24h'))
        change_7d = safe_float(btc_data.get('change_7d'))
        change_30d = safe_float(btc_data.get('change_30d'))
        ath = safe_float(btc_data.get('ath'))
        ath_change = safe_float(btc_data.get('ath_change'))
        fg_value = fear_greed.get('value') if fear_greed else 'N/A'
        fg_class = fear_greed.get('classification') if fear_greed else 'N/A'

        # Build comprehensive analysis prompt
        prompt = f"""Provide a comprehensive Bitcoin market analysis based on this data:

MARKET DATA:
- Current Price: ${price:,.0f}
- Market Cap: ${market_cap/1e9:.1f}B
- 24h Volume: ${volume_24h/1e9:.1f}B
- 24h Change: {change_24h:+.2f}%
- 7d Change: {change_7d:+.2f}%
- 30d Change: {change_30d:+.2f}%
- ATH: ${ath:,.0f} ({ath_change:+.1f}% from ATH)
- Fear & Greed Index: {fg_value} ({fg_class})

Provide analysis in this JSON format:
{{
    "market_phase": {{
        "current": "<accumulation/markup/distribution/markdown>",
        "confidence": <0-100>,
        "explanation": "<1-2 sentences>"
    }},
    "trend_analysis": {{
        "primary_trend": "<bullish/bearish/neutral>",
        "trend_strength": "<strong/moderate/weak>",
        "key_levels": {{
            "resistance": [<price1>, <price2>],
            "support": [<price1>, <price2>]
        }}
    }},
    "risk_assessment": {{
        "overall_risk": "<low/moderate/high/extreme>",
        "risk_factors": ["<factor1>", "<factor2>"],
        "opportunity_factors": ["<factor1>", "<factor2>"]
    }},
    "scenarios": {{
        "bullish_case": {{
            "target": <price>,
            "probability": <0-100>,
            "catalyst": "<what would cause this>"
        }},
        "bearish_case": {{
            "target": <price>,
            "probability": <0-100>,
            "catalyst": "<what would cause this>"
        }},
        "base_case": {{
            "target": <price>,
            "probability": <0-100>,
            "rationale": "<why this is most likely>"
        }}
    }},
    "actionable_insights": [
        "<specific insight 1>",
        "<specific insight 2>",
        "<specific insight 3>"
    ],
    "summary": "<3-4 sentence executive summary>"
}}

Return ONLY valid JSON, no markdown formatting."""

        payload = {
            'model': 'claude-sonnet-4-20250514',
            'max_tokens': 1500,
            'messages': [
                {
                    'role': 'user',
                    'content': prompt
                }
            ]
        }

        r = requests.post(url, json=payload, headers=headers, timeout=45)

        if r.status_code == 200:
            result = r.json()
            content = result.get('content', [{}])[0].get('text', '')

            # Parse the JSON response
            try:
                content = content.strip()
                if content.startswith('```'):
                    content = content.split('```')[1]
                    if content.startswith('json'):
                        content = content[4:]
                content = content.strip()

                analysis_data = json.loads(content)

                return jsonify({
                    'analysis': analysis_data,
                    'market_data': btc_data,
                    'fear_greed': fear_greed,
                    'timestamp': datetime.now().isoformat(),
                    'source': 'claude-ai'
                })
            except json.JSONDecodeError as e:
                print(f"Claude JSON parse error: {e}")
                return jsonify({
                    'error': 'Failed to parse analysis data',
                    'raw_analysis': content,
                    'analysis': None
                })
        else:
            error_msg = 'Claude API error'
            print(f"Claude API error: {r.status_code} - {r.text[:500]}")
            if r.status_code == 429:
                error_msg = 'Rate limit exceeded. Try again later.'
            elif r.status_code == 401:
                error_msg = 'Invalid Anthropic API key'
            elif r.status_code == 403:
                error_msg = 'API access forbidden'
            return jsonify({'error': error_msg, 'analysis': None})

    except requests.exceptions.Timeout:
        return jsonify({'error': 'Claude API timeout', 'sentiment': None})
    except Exception as e:
        print(f"Claude analysis error: {e}")
        return jsonify({'error': str(e), 'analysis': None})


# ============ BTC VOLUME ANALYSIS ============

@app.route('/api/bitcoin-volume-analysis')
def get_bitcoin_volume_analysis():
    """Analyze Bitcoin volume for statistical anomalies.

    Calculates Z-score and percentile ranking of current volume
    compared to historical averages. Detects volume spikes.

    Query Parameters:
        lookback: int - Number of days for analysis window (7-30, default 14)
                       Minimum 7 days required for statistically meaningful results
    """
    try:
        # Get lookback period from query params (default 14, min 7, max 30)
        # Minimum 7 days required for meaningful z-score/percentile calculations
        lookback_days = request.args.get('lookback', 14, type=int)
        lookback_days = max(7, min(30, lookback_days))

        # Fetch historical OHLCV data from Kraken
        # Get 60 days of daily data for statistical analysis
        url = "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440"  # 1440 = daily
        r = requests.get(url, timeout=15)

        if r.status_code != 200:
            return jsonify({'error': 'Failed to fetch volume data', 'spike': None})

        data = r.json()
        if data.get('error'):
            return jsonify({'error': str(data['error']), 'spike': None})

        result = data.get('result', {})
        ohlc = result.get('XXBTZUSD', [])

        if len(ohlc) < 20:
            return jsonify({'error': 'Insufficient historical data', 'spike': None})

        # Extract all OHLCV data
        # Format: [time, open, high, low, close, vwap, volume, count]
        all_volumes = []
        all_prices = []
        all_opens = []
        all_highs = []
        all_lows = []
        all_closes = []
        for candle in ohlc[-60:]:  # Last 60 days
            vol = float(candle[6])  # BTC volume
            open_p = float(candle[1])
            high_p = float(candle[2])
            low_p = float(candle[3])
            close_p = float(candle[4])
            all_volumes.append(vol * close_p)  # Convert to USD volume
            all_prices.append(close_p)
            all_opens.append(open_p)
            all_highs.append(high_p)
            all_lows.append(low_p)
            all_closes.append(close_p)

        # Use the lookback window for analysis
        volumes = all_volumes[-(lookback_days + 1):]  # +1 to include today
        prices = all_prices[-(lookback_days + 1):]

        if len(volumes) < 2:
            return jsonify({'error': 'Insufficient volume data', 'spike': None})

        volumes_arr = np.array(volumes)
        prices_arr = np.array(prices)

        # Current volume (today or most recent)
        current_volume = volumes_arr[-1]
        current_price = prices_arr[-1]

        # Calculate statistics for the lookback period (excluding today)
        lookback = volumes_arr[:-1] if len(volumes_arr) > 1 else volumes_arr
        avg_volume = float(np.mean(lookback))
        std_volume = float(np.std(lookback)) if len(lookback) > 1 else float(np.mean(lookback) * 0.1)
        median_volume = float(np.median(lookback))

        # Calculate Z-score (how many std deviations from mean)
        z_score = (current_volume - avg_volume) / std_volume if std_volume > 0 else 0

        # Calculate percentile (what percentage of days had lower volume)
        percentile = float(np.sum(lookback < current_volume) / len(lookback) * 100)

        # Volume ratio vs average
        volume_ratio = current_volume / avg_volume if avg_volume > 0 else 1

        # Determine spike level
        if z_score >= 3:
            spike_level = 'extreme'
            spike_color = '#ef4444'  # red
        elif z_score >= 2:
            spike_level = 'high'
            spike_color = '#f97316'  # orange
        elif z_score >= 1.5:
            spike_level = 'elevated'
            spike_color = '#eab308'  # yellow
        elif z_score >= 1:
            spike_level = 'above_average'
            spike_color = '#22c55e'  # green
        elif z_score <= -1.5:
            spike_level = 'very_low'
            spike_color = '#3b82f6'  # blue
        elif z_score <= -1:
            spike_level = 'below_average'
            spike_color = '#6366f1'  # indigo
        else:
            spike_level = 'normal'
            spike_color = '#94a3b8'  # slate

        # Get 24h volume from live ticker for more accurate current reading
        try:
            ticker_url = "https://api.kraken.com/0/public/Ticker?pair=XBTUSD"
            ticker_r = requests.get(ticker_url, timeout=10)
            if ticker_r.status_code == 200:
                ticker_data = ticker_r.json()
                if not ticker_data.get('error'):
                    ticker_result = ticker_data.get('result', {})
                    ticker = ticker_result.get('XXBTZUSD', {})
                    if ticker:
                        live_vol_btc = float(ticker.get('v', [0, 0])[1])  # 24h volume
                        current_price = float(ticker.get('c', [0])[0])
                        current_volume = live_vol_btc * current_price
                        # Recalculate Z-score with live data
                        z_score = (current_volume - avg_volume) / std_volume if std_volume > 0 else 0
                        volume_ratio = current_volume / avg_volume if avg_volume > 0 else 1
                        percentile = float(np.sum(lookback < current_volume) / len(lookback) * 100)

                        # Re-determine spike level
                        if z_score >= 3:
                            spike_level = 'extreme'
                            spike_color = '#ef4444'
                        elif z_score >= 2:
                            spike_level = 'high'
                            spike_color = '#f97316'
                        elif z_score >= 1.5:
                            spike_level = 'elevated'
                            spike_color = '#eab308'
                        elif z_score >= 1:
                            spike_level = 'above_average'
                            spike_color = '#22c55e'
                        elif z_score <= -1.5:
                            spike_level = 'very_low'
                            spike_color = '#3b82f6'
                        elif z_score <= -1:
                            spike_level = 'below_average'
                            spike_color = '#6366f1'
                        else:
                            spike_level = 'normal'
                            spike_color = '#94a3b8'
        except Exception as e:
            print(f"Live ticker fetch error: {e}")

        # Build historical volume trend (use lookback_days for chart) with price data
        volume_history = []
        history_start = max(-lookback_days, -len(volumes_arr) + 1)
        for i in range(history_start, 0):
            vol = float(volumes_arr[i])
            price = float(prices_arr[i])
            vol_z = float((vol - avg_volume) / std_volume) if std_volume > 0 else 0.0
            volume_history.append({
                'volume': vol,
                'price': price,
                'z_score': round(vol_z, 2),
                'is_spike': bool(vol_z >= 1.5)
            })

        # Add current day
        volume_history.append({
            'volume': float(current_volume),
            'price': float(current_price),
            'z_score': round(float(z_score), 2),
            'is_spike': bool(z_score >= 1.5)
        })

        # ============ REAL-TIME VOLUME INDICATORS ============

        # Calculate real-time signals using full 60-day data
        all_volumes_arr = np.array(all_volumes)
        all_prices_arr = np.array(all_prices)
        all_opens_arr = np.array(all_opens)
        all_highs_arr = np.array(all_highs)
        all_lows_arr = np.array(all_lows)
        all_closes_arr = np.array(all_closes)

        # 1. Volume Velocity (rate of change: today vs yesterday)
        if len(all_volumes_arr) >= 2:
            prev_volume = all_volumes_arr[-2]
            volume_velocity = ((current_volume - prev_volume) / prev_volume * 100) if prev_volume > 0 else 0
            velocity_direction = 'up' if volume_velocity > 0 else 'down'
            velocity_alert = abs(volume_velocity) >= 50  # Alert if >50% change
        else:
            volume_velocity = 0
            velocity_direction = 'flat'
            velocity_alert = False

        # 2. Volume-Price Divergence
        # Bullish divergence: Volume up, Price down (accumulation)
        # Bearish divergence: Volume down, Price up (distribution)
        if len(all_prices_arr) >= 2 and len(all_volumes_arr) >= 2:
            price_change = (all_closes_arr[-1] - all_closes_arr[-2]) / all_closes_arr[-2] * 100 if all_closes_arr[-2] > 0 else 0
            vol_change = (all_volumes_arr[-1] - all_volumes_arr[-2]) / all_volumes_arr[-2] * 100 if all_volumes_arr[-2] > 0 else 0

            if vol_change > 20 and price_change < -1:
                divergence_type = 'bullish'
                divergence_strength = 'strong' if vol_change > 50 else 'moderate'
            elif vol_change < -20 and price_change > 1:
                divergence_type = 'bearish'
                divergence_strength = 'strong' if vol_change < -50 else 'moderate'
            elif vol_change > 10 and price_change < 0:
                divergence_type = 'bullish'
                divergence_strength = 'weak'
            elif vol_change < -10 and price_change > 0:
                divergence_type = 'bearish'
                divergence_strength = 'weak'
            else:
                divergence_type = 'none'
                divergence_strength = 'none'
        else:
            divergence_type = 'none'
            divergence_strength = 'none'
            price_change = 0

        # 3. Buy/Sell Pressure (estimated from candle body vs range)
        # Large body with close near high = buying pressure
        # Large body with close near low = selling pressure
        if len(all_highs_arr) >= 1 and len(all_lows_arr) >= 1:
            today_range = all_highs_arr[-1] - all_lows_arr[-1]
            if today_range > 0:
                # Position of close in the day's range (0 = low, 1 = high)
                close_position = (all_closes_arr[-1] - all_lows_arr[-1]) / today_range
                buy_pressure_ratio = close_position
                if buy_pressure_ratio > 0.7:
                    pressure_label = 'Strong buying'
                elif buy_pressure_ratio > 0.5:
                    pressure_label = 'Slight buying'
                elif buy_pressure_ratio < 0.3:
                    pressure_label = 'Strong selling'
                elif buy_pressure_ratio < 0.5:
                    pressure_label = 'Slight selling'
                else:
                    pressure_label = 'Neutral'
            else:
                buy_pressure_ratio = 0.5
                pressure_label = 'Neutral'
        else:
            buy_pressure_ratio = 0.5
            pressure_label = 'Neutral'

        # 4. Volume Breakout (is current volume highest in X days?)
        if len(all_volumes_arr) >= lookback_days:
            lookback_max = float(np.max(all_volumes_arr[-lookback_days:-1])) if lookback_days > 1 else float(all_volumes_arr[-1])
            is_breakout = current_volume > lookback_max
            days_since_high = 0
            for i in range(1, min(lookback_days, len(all_volumes_arr))):
                if all_volumes_arr[-i - 1] >= current_volume:
                    break
                days_since_high = i
        else:
            is_breakout = False
            days_since_high = 0
            lookback_max = current_volume

        # 5. Volume Trend (is volume increasing or decreasing over lookback period?)
        if len(volumes_arr) >= 3:
            # Simple linear regression slope
            x = np.arange(len(volumes_arr))
            slope = np.polyfit(x, volumes_arr, 1)[0]
            volume_trend = 'increasing' if slope > avg_volume * 0.01 else ('decreasing' if slope < -avg_volume * 0.01 else 'stable')
            trend_strength = abs(slope) / avg_volume * 100 if avg_volume > 0 else 0
        else:
            volume_trend = 'insufficient_data'
            trend_strength = 0

        # Build realtime_signals object
        realtime_signals = {
            'volume_velocity': {
                'value': round(float(volume_velocity), 1),
                'direction': velocity_direction,
                'alert': bool(velocity_alert)
            },
            'price_volume_divergence': {
                'type': divergence_type,
                'strength': divergence_strength,
                'price_change': round(float(price_change), 2)
            },
            'buy_pressure': {
                'ratio': round(float(buy_pressure_ratio), 2),
                'label': pressure_label
            },
            'volume_breakout': {
                'is_breakout': bool(is_breakout),
                'days_since_high': int(days_since_high),
                'lookback_max': float(lookback_max)
            },
            'volume_trend': {
                'direction': volume_trend,
                'strength': round(float(trend_strength), 2)
            }
        }

        return jsonify({
            'spike': {
                'current_volume': float(current_volume),
                'avg_volume': float(avg_volume),
                'median_volume': float(median_volume),
                'std_volume': float(std_volume),
                'z_score': round(float(z_score), 2),
                'percentile': round(float(percentile), 1),
                'volume_ratio': round(float(volume_ratio), 2),
                'spike_level': spike_level,
                'spike_color': spike_color,
                'current_price': float(current_price),
                'is_spike': bool(z_score >= 1.5),
                'volume_history': volume_history
            },
            'realtime_signals': realtime_signals,
            'lookback_days': lookback_days,
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        print(f"Volume analysis error: {e}")
        return jsonify({'error': str(e), 'spike': None})


# ============ HEALTH CHECK ============

@app.route('/api/health')
def health():
    """API health check with key status."""
    return jsonify({
        'status': 'ok',
        'keys': {
            'FMP_API_KEY': bool(FMP_API_KEY),
            'FINNHUB_API_KEY': bool(FINNHUB_API_KEY),
            'POLYGON_API_KEY': bool(POLYGON_API_KEY),
            'ALPHA_VANTAGE_API_KEY': bool(ALPHA_VANTAGE_API_KEY),
            'NEWS_API_KEY': bool(NEWS_API_KEY),
            'GEMINI_API_KEY': bool(GEMINI_API_KEY),
            'XAI_API_KEY': bool(XAI_API_KEY),
            'ANTHROPIC_API_KEY': bool(ANTHROPIC_API_KEY),
        }
    })


if __name__ == '__main__':
    print("Starting TradePulse API Server...")
    print("API Keys loaded:")
    print(f"  FMP: {'OK' if FMP_API_KEY else 'MISSING'}")
    print(f"  Finnhub: {'OK' if FINNHUB_API_KEY else 'MISSING'}")
    print(f"  Polygon: {'OK' if POLYGON_API_KEY else 'MISSING'}")
    print(f"  Alpha Vantage: {'OK' if ALPHA_VANTAGE_API_KEY else 'MISSING'}")
    print(f"  News API: {'OK' if NEWS_API_KEY else 'MISSING'}")
    print(f"  Grok (xAI): {'OK' if XAI_API_KEY else 'MISSING'}")
    print(f"  Claude (Anthropic): {'OK' if ANTHROPIC_API_KEY else 'MISSING'}")
    print("\nEndpoints:")
    print("  GET /api/events                    - IPOs, earnings, economic events")
    print("  GET /api/sec-filings               - SEC filings")
    print("  GET /api/news                      - Market news")
    print("  GET /api/crypto                    - Cryptocurrency data")
    print("  GET /api/bitcoin-ai-analysis       - Gemini AI analysis")
    print("  GET /api/bitcoin-historical-patterns - Gemini historical patterns")
    print("  GET /api/bitcoin-social-sentiment  - Grok X sentiment")
    print("  GET /api/bitcoin-claude-analysis   - Claude deep analysis")
    print("  GET /api/bitcoin-volume-analysis   - BTC volume spike detection")
    print("  GET /api/health                    - Health check")
    print("\nServer running on http://localhost:5000")
    app.run(debug=True, port=5000, host='0.0.0.0')
