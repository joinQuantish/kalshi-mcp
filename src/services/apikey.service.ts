/**
 * API Key Service for Kalshi SDK
 * Handles API key generation, validation, and management
 */

import crypto from 'crypto';
import { getPrismaClient } from '../db/index.js';
import { getEncryptionService } from '../crypto/encryption.js';

export interface ApiKeyResult {
  apiKey: string;      // Full key (only shown once)
  apiSecret: string;   // For HMAC signing (only shown once)
  keyPrefix: string;   // For identification
  keyId: string;
}

export class ApiKeyService {
  /**
   * Generate a new API key for a user
   */
  async createApiKey(userId: string, name?: string): Promise<ApiKeyResult> {
    const prisma = getPrismaClient();
    const encryption = getEncryptionService();

    // Generate API key: pk_kalshi_<random>
    const keyRandom = crypto.randomBytes(24).toString('base64url');
    const apiKey = `pk_kalshi_${keyRandom}`;
    const keyPrefix = apiKey.substring(0, 16);

    // Generate API secret for HMAC signing
    const apiSecret = `sk_kalshi_${crypto.randomBytes(32).toString('base64url')}`;

    // Hash the key and secret for storage
    const keyHash = this.hashKey(apiKey);
    const secretHash = this.hashKey(apiSecret);

    // Create the key record
    const keyRecord = await prisma.userApiKey.create({
      data: {
        userId,
        keyHash,
        keyPrefix,
        apiSecret: secretHash,
        name,
        isActive: true,
      },
    });

    return {
      apiKey,
      apiSecret,
      keyPrefix,
      keyId: keyRecord.id,
    };
  }

  /**
   * Validate an API key and return associated user
   */
  async validateApiKey(apiKey: string): Promise<{
    isValid: boolean;
    userId?: string;
    keyRecord?: any;
    message?: string;
  }> {
    const prisma = getPrismaClient();

    if (!apiKey || !apiKey.startsWith('pk_kalshi_')) {
      return { isValid: false, message: 'Invalid API key format' };
    }

    const keyHash = this.hashKey(apiKey);

    const keyRecord = await prisma.userApiKey.findUnique({
      where: { keyHash },
      include: { user: true },
    });

    if (!keyRecord) {
      return { isValid: false, message: 'API key not found' };
    }

    if (!keyRecord.isActive) {
      return { isValid: false, message: 'API key is inactive' };
    }

    if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
      return { isValid: false, message: 'API key has expired' };
    }

    // Update last used timestamp
    await prisma.userApiKey.update({
      where: { id: keyRecord.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      isValid: true,
      userId: keyRecord.userId,
      keyRecord,
    };
  }

  /**
   * Validate HMAC signature for request
   */
  validateHmacSignature(
    apiSecret: string,
    timestamp: string,
    method: string,
    path: string,
    body: string,
    providedSignature: string
  ): boolean {
    // Check timestamp is within 30 seconds
    const requestTime = parseInt(timestamp, 10);
    const now = Date.now();
    if (Math.abs(now - requestTime) > 30000) {
      return false;
    }

    // Recreate the signature
    const message = `${timestamp}${method}${path}${body}`;
    const expectedSignature = crypto
      .createHmac('sha256', apiSecret)
      .update(message)
      .digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(providedSignature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Create HMAC signature (for client reference)
   */
  createHmacSignature(
    apiSecret: string,
    timestamp: string,
    method: string,
    path: string,
    body: string
  ): string {
    const message = `${timestamp}${method}${path}${body}`;
    return crypto
      .createHmac('sha256', apiSecret)
      .update(message)
      .digest('base64');
  }

  /**
   * List all API keys for a user
   */
  async listApiKeys(userId: string): Promise<Array<{
    id: string;
    keyPrefix: string;
    name: string | null;
    isActive: boolean;
    lastUsedAt: Date | null;
    createdAt: Date;
  }>> {
    const prisma = getPrismaClient();

    const keys = await prisma.userApiKey.findMany({
      where: { userId },
      select: {
        id: true,
        keyPrefix: true,
        name: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return keys;
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(userId: string, keyId: string): Promise<boolean> {
    const prisma = getPrismaClient();

    const key = await prisma.userApiKey.findFirst({
      where: { id: keyId, userId },
    });

    if (!key) {
      return false;
    }

    await prisma.userApiKey.update({
      where: { id: keyId },
      data: { isActive: false },
    });

    return true;
  }

  /**
   * Hash an API key or secret
   */
  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }
}

// Singleton
let apiKeyServiceInstance: ApiKeyService | null = null;

export function getApiKeyService(): ApiKeyService {
  if (!apiKeyServiceInstance) {
    apiKeyServiceInstance = new ApiKeyService();
  }
  return apiKeyServiceInstance;
}

