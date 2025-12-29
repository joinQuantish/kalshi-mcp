import dotenv from 'dotenv';
dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3002', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  
  database: {
    url: process.env.DATABASE_URL || '',
  },
  
  encryption: {
    key: process.env.ENCRYPTION_KEY || '',
  },
  
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    rpcFallback: process.env.SOLANA_RPC_FALLBACK || '',
    commitment: 'confirmed' as const,
  },
  
  dflow: {
    // Production DFlow API endpoints for Kalshi trading on Solana
    apiUrl: process.env.DFLOW_API_URL || 'https://quote-api.dflow.net',
    metadataApiUrl: process.env.DFLOW_METADATA_API_URL || 'https://prediction-markets-api.dflow.net',
    apiKey: process.env.DFLOW_API_KEY || '',
  },
  
  admin: {
    apiKey: process.env.ADMIN_API_KEY || '',
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '60', 10),
  },
  
  // Known SPL token addresses on Solana
  tokens: {
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Native USDC on Solana
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    SOL: 'So11111111111111111111111111111111111111112', // Wrapped SOL
  },
};

// Validate required config
export function validateConfig(): void {
  const required = [
    { key: 'DATABASE_URL', value: config.database.url },
    { key: 'ENCRYPTION_KEY', value: config.encryption.key },
  ];
  
  const missing = required.filter(({ value }) => !value);
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.map(m => m.key).join(', ')}`
    );
  }
  
  // Validate encryption key format
  if (config.encryption.key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
}

