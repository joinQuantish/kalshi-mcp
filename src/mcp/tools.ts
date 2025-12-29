/**
 * MCP Tools for Kalshi SDK
 * All tools for prediction market trading on Solana via DFlow
 * Tool names prefixed with 'kalshi_' to avoid collision with other MCPs
 */

import { getPrismaClient } from '../db/index.js';
import { getApiKeyService } from '../services/apikey.service.js';
import { getAccessCodeService } from '../services/accesscode.service.js';
import { getSolanaWalletService } from '../wallet/solana-wallet.service.js';
import { getDFlowMarketService } from '../services/dflow-market.service.js';
import { getDFlowTradeService } from '../services/dflow-trade.service.js';
import { 
  encryptWalletForImport, 
  verifyWalletImportBundle,
  getWalletExportInstructions,
  WalletImportBundle,
} from '../crypto/wallet-import.js';
import { getEncryptionService } from '../crypto/encryption.js';

export interface ToolContext {
  userId?: string;
}

export const kalshiTools = [
  // ============================================
  // AUTHENTICATION & SETUP
  // ============================================
  {
    name: 'kalshi_signup',
    description: 'Create a new Kalshi account with a fresh Solana wallet. No access code required. Returns API credentials for all future requests.',
    inputSchema: {
      type: 'object',
      properties: {
        externalId: {
          type: 'string',
          description: 'Your unique identifier (e.g., email, telegram:123456, or any unique string)',
        },
        keyName: {
          type: 'string',
          description: 'Optional friendly name for your API key',
        },
      },
      required: ['externalId'],
    },
  },
  {
    name: 'kalshi_request_api_key',
    description: 'Request a new API key for Kalshi trading. Requires an access code from Quantish. Returns credentials for MCP authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        accessCode: {
          type: 'string',
          description: 'Access code from Quantish (format: KALSHI-XXXX-XXXX-XXXX)',
        },
        externalId: {
          type: 'string',
          description: 'Your unique user identifier',
        },
        keyName: {
          type: 'string',
          description: 'Optional friendly name for this API key',
        },
      },
      required: ['accessCode', 'externalId'],
    },
  },
  {
    name: 'kalshi_setup_wallet',
    description: 'Generate a new Solana wallet for Kalshi trading. The private key is encrypted and stored securely.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'kalshi_import_wallet',
    description: 'Import an existing Solana wallet (e.g., from Phantom) for Kalshi trading. Send an encrypted bundle - we never see your raw private key.',
    inputSchema: {
      type: 'object',
      properties: {
        encryptedKey: { type: 'string', description: 'Encrypted private key blob' },
        salt: { type: 'string', description: 'Salt used for encryption' },
        iv: { type: 'string', description: 'IV used for encryption' },
        publicKey: { type: 'string', description: 'Your Solana public key for verification' },
        version: { type: 'string', description: 'Bundle version (default: 1.0)' },
      },
      required: ['encryptedKey', 'salt', 'iv', 'publicKey'],
    },
  },
  {
    name: 'kalshi_get_wallet_import_instructions',
    description: 'Get instructions for how to securely export your Solana wallet from Phantom/Solflare for import into Kalshi.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  // ============================================
  // WALLET INFO
  // ============================================
  {
    name: 'kalshi_get_wallet_info',
    description: 'Get your Kalshi wallet information including Solana public key and type (generated or imported).',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'kalshi_get_balances',
    description: 'Get your SOL and USDC balances for Kalshi trading.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'kalshi_get_token_holdings',
    description: 'Get all SPL token holdings including Kalshi prediction market positions.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  // ============================================
  // MARKET DISCOVERY
  // ============================================
  {
    name: 'kalshi_search_markets',
    description: 'Search for Kalshi prediction markets by keyword via DFlow. Returns markets with pagination support. Default limit is 10 results.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (e.g., "bitcoin", "election", "weather")' },
        limit: { type: 'number', description: 'Max results per page (default 10, max 50)' },
        offset: { type: 'number', description: 'Number of results to skip for pagination (default 0)' },
        marketStatus: { 
          type: 'string', 
          enum: ['active', 'inactive', 'finalized', 'all'],
          description: 'Filter by market status: active (tradeable), inactive (not yet open), finalized (settled), or all (default)'
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'kalshi_get_market',
    description: 'Get details for a specific Kalshi market including prices and outcome mints.',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Kalshi market ticker (e.g., KXSB-26-BUF)' },
      },
      required: ['ticker'],
    },
  },
  {
    name: 'kalshi_get_events',
    description: 'Get list of Kalshi events with optional filters and pagination. Events contain markets which have their own statuses.',
    inputSchema: {
      type: 'object',
      properties: {
        marketStatus: { 
          type: 'string', 
          enum: ['active', 'inactive', 'finalized', 'all'], 
          description: 'Filter events by their market status: active (tradeable), inactive (not yet open), finalized (settled), or all (default)' 
        },
        category: { type: 'string', description: 'Filter by category' },
        limit: { type: 'number', description: 'Max results per page (default 10, max 50)' },
        cursor: { type: 'string', description: 'Pagination cursor from previous response' },
      },
      required: [],
    },
  },
  {
    name: 'kalshi_get_live_data',
    description: 'Get live pricing data for a Kalshi market.',
    inputSchema: {
      type: 'object',
      properties: {
        marketTicker: { type: 'string', description: 'Kalshi market ticker' },
      },
      required: ['marketTicker'],
    },
  },

  // ============================================
  // MARKET INITIALIZATION & STATUS
  // ============================================
  {
    name: 'kalshi_check_market_initialization',
    description: 'Check if a Kalshi market is initialized (tokenized) on-chain. Uninitialized markets require a small SOL fee to be paid on first trade.',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Kalshi market ticker' },
        settlementMint: { 
          type: 'string', 
          description: 'Settlement token mint (default: USDC)',
          default: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        },
      },
      required: ['ticker'],
    },
  },
  {
    name: 'kalshi_initialize_market',
    description: 'Initialize (tokenize) a Kalshi market on-chain. This creates the YES/NO outcome tokens. Requires SOL for the transaction fee. Only needed if market is not yet initialized.',
    inputSchema: {
      type: 'object',
      properties: {
        outcomeMint: { 
          type: 'string', 
          description: 'Either YES or NO outcome mint address for the market (use kalshi_check_market_initialization to get this)' 
        },
        password: { type: 'string', description: 'Password (required for imported wallets only)' },
      },
      required: ['outcomeMint'],
    },
  },
  {
    name: 'kalshi_check_redemption_status',
    description: 'Check if a Kalshi market is settled and positions can be redeemed for stablecoins. Returns winning/losing side and redemption availability.',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Kalshi market ticker' },
        settlementMint: { 
          type: 'string', 
          description: 'Settlement token mint (default: USDC)',
          default: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        },
      },
      required: ['ticker'],
    },
  },
  {
    name: 'kalshi_get_market_by_mint',
    description: 'Look up a Kalshi market by outcome token mint address. Useful when you have a token in your wallet and want to find the associated market.',
    inputSchema: {
      type: 'object',
      properties: {
        mintAddress: { type: 'string', description: 'Outcome token mint address (Solana SPL)' },
      },
      required: ['mintAddress'],
    },
  },

  // ============================================
  // TRADING
  // ============================================
  {
    name: 'kalshi_get_quote',
    description: 'Get a quote for buying/selling Kalshi prediction market tokens via DFlow.',
    inputSchema: {
      type: 'object',
      properties: {
        inputMint: { type: 'string', description: 'Token to spend (USDC mint or outcome token)' },
        outputMint: { type: 'string', description: 'Token to receive (outcome token or USDC)' },
        amount: { type: 'number', description: 'Amount in smallest units (e.g., 1000000 for 1 USDC)' },
        slippageBps: { type: 'number', description: 'Slippage tolerance in basis points (default 100 = 1%)' },
      },
      required: ['inputMint', 'outputMint', 'amount'],
    },
  },
  {
    name: 'kalshi_buy_yes',
    description: 'Buy YES outcome tokens for a Kalshi market.',
    inputSchema: {
      type: 'object',
      properties: {
        marketTicker: { type: 'string', description: 'Kalshi market ticker' },
        yesOutcomeMint: { type: 'string', description: 'YES outcome token mint address (Solana SPL)' },
        usdcAmount: { type: 'number', description: 'Amount of USDC to spend (e.g., 10 for $10)' },
        slippageBps: { type: 'number', description: 'Slippage tolerance (default 100 = 1%)' },
        password: { type: 'string', description: 'Password (required for imported wallets only)' },
      },
      required: ['marketTicker', 'yesOutcomeMint', 'usdcAmount'],
    },
  },
  {
    name: 'kalshi_buy_no',
    description: 'Buy NO outcome tokens for a Kalshi market.',
    inputSchema: {
      type: 'object',
      properties: {
        marketTicker: { type: 'string', description: 'Kalshi market ticker' },
        noOutcomeMint: { type: 'string', description: 'NO outcome token mint address (Solana SPL)' },
        usdcAmount: { type: 'number', description: 'Amount of USDC to spend' },
        slippageBps: { type: 'number', description: 'Slippage tolerance (default 100 = 1%)' },
        password: { type: 'string', description: 'Password (required for imported wallets only)' },
      },
      required: ['marketTicker', 'noOutcomeMint', 'usdcAmount'],
    },
  },
  {
    name: 'kalshi_sell_position',
    description: 'Sell Kalshi outcome tokens back to USDC.',
    inputSchema: {
      type: 'object',
      properties: {
        outcomeMint: { type: 'string', description: 'Outcome token mint to sell' },
        tokenAmount: { type: 'number', description: 'Number of tokens to sell' },
        slippageBps: { type: 'number', description: 'Slippage tolerance (default 100 = 1%)' },
        password: { type: 'string', description: 'Password (required for imported wallets only)' },
      },
      required: ['outcomeMint', 'tokenAmount'],
    },
  },
  {
    name: 'kalshi_redeem_winnings',
    description: 'Redeem winning Kalshi outcome tokens after market settlement.',
    inputSchema: {
      type: 'object',
      properties: {
        outcomeMint: { type: 'string', description: 'Winning outcome token mint' },
        tokenAmount: { type: 'number', description: 'Number of tokens to redeem' },
        password: { type: 'string', description: 'Password (required for imported wallets only)' },
      },
      required: ['outcomeMint', 'tokenAmount'],
    },
  },

  // ============================================
  // POSITIONS & HISTORY
  // ============================================
  {
    name: 'kalshi_get_positions',
    description: 'Get your current Kalshi prediction market positions.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'kalshi_get_orders',
    description: 'Get your Kalshi order history.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['PENDING', 'SUBMITTED', 'FILLED', 'CANCELLED', 'FAILED'] },
        limit: { type: 'number', description: 'Max results' },
      },
      required: [],
    },
  },

  // ============================================
  // API KEY MANAGEMENT
  // ============================================
  {
    name: 'kalshi_list_api_keys',
    description: 'List all your Kalshi API keys (without exposing the actual keys).',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'kalshi_create_additional_api_key',
    description: 'Create an additional API key for your Kalshi account.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Friendly name for this key' },
      },
      required: [],
    },
  },
  {
    name: 'kalshi_revoke_api_key',
    description: 'Revoke one of your Kalshi API keys.',
    inputSchema: {
      type: 'object',
      properties: {
        keyId: { type: 'string', description: 'ID of the key to revoke' },
      },
      required: ['keyId'],
    },
  },

  // ============================================
  // WALLET STATUS & DIAGNOSTICS
  // ============================================
  {
    name: 'kalshi_get_wallet_status',
    description: 'Get comprehensive wallet status including balances, token holdings, and connection health.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'kalshi_get_deposit_address',
    description: 'Get your Solana wallet address for depositing SOL and USDC.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'kalshi_export_private_key',
    description: 'Export your Solana wallet private key. Returns the raw private key for backup. WARNING: Anyone with this key controls your wallet.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'kalshi_import_private_key',
    description: 'Import an existing Solana private key directly (simpler than encrypted import). Creates a new wallet linked to your account.',
    inputSchema: {
      type: 'object',
      properties: {
        externalId: {
          type: 'string',
          description: 'Your unique identifier (e.g., telegram:123456789)',
        },
        privateKey: {
          type: 'string',
          description: 'Base58-encoded Solana private key',
        },
        keyName: {
          type: 'string',
          description: 'Optional friendly name for the API key',
        },
      },
      required: ['externalId', 'privateKey'],
    },
  },
];

/**
 * Execute a tool with context
 */
export async function executeTool(
  name: string,
  args: Record<string, any>,
  context: ToolContext
): Promise<any> {
  const prisma = getPrismaClient();
  const { userId } = context;

  // ============================================
  // UNAUTHENTICATED TOOLS
  // ============================================
  
  if (name === 'kalshi_signup') {
    const { externalId, keyName } = args;

    if (!externalId) {
      throw new Error('externalId is required');
    }

    // Check if user already exists
    let existingUser = await prisma.user.findUnique({
      where: { externalId },
    });

    if (existingUser) {
      throw new Error('User with this externalId already exists. Use a different externalId or use kalshi_request_api_key with an access code.');
    }

    // Create user first (without wallet)
    const newUser = await prisma.user.create({
      data: {
        externalId,
      },
    });

    // Generate wallet for the new user
    const walletService = getSolanaWalletService();
    const walletInfo = await walletService.generateWallet(newUser.id);
    const publicKey = walletInfo.publicKey;

    // Create API key
    const apiKeyService = getApiKeyService();
    const result = await apiKeyService.createApiKey(newUser.id, keyName || 'Default');

    // Log the signup
    await prisma.activityLog.create({
      data: {
        userId: newUser.id,
        action: 'SIGNUP',
        resource: 'user',
        details: {
          timestamp: new Date().toISOString(),
          method: 'self-service',
        },
      },
    });

    return {
      success: true,
      message: 'Account created successfully! Save your API key - it cannot be recovered.',
      apiKey: result.apiKey,
      apiSecret: result.apiSecret,
      walletAddress: publicKey,
      nextSteps: [
        'Save your API key securely - it will not be shown again',
        `Fund your wallet with SOL and USDC: ${publicKey}`,
        'Use your API key in the x-api-key header for all future requests',
      ],
    };
  }

  if (name === 'kalshi_request_api_key') {
    const { accessCode, externalId, keyName } = args;

    // Validate access code
    const accessCodeService = getAccessCodeService();
    const validation = await accessCodeService.validateAndUseAccessCode(accessCode, externalId);
    
    if (!validation.isValid) {
      throw new Error(validation.message);
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { externalId },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { externalId },
      });
    }

    // Create API key
    const apiKeyService = getApiKeyService();
    const result = await apiKeyService.createApiKey(user.id, keyName);

    return {
      message: 'API key created successfully',
      apiKey: result.apiKey,
      apiSecret: result.apiSecret,
      keyPrefix: result.keyPrefix,
      userId: user.id,
      nextSteps: {
        cursorMcp: {
          description: 'Add this to your Cursor MCP config (~/.cursor/mcp.json):',
          config: {
            quantish_kalshi: {
              url: 'https://kalshi-mcp-server-production.up.railway.app/mcp',
              headers: {
                'x-api-key': result.apiKey,
              },
            },
          },
        },
      },
    };
  }

  if (name === 'kalshi_get_wallet_import_instructions') {
    return {
      instructions: getWalletExportInstructions(),
      encryptionExample: `
// Run this in Node.js on YOUR machine (not on our servers)
const crypto = require('crypto');

function encryptWallet(privateKeyBase58, password) {
  const salt = crypto.randomBytes(32);
  const derivedKey = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
  
  let encrypted = cipher.update(privateKeyBase58, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return {
    encryptedKey: encrypted + ':' + authTag,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    publicKey: 'YOUR_PUBLIC_KEY_HERE',
    version: '1.0'
  };
}
`,
    };
  }

  // ============================================
  // PUBLIC READ-ONLY TOOLS (no auth required)
  // ============================================

  if (name === 'kalshi_search_markets') {
    const marketService = getDFlowMarketService();
    const limit = Math.min(args.limit || 10, 50);
    const offset = args.offset || 0;
    
    const allEvents = await marketService.searchEvents(
      args.query, 
      offset + limit + 1,
      args.marketStatus || 'all'
    );
    
    const paginatedEvents = allEvents.slice(offset, offset + limit);
    const hasMore = allEvents.length > offset + limit;
    
    return { 
      events: paginatedEvents,
      pagination: {
        offset,
        limit,
        returned: paginatedEvents.length,
        hasMore,
        nextOffset: hasMore ? offset + limit : null,
      },
      note: 'Markets have statuses: active (tradeable), inactive (not yet open), finalized (settled). Only "active" markets can be traded.',
    };
  }

  if (name === 'kalshi_get_market') {
    const marketService = getDFlowMarketService();
    const market = await marketService.getMarket(args.ticker);
    
    if (!market) {
      return { 
        error: `Market not found: ${args.ticker}`,
        suggestion: 'Use kalshi_search_markets or kalshi_get_events to find valid market tickers',
      };
    }
    
    return { market };
  }

  if (name === 'kalshi_get_events') {
    const marketService = getDFlowMarketService();
    const limit = Math.min(args.limit || 10, 50);
    
    const result = await marketService.getEvents({
      marketStatus: args.marketStatus || 'all',
      category: args.category,
      limit,
      cursor: args.cursor,
      withNestedMarkets: true,
    });
    
    return {
      events: result.events,
      pagination: {
        limit,
        returned: result.events.length,
        cursor: result.cursor || null,
        hasMore: !!result.cursor,
      },
      note: 'Markets have statuses: active (tradeable), inactive (not yet open), finalized (settled). Use cursor for pagination.',
    };
  }

  if (name === 'kalshi_get_live_data') {
    const marketService = getDFlowMarketService();
    const liveData = await marketService.getLiveData(args.marketTicker);
    
    if (!liveData) {
      return { 
        error: `Market not found: ${args.marketTicker}`,
        suggestion: 'Use kalshi_search_markets or kalshi_get_events to find valid market tickers',
      };
    }
    
    return { liveData };
  }

  if (name === 'kalshi_check_market_initialization') {
    const marketService = getDFlowMarketService();
    const result = await marketService.checkMarketInitialization(
      args.ticker,
      args.settlementMint
    );
    return result;
  }

  if (name === 'kalshi_check_redemption_status') {
    const marketService = getDFlowMarketService();
    const result = await marketService.checkRedemptionStatus(args.ticker);
    return result;
  }

  if (name === 'kalshi_get_market_by_mint') {
    const marketService = getDFlowMarketService();
    const market = await marketService.getMarketByOutcomeMint(args.mintAddress);
    
    if (!market) {
      return { 
        error: `No market found for mint: ${args.mintAddress}`,
      };
    }
    
    return { market };
  }

  // ============================================
  // AUTHENTICATED TOOLS
  // ============================================

  if (!userId) {
    throw new Error('Authentication required. Please provide a valid API key.');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // WALLET SETUP
  if (name === 'kalshi_setup_wallet') {
    const walletService = getSolanaWalletService();
    const existingWallet = await walletService.getWalletInfo(userId);
    
    if (existingWallet) {
      return {
        message: 'Wallet already exists',
        wallet: existingWallet,
      };
    }

    const wallet = await walletService.generateWallet(userId);
    return {
      message: 'Solana wallet generated successfully',
      wallet,
      note: 'Your private key is encrypted and stored securely. Fund this address with SOL and USDC to start trading.',
    };
  }

  if (name === 'kalshi_import_wallet') {
    const bundle: WalletImportBundle = {
      encryptedKey: args.encryptedKey,
      salt: args.salt,
      iv: args.iv,
      publicKey: args.publicKey,
      version: args.version || '1.0',
    };

    if (!verifyWalletImportBundle(bundle)) {
      throw new Error('Invalid wallet import bundle format');
    }

    const walletService = getSolanaWalletService();
    const wallet = await walletService.importWallet(userId, bundle);

    return {
      message: 'Wallet imported successfully',
      wallet,
      note: 'You will need to provide your password each time you make a transaction.',
    };
  }

  if (name === 'kalshi_get_wallet_info') {
    const walletService = getSolanaWalletService();
    const wallet = await walletService.getWalletInfo(userId);
    
    if (!wallet) {
      return { message: 'No wallet found. Use kalshi_setup_wallet or kalshi_import_wallet first.' };
    }
    
    return { wallet };
  }

  if (name === 'kalshi_get_balances') {
    const walletService = getSolanaWalletService();
    const wallet = await walletService.getWalletInfo(userId);
    
    if (!wallet) {
      throw new Error('No wallet found');
    }

    const balances = await walletService.getBalances(wallet.publicKey);
    return { 
      publicKey: wallet.publicKey,
      balances,
    };
  }

  if (name === 'kalshi_get_token_holdings') {
    const walletService = getSolanaWalletService();
    const wallet = await walletService.getWalletInfo(userId);
    
    if (!wallet) {
      throw new Error('No wallet found');
    }

    const tokens = await walletService.getAllTokenAccounts(wallet.publicKey);
    return {
      publicKey: wallet.publicKey,
      tokens,
    };
  }

  // MARKET INITIALIZATION (requires auth for tx signing)
  if (name === 'kalshi_initialize_market') {
    const tradeService = getDFlowTradeService();
    
    try {
      const result = await tradeService.initializeMarket(
        userId,
        args.outcomeMint,
        args.password
      );
      
      return {
        success: true,
        txSignature: result.txSignature,
        message: 'Market initialized successfully. The YES/NO outcome tokens are now created on-chain.',
        explorerUrl: `https://solscan.io/tx/${result.txSignature}`,
      };
    } catch (error: any) {
      if (error.message?.includes('already be initialized')) {
        return {
          success: true,
          message: 'Market is already initialized. No action needed.',
        };
      }
      throw error;
    }
  }

  if (name === 'kalshi_check_redemption_status') {
    const marketService = getDFlowMarketService();
    const result = await marketService.checkRedemptionStatus(
      args.ticker,
      args.settlementMint
    );
    return result;
  }

  if (name === 'kalshi_get_market_by_mint') {
    const marketService = getDFlowMarketService();
    const market = await marketService.getMarketByMint(args.mintAddress);
    
    if (!market) {
      return {
        error: 'Market not found for this mint address',
        suggestion: 'This mint may not be a Kalshi outcome token.',
      };
    }
    
    return { market };
  }

  // TRADING
  if (name === 'kalshi_get_quote') {
    const walletService = getSolanaWalletService();
    const wallet = await walletService.getWalletInfo(userId);
    
    if (!wallet) {
      throw new Error('No wallet found');
    }

    const tradeService = getDFlowTradeService();
    const quote = await tradeService.getQuote({
      userPublicKey: wallet.publicKey,
      inputMint: args.inputMint,
      outputMint: args.outputMint,
      amount: args.amount,
      slippageBps: args.slippageBps,
    });

    return { quote };
  }

  if (name === 'kalshi_buy_yes') {
    const tradeService = getDFlowTradeService();
    const result = await tradeService.buyYes(
      userId,
      args.marketTicker,
      args.yesOutcomeMint,
      args.usdcAmount,
      args.slippageBps,
      args.password
    );

    // Log the order
    await prisma.order.create({
      data: {
        userId,
        eventTicker: args.marketTicker,
        marketTicker: args.marketTicker,
        outcomeMint: args.yesOutcomeMint,
        side: 'BUY',
        amount: args.usdcAmount,
        txSignature: result.txSignature,
        status: result.status === 'success' ? 'FILLED' : 'SUBMITTED',
      },
    });

    return {
      message: 'Buy YES order executed',
      ...result,
    };
  }

  if (name === 'kalshi_buy_no') {
    const tradeService = getDFlowTradeService();
    const result = await tradeService.buyNo(
      userId,
      args.marketTicker,
      args.noOutcomeMint,
      args.usdcAmount,
      args.slippageBps,
      args.password
    );

    await prisma.order.create({
      data: {
        userId,
        eventTicker: args.marketTicker,
        marketTicker: args.marketTicker,
        outcomeMint: args.noOutcomeMint,
        side: 'BUY',
        amount: args.usdcAmount,
        txSignature: result.txSignature,
        status: result.status === 'success' ? 'FILLED' : 'SUBMITTED',
      },
    });

    return {
      message: 'Buy NO order executed',
      ...result,
    };
  }

  if (name === 'kalshi_sell_position') {
    const tradeService = getDFlowTradeService();
    const result = await tradeService.sellOutcome(
      userId,
      args.outcomeMint,
      args.tokenAmount,
      args.slippageBps,
      args.password
    );

    await prisma.order.create({
      data: {
        userId,
        eventTicker: 'UNKNOWN',
        marketTicker: 'UNKNOWN',
        outcomeMint: args.outcomeMint,
        side: 'SELL',
        amount: args.tokenAmount,
        txSignature: result.txSignature,
        status: result.status === 'success' ? 'FILLED' : 'SUBMITTED',
      },
    });

    return {
      message: 'Sell order executed',
      ...result,
    };
  }

  if (name === 'kalshi_redeem_winnings') {
    const tradeService = getDFlowTradeService();
    const result = await tradeService.redeemWinnings(
      userId,
      args.outcomeMint,
      args.tokenAmount,
      args.password
    );

    return {
      message: 'Redemption executed',
      ...result,
    };
  }

  // POSITIONS & ORDERS
  if (name === 'kalshi_get_positions') {
    const positions = await prisma.position.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return { positions };
  }

  if (name === 'kalshi_get_orders') {
    const orders = await prisma.order.findMany({
      where: {
        userId,
        ...(args.status ? { status: args.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: args.limit || 50,
    });
    return { orders };
  }

  // API KEY MANAGEMENT
  if (name === 'kalshi_list_api_keys') {
    const apiKeyService = getApiKeyService();
    const keys = await apiKeyService.listApiKeys(userId);
    return { keys };
  }

  if (name === 'kalshi_create_additional_api_key') {
    const apiKeyService = getApiKeyService();
    const result = await apiKeyService.createApiKey(userId, args.name);
    return {
      message: 'Additional API key created',
      apiKey: result.apiKey,
      apiSecret: result.apiSecret,
      keyPrefix: result.keyPrefix,
    };
  }

  if (name === 'kalshi_revoke_api_key') {
    const apiKeyService = getApiKeyService();
    const success = await apiKeyService.revokeApiKey(userId, args.keyId);
    return {
      success,
      message: success ? 'API key revoked' : 'API key not found',
    };
  }

  // WALLET STATUS & DIAGNOSTICS
  if (name === 'kalshi_get_wallet_status') {
    const walletService = getSolanaWalletService();
    const walletInfo = await walletService.getWalletInfo(userId);
    
    if (!walletInfo) {
      return {
        hasWallet: false,
        message: 'No wallet found. Use kalshi_setup_wallet or kalshi_import_wallet first.',
      };
    }

    // Get balances
    const balances = await walletService.getBalances(walletInfo.publicKey);
    
    // Get token holdings
    const tokens = await walletService.getAllTokenAccounts(walletInfo.publicKey);
    
    // Count prediction market tokens (non-USDC, non-SOL)
    const predictionMarketTokens = tokens.filter(t => 
      t.mint !== 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' && // Not USDC
      t.mint !== 'So11111111111111111111111111111111111111112'    // Not SOL
    );

    return {
      hasWallet: true,
      walletType: walletInfo.type,
      publicKey: walletInfo.publicKey,
      balances: {
        sol: balances.sol,
        usdc: balances.usdc,
      },
      predictionMarketTokenCount: predictionMarketTokens.length,
      status: balances.sol > 0.001 && balances.usdc > 0 ? 'READY' : 'NEEDS_FUNDING',
      message: balances.sol < 0.001 
        ? 'Low SOL balance - need SOL for transaction fees'
        : balances.usdc === 0 
          ? 'No USDC balance - deposit USDC to start trading'
          : 'Wallet ready for trading',
    };
  }

  if (name === 'kalshi_get_deposit_address') {
    const walletService = getSolanaWalletService();
    const walletInfo = await walletService.getWalletInfo(userId);
    
    if (!walletInfo) {
      return {
        error: 'No wallet found. Use kalshi_setup_wallet or kalshi_import_wallet first.',
      };
    }

    return {
      publicKey: walletInfo.publicKey,
      walletType: walletInfo.type,
      network: 'Solana Mainnet',
      acceptedTokens: [
        { name: 'SOL', description: 'For transaction fees', mint: 'Native SOL' },
        { name: 'USDC', description: 'For trading', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
      ],
      instructions: `Send SOL and USDC to: ${walletInfo.publicKey}`,
    };
  }

  // PRIVATE KEY EXPORT/IMPORT
  if (name === 'kalshi_export_private_key') {
    const walletService = getSolanaWalletService();
    const walletInfo = await walletService.getWalletInfo(userId);
    
    if (!walletInfo) {
      throw new Error('No wallet found');
    }
    
    if (walletInfo.type === 'imported') {
      return {
        error: 'Cannot export imported wallet',
        message: 'Imported wallets are encrypted with your password. We never have access to your private key.',
      };
    }
    
    // Get the private key for generated wallets
    const keypair = await walletService.getKeypairForSigning(userId);
    const privateKeyBase58 = require('bs58').encode(keypair.secretKey);
    
    // Log this sensitive action
    await prisma.activityLog.create({
      data: {
        userId,
        action: 'PRIVATE_KEY_EXPORT',
        resource: 'wallet',
        details: {
          timestamp: new Date().toISOString(),
          note: 'Raw private key exported',
        },
      },
    });
    
    return {
      privateKey: privateKeyBase58,
      publicKey: walletInfo.publicKey,
      warning: '⚠️ SECURITY WARNING: Anyone with this private key controls your wallet. Store it securely and never share it.',
    };
  }

  if (name === 'kalshi_import_private_key') {
    const { externalId, privateKey, keyName } = args;
    
    if (!externalId) {
      throw new Error('externalId is required');
    }
    
    if (!privateKey) {
      throw new Error('privateKey is required');
    }
    
    // Validate private key format (base58)
    let keypair;
    try {
      const bs58 = require('bs58');
      const privateKeyBytes = bs58.decode(privateKey);
      const { Keypair } = require('@solana/web3.js');
      keypair = Keypair.fromSecretKey(privateKeyBytes);
    } catch (e) {
      throw new Error('Invalid private key format. Must be Base58-encoded Solana private key.');
    }
    
    const publicKey = keypair.publicKey.toBase58();
    
    // Check if user already exists
    let existingUser = await prisma.user.findUnique({
      where: { externalId },
    });
    
    if (existingUser) {
      throw new Error('User with this externalId already exists. Use a different externalId.');
    }
    
    // Create user with wallet
    const encryption = getEncryptionService();
    const encryptedPrivateKey = encryption.encrypt(privateKey);
    
    const newUser = await prisma.user.create({
      data: {
        externalId,
        solanaPublicKey: publicKey,
        encryptedPrivateKey,
      },
    });
    
    // Create API key
    const apiKeyService = getApiKeyService();
    const keyResult = await apiKeyService.createApiKey(newUser.id, keyName || 'Imported Wallet');
    
    // Log the import
    await prisma.activityLog.create({
      data: {
        userId: newUser.id,
        action: 'PRIVATE_KEY_IMPORT',
        resource: 'wallet',
        details: {
          timestamp: new Date().toISOString(),
          keyName: keyName || 'Imported Wallet',
        },
      },
    });
    
    return {
      success: true,
      apiKey: keyResult.apiKey,
      apiSecret: keyResult.apiSecret,
      publicKey,
      message: 'Private key imported successfully. Save your API key - it cannot be recovered!',
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}
