/**
 * Admin Routes for Kalshi SDK
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getAccessCodeService } from '../services/accesscode.service.js';
import { config } from '../config/index.js';

const router = Router();

// Admin authentication middleware
const adminAuth = (req: Request, res: Response, next: NextFunction) => {
  const adminKey = req.headers['x-admin-key'] as string;
  
  if (!config.admin.apiKey) {
    return res.status(500).json({ error: 'Admin API key not configured' });
  }

  if (!adminKey || adminKey !== config.admin.apiKey) {
    return res.status(401).json({ error: 'Invalid admin API key' });
  }
  
  next();
};

router.use(adminAuth);

// Create access code
router.post('/access-codes', async (req: Request, res: Response) => {
  try {
    const accessCodeService = getAccessCodeService();
    const code = await accessCodeService.createAccessCode({
      ...req.body,
      createdBy: 'admin',
    });
    res.json({ success: true, accessCode: code });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List access codes
router.get('/access-codes', async (req: Request, res: Response) => {
  try {
    const accessCodeService = getAccessCodeService();
    const codes = await accessCodeService.listAccessCodes();
    res.json({ accessCodes: codes });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Revoke access code
router.delete('/access-codes/:codeOrId', async (req: Request, res: Response) => {
  try {
    const accessCodeService = getAccessCodeService();
    const success = await accessCodeService.revokeAccessCode(req.params.codeOrId);
    res.json({ success });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk create access codes
router.post('/access-codes/bulk', async (req: Request, res: Response) => {
  try {
    const { count = 10, ...options } = req.body;
    const accessCodeService = getAccessCodeService();
    
    const codes = [];
    for (let i = 0; i < count; i++) {
      const code = await accessCodeService.createAccessCode({
        ...options,
        createdBy: 'admin',
      });
      codes.push(code);
    }
    
    res.json({ success: true, count: codes.length, accessCodes: codes });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

