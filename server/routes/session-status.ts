import express from 'express';
import { WalletManager } from '../services/walletManager.js';
import { Connection, PublicKey } from '@solana/web3.js';

const router = express.Router();
const walletManager = new WalletManager();
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

// Get session status and wallet balance
router.get('/session/:sessionId/status', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const userWallet = walletManager.getUserWallet(sessionId);
    if (!userWallet) {
      return res.json({
        success: false,
        error: 'Session not found'
      });
    }

    const balance = await connection.getBalance(new PublicKey(userWallet.publicKey));
    const balanceSOL = balance / 1000000000; // Convert lamports to SOL

    res.json({
      success: true,
      sessionId,
      wallet: {
        address: userWallet.publicKey.toString(),
        balance: balanceSOL
      },
      status: balanceSOL > 0.001 ? 'funded' : 'waiting_for_funds'
    });

  } catch (error) {
    console.error('❌ Session status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get session status'
    });
  }
});

export { router as sessionStatusRouter };