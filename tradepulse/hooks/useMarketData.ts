'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchCryptoData, fetchSecFilings, fetchMarketEvents } from '@/lib/api';
import { CryptoData, SecFiling, MarketEvent } from '@/lib/types';

// Hook for fetching crypto market data
export function useCryptoData() {
  return useQuery<CryptoData[]>({
    queryKey: ['cryptoData'],
    queryFn: fetchCryptoData,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 60 * 1000, // Refetch every minute
    retry: 2,
    refetchOnWindowFocus: false,
  });
}

// Hook for fetching SEC filings
export function useSecFilings() {
  return useQuery<SecFiling[]>({
    queryKey: ['secFilings'],
    queryFn: fetchSecFilings,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    retry: 2,
    refetchOnWindowFocus: false,
  });
}

// Hook for fetching market events
export function useMarketEvents() {
  return useQuery<MarketEvent[]>({
    queryKey: ['marketEvents'],
    queryFn: fetchMarketEvents,
    staleTime: 30 * 60 * 1000, // 30 minutes
    refetchInterval: 30 * 60 * 1000, // Refetch every 30 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

// Get the biggest mover (whale alert) from crypto data
export function useWhaleAlert() {
  const { data: cryptoData, isLoading, error } = useCryptoData();
  
  const whaleAsset = cryptoData?.reduce((max, coin) => {
    const absChange = Math.abs(coin.price_change_percentage_24h);
    const maxAbsChange = Math.abs(max?.price_change_percentage_24h || 0);
    return absChange > maxAbsChange ? coin : max;
  }, cryptoData[0] || null);

  return {
    data: whaleAsset,
    isLoading,
    error,
  };
}

// Hook for filtering significant movers (>10% change)
export function useSignificantMovers() {
  const { data: cryptoData, isLoading, error } = useCryptoData();
  
  const significantMovers = cryptoData?.filter(
    (coin) => Math.abs(coin.price_change_percentage_24h) > 10
  ) || [];

  return {
    data: significantMovers,
    isLoading,
    error,
  };
}
