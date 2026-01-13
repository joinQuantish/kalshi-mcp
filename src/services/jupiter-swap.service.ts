/**
 * Jupiter Swap Service for Kalshi SDK
 * Handles SOL/Token swaps via Jupiter Aggregator API
 * 
 * This is separate from DFlow - Jupiter is for general token swaps (SOL ↔ USDC)
 * DFlow is specifically for prediction market trading
 * 
 * API Reference: https://station.jup.ag/docs/apis/swap-api
 */

import axios, { AxiosInstance } from 'axios';
import {
  Connection,
  VersionedTransaction,
  PublicKey,
} from '@solana/web3.js';
import { config } from '../config/index.js';
import { getSolanaWalletService } from '../wallet/solana-wallet.service.js';

export interface JupiterQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: 'ExactIn' | 'ExactOut';
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  contextSlot?: number;
  timeTaken?: number;
}

export interface JupiterSwapResponse {
  swapTransaction: string; // Base64 encoded
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
}

export interface SwapQuoteParams {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
  swapMode?: 'ExactIn' | 'ExactOut';
  onlyDirectRoutes?: boolean;
  restrictIntermediateTokens?: boolean;
  maxAccounts?: number;
}

export interface SwapResult {
  quote: JupiterQuote;
  txSignature: string;
  inputAmount: string;
  outputAmount: string;
  priceImpact: string;
  explorerUrl: string;
}

export class JupiterSwapService {
  private client: AxiosInstance;
  private connection: Connection;

  constructor() {
    // OFFICIAL Jupiter API endpoint - requires API key from portal.jup.ag
    // Free tier (Basic) available with 1 RPS
    const jupiterApiKey = process.env.JUPITER_API_KEY;

    if (!jupiterApiKey) {
      console.warn('[Jupiter] No JUPITER_API_KEY set - swap functionality will be disabled');
    }

    this.client = axios.create({
      baseURL: 'https://api.jup.ag/swap/v1',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(jupiterApiKey ? { 'x-api-key': jupiterApiKey } : {}),
      },
    });

    this.connection = new Connection(config.solana.rpcUrl, config.solana.commitment);
  }

  /**
   * Get a swap quote from Jupiter
   */
  async getQuote(params: SwapQuoteParams): Promise<JupiterQuote> {
    const queryParams: Record<string, any> = {
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.amount,
      slippageBps: params.slippageBps || 50, // Default 0.5%
    };

    if (params.swapMode) {
      queryParams.swapMode = params.swapMode;
    }

    if (params.onlyDirectRoutes !== undefined) {
      queryParams.onlyDirectRoutes = params.onlyDirectRoutes;
    }

    if (params.restrictIntermediateTokens !== undefined) {
      queryParams.restrictIntermediateTokens = params.restrictIntermediateTokens;
    }

    if (params.maxAccounts !== undefined) {
      queryParams.maxAccounts = params.maxAccounts;
    }

    const response = await this.client.get('/quote', { params: queryParams });
    return response.data;
  }

  /**
   * Get swap transaction from Jupiter
   */
  async getSwapTransaction(
    quote: JupiterQuote,
    userPublicKey: string,
    options?: {
      wrapAndUnwrapSol?: boolean;
      dynamicComputeUnitLimit?: boolean;
      prioritizationFeeLamports?: number | 'auto';
    }
  ): Promise<JupiterSwapResponse> {
    const response = await this.client.post('/swap', {
      quoteResponse: quote,
      userPublicKey,
      wrapAndUnwrapSol: options?.wrapAndUnwrapSol ?? true,
      dynamicComputeUnitLimit: options?.dynamicComputeUnitLimit ?? true,
      prioritizationFeeLamports: options?.prioritizationFeeLamports ?? 'auto',
    });

    return response.data;
  }

  /**
   * Execute a swap for a user
   */
  async executeSwap(
    userId: string,
    params: SwapQuoteParams,
    password?: string
  ): Promise<SwapResult> {
    const walletService = getSolanaWalletService();
    const walletInfo = await walletService.getWalletInfo(userId);

    if (!walletInfo) {
      throw new Error('No wallet found for user');
    }

    if (walletInfo.type === 'imported' && !password) {
      throw new Error('Password required for imported wallet transactions');
    }

    // Get quote
    const quote = await this.getQuote(params);

    // Get swap transaction
    const swapResponse = await this.getSwapTransaction(quote, walletInfo.publicKey);

    if (!swapResponse.swapTransaction) {
      throw new Error('No swap transaction returned - insufficient liquidity or invalid parameters');
    }

    // Decode the transaction
    const txBuffer = Buffer.from(swapResponse.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(txBuffer);

    // Sign and send
    const txSignature = await walletService.signAndSendTransaction(
      userId,
      transaction,
      password
    );

    return {
      quote,
      txSignature,
      inputAmount: quote.inAmount,
      outputAmount: quote.outAmount,
      priceImpact: quote.priceImpactPct,
      explorerUrl: `https://solscan.io/tx/${txSignature}`,
    };
  }

  /**
   * Helper: Swap SOL to USDC
   */
  async swapSolToUsdc(
    userId: string,
    solAmount: number,
    slippageBps?: number,
    password?: string
  ): Promise<SwapResult> {
    const lamports = Math.floor(solAmount * 1e9); // SOL has 9 decimals
    
    return this.executeSwap(
      userId,
      {
        inputMint: config.tokens.SOL,
        outputMint: config.tokens.USDC,
        amount: lamports,
        slippageBps: slippageBps || 50,
      },
      password
    );
  }

  /**
   * Helper: Swap USDC to SOL
   */
  async swapUsdcToSol(
    userId: string,
    usdcAmount: number,
    slippageBps?: number,
    password?: string
  ): Promise<SwapResult> {
    const microUsdc = Math.floor(usdcAmount * 1e6); // USDC has 6 decimals
    
    return this.executeSwap(
      userId,
      {
        inputMint: config.tokens.USDC,
        outputMint: config.tokens.SOL,
        amount: microUsdc,
        slippageBps: slippageBps || 50,
      },
      password
    );
  }

  /**
   * Get supported tokens list (subset of popular tokens)
   */
  getSupportedTokens() {
    return {
      SOL: {
        symbol: 'SOL',
        mint: config.tokens.SOL,
        decimals: 9,
        name: 'Wrapped SOL',
      },
      USDC: {
        symbol: 'USDC',
        mint: config.tokens.USDC,
        decimals: 6,
        name: 'USD Coin',
      },
      USDT: {
        symbol: 'USDT',
        mint: config.tokens.USDT,
        decimals: 6,
        name: 'Tether USD',
      },
    };
  }
}

// Singleton
let jupiterServiceInstance: JupiterSwapService | null = null;

export function getJupiterSwapService(): JupiterSwapService {
  if (!jupiterServiceInstance) {
    jupiterServiceInstance = new JupiterSwapService();
  }
  return jupiterServiceInstance;
}




