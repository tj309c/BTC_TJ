'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Highcharts from 'highcharts/highstock';
import HighchartsReact from 'highcharts-react-official';
import { Settings2, X, ChevronDown, TrendingUp, Activity, BarChart3, Target, Layers } from 'lucide-react';

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
    atr?: (number | null)[];
    stoch_k?: (number | null)[];
    stoch_d?: (number | null)[];
    cci?: (number | null)[];
    williams_r?: (number | null)[];
    adx?: (number | null)[];
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

type IndicatorType = 'sma' | 'ema' | 'bb' | 'vwap' | 'rsi' | 'macd' | 'obv' | 'mfi' | 'pivots' | 'fibonacci' | 'atr' | 'stochastic' | 'cci' | 'williamsR' | 'ichimoku';

interface IndicatorConfig {
  label: string;
  color: string;
  description: string;
}

const INDICATOR_CONFIG: Record<IndicatorType, IndicatorConfig> = {
  // Overlays
  sma: { label: 'SMA', color: '#3b82f6', description: 'Simple Moving Avg (20/50/200)' },
  ema: { label: 'EMA', color: '#8b5cf6', description: 'Exponential Moving Avg (12/26)' },
  bb: { label: 'BB', color: '#f59e0b', description: 'Bollinger Bands (20,2)' },
  vwap: { label: 'VWAP', color: '#06b6d4', description: 'Vol Weighted Avg Price' },
  ichimoku: { label: 'Ichimoku', color: '#ec4899', description: 'Ichimoku Cloud (9,26,52)' },
  // Oscillators
  rsi: { label: 'RSI', color: '#ec4899', description: 'Relative Strength Index (14)' },
  macd: { label: 'MACD', color: '#10b981', description: 'MACD (12,26,9)' },
  stochastic: { label: 'Stoch', color: '#f97316', description: 'Stochastic Oscillator (14,3,3)' },
  cci: { label: 'CCI', color: '#14b8a6', description: 'Commodity Channel Index (20)' },
  williamsR: { label: '%R', color: '#a855f7', description: 'Williams %R (14)' },
  atr: { label: 'ATR', color: '#ef4444', description: 'Average True Range (14)' },
  // Volume
  obv: { label: 'OBV', color: '#f97316', description: 'On-Balance Volume' },
  mfi: { label: 'MFI', color: '#84cc16', description: 'Money Flow Index (14)' },
  // Levels
  pivots: { label: 'Pivots', color: '#06b6d4', description: 'Pivot Points (P, R1-R3, S1-S3)' },
  fibonacci: { label: 'Fib', color: '#eab308', description: 'Fibonacci Retracements' },
};

// Indicator categories for professional grouped layout
const INDICATOR_CATEGORIES = {
  overlays: {
    label: 'Overlays',
    description: 'Price overlays on main chart',
    icon: TrendingUp,
    indicators: ['sma', 'ema', 'bb', 'vwap', 'ichimoku'] as IndicatorType[],
  },
  oscillators: {
    label: 'Oscillators',
    description: 'Momentum indicators',
    icon: Activity,
    indicators: ['rsi', 'macd', 'stochastic', 'cci', 'williamsR', 'atr'] as IndicatorType[],
  },
  volume: {
    label: 'Volume',
    description: 'Volume-based indicators',
    icon: BarChart3,
    indicators: ['obv', 'mfi'] as IndicatorType[],
  },
  levels: {
    label: 'Levels',
    description: 'Support/Resistance levels',
    icon: Target,
    indicators: ['pivots', 'fibonacci'] as IndicatorType[],
  },
};

// Helper to calculate indicators client-side for Highcharts-exclusive ones
function calculateATR(ohlc: OHLCData[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = [];
  const trueRanges: number[] = [];

  for (let i = 0; i < ohlc.length; i++) {
    if (i === 0) {
      result.push(null);
      trueRanges.push(ohlc[i].high - ohlc[i].low);
    } else {
      const high = ohlc[i].high;
      const low = ohlc[i].low;
      const prevClose = ohlc[i - 1].close;
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      trueRanges.push(tr);

      if (i >= period) {
        const atr = trueRanges.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
        result.push(atr);
      } else {
        result.push(null);
      }
    }
  }
  return result;
}

function calculateStochastic(ohlc: OHLCData[], kPeriod: number = 14, dPeriod: number = 3): { k: (number | null)[], d: (number | null)[] } {
  const kValues: (number | null)[] = [];
  const dValues: (number | null)[] = [];

  for (let i = 0; i < ohlc.length; i++) {
    if (i < kPeriod - 1) {
      kValues.push(null);
    } else {
      const slice = ohlc.slice(i - kPeriod + 1, i + 1);
      const highestHigh = Math.max(...slice.map(d => d.high));
      const lowestLow = Math.min(...slice.map(d => d.low));
      const k = highestHigh !== lowestLow ? ((ohlc[i].close - lowestLow) / (highestHigh - lowestLow)) * 100 : 50;
      kValues.push(k);
    }
  }

  // Calculate %D (SMA of %K)
  for (let i = 0; i < kValues.length; i++) {
    if (i < kPeriod + dPeriod - 2 || kValues[i] === null) {
      dValues.push(null);
    } else {
      const slice = kValues.slice(i - dPeriod + 1, i + 1).filter((v): v is number => v !== null);
      if (slice.length === dPeriod) {
        dValues.push(slice.reduce((a, b) => a + b, 0) / dPeriod);
      } else {
        dValues.push(null);
      }
    }
  }

  return { k: kValues, d: dValues };
}

function calculateCCI(ohlc: OHLCData[], period: number = 20): (number | null)[] {
  const result: (number | null)[] = [];
  const typicalPrices: number[] = ohlc.map(d => (d.high + d.low + d.close) / 3);

  for (let i = 0; i < ohlc.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const slice = typicalPrices.slice(i - period + 1, i + 1);
      const sma = slice.reduce((a, b) => a + b, 0) / period;
      const meanDev = slice.reduce((a, b) => a + Math.abs(b - sma), 0) / period;
      const cci = meanDev !== 0 ? (typicalPrices[i] - sma) / (0.015 * meanDev) : 0;
      result.push(cci);
    }
  }
  return result;
}

function calculateWilliamsR(ohlc: OHLCData[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = [];

  for (let i = 0; i < ohlc.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const slice = ohlc.slice(i - period + 1, i + 1);
      const highestHigh = Math.max(...slice.map(d => d.high));
      const lowestLow = Math.min(...slice.map(d => d.low));
      const wr = highestHigh !== lowestLow ? ((highestHigh - ohlc[i].close) / (highestHigh - lowestLow)) * -100 : -50;
      result.push(wr);
    }
  }
  return result;
}

function calculateIchimoku(ohlc: OHLCData[]): {
  tenkan: (number | null)[];
  kijun: (number | null)[];
  senkouA: (number | null)[];
  senkouB: (number | null)[];
  chikou: (number | null)[];
} {
  const tenkanPeriod = 9;
  const kijunPeriod = 26;
  const senkouBPeriod = 52;
  const displacement = 26;

  const tenkan: (number | null)[] = [];
  const kijun: (number | null)[] = [];
  const senkouA: (number | null)[] = [];
  const senkouB: (number | null)[] = [];
  const chikou: (number | null)[] = [];

  // Helper to get high-low average
  const getHighLowAvg = (data: OHLCData[], start: number, period: number): number | null => {
    if (start < period - 1) return null;
    const slice = data.slice(start - period + 1, start + 1);
    const high = Math.max(...slice.map(d => d.high));
    const low = Math.min(...slice.map(d => d.low));
    return (high + low) / 2;
  };

  for (let i = 0; i < ohlc.length; i++) {
    // Tenkan-sen (Conversion Line)
    tenkan.push(getHighLowAvg(ohlc, i, tenkanPeriod));

    // Kijun-sen (Base Line)
    kijun.push(getHighLowAvg(ohlc, i, kijunPeriod));

    // Chikou Span (Lagging Span) - current close shifted back
    chikou.push(ohlc[i].close);
  }

  // Senkou Span A and B (shifted forward by displacement)
  for (let i = 0; i < ohlc.length + displacement; i++) {
    if (i < displacement) {
      senkouA.push(null);
      senkouB.push(null);
    } else {
      const idx = i - displacement;
      const t = tenkan[idx];
      const k = kijun[idx];
      senkouA.push(t !== null && k !== null ? (t + k) / 2 : null);
      senkouB.push(getHighLowAvg(ohlc, idx, senkouBPeriod));
    }
  }

  return { tenkan, kijun, senkouA, senkouB, chikou };
}

export function BitcoinHighchart() {
  const [chartData, setChartData] = useState<ChartDataResponse | null>(null);
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndicators, setActiveIndicators] = useState<Set<IndicatorType>>(new Set(['sma', 'bb']));
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>('overlays');
  const panelRef = useRef<HTMLDivElement>(null);

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
    const interval = setInterval(fetchPrice, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch chart data with indicators
  useEffect(() => {
    const fetchChartData = async () => {
      try {
        setLoading(true);
        const res = await fetch('http://localhost:5000/api/bitcoin-chart-data');
        if (res.ok) {
          const data: ChartDataResponse = await res.json();
          if (data.ohlc && data.ohlc.length > 0) {
            setChartData(data);
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
  }, []);

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

  // Build chart options with indicators
  const buildChartOptions = (): Highcharts.Options => {
    if (!chartData) return {};

    // Format OHLC data: [timestamp, open, high, low, close]
    const ohlcFormatted = chartData.ohlc.map((item) => [
      item.time * 1000,
      item.open,
      item.high,
      item.low,
      item.close,
    ]);

    // Format volume data: [timestamp, volume]
    const volumeFormatted = chartData.ohlc.map((item) => ({
      x: item.time * 1000,
      y: item.volume || 0,
      color: item.close >= item.open ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)',
    }));

    // Calculate how many oscillator panes we need
    const oscillatorIndicators = ['rsi', 'macd', 'stochastic', 'cci', 'williamsR', 'atr', 'obv', 'mfi'] as IndicatorType[];
    const activeOscillators = oscillatorIndicators.filter(ind => activeIndicators.has(ind));
    const numOscillatorPanes = activeOscillators.length;

    // Calculate heights dynamically
    const volumeHeight = 15;
    const oscillatorPaneHeight = numOscillatorPanes > 0 ? Math.min(12, 36 / numOscillatorPanes) : 0;
    const totalOscillatorHeight = oscillatorPaneHeight * numOscillatorPanes;
    const priceHeight = 100 - volumeHeight - totalOscillatorHeight - (numOscillatorPanes * 2); // 2% gap per pane

    // Build yAxis array
    const yAxes: Highcharts.YAxisOptions[] = [
      {
        // Price axis
        height: `${priceHeight}%`,
        gridLineColor: 'rgba(51, 65, 85, 0.5)',
        labels: {
          style: { color: '#94a3b8' },
          formatter: function () {
            return '$' + Highcharts.numberFormat(Number(this.value), 0, '.', ',');
          },
        },
        opposite: true,
      },
      {
        // Volume axis
        top: `${priceHeight + 2}%`,
        height: `${volumeHeight}%`,
        offset: 0,
        gridLineColor: 'rgba(51, 65, 85, 0.3)',
        labels: {
          style: { color: '#94a3b8' },
          formatter: function () {
            const val = Number(this.value);
            if (val >= 1e9) return (val / 1e9).toFixed(1) + 'B';
            if (val >= 1e6) return (val / 1e6).toFixed(1) + 'M';
            if (val >= 1e3) return (val / 1e3).toFixed(1) + 'K';
            return val.toString();
          },
        },
        opposite: true,
      },
    ];

    // Add oscillator panes
    let currentTop = priceHeight + volumeHeight + 4;
    activeOscillators.forEach((_, idx) => {
      yAxes.push({
        top: `${currentTop}%`,
        height: `${oscillatorPaneHeight}%`,
        offset: 0,
        gridLineColor: 'rgba(51, 65, 85, 0.3)',
        labels: {
          style: { color: '#94a3b8', fontSize: '10px' },
        },
        opposite: true,
      });
      currentTop += oscillatorPaneHeight + 2;
    });

    // Build indicator series
    const indicatorSeries: Highcharts.SeriesOptionsType[] = [];

    // SMA indicators
    if (activeIndicators.has('sma')) {
      indicatorSeries.push({
        type: 'line',
        name: 'SMA 20',
        data: chartData.indicators.sma_20
          .map((val, i) => val !== null ? [chartData.ohlc[i].time * 1000, val] : null)
          .filter((item): item is [number, number] => item !== null),
        color: '#3b82f6',
        lineWidth: 1,
        yAxis: 0,
        tooltip: { valueDecimals: 2 },
      });
      indicatorSeries.push({
        type: 'line',
        name: 'SMA 50',
        data: chartData.indicators.sma_50
          .map((val, i) => val !== null ? [chartData.ohlc[i].time * 1000, val] : null)
          .filter((item): item is [number, number] => item !== null),
        color: '#60a5fa',
        lineWidth: 1,
        yAxis: 0,
        tooltip: { valueDecimals: 2 },
      });
      if (chartData.indicators.sma_200) {
        indicatorSeries.push({
          type: 'line',
          name: 'SMA 200',
          data: chartData.indicators.sma_200
            .map((val, i) => val !== null ? [chartData.ohlc[i].time * 1000, val] : null)
            .filter((item): item is [number, number] => item !== null),
          color: '#93c5fd',
          lineWidth: 1,
          dashStyle: 'Dot',
          yAxis: 0,
          tooltip: { valueDecimals: 2 },
        });
      }
    }

    // EMA indicators
    if (activeIndicators.has('ema')) {
      indicatorSeries.push({
        type: 'line',
        name: 'EMA 12',
        data: chartData.indicators.ema_12
          .map((val, i) => val !== null ? [chartData.ohlc[i].time * 1000, val] : null)
          .filter((item): item is [number, number] => item !== null),
        color: '#8b5cf6',
        lineWidth: 1,
        yAxis: 0,
        tooltip: { valueDecimals: 2 },
      });
      indicatorSeries.push({
        type: 'line',
        name: 'EMA 26',
        data: chartData.indicators.ema_26
          .map((val, i) => val !== null ? [chartData.ohlc[i].time * 1000, val] : null)
          .filter((item): item is [number, number] => item !== null),
        color: '#a78bfa',
        lineWidth: 1,
        yAxis: 0,
        tooltip: { valueDecimals: 2 },
      });
    }

    // Bollinger Bands
    if (activeIndicators.has('bb')) {
      indicatorSeries.push({
        type: 'line',
        name: 'BB Upper',
        data: chartData.indicators.bb_upper
          .map((val, i) => val !== null ? [chartData.ohlc[i].time * 1000, val] : null)
          .filter((item): item is [number, number] => item !== null),
        color: 'rgba(245, 158, 11, 0.6)',
        lineWidth: 1,
        yAxis: 0,
        tooltip: { valueDecimals: 2 },
      });
      indicatorSeries.push({
        type: 'line',
        name: 'BB Middle',
        data: chartData.indicators.bb_middle
          .map((val, i) => val !== null ? [chartData.ohlc[i].time * 1000, val] : null)
          .filter((item): item is [number, number] => item !== null),
        color: 'rgba(245, 158, 11, 0.8)',
        lineWidth: 1,
        dashStyle: 'Dash',
        yAxis: 0,
        tooltip: { valueDecimals: 2 },
      });
      indicatorSeries.push({
        type: 'line',
        name: 'BB Lower',
        data: chartData.indicators.bb_lower
          .map((val, i) => val !== null ? [chartData.ohlc[i].time * 1000, val] : null)
          .filter((item): item is [number, number] => item !== null),
        color: 'rgba(245, 158, 11, 0.6)',
        lineWidth: 1,
        yAxis: 0,
        tooltip: { valueDecimals: 2 },
      });
      // BB fill area between bands
      indicatorSeries.push({
        type: 'arearange',
        name: 'BB Range',
        data: chartData.indicators.bb_lower
          .map((low, i) => {
            const high = chartData.indicators.bb_upper[i];
            if (low !== null && high !== null) {
              return [chartData.ohlc[i].time * 1000, low, high];
            }
            return null;
          })
          .filter((item): item is [number, number, number] => item !== null),
        color: 'rgba(245, 158, 11, 0.1)',
        lineWidth: 0,
        yAxis: 0,
        enableMouseTracking: false,
      });
    }

    // VWAP
    if (activeIndicators.has('vwap')) {
      indicatorSeries.push({
        type: 'line',
        name: 'VWAP',
        data: chartData.indicators.vwap
          .map((val, i) => val !== null ? [chartData.ohlc[i].time * 1000, val] : null)
          .filter((item): item is [number, number] => item !== null),
        color: '#06b6d4',
        lineWidth: 2,
        yAxis: 0,
        tooltip: { valueDecimals: 2 },
      });
    }

    // Ichimoku Cloud (Highcharts exclusive)
    if (activeIndicators.has('ichimoku')) {
      const ichimoku = calculateIchimoku(chartData.ohlc);

      // Tenkan-sen (Conversion Line)
      indicatorSeries.push({
        type: 'line',
        name: 'Tenkan-sen',
        data: ichimoku.tenkan
          .map((val, i) => val !== null && i < chartData.ohlc.length ? [chartData.ohlc[i].time * 1000, val] : null)
          .filter((item): item is [number, number] => item !== null),
        color: '#3b82f6',
        lineWidth: 1,
        yAxis: 0,
        tooltip: { valueDecimals: 2 },
      });

      // Kijun-sen (Base Line)
      indicatorSeries.push({
        type: 'line',
        name: 'Kijun-sen',
        data: ichimoku.kijun
          .map((val, i) => val !== null && i < chartData.ohlc.length ? [chartData.ohlc[i].time * 1000, val] : null)
          .filter((item): item is [number, number] => item !== null),
        color: '#ef4444',
        lineWidth: 1,
        yAxis: 0,
        tooltip: { valueDecimals: 2 },
      });

      // Senkou Span A & B (Cloud)
      const cloudData = ichimoku.senkouA
        .map((a, i) => {
          const b = ichimoku.senkouB[i];
          if (a !== null && b !== null && i < chartData.ohlc.length) {
            return [chartData.ohlc[Math.min(i, chartData.ohlc.length - 1)].time * 1000, Math.min(a, b), Math.max(a, b)];
          }
          return null;
        })
        .filter((item): item is [number, number, number] => item !== null);

      indicatorSeries.push({
        type: 'arearange',
        name: 'Kumo (Cloud)',
        data: cloudData,
        color: 'rgba(16, 185, 129, 0.15)',
        lineWidth: 0,
        yAxis: 0,
        enableMouseTracking: false,
      });
    }

    // RSI (in separate pane)
    if (activeIndicators.has('rsi')) {
      const yAxisIdx = 2 + activeOscillators.indexOf('rsi');
      indicatorSeries.push({
        type: 'line',
        name: 'RSI (14)',
        data: chartData.indicators.rsi
          .map((val, i) => val !== null ? [chartData.ohlc[i].time * 1000, val] : null)
          .filter((item): item is [number, number] => item !== null),
        color: '#ec4899',
        lineWidth: 1.5,
        yAxis: yAxisIdx,
        tooltip: { valueDecimals: 2 },
      });
      // Add overbought/oversold lines
      indicatorSeries.push({
        type: 'line',
        name: 'RSI 70',
        data: chartData.ohlc.map(item => [item.time * 1000, 70]),
        color: 'rgba(239, 68, 68, 0.5)',
        lineWidth: 1,
        dashStyle: 'Dash',
        yAxis: yAxisIdx,
        enableMouseTracking: false,
      });
      indicatorSeries.push({
        type: 'line',
        name: 'RSI 30',
        data: chartData.ohlc.map(item => [item.time * 1000, 30]),
        color: 'rgba(16, 185, 129, 0.5)',
        lineWidth: 1,
        dashStyle: 'Dash',
        yAxis: yAxisIdx,
        enableMouseTracking: false,
      });
    }

    // MACD (in separate pane)
    if (activeIndicators.has('macd')) {
      const yAxisIdx = 2 + activeOscillators.indexOf('macd');
      // MACD Line
      indicatorSeries.push({
        type: 'line',
        name: 'MACD',
        data: chartData.indicators.macd
          .map((val, i) => val !== null ? [chartData.ohlc[i].time * 1000, val] : null)
          .filter((item): item is [number, number] => item !== null),
        color: '#3b82f6',
        lineWidth: 1.5,
        yAxis: yAxisIdx,
        tooltip: { valueDecimals: 2 },
      });
      // Signal Line
      indicatorSeries.push({
        type: 'line',
        name: 'Signal',
        data: chartData.indicators.macd_signal
          .map((val, i) => val !== null ? [chartData.ohlc[i].time * 1000, val] : null)
          .filter((item): item is [number, number] => item !== null),
        color: '#f97316',
        lineWidth: 1.5,
        yAxis: yAxisIdx,
        tooltip: { valueDecimals: 2 },
      });
      // Histogram
      indicatorSeries.push({
        type: 'column',
        name: 'MACD Hist',
        data: chartData.indicators.macd_histogram
          .map((val, i) => {
            if (val === null) return null;
            return {
              x: chartData.ohlc[i].time * 1000,
              y: val,
              color: val >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)',
            };
          })
          .filter((item): item is { x: number; y: number; color: string } => item !== null),
        yAxis: yAxisIdx,
        borderWidth: 0,
        tooltip: { valueDecimals: 2 },
      });
    }

    // Stochastic (Highcharts exclusive)
    if (activeIndicators.has('stochastic')) {
      const yAxisIdx = 2 + activeOscillators.indexOf('stochastic');
      const stoch = calculateStochastic(chartData.ohlc);
      indicatorSeries.push({
        type: 'line',
        name: '%K',
        data: stoch.k
          .map((val, i) => val !== null ? [chartData.ohlc[i].time * 1000, val] : null)
          .filter((item): item is [number, number] => item !== null),
        color: '#3b82f6',
        lineWidth: 1.5,
        yAxis: yAxisIdx,
        tooltip: { valueDecimals: 2 },
      });
      indicatorSeries.push({
        type: 'line',
        name: '%D',
        data: stoch.d
          .map((val, i) => val !== null ? [chartData.ohlc[i].time * 1000, val] : null)
          .filter((item): item is [number, number] => item !== null),
        color: '#f97316',
        lineWidth: 1.5,
        yAxis: yAxisIdx,
        tooltip: { valueDecimals: 2 },
      });
      // Overbought/Oversold
      indicatorSeries.push({
        type: 'line',
        name: 'Stoch 80',
        data: chartData.ohlc.map(item => [item.time * 1000, 80]),
        color: 'rgba(239, 68, 68, 0.4)',
        lineWidth: 1,
        dashStyle: 'Dash',
        yAxis: yAxisIdx,
        enableMouseTracking: false,
      });
      indicatorSeries.push({
        type: 'line',
        name: 'Stoch 20',
        data: chartData.ohlc.map(item => [item.time * 1000, 20]),
        color: 'rgba(16, 185, 129, 0.4)',
        lineWidth: 1,
        dashStyle: 'Dash',
        yAxis: yAxisIdx,
        enableMouseTracking: false,
      });
    }

    // CCI (Highcharts exclusive)
    if (activeIndicators.has('cci')) {
      const yAxisIdx = 2 + activeOscillators.indexOf('cci');
      const cci = calculateCCI(chartData.ohlc);
      indicatorSeries.push({
        type: 'line',
        name: 'CCI (20)',
        data: cci
          .map((val, i) => val !== null ? [chartData.ohlc[i].time * 1000, val] : null)
          .filter((item): item is [number, number] => item !== null),
        color: '#14b8a6',
        lineWidth: 1.5,
        yAxis: yAxisIdx,
        tooltip: { valueDecimals: 2 },
      });
      // Reference lines
      indicatorSeries.push({
        type: 'line',
        name: 'CCI +100',
        data: chartData.ohlc.map(item => [item.time * 1000, 100]),
        color: 'rgba(239, 68, 68, 0.4)',
        lineWidth: 1,
        dashStyle: 'Dash',
        yAxis: yAxisIdx,
        enableMouseTracking: false,
      });
      indicatorSeries.push({
        type: 'line',
        name: 'CCI -100',
        data: chartData.ohlc.map(item => [item.time * 1000, -100]),
        color: 'rgba(16, 185, 129, 0.4)',
        lineWidth: 1,
        dashStyle: 'Dash',
        yAxis: yAxisIdx,
        enableMouseTracking: false,
      });
    }

    // Williams %R (Highcharts exclusive)
    if (activeIndicators.has('williamsR')) {
      const yAxisIdx = 2 + activeOscillators.indexOf('williamsR');
      const wr = calculateWilliamsR(chartData.ohlc);
      indicatorSeries.push({
        type: 'line',
        name: 'Williams %R',
        data: wr
          .map((val, i) => val !== null ? [chartData.ohlc[i].time * 1000, val] : null)
          .filter((item): item is [number, number] => item !== null),
        color: '#a855f7',
        lineWidth: 1.5,
        yAxis: yAxisIdx,
        tooltip: { valueDecimals: 2 },
      });
      indicatorSeries.push({
        type: 'line',
        name: '%R -20',
        data: chartData.ohlc.map(item => [item.time * 1000, -20]),
        color: 'rgba(239, 68, 68, 0.4)',
        lineWidth: 1,
        dashStyle: 'Dash',
        yAxis: yAxisIdx,
        enableMouseTracking: false,
      });
      indicatorSeries.push({
        type: 'line',
        name: '%R -80',
        data: chartData.ohlc.map(item => [item.time * 1000, -80]),
        color: 'rgba(16, 185, 129, 0.4)',
        lineWidth: 1,
        dashStyle: 'Dash',
        yAxis: yAxisIdx,
        enableMouseTracking: false,
      });
    }

    // ATR (Highcharts exclusive)
    if (activeIndicators.has('atr')) {
      const yAxisIdx = 2 + activeOscillators.indexOf('atr');
      const atr = calculateATR(chartData.ohlc);
      indicatorSeries.push({
        type: 'line',
        name: 'ATR (14)',
        data: atr
          .map((val, i) => val !== null ? [chartData.ohlc[i].time * 1000, val] : null)
          .filter((item): item is [number, number] => item !== null),
        color: '#ef4444',
        lineWidth: 1.5,
        yAxis: yAxisIdx,
        tooltip: { valueDecimals: 2 },
      });
    }

    // OBV (in separate pane)
    if (activeIndicators.has('obv')) {
      const yAxisIdx = 2 + activeOscillators.indexOf('obv');
      indicatorSeries.push({
        type: 'line',
        name: 'OBV',
        data: chartData.indicators.obv
          .map((val, i) => val !== null ? [chartData.ohlc[i].time * 1000, val] : null)
          .filter((item): item is [number, number] => item !== null),
        color: '#f97316',
        lineWidth: 1.5,
        yAxis: yAxisIdx,
        tooltip: { valueDecimals: 0 },
      });
    }

    // MFI (in separate pane)
    if (activeIndicators.has('mfi')) {
      const yAxisIdx = 2 + activeOscillators.indexOf('mfi');
      indicatorSeries.push({
        type: 'line',
        name: 'MFI (14)',
        data: chartData.indicators.mfi
          .map((val, i) => val !== null ? [chartData.ohlc[i].time * 1000, val] : null)
          .filter((item): item is [number, number] => item !== null),
        color: '#84cc16',
        lineWidth: 1.5,
        yAxis: yAxisIdx,
        tooltip: { valueDecimals: 2 },
      });
      indicatorSeries.push({
        type: 'line',
        name: 'MFI 80',
        data: chartData.ohlc.map(item => [item.time * 1000, 80]),
        color: 'rgba(239, 68, 68, 0.4)',
        lineWidth: 1,
        dashStyle: 'Dash',
        yAxis: yAxisIdx,
        enableMouseTracking: false,
      });
      indicatorSeries.push({
        type: 'line',
        name: 'MFI 20',
        data: chartData.ohlc.map(item => [item.time * 1000, 20]),
        color: 'rgba(16, 185, 129, 0.4)',
        lineWidth: 1,
        dashStyle: 'Dash',
        yAxis: yAxisIdx,
        enableMouseTracking: false,
      });
    }

    // Pivot Points (Highcharts exclusive - horizontal lines)
    if (activeIndicators.has('pivots') && chartData.levels?.pivot_points) {
      const pivots = chartData.levels.pivot_points;
      const firstTime = chartData.ohlc[0].time * 1000;
      const lastTime = chartData.ohlc[chartData.ohlc.length - 1].time * 1000;

      // Pivot point
      indicatorSeries.push({
        type: 'line',
        name: 'Pivot',
        data: [[firstTime, pivots.pivot], [lastTime, pivots.pivot]],
        color: '#06b6d4',
        lineWidth: 1.5,
        dashStyle: 'Dash',
        yAxis: 0,
        enableMouseTracking: true,
        tooltip: { valueDecimals: 2 },
      });
      // Resistance levels
      ['r1', 'r2', 'r3'].forEach((key, idx) => {
        const value = pivots[key as keyof typeof pivots];
        if (value) {
          indicatorSeries.push({
            type: 'line',
            name: `R${idx + 1}`,
            data: [[firstTime, value], [lastTime, value]],
            color: `rgba(239, 68, 68, ${0.8 - idx * 0.2})`,
            lineWidth: 1,
            dashStyle: 'ShortDash',
            yAxis: 0,
            enableMouseTracking: true,
            tooltip: { valueDecimals: 2 },
          });
        }
      });
      // Support levels
      ['s1', 's2', 's3'].forEach((key, idx) => {
        const value = pivots[key as keyof typeof pivots];
        if (value) {
          indicatorSeries.push({
            type: 'line',
            name: `S${idx + 1}`,
            data: [[firstTime, value], [lastTime, value]],
            color: `rgba(16, 185, 129, ${0.8 - idx * 0.2})`,
            lineWidth: 1,
            dashStyle: 'ShortDash',
            yAxis: 0,
            enableMouseTracking: true,
            tooltip: { valueDecimals: 2 },
          });
        }
      });
    }

    // Fibonacci Retracements (Highcharts exclusive)
    if (activeIndicators.has('fibonacci') && chartData.levels?.fibonacci) {
      const fib = chartData.levels.fibonacci;
      const firstTime = chartData.ohlc[0].time * 1000;
      const lastTime = chartData.ohlc[chartData.ohlc.length - 1].time * 1000;

      const fibLevels = [
        { key: '0', color: '#94a3b8' },
        { key: '0.236', color: '#f59e0b' },
        { key: '0.382', color: '#eab308' },
        { key: '0.5', color: '#84cc16' },
        { key: '0.618', color: '#22c55e' },
        { key: '0.786', color: '#14b8a6' },
        { key: '1', color: '#94a3b8' },
      ];

      fibLevels.forEach(({ key, color }) => {
        const value = fib[key];
        if (value !== undefined) {
          indicatorSeries.push({
            type: 'line',
            name: `Fib ${(parseFloat(key) * 100).toFixed(1)}%`,
            data: [[firstTime, value], [lastTime, value]],
            color,
            lineWidth: 1,
            dashStyle: 'Dot',
            yAxis: 0,
            enableMouseTracking: true,
            tooltip: { valueDecimals: 2 },
          });
        }
      });
    }

    // Calculate dynamic chart height based on number of panes
    const baseHeight = 450;
    const paneHeight = numOscillatorPanes * 80;
    const chartHeight = baseHeight + paneHeight;

    return {
      accessibility: {
        enabled: false,
      },
      chart: {
        backgroundColor: 'transparent',
        height: chartHeight,
        style: {
          fontFamily: 'inherit',
        },
      },
      title: {
        text: undefined,
      },
      navigator: {
        enabled: false,
      },
      scrollbar: {
        enabled: false,
      },
      rangeSelector: {
        enabled: true,
        selected: 2,
        inputEnabled: false,
        buttonTheme: {
          fill: 'rgba(51, 65, 85, 0.5)',
          stroke: 'rgba(100, 116, 139, 0.5)',
          style: {
            color: '#94a3b8',
          },
          states: {
            hover: {
              fill: 'rgba(99, 102, 241, 0.3)',
              style: {
                color: '#fff',
              },
            },
            select: {
              fill: 'rgba(99, 102, 241, 0.5)',
              style: {
                color: '#fff',
              },
            },
          },
        },
        labelStyle: {
          color: '#94a3b8',
        },
        buttons: [
          { type: 'week', count: 1, text: '1W' },
          { type: 'month', count: 1, text: '1M' },
          { type: 'month', count: 3, text: '3M' },
          { type: 'month', count: 6, text: '6M' },
          { type: 'all', text: 'All' },
        ],
      },
      xAxis: {
        lineColor: 'rgba(51, 65, 85, 0.5)',
        tickColor: 'rgba(51, 65, 85, 0.5)',
        labels: {
          style: {
            color: '#94a3b8',
          },
        },
        crosshair: {
          color: 'rgba(99, 102, 241, 0.3)',
        },
      },
      yAxis: yAxes,
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: 'rgba(99, 102, 241, 0.5)',
        borderRadius: 8,
        style: {
          color: '#e2e8f0',
        },
        split: false,
        shared: true,
      },
      plotOptions: {
        candlestick: {
          color: '#ef4444',
          upColor: '#10b981',
          lineColor: '#ef4444',
          upLineColor: '#10b981',
        },
        series: {
          animation: false,
        },
      },
      series: [
        {
          type: 'candlestick',
          name: 'BTC/USD',
          data: ohlcFormatted,
          yAxis: 0,
        },
        {
          type: 'column',
          name: 'Volume',
          data: volumeFormatted,
          yAxis: 1,
          borderWidth: 0,
        },
        ...indicatorSeries,
      ],
      credits: {
        enabled: false,
      },
    };
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
          {Array.from(activeIndicators).map(key => (
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
          {activeIndicators.size === 0 && (
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
                ? 'bg-violet-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
            }`}
          >
            <Settings2 className="w-4 h-4" />
            <span className="hidden sm:inline">Indicators</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${isPanelOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Panel - Desktop */}
          {isPanelOpen && (
            <div className="hidden sm:block absolute right-0 top-full mt-2 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="p-3 border-b border-slate-800">
                <h3 className="text-sm font-semibold text-white">Technical Indicators</h3>
                <p className="text-xs text-slate-500 mt-0.5">Select indicators to display on chart</p>
                <p className="text-[10px] text-violet-400 mt-1">★ Highcharts exclusive indicators available</p>
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
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-violet-600 text-white rounded">
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
                          const isExclusive = ['ichimoku', 'stochastic', 'cci', 'williamsR', 'atr', 'pivots', 'fibonacci'].includes(indicatorKey);
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
                                  <p className="text-sm font-medium text-slate-200 flex items-center gap-1">
                                    {config.label}
                                    {isExclusive && (
                                      <span className="text-[9px] text-violet-400 font-normal">★</span>
                                    )}
                                  </p>
                                  <p className="text-[10px] text-slate-500">{config.description}</p>
                                </div>
                              </div>
                              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                                isActive
                                  ? 'border-violet-500 bg-violet-500'
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
              <div className="absolute bottom-0 left-0 right-0 bg-slate-900 rounded-t-2xl max-h-[75vh] overflow-hidden animate-slide-up">
                {/* Handle */}
                <div className="flex justify-center py-2">
                  <div className="w-10 h-1 bg-slate-700 rounded-full" />
                </div>

                <div className="px-4 pb-2">
                  <h3 className="text-base font-semibold text-white">Technical Indicators</h3>
                  <p className="text-xs text-slate-500">Select indicators to display</p>
                  <p className="text-[10px] text-violet-400 mt-1">★ Highcharts exclusive</p>
                </div>

                <div className="overflow-y-auto max-h-[calc(75vh-80px)] pb-8">
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
                            const isExclusive = ['ichimoku', 'stochastic', 'cci', 'williamsR', 'atr', 'pivots', 'fibonacci'].includes(indicatorKey);
                            return (
                              <button
                                type="button"
                                key={indicatorKey}
                                onClick={() => toggleIndicator(indicatorKey)}
                                className={`flex items-center gap-2 p-3 rounded-xl transition-all ${
                                  isActive
                                    ? 'bg-violet-600/20 border-2 border-violet-500'
                                    : 'bg-slate-800/50 border-2 border-transparent'
                                }`}
                              >
                                <span
                                  className="w-3 h-3 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: config.color }}
                                />
                                <div className="text-left min-w-0">
                                  <p className="text-sm font-medium text-white truncate flex items-center gap-1">
                                    {config.label}
                                    {isExclusive && <span className="text-[9px] text-violet-400">★</span>}
                                  </p>
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
              <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
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
        {chartData && chartData.ohlc.length > 0 && (
          <HighchartsReact
            highcharts={Highcharts}
            constructorType="stockChart"
            options={buildChartOptions()}
          />
        )}
        {!loading && (!chartData || chartData.ohlc.length === 0) && !error && (
          <div className="flex items-center justify-center min-h-[550px]">
            <p className="text-slate-500">No chart data available</p>
          </div>
        )}
      </div>

      {/* Chart Footer */}
      <div className="flex items-center justify-between mt-3 px-1">
        <p className="text-xs text-slate-500">Data from Polygon.io • 365 days • Volume always shown</p>
        <p className="text-xs text-slate-500">
          <span className="text-violet-400">★</span> Highcharts Stock
        </p>
      </div>
    </div>
  );
}
