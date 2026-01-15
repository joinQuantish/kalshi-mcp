/**
 * DFlow Prediction Market Metadata Service
 * Handles market discovery, event data, and pricing information
 *
 * API Reference: https://dev-prediction-markets-api.dflow.net/docs
 * OpenAPI Spec: https://dev-prediction-markets-api.dflow.net/openapi.json
 */

import axios, { AxiosInstance } from 'axios';
import { config } from '../config/index.js';

export interface DFlowEvent {
  ticker: string;
  seriesTicker?: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  volume?: number;
  volume24h?: number;
  liquidity?: number;
  openInterest?: number;
  settlementSources?: Array<{ name: string; url: string }>;
  markets?: DFlowMarket[];
}

export interface DFlowMarket {
  ticker: string;
  eventTicker: string;
  marketType: string;
  title: string;
  subtitle?: string;
  yesSubTitle?: string;
  noSubTitle?: string;
  openTime?: number;
  closeTime?: number;
  expirationTime?: number;
  status: 'active' | 'inactive' | 'finalized';
  volume?: number;
  result?: 'yes' | 'no' | null;
  openInterest?: number;
  canCloseEarly?: boolean;
  earlyCloseCondition?: string;
  rulesPrimary?: string;
  rulesSecondary?: string;
  yesBid?: number | string | null;
  yesAsk?: number | string | null;
  noBid?: number | string | null;
  noAsk?: number | string | null;
  accounts?: {
    [settlementMint: string]: {
      marketLedger: string;
      yesMint: string;
      noMint: string;
      isInitialized: boolean;
      redemptionStatus?: string | null;
    };
  };
}

export interface DFlowSeries {
  ticker: string;
  title: string;
  category: string;
  frequency: string;
}

export interface MarketCandlestick {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface LiveData {
  ticker: string;
  yesPrice: number;
  noPrice: number;
  volume24h: number;
  openInterest: number;
  yesBid?: number | string | null;
  yesAsk?: number | string | null;
  noBid?: number | string | null;
  noAsk?: number | string | null;
  status?: string;
  lastTrade?: {
    price: number;
    size: number;
    timestamp: string;
  };
}

export interface OrderbookData {
  yes_bids: Record<string, number>;
  yes_asks: Record<string, number>;
  no_bids: Record<string, number>;
  no_asks: Record<string, number>;
}

export interface Trade {
  tradeId: string;
  ticker: string;
  price: number;
  count: number;
  yesPrice: number;
  noPrice: number;
  yesPriceDollars: string;
  noPriceDollars: string;
  takerSide: 'yes' | 'no';
  createdTime: number;
}

export class DFlowMarketService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.dflow.metadataApiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  // ============================================
  // EVENTS API
  // ============================================

  /**
   * Get a single event by ticker
   * Correct path: /api/v1/event/{event_id}
   */
  async getEvent(ticker: string): Promise<DFlowEvent> {
    const response = await this.client.get(`/api/v1/event/${ticker}`);
    return response.data;
  }

  /**
   * Get multiple events with optional filters
   */
  async getEvents(params?: {
    category?: string;
    limit?: number;
    cursor?: string;
    withNestedMarkets?: boolean;
    marketStatus?: 'active' | 'inactive' | 'finalized' | 'all';
  }): Promise<{ events: DFlowEvent[]; cursor?: string }> {
    const { marketStatus, limit, ...apiParams } = params || {};
    const requestedLimit = limit || 50;

    const fetchLimit = (marketStatus && marketStatus !== 'all') ? Math.max(200, requestedLimit * 4) : requestedLimit;

    const queryParams = {
      ...apiParams,
      limit: fetchLimit,
      withNestedMarkets: params?.withNestedMarkets ?? true,
    };

    const response = await this.client.get('/api/v1/events', { params: queryParams });
    let events = response.data.events || [];

    if (marketStatus && marketStatus !== 'all') {
      events = events.filter((event: DFlowEvent) =>
        event.markets?.some((market: DFlowMarket) => market.status === marketStatus)
      );
    }

    events = events.slice(0, requestedLimit);

    return { events, cursor: response.data.cursor };
  }

  /**
   * Search events by query
   * Correct path: /api/v1/search
   */
  async searchEvents(query: string, limit: number = 20, marketStatus?: 'active' | 'inactive' | 'finalized' | 'all'): Promise<DFlowEvent[]> {
    try {
      const response = await this.client.get('/api/v1/search', {
        params: { q: query, limit, withNestedMarkets: true },
      });
      let events = response.data.events || [];

      if (marketStatus && marketStatus !== 'all') {
        events = events.filter((e: DFlowEvent) =>
          e.markets?.some((m: DFlowMarket) => m.status === marketStatus)
        );
      }

      return events;
    } catch (error: any) {
      // Fallback to fetching events and filtering client-side
      if (error.response?.status === 404 || error.response?.status === 400) {
        const response = await this.client.get('/api/v1/events', {
          params: { withNestedMarkets: true, limit: 200 },
        });
        let events = response.data.events || [];
        const queryLower = query.toLowerCase();

        events = events.filter((e: DFlowEvent) => {
          const eventMatch =
            e.title?.toLowerCase().includes(queryLower) ||
            e.ticker?.toLowerCase().includes(queryLower) ||
            e.subtitle?.toLowerCase().includes(queryLower) ||
            e.seriesTicker?.toLowerCase().includes(queryLower);

          const marketMatch = e.markets?.some((m: DFlowMarket) =>
            m.title?.toLowerCase().includes(queryLower) ||
            m.ticker?.toLowerCase().includes(queryLower)
          );

          return eventMatch || marketMatch;
        });

        if (marketStatus && marketStatus !== 'all') {
          events = events.filter((e: DFlowEvent) =>
            e.markets?.some((m: DFlowMarket) => m.status === marketStatus)
          );
        }

        return events.slice(0, limit);
      }
      throw error;
    }
  }

  /**
   * Get event candlestick data
   * Correct path: /api/v1/event/{ticker}/candlesticks
   */
  async getEventCandlesticks(ticker: string, params?: {
    resolution?: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
    from?: string;
    to?: string;
  }): Promise<MarketCandlestick[]> {
    const response = await this.client.get(`/api/v1/event/${ticker}/candlesticks`, { params });
    return response.data.candlesticks || [];
  }

  // ============================================
  // MARKETS API
  // ============================================

  /**
   * Get a single market by ticker
   * Correct path: /api/v1/market/{market_id}
   */
  async getMarket(ticker: string): Promise<DFlowMarket | null> {
    try {
      const response = await this.client.get(`/api/v1/market/${ticker}`);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        // Fallback: search through events
        const eventsResponse = await this.client.get('/api/v1/events', {
          params: { withNestedMarkets: true, limit: 100 },
        });

        for (const event of eventsResponse.data.events || []) {
          const found = event.markets?.find((m: DFlowMarket) => m.ticker === ticker);
          if (found) {
            return found;
          }
        }
        return null;
      }
      throw error;
    }
  }

  /**
   * Get market by outcome mint address
   * Correct path: /api/v1/market/by-mint/{mint_address}
   */
  async getMarketByMint(mintAddress: string): Promise<DFlowMarket> {
    const response = await this.client.get(`/api/v1/market/by-mint/${mintAddress}`);
    return response.data;
  }

  /**
   * Get multiple markets
   */
  async getMarkets(params?: {
    eventTicker?: string;
    status?: 'active' | 'inactive' | 'finalized';
    limit?: number;
    cursor?: string;
  }): Promise<{ markets: DFlowMarket[]; cursor?: string }> {
    const response = await this.client.get('/api/v1/markets', { params });
    return response.data;
  }

  /**
   * Get outcome mints for a market
   * Correct path: /api/v1/outcome_mints
   */
  async getOutcomeMints(marketTicker: string): Promise<{
    yes: string;
    no: string;
    settlement: string;
  }> {
    const response = await this.client.get('/api/v1/outcome_mints', {
      params: { marketTicker },
    });
    return response.data;
  }

  /**
   * Filter outcome mints by criteria
   * Correct path: /api/v1/filter_outcome_mints
   */
  async filterOutcomeMints(mints: string[]): Promise<Array<{
    mint: string;
    marketTicker: string;
    side: 'yes' | 'no';
  }>> {
    const response = await this.client.post('/api/v1/filter_outcome_mints', { mints });
    return response.data.results || [];
  }

  /**
   * Get market candlestick data
   * Correct path: /api/v1/market/{ticker}/candlesticks
   */
  async getMarketCandlesticks(ticker: string, params?: {
    resolution?: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
    from?: string;
    to?: string;
  }): Promise<MarketCandlestick[]> {
    const response = await this.client.get(`/api/v1/market/${ticker}/candlesticks`, { params });
    return response.data.candlesticks || [];
  }

  // ============================================
  // ORDERBOOK API
  // ============================================

  /**
   * Get orderbook for a market
   * Path: /api/v1/orderbook/{market_ticker}
   */
  async getOrderbook(marketTicker: string): Promise<OrderbookData> {
    const response = await this.client.get(`/api/v1/orderbook/${marketTicker}`);
    return response.data;
  }

  /**
   * Get orderbook by mint address
   * Path: /api/v1/orderbook/by-mint/{mint_address}
   */
  async getOrderbookByMint(mintAddress: string): Promise<OrderbookData> {
    const response = await this.client.get(`/api/v1/orderbook/by-mint/${mintAddress}`);
    return response.data;
  }

  // ============================================
  // LIVE DATA API
  // Constructs live data from market data
  // ============================================

  /**
   * Get live data for a market
   */
  async getLiveData(marketTicker: string): Promise<LiveData | null> {
    const market = await this.getMarket(marketTicker);

    if (!market) {
      return null;
    }

    const parsePrice = (val: number | string | null | undefined): number => {
      if (val === null || val === undefined) return 0;
      return typeof val === 'string' ? parseFloat(val) : val;
    };

    return {
      ticker: market.ticker,
      yesPrice: parsePrice(market.yesBid) || parsePrice(market.yesAsk) || 0,
      noPrice: parsePrice(market.noBid) || parsePrice(market.noAsk) || 0,
      volume24h: market.volume || 0,
      openInterest: market.openInterest || 0,
      yesBid: market.yesBid,
      yesAsk: market.yesAsk,
      noBid: market.noBid,
      noAsk: market.noAsk,
      status: market.status,
    };
  }

  /**
   * Get live data for an event (all markets)
   */
  async getLiveDataByEvent(eventTicker: string): Promise<LiveData[]> {
    try {
      const event = await this.getEvent(eventTicker);
      const markets = event.markets || [];

      const parsePrice = (val: number | string | null | undefined): number => {
        if (val === null || val === undefined) return 0;
        return typeof val === 'string' ? parseFloat(val) : val;
      };

      return markets.map((market: DFlowMarket) => ({
        ticker: market.ticker,
        yesPrice: parsePrice(market.yesBid) || parsePrice(market.yesAsk) || 0,
        noPrice: parsePrice(market.noBid) || parsePrice(market.noAsk) || 0,
        volume24h: market.volume || 0,
        openInterest: market.openInterest || 0,
        yesBid: market.yesBid,
        yesAsk: market.yesAsk,
        noBid: market.noBid,
        noAsk: market.noAsk,
        status: market.status,
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Get live data by mint address
   */
  async getLiveDataByMint(mintAddress: string): Promise<LiveData | null> {
    try {
      const market = await this.getMarketByMint(mintAddress);

      const parsePrice = (val: number | string | null | undefined): number => {
        if (val === null || val === undefined) return 0;
        return typeof val === 'string' ? parseFloat(val) : val;
      };

      return {
        ticker: market.ticker,
        yesPrice: parsePrice(market.yesBid) || parsePrice(market.yesAsk) || 0,
        noPrice: parsePrice(market.noBid) || parsePrice(market.noAsk) || 0,
        volume24h: market.volume || 0,
        openInterest: market.openInterest || 0,
        yesBid: market.yesBid,
        yesAsk: market.yesAsk,
        noBid: market.noBid,
        noAsk: market.noAsk,
        status: market.status,
      };
    } catch (error) {
      return null;
    }
  }

  // ============================================
  // TRADES API
  // ============================================

  /**
   * Get recent trades
   * Correct path: /api/v1/trades with query params
   */
  async getTrades(params?: {
    marketTicker?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ trades: Trade[]; cursor?: string }> {
    const response = await this.client.get('/api/v1/trades', { params });
    return response.data;
  }

  /**
   * Get trades by mint
   * Correct path: /api/v1/trades/by-mint/{mint_address}
   */
  async getTradesByMint(mintAddress: string, params?: {
    limit?: number;
    cursor?: string;
  }): Promise<{ trades: Trade[]; cursor?: string }> {
    const response = await this.client.get(`/api/v1/trades/by-mint/${mintAddress}`, { params });
    return response.data;
  }

  // ============================================
  // SERIES API
  // ============================================

  /**
   * Get all series templates
   */
  async getSeries(): Promise<DFlowSeries[]> {
    const response = await this.client.get('/api/v1/series');
    return response.data.series || [];
  }

  /**
   * Get series by ticker
   * Correct path: /api/v1/series/{series_ticker}
   */
  async getSeriesByTicker(ticker: string): Promise<DFlowSeries> {
    const response = await this.client.get(`/api/v1/series/${ticker}`);
    return response.data;
  }

  // ============================================
  // TAGS & CATEGORIES API
  // ============================================

  /**
   * Get tags organized by categories
   * Correct path: /api/v1/tags_by_categories
   */
  async getTagsByCategories(): Promise<Record<string, string[]>> {
    const response = await this.client.get('/api/v1/tags_by_categories');
    return response.data.tagsByCategories || response.data;
  }

  /**
   * Get sports filters
   * Correct path: /api/v1/filters_by_sports
   */
  async getSportsFilters(): Promise<any> {
    const response = await this.client.get('/api/v1/filters_by_sports');
    return response.data.filtersBySports || response.data;
  }
}

// Singleton
let marketServiceInstance: DFlowMarketService | null = null;

export function getDFlowMarketService(): DFlowMarketService {
  if (!marketServiceInstance) {
    marketServiceInstance = new DFlowMarketService();
  }
  return marketServiceInstance;
}
