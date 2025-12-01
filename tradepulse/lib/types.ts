// Type definitions for market data

export interface CryptoData {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
  total_volume: number;
  market_cap: number;
  sparkline_in_7d?: { price: number[] };
}

export interface SecFiling {
  id: string;
  title: string;
  company: string;
  type: string;
  date: string;
  url: string;
}

export interface MarketEvent {
  id: string;
  title: string;
  date: string;
  type: 'ipo' | 'earnings' | 'dividend' | 'split' | 'other';
  company?: string;
  description: string;
}

export interface NewsItem {
  id: string;
  headline: string;
  source: string;
  datetime: number;
  url: string;
  summary: string;
  category: string;
}
