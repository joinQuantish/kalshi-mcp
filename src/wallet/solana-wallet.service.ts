/**
 * Solana Wallet Service for Kalshi SDK
 * Handles wallet generation, storage, and transaction signing
 */

import { 
  Keypair, 
  PublicKey, 
  Connection, 
  Transaction,
  VersionedTransaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  SystemProgram,
} from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  getAccount, 
  TOKEN_PROGRAM_ID,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { config } from '../config/index.js';
import { getEncryptionService } from '../crypto/encryption.js';
import { 
  WalletImportBundle, 
  decryptImportedWallet, 
  verifyWalletImportBundle 
} from '../crypto/wallet-import.js';
import { getPrismaClient } from '../db/index.js';

export interface WalletInfo {
  publicKey: string;
  type: 'generated' | 'imported';
  createdAt: Date;
}

export interface WalletBalances {
  sol: number;
  usdc: number;
  tokens: Record<string, number>;
}

export class SolanaWalletService {
  private connection: Connection;
  private fallbackConnection: Connection | null = null;

  constructor() {
    this.connection = new Connection(config.solana.rpcUrl, config.solana.commitment);
    
    if (config.solana.rpcFallback) {
      this.fallbackConnection = new Connection(config.solana.rpcFallback, config.solana.commitment);
    }
  }

  /**
   * Generate a new Solana wallet for a user
   */
  async generateWallet(userId: string): Promise<WalletInfo> {
    const prisma = getPrismaClient();
    const encryption = getEncryptionService();

    // Generate new keypair
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toBase58();
    const privateKeyBase58 = bs58.encode(keypair.secretKey);

    // Encrypt the private key for storage
    const encryptedPrivateKey = encryption.encrypt(privateKeyBase58);

    // Store in database
    await prisma.user.update({
      where: { id: userId },
      data: {
        solanaPublicKey: publicKey,
        encryptedPrivateKey: encryptedPrivateKey,
      },
    });

    return {
      publicKey,
      type: 'generated',
      createdAt: new Date(),
    };
  }

  /**
   * Import an existing wallet using encrypted bundle
   */
  async importWallet(
    userId: string,
    bundle: WalletImportBundle
  ): Promise<WalletInfo> {
    const prisma = getPrismaClient();

    // Verify bundle format
    if (!verifyWalletImportBundle(bundle)) {
      throw new Error('Invalid wallet import bundle');
    }

    // Check if this public key is already registered
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { solanaPublicKey: bundle.publicKey },
          { importedWalletPublicKey: bundle.publicKey },
        ],
      },
    });

    if (existingUser && existingUser.id !== userId) {
      throw new Error('This wallet is already registered to another user');
    }

    // Store the encrypted bundle (we cannot decrypt it without user's password)
    await prisma.user.update({
      where: { id: userId },
      data: {
        importedWalletPublicKey: bundle.publicKey,
        importedWalletEncrypted: bundle.encryptedKey,
        importedWalletSalt: `${bundle.salt}:${bundle.iv}:${bundle.version}`,
        walletImportedAt: new Date(),
      },
    });

    return {
      publicKey: bundle.publicKey,
      type: 'imported',
      createdAt: new Date(),
    };
  }

  /**
   * Get wallet info for a user
   */
  async getWalletInfo(userId: string): Promise<WalletInfo | null> {
    const prisma = getPrismaClient();
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        solanaPublicKey: true,
        importedWalletPublicKey: true,
        walletImportedAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      return null;
    }

    // Prefer imported wallet if both exist
    if (user.importedWalletPublicKey) {
      return {
        publicKey: user.importedWalletPublicKey,
        type: 'imported',
        createdAt: user.walletImportedAt || user.createdAt,
      };
    }

    if (user.solanaPublicKey) {
      return {
        publicKey: user.solanaPublicKey,
        type: 'generated',
        createdAt: user.createdAt,
      };
    }

    return null;
  }

  /**
   * Get wallet balances
   */
  async getBalances(publicKey: string): Promise<WalletBalances> {
    const pubkey = new PublicKey(publicKey);
    
    // Get SOL balance
    const solBalance = await this.connection.getBalance(pubkey);
    
    // Get USDC balance
    let usdcBalance = 0;
    try {
      const usdcMint = new PublicKey(config.tokens.USDC);
      const usdcAta = await getAssociatedTokenAddress(usdcMint, pubkey);
      const usdcAccount = await getAccount(this.connection, usdcAta);
      usdcBalance = Number(usdcAccount.amount) / 1e6; // USDC has 6 decimals
    } catch {
      // No USDC account exists yet
    }

    return {
      sol: solBalance / LAMPORTS_PER_SOL,
      usdc: usdcBalance,
      tokens: {},
    };
  }

  /**
   * Get keypair for signing (for generated wallets)
   */
  async getKeypairForSigning(userId: string): Promise<Keypair> {
    const prisma = getPrismaClient();
    const encryption = getEncryptionService();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { encryptedPrivateKey: true },
    });

    if (!user?.encryptedPrivateKey) {
      throw new Error('No generated wallet found for this user. Use importedWallet signing for imported wallets.');
    }

    const privateKeyBase58 = encryption.decrypt(user.encryptedPrivateKey);
    const privateKeyBytes = bs58.decode(privateKeyBase58);
    return Keypair.fromSecretKey(privateKeyBytes);
  }

  /**
   * Get keypair for signing (for imported wallets - requires password)
   */
  async getImportedWalletKeypair(userId: string, password: string): Promise<Keypair> {
    const prisma = getPrismaClient();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        importedWalletPublicKey: true,
        importedWalletEncrypted: true,
        importedWalletSalt: true,
      },
    });

    if (!user?.importedWalletEncrypted || !user?.importedWalletSalt) {
      throw new Error('No imported wallet found for this user');
    }

    // Reconstruct the bundle
    const [salt, iv, version] = user.importedWalletSalt.split(':');
    const bundle: WalletImportBundle = {
      encryptedKey: user.importedWalletEncrypted,
      salt,
      iv,
      publicKey: user.importedWalletPublicKey!,
      version: version || '1.0',
    };

    // Decrypt with user's password
    const { keypair } = decryptImportedWallet(bundle, password);
    return keypair;
  }

  /**
   * Sign and send a transaction
   */
  async signAndSendTransaction(
    userId: string,
    transaction: Transaction | VersionedTransaction,
    password?: string // Required for imported wallets
  ): Promise<string> {
    const walletInfo = await this.getWalletInfo(userId);
    
    if (!walletInfo) {
      throw new Error('No wallet found for user');
    }

    let keypair: Keypair;
    
    if (walletInfo.type === 'imported') {
      if (!password) {
        throw new Error('Password required for imported wallet transactions');
      }
      keypair = await this.getImportedWalletKeypair(userId, password);
    } else {
      keypair = await this.getKeypairForSigning(userId);
    }

    try {
      if (transaction instanceof VersionedTransaction) {
        transaction.sign([keypair]);
        const signature = await this.connection.sendTransaction(transaction);
        await this.connection.confirmTransaction(signature, 'confirmed');
        return signature;
      } else {
        const signature = await sendAndConfirmTransaction(
          this.connection,
          transaction,
          [keypair],
          { commitment: 'confirmed' }
        );
        return signature;
      }
    } finally {
      // Clear keypair from memory
      keypair.secretKey.fill(0);
    }
  }

  /**
   * Get SPL token balance for a specific mint
   */
  async getTokenBalance(publicKey: string, mintAddress: string): Promise<number> {
    try {
      const pubkey = new PublicKey(publicKey);
      const mint = new PublicKey(mintAddress);
      const ata = await getAssociatedTokenAddress(mint, pubkey);
      const account = await getAccount(this.connection, ata);
      return Number(account.amount);
    } catch {
      return 0;
    }
  }

  /**
   * Get all SPL token accounts for a wallet
   */
  async getAllTokenAccounts(publicKey: string): Promise<Array<{
    mint: string;
    balance: string;
    decimals: number;
  }>> {
    const pubkey = new PublicKey(publicKey);
    
    const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
      pubkey,
      { programId: TOKEN_PROGRAM_ID }
    );

    return tokenAccounts.value.map((account) => {
      const parsed = account.account.data.parsed.info;
      return {
        mint: parsed.mint,
        balance: parsed.tokenAmount.amount,
        decimals: parsed.tokenAmount.decimals,
      };
    });
  }

  /**
   * Get connection for external use
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Send SOL to another wallet
   */
  async sendSol(
    userId: string,
    toAddress: string,
    solAmount: number,
    password?: string
  ): Promise<{
    txSignature: string;
    fromAddress: string;
    toAddress: string;
    amount: number;
    explorerUrl: string;
  }> {
    const walletInfo = await this.getWalletInfo(userId);
    
    if (!walletInfo) {
      throw new Error('No wallet found for user');
    }

    if (walletInfo.type === 'imported' && !password) {
      throw new Error('Password required for imported wallet transactions');
    }

    // Validate destination address
    let toPubkey: PublicKey;
    try {
      toPubkey = new PublicKey(toAddress);
    } catch {
      throw new Error('Invalid Solana address');
    }

    const fromPubkey = new PublicKey(walletInfo.publicKey);
    const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

    // Check balance
    const balance = await this.connection.getBalance(fromPubkey);
    if (balance < lamports + 5000) { // 5000 lamports for tx fee
      throw new Error(`Insufficient SOL balance. Have: ${balance / LAMPORTS_PER_SOL}, need: ${solAmount} + fee`);
    }

    // Create transfer instruction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports,
      })
    );

    // Get recent blockhash
    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromPubkey;

    // Sign and send
    const txSignature = await this.signAndSendTransaction(userId, transaction, password);

    return {
      txSignature,
      fromAddress: walletInfo.publicKey,
      toAddress,
      amount: solAmount,
      explorerUrl: `https://solscan.io/tx/${txSignature}`,
    };
  }

  /**
   * Send SPL token to another wallet
   */
  async sendToken(
    userId: string,
    toAddress: string,
    mintAddress: string,
    amount: number,
    decimals: number,
    password?: string
  ): Promise<{
    txSignature: string;
    fromAddress: string;
    toAddress: string;
    mint: string;
    amount: number;
    explorerUrl: string;
  }> {
    const walletInfo = await this.getWalletInfo(userId);
    
    if (!walletInfo) {
      throw new Error('No wallet found for user');
    }

    if (walletInfo.type === 'imported' && !password) {
      throw new Error('Password required for imported wallet transactions');
    }

    // Validate addresses
    let toPubkey: PublicKey;
    let mintPubkey: PublicKey;
    try {
      toPubkey = new PublicKey(toAddress);
      mintPubkey = new PublicKey(mintAddress);
    } catch {
      throw new Error('Invalid Solana address');
    }

    const fromPubkey = new PublicKey(walletInfo.publicKey);
    const rawAmount = Math.floor(amount * Math.pow(10, decimals));

    // Get source token account
    const sourceAta = await getAssociatedTokenAddress(mintPubkey, fromPubkey);
    
    // Check source balance
    try {
      const sourceAccount = await getAccount(this.connection, sourceAta);
      if (Number(sourceAccount.amount) < rawAmount) {
        throw new Error(`Insufficient token balance. Have: ${Number(sourceAccount.amount) / Math.pow(10, decimals)}, need: ${amount}`);
      }
    } catch (e: any) {
      if (e.message?.includes('Insufficient')) {
        throw e;
      }
      throw new Error('Source token account not found');
    }

    // Get or create destination token account
    const destAta = await getAssociatedTokenAddress(mintPubkey, toPubkey);
    
    const transaction = new Transaction();

    // Check if destination ATA exists, if not create it
    try {
      await getAccount(this.connection, destAta);
    } catch {
      // Need to create the ATA
      transaction.add(
        createAssociatedTokenAccountInstruction(
          fromPubkey,
          destAta,
          toPubkey,
          mintPubkey
        )
      );
    }

    // Add transfer instruction
    transaction.add(
      createTransferInstruction(
        sourceAta,
        destAta,
        fromPubkey,
        rawAmount
      )
    );

    // Get recent blockhash
    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromPubkey;

    // Sign and send
    const txSignature = await this.signAndSendTransaction(userId, transaction, password);

    return {
      txSignature,
      fromAddress: walletInfo.publicKey,
      toAddress,
      mint: mintAddress,
      amount,
      explorerUrl: `https://solscan.io/tx/${txSignature}`,
    };
  }

  /**
   * Helper: Send USDC
   */
  async sendUsdc(
    userId: string,
    toAddress: string,
    usdcAmount: number,
    password?: string
  ) {
    return this.sendToken(
      userId,
      toAddress,
      config.tokens.USDC,
      usdcAmount,
      6, // USDC decimals
      password
    );
  }
}

// Singleton
let walletServiceInstance: SolanaWalletService | null = null;

export function getSolanaWalletService(): SolanaWalletService {
  if (!walletServiceInstance) {
    walletServiceInstance = new SolanaWalletService();
  }
  return walletServiceInstance;
}

