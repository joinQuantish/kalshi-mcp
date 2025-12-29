/**
 * User REST API Routes for Kalshi SDK
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getPrismaClient } from '../db/index.js';
import { getSolanaWalletService } from '../wallet/solana-wallet.service.js';

const router = Router();

/**
 * GET /api/users/:userId
 * Get user details and wallet status
 */
router.get('/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const prisma = getPrismaClient();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        externalId: true,
        solanaPublicKey: true,
        importedWalletPublicKey: true,
        walletImportedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const walletService = getSolanaWalletService();
    const walletInfo = await walletService.getWalletInfo(userId);

    res.json({
      success: true,
      data: {
        userId: user.id,
        externalId: user.externalId,
        wallet: walletInfo,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/external/:externalId
 * Get user by external ID
 */
router.get('/external/:externalId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { externalId } = req.params;
    const prisma = getPrismaClient();

    const user = await prisma.user.findUnique({
      where: { externalId },
      select: {
        id: true,
        externalId: true,
        solanaPublicKey: true,
        importedWalletPublicKey: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const walletService = getSolanaWalletService();
    const walletInfo = await walletService.getWalletInfo(user.id);

    res.json({
      success: true,
      data: {
        userId: user.id,
        externalId: user.externalId,
        wallet: walletInfo,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/users/:userId/setup-wallet
 * Generate a new Solana wallet for the user
 */
router.post('/:userId/setup-wallet', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    
    const walletService = getSolanaWalletService();
    const existingWallet = await walletService.getWalletInfo(userId);
    
    if (existingWallet) {
      return res.json({
        success: true,
        data: {
          message: 'Wallet already exists',
          wallet: existingWallet,
        },
      });
    }

    const wallet = await walletService.generateWallet(userId);
    
    res.json({
      success: true,
      data: {
        message: 'Solana wallet generated successfully',
        wallet,
        note: 'Fund this address with SOL and USDC to start trading.',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/:userId/balances
 * Get user's wallet balances
 */
router.get('/:userId/balances', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;

    const walletService = getSolanaWalletService();
    const walletInfo = await walletService.getWalletInfo(userId);

    if (!walletInfo) {
      return res.status(404).json({
        success: false,
        error: 'No wallet found'
      });
    }

    const balances = await walletService.getBalances(walletInfo.publicKey);

    res.json({
      success: true,
      data: {
        publicKey: walletInfo.publicKey,
        walletType: walletInfo.type,
        balances,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/:userId/tokens
 * Get all SPL token holdings
 */
router.get('/:userId/tokens', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;

    const walletService = getSolanaWalletService();
    const walletInfo = await walletService.getWalletInfo(userId);

    if (!walletInfo) {
      return res.status(404).json({
        success: false,
        error: 'No wallet found'
      });
    }

    const tokens = await walletService.getAllTokenAccounts(walletInfo.publicKey);

    res.json({
      success: true,
      data: {
        publicKey: walletInfo.publicKey,
        tokens,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;


