import { Router } from 'express';
import { z } from 'zod';
import { userVolumeBotService } from '../services/userVolumeBot';
import { storage } from '../storage';

const router = Router();

// Create user session with token validation
router.post('/user-sessions', async (req, res) => {
  try {
    const schema = z.object({
      userWallet: z.string().min(32).max(44),
      tokenName: z.string().min(1),
      tokenType: z.enum(['spl', 'bonkfun', 'pumpfun']),
      tokenAddress: z.string().min(32).max(44)
    });

    const { userWallet, tokenName, tokenType, tokenAddress } = schema.parse(req.body);

    console.log(`🔍 Creating session for wallet: ${userWallet}`);
    console.log(`🪙 Token: ${tokenName} (${tokenType}) - ${tokenAddress}`);

    // Create session with token validation
    const tokenData = {
      name: tokenName,
      type: tokenType,
      [tokenType === 'spl' ? 'mint' : 'bonding']: tokenAddress
    };

    const session = await userVolumeBotService.createUserSession(userWallet, tokenData);
    
    res.json({
      id: session.id,
      userWallet: session.userWallet,
      message: 'Session created successfully. Please fund to activate bot.',
      fundingWallet: '2EJEuS1UaXaratBSiJJxd2p93XdvTL6uSHGXj2ZCx6Qt', // Service wallet for funding
      minAmount: 0.15
    });
  } catch (error) {
    console.error('Session creation error:', error);
    res.status(400).json({ 
      error: error instanceof Error ? error.message : 'Failed to create session' 
    });
  }
});

// Fund user session
router.post('/user-sessions/:sessionId/fund', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const schema = z.object({
      amount: z.number().min(0.15).max(100)
    });

    const { amount } = schema.parse(req.body);

    console.log(`💰 Funding session ${sessionId} with ${amount} SOL`);

    await userVolumeBotService.fundUserSession(sessionId, amount);

    const revenueAmount = amount * 0.25;
    const tradingAmount = amount * 0.75;

    res.json({
      success: true,
      message: 'Session funded successfully',
      fundingAmount: amount,
      tradingBalance: tradingAmount,
      revenueCollected: revenueAmount,
      status: 'Bot started - Volume generation active'
    });
  } catch (error) {
    console.error('Funding error:', error);
    res.status(400).json({ 
      error: error instanceof Error ? error.message : 'Failed to fund session' 
    });
  }
});

// Get session status
router.get('/user-sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await storage.getUserSession(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const tokens = await storage.getTokensBySession(sessionId);
    
    res.json({
      ...session,
      tokens,
      status: session.isActive ? 'Active - Bot Running' : 'Inactive - Needs Funding'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get session status' });
  }
});

// Stop session
router.post('/user-sessions/:sessionId/stop', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    userVolumeBotService.stopVolumeGeneration(sessionId);
    await storage.updateUserSession(sessionId, { isActive: false });
    
    res.json({ message: 'Session stopped successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to stop session' });
  }
});

export default router;