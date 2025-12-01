'use client';

import { useEffect, useState } from 'react';
import { Activity, Clock, Zap } from 'lucide-react';

export function Header() {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      
      // Format time in UTC
      const timeOptions: Intl.DateTimeFormatOptions = {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'UTC',
      };
      
      const dateOptions: Intl.DateTimeFormatOptions = {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      };
      
      setCurrentTime(now.toLocaleTimeString('en-US', timeOptions));
      setCurrentDate(now.toLocaleDateString('en-US', dateOptions));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo & Branding */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute -inset-1 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 opacity-75 blur"></div>
              <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900">
                <Activity className="h-6 w-6 text-emerald-400" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-100">
                TradePulse
              </h1>
              <p className="text-xs text-slate-500">Market Anomaly Dashboard</p>
            </div>
          </div>

          {/* Status Indicators */}
          <div className="hidden items-center gap-6 md:flex">
            <div className="flex items-center gap-2">
              <div className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </div>
              <span className="text-xs font-medium text-slate-400">Live Data</span>
            </div>
            
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-medium text-slate-400">Auto-Refresh</span>
            </div>
          </div>

          {/* UTC Clock */}
          <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-2">
            <Clock className="h-4 w-4 text-cyan-400" />
            <div className="text-right">
              <div className="font-mono text-lg font-semibold tracking-wider text-slate-100">
                {currentTime || '--:--:--'}
              </div>
              <div className="text-xs text-slate-500">
                {currentDate || 'Loading...'} UTC
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
