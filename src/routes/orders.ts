/**
 * Order REST API Routes for Kalshi SDK
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getPrismaClient } from '../db/index.js';

const router = Router();

/**
 * GET /api/orders
 * Get orders for authenticated user
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { status, limit = '50', offset = '0' } = req.query;
    const prisma = getPrismaClient();

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const orders = await prisma.order.findMany({
      where: {
        userId,
        ...(status ? { status: status as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    });

    const total = await prisma.order.count({
      where: {
        userId,
        ...(status ? { status: status as any } : {}),
      },
    });

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/orders/:orderId
 * Get a specific order
 */
router.get('/:orderId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { orderId } = req.params;
    const prisma = getPrismaClient();

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        userId,
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    next(error);
  }
});

export default router;


