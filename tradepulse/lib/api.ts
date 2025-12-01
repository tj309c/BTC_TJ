// API functions that fetch REAL data from backend server
// NO mock data - all data comes from actual APIs

import { CryptoData, SecFiling, MarketEvent, NewsItem } from './types';

// Backend API base URL - the Python server that has access to API keys
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export async function fetchCryptoData(): Promise<CryptoData[]> {
  try {
    // Try backend first (has caching and rate limit handling)
    const response = await fetch(`${API_BASE_URL}/api/crypto`, {
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (response.ok) {
      return await response.json();
    }

    // Fallback: Direct CoinGecko call (public API, no key needed)
    const cgResponse = await fetch(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=price_change_percentage_24h_desc&per_page=50&page=1&sparkline=true&price_change_percentage=24h',
      {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 60 },
      }
    );

    if (cgResponse.ok) {
      const data = await cgResponse.json();
      const significantMovers = data.filter(
        (coin: CryptoData) => Math.abs(coin.price_change_percentage_24h) > 10
      );
      return significantMovers.length > 0 ? significantMovers : data.slice(0, 15);
    }

    console.warn('Failed to fetch crypto data from all sources');
    return [];
  } catch (error) {
    console.warn('Crypto fetch error:', error);
    return [];
  }
}

export async function fetchSecFilings(): Promise<SecFiling[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/sec-filings`, {
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (response.ok) {
      return await response.json();
    }

    console.warn('Failed to fetch SEC filings');
    return [];
  } catch (error) {
    console.warn('SEC filings fetch error:', error);
    return [];
  }
}

export async function fetchMarketEvents(): Promise<MarketEvent[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/events`, {
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (response.ok) {
      return await response.json();
    }

    console.warn('Failed to fetch market events');
    return [];
  } catch (error) {
    console.warn('Market events fetch error:', error);
    return [];
  }
}

export async function fetchNews(): Promise<NewsItem[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/news`, {
      next: { revalidate: 120 }, // Cache for 2 minutes
    });

    if (response.ok) {
      return await response.json();
    }

    console.warn('Failed to fetch news');
    return [];
  } catch (error) {
    console.warn('News fetch error:', error);
    return [];
  }
}

// Format helpers
export function formatCurrency(value: number): string {
  if (value >= 1) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  // For very small values (like meme coins)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(value);
}

export function formatVolume(value: number): string {
  if (value >= 1e12) {
    return `$${(value / 1e12).toFixed(2)}T`;
  }
  if (value >= 1e9) {
    return `$${(value / 1e9).toFixed(2)}B`;
  }
  if (value >= 1e6) {
    return `$${(value / 1e6).toFixed(2)}M`;
  }
  return `$${value.toLocaleString()}`;
}

export function formatPercentage(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatMarketCap(value: number): string {
  if (value >= 1e12) {
    return `$${(value / 1e12).toFixed(2)}T`;
  }
  if (value >= 1e9) {
    return `$${(value / 1e9).toFixed(2)}B`;
  }
  if (value >= 1e6) {
    return `$${(value / 1e6).toFixed(2)}M`;
  }
  return `$${value.toLocaleString()}`;
}

export function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
