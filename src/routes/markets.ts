/**
 * Market REST API Routes for Kalshi SDK
 * Provides REST access to DFlow market data
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getDFlowMarketService } from '../services/dflow-market.service.js';

const router = Router();
const marketService = getDFlowMarketService();

/**
 * GET /api/markets
 * Get list of markets
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, eventTicker, limit = '20', cursor } = req.query;

    const result = await marketService.getMarkets({
      status: status as any,
      eventTicker: eventTicker as string,
      limit: parseInt(limit as string),
      cursor: cursor as string,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/markets/search
 * Search markets by query
 */
router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q, limit = '10', status } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter "q" is required'
      });
    }

    const events = await marketService.searchEvents(
      q as string,
      parseInt(limit as string),
      status as any
    );

    res.json({
      success: true,
      query: q,
      data: { events },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/markets/events
 * Get list of events (markets are nested inside events)
 */
router.get('/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, marketStatus, limit = '10', cursor } = req.query;

    const result = await marketService.getEvents({
      category: category as string,
      marketStatus: marketStatus as any,
      limit: parseInt(limit as string),
      cursor: cursor as string,
      withNestedMarkets: true,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/markets/categories
 * Get available categories/tags
 */
router.get('/categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await marketService.getTagsByCategories();

    res.json({
      success: true,
      data: categories,
    });
  } catch (error: any) {
    // DFlow might not support this endpoint - return a fallback
    console.error('Categories endpoint error:', error.message);
    res.json({
      success: true,
      data: {
        note: 'Categories endpoint not fully supported by DFlow API',
        suggestedCategories: [
          'Politics',
          'Sports',
          'Economics',
          'Finance',
          'Weather',
          'Entertainment',
          'Technology',
          'Science',
        ],
      },
    });
  }
});

/**
 * GET /api/markets/:ticker
 * Get a specific market
 */
router.get('/:ticker', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ticker } = req.params;

    const market = await marketService.getMarket(ticker);

    if (!market) {
      return res.status(404).json({
        success: false,
        error: 'Market not found'
      });
    }

    res.json({
      success: true,
      data: market,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/markets/:ticker/live
 * Get live pricing data for a market
 */
router.get('/:ticker/live', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ticker } = req.params;

    const liveData = await marketService.getLiveData(ticker);

    if (!liveData) {
      return res.status(404).json({
        success: false,
        error: 'Market not found'
      });
    }

    res.json({
      success: true,
      data: liveData,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/markets/:ticker/trades
 * Get recent trades for a market
 */
router.get('/:ticker/trades', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ticker } = req.params;
    const { limit = '20', cursor } = req.query;

    const trades = await marketService.getTrades(ticker, {
      limit: parseInt(limit as string),
      cursor: cursor as string,
    });

    res.json({
      success: true,
      data: { trades },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/markets/:ticker/candlesticks
 * Get price history for a market
 */
router.get('/:ticker/candlesticks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ticker } = req.params;
    const { resolution = '1h', from, to } = req.query;

    const candlesticks = await marketService.getMarketCandlesticks(ticker, {
      resolution: resolution as any,
      from: from as string,
      to: to as string,
    });

    res.json({
      success: true,
      data: { candlesticks },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/markets/events/:ticker
 * Get a specific event
 */
router.get('/events/:ticker', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ticker } = req.params;

    const event = await marketService.getEvent(ticker);

    res.json({
      success: true,
      data: event,
    });
  } catch (error) {
    next(error);
  }
});

export default router;


