'use client';

import { useState, useCallback } from 'react';
import { Sparkles, TrendingUp, TrendingDown, Minus, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface AIAnalysisData {
  analysis: string;
  metrics: {
    current_price: number;
    rsi: number;
    sma_20: number;
    sma_50: number;
    change_7d: number;
    change_30d: number;
  };
  timestamp: number;
  // Extracted visual data for chart overlay
  levels?: {
    support: number[];
    resistance: number[];
  };
}

interface AIAnalysisProps {
  onLevelsExtracted?: (levels: { support: number[]; resistance: number[] }) => void;
}

export function AIAnalysis({ onLevelsExtracted }: AIAnalysisProps) {
  const [data, setData] = useState<AIAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [lastFetch, setLastFetch] = useState<number>(0);

  // Extract price levels from AI analysis text
  const extractPriceLevels = (text: string): { support: number[]; resistance: number[] } => {
    const support: number[] = [];
    const resistance: number[] = [];

    // Regex patterns for common price mentions
    const pricePattern = /\$[\d,]+(?:\.\d+)?/g;
    const supportPattern = /support[:\s]+\$?([\d,]+)/gi;
    const resistancePattern = /resistance[:\s]+\$?([\d,]+)/gi;

    // Extract support levels
    let match;
    while ((match = supportPattern.exec(text)) !== null) {
      const price = parseFloat(match[1].replace(/,/g, ''));
      if (price > 10000 && price < 200000) support.push(price);
    }

    // Extract resistance levels
    while ((match = resistancePattern.exec(text)) !== null) {
      const price = parseFloat(match[1].replace(/,/g, ''));
      if (price > 10000 && price < 200000) resistance.push(price);
    }

    return { support: [...new Set(support)], resistance: [...new Set(resistance)] };
  };

  const fetchAnalysis = useCallback(async () => {
    // Rate limit: don't fetch more than once per 5 minutes
    const now = Date.now();
    if (lastFetch && now - lastFetch < 5 * 60 * 1000 && data) {
      setExpanded(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('http://localhost:5000/api/bitcoin-ai-analysis');
      if (res.ok) {
        const result = await res.json();
        if (result.analysis) {
          // Extract visual levels from the analysis
          const levels = extractPriceLevels(result.analysis);
          const enrichedData = { ...result, levels };
          setData(enrichedData);
          setLastFetch(now);
          setExpanded(true);

          // Callback to overlay on chart
          if (onLevelsExtracted && (levels.support.length > 0 || levels.resistance.length > 0)) {
            onLevelsExtracted(levels);
          }
        } else {
          setError(result.error || 'No analysis available');
        }
      } else {
        setError('Failed to get AI analysis');
      }
    } catch (err) {
      console.error('AI analysis error:', err);
      setError('Failed to connect to AI service');
    } finally {
      setLoading(false);
    }
  }, [data, lastFetch, onLevelsExtracted]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  // Determine trend indicator
  const getTrendIndicator = () => {
    if (!data) return null;
    const { change_7d, rsi } = data.metrics;

    if (change_7d > 3 && rsi > 50) {
      return { icon: TrendingUp, color: 'text-emerald-400', label: 'Bullish' };
    } else if (change_7d < -3 && rsi < 50) {
      return { icon: TrendingDown, color: 'text-rose-400', label: 'Bearish' };
    }
    return { icon: Minus, color: 'text-slate-400', label: 'Neutral' };
  };

  const trend = getTrendIndicator();

  // Parse analysis into sections
  const parseAnalysis = (text: string) => {
    const sections: { title: string; content: string }[] = [];
    const lines = text.split('\n');
    let currentSection = { title: 'Overview', content: '' };

    lines.forEach((line) => {
      const headerMatch = line.match(/^\*\*(.+?)\*\*:?\s*(.*)/);
      const numberedMatch = line.match(/^\d+\.\s*\*\*(.+?)\*\*:?\s*(.*)/);

      if (headerMatch || numberedMatch) {
        if (currentSection.content) {
          sections.push(currentSection);
        }
        const match = numberedMatch || headerMatch;
        currentSection = {
          title: match![1],
          content: match![2] || '',
        };
      } else if (line.trim()) {
        currentSection.content += (currentSection.content ? ' ' : '') + line.trim();
      }
    });

    if (currentSection.content) {
      sections.push(currentSection);
    }

    return sections;
  };

  return (
    <div className="w-full bg-gradient-to-br from-slate-900/80 to-indigo-950/30 rounded-xl border border-indigo-500/20 overflow-hidden">
      {/* Header - Always visible */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">AI Pattern Analysis</h3>
              <p className="text-xs text-slate-400">Powered by Gemini • On-demand analysis</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {data && trend && (
              <div className={`flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800/50 ${trend.color}`}>
                <trend.icon className="w-4 h-4" />
                <span className="text-xs font-medium">{trend.label}</span>
              </div>
            )}

            {!data ? (
              <button
                type="button"
                onClick={fetchAnalysis}
                disabled={loading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Get AI Analysis
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

      {/* Error State */}
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
          {/* Metrics Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-800/50 rounded-lg p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">RSI (14)</p>
              <p className={`text-lg font-mono font-semibold ${
                data.metrics.rsi > 70 ? 'text-rose-400' :
                data.metrics.rsi < 30 ? 'text-emerald-400' : 'text-white'
              }`}>
                {data.metrics.rsi.toFixed(1)}
              </p>
              <p className="text-[10px] text-slate-500">
                {data.metrics.rsi > 70 ? 'Overbought' : data.metrics.rsi < 30 ? 'Oversold' : 'Neutral'}
              </p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">7D Change</p>
              <p className={`text-lg font-mono font-semibold ${
                data.metrics.change_7d >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {data.metrics.change_7d >= 0 ? '+' : ''}{data.metrics.change_7d.toFixed(2)}%
              </p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">30D Change</p>
              <p className={`text-lg font-mono font-semibold ${
                data.metrics.change_30d >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {data.metrics.change_30d >= 0 ? '+' : ''}{data.metrics.change_30d.toFixed(2)}%
              </p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Price vs SMA50</p>
              <p className={`text-lg font-mono font-semibold ${
                data.metrics.current_price > data.metrics.sma_50 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {data.metrics.current_price > data.metrics.sma_50 ? 'Above' : 'Below'}
              </p>
            </div>
          </div>

          {/* AI Analysis Sections */}
          <div className="space-y-3">
            {parseAnalysis(data.analysis).map((section, idx) => (
              <div key={idx} className="bg-slate-800/30 rounded-lg p-3">
                <h4 className="text-sm font-semibold text-indigo-400 mb-1">{section.title}</h4>
                <p className="text-sm text-slate-300 leading-relaxed">{section.content}</p>
              </div>
            ))}
          </div>

          {/* Extracted Levels (if any) */}
          {data.levels && (data.levels.support.length > 0 || data.levels.resistance.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {data.levels.support.map((level, idx) => (
                <span
                  key={`s-${idx}`}
                  className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded-md font-mono"
                >
                  S: {formatPrice(level)}
                </span>
              ))}
              {data.levels.resistance.map((level, idx) => (
                <span
                  key={`r-${idx}`}
                  className="px-2 py-1 bg-rose-500/20 text-rose-400 text-xs rounded-md font-mono"
                >
                  R: {formatPrice(level)}
                </span>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/50">
            <p className="text-[10px] text-slate-500">
              Analysis generated {new Date(data.timestamp * 1000).toLocaleString()}
            </p>
            <button
              type="button"
              onClick={fetchAnalysis}
              disabled={loading}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
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
