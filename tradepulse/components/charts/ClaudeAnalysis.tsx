'use client';

import { useState, useCallback } from 'react';
import { Brain, Target, AlertTriangle, TrendingUp, TrendingDown, Minus, RefreshCw, ChevronDown, ChevronUp, Shield, Zap } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';

interface ClaudeAnalysisData {
  analysis: {
    market_phase: {
      current: string;
      confidence: number;
      explanation: string;
    };
    trend_analysis: {
      primary_trend: string;
      trend_strength: string;
      key_levels: {
        resistance: number[];
        support: number[];
      };
    };
    risk_assessment: {
      overall_risk: string;
      risk_factors: string[];
      opportunity_factors: string[];
    };
    scenarios: {
      bullish_case: {
        target: number;
        probability: number;
        catalyst: string;
      };
      bearish_case: {
        target: number;
        probability: number;
        catalyst: string;
      };
      base_case: {
        target: number;
        probability: number;
        rationale: string;
      };
    };
    actionable_insights: string[];
    summary: string;
  };
  market_data: {
    price: number;
    change_24h: number;
    change_7d: number;
    change_30d: number;
  };
  fear_greed: {
    value: number;
    classification: string;
  } | null;
  timestamp: string;
}

export function ClaudeAnalysis() {
  const [data, setData] = useState<ClaudeAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [lastFetch, setLastFetch] = useState<number>(0);

  const fetchAnalysis = useCallback(async () => {
    const now = Date.now();
    if (lastFetch && now - lastFetch < 5 * 60 * 1000 && data) {
      setExpanded(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/bitcoin-claude-analysis`);
      if (res.ok) {
        const result = await res.json();
        if (result.analysis) {
          setData(result);
          setLastFetch(now);
          setExpanded(true);
        } else {
          setError(result.error || 'No analysis available');
        }
      } else {
        setError('Failed to get Claude analysis');
      }
    } catch (err) {
      console.error('Claude analysis error:', err);
      setError('Failed to connect to Claude AI');
    } finally {
      setLoading(false);
    }
  }, [data, lastFetch]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  const getPhaseColor = (phase: string) => {
    switch (phase.toLowerCase()) {
      case 'accumulation': return 'text-emerald-400 bg-emerald-500/20';
      case 'markup': return 'text-green-400 bg-green-500/20';
      case 'distribution': return 'text-amber-400 bg-amber-500/20';
      case 'markdown': return 'text-rose-400 bg-rose-500/20';
      default: return 'text-slate-400 bg-slate-500/20';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend.toLowerCase()) {
      case 'bullish': return TrendingUp;
      case 'bearish': return TrendingDown;
      default: return Minus;
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk.toLowerCase()) {
      case 'low': return 'text-emerald-400';
      case 'moderate': return 'text-amber-400';
      case 'high': return 'text-orange-400';
      case 'extreme': return 'text-rose-400';
      default: return 'text-slate-400';
    }
  };

  const getRiskBars = (risk: string) => {
    switch (risk.toLowerCase()) {
      case 'low': return 1;
      case 'moderate': return 2;
      case 'high': return 3;
      case 'extreme': return 4;
      default: return 0;
    }
  };

  return (
    <div className="w-full bg-gradient-to-br from-slate-900/80 to-purple-950/30 rounded-xl border border-purple-500/20 overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Deep Market Analysis</h3>
              <p className="text-xs text-slate-400">Powered by Claude AI • Scenario modeling</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {data && (
              <div className={`px-2 py-1 rounded-lg text-xs font-medium ${getPhaseColor(data.analysis.market_phase.current)}`}>
                {data.analysis.market_phase.current.charAt(0).toUpperCase() + data.analysis.market_phase.current.slice(1)}
              </div>
            )}

            {!data ? (
              <button
                type="button"
                onClick={fetchAnalysis}
                disabled={loading}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Brain className="w-4 h-4" />
                    Get Deep Analysis
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
          {/* Market Phase & Trend */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/50 rounded-lg p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Market Phase</p>
              <p className={`text-lg font-semibold capitalize ${getPhaseColor(data.analysis.market_phase.current).split(' ')[0]}`}>
                {data.analysis.market_phase.current}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                {data.analysis.market_phase.confidence}% confidence
              </p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Primary Trend</p>
              <div className="flex items-center gap-2">
                {(() => {
                  const TrendIcon = getTrendIcon(data.analysis.trend_analysis.primary_trend);
                  return <TrendIcon className={`w-5 h-5 ${
                    data.analysis.trend_analysis.primary_trend === 'bullish' ? 'text-emerald-400' :
                    data.analysis.trend_analysis.primary_trend === 'bearish' ? 'text-rose-400' : 'text-slate-400'
                  }`} />;
                })()}
                <span className={`text-lg font-semibold capitalize ${
                  data.analysis.trend_analysis.primary_trend === 'bullish' ? 'text-emerald-400' :
                  data.analysis.trend_analysis.primary_trend === 'bearish' ? 'text-rose-400' : 'text-slate-400'
                }`}>
                  {data.analysis.trend_analysis.primary_trend}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1 capitalize">
                {data.analysis.trend_analysis.trend_strength} strength
              </p>
            </div>
          </div>

          {/* Scenario Analysis - Claude's strength */}
          <div className="bg-slate-800/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-purple-400" />
              <p className="text-sm font-semibold text-white">Scenario Analysis</p>
            </div>

            <div className="space-y-3">
              {/* Bull Case */}
              <div className="flex items-center gap-3 p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                <div className="flex-shrink-0">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-emerald-400">Bull Case</span>
                    <span className="text-sm font-mono text-emerald-400">{formatPrice(data.analysis.scenarios.bullish_case.target)}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">{data.analysis.scenarios.bullish_case.catalyst}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <span className="text-lg font-bold text-emerald-400">{data.analysis.scenarios.bullish_case.probability}%</span>
                </div>
              </div>

              {/* Base Case */}
              <div className="flex items-center gap-3 p-2 bg-slate-500/10 rounded-lg border border-slate-500/20">
                <div className="flex-shrink-0">
                  <Minus className="w-5 h-5 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-300">Base Case</span>
                    <span className="text-sm font-mono text-slate-300">{formatPrice(data.analysis.scenarios.base_case.target)}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">{data.analysis.scenarios.base_case.rationale}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <span className="text-lg font-bold text-slate-300">{data.analysis.scenarios.base_case.probability}%</span>
                </div>
              </div>

              {/* Bear Case */}
              <div className="flex items-center gap-3 p-2 bg-rose-500/10 rounded-lg border border-rose-500/20">
                <div className="flex-shrink-0">
                  <TrendingDown className="w-5 h-5 text-rose-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-rose-400">Bear Case</span>
                    <span className="text-sm font-mono text-rose-400">{formatPrice(data.analysis.scenarios.bearish_case.target)}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">{data.analysis.scenarios.bearish_case.catalyst}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <span className="text-lg font-bold text-rose-400">{data.analysis.scenarios.bearish_case.probability}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Risk Assessment */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-purple-400" />
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Risk Level</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xl font-bold capitalize ${getRiskColor(data.analysis.risk_assessment.overall_risk)}`}>
                  {data.analysis.risk_assessment.overall_risk}
                </span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((bar) => (
                    <div
                      key={bar}
                      className={`w-2 h-4 rounded-sm ${
                        bar <= getRiskBars(data.analysis.risk_assessment.overall_risk)
                          ? getRiskColor(data.analysis.risk_assessment.overall_risk).replace('text-', 'bg-').replace('-400', '-500')
                          : 'bg-slate-700'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Key Risks</p>
              </div>
              <ul className="space-y-1">
                {data.analysis.risk_assessment.risk_factors.slice(0, 2).map((risk, idx) => (
                  <li key={idx} className="text-[11px] text-rose-300 truncate">• {risk}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Actionable Insights - Claude's reasoning */}
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-purple-400" />
              <p className="text-sm font-semibold text-purple-400">Actionable Insights</p>
            </div>
            <ul className="space-y-2">
              {data.analysis.actionable_insights.slice(0, 3).map((insight, idx) => (
                <li key={idx} className="text-sm text-slate-300 flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">→</span>
                  {insight}
                </li>
              ))}
            </ul>
          </div>

          {/* Summary */}
          <div className="bg-slate-800/30 rounded-lg p-3">
            <p className="text-sm text-slate-300 leading-relaxed">{data.analysis.summary}</p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/50">
            <p className="text-[10px] text-slate-500">
              Updated {new Date(data.timestamp).toLocaleString()}
            </p>
            <button
              type="button"
              onClick={fetchAnalysis}
              disabled={loading}
              className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
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
