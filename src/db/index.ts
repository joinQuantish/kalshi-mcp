/**
 * Database client for Kalshi SDK
 * Uses a separate Prisma client from the main Polymarket system
 */

// Import from the custom output path defined in schema.prisma
// @ts-ignore - Prisma generates to custom path
import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' 
        ? ['query', 'error', 'warn'] 
        : ['error'],
    });
  }
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

export { PrismaClient };

