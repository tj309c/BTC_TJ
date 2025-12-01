'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, Time, LineData } from 'lightweight-charts';
import { Settings2, X, ChevronDown, TrendingUp, Activity, BarChart3 } from 'lucide-react';

interface OHLCData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface ChartDataResponse {
  ohlc: OHLCData[];
  indicators: {
    sma_20: (number | null)[];
    sma_50: (number | null)[];
    sma_200: (number | null)[];
    ema_12: (number | null)[];
    ema_26: (number | null)[];
    rsi: (number | null)[];
    macd: (number | null)[];
    macd_signal: (number | null)[];
    macd_histogram: (number | null)[];
    bb_upper: (number | null)[];
    bb_middle: (number | null)[];
    bb_lower: (number | null)[];
    vwap: (number | null)[];
    obv: (number | null)[];
    mfi: (number | null)[];
  };
  levels: {
    pivot_points: {
      pivot: number;
      r1: number;
      r2: number;
      r3: number;
      s1: number;
      s2: number;
      s3: number;
    };
    fibonacci: Record<string, number>;
  };
  meta: {
    symbol: string;
    timeframe: string;
    candles: number;
    last_update: number;
  };
}

interface PriceData {
  price: number;
  change_24h: number;
  volume_24h: number;
  market_cap: number;
}

type IndicatorType = 'sma' | 'ema' | 'bb' | 'rsi' | 'macd' | 'vwap' | 'volume' | 'obv' | 'mfi';

interface IndicatorConfig {
  label: string;
  color: string;
  description: string;
}

const INDICATOR_CONFIG: Record<IndicatorType, IndicatorConfig> = {
  sma: { label: 'SMA', color: '#3b82f6', description: 'Simple Moving Avg (20/50)' },
  ema: { label: 'EMA', color: '#8b5cf6', description: 'Exponential Moving Avg (12/26)' },
  bb: { label: 'BB', color: '#f59e0b', description: 'Bollinger Bands (20,2)' },
  rsi: { label: 'RSI', color: '#ec4899', description: 'Relative Strength Index' },
  macd: { label: 'MACD', color: '#10b981', description: 'MACD (12,26,9)' },
  vwap: { label: 'VWAP', color: '#06b6d4', description: 'Vol Weighted Avg Price' },
  volume: { label: 'VOL', color: '#6366f1', description: 'Volume Bars' },
  obv: { label: 'OBV', color: '#f97316', description: 'On-Balance Volume' },
  mfi: { label: 'MFI', color: '#84cc16', description: 'Money Flow Index' },
};

// Indicator categories for professional grouped layout
const INDICATOR_CATEGORIES = {
  overlays: {
    label: 'Overlays',
    description: 'Price overlays on main chart',
    icon: TrendingUp,
    indicators: ['sma', 'ema', 'bb', 'vwap'] as IndicatorType[],
  },
  oscillators: {
    label: 'Oscillators',
    description: 'Momentum indicators',
    icon: Activity,
    indicators: ['rsi', 'macd'] as IndicatorType[],
  },
  volume: {
    label: 'Volume',
    description: 'Volume-based indicators',
    icon: BarChart3,
    indicators: ['obv', 'mfi'] as IndicatorType[],
  },
};

export function BitcoinTradingViewChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndicators, setActiveIndicators] = useState<Set<IndicatorType>>(new Set(['sma', 'bb', 'volume']));
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>('overlays');
  const panelRef = useRef<HTMLDivElement>(null);
  const indicatorSeriesRef = useRef<Map<string, ISeriesApi<'Line' | 'Histogram'>>>(new Map());
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsPanelOpen(false);
      }
    };
    if (isPanelOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isPanelOpen]);

  // OPTIMIZATION: Cache chart data to avoid re-fetching on indicator toggle
  const chartDataRef = useRef<ChartDataResponse | null>(null);
  const chartInitializedRef = useRef(false);

  // Smart refresh: track user activity
  const lastActivityRef = useRef<number>(Date.now());
  const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
  const ACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutes of inactivity = pause refresh

  // Memoized toggle function to prevent re-renders
  const toggleIndicator = useCallback((indicator: IndicatorType) => {
    setActiveIndicators(prev => {
      const newSet = new Set(prev);
      if (newSet.has(indicator)) {
        newSet.delete(indicator);
      } else {
        newSet.add(indicator);
      }
      return newSet;
    });
  }, []);

  // Fetch current price
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/bitcoin-price');
        if (res.ok) {
          const data = await res.json();
          setPriceData(data);
        }
      } catch (err) {
        console.error('Failed to fetch Bitcoin price:', err);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Track user activity for smart refresh
  useEffect(() => {
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };

    // Track mouse and keyboard activity
    window.addEventListener('mousemove', updateActivity);
    window.addEventListener('keydown', updateActivity);
    window.addEventListener('click', updateActivity);
    window.addEventListener('scroll', updateActivity);

    return () => {
      window.removeEventListener('mousemove', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('click', updateActivity);
      window.removeEventListener('scroll', updateActivity);
    };
  }, []);

  // Smart 5-minute refresh: only if user is active, smart diff for new candles
  useEffect(() => {
    if (!chartInitializedRef.current) return;

    const smartRefresh = async () => {
      // Check if user has been active recently
      const timeSinceActivity = Date.now() - lastActivityRef.current;
      if (timeSinceActivity > ACTIVITY_TIMEOUT) {
        console.log('Chart refresh paused - user inactive');
        return;
      }

      // Don't refresh if chart or series not ready
      if (!chartRef.current || !seriesRef.current || !volumeSeriesRef.current) return;

      try {
        const res = await fetch('http://localhost:5000/api/bitcoin-chart-data');
        if (!res.ok) return;

        const newData: ChartDataResponse = await res.json();
        if (!newData.ohlc || newData.ohlc.length === 0) return;

        const oldData = chartDataRef.current;

        // Smart diff: find new candles only
        if (oldData && oldData.ohlc.length > 0) {
          const lastOldTime = oldData.ohlc[oldData.ohlc.length - 1].time;
          const newCandles = newData.ohlc.filter(c => c.time > lastOldTime);

          if (newCandles.length > 0) {
            console.log(`Smart refresh: Adding ${newCandles.length} new candle(s)`);

            // Update only new candles (preserves scroll position)
            newCandles.forEach(candle => {
              seriesRef.current?.update({
                time: candle.time as Time,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close,
              });

              volumeSeriesRef.current?.update({
                time: candle.time as Time,
                value: candle.volume || 0,
                color: candle.close >= candle.open ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)',
              });
            });

            // Update cache and re-apply indicators
            chartDataRef.current = newData;
            addIndicatorSeries(chartRef.current, newData, activeIndicators);
          } else {
            // Update the last candle (might have changed today's data)
            const latestCandle = newData.ohlc[newData.ohlc.length - 1];
            seriesRef.current?.update({
              time: latestCandle.time as Time,
              open: latestCandle.open,
              high: latestCandle.high,
              low: latestCandle.low,
              close: latestCandle.close,
            });
            chartDataRef.current = newData;
          }
        }
      } catch (err) {
        console.error('Smart refresh failed:', err);
      }
    };

    const refreshInterval = setInterval(smartRefresh, REFRESH_INTERVAL);
    return () => clearInterval(refreshInterval);
  }, [activeIndicators]);

  // OPTIMIZATION: Create chart ONCE and fetch data ONCE (separate from indicator toggles)
  useEffect(() => {
    if (!chartContainerRef.current || chartInitializedRef.current) return;

    const initChart = setTimeout(() => {
      if (!chartContainerRef.current) return;

      const containerWidth = chartContainerRef.current.clientWidth;

      // Create chart
      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#94a3b8',
        },
        grid: {
          vertLines: { color: 'rgba(51, 65, 85, 0.5)' },
          horzLines: { color: 'rgba(51, 65, 85, 0.5)' },
        },
        width: containerWidth > 0 ? containerWidth : 800,
        height: 500,
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: '#6366f1', width: 1, style: 2 },
          horzLine: { color: '#6366f1', width: 1, style: 2 },
        },
        rightPriceScale: { borderColor: 'rgba(51, 65, 85, 0.5)' },
        timeScale: { borderColor: 'rgba(51, 65, 85, 0.5)', timeVisible: true, secondsVisible: false },
      });

      chartRef.current = chart;
      chartInitializedRef.current = true;

      // Add candlestick series
      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#ef4444',
        borderUpColor: '#10b981',
        borderDownColor: '#ef4444',
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
      });
      seriesRef.current = candlestickSeries;

      // Add volume histogram series (always visible at bottom)
      const volumeSeries = chart.addHistogramSeries({
        color: '#6366f1',
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      });
      volumeSeriesRef.current = volumeSeries;

      // Fetch chart data ONCE
      const fetchChartData = async () => {
        try {
          setLoading(true);
          const res = await fetch('http://localhost:5000/api/bitcoin-chart-data');
          if (res.ok) {
            const data: ChartDataResponse = await res.json();
            // Cache data for indicator toggles
            chartDataRef.current = data;

            if (data.ohlc && data.ohlc.length > 0) {
              // Set candlestick data
              const formattedData: CandlestickData<Time>[] = data.ohlc.map((item) => ({
                time: item.time as Time,
                open: item.open,
                high: item.high,
                low: item.low,
                close: item.close,
              }));
              candlestickSeries.setData(formattedData);

              // Set volume data (always shown)
              const volumeData = data.ohlc.map((item) => ({
                time: item.time as Time,
                value: item.volume || 0,
                color: item.close >= item.open ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)',
              }));
              volumeSeries.setData(volumeData);

              // Add initial indicators
              addIndicatorSeries(chart, data, activeIndicators);
              chart.timeScale().fitContent();
            }
          } else {
            setError('Failed to fetch chart data');
          }
        } catch (err) {
          console.error('Failed to fetch chart data:', err);
          setError('Failed to connect to API');
        } finally {
          setLoading(false);
        }
      };

      fetchChartData();
    }, 100);

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        const newWidth = chartContainerRef.current.clientWidth;
        if (newWidth > 0) {
          chartRef.current.applyOptions({ width: newWidth });
        }
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(initChart);
      window.removeEventListener('resize', handleResize);
      indicatorSeriesRef.current.clear();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        chartInitializedRef.current = false;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // OPTIMIZATION: Update indicators WITHOUT re-fetching data or recreating chart
  useEffect(() => {
    if (!chartRef.current || !chartDataRef.current) return;

    // Update indicators using cached data - instant response!
    addIndicatorSeries(chartRef.current, chartDataRef.current, activeIndicators);
  }, [activeIndicators]);

  // Helper function to add indicator series
  const addIndicatorSeries = (chart: IChartApi, data: ChartDataResponse, indicators: Set<IndicatorType>) => {
    const times = data.ohlc.map(item => item.time as Time);

    // Clear existing indicator series
    indicatorSeriesRef.current.forEach((series) => {
      try {
        chart.removeSeries(series);
      } catch {
        // Series may already be removed
      }
    });
    indicatorSeriesRef.current.clear();

    // SMA indicators
    if (indicators.has('sma')) {
      // SMA 20
      const sma20Series = chart.addLineSeries({
        color: '#3b82f6',
        lineWidth: 1,
        title: 'SMA20',
      });
      const sma20Data: LineData<Time>[] = data.indicators.sma_20
        .map((val, i) => val !== null ? { time: times[i], value: val } : null)
        .filter((item): item is LineData<Time> => item !== null);
      sma20Series.setData(sma20Data);
      indicatorSeriesRef.current.set('sma20', sma20Series);

      // SMA 50
      const sma50Series = chart.addLineSeries({
        color: '#60a5fa',
        lineWidth: 1,
        title: 'SMA50',
      });
      const sma50Data: LineData<Time>[] = data.indicators.sma_50
        .map((val, i) => val !== null ? { time: times[i], value: val } : null)
        .filter((item): item is LineData<Time> => item !== null);
      sma50Series.setData(sma50Data);
      indicatorSeriesRef.current.set('sma50', sma50Series);
    }

    // EMA indicators
    if (indicators.has('ema')) {
      // EMA 12
      const ema12Series = chart.addLineSeries({
        color: '#8b5cf6',
        lineWidth: 1,
        title: 'EMA12',
      });
      const ema12Data: LineData<Time>[] = data.indicators.ema_12
        .map((val, i) => val !== null ? { time: times[i], value: val } : null)
        .filter((item): item is LineData<Time> => item !== null);
      ema12Series.setData(ema12Data);
      indicatorSeriesRef.current.set('ema12', ema12Series);

      // EMA 26
      const ema26Series = chart.addLineSeries({
        color: '#a78bfa',
        lineWidth: 1,
        title: 'EMA26',
      });
      const ema26Data: LineData<Time>[] = data.indicators.ema_26
        .map((val, i) => val !== null ? { time: times[i], value: val } : null)
        .filter((item): item is LineData<Time> => item !== null);
      ema26Series.setData(ema26Data);
      indicatorSeriesRef.current.set('ema26', ema26Series);
    }

    // Bollinger Bands
    if (indicators.has('bb')) {
      // Upper band
      const bbUpperSeries = chart.addLineSeries({
        color: 'rgba(245, 158, 11, 0.6)',
        lineWidth: 1,
        title: 'BB Upper',
      });
      const bbUpperData: LineData<Time>[] = data.indicators.bb_upper
        .map((val, i) => val !== null ? { time: times[i], value: val } : null)
        .filter((item): item is LineData<Time> => item !== null);
      bbUpperSeries.setData(bbUpperData);
      indicatorSeriesRef.current.set('bbUpper', bbUpperSeries);

      // Middle band (SMA 20)
      const bbMiddleSeries = chart.addLineSeries({
        color: 'rgba(245, 158, 11, 0.8)',
        lineWidth: 1,
        lineStyle: 2,
        title: 'BB Mid',
      });
      const bbMiddleData: LineData<Time>[] = data.indicators.bb_middle
        .map((val, i) => val !== null ? { time: times[i], value: val } : null)
        .filter((item): item is LineData<Time> => item !== null);
      bbMiddleSeries.setData(bbMiddleData);
      indicatorSeriesRef.current.set('bbMiddle', bbMiddleSeries);

      // Lower band
      const bbLowerSeries = chart.addLineSeries({
        color: 'rgba(245, 158, 11, 0.6)',
        lineWidth: 1,
        title: 'BB Lower',
      });
      const bbLowerData: LineData<Time>[] = data.indicators.bb_lower
        .map((val, i) => val !== null ? { time: times[i], value: val } : null)
        .filter((item): item is LineData<Time> => item !== null);
      bbLowerSeries.setData(bbLowerData);
      indicatorSeriesRef.current.set('bbLower', bbLowerSeries);
    }

    // VWAP
    if (indicators.has('vwap')) {
      const vwapSeries = chart.addLineSeries({
        color: '#06b6d4',
        lineWidth: 2,
        title: 'VWAP',
      });
      const vwapData: LineData<Time>[] = data.indicators.vwap
        .map((val, i) => val !== null ? { time: times[i], value: val } : null)
        .filter((item): item is LineData<Time> => item !== null);
      vwapSeries.setData(vwapData);
      indicatorSeriesRef.current.set('vwap', vwapSeries);
    }

    // MACD (displayed in separate pane at bottom)
    if (indicators.has('macd')) {
      // MACD Line
      const macdLineSeries = chart.addLineSeries({
        color: '#10b981',
        lineWidth: 1,
        title: 'MACD',
        priceScaleId: 'macd',
      });
      chart.priceScale('macd').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
      const macdLineData: LineData<Time>[] = data.indicators.macd
        .map((val, i) => val !== null ? { time: times[i], value: val } : null)
        .filter((item): item is LineData<Time> => item !== null);
      macdLineSeries.setData(macdLineData);
      indicatorSeriesRef.current.set('macdLine', macdLineSeries);

      // Signal Line
      const signalSeries = chart.addLineSeries({
        color: '#ef4444',
        lineWidth: 1,
        title: 'Signal',
        priceScaleId: 'macd',
      });
      const signalData: LineData<Time>[] = data.indicators.macd_signal
        .map((val, i) => val !== null ? { time: times[i], value: val } : null)
        .filter((item): item is LineData<Time> => item !== null);
      signalSeries.setData(signalData);
      indicatorSeriesRef.current.set('macdSignal', signalSeries);

      // Histogram
      const histogramSeries = chart.addHistogramSeries({
        color: '#6366f1',
        priceScaleId: 'macd',
      });
      const histogramData = data.indicators.macd_histogram
        .map((val, i) => {
          if (val === null) return null;
          return {
            time: times[i],
            value: val,
            color: val >= 0 ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)',
          };
        })
        .filter((item): item is { time: Time; value: number; color: string } => item !== null);
      histogramSeries.setData(histogramData);
      indicatorSeriesRef.current.set('macdHistogram', histogramSeries);
    }

    // RSI (displayed in separate pane)
    if (indicators.has('rsi')) {
      const rsiSeries = chart.addLineSeries({
        color: '#ec4899',
        lineWidth: 1,
        title: 'RSI',
        priceScaleId: 'rsi',
      });
      chart.priceScale('rsi').applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      });
      const rsiData: LineData<Time>[] = data.indicators.rsi
        .map((val, i) => val !== null ? { time: times[i], value: val } : null)
        .filter((item): item is LineData<Time> => item !== null);
      rsiSeries.setData(rsiData);
      indicatorSeriesRef.current.set('rsi', rsiSeries);
    }

    // OBV (On-Balance Volume)
    if (indicators.has('obv')) {
      const obvSeries = chart.addLineSeries({
        color: '#f97316',
        lineWidth: 1,
        title: 'OBV',
        priceScaleId: 'obv',
      });
      chart.priceScale('obv').applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      });
      const obvData: LineData<Time>[] = data.indicators.obv
        .map((val, i) => val !== null ? { time: times[i], value: val } : null)
        .filter((item): item is LineData<Time> => item !== null);
      obvSeries.setData(obvData);
      indicatorSeriesRef.current.set('obv', obvSeries);
    }

    // MFI (Money Flow Index)
    if (indicators.has('mfi')) {
      const mfiSeries = chart.addLineSeries({
        color: '#84cc16',
        lineWidth: 1,
        title: 'MFI',
        priceScaleId: 'mfi',
      });
      chart.priceScale('mfi').applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      });
      const mfiData: LineData<Time>[] = data.indicators.mfi
        .map((val, i) => val !== null ? { time: times[i], value: val } : null)
        .filter((item): item is LineData<Time> => item !== null);
      mfiSeries.setData(mfiData);
      indicatorSeriesRef.current.set('mfi', mfiSeries);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  };

  const formatVolume = (volume: number) => {
    if (volume >= 1e12) return `$${(volume / 1e12).toFixed(2)}T`;
    if (volume >= 1e9) return `$${(volume / 1e9).toFixed(2)}B`;
    if (volume >= 1e6) return `$${(volume / 1e6).toFixed(2)}M`;
    return `$${volume.toFixed(2)}`;
  };

  return (
    <div className="w-full">
      {/* Price Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-lg sm:text-xl">₿</span>
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">Bitcoin</h2>
            <span className="text-slate-400 text-sm">BTC/USD</span>
          </div>
        </div>

        {priceData && (
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <div>
              <p className="text-2xl sm:text-3xl font-bold text-white">
                {formatPrice(priceData.price)}
              </p>
              <p className={`text-sm font-medium ${priceData.change_24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {priceData.change_24h >= 0 ? '+' : ''}{priceData.change_24h.toFixed(2)}% (24h)
              </p>
            </div>
            <div className="hidden sm:block h-12 w-px bg-slate-700" />
            <div className="hidden sm:block">
              <p className="text-slate-400 text-xs uppercase tracking-wide">24h Volume</p>
              <p className="text-white font-semibold">{formatVolume(priceData.volume_24h)}</p>
            </div>
            <div className="hidden md:block h-12 w-px bg-slate-700" />
            <div className="hidden md:block">
              <p className="text-slate-400 text-xs uppercase tracking-wide">Market Cap</p>
              <p className="text-white font-semibold">{formatVolume(priceData.market_cap)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Professional Indicator Panel */}
      <div className="flex items-center justify-between mb-3">
        {/* Active indicators summary */}
        <div className="flex flex-wrap items-center gap-1.5">
          {Array.from(activeIndicators)
            .filter(key => key !== 'volume')
            .map(key => (
              <span
                key={key}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-slate-800 text-slate-300 border border-slate-700"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: INDICATOR_CONFIG[key].color }}
                />
                {INDICATOR_CONFIG[key].label}
                <button
                  type="button"
                  onClick={() => toggleIndicator(key)}
                  className="ml-0.5 text-slate-500 hover:text-slate-300"
                  title={`Remove ${INDICATOR_CONFIG[key].label}`}
                  aria-label={`Remove ${INDICATOR_CONFIG[key].label} indicator`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          {activeIndicators.size <= 1 && (
            <span className="text-xs text-slate-500">No indicators selected</span>
          )}
        </div>

        {/* Indicator Settings Button */}
        <div className="relative" ref={panelRef}>
          <button
            type="button"
            onClick={() => setIsPanelOpen(!isPanelOpen)}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
              isPanelOpen
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
            }`}
          >
            <Settings2 className="w-4 h-4" />
            <span className="hidden sm:inline">Indicators</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${isPanelOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Panel - Desktop */}
          {isPanelOpen && (
            <div className="hidden sm:block absolute right-0 top-full mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="p-3 border-b border-slate-800">
                <h3 className="text-sm font-semibold text-white">Technical Indicators</h3>
                <p className="text-xs text-slate-500 mt-0.5">Select indicators to display on chart</p>
              </div>

              {Object.entries(INDICATOR_CATEGORIES).map(([categoryKey, category]) => {
                const CategoryIcon = category.icon;
                const activeCount = category.indicators.filter(i => activeIndicators.has(i)).length;
                return (
                  <div key={categoryKey} className="border-b border-slate-800 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setExpandedCategory(expandedCategory === categoryKey ? null : categoryKey)}
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <CategoryIcon className="w-4 h-4 text-slate-400" />
                        <span className="text-sm font-medium text-slate-200">{category.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {activeCount > 0 && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-indigo-600 text-white rounded">
                            {activeCount}
                          </span>
                        )}
                        <ChevronDown
                          className={`w-4 h-4 text-slate-500 transition-transform ${
                            expandedCategory === categoryKey ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    </button>

                    {expandedCategory === categoryKey && (
                      <div className="px-3 pb-2 space-y-1">
                        {category.indicators.map(indicatorKey => {
                          const config = INDICATOR_CONFIG[indicatorKey];
                          const isActive = activeIndicators.has(indicatorKey);
                          return (
                            <button
                              type="button"
                              key={indicatorKey}
                              onClick={() => toggleIndicator(indicatorKey)}
                              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-all ${
                                isActive
                                  ? 'bg-slate-700/70 border border-slate-600'
                                  : 'hover:bg-slate-800 border border-transparent'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-full"
                                  style={{ backgroundColor: config.color }}
                                />
                                <div className="text-left">
                                  <p className="text-sm font-medium text-slate-200">{config.label}</p>
                                  <p className="text-[10px] text-slate-500">{config.description}</p>
                                </div>
                              </div>
                              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                                isActive
                                  ? 'border-indigo-500 bg-indigo-500'
                                  : 'border-slate-600'
                              }`}>
                                {isActive && (
                                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom Sheet - Mobile */}
          {isPanelOpen && (
            <div className="sm:hidden fixed inset-0 z-50">
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsPanelOpen(false)}
              />

              {/* Sheet */}
              <div className="absolute bottom-0 left-0 right-0 bg-slate-900 rounded-t-2xl max-h-[70vh] overflow-hidden animate-slide-up">
                {/* Handle */}
                <div className="flex justify-center py-2">
                  <div className="w-10 h-1 bg-slate-700 rounded-full" />
                </div>

                <div className="px-4 pb-2">
                  <h3 className="text-base font-semibold text-white">Technical Indicators</h3>
                  <p className="text-xs text-slate-500">Select indicators to display</p>
                </div>

                <div className="overflow-y-auto max-h-[calc(70vh-80px)] pb-8">
                  {Object.entries(INDICATOR_CATEGORIES).map(([categoryKey, category]) => {
                    const CategoryIcon = category.icon;
                    return (
                      <div key={categoryKey} className="px-4 py-3 border-t border-slate-800">
                        <div className="flex items-center gap-2 mb-2">
                          <CategoryIcon className="w-4 h-4 text-slate-400" />
                          <span className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
                            {category.label}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {category.indicators.map(indicatorKey => {
                            const config = INDICATOR_CONFIG[indicatorKey];
                            const isActive = activeIndicators.has(indicatorKey);
                            return (
                              <button
                                type="button"
                                key={indicatorKey}
                                onClick={() => toggleIndicator(indicatorKey)}
                                className={`flex items-center gap-2 p-3 rounded-xl transition-all ${
                                  isActive
                                    ? 'bg-indigo-600/20 border-2 border-indigo-500'
                                    : 'bg-slate-800/50 border-2 border-transparent'
                                }`}
                              >
                                <span
                                  className="w-3 h-3 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: config.color }}
                                />
                                <div className="text-left min-w-0">
                                  <p className="text-sm font-medium text-white truncate">{config.label}</p>
                                  <p className="text-[10px] text-slate-400 truncate">{config.description}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chart Container */}
      <div className="relative bg-slate-900/50 rounded-xl border border-slate-800 p-2 sm:p-4">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 rounded-xl z-10">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-slate-400">Loading chart data...</span>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 rounded-xl z-10">
            <div className="text-center">
              <p className="text-red-400 mb-2">{error}</p>
              <p className="text-slate-500 text-sm">Make sure the API server is running</p>
            </div>
          </div>
        )}
        <div ref={chartContainerRef} className="w-full min-h-[500px]" />
      </div>

      {/* Chart Footer */}
      <div className="flex items-center justify-between mt-3 px-1">
        <p className="text-xs text-slate-500">Data from Polygon.io • 365 days • Volume always shown</p>
        <p className="text-xs text-slate-500">TradingView Lightweight Charts</p>
      </div>
    </div>
  );
}
