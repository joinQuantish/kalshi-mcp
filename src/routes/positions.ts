/**
 * Position REST API Routes for Kalshi SDK
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getPrismaClient } from '../db/index.js';

const router = Router();

/**
 * GET /api/positions
 * Get positions for authenticated user
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { settled } = req.query;
    const prisma = getPrismaClient();

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const positions = await prisma.position.findMany({
      where: {
        userId,
        ...(settled !== undefined ? { isSettled: settled === 'true' } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({
      success: true,
      data: { positions },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/positions/:positionId
 * Get a specific position
 */
router.get('/:positionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { positionId } = req.params;
    const prisma = getPrismaClient();

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const position = await prisma.position.findFirst({
      where: {
        id: positionId,
        userId,
      },
    });

    if (!position) {
      return res.status(404).json({
        success: false,
        error: 'Position not found'
      });
    }

    res.json({
      success: true,
      data: position,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/positions/market/:marketTicker
 * Get positions for a specific market
 */
router.get('/market/:marketTicker', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { marketTicker } = req.params;
    const prisma = getPrismaClient();

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const positions = await prisma.position.findMany({
      where: {
        userId,
        marketTicker,
      },
    });

    res.json({
      success: true,
      data: { positions },
    });
  } catch (error) {
    next(error);
  }
});

export default router;


