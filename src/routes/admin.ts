/**
 * Admin Routes for Kalshi SDK
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getAccessCodeService } from '../services/accesscode.service.js';
import { getApiKeyService } from '../services/apikey.service.js';
import { getPrismaClient } from '../db/index.js';
import { config } from '../config/index.js';

const router = Router();

// Admin authentication middleware
const adminAuth = (req: Request, res: Response, next: NextFunction) => {
  const adminKey = req.headers['x-admin-key'] as string;
  
  if (!config.admin.apiKey) {
    return res.status(500).json({ error: 'Admin API key not configured' });
  }

  if (!adminKey || adminKey !== config.admin.apiKey) {
    return res.status(401).json({ error: 'Invalid admin API key' });
  }
  
  next();
};

router.use(adminAuth);

// Create access code
router.post('/access-codes', async (req: Request, res: Response) => {
  try {
    const accessCodeService = getAccessCodeService();
    const code = await accessCodeService.createAccessCode({
      ...req.body,
      createdBy: 'admin',
    });
    res.json({ success: true, accessCode: code });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List access codes
router.get('/access-codes', async (req: Request, res: Response) => {
  try {
    const accessCodeService = getAccessCodeService();
    const codes = await accessCodeService.listAccessCodes();
    res.json({ accessCodes: codes });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Revoke access code
router.delete('/access-codes/:codeOrId', async (req: Request, res: Response) => {
  try {
    const accessCodeService = getAccessCodeService();
    const success = await accessCodeService.revokeAccessCode(req.params.codeOrId);
    res.json({ success });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk create access codes
router.post('/access-codes/bulk', async (req: Request, res: Response) => {
  try {
    const { count = 10, ...options } = req.body;
    const accessCodeService = getAccessCodeService();
    
    const codes = [];
    for (let i = 0; i < count; i++) {
      const code = await accessCodeService.createAccessCode({
        ...options,
        createdBy: 'admin',
      });
      codes.push(code);
    }
    
    res.json({ success: true, count: codes.length, accessCodes: codes });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// USER MANAGEMENT & RECOVERY
// ============================================

// Look up user by public key
router.get('/users/by-public-key/:publicKey', async (req: Request, res: Response) => {
  try {
    const prisma = getPrismaClient();
    const { publicKey } = req.params;

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { solanaPublicKey: publicKey },
          { importedWalletPublicKey: publicKey },
        ],
      },
      select: {
        id: true,
        externalId: true,
        solanaPublicKey: true,
        importedWalletPublicKey: true,
        createdAt: true,
        updatedAt: true,
        apiKeys: {
          select: {
            id: true,
            keyPrefix: true,
            name: true,
            isActive: true,
            lastUsedAt: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            orders: true,
            positions: true,
            activityLogs: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get user activity logs
router.get('/users/:userId/activity', async (req: Request, res: Response) => {
  try {
    const prisma = getPrismaClient();
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const logs = await prisma.activityLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json({ logs, count: logs.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Issue new API key for user (wallet recovery)
router.post('/users/:userId/recover-api-key', async (req: Request, res: Response) => {
  try {
    const prisma = getPrismaClient();
    const { userId } = req.params;
    const { keyName, reason } = req.body;

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        externalId: true,
        solanaPublicKey: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create new API key
    const apiKeyService = getApiKeyService();
    const result = await apiKeyService.createApiKey(userId, keyName || 'Recovery Key');

    // Log this admin action
    await prisma.activityLog.create({
      data: {
        userId,
        action: 'ADMIN_API_KEY_RECOVERY',
        resource: 'api_key',
        details: {
          reason: reason || 'User lost API key',
          adminAction: true,
          timestamp: new Date().toISOString(),
        },
      },
    });

    res.json({
      success: true,
      message: 'New API key created for user',
      user: {
        id: user.id,
        externalId: user.externalId,
        publicKey: user.solanaPublicKey,
      },
      newApiKey: {
        apiKey: result.apiKey,
        apiSecret: result.apiSecret,
        keyPrefix: result.keyPrefix,
      },
      warning: 'Deliver this key securely to the user. It cannot be recovered again.',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List all users (with pagination)
router.get('/users', async (req: Request, res: Response) => {
  try {
    const prisma = getPrismaClient();
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          externalId: true,
          solanaPublicKey: true,
          importedWalletPublicKey: true,
          createdAt: true,
          _count: {
            select: {
              orders: true,
              apiKeys: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.user.count(),
    ]);

    res.json({
      users,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + users.length < total,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

