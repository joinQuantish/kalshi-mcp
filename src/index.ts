/**
 * Quantish Kalshi SDK - Main Entry Point
 * 
 * A completely separate MCP server for Kalshi prediction market trading
 * via DFlow on Solana.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config, validateConfig } from './config/index.js';
import mcpRoutes from './routes/mcp.js';
import adminRoutes from './routes/admin.js';
import botRoutes from './routes/bot.js';
import userRoutes from './routes/users.js';
import orderRoutes from './routes/orders.js';
import positionRoutes from './routes/positions.js';
import marketRoutes from './routes/markets.js';
import { getPrismaClient, disconnectPrisma } from './db/index.js';
import { apiKeyAuth } from './middleware/auth.js';

// Validate configuration
validateConfig();

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: '*', // Configure based on your needs
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key', 'x-admin-key', 'x-hmac-signature', 'x-hmac-timestamp'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: { error: 'Rate limit exceeded. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req.headers['x-api-key'] as string) || req.ip || 'unknown';
  },
});

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: 'Too many registration attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Body parsing
app.use(express.json({ limit: '1mb', strict: true }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'quantish-kalshi-sdk',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Root info
app.get('/', (req, res) => {
  res.json({
    name: 'Quantish Kalshi SDK',
    version: '1.0.0',
    description: 'Kalshi prediction market trading via DFlow on Solana',
    endpoints: {
      health: '/health',
      mcp: '/mcp',
      mcpInfo: '/mcp/info',
      bot: '/api/bot (mobile app credentials)',
      markets: '/api/markets (public)',
      users: '/api/users (requires x-api-key)',
      orders: '/api/orders (requires x-api-key)',
      positions: '/api/positions (requires x-api-key)',
      admin: '/api/admin (requires x-admin-key)',
    },
    documentation: 'https://github.com/quantish/kalshi-sdk',
    features: [
      'Solana wallet generation',
      'Bring Your Own Wallet (encrypted import from Phantom/Solflare)',
      'Kalshi market discovery via DFlow',
      'Prediction market trading',
      'Position tracking',
      'Outcome redemption',
      'REST API & MCP interface',
      'Mobile app integration',
    ],
  });
});

// Routes
app.use('/mcp', limiter, mcpRoutes);
app.use('/api/admin', adminRoutes);

// Bot/Mobile routes (public - issues API keys)
app.use('/api/bot', botRoutes);

// Market data (public)
app.use('/api/markets', marketRoutes);

// Protected routes (require API key)
app.use('/api/users', apiKeyAuth, userRoutes);
app.use('/api/orders', apiKeyAuth, orderRoutes);
app.use('/api/positions', apiKeyAuth, positionRoutes);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: config.server.nodeEnv === 'development' ? err.message : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
});

// Start server
const PORT = config.server.port;

const server = app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🚀 Quantish Kalshi SDK Server                               ║
║                                                               ║
║   Version:     1.0.3 (DB Retry Fix)                               ║
║   Environment: ${config.server.nodeEnv.padEnd(20)}             ║
║   Port:        ${PORT.toString().padEnd(20)}                   ║
║                                                               ║
║   Endpoints:                                                  ║
║   • MCP:    http://localhost:${PORT}/mcp                       ║
║   • Info:   http://localhost:${PORT}/mcp/info                  ║
║   • Health: http://localhost:${PORT}/health                    ║
║   • Admin:  http://localhost:${PORT}/api/admin                 ║
║                                                               ║
║   Features:                                                   ║
║   • Kalshi market trading via DFlow API                       ║
║   • Solana wallet generation                                  ║
║   • Bring Your Own Wallet (encrypted import)                  ║
║   • Position tracking & redemption                            ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\nShutting down gracefully...');
  
  server.close(() => {
    console.log('HTTP server closed');
  });

  await disconnectPrisma();
  console.log('Database connection closed');
  
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { app };

