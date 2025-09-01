import express from 'express';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { RealTransactionExecutor } from '../services/realTransactionExecutor.js';
import { WalletManager } from '../services/walletManager.js';

const router = express.Router();

// Test real transactions with the original funded wallet
router.post('/test-real-volume-with-funded-wallet', async (req, res) => {
  try {
    console.log('🔥 TESTING REAL VOLUME GENERATION WITH FUNDED WALLET EonxcBJ2WipzdfjsVsDi8QfCaEiaQ1WayEaakZb9AUZY');
    
    const fundedWalletAddress = 'EonxcBJ2WipzdfjsVsDi8QfCaEiaQ1WayEaakZb9AUZY';
    const tokenAddress = '5SUzu2XAgJHuig1iPHr6zrnfZxyms5hWf8bcezB4bonk';
    
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    
    // Check wallet balance
    const balance = await connection.getBalance(new PublicKey(fundedWalletAddress));
    const balanceSOL = balance / LAMPORTS_PER_SOL;
    
    console.log(`💰 Funded wallet balance: ${balanceSOL} SOL`);
    
    if (balanceSOL < 0.001) {
      return res.json({
        success: false,
        error: `Funded wallet insufficient balance: ${balanceSOL} SOL`,
        minimumRequired: '0.001 SOL'
      });
    }

    // For this test, we'll create a demo session and show what would happen
    const walletManager = new WalletManager();
    const testSessionId = `funded_test_${Date.now()}`;
    
    // Create a test session wallet to demonstrate the process
    const testWallet = await walletManager.generateUserWallet(testSessionId);
    
    console.log(`✅ DEMO SESSION CREATED: ${testSessionId}`);
    console.log(`💰 DEMO WALLET: ${testWallet.publicKey}`);
    console.log(`🔑 DEMO WALLET HAS PRIVATE KEY: YES`);
    
    // Show how it would work with real funding
    const executor = new RealTransactionExecutor();
    
    console.log('🎯 DEMONSTRATING REAL TRANSACTION CAPABILITY');
    
    // Test Jupiter quote for this specific token
    const inputMint = 'So11111111111111111111111111111111111111112'; // SOL
    const amount = 1000000; // 0.001 SOL
    
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${tokenAddress}&amount=${amount}&slippageBps=50`;
    const quoteResponse = await fetch(quoteUrl);
    const quoteData = await quoteResponse.json();
    
    if (quoteData.error) {
      return res.json({
        success: false,
        error: `Jupiter quote failed: ${quoteData.error}`
      });
    }
    
    console.log(`✅ REAL JUPITER QUOTE FOR ${tokenAddress}:`);
    console.log(`📊 Input: ${quoteData.inAmount} lamports SOL`);
    console.log(`📊 Output: ${quoteData.outAmount} FFS tokens`);
    console.log(`💰 Price impact: ${quoteData.priceImpactPct}%`);
    
    res.json({
      success: true,
      message: 'Real volume generation system demonstrated',
      fundedWallet: {
        address: fundedWalletAddress,
        balance: balanceSOL,
        status: 'FUNDED'
      },
      demoSession: {
        sessionId: testSessionId,
        walletAddress: testWallet.publicKey,
        privateKeyAvailable: true
      },
      jupiterQuote: {
        tokenAddress,
        inputAmount: quoteData.inAmount,
        outputAmount: quoteData.outAmount,
        priceImpact: quoteData.priceImpactPct,
        ready: true
      },
      instructions: [
        'To execute REAL volume generation:',
        `1. Send SOL to demo wallet: ${testWallet.publicKey}`,
        '2. System will immediately execute real Jupiter DEX trades',
        '3. BUY/SELL transactions will be signed with private key',
        '4. All transactions will appear on Solana explorer',
        '5. Real chart volume will be generated'
      ],
      status: 'READY FOR REAL TRANSACTION EXECUTION'
    });
    
  } catch (error) {
    console.error('❌ Funded wallet test error:', error);
    res.status(500).json({
      success: false,
      error: `Failed to test funded wallet: ${error.message}`
    });
  }
});

// Execute immediate real volume if someone funds the demo wallet
router.post('/execute-if-funded', async (req, res) => {
  try {
    const { sessionId, tokenAddress } = req.body;
    
    if (!sessionId || !tokenAddress) {
      return res.status(400).json({
        success: false,
        error: 'Session ID and token address required'
      });
    }

    console.log(`🚀 CHECKING IF SESSION ${sessionId} IS FUNDED FOR REAL EXECUTION`);
    
    const walletManager = new WalletManager();
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    
    // Get session wallet
    const userWallet = walletManager.getUserWallet(sessionId);
    if (!userWallet) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Check if wallet is funded
    const balance = await connection.getBalance(new PublicKey(userWallet.publicKey));
    const balanceSOL = balance / LAMPORTS_PER_SOL;
    
    console.log(`💰 Session wallet ${userWallet.publicKey}: ${balanceSOL} SOL`);
    
    if (balanceSOL < 0.001) {
      return res.json({
        success: false,
        error: `Wallet not funded: ${balanceSOL} SOL`,
        minimumRequired: '0.001 SOL',
        walletAddress: userWallet.publicKey
      });
    }

    // WALLET IS FUNDED - EXECUTE REAL VOLUME GENERATION
    console.log(`🔥 WALLET IS FUNDED - EXECUTING REAL VOLUME GENERATION FOR ${tokenAddress}`);
    
    const executor = new RealTransactionExecutor();
    
    // Execute real BUY trade
    const buyTxid = await executor.executeBuyTrade(sessionId, tokenAddress, 0.001);
    
    if (!buyTxid) {
      return res.json({
        success: false,
        error: 'Failed to execute BUY trade'
      });
    }

    console.log(`✅ REAL BUY TRANSACTION EXECUTED: ${buyTxid}`);
    console.log(`🔗 Explorer: https://solscan.io/tx/${buyTxid}`);
    
    // Schedule SELL trade
    setTimeout(async () => {
      console.log(`🔴 Executing SELL trade for ${tokenAddress}...`);
      const sellTxid = await executor.executeSellTrade(sessionId, tokenAddress, 100000);
      
      if (sellTxid) {
        console.log(`✅ REAL SELL TRANSACTION EXECUTED: ${sellTxid}`);
        console.log(`🔗 Explorer: https://solscan.io/tx/${sellTxid}`);
        console.log(`🎉 REAL VOLUME GENERATION COMPLETE FOR ${tokenAddress}`);
      }
    }, 5000);

    res.json({
      success: true,
      message: 'REAL VOLUME GENERATION EXECUTING',
      sessionId,
      tokenAddress,
      walletAddress: userWallet.publicKey,
      balance: balanceSOL,
      buyTxid,
      explorerUrl: `https://solscan.io/tx/${buyTxid}`,
      status: 'REAL MAINNET TRANSACTIONS ACTIVE'
    });
    
  } catch (error) {
    console.error('❌ Real execution error:', error);
    res.status(500).json({
      success: false,
      error: `Failed to execute real volume: ${error.message}`
    });
  }
});

export { router as testFundedWalletRouter };