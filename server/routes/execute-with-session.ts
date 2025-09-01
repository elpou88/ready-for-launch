import express from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { RealTransactionExecutor } from '../services/realTransactionExecutor.js';
import { WalletManager } from '../services/walletManager.js';

const router = express.Router();

// Execute real trades using session wallet with private key
router.post('/execute-session-trades', async (req, res) => {
  try {
    console.log('🚀 EXECUTING REAL TRADES WITH SESSION WALLET');
    
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID required'
      });
    }

    const walletManager = new WalletManager();
    const executor = new RealTransactionExecutor();
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    
    // Get session wallet
    const userWallet = walletManager.getUserWallet(sessionId);
    if (!userWallet) {
      return res.status(404).json({
        success: false,
        error: 'Session wallet not found'
      });
    }

    console.log(`💰 Session wallet: ${userWallet.publicKey}`);
    
    // Check wallet balance
    const balance = await connection.getBalance(new PublicKey(userWallet.publicKey));
    const balanceSOL = balance / 1000000000;
    
    console.log(`💰 Wallet balance: ${balanceSOL} SOL`);
    
    if (balanceSOL < 0.001) {
      return res.json({
        success: false,
        error: `Insufficient balance: ${balanceSOL} SOL`
      });
    }

    const tokenAddress = '5SUzu2XAgJHuig1iPHr6zrnfZxyms5hWf8bcezB4bonk';
    
    // Execute immediate BUY trade
    console.log('🟢 Executing BUY trade with session wallet...');
    const buyTxid = await executor.executeBuyTrade(sessionId, tokenAddress, 0.001);
    
    if (!buyTxid) {
      return res.json({
        success: false,
        error: 'BUY trade failed'
      });
    }

    console.log(`✅ BUY trade successful: ${buyTxid}`);
    
    // Schedule SELL trade after 5 seconds
    setTimeout(async () => {
      console.log('🔴 Executing SELL trade...');
      const sellTxid = await executor.executeSellTrade(sessionId, tokenAddress, 100000);
      
      if (sellTxid) {
        console.log(`✅ SELL trade successful: ${sellTxid}`);
        console.log('🎉 VOLUME GENERATION CYCLE COMPLETE');
      }
    }, 5000);

    res.json({
      success: true,
      message: 'Real volume generation started',
      sessionId,
      walletAddress: userWallet.publicKey,
      balance: balanceSOL,
      buyTxid,
      status: 'Real mainnet transactions executing'
    });
    
  } catch (error) {
    console.error('❌ Session trade execution error:', error);
    res.status(500).json({
      success: false,
      error: `Failed to execute session trades: ${error.message}`
    });
  }
});

// Execute trades for the currently funded wallet EonxcBJ2WipzdfjsVsDi8QfCaEiaQ1WayEaakZb9AUZY
router.post('/execute-funded-wallet-trades', async (req, res) => {
  try {
    console.log('🔥 EXECUTING TRADES FOR FUNDED WALLET EonxcBJ2WipzdfjsVsDi8QfCaEiaQ1WayEaakZb9AUZY');
    
    const fundedWalletAddress = 'EonxcBJ2WipzdfjsVsDi8QfCaEiaQ1WayEaakZb9AUZY';
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    
    // Check if this wallet exists in any session
    const walletManager = new WalletManager();
    
    // For this specific funded wallet, we need to find its session
    // Since this wallet was created in a previous session, let's try to execute with it
    
    const balance = await connection.getBalance(new PublicKey(fundedWalletAddress));
    const balanceSOL = balance / 1000000000;
    
    console.log(`💰 Funded wallet balance: ${balanceSOL} SOL`);
    
    if (balanceSOL < 0.001) {
      return res.json({
        success: false,
        error: `Funded wallet insufficient balance: ${balanceSOL} SOL`
      });
    }

    // Create a manual session for this funded wallet
    const manualSessionId = `funded_wallet_${Date.now()}`;
    
    // We need to somehow associate this existing funded wallet with a session
    // For now, let's just indicate the wallet is ready for trades but needs session association
    
    console.log('🎯 FUNDED WALLET READY FOR VOLUME GENERATION');
    console.log('🔑 Issue: Need to associate existing funded wallet with session that has private key');
    
    res.json({
      success: true,
      message: 'Funded wallet detected and ready',
      walletAddress: fundedWalletAddress,
      balance: balanceSOL,
      status: 'Ready for volume generation',
      issue: 'Need session association with private key'
    });
    
  } catch (error) {
    console.error('❌ Funded wallet execution error:', error);
    res.status(500).json({
      success: false,
      error: `Failed to execute funded wallet trades: ${error.message}`
    });
  }
});

export { router as executeSessionRouter };