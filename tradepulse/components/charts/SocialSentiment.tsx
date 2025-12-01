'use client';

import { useState, useCallback } from 'react';
import { MessageCircle, TrendingUp, TrendingDown, Hash, Users, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';

interface SentimentData {
  sentiment: {
    current_sentiment: {
      score: number;
      label: string;
      confidence: number;
    };
    trending_topics: Array<{
      topic: string;
      sentiment: number;
      volume: string;
    }>;
    key_influencers_sentiment: {
      bullish_voices: number;
      bearish_voices: number;
      notable_calls: string[];
    };
    sentiment_drivers: string[];
    '30_day_trend': Array<{
      period: string;
      score: number;
    }>;
    summary: string;
  };
  btc_price: number;
  btc_change_24h: number;
  timestamp: string;
}

export function SocialSentiment() {
  const [data, setData] = useState<SentimentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [lastFetch, setLastFetch] = useState<number>(0);

  const fetchSentiment = useCallback(async () => {
    const now = Date.now();
    if (lastFetch && now - lastFetch < 5 * 60 * 1000 && data) {
      setExpanded(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/bitcoin-social-sentiment`);
      if (res.ok) {
        const result = await res.json();
        if (result.sentiment) {
          setData(result);
          setLastFetch(now);
          setExpanded(true);
        } else {
          setError(result.error || 'No sentiment data available');
        }
      } else {
        setError('Failed to get social sentiment');
      }
    } catch (err) {
      console.error('Social sentiment error:', err);
      setError('Failed to connect to Grok AI');
    } finally {
      setLoading(false);
    }
  }, [data, lastFetch]);

  // Sentiment score to color
  const getScoreColor = (score: number) => {
    if (score >= 50) return 'text-emerald-400';
    if (score >= 20) return 'text-emerald-300';
    if (score >= -20) return 'text-slate-300';
    if (score >= -50) return 'text-rose-300';
    return 'text-rose-400';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 50) return 'bg-emerald-500';
    if (score >= 20) return 'bg-emerald-400';
    if (score >= -20) return 'bg-slate-400';
    if (score >= -50) return 'bg-rose-400';
    return 'bg-rose-500';
  };

  // Calculate gauge rotation (-100 to +100 maps to -90deg to +90deg)
  const getGaugeRotation = (score: number) => {
    return (score / 100) * 90;
  };

  return (
    <div className="w-full bg-gradient-to-br from-slate-900/80 to-cyan-950/30 rounded-xl border border-cyan-500/20 overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">X Social Pulse</h3>
              <p className="text-xs text-slate-400">Powered by Grok AI • Real-time sentiment</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {data && (
              <div className={`flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800/50 ${getScoreColor(data.sentiment.current_sentiment.score)}`}>
                {data.sentiment.current_sentiment.score >= 0 ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
                <span className="text-xs font-medium">{data.sentiment.current_sentiment.label}</span>
              </div>
            )}

            {!data ? (
              <button
                type="button"
                onClick={fetchSentiment}
                disabled={loading}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Scanning X...
                  </>
                ) : (
                  <>
                    <MessageCircle className="w-4 h-4" />
                    Get X Sentiment
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
          {/* Sentiment Gauge */}
          <div className="flex items-center gap-6">
            {/* Gauge */}
            <div className="relative w-32 h-16 overflow-hidden">
              {/* Gauge background */}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-32 h-16 rounded-t-full bg-gradient-to-r from-rose-500 via-slate-500 to-emerald-500 opacity-30" />
              {/* Gauge needle */}
              <div
                className="absolute bottom-0 left-1/2 origin-bottom w-1 h-14 bg-white rounded-full shadow-lg transition-transform duration-500"
                style={{ transform: `translateX(-50%) rotate(${getGaugeRotation(data.sentiment.current_sentiment.score)}deg)` }}
              />
              {/* Center dot */}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full" />
              {/* Labels */}
              <span className="absolute bottom-0 left-0 text-[10px] text-rose-400">-100</span>
              <span className="absolute bottom-0 right-0 text-[10px] text-emerald-400">+100</span>
            </div>

            {/* Score Display */}
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className={`text-4xl font-bold font-mono ${getScoreColor(data.sentiment.current_sentiment.score)}`}>
                  {data.sentiment.current_sentiment.score > 0 ? '+' : ''}{data.sentiment.current_sentiment.score}
                </span>
                <span className="text-sm text-slate-500">/ 100</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Confidence: {data.sentiment.current_sentiment.confidence}%
              </p>
            </div>
          </div>

          {/* 30-Day Trend Mini Chart */}
          <div className="bg-slate-800/50 rounded-lg p-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">30-Day Sentiment Trend</p>
            <div className="flex items-end justify-between h-16 gap-1">
              {data.sentiment['30_day_trend'].map((point, idx) => {
                const height = Math.abs(point.score) * 0.6 + 10;
                const isPositive = point.score >= 0;
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center">
                    <div
                      className={`w-full rounded-t transition-all ${isPositive ? 'bg-emerald-500' : 'bg-rose-500'}`}
                      style={{ height: `${height}%` }}
                    />
                    <span className="text-[8px] text-slate-500 mt-1 truncate w-full text-center">
                      {point.period.replace(' ago', '').replace('days', 'd').replace('weeks', 'w')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Trending Topics */}
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Hash className="w-4 h-4 text-cyan-400" />
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Trending Topics</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {data.sentiment.trending_topics.slice(0, 5).map((topic, idx) => (
                <span
                  key={idx}
                  className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 ${
                    topic.sentiment >= 0
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/20 text-rose-400'
                  }`}
                >
                  {topic.topic}
                  <span className="text-[10px] opacity-70">
                    ({topic.sentiment > 0 ? '+' : ''}{topic.sentiment})
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* Influencer Sentiment */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-emerald-400">Bullish Voices</span>
              </div>
              <p className="text-2xl font-bold text-emerald-400 mt-1">
                {data.sentiment.key_influencers_sentiment.bullish_voices}
              </p>
            </div>
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-rose-400" />
                <span className="text-xs text-rose-400">Bearish Voices</span>
              </div>
              <p className="text-2xl font-bold text-rose-400 mt-1">
                {data.sentiment.key_influencers_sentiment.bearish_voices}
              </p>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-slate-800/30 rounded-lg p-3">
            <p className="text-sm text-slate-300 leading-relaxed">{data.sentiment.summary}</p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/50">
            <p className="text-[10px] text-slate-500">
              Updated {new Date(data.timestamp).toLocaleString()}
            </p>
            <button
              type="button"
              onClick={fetchSentiment}
              disabled={loading}
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
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
