/**
 * Access Code Service for Kalshi SDK
 * Manages access codes for SDK registration
 */

import { v4 as uuidv4 } from 'uuid';
import { getPrismaClient } from '../db/index.js';

export class AccessCodeService {
  /**
   * Create a new access code
   */
  async createAccessCode(data: {
    developerName?: string;
    developerEmail?: string;
    notes?: string;
    maxUses?: number;
    expiresInDays?: number;
    createdBy: string;
  }) {
    const prisma = getPrismaClient();

    // Generate code: KALSHI-XXXX-XXXX-XXXX
    const randomPart = uuidv4()
      .toUpperCase()
      .replace(/-/g, '')
      .substring(0, 12)
      .match(/.{1,4}/g)
      ?.join('-');
    
    const code = `KALSHI-${randomPart}`;

    const expiresAt = data.expiresInDays
      ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const accessCode = await prisma.accessCode.create({
      data: {
        code,
        developerName: data.developerName,
        developerEmail: data.developerEmail,
        notes: data.notes,
        maxUses: data.maxUses || 1,
        expiresAt,
        createdBy: data.createdBy,
      },
    });

    return accessCode;
  }

  /**
   * Validate and use an access code
   */
  async validateAndUseAccessCode(
    code: string,
    externalId: string
  ): Promise<{ isValid: boolean; message: string }> {
    const prisma = getPrismaClient();

    const accessCode = await prisma.accessCode.findUnique({
      where: { code },
    });

    if (!accessCode) {
      return { isValid: false, message: 'Invalid access code' };
    }

    if (!accessCode.isActive) {
      return { isValid: false, message: 'Access code is inactive' };
    }

    if (accessCode.expiresAt && accessCode.expiresAt < new Date()) {
      return { isValid: false, message: 'Access code has expired' };
    }

    if (accessCode.maxUses !== -1 && accessCode.currentUses >= accessCode.maxUses) {
      return { isValid: false, message: 'Access code has reached maximum uses' };
    }

    // Increment usage count
    await prisma.accessCode.update({
      where: { id: accessCode.id },
      data: { currentUses: { increment: 1 } },
    });

    return { isValid: true, message: 'Access code valid' };
  }

  /**
   * List all access codes
   */
  async listAccessCodes() {
    const prisma = getPrismaClient();
    return prisma.accessCode.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Revoke an access code
   */
  async revokeAccessCode(codeOrId: string): Promise<boolean> {
    const prisma = getPrismaClient();

    try {
      const accessCode = await prisma.accessCode.findFirst({
        where: {
          OR: [{ id: codeOrId }, { code: codeOrId }],
        },
      });

      if (!accessCode) return false;

      await prisma.accessCode.update({
        where: { id: accessCode.id },
        data: { isActive: false },
      });

      return true;
    } catch {
      return false;
    }
  }
}

// Singleton
let accessCodeServiceInstance: AccessCodeService | null = null;

export function getAccessCodeService(): AccessCodeService {
  if (!accessCodeServiceInstance) {
    accessCodeServiceInstance = new AccessCodeService();
  }
  return accessCodeServiceInstance;
}

