'use client';

import { useCryptoData } from '@/hooks/useMarketData';
import { formatCurrency, formatVolume, formatPercentage } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TrendingUp, TrendingDown, Sparkles } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import Image from 'next/image';

function SparklineChart({ data, isPositive }: { data: number[]; isPositive: boolean }) {
  const chartData = data.map((price, index) => ({ value: price, index }));
  
  return (
    <div className="h-8 w-20">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={isPositive ? '#34d399' : '#f87171'}
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20 ml-auto" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

export function CryptoTable() {
  const { data: cryptoData, isLoading, error } = useCryptoData();

  // Filter for significant movers (>10% change)
  const significantMovers = cryptoData?.filter(
    (coin) => Math.abs(coin.price_change_percentage_24h) > 10
  ) || [];

  // If no significant movers, show top movers
  const displayData = significantMovers.length > 0 
    ? significantMovers 
    : cryptoData?.slice(0, 15) || [];

  return (
    <Card className="border-slate-800/50 bg-slate-900/50 backdrop-blur-xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-400" />
            <CardTitle className="text-lg text-slate-100">Unusual Crypto Volume</CardTitle>
          </div>
          <Badge variant="outline" className="border-emerald-500/50 text-emerald-400">
            {displayData.length} Assets
          </Badge>
        </div>
        <CardDescription className="text-slate-500">
          Cryptocurrencies with &gt;10% price movement in 24h
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div className="py-8 text-center text-slate-500">
            <p>Failed to load data. Showing cached results.</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400 font-medium">Asset</TableHead>
                  <TableHead className="text-slate-400 font-medium text-right">Price</TableHead>
                  <TableHead className="text-slate-400 font-medium text-right">24h Change</TableHead>
                  <TableHead className="text-slate-400 font-medium text-right">Volume</TableHead>
                  <TableHead className="text-slate-400 font-medium text-center">7d Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayData.map((coin) => {
                  const isPositive = coin.price_change_percentage_24h >= 0;
                  const sparklineData = coin.sparkline_in_7d?.price || [];
                  
                  return (
                    <TableRow 
                      key={coin.id} 
                      className="border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="relative h-8 w-8 overflow-hidden rounded-full bg-slate-800">
                            <Image
                              src={coin.image}
                              alt={coin.name}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          </div>
                          <div>
                            <div className="font-medium text-slate-100">{coin.name}</div>
                            <div className="text-xs uppercase text-slate-500">{coin.symbol}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-200">
                        {formatCurrency(coin.current_price)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className={`flex items-center justify-end gap-1 font-mono font-medium ${
                          isPositive ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {isPositive ? (
                            <TrendingUp className="h-4 w-4" />
                          ) : (
                            <TrendingDown className="h-4 w-4" />
                          )}
                          {formatPercentage(coin.price_change_percentage_24h)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-300">
                        {formatVolume(coin.total_volume)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center">
                          {sparklineData.length > 0 ? (
                            <SparklineChart data={sparklineData} isPositive={isPositive} />
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
