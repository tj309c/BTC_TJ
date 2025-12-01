'use client';

import { useMarketEvents } from '@/hooks/useMarketData';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar, Rocket, DollarSign, TrendingUp, Layers, CalendarDays } from 'lucide-react';
import { MarketEvent } from '@/lib/types';

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-slate-800/50 p-3">
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function getEventIcon(type: MarketEvent['type']) {
  const icons = {
    ipo: <Rocket className="h-4 w-4" />,
    earnings: <DollarSign className="h-4 w-4" />,
    dividend: <TrendingUp className="h-4 w-4" />,
    split: <Layers className="h-4 w-4" />,
    other: <CalendarDays className="h-4 w-4" />,
  };
  return icons[type] || icons.other;
}

function getEventColor(type: MarketEvent['type']): string {
  const colors = {
    ipo: 'border-violet-500/50 text-violet-400 bg-violet-500/10',
    earnings: 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10',
    dividend: 'border-cyan-500/50 text-cyan-400 bg-cyan-500/10',
    split: 'border-amber-500/50 text-amber-400 bg-amber-500/10',
    other: 'border-slate-500/50 text-slate-400 bg-slate-500/10',
  };
  return colors[type] || colors.other;
}

function formatEventDate(dateStr: string): { day: string; month: string; relative: string } {
  const date = new Date(dateStr);
  const now = new Date();
  const diffTime = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  let relative = '';
  if (diffDays === 0) relative = 'Today';
  else if (diffDays === 1) relative = 'Tomorrow';
  else if (diffDays < 7) relative = `In ${diffDays} days`;
  else if (diffDays < 30) relative = `In ${Math.ceil(diffDays / 7)} weeks`;
  else relative = `In ${Math.ceil(diffDays / 30)} months`;

  return {
    day: date.getDate().toString().padStart(2, '0'),
    month: date.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    relative,
  };
}

export function EventCalendar() {
  const { data: events, isLoading, error } = useMarketEvents();

  // Sort events by date
  const sortedEvents = events?.sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  ) || [];

  return (
    <Card className="border-slate-800/50 bg-slate-900/50 backdrop-blur-xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-violet-400" />
            <CardTitle className="text-lg text-slate-100">IPO & Event Calendar</CardTitle>
          </div>
          <Badge variant="outline" className="border-violet-500/50 text-violet-400">
            {sortedEvents.length} Events
          </Badge>
        </div>
        <CardDescription className="text-slate-500">
          Upcoming market events and IPOs
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div className="py-8 text-center text-slate-500">
            <p>Failed to load events. Showing cached results.</p>
          </div>
        ) : (
          <ScrollArea className="h-[320px] pr-4">
            <div className="space-y-3">
              {sortedEvents.map((event) => {
                const { day, month, relative } = formatEventDate(event.date);
                
                return (
                  <div
                    key={event.id}
                    className="group flex gap-4 rounded-lg border border-slate-800/50 bg-slate-800/20 p-4 transition-all hover:border-slate-700 hover:bg-slate-800/40"
                  >
                    {/* Date Badge */}
                    <div className="flex flex-col items-center justify-center rounded-lg bg-slate-800 px-3 py-2 min-w-[60px]">
                      <span className="text-xs font-medium text-slate-500">{month}</span>
                      <span className="text-xl font-bold text-slate-200">{day}</span>
                    </div>
                    
                    {/* Event Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`flex items-center gap-1 ${getEventColor(event.type)}`}>
                          {getEventIcon(event.type)}
                          <span className="capitalize">{event.type}</span>
                        </Badge>
                        <span className="text-xs text-slate-500">{relative}</span>
                      </div>
                      <h4 className="font-medium text-slate-200 truncate group-hover:text-slate-100 transition-colors">
                        {event.title}
                      </h4>
                      {event.company && (
                        <p className="text-sm text-slate-400 truncate mt-0.5">
                          {event.company}
                        </p>
                      )}
                      <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                        {event.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
