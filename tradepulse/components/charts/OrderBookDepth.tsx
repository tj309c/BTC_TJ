'use client';

import { useEffect, useState, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip } from 'recharts';
import { API_BASE_URL } from '@/lib/api';

interface DepthLevel {
  price: number;
  volume: number;
  cumulative: number;
}

interface OrderBookData {
  bids: DepthLevel[];
  asks: DepthLevel[];
  stats: {
    total_bid_volume: number;
    total_ask_volume: number;
    sentiment: number;
    mid_price: number;
    best_bid: number;
    best_ask: number;
    spread: number;
    spread_pct: number;
  };
  timestamp: number;
}

export function OrderBookDepth() {
  const [data, setData] = useState<OrderBookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    const fetchOrderBook = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/bitcoin-orderbook`);
        if (res.ok) {
          const result = await res.json();
          if (!result.error) {
            setData(result);
            lastUpdateRef.current = Date.now();
            setError(null);
          } else {
            setError(result.error);
          }
        }
      } catch (err) {
        console.error('Failed to fetch order book:', err);
        setError('Failed to connect to API');
      } finally {
        setLoading(false);
      }
    };

    fetchOrderBook();
    // Update every 5 seconds for real-time feel
    const interval = setInterval(fetchOrderBook, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  const formatVolume = (vol: number) => {
    if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
    return vol.toFixed(2);
  };

  // Build chart data - mirror bids and asks around mid price
  const buildChartData = () => {
    if (!data) return [];

    const chartData: { price: number; bidVolume: number; askVolume: number }[] = [];

    // Add bids (descending price, so reverse for chart)
    const reversedBids = [...data.bids].reverse();
    reversedBids.forEach((bid) => {
      chartData.push({
        price: bid.price,
        bidVolume: bid.cumulative,
        askVolume: 0,
      });
    });

    // Add asks
    data.asks.forEach((ask) => {
      chartData.push({
        price: ask.price,
        bidVolume: 0,
        askVolume: ask.cumulative,
      });
    });

    return chartData;
  };

  const chartData = buildChartData();

  // Calculate sentiment bar width
  const sentimentWidth = data ? Math.min(100, Math.abs(data.stats.sentiment)) : 50;
  const isBullish = data ? data.stats.sentiment > 0 : false;

  return (
    <div className="w-full bg-slate-900/50 rounded-xl border border-slate-800 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Order Book Depth</h3>
          <p className="text-xs text-slate-500">Real-time bid/ask volume • Updates every 5s</p>
        </div>
        {data && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-slate-400">Spread</p>
              <p className="text-sm font-mono text-white">
                {formatPrice(data.stats.spread)} ({data.stats.spread_pct.toFixed(4)}%)
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Mid Price</p>
              <p className="text-sm font-mono text-white">{formatPrice(data.stats.mid_price)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Sentiment Bar */}
      {data && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-emerald-400 font-medium">
              Bids: {formatVolume(data.stats.total_bid_volume)} BTC
            </span>
            <span className={`text-xs font-bold ${isBullish ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isBullish ? '↑' : '↓'} {Math.abs(data.stats.sentiment).toFixed(1)}% {isBullish ? 'Bullish' : 'Bearish'}
            </span>
            <span className="text-xs text-rose-400 font-medium">
              Asks: {formatVolume(data.stats.total_ask_volume)} BTC
            </span>
          </div>
          <div className="h-3 bg-slate-800 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
              style={{
                width: `${(data.stats.total_bid_volume / (data.stats.total_bid_volume + data.stats.total_ask_volume)) * 100}%`,
              }}
            />
            <div
              className="h-full bg-gradient-to-r from-rose-400 to-rose-600 transition-all duration-500"
              style={{
                width: `${(data.stats.total_ask_volume / (data.stats.total_bid_volume + data.stats.total_ask_volume)) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Depth Chart */}
      <div className="h-[200px] relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 rounded-xl z-10">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-slate-400 text-sm">Loading order book...</span>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-rose-400 text-sm">{error}</p>
          </div>
        )}
        {chartData.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="bidGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="askGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="price"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(v) => `$${(v / 1000).toFixed(1)}K`}
                stroke="#64748b"
                fontSize={10}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => formatVolume(v)}
                stroke="#64748b"
                fontSize={10}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15, 23, 42, 0.95)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelFormatter={(v) => `Price: ${formatPrice(v as number)}`}
                formatter={(value: number, name: string) => [
                  `${formatVolume(value)} BTC`,
                  name === 'bidVolume' ? 'Cumulative Bids' : 'Cumulative Asks',
                ]}
              />
              {data && (
                <ReferenceLine
                  x={data.stats.mid_price}
                  stroke="#6366f1"
                  strokeDasharray="3 3"
                  label={{
                    value: 'Mid',
                    position: 'top',
                    fill: '#6366f1',
                    fontSize: 10,
                  }}
                />
              )}
              <Area
                type="stepAfter"
                dataKey="bidVolume"
                stroke="#10b981"
                fill="url(#bidGradient)"
                strokeWidth={2}
              />
              <Area
                type="stepAfter"
                dataKey="askVolume"
                stroke="#ef4444"
                fill="url(#askGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Stats Row */}
      {data && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-[10px] text-slate-500 uppercase">Best Bid</p>
              <p className="text-sm font-mono text-emerald-400">{formatPrice(data.stats.best_bid)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase">Best Ask</p>
              <p className="text-sm font-mono text-rose-400">{formatPrice(data.stats.best_ask)}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-slate-500">
              Updated {new Date(data.timestamp * 1000).toLocaleTimeString()}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
