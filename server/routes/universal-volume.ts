import express from 'express';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { WalletManager } from '../services/walletManager.js';
import { RealTransactionExecutor } from '../services/realTransactionExecutor.js';

const router = express.Router();

// Universal volume generation for ANY token
router.post('/universal-volume-generation', async (req, res) => {
  try {
    const { tokenAddress } = req.body;
    
    if (!tokenAddress) {
      return res.status(400).json({
        success: false,
        error: 'Token address required'
      });
    }

    console.log(`🌟 UNIVERSAL VOLUME GENERATION FOR TOKEN: ${tokenAddress}`);
    
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    const walletManager = new WalletManager();
    
    // Validate token exists on Solana mainnet
    try {
      const tokenMint = new PublicKey(tokenAddress);
      const accountInfo = await connection.getAccountInfo(tokenMint);
      
      if (!accountInfo) {
        return res.status(400).json({
          success: false,
          error: 'Token does not exist on Solana mainnet'
        });
      }
      
      console.log(`✅ TOKEN VALIDATED: ${tokenAddress}`);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid token address format'
      });
    }

    // Test Jupiter quote for this token
    try {
      const inputMint = 'So11111111111111111111111111111111111111112'; // SOL
      const amount = 1000000; // 0.001 SOL test amount
      
      const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${tokenAddress}&amount=${amount}&slippageBps=50`;
      const quoteResponse = await fetch(quoteUrl);
      const quoteData = await quoteResponse.json();
      
      if (quoteData.error) {
        return res.status(400).json({
          success: false,
          error: `Token not tradeable on Jupiter: ${quoteData.error}`
        });
      }
      
      console.log(`✅ TOKEN TRADEABLE ON JUPITER`);
      console.log(`📊 Quote: ${quoteData.inAmount} → ${quoteData.outAmount}`);
      
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Token validation failed'
      });
    }

    // Create new session wallet for this token
    const sessionId = `universal_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const userWallet = await walletManager.generateUserWallet(sessionId);
    
    console.log(`✅ UNIVERSAL SESSION CREATED: ${sessionId}`);
    console.log(`💰 NEW WALLET FOR ANY TOKEN: ${userWallet.publicKey}`);
    
    res.json({
      success: true,
      message: 'Universal volume generation ready',
      sessionId,
      tokenAddress,
      walletAddress: userWallet.publicKey,
      tokenValidated: true,
      jupiterCompatible: true,
      instructions: [
        `1. Send SOL to wallet: ${userWallet.publicKey}`,
        `2. System will immediately start volume generation for ${tokenAddress}`,
        `3. Real BUY/SELL trades will execute on Jupiter DEX`,
        `4. All transactions will appear on Solana explorer`,
        `5. Chart volume will be visible on DexScreener`
      ],
      status: 'Ready for funding - Universal token support'
    });
    
  } catch (error) {
    console.error('❌ Universal volume generation error:', error);
    res.status(500).json({
      success: false,
      error: `Failed to setup universal volume generation: ${error.message}`
    });
  }
});

// Start volume generation for any token
router.post('/start-universal-volume', async (req, res) => {
  try {
    const { sessionId, tokenAddress } = req.body;
    
    if (!sessionId || !tokenAddress) {
      return res.status(400).json({
        success: false,
        error: 'Session ID and token address required'
      });
    }

    console.log(`🚀 STARTING UNIVERSAL VOLUME FOR TOKEN: ${tokenAddress}`);
    console.log(`🔑 SESSION: ${sessionId}`);
    
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
    
    console.log(`💰 Session wallet balance: ${balanceSOL} SOL`);
    
    if (balanceSOL < 0.001) {
      return res.json({
        success: false,
        error: `Insufficient balance: ${balanceSOL} SOL`,
        minimumRequired: '0.001 SOL'
      });
    }

    console.log(`🎯 EXECUTING REAL VOLUME FOR ANY TOKEN: ${tokenAddress}`);
    
    // Execute BUY trade for ANY token
    const buyTxid = await executor.executeBuyTrade(sessionId, tokenAddress, 0.001);
    
    if (!buyTxid) {
      return res.json({
        success: false,
        error: 'Failed to execute BUY trade'
      });
    }

    console.log(`✅ REAL BUY TRANSACTION FOR ${tokenAddress}: ${buyTxid}`);
    
    // Schedule SELL trade after 5 seconds
    setTimeout(async () => {
      console.log(`🔴 Executing SELL trade for ${tokenAddress}...`);
      const sellTxid = await executor.executeSellTrade(sessionId, tokenAddress, 100000);
      
      if (sellTxid) {
        console.log(`✅ REAL SELL TRANSACTION FOR ${tokenAddress}: ${sellTxid}`);
        console.log(`🎉 UNIVERSAL VOLUME GENERATION COMPLETE FOR ${tokenAddress}`);
      }
    }, 5000);

    res.json({
      success: true,
      message: 'Universal volume generation started',
      sessionId,
      tokenAddress,
      walletAddress: userWallet.publicKey,
      balance: balanceSOL,
      buyTxid,
      explorerUrl: `https://solscan.io/tx/${buyTxid}`,
      status: `REAL VOLUME GENERATION ACTIVE FOR ${tokenAddress}`
    });
    
  } catch (error) {
    console.error('❌ Universal volume start error:', error);
    res.status(500).json({
      success: false,
      error: `Failed to start universal volume: ${error.message}`
    });
  }
});

export { router as universalVolumeRouter };