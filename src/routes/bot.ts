/**
 * Bot/Mobile App Routes for Kalshi SDK
 * Provides streamlined endpoints for mobile app integration
 * 
 * This mirrors the Polymarket Safe wallet flow for Solana:
 * - User authenticates with Privy (gets did:privy:xxx)
 * - POST /api/bot/setup creates user + wallet + API key in one call
 * - Wallet is tied to the Privy ID forever
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getPrismaClient } from '../db/index.js';
import { getApiKeyService } from '../services/apikey.service.js';
import { getSolanaWalletService } from '../wallet/solana-wallet.service.js';

const router = Router();

/**
 * POST /api/bot/setup
 * Complete setup in one call - creates user, wallet, and API key
 * This is the Kalshi equivalent of Polymarket's Safe wallet setup
 * 
 * Body: { externalId: string } (Privy ID like "did:privy:cmhsl09ll...")
 * 
 * Returns: {
 *   userId: string,
 *   externalId: string,
 *   wallet: { publicKey, type, createdAt },
 *   mcpApiKey: string,
 *   mcpApiSecret: string,
 *   status: 'CREATED' | 'EXISTING' | 'READY'
 * }
 */
router.post('/setup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { externalId } = req.body;
    const prisma = getPrismaClient();

    if (!externalId) {
      return res.status(400).json({
        success: false,
        error: 'externalId is required (your Privy ID like did:privy:xxx)'
      });
    }

    const walletService = getSolanaWalletService();
    const apiKeyService = getApiKeyService();

    // Step 1: Find or create user
    let user = await prisma.user.findUnique({
      where: { externalId },
    });

    let status: 'CREATED' | 'EXISTING' | 'READY' = 'EXISTING';
    let isNewUser = false;

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: { externalId },
      });
      status = 'CREATED';
      isNewUser = true;
      console.log(`New user created for ${externalId}: ${user.id}`);
    }

    // Step 2: Check/create wallet
    let walletInfo = await walletService.getWalletInfo(user.id);
    let isNewWallet = false;

    if (!walletInfo) {
      // Generate new Solana wallet
      walletInfo = await walletService.generateWallet(user.id);
      isNewWallet = true;
      console.log(`New wallet generated for ${externalId}: ${walletInfo.publicKey}`);
    }

    // If we have both user and wallet, status is READY
    if (!isNewUser && !isNewWallet) {
      status = 'READY';
    }

    // Step 3: Issue API key for mobile app
    const keyResult = await apiKeyService.createApiKey(user.id, 'Mobile App');

    // Step 4: Log the setup
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: isNewUser ? 'USER_CREATED' : (isNewWallet ? 'WALLET_CREATED' : 'CREDENTIALS_ISSUED'),
        resource: 'setup',
        details: {
          externalId,
          walletPublicKey: walletInfo.publicKey,
          keyPrefix: keyResult.keyPrefix,
          isNewUser,
          isNewWallet,
        },
      },
    });

    // Return complete setup info
    res.json({
      success: true,
      userId: user.id,
      externalId: user.externalId,
      wallet: {
        publicKey: walletInfo.publicKey,
        type: walletInfo.type,
        network: 'solana-mainnet',
      },
      mcpApiKey: keyResult.apiKey,
      mcpApiSecret: keyResult.apiSecret,
      status,
      message: status === 'CREATED' 
        ? 'New account and wallet created. Fund your wallet with SOL and USDC to start trading.'
        : status === 'READY'
          ? 'Account ready. New API key issued.'
          : 'Wallet created for existing account.',
      nextSteps: {
        fundWallet: `Send SOL (for gas) and USDC (for trading) to ${walletInfo.publicKey}`,
        mcpEndpoint: 'https://kalshi-mcp-server-production.up.railway.app/mcp',
        documentation: 'Use x-api-key header with your mcpApiKey for authenticated requests',
      },
    });
  } catch (error) {
    console.error('Setup error:', error);
    next(error);
  }
});

/**
 * POST /api/bot/credentials
 * Get or create credentials for a bot/mobile app
 * 
 * Body: { externalId: string }
 * Returns: { hasWallet, walletPublicKey, mcpApiKey, mcpApiSecret, ... }
 */
router.post('/credentials', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { externalId } = req.body;
    const prisma = getPrismaClient();

    if (!externalId) {
      return res.status(400).json({
        success: false,
        error: 'externalId is required'
      });
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { externalId },
      include: {
        apiKeys: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!user) {
      return res.json({
        hasWallet: false,
        walletPublicKey: null,
        mcpApiKey: null,
        message: 'User not found. Call kalshi_request_api_key first to create an account.'
      });
    }

    // Check wallet status
    const walletService = getSolanaWalletService();
    const walletInfo = await walletService.getWalletInfo(user.id);

    // Generate a new API key for the mobile app
    const apiKeyService = getApiKeyService();
    const keyResult = await apiKeyService.createApiKey(user.id, 'Mobile App');

    // Log this credential fetch
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'BOT_CREDENTIALS_ISSUED',
        resource: 'api_key',
        resourceId: keyResult.keyId,
        details: {
          keyPrefix: keyResult.keyPrefix,
          source: 'mobile_app',
        },
      },
    });

    res.json({
      hasWallet: !!walletInfo,
      walletType: walletInfo?.type || null,
      walletPublicKey: walletInfo?.publicKey || null,
      mcpApiKey: keyResult.apiKey,
      mcpApiSecret: keyResult.apiSecret,
      message: walletInfo 
        ? 'Credentials issued successfully. Save the API key - it cannot be recovered.'
        : 'User exists but wallet not set up. Call kalshi_setup_wallet to create a wallet.'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/bot/credentials/:externalId
 * Check if a user has credentials (without issuing new ones)
 */
router.get('/credentials/:externalId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { externalId } = req.params;
    const prisma = getPrismaClient();

    const user = await prisma.user.findUnique({
      where: { externalId },
      include: {
        apiKeys: {
          where: { isActive: true },
          select: {
            id: true,
            keyPrefix: true,
            name: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      return res.json({
        exists: false,
        hasWallet: false,
      });
    }

    const walletService = getSolanaWalletService();
    const walletInfo = await walletService.getWalletInfo(user.id);

    res.json({
      exists: true,
      hasWallet: !!walletInfo,
      walletType: walletInfo?.type || null,
      walletPublicKey: walletInfo?.publicKey || null,
      activeKeyCount: user.apiKeys.length,
      apiKeyPrefixes: user.apiKeys.map(k => k.keyPrefix),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/bot/balances/:externalId
 * Get wallet balances for a user (public endpoint for display)
 */
router.get('/balances/:externalId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { externalId } = req.params;
    const prisma = getPrismaClient();

    const user = await prisma.user.findUnique({
      where: { externalId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const walletService = getSolanaWalletService();
    const walletInfo = await walletService.getWalletInfo(user.id);

    if (!walletInfo) {
      return res.status(404).json({
        success: false,
        error: 'No wallet found for user'
      });
    }

    const balances = await walletService.getBalances(walletInfo.publicKey);

    res.json({
      success: true,
      publicKey: walletInfo.publicKey,
      walletType: walletInfo.type,
      balances,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/bot/status/:externalId
 * Get complete wallet status for iOS app (like Polymarket's wallet status)
 * 
 * Returns the same structure as Polymarket for consistency:
 * {
 *   externalId, walletAddress, hasWallet, balances, status, isReady
 * }
 */
router.get('/status/:externalId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { externalId } = req.params;
    const prisma = getPrismaClient();

    const user = await prisma.user.findUnique({
      where: { externalId },
      include: {
        apiKeys: {
          where: { isActive: true },
          select: { id: true },
        },
      },
    });

    if (!user) {
      return res.json({
        externalId,
        walletAddress: null,
        hasWallet: false,
        hasApiKey: false,
        status: 'NOT_FOUND',
        isReady: false,
        message: 'User not found. Call POST /api/bot/setup first.',
      });
    }

    const walletService = getSolanaWalletService();
    const walletInfo = await walletService.getWalletInfo(user.id);

    if (!walletInfo) {
      return res.json({
        externalId,
        walletAddress: null,
        hasWallet: false,
        hasApiKey: user.apiKeys.length > 0,
        status: 'NO_WALLET',
        isReady: false,
        message: 'User exists but no wallet. Call POST /api/bot/setup to create one.',
      });
    }

    // Get balances
    const balances = await walletService.getBalances(walletInfo.publicKey);
    
    // Check if wallet is funded
    const hasSol = balances.sol > 0.001; // Enough for gas
    const hasUsdc = balances.usdc > 0;
    
    let status: string;
    let isReady: boolean;
    
    if (!hasSol && !hasUsdc) {
      status = 'NEEDS_FUNDING';
      isReady = false;
    } else if (!hasSol) {
      status = 'NEEDS_SOL';
      isReady = false;
    } else if (!hasUsdc) {
      status = 'NEEDS_USDC';
      isReady = true; // Can still receive, just can't trade
    } else {
      status = 'READY';
      isReady = true;
    }

    res.json({
      externalId,
      walletAddress: walletInfo.publicKey,
      walletType: walletInfo.type,
      hasWallet: true,
      hasApiKey: user.apiKeys.length > 0,
      balances: {
        sol: balances.sol,
        usdc: balances.usdc,
      },
      status,
      isReady,
      message: isReady 
        ? 'Wallet ready for trading'
        : `Wallet needs funding. Send assets to ${walletInfo.publicKey}`,
    });
  } catch (error) {
    next(error);
  }
});

export default router;


