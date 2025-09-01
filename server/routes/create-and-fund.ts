import express from 'express';
import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { WalletManager } from '../services/walletManager.js';
import { RealTransactionExecutor } from '../services/realTransactionExecutor.js';

const router = express.Router();

// Create new session wallet and start immediate volume generation
router.post('/create-and-start-volume', async (req, res) => {
  try {
    console.log('🚀 CREATING NEW SESSION WALLET FOR IMMEDIATE VOLUME GENERATION');
    
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    const walletManager = new WalletManager();
    const executor = new RealTransactionExecutor();
    
    // Create new session with unique ID
    const sessionId = `volume_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // Generate new wallet with private key
    const userWallet = await walletManager.generateUserWallet(sessionId);
    
    console.log(`✅ NEW SESSION CREATED: ${sessionId}`);
    console.log(`💰 NEW WALLET: ${userWallet.publicKey}`);
    console.log(`🔑 PRIVATE KEY: Available for real transactions`);
    
    // Check if the old funded wallet still has balance
    const oldFundedWallet = 'EonxcBJ2WipzdfjsVsDi8QfCaEiaQ1WayEaakZb9AUZY';
    const oldBalance = await connection.getBalance(new PublicKey(oldFundedWallet));
    const oldBalanceSOL = oldBalance / LAMPORTS_PER_SOL;
    
    console.log(`💰 Old funded wallet ${oldFundedWallet}: ${oldBalanceSOL} SOL`);
    
    res.json({
      success: true,
      message: 'New session wallet created with private key',
      sessionId,
      newWallet: userWallet.publicKey,
      privateKeyAvailable: true,
      oldFundedWallet: oldFundedWallet,
      oldFundedBalance: oldBalanceSOL,
      instructions: [
        `1. Send SOL to new wallet: ${userWallet.publicKey}`,
        `2. System will immediately start real volume generation`,
        `3. All trades will be signed with private key`,
        `4. Real transactions will appear on Solana explorer`
      ],
      status: 'Ready for funding and immediate volume generation'
    });
    
  } catch (error) {
    console.error('❌ Create and fund error:', error);
    res.status(500).json({
      success: false,
      error: `Failed to create session: ${error.message}`
    });
  }
});

// Start volume generation for any funded session wallet
router.post('/start-volume-for-session', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID required'
      });
    }

    console.log(`🔥 STARTING VOLUME GENERATION FOR SESSION: ${sessionId}`);
    
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    const walletManager = new WalletManager();
    const executor = new RealTransactionExecutor();
    
    // Get session wallet
    const userWallet = walletManager.getUserWallet(sessionId);
    if (!userWallet) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Check wallet balance
    const balance = await connection.getBalance(new PublicKey(userWallet.publicKey));
    const balanceSOL = balance / LAMPORTS_PER_SOL;
    
    console.log(`💰 Session wallet ${userWallet.publicKey}: ${balanceSOL} SOL`);
    
    if (balanceSOL < 0.001) {
      return res.json({
        success: false,
        error: `Insufficient balance: ${balanceSOL} SOL`,
        minimumRequired: '0.001 SOL'
      });
    }

    const { tokenAddress } = req.body;
    
    if (!tokenAddress) {
      return res.status(400).json({
        success: false,
        error: 'Token address required'
      });
    }
    
    console.log(`🎯 EXECUTING REAL VOLUME GENERATION FOR TOKEN: ${tokenAddress}`);
    
    // Execute BUY trade immediately
    const buyTxid = await executor.executeBuyTrade(sessionId, tokenAddress, 0.001);
    
    if (!buyTxid) {
      return res.json({
        success: false,
        error: 'Failed to execute BUY trade'
      });
    }

    console.log(`✅ REAL BUY TRANSACTION: ${buyTxid}`);
    
    // Schedule SELL trade
    setTimeout(async () => {
      console.log('🔴 Executing SELL trade...');
      const sellTxid = await executor.executeSellTrade(sessionId, tokenAddress, 100000);
      
      if (sellTxid) {
        console.log(`✅ REAL SELL TRANSACTION: ${sellTxid}`);
        console.log('🎉 REAL VOLUME GENERATION CYCLE COMPLETE');
      }
    }, 5000);

    res.json({
      success: true,
      message: 'Real volume generation started',
      sessionId,
      walletAddress: userWallet.publicKey,
      balance: balanceSOL,
      buyTxid,
      explorerUrl: `https://solscan.io/tx/${buyTxid}`,
      status: 'REAL MAINNET TRANSACTIONS EXECUTING'
    });
    
  } catch (error) {
    console.error('❌ Volume generation error:', error);
    res.status(500).json({
      success: false,
      error: `Failed to start volume generation: ${error.message}`
    });
  }
});

export { router as createAndFundRouter };