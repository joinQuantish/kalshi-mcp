/**
 * DFlow Trade API Service
 * Handles order creation, execution, and status tracking
 * 
 * API Reference: https://pond.dflow.net/swap-api-reference/order/order
 */

import axios, { AxiosInstance } from 'axios';
import { 
  Connection, 
  Transaction, 
  VersionedTransaction,
  PublicKey,
} from '@solana/web3.js';
import { config } from '../config/index.js';
import { getSolanaWalletService } from '../wallet/solana-wallet.service.js';

export interface OrderQuote {
  contextSlot: number;
  executionMode: 'sync' | 'async';
  inAmount: string;
  inputMint: string;
  minOutAmount: string;
  otherAmountThreshold: string;
  outAmount: string;
  outputMint: string;
  priceImpactPct: string;
  slippageBps: number;
  computeUnitLimit?: number;
  lastValidBlockHeight?: number;
  platformFee?: {
    amount: string;
    feeBps: number;
  } | null;
  prioritizationFeeLamports?: number;
  routePlan?: Array<{
    data: string;
    inAmount: string;
    inputMint: string;
    inputMintDecimals: number;
    marketKey: string;
    outAmount: string;
    outputMint: string;
    outputMintDecimals: number;
    venue: string;
  }>;
  transaction?: string; // Base64 encoded transaction
}

export interface OrderStatus {
  orderId: string;
  status: 'pending' | 'submitted' | 'filled' | 'partially_filled' | 'cancelled' | 'failed';
  filledAmount?: string;
  remainingAmount?: string;
  txSignature?: string;
  error?: string;
}

export interface TradeParams {
  userPublicKey: string;
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
  platformFeeBps?: number;
  feeAccount?: string;
  destinationWallet?: string;
  wrapAndUnwrapSol?: boolean;
  onlyDirectRoutes?: boolean;
  maxRouteLength?: number;
}

export class DFlowTradeService {
  private client: AxiosInstance;
  private connection: Connection;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 500; // 500ms between requests to avoid 429

  constructor() {
    this.client = axios.create({
      baseURL: config.dflow.apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    // Add retry interceptor for rate limiting
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : 2000;
          console.log(`Rate limited, waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.client.request(error.config);
        }
        throw error;
      }
    );
    
    this.connection = new Connection(config.solana.rpcUrl, config.solana.commitment);
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Get a quote for a trade (includes transaction if user public key provided)
   */
  async getQuote(params: TradeParams): Promise<OrderQuote> {
    await this.throttle(); // Rate limit protection
    
    const queryParams: Record<string, any> = {
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.amount,
      slippageBps: params.slippageBps || 100, // Default 1%
    };

    if (params.userPublicKey) {
      queryParams.userPublicKey = params.userPublicKey;
    }

    if (params.platformFeeBps) {
      queryParams.platformFeeBps = params.platformFeeBps;
    }

    if (params.feeAccount) {
      queryParams.feeAccount = params.feeAccount;
    }

    if (params.destinationWallet) {
      queryParams.destinationWallet = params.destinationWallet;
    }

    if (params.wrapAndUnwrapSol !== undefined) {
      queryParams.wrapAndUnwrapSol = params.wrapAndUnwrapSol;
    }

    if (params.onlyDirectRoutes !== undefined) {
      queryParams.onlyDirectRoutes = params.onlyDirectRoutes;
    }

    if (params.maxRouteLength !== undefined) {
      queryParams.maxRouteLength = params.maxRouteLength;
    }

    const response = await this.client.get('/order', { params: queryParams });
    return response.data;
  }

  /**
   * Get order status
   */
  async getOrderStatus(orderId: string): Promise<OrderStatus> {
    const response = await this.client.get(`/order/${orderId}/status`);
    return response.data;
  }

  /**
   * Execute a trade for a user
   * 
   * For generated wallets: automatically signs and submits
   * For imported wallets: requires password parameter
   */
  async executeTrade(
    userId: string,
    params: Omit<TradeParams, 'userPublicKey'>,
    password?: string // Required for imported wallets
  ): Promise<{
    quote: OrderQuote;
    txSignature: string;
    status: 'success' | 'pending';
  }> {
    const walletService = getSolanaWalletService();
    const walletInfo = await walletService.getWalletInfo(userId);

    if (!walletInfo) {
      throw new Error('No wallet found for user');
    }

    // Check if imported wallet requires password
    if (walletInfo.type === 'imported' && !password) {
      throw new Error('Password required for imported wallet transactions');
    }

    // Get quote with transaction
    const quote = await this.getQuote({
      ...params,
      userPublicKey: walletInfo.publicKey,
    });

    if (!quote.transaction) {
      throw new Error('No transaction returned from quote - insufficient liquidity or invalid parameters');
    }

    // Decode and sign the transaction
    const txBuffer = Buffer.from(quote.transaction, 'base64');
    
    let transaction: Transaction | VersionedTransaction;
    
    // Try to parse as VersionedTransaction first, fall back to legacy Transaction
    try {
      transaction = VersionedTransaction.deserialize(txBuffer);
    } catch {
      transaction = Transaction.from(txBuffer);
    }

    // Sign and send
    const txSignature = await walletService.signAndSendTransaction(
      userId,
      transaction,
      password
    );

    return {
      quote,
      txSignature,
      status: quote.executionMode === 'sync' ? 'success' : 'pending',
    };
  }

  /**
   * Buy YES outcome tokens for a market
   */
  async buyYes(
    userId: string,
    marketTicker: string,
    yesOutcomeMint: string,
    usdcAmount: number,
    slippageBps?: number,
    password?: string
  ) {
    return this.executeTrade(
      userId,
      {
        inputMint: config.tokens.USDC,
        outputMint: yesOutcomeMint,
        amount: usdcAmount * 1e6, // USDC has 6 decimals
        slippageBps,
      },
      password
    );
  }

  /**
   * Buy NO outcome tokens for a market
   */
  async buyNo(
    userId: string,
    marketTicker: string,
    noOutcomeMint: string,
    usdcAmount: number,
    slippageBps?: number,
    password?: string
  ) {
    return this.executeTrade(
      userId,
      {
        inputMint: config.tokens.USDC,
        outputMint: noOutcomeMint,
        amount: usdcAmount * 1e6,
        slippageBps,
      },
      password
    );
  }

  /**
   * Sell outcome tokens back to USDC
   */
  async sellOutcome(
    userId: string,
    outcomeMint: string,
    tokenAmount: number,
    slippageBps?: number,
    password?: string
  ) {
    return this.executeTrade(
      userId,
      {
        inputMint: outcomeMint,
        outputMint: config.tokens.USDC,
        amount: tokenAmount,
        slippageBps,
      },
      password
    );
  }

  /**
   * Redeem winning outcome tokens after market settlement
   */
  async redeemWinnings(
    userId: string,
    outcomeMint: string,
    tokenAmount: number,
    password?: string
  ) {
    // For redemption, we swap winning tokens back to USDC
    // DFlow handles the redemption routing automatically
    return this.executeTrade(
      userId,
      {
        inputMint: outcomeMint,
        outputMint: config.tokens.USDC,
        amount: tokenAmount,
        slippageBps: 10, // Very low slippage for redemptions
      },
      password
    );
  }

  /**
   * Get swap instructions without executing (for custom signing flows)
   */
  async getSwapInstructions(params: TradeParams): Promise<{
    instructions: any[];
    lookupTables: string[];
    computeUnits: number;
  }> {
    const response = await this.client.post('/swap/instructions', params);
    return response.data;
  }

  /**
   * Submit an intent-based swap (declarative mode)
   */
  async submitIntentSwap(params: TradeParams & {
    deadline?: number;
  }): Promise<{
    intentId: string;
    status: 'submitted' | 'filling' | 'filled' | 'expired';
  }> {
    const response = await this.client.post('/intent/swap', params);
    return response.data;
  }
}

// Singleton
let tradeServiceInstance: DFlowTradeService | null = null;

export function getDFlowTradeService(): DFlowTradeService {
  if (!tradeServiceInstance) {
    tradeServiceInstance = new DFlowTradeService();
  }
  return tradeServiceInstance;
}

