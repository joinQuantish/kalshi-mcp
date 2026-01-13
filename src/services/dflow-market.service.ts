/**
 * DFlow Prediction Market Metadata Service
 * Handles market discovery, event data, and pricing information
 * 
 * API Reference: https://pond.dflow.net/prediction-market-metadata-api-reference/introduction
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
  markets: DFlowMarket[];
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
  status: 'active' | 'inactive' | 'finalized';  // Actual DFlow statuses
  volume?: number;
  result?: 'yes' | 'no' | null;
  openInterest?: number;
  canCloseEarly?: boolean;
  earlyCloseCondition?: string;
  rulesPrimary?: string;
  rulesSecondary?: string;
  yesBid?: number | null;
  yesAsk?: number | null;
  noBid?: number | null;
  noAsk?: number | null;
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
  yesBid?: number | null;
  yesAsk?: number | null;
  noBid?: number | null;
  noAsk?: number | null;
  status?: string;
  lastTrade?: {
    price: number;
    size: number;
    timestamp: string;
  };
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
   */
  async getEvent(ticker: string): Promise<DFlowEvent> {
    const response = await this.client.get(`/api/v1/events/${ticker}`);
    return response.data;
  }

  /**
   * Get multiple events with optional filters
   * Note: Status filtering happens at market level, not event level
   */
  async getEvents(params?: {
    category?: string;
    limit?: number;
    cursor?: string;
    withNestedMarkets?: boolean;
    marketStatus?: 'active' | 'inactive' | 'finalized' | 'all';  // Filter by market status
  }): Promise<{ events: DFlowEvent[]; cursor?: string }> {
    const { marketStatus, limit, ...apiParams } = params || {};
    const requestedLimit = limit || 50;
    
    // When filtering by market status, fetch more to ensure we get enough results after filtering
    const fetchLimit = (marketStatus && marketStatus !== 'all') ? Math.max(200, requestedLimit * 4) : requestedLimit;
    
    // Always include nested markets for full data
    const queryParams = {
      ...apiParams,
      limit: fetchLimit,
      withNestedMarkets: params?.withNestedMarkets ?? true,
    };
    
    const response = await this.client.get('/api/v1/events', { params: queryParams });
    let events = response.data.events || [];
    
    // Filter events by market status if specified
    if (marketStatus && marketStatus !== 'all') {
      events = events.filter((event: DFlowEvent) => 
        event.markets?.some((market: DFlowMarket) => market.status === marketStatus)
      );
    }
    
    // Apply the requested limit after filtering
    events = events.slice(0, requestedLimit);
    
    return { events, cursor: response.data.cursor };
  }

  /**
   * Search events by title or ticker
   * Fetches all events and filters client-side for best results
   * Includes all market statuses (active, inactive, finalized) for discovery
   */
  async searchEvents(query: string, limit: number = 20, marketStatus?: 'active' | 'inactive' | 'finalized' | 'all'): Promise<DFlowEvent[]> {
    try {
      // First try the official search endpoint
      const response = await this.client.get('/api/v1/search/events', {
        params: { q: query, limit, withNestedMarkets: true },
      });
      let events = response.data.events || [];
      
      // Filter by market status if specified
      if (marketStatus && marketStatus !== 'all') {
        events = events.filter((e: DFlowEvent) => 
          e.markets?.some((m: DFlowMarket) => m.status === marketStatus)
        );
      }
      
      return events;
    } catch (error: any) {
      // Fallback to fetching events and filtering client-side
      if (error.response?.status === 404 || error.response?.status === 400) {
        // Fetch a larger batch of events for better search coverage
        const response = await this.client.get('/api/v1/events', {
          params: { withNestedMarkets: true, limit: 200 },
        });
        let events = response.data.events || [];
        const queryLower = query.toLowerCase();
        
        // Search in event title, ticker, subtitle, and market titles
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
        
        // Filter by market status if specified
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
   * Get event forecast percentile history
   */
  async getEventForecastHistory(ticker: string): Promise<any> {
    const response = await this.client.get(`/api/v1/events/${ticker}/forecast-history`);
    return response.data;
  }

  /**
   * Get event candlestick data
   */
  async getEventCandlesticks(ticker: string, params?: {
    resolution?: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
    from?: string;
    to?: string;
  }): Promise<MarketCandlestick[]> {
    const response = await this.client.get(`/api/v1/events/${ticker}/candlesticks`, { params });
    return response.data.candlesticks || [];
  }

  // ============================================
  // MARKETS API
  // ============================================

  /**
   * Get a single market by ticker
   * Note: DFlow API /api/v1/markets/{ticker} returns 404, so we use the list endpoint with filters
   */
  async getMarket(ticker: string): Promise<DFlowMarket | null> {
    // Extract event ticker from market ticker (e.g., "KXFEDDECISION-25DEC-C25" -> "KXFEDDECISION-25DEC")
    const parts = ticker.split('-');
    const eventTicker = parts.length >= 3 ? parts.slice(0, -1).join('-') : ticker;
    
    // Get markets filtered by event ticker
    const response = await this.client.get('/api/v1/markets', {
      params: { eventTicker, limit: 100 },
    });
    
    const markets = response.data.markets || [];
    const market = markets.find((m: DFlowMarket) => m.ticker === ticker);
    
    if (!market) {
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
    
    return market;
  }

  /**
   * Get market by outcome mint address
   */
  async getMarketByMint(mintAddress: string): Promise<DFlowMarket> {
    const response = await this.client.get(`/api/v1/markets/by-mint/${mintAddress}`);
    return response.data;
  }

  /**
   * Get multiple markets
   */
  async getMarkets(params?: {
    eventTicker?: string;
    status?: 'active' | 'inactive' | 'finalized';  // Actual DFlow market statuses
    limit?: number;
    cursor?: string;
  }): Promise<{ markets: DFlowMarket[]; cursor?: string }> {
    const response = await this.client.get('/api/v1/markets', { params });
    return response.data;
  }

  /**
   * Get outcome mints for a market
   */
  async getOutcomeMints(marketTicker: string): Promise<{
    yes: string;
    no: string;
    settlement: string;
  }> {
    const response = await this.client.get(`/api/v1/markets/${marketTicker}/mints`);
    return response.data;
  }

  /**
   * Filter outcome mints by criteria
   */
  async filterOutcomeMints(mints: string[]): Promise<Array<{
    mint: string;
    marketTicker: string;
    side: 'yes' | 'no';
  }>> {
    const response = await this.client.post('/api/v1/markets/filter-mints', { mints });
    return response.data.results || [];
  }

  /**
   * Get market candlestick data
   */
  async getMarketCandlesticks(ticker: string, params?: {
    resolution?: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
    from?: string;
    to?: string;
  }): Promise<MarketCandlestick[]> {
    const response = await this.client.get(`/api/v1/markets/${ticker}/candlesticks`, { params });
    return response.data.candlesticks || [];
  }

  // ============================================
  // LIVE DATA API
  // Note: DFlow /api/v1/live/* endpoints return 404
  // We construct live data from market data instead
  // ============================================

  /**
   * Get live data for a market
   * Since DFlow live endpoints return 404, we get data from market details
   */
  async getLiveData(marketTicker: string): Promise<LiveData | null> {
    const market = await this.getMarket(marketTicker);
    
    if (!market) {
      return null;
    }
    
    // Construct live data from market info
    return {
      ticker: market.ticker,
      yesPrice: market.yesBid || market.yesAsk || 0,
      noPrice: market.noBid || market.noAsk || 0,
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
    // Get markets for this event
    const response = await this.client.get('/api/v1/markets', {
      params: { eventTicker, limit: 100 },
    });
    
    const markets = response.data.markets || [];
    
    return markets.map((market: DFlowMarket) => ({
      ticker: market.ticker,
      yesPrice: market.yesBid || market.yesAsk || 0,
      noPrice: market.noBid || market.noAsk || 0,
      volume24h: market.volume || 0,
      openInterest: market.openInterest || 0,
      yesBid: market.yesBid,
      yesAsk: market.yesAsk,
      noBid: market.noBid,
      noAsk: market.noAsk,
      status: market.status,
    }));
  }

  /**
   * Get live data by mint address
   * Since DFlow live endpoints return 404, we search through events
   */
  async getLiveDataByMint(mintAddress: string): Promise<LiveData | null> {
    // Fetch events and search for the mint
    const response = await this.client.get('/api/v1/events', {
      params: { withNestedMarkets: true, limit: 100 },
    });
    
    for (const event of response.data.events || []) {
      for (const market of event.markets || []) {
        // Check all settlement mints
        if (market.accounts) {
          for (const settlement of Object.values(market.accounts) as any[]) {
            if (settlement.yesMint === mintAddress || settlement.noMint === mintAddress) {
              return {
                ticker: market.ticker,
                yesPrice: market.yesBid || market.yesAsk || 0,
                noPrice: market.noBid || market.noAsk || 0,
                volume24h: market.volume || 0,
                openInterest: market.openInterest || 0,
                yesBid: market.yesBid,
                yesAsk: market.yesAsk,
                noBid: market.noBid,
                noAsk: market.noAsk,
                status: market.status,
              };
            }
          }
        }
      }
    }
    
    return null;
  }

  // ============================================
  // TRADES API
  // ============================================

  /**
   * Get recent trades for a market
   */
  async getTrades(marketTicker: string, params?: {
    limit?: number;
    cursor?: string;
  }): Promise<Array<{
    id: string;
    price: number;
    size: number;
    side: 'buy' | 'sell';
    timestamp: string;
  }>> {
    const response = await this.client.get(`/api/v1/trades/${marketTicker}`, { params });
    return response.data.trades || [];
  }

  /**
   * Get trades by mint
   */
  async getTradesByMint(mintAddress: string, params?: {
    limit?: number;
    cursor?: string;
  }): Promise<any[]> {
    const response = await this.client.get(`/api/v1/trades/by-mint/${mintAddress}`, { params });
    return response.data.trades || [];
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
   */
  async getTagsByCategories(): Promise<Record<string, string[]>> {
    const response = await this.client.get('/api/v1/tags/by-categories');
    return response.data;
  }

  /**
   * Get sports filters
   */
  async getSportsFilters(): Promise<any> {
    const response = await this.client.get('/api/v1/sports/filters');
    return response.data;
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

