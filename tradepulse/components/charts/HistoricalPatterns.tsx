'use client';

import { useState, useCallback } from 'react';
import { History, TrendingUp, TrendingDown, Clock, Target, AlertTriangle, Lightbulb, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface TrajectoryPoint {
  day: number;
  pct: number;
}

interface HistoricalMatch {
  period: string;
  date_range: string;
  similarity_score: number;
  starting_conditions: string;
  outcome_30d: string;
  outcome_90d: string;
  key_lesson: string;
  normalized_trajectory: TrajectoryPoint[];
}

interface PatternData {
  patterns: {
    current_setup: {
      pattern_type: string;
      key_characteristics: string[];
      technical_context: string;
    };
    historical_matches: HistoricalMatch[];
    probability_weighted_forecast: {
      '30_day_expected': string;
      '90_day_expected': string;
      confidence: number;
      primary_scenario: string;
    };
    risk_factors: string[];
    bullish_catalysts: string[];
    summary: string;
  };
  current_price: number;
  fear_greed: number | null;
  timestamp: string;
}

// Colors for each historical period line
const TRAJECTORY_COLORS = [
  { line: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },  // emerald
  { line: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },  // blue
  { line: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },  // amber
  { line: '#ec4899', bg: 'rgba(236, 72, 153, 0.1)' },  // pink
];

export function HistoricalPatterns() {
  const [data, setData] = useState<PatternData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [lastFetch, setLastFetch] = useState<number>(0);
  const [selectedMatch, setSelectedMatch] = useState<number>(0);

  const fetchPatterns = useCallback(async () => {
    const now = Date.now();
    if (lastFetch && now - lastFetch < 5 * 60 * 1000 && data) {
      setExpanded(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('http://localhost:5000/api/bitcoin-historical-patterns');
      if (res.ok) {
        const result = await res.json();
        if (result.patterns) {
          setData(result);
          setLastFetch(now);
          setExpanded(true);
        } else {
          setError(result.error || 'No pattern data available');
        }
      } else {
        setError('Failed to get historical patterns');
      }
    } catch (err) {
      console.error('Historical patterns error:', err);
      setError('Failed to connect to Gemini AI');
    } finally {
      setLoading(false);
    }
  }, [data, lastFetch]);

  const getPatternColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'accumulation': return 'text-emerald-400 bg-emerald-500/20';
      case 'correction': return 'text-amber-400 bg-amber-500/20';
      case 'capitulation': return 'text-rose-400 bg-rose-500/20';
      case 'distribution': return 'text-orange-400 bg-orange-500/20';
      case 'breakout': return 'text-green-400 bg-green-500/20';
      case 'consolidation': return 'text-blue-400 bg-blue-500/20';
      default: return 'text-slate-400 bg-slate-500/20';
    }
  };

  const parseOutcome = (outcome: string): { value: number; isPositive: boolean } => {
    const match = outcome.match(/([+-]?\d+)/);
    if (match) {
      const value = parseInt(match[1]);
      return { value, isPositive: value >= 0 };
    }
    return { value: 0, isPositive: true };
  };

  // Render trajectory chart
  const renderTrajectoryChart = () => {
    if (!data || !data.patterns.historical_matches.length) return null;

    const matches = data.patterns.historical_matches;
    const chartWidth = 280;
    const chartHeight = 120;
    const padding = { top: 10, right: 10, bottom: 25, left: 35 };
    const graphWidth = chartWidth - padding.left - padding.right;
    const graphHeight = chartHeight - padding.top - padding.bottom;

    // Find min/max across all trajectories
    let minPct = 0, maxPct = 0;
    matches.forEach(match => {
      match.normalized_trajectory?.forEach(point => {
        minPct = Math.min(minPct, point.pct);
        maxPct = Math.max(maxPct, point.pct);
      });
    });

    // Add padding to range
    const range = maxPct - minPct || 100;
    minPct -= range * 0.1;
    maxPct += range * 0.1;

    const yScale = (pct: number) => padding.top + graphHeight - ((pct - minPct) / (maxPct - minPct)) * graphHeight;
    const xScale = (day: number) => padding.left + (day / 90) * graphWidth;

    // Y-axis labels
    const yLabels = [maxPct, (maxPct + minPct) / 2, minPct].map(v => Math.round(v));

    return (
      <svg width={chartWidth} height={chartHeight} className="overflow-visible">
        {/* Grid lines */}
        {yLabels.map((label, idx) => (
          <g key={idx}>
            <line
              x1={padding.left}
              y1={yScale(label)}
              x2={chartWidth - padding.right}
              y2={yScale(label)}
              stroke="#334155"
              strokeDasharray="2,2"
            />
            <text
              x={padding.left - 5}
              y={yScale(label)}
              fill="#64748b"
              fontSize="9"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {label > 0 ? '+' : ''}{label}%
            </text>
          </g>
        ))}

        {/* Zero line */}
        <line
          x1={padding.left}
          y1={yScale(0)}
          x2={chartWidth - padding.right}
          y2={yScale(0)}
          stroke="#475569"
          strokeWidth="1"
        />

        {/* X-axis labels */}
        {[0, 30, 60, 90].map(day => (
          <text
            key={day}
            x={xScale(day)}
            y={chartHeight - 5}
            fill="#64748b"
            fontSize="9"
            textAnchor="middle"
          >
            {day}d
          </text>
        ))}

        {/* Trajectory lines */}
        {matches.map((match, matchIdx) => {
          if (!match.normalized_trajectory?.length) return null;
          const color = TRAJECTORY_COLORS[matchIdx % TRAJECTORY_COLORS.length];
          const points = match.normalized_trajectory;

          const pathD = points
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.day)} ${yScale(p.pct)}`)
            .join(' ');

          return (
            <g key={matchIdx}>
              <path
                d={pathD}
                fill="none"
                stroke={color.line}
                strokeWidth={selectedMatch === matchIdx ? 2.5 : 1.5}
                strokeOpacity={selectedMatch === matchIdx ? 1 : 0.5}
                className="transition-all duration-200"
              />
              {/* End point marker */}
              <circle
                cx={xScale(points[points.length - 1].day)}
                cy={yScale(points[points.length - 1].pct)}
                r={selectedMatch === matchIdx ? 4 : 3}
                fill={color.line}
                opacity={selectedMatch === matchIdx ? 1 : 0.7}
              />
            </g>
          );
        })}

        {/* Current point (day 0) */}
        <circle
          cx={xScale(0)}
          cy={yScale(0)}
          r={4}
          fill="#fff"
          stroke="#475569"
          strokeWidth={2}
        />
      </svg>
    );
  };

  return (
    <div className="w-full bg-gradient-to-br from-slate-900/80 to-amber-950/30 rounded-xl border border-amber-500/20 overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
              <History className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Historical Patterns</h3>
              <p className="text-xs text-slate-400">Powered by Gemini AI • Pattern recognition</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {data && (
              <div className={`px-2 py-1 rounded-lg text-xs font-medium ${getPatternColor(data.patterns.current_setup.pattern_type)}`}>
                {data.patterns.current_setup.pattern_type.charAt(0).toUpperCase() + data.patterns.current_setup.pattern_type.slice(1)}
              </div>
            )}

            {!data ? (
              <button
                type="button"
                onClick={fetchPatterns}
                disabled={loading}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Scanning History...
                  </>
                ) : (
                  <>
                    <History className="w-4 h-4" />
                    Find Patterns
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors text-slate-400"
              >
                {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 pb-4">
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg">
            <p className="text-rose-400 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Expanded Content */}
      {data && expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-800/50 pt-4">
          {/* Current Setup */}
          <div className="bg-slate-800/50 rounded-lg p-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Current Setup</p>
            <p className="text-sm text-slate-300">{data.patterns.current_setup.technical_context}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {data.patterns.current_setup.key_characteristics.map((char, idx) => (
                <span key={idx} className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded">
                  {char}
                </span>
              ))}
            </div>
          </div>

          {/* Trajectory Chart */}
          <div className="bg-slate-800/30 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              <p className="text-sm font-semibold text-white">Historical Trajectories (90 days)</p>
            </div>
            <div className="flex justify-center">
              {renderTrajectoryChart()}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-3 mt-2">
              {data.patterns.historical_matches.slice(0, 4).map((match, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedMatch(idx)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] transition-all ${
                    selectedMatch === idx ? 'bg-slate-700' : 'hover:bg-slate-800'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: TRAJECTORY_COLORS[idx % TRAJECTORY_COLORS.length].line }}
                  />
                  <span className="text-slate-300">{match.period}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Historical Matches */}
          <div className="space-y-2">
            {data.patterns.historical_matches.map((match, idx) => {
              const outcome30 = parseOutcome(match.outcome_30d);
              const outcome90 = parseOutcome(match.outcome_90d);

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedMatch(idx)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedMatch === idx
                      ? 'bg-slate-800/70 border-amber-500/50'
                      : 'bg-slate-800/30 border-slate-700/50 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: TRAJECTORY_COLORS[idx % TRAJECTORY_COLORS.length].line }}
                      />
                      <span className="text-sm font-semibold text-white">{match.period}</span>
                      <span className="text-[10px] text-slate-500">{match.date_range}</span>
                    </div>
                    <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded font-medium">
                      {match.similarity_score}% similar
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className={`flex items-center gap-1 ${outcome30.isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                      <Clock className="w-3 h-3" />
                      <span className="text-xs">30d: {match.outcome_30d}</span>
                    </div>
                    <div className={`flex items-center gap-1 ${outcome90.isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                      <Target className="w-3 h-3" />
                      <span className="text-xs">90d: {match.outcome_90d}</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 flex items-start gap-1">
                    <Lightbulb className="w-3 h-3 mt-0.5 flex-shrink-0 text-amber-400" />
                    {match.key_lesson}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Forecast */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-amber-400" />
              <p className="text-sm font-semibold text-amber-400">Probability-Weighted Forecast</p>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <p className="text-[10px] text-slate-500">30-Day Expected</p>
                <p className="text-lg font-bold text-white">{data.patterns.probability_weighted_forecast['30_day_expected']}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">90-Day Expected</p>
                <p className="text-lg font-bold text-white">{data.patterns.probability_weighted_forecast['90_day_expected']}</p>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              {data.patterns.probability_weighted_forecast.primary_scenario}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">
              Confidence: {data.patterns.probability_weighted_forecast.confidence}%
            </p>
          </div>

          {/* Risk & Catalysts */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2">
              <div className="flex items-center gap-1 mb-1">
                <AlertTriangle className="w-3 h-3 text-rose-400" />
                <p className="text-[10px] text-rose-400 font-medium">Risks</p>
              </div>
              <ul className="space-y-0.5">
                {data.patterns.risk_factors.slice(0, 2).map((risk, idx) => (
                  <li key={idx} className="text-[10px] text-slate-400">• {risk}</li>
                ))}
              </ul>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
              <div className="flex items-center gap-1 mb-1">
                <TrendingUp className="w-3 h-3 text-emerald-400" />
                <p className="text-[10px] text-emerald-400 font-medium">Catalysts</p>
              </div>
              <ul className="space-y-0.5">
                {data.patterns.bullish_catalysts.slice(0, 2).map((catalyst, idx) => (
                  <li key={idx} className="text-[10px] text-slate-400">• {catalyst}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-slate-800/30 rounded-lg p-3">
            <p className="text-sm text-slate-300 leading-relaxed">{data.patterns.summary}</p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/50">
            <p className="text-[10px] text-slate-500">
              Updated {new Date(data.timestamp).toLocaleString()}
            </p>
            <button
              type="button"
              onClick={fetchPatterns}
              disabled={loading}
              className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
