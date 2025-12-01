'use client';

import { useSecFilings } from '@/hooks/useMarketData';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, ExternalLink, Building2 } from 'lucide-react';

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-slate-800/50 p-3">
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function getFilingTypeColor(type: string): string {
  const normalizedType = type.toUpperCase();

  // Annual reports (10-K)
  if (normalizedType.includes('10-K')) {
    return 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10';
  }
  // Quarterly reports (10-Q)
  if (normalizedType.includes('10-Q')) {
    return 'border-cyan-500/50 text-cyan-400 bg-cyan-500/10';
  }
  // Current reports (8-K)
  if (normalizedType.includes('8-K')) {
    return 'border-amber-500/50 text-amber-400 bg-amber-500/10';
  }
  // IPO / Registration (S-1, S-3, etc.)
  if (normalizedType.startsWith('S-')) {
    return 'border-violet-500/50 text-violet-400 bg-violet-500/10';
  }
  // Institutional holdings (13F)
  if (normalizedType.includes('13F') || normalizedType.includes('13D') || normalizedType.includes('13G')) {
    return 'border-rose-500/50 text-rose-400 bg-rose-500/10';
  }
  // Insider trading (Form 4, Form 3, Form 5)
  if (normalizedType === '4' || normalizedType === '3' || normalizedType === '5' || normalizedType.includes('FORM 4')) {
    return 'border-blue-500/50 text-blue-400 bg-blue-500/10';
  }
  // Proxy statements (DEF 14A, PRE 14A)
  if (normalizedType.includes('14A') || normalizedType.includes('14C')) {
    return 'border-orange-500/50 text-orange-400 bg-orange-500/10';
  }
  // Prospectus supplements (424B)
  if (normalizedType.includes('424B')) {
    return 'border-pink-500/50 text-pink-400 bg-pink-500/10';
  }
  // Sale of securities (144)
  if (normalizedType === '144') {
    return 'border-purple-500/50 text-purple-400 bg-purple-500/10';
  }
  // Proxy contest materials (PX14A6G)
  if (normalizedType.includes('PX14')) {
    return 'border-teal-500/50 text-teal-400 bg-teal-500/10';
  }

  return 'border-slate-500/50 text-slate-400 bg-slate-500/10';
}

export function SecFeed() {
  const { data: filings, isLoading, error } = useSecFilings();

  return (
    <Card className="border-slate-800/50 bg-slate-900/50 backdrop-blur-xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-cyan-400" />
            <CardTitle className="text-lg text-slate-100">SEC Watch</CardTitle>
          </div>
          <Badge variant="outline" className="border-cyan-500/50 text-cyan-400">
            {filings?.length || 0} Filings
          </Badge>
        </div>
        <CardDescription className="text-slate-500">
          Latest SEC filings and regulatory updates
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div className="py-8 text-center text-slate-500">
            <p>Failed to load filings. Showing cached results.</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {filings?.map((filing) => (
                <a
                  key={filing.id}
                  href={filing.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block rounded-lg border border-slate-800/50 bg-slate-800/20 p-4 transition-all hover:border-slate-700 hover:bg-slate-800/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={getFilingTypeColor(filing.type)}>
                          {filing.type}
                        </Badge>
                        <span className="text-xs text-slate-500">{filing.date}</span>
                      </div>
                      <h4 className="font-medium text-slate-200 truncate group-hover:text-slate-100 transition-colors">
                        {filing.title}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <Building2 className="h-3 w-3 text-slate-500" />
                        <span className="text-sm text-slate-400 truncate">
                          {filing.company}
                        </span>
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0 mt-1" />
                  </div>
                </a>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
