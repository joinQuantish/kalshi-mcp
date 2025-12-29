/**
 * Authentication Middleware for Kalshi SDK
 */

import { Request, Response, NextFunction } from 'express';
import { getApiKeyService } from '../services/apikey.service.js';

/**
 * API Key Authentication Middleware
 * Validates x-api-key header and sets userId on request
 */
export async function apiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      res.status(401).json({
        success: false,
        error: 'API key required. Provide x-api-key header.',
      });
      return;
    }

    const apiKeyService = getApiKeyService();
    const validation = await apiKeyService.validateApiKey(apiKey);

    if (!validation.isValid) {
      res.status(401).json({
        success: false,
        error: validation.message || 'Invalid API key',
      });
      return;
    }

    // Attach userId to request for downstream use
    (req as any).userId = validation.userId;
    (req as any).keyId = validation.keyRecord?.id;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication error',
    });
  }
}

/**
 * Optional Authentication Middleware
 * Allows unauthenticated requests but attaches userId if valid key provided
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const apiKey = req.headers['x-api-key'] as string;

    if (apiKey) {
      const apiKeyService = getApiKeyService();
      const validation = await apiKeyService.validateApiKey(apiKey);

      if (validation.isValid) {
        (req as any).userId = validation.userId;
        (req as any).keyId = validation.keyRecord?.id;
      }
    }

    next();
  } catch (error) {
    // Don't fail on optional auth errors
    next();
  }
}

export default { apiKeyAuth, optionalAuth };


