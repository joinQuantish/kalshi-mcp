/**
 * MCP Routes for Kalshi SDK
 */

import { Router, Request, Response } from 'express';
import { getMCPHttpHandler } from '../mcp/http-handler.js';

const router = Router();
const mcpHandler = getMCPHttpHandler();

// MCP endpoint
router.post('/', async (req: Request, res: Response) => {
  await mcpHandler.handleRequest(req, res);
});

// MCP info endpoint
router.get('/info', (req: Request, res: Response) => {
  res.json({
    name: 'Quantish Kalshi SDK',
    version: '1.0.0',
    description: 'Kalshi prediction market trading via DFlow on Solana',
    protocol: 'MCP 2024-11-05',
    endpoints: {
      mcp: '/mcp',
      info: '/mcp/info',
    },
    authentication: {
      required: true,
      method: 'API Key in x-api-key header',
      hmac: 'Optional HMAC signing supported',
    },
    features: [
      'Solana wallet generation',
      'Bring Your Own Wallet (encrypted import)',
      'Kalshi market discovery',
      'Prediction market trading via DFlow',
      'Position tracking',
      'Outcome redemption',
    ],
  });
});

export default router;

