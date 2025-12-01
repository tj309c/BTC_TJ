'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, TrendingUp, TrendingDown, Zap, AlertTriangle, ChevronDown, ChevronUp, Bell, BellOff, Clock, ArrowUpRight, ArrowDownRight, Minus, BarChart2, Target } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';

interface VolumeSpike {
  current_volume: number;
  avg_volume: number;
  median_volume: number;
  std_volume: number;
  z_score: number;
  percentile: number;
  volume_ratio: number;
  spike_level: string;
  spike_color: string;
  current_price: number;
  is_spike: boolean;
  volume_history: Array<{
    volume: number;
    price: number;
    z_score: number;
    is_spike: boolean;
  }>;
}

interface RealtimeSignals {
  volume_velocity: {
    value: number;
    direction: string;
    alert: boolean;
  };
  price_volume_divergence: {
    type: string;
    strength: string;
    price_change: number;
  };
  buy_pressure: {
    ratio: number;
    label: string;
  };
  volume_breakout: {
    is_breakout: boolean;
    days_since_high: number;
    lookback_max: number;
  };
  volume_trend: {
    direction: string;
    strength: number;
  };
}

interface VolumeAnalysisData {
  spike: VolumeSpike | null;
  realtime_signals?: RealtimeSignals;
  lookback_days?: number;
  timestamp: string;
  error?: string;
}

// Time window presets (minimum 7 days for statistically meaningful results)
const TIME_PRESETS = [
  { value: 7, label: '7D' },
  { value: 14, label: '14D' },
  { value: 30, label: '30D' },
];

function LoadingSkeleton() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
      <Skeleton className="h-32 w-full" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    </div>
  );
}

function formatVolume(volume: number): string {
  if (volume >= 1e9) {
    return `$${(volume / 1e9).toFixed(2)}B`;
  }
  if (volume >= 1e6) {
    return `$${(volume / 1e6).toFixed(1)}M`;
  }
  return `$${(volume / 1e3).toFixed(0)}K`;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

function getSpikeLabel(level: string): string {
  switch (level) {
    case 'extreme': return 'EXTREME SPIKE';
    case 'high': return 'HIGH VOLUME';
    case 'elevated': return 'ELEVATED';
    case 'above_average': return 'ABOVE AVG';
    case 'very_low': return 'VERY LOW';
    case 'below_average': return 'BELOW AVG';
    default: return 'NORMAL';
  }
}

function getSpikeIcon(level: string) {
  switch (level) {
    case 'extreme':
    case 'high':
      return AlertTriangle;
    case 'elevated':
    case 'above_average':
      return TrendingUp;
    case 'very_low':
    case 'below_average':
      return TrendingDown;
    default:
      return Activity;
  }
}

// Real-Time Signals Panel Component
function RealtimeSignalsPanel({ signals, onNotificationToggle, notificationsEnabled }: {
  signals: RealtimeSignals;
  onNotificationToggle: () => void;
  notificationsEnabled: boolean;
}) {
  const getVelocityColor = () => {
    if (signals.volume_velocity.alert) return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
    if (Math.abs(signals.volume_velocity.value) > 25) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
  };

  const getDivergenceColor = () => {
    if (signals.price_volume_divergence.type === 'bullish') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    if (signals.price_volume_divergence.type === 'bearish') return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
    return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
  };

  const getPressureColor = () => {
    if (signals.buy_pressure.ratio > 0.65) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    if (signals.buy_pressure.ratio < 0.35) return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
    return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
  };

  const getBreakoutColor = () => {
    if (signals.volume_breakout.is_breakout) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
  };

  const getTrendColor = () => {
    if (signals.volume_trend.direction === 'increasing') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    if (signals.volume_trend.direction === 'decreasing') return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
    return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
  };

  return (
    <div className="bg-slate-800/30 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">Real-Time Signals</span>
        </div>
        <button
          type="button"
          onClick={onNotificationToggle}
          className={`p-1.5 rounded-lg transition-colors ${
            notificationsEnabled
              ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
              : 'bg-slate-700/50 text-slate-500 hover:bg-slate-700'
          }`}
          title={notificationsEnabled ? 'Disable desktop alerts' : 'Enable desktop alerts'}
        >
          {notificationsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {/* Volume Velocity */}
        <div className={`rounded-lg border p-2.5 ${getVelocityColor()}`}>
          <div className="flex items-center gap-1 mb-1">
            {signals.volume_velocity.direction === 'up' ? (
              <ArrowUpRight className="w-3.5 h-3.5" />
            ) : signals.volume_velocity.direction === 'down' ? (
              <ArrowDownRight className="w-3.5 h-3.5" />
            ) : (
              <Minus className="w-3.5 h-3.5" />
            )}
            <span className="text-[10px] uppercase font-medium">Velocity</span>
          </div>
          <p className="text-lg font-bold font-mono">
            {signals.volume_velocity.value > 0 ? '+' : ''}{signals.volume_velocity.value.toFixed(0)}%
          </p>
          <p className="text-[9px] opacity-70">vs yesterday</p>
        </div>

        {/* Price-Volume Divergence */}
        <div className={`rounded-lg border p-2.5 ${getDivergenceColor()}`}>
          <div className="flex items-center gap-1 mb-1">
            <Activity className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase font-medium">Divergence</span>
          </div>
          <p className="text-lg font-bold capitalize">
            {signals.price_volume_divergence.type === 'none' ? 'None' : signals.price_volume_divergence.type}
          </p>
          <p className="text-[9px] opacity-70">
            {signals.price_volume_divergence.strength !== 'none' ? signals.price_volume_divergence.strength : 'No signal'}
          </p>
        </div>

        {/* Buy/Sell Pressure */}
        <div className={`rounded-lg border p-2.5 ${getPressureColor()}`}>
          <div className="flex items-center gap-1 mb-1">
            <BarChart2 className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase font-medium">Pressure</span>
          </div>
          <p className="text-lg font-bold font-mono">
            {(signals.buy_pressure.ratio * 100).toFixed(0)}%
          </p>
          <p className="text-[9px] opacity-70">{signals.buy_pressure.label}</p>
        </div>

        {/* Volume Breakout */}
        <div className={`rounded-lg border p-2.5 ${getBreakoutColor()}`}>
          <div className="flex items-center gap-1 mb-1">
            <Target className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase font-medium">Breakout</span>
          </div>
          <p className="text-lg font-bold">
            {signals.volume_breakout.is_breakout ? 'YES' : 'No'}
          </p>
          <p className="text-[9px] opacity-70">
            {signals.volume_breakout.is_breakout
              ? 'New high!'
              : `${signals.volume_breakout.days_since_high}d since high`}
          </p>
        </div>

        {/* Volume Trend */}
        <div className={`rounded-lg border p-2.5 ${getTrendColor()}`}>
          <div className="flex items-center gap-1 mb-1">
            {signals.volume_trend.direction === 'increasing' ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : signals.volume_trend.direction === 'decreasing' ? (
              <TrendingDown className="w-3.5 h-3.5" />
            ) : (
              <Minus className="w-3.5 h-3.5" />
            )}
            <span className="text-[10px] uppercase font-medium">Trend</span>
          </div>
          <p className="text-lg font-bold capitalize">
            {signals.volume_trend.direction === 'insufficient_data' ? 'N/A' : signals.volume_trend.direction}
          </p>
          <p className="text-[9px] opacity-70">
            {signals.volume_trend.strength.toFixed(1)}% slope
          </p>
        </div>
      </div>
    </div>
  );
}

// Time Window Selector Component
function TimeWindowSelector({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Clock className="w-4 h-4 text-slate-500" />
      <div className="flex bg-slate-800/50 rounded-lg p-0.5 border border-slate-700/50">
        {TIME_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => onChange(preset.value)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
              value === preset.value
                ? 'bg-amber-500/20 text-amber-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Semicircle Gauge Component
function VolumeGauge({ zScore, color }: { zScore: number; color: string }) {
  // Map z-score from -3 to +3 to angle from -90 to +90 degrees
  const clampedZ = Math.max(-3, Math.min(3, zScore));
  const angle = (clampedZ / 3) * 90;
  const needleRotation = angle - 90; // Adjust for SVG coordinate system

  // Calculate color stops for the gauge
  const zones = [
    { start: -90, end: -45, color: '#3b82f6', label: 'Very Low' },
    { start: -45, end: -15, color: '#6366f1', label: 'Below Avg' },
    { start: -15, end: 15, color: '#94a3b8', label: 'Normal' },
    { start: 15, end: 45, color: '#22c55e', label: 'Above Avg' },
    { start: 45, end: 67.5, color: '#eab308', label: 'Elevated' },
    { start: 67.5, end: 82.5, color: '#f97316', label: 'High' },
    { start: 82.5, end: 90, color: '#ef4444', label: 'Extreme' },
  ];

  return (
    <div className="relative w-full h-32">
      <svg viewBox="0 0 200 110" className="w-full h-full">
        {/* Background arc segments */}
        {zones.map((zone, idx) => {
          const startAngle = (zone.start * Math.PI) / 180;
          const endAngle = (zone.end * Math.PI) / 180;
          const r = 80;
          const cx = 100;
          const cy = 95;

          const x1 = cx + r * Math.cos(startAngle - Math.PI / 2);
          const y1 = cy + r * Math.sin(startAngle - Math.PI / 2);
          const x2 = cx + r * Math.cos(endAngle - Math.PI / 2);
          const y2 = cy + r * Math.sin(endAngle - Math.PI / 2);

          const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

          return (
            <path
              key={idx}
              d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
              stroke={zone.color}
              strokeWidth="16"
              fill="none"
              opacity="0.3"
            />
          );
        })}

        {/* Active arc (filled portion) */}
        {(() => {
          const startAngle = (-90 * Math.PI) / 180;
          const endAngle = (angle * Math.PI) / 180;
          const r = 80;
          const cx = 100;
          const cy = 95;

          const x1 = cx + r * Math.cos(startAngle - Math.PI / 2);
          const y1 = cy + r * Math.sin(startAngle - Math.PI / 2);
          const x2 = cx + r * Math.cos(endAngle - Math.PI / 2);
          const y2 = cy + r * Math.sin(endAngle - Math.PI / 2);

          const largeArc = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;
          const sweep = angle >= -90 ? 1 : 0;

          return (
            <path
              d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} ${sweep} ${x2} ${y2}`}
              stroke={color}
              strokeWidth="16"
              fill="none"
              strokeLinecap="round"
              className="transition-all duration-700"
            />
          );
        })()}

        {/* Tick marks */}
        {[-3, -2, -1, 0, 1, 2, 3].map((tick) => {
          const tickAngle = ((tick / 3) * 90 * Math.PI) / 180;
          const r1 = 65;
          const r2 = 70;
          const cx = 100;
          const cy = 95;

          const x1 = cx + r1 * Math.cos(tickAngle - Math.PI / 2);
          const y1 = cy + r1 * Math.sin(tickAngle - Math.PI / 2);
          const x2 = cx + r2 * Math.cos(tickAngle - Math.PI / 2);
          const y2 = cy + r2 * Math.sin(tickAngle - Math.PI / 2);

          return (
            <g key={tick}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#475569"
                strokeWidth="2"
              />
              <text
                x={cx + 55 * Math.cos(tickAngle - Math.PI / 2)}
                y={cy + 55 * Math.sin(tickAngle - Math.PI / 2)}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-slate-500 text-[8px]"
              >
                {tick > 0 ? `+${tick}σ` : `${tick}σ`}
              </text>
            </g>
          );
        })}

        {/* Needle */}
        <g transform={`rotate(${needleRotation}, 100, 95)`} className="transition-transform duration-700">
          <polygon
            points="100,25 96,95 104,95"
            fill={color}
            className="drop-shadow-lg"
          />
          <circle cx="100" cy="95" r="8" fill={color} />
          <circle cx="100" cy="95" r="4" fill="#1e293b" />
        </g>

        {/* Center label */}
        <text x="100" y="85" textAnchor="middle" className="fill-white text-lg font-bold">
          {zScore > 0 ? '+' : ''}{zScore.toFixed(2)}σ
        </text>
      </svg>
    </div>
  );
}

// Percentile Bar Component
function PercentileBar({ percentile, color }: { percentile: number; color: string }) {
  return (
    <div className="relative h-8 bg-slate-800/50 rounded-lg overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 flex">
        <div className="flex-1 bg-gradient-to-r from-blue-600/30 to-blue-500/30" />
        <div className="flex-1 bg-gradient-to-r from-slate-600/30 to-slate-500/30" />
        <div className="flex-1 bg-gradient-to-r from-emerald-500/30 to-amber-500/30" />
        <div className="flex-1 bg-gradient-to-r from-amber-500/30 to-orange-500/30" />
        <div className="flex-1 bg-gradient-to-r from-orange-500/30 to-red-500/30" />
      </div>

      {/* Position marker */}
      <div
        className="absolute top-0 bottom-0 w-1 transition-all duration-700"
        style={{
          left: `${percentile}%`,
          backgroundColor: color,
          boxShadow: `0 0 10px ${color}`,
        }}
      />

      {/* Labels */}
      <div className="absolute inset-0 flex items-center justify-between px-2 text-[9px] text-slate-400">
        <span>0%</span>
        <span>25%</span>
        <span>50%</span>
        <span>75%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

// Dual-axis Volume & Price Chart
function VolumeHistoryChart({ history, avgVolume, color, lookbackDays }: {
  history: Array<{ volume: number; price: number; z_score: number; is_spike: boolean }>;
  avgVolume: number;
  color: string;
  lookbackDays: number;
}) {
  // Volume calculations
  const maxVolume = Math.max(...history.map(v => v.volume));
  const minVolume = Math.min(...history.map(v => v.volume));
  const volumeRange = maxVolume - minVolume || 1;

  // Price calculations
  const prices = history.map(v => v.price).filter(p => p > 0);
  const maxPrice = Math.max(...prices);
  const minPrice = Math.min(...prices);
  const priceRange = maxPrice - minPrice || 1;
  const priceChange = prices.length >= 2 ? ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100 : 0;

  // Chart dimensions
  const width = 400;
  const height = 120;
  const padding = { top: 15, right: 45, bottom: 25, left: 45 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Volume points (bars)
  const volumePoints = history.map((item, idx) => {
    const x = padding.left + (idx / Math.max(history.length - 1, 1)) * chartWidth;
    const barHeight = ((item.volume - minVolume) / volumeRange) * chartHeight;
    const y = padding.top + chartHeight - barHeight;
    return { x, y, barHeight, ...item };
  });

  // Price points (line)
  const pricePoints = history.map((item, idx) => {
    const x = padding.left + (idx / Math.max(history.length - 1, 1)) * chartWidth;
    const y = padding.top + chartHeight - ((item.price - minPrice) / priceRange) * chartHeight;
    return { x, y, price: item.price };
  });

  // Price line path
  const pricePath = pricePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  // Average volume line position
  const avgY = padding.top + chartHeight - ((avgVolume - minVolume) / volumeRange) * chartHeight;

  // Bar width calculation
  const barWidth = Math.max(4, Math.min(12, (chartWidth / history.length) * 0.7));

  // Format price for axis
  const formatAxisPrice = (p: number) => `$${(p / 1000).toFixed(0)}k`;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-36">
        <defs>
          <linearGradient id="volumeBarGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.8" />
            <stop offset="100%" stopColor={color} stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id="priceLineGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1={padding.left}
            y1={padding.top + chartHeight * ratio}
            x2={width - padding.right}
            y2={padding.top + chartHeight * ratio}
            stroke="#334155"
            strokeWidth="0.5"
            strokeDasharray="4 4"
          />
        ))}

        {/* Volume bars */}
        {volumePoints.map((point, idx) => (
          <g key={`vol-${idx}`}>
            <rect
              x={point.x - barWidth / 2}
              y={point.y}
              width={barWidth}
              height={point.barHeight}
              fill={point.is_spike ? '#f97316' : 'url(#volumeBarGradient)'}
              rx="2"
              opacity={idx === volumePoints.length - 1 ? 1 : 0.7}
            />
            {point.is_spike && (
              <circle
                cx={point.x}
                cy={point.y - 5}
                r="3"
                fill="#f97316"
                className="animate-pulse"
              />
            )}
          </g>
        ))}

        {/* Average volume line */}
        <line
          x1={padding.left}
          y1={avgY}
          x2={width - padding.right}
          y2={avgY}
          stroke="#64748b"
          strokeWidth="1"
          strokeDasharray="4 2"
        />
        <text x={padding.left + 2} y={avgY - 3} className="fill-slate-500 text-[7px]">
          AVG
        </text>

        {/* Price line (on top) */}
        <path
          d={pricePath}
          fill="none"
          stroke="url(#priceLineGradient)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Price points */}
        {pricePoints.map((point, idx) => (
          <g key={`price-${idx}`}>
            {idx === pricePoints.length - 1 && (
              <>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="6"
                  fill="#f59e0b"
                  opacity="0.3"
                  className="animate-ping"
                />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="4"
                  fill="#f59e0b"
                  stroke="#1e293b"
                  strokeWidth="1.5"
                />
              </>
            )}
          </g>
        ))}

        {/* Left Y-axis label (Volume) */}
        <text
          x={padding.left - 5}
          y={padding.top}
          textAnchor="end"
          className="fill-slate-500 text-[7px]"
        >
          {formatVolume(maxVolume)}
        </text>
        <text
          x={padding.left - 5}
          y={padding.top + chartHeight}
          textAnchor="end"
          className="fill-slate-500 text-[7px]"
        >
          {formatVolume(minVolume)}
        </text>

        {/* Right Y-axis label (Price) */}
        <text
          x={width - padding.right + 5}
          y={padding.top}
          textAnchor="start"
          className="fill-amber-500 text-[7px]"
        >
          {formatAxisPrice(maxPrice)}
        </text>
        <text
          x={width - padding.right + 5}
          y={padding.top + chartHeight}
          textAnchor="start"
          className="fill-amber-500 text-[7px]"
        >
          {formatAxisPrice(minPrice)}
        </text>

        {/* Axis labels */}
        <text
          x={padding.left}
          y={height - 5}
          textAnchor="start"
          className="fill-slate-600 text-[8px]"
        >
          Volume
        </text>
        <text
          x={width - padding.right}
          y={height - 5}
          textAnchor="end"
          className="fill-amber-500/70 text-[8px]"
        >
          BTC Price
        </text>
      </svg>

      {/* X-axis labels & Price change badge */}
      <div className="flex justify-between items-center px-2 -mt-1">
        <span className="text-[9px] text-slate-500">{lookbackDays}d ago</span>
        <div className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
          priceChange >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
        }`}>
          BTC {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(1)}%
        </div>
        <span className="text-[9px] text-slate-500">Today</span>
      </div>
    </div>
  );
}

// Volume Comparison Bars
function VolumeComparisonBars({ current, avg, median, max }: {
  current: number;
  avg: number;
  median: number;
  max: number;
}) {
  const maxVal = Math.max(current, avg, median, max);

  const bars = [
    { label: 'Current', value: current, color: '#22c55e' },
    { label: 'Average', value: avg, color: '#f59e0b' },
    { label: 'Median', value: median, color: '#6366f1' },
  ];

  return (
    <div className="space-y-2">
      {bars.map((bar) => (
        <div key={bar.label} className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 w-14">{bar.label}</span>
          <div className="flex-1 h-4 bg-slate-800/50 rounded overflow-hidden">
            <div
              className="h-full rounded transition-all duration-700"
              style={{
                width: `${(bar.value / maxVal) * 100}%`,
                backgroundColor: bar.color,
              }}
            />
          </div>
          <span className="text-[10px] text-slate-300 w-16 text-right font-mono">
            {formatVolume(bar.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function WhaleAlert() {
  const [data, setData] = useState<VolumeAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [lookbackDays, setLookbackDays] = useState(14);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [lastAlertTime, setLastAlertTime] = useState(0);

  // Request notification permission
  const requestNotificationPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return Notification.permission === 'granted';
  }, []);

  const toggleNotifications = useCallback(async () => {
    if (!notificationsEnabled) {
      const granted = await requestNotificationPermission();
      if (granted) {
        setNotificationsEnabled(true);
      }
    } else {
      setNotificationsEnabled(false);
    }
  }, [notificationsEnabled, requestNotificationPermission]);

  // Send desktop notification
  const sendNotification = useCallback((title: string, body: string) => {
    if (notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
      const now = Date.now();
      // Debounce notifications (at least 5 minutes apart)
      if (now - lastAlertTime > 5 * 60 * 1000) {
        new Notification(title, {
          body,
          icon: '/btc-icon.png',
          tag: 'btc-volume-alert',
        });
        setLastAlertTime(now);
      }
    }
  }, [notificationsEnabled, lastAlertTime]);

  const fetchVolumeAnalysis = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/bitcoin-volume-analysis?lookback=${lookbackDays}`);
      if (res.ok) {
        const result = await res.json();
        if (result.spike) {
          setData(result);
          setError(null);

          // Check for alerts and send notification
          if (result.realtime_signals) {
            const signals = result.realtime_signals;
            if (signals.volume_velocity.alert) {
              sendNotification(
                'BTC Volume Alert',
                `Volume velocity ${signals.volume_velocity.value > 0 ? '+' : ''}${signals.volume_velocity.value.toFixed(0)}% - Unusual activity detected`
              );
            } else if (result.spike.is_spike) {
              sendNotification(
                'BTC Volume Spike',
                `Z-Score: ${result.spike.z_score.toFixed(2)}σ - ${getSpikeLabel(result.spike.spike_level)}`
              );
            }
          }
        } else {
          setError(result.error || 'No data available');
        }
      } else {
        setError('Failed to fetch volume data');
      }
    } catch (err) {
      console.error('Volume analysis error:', err);
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, [lookbackDays, sendNotification]);

  useEffect(() => {
    fetchVolumeAnalysis();
    // 5-minute refresh interval
    const interval = setInterval(fetchVolumeAnalysis, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchVolumeAnalysis]);

  // Refetch when lookback changes
  useEffect(() => {
    setLoading(true);
    fetchVolumeAnalysis();
  }, [lookbackDays, fetchVolumeAnalysis]);

  if (loading && !data) {
    return (
      <Card className="border-slate-800/50 bg-slate-900/50 backdrop-blur-xl overflow-hidden">
        <LoadingSkeleton />
      </Card>
    );
  }

  if (error || !data?.spike) {
    return (
      <Card className="border-slate-800/50 bg-slate-900/50 backdrop-blur-xl">
        <CardContent className="py-8 text-center text-slate-500">
          <p>Unable to load BTC volume analysis.</p>
          <p className="text-xs mt-2">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const spike = data.spike;
  const isSpike = spike.is_spike;
  const SpikeIcon = getSpikeIcon(spike.spike_level);

  const getGradient = () => {
    if (spike.spike_level === 'extreme' || spike.spike_level === 'high') return 'from-orange-500/20';
    if (spike.spike_level === 'elevated' || spike.spike_level === 'above_average') return 'from-emerald-500/20';
    if (spike.spike_level === 'very_low' || spike.spike_level === 'below_average') return 'from-blue-500/20';
    return 'from-slate-500/20';
  };

  const getBorderColor = () => {
    if (spike.spike_level === 'extreme' || spike.spike_level === 'high') return 'border-orange-500/30';
    if (spike.spike_level === 'elevated' || spike.spike_level === 'above_average') return 'border-emerald-500/30';
    if (spike.spike_level === 'very_low' || spike.spike_level === 'below_average') return 'border-blue-500/30';
    return 'border-slate-700/50';
  };

  // Find max volume in history for comparison bars
  const maxHistoryVolume = Math.max(...spike.volume_history.map(v => v.volume));

  return (
    <Card className={`relative border-2 ${getBorderColor()} bg-slate-900/50 backdrop-blur-xl overflow-hidden`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${getGradient()} to-transparent pointer-events-none`} />

      {isSpike && (
        <div
          className="absolute -inset-[1px] bg-gradient-to-r from-transparent via-current to-transparent opacity-30 animate-pulse pointer-events-none"
          style={{ color: spike.spike_color }}
        />
      )}

      <CardContent className="relative p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              {isSpike && (
                <div
                  className="absolute -inset-2 rounded-full blur-xl animate-pulse"
                  style={{ backgroundColor: `${spike.spike_color}30` }}
                />
              )}
              <div className="relative h-12 w-12 overflow-hidden rounded-full bg-slate-800 ring-2 ring-amber-500 ring-offset-2 ring-offset-slate-900 flex items-center justify-center">
                <svg viewBox="0 0 32 32" className="w-8 h-8">
                  <path
                    fill="#F7931A"
                    d="M15.9,0.5C7.4,0.5,0.5,7.4,0.5,15.9s6.9,15.4,15.4,15.4s15.4-6.9,15.4-15.4S24.4,0.5,15.9,0.5z M20.4,13.8c0.3-2.1-1.3-3.2-3.4-4l0.7-2.8l-1.7-0.4l-0.7,2.7c-0.5-0.1-0.9-0.2-1.4-0.3l0.7-2.7l-1.7-0.4l-0.7,2.8c-0.4-0.1-0.8-0.2-1.1-0.3l0-0.1l-2.4-0.6l-0.5,1.8c0,0,1.3,0.3,1.2,0.3c0.7,0.2,0.8,0.6,0.8,1l-0.8,3.2c0,0,0.1,0,0.2,0.1c-0.1,0-0.1,0-0.2,0l-1.1,4.5c-0.1,0.2-0.3,0.6-0.8,0.4c0,0-1.2-0.3-1.2-0.3l-0.8,1.9l2.2,0.6c0.4,0.1,0.8,0.2,1.2,0.3l-0.7,2.8l1.7,0.4l0.7-2.8c0.5,0.1,1,0.2,1.4,0.4l-0.7,2.8l1.7,0.4l0.7-2.8c2.9,0.5,5.1,0.3,6-2.3c0.7-2.1-0.1-3.3-1.5-4.1C19.8,16.2,20.6,15.3,20.4,13.8z M17.3,18.9c-0.5,2.1-4.1,1-5.2,0.7l0.9-3.7C14.1,16.2,17.9,16.7,17.3,18.9z M17.9,13.8c-0.5,1.9-3.4,0.9-4.4,0.7l0.8-3.4C15.4,11.4,18.4,11.8,17.9,13.8z"
                  />
                </svg>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400" />
                <h3 className="font-semibold text-slate-100">BTC Volume Analysis</h3>
                <Badge
                  className="border text-[10px]"
                  style={{
                    backgroundColor: `${spike.spike_color}20`,
                    color: spike.spike_color,
                    borderColor: `${spike.spike_color}50`
                  }}
                >
                  <SpikeIcon className="h-3 w-3 mr-1" />
                  {getSpikeLabel(spike.spike_level)}
                </Badge>
              </div>
              <p className="text-2xl font-bold font-mono text-slate-200">
                {formatPrice(spike.current_price)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <TimeWindowSelector value={lookbackDays} onChange={setLookbackDays} />
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors text-slate-400"
            >
              {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="space-y-6">
            {/* Real-Time Signals Panel */}
            {data.realtime_signals && (
              <RealtimeSignalsPanel
                signals={data.realtime_signals}
                onNotificationToggle={toggleNotifications}
                notificationsEnabled={notificationsEnabled}
              />
            )}

            {/* Main Gauge and Stats Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Z-Score Gauge */}
              <div className="bg-slate-800/30 rounded-xl p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-2 text-center">
                  Volume Z-Score ({lookbackDays}d)
                </p>
                <VolumeGauge zScore={spike.z_score} color={spike.spike_color} />
                <p className="text-center text-xs text-slate-400 mt-2">
                  {spike.z_score >= 1.5 ? 'Statistical anomaly detected!' :
                   spike.z_score >= 1 ? 'Above average volume' :
                   spike.z_score <= -1 ? 'Below average volume' :
                   'Volume within normal range'}
                </p>
              </div>

              {/* Volume History Chart */}
              <div className="bg-slate-800/30 rounded-xl p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                  {lookbackDays}-Day Volume Trend
                </p>
                <VolumeHistoryChart
                  history={spike.volume_history}
                  avgVolume={spike.avg_volume}
                  color={spike.spike_color}
                  lookbackDays={lookbackDays}
                />
              </div>

              {/* Volume Comparison */}
              <div className="bg-slate-800/30 rounded-xl p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">
                  Volume Comparison
                </p>
                <VolumeComparisonBars
                  current={spike.current_volume}
                  avg={spike.avg_volume}
                  median={spike.median_volume}
                  max={maxHistoryVolume}
                />
                <div className="mt-3 pt-3 border-t border-slate-700/50">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Current vs Avg</span>
                    <span
                      className="text-sm font-bold font-mono"
                      style={{ color: spike.spike_color }}
                    >
                      {spike.volume_ratio}x
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Percentile Bar */}
            <div className="bg-slate-800/30 rounded-xl p-4">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs text-slate-500 uppercase tracking-wider">
                  Volume Percentile Ranking ({lookbackDays}d)
                </p>
                <span className="text-sm font-bold" style={{ color: spike.spike_color }}>
                  {spike.percentile.toFixed(1)}th percentile
                </span>
              </div>
              <PercentileBar percentile={spike.percentile} color={spike.spike_color} />
              <p className="text-xs text-slate-400 mt-2 text-center">
                {spike.percentile >= 90 ? `Today's volume is higher than ${spike.percentile.toFixed(0)}% of days` :
                 spike.percentile <= 10 ? `Today's volume is lower than ${(100 - spike.percentile).toFixed(0)}% of days` :
                 `${(100 - spike.percentile).toFixed(0)}% of days had higher volume`}
              </p>
            </div>

            {/* Key Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-800/30 rounded-lg p-3 text-center">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">24h Volume</p>
                <p className="text-lg font-bold font-mono" style={{ color: spike.spike_color }}>
                  {formatVolume(spike.current_volume)}
                </p>
              </div>
              <div className="bg-slate-800/30 rounded-lg p-3 text-center">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{lookbackDays}-Day Avg</p>
                <p className="text-lg font-bold font-mono text-amber-400">
                  {formatVolume(spike.avg_volume)}
                </p>
              </div>
              <div className="bg-slate-800/30 rounded-lg p-3 text-center">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Std Deviation</p>
                <p className="text-lg font-bold font-mono text-slate-300">
                  {formatVolume(spike.std_volume)}
                </p>
              </div>
              <div className="bg-slate-800/30 rounded-lg p-3 text-center">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Median</p>
                <p className="text-lg font-bold font-mono text-indigo-400">
                  {formatVolume(spike.median_volume)}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800/50">
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  Average line
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-orange-500" />
                  Volume spike
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  5min refresh
                </span>
              </div>
              <p className="text-[10px] text-slate-600">
                Updated {new Date(data.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
