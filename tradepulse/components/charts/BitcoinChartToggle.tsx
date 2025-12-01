'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamic imports to avoid SSR issues with chart libraries
const BitcoinTradingViewChart = dynamic(
  () => import('./BitcoinTradingViewChart').then((mod) => mod.BitcoinTradingViewChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

const BitcoinHighchart = dynamic(
  () => import('./BitcoinHighchart').then((mod) => mod.BitcoinHighchart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

function ChartSkeleton() {
  return (
    <div className="w-full">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 bg-slate-800 rounded-full animate-pulse" />
        <div>
          <div className="h-6 w-24 bg-slate-800 rounded animate-pulse" />
          <div className="h-4 w-16 bg-slate-800 rounded animate-pulse mt-1" />
        </div>
      </div>
      <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4">
        <div className="h-[400px] bg-slate-800/50 rounded animate-pulse" />
      </div>
    </div>
  );
}

type ChartType = 'tradingview' | 'highcharts';

export function BitcoinChartToggle() {
  const [activeChart, setActiveChart] = useState<ChartType>('tradingview');

  return (
    <div className="w-full">
      {/* Toggle Switch */}
      <div className="flex items-center justify-end mb-4">
        <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-sm rounded-lg p-1 border border-slate-700">
          <button
            onClick={() => setActiveChart('tradingview')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
              activeChart === 'tradingview'
                ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white shadow-lg shadow-emerald-500/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <span className="hidden sm:inline">TradingView</span>
            <span className="sm:hidden">TV</span>
          </button>
          <button
            onClick={() => setActiveChart('highcharts')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
              activeChart === 'highcharts'
                ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-lg shadow-violet-500/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <span className="hidden sm:inline">Highcharts</span>
            <span className="sm:hidden">HC</span>
          </button>
        </div>
      </div>

      {/* Chart Display */}
      <div className="relative">
        {activeChart === 'tradingview' ? <BitcoinTradingViewChart /> : <BitcoinHighchart />}
      </div>
    </div>
  );
}
