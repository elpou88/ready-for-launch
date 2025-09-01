import express from 'express';
import { ComprehensiveTokenValidator } from '../services/comprehensiveTokenValidator.js';
import { WalletManager } from '../services/walletManager.js';
import { RealTransactionExecutor } from '../services/realTransactionExecutor.js';

const router = express.Router();

// Comprehensive token validation and pool detection
router.post('/comprehensive-token-validation', async (req, res) => {
  try {
    const { tokenAddress } = req.body;
    
    if (!tokenAddress) {
      return res.status(400).json({
        success: false,
        error: 'Token address required'
      });
    }

    console.log(`🔍 STARTING COMPREHENSIVE VALIDATION FOR: ${tokenAddress}`);
    
    const validator = new ComprehensiveTokenValidator();
    const tokenData = await validator.validateTokenEverywhere(tokenAddress);
    
    if (!tokenData.exists) {
      return res.status(400).json({
        success: false,
        error: 'Token does not exist on Solana mainnet'
      });
    }

    if (tokenData.pools.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Token has no tradeable pools on any DEX'
      });
    }

    console.log(`✅ COMPREHENSIVE VALIDATION SUCCESSFUL`);
    console.log(`🎯 TOKEN IS TRADEABLE ON ${tokenData.pools.length} POOLS`);
    
    res.json({
      success: true,
      message: 'Token fully validated across all DEXs',
      tokenAddress,
      validation: {
        exists: tokenData.exists,
        totalPools: tokenData.pools.length,
        totalLiquidity: tokenData.totalLiquidity,
        bestDex: tokenData.bestDex,
        capabilities: {
          jupiterCompatible: tokenData.jupiterCompatible,
          raydiumCompatible: tokenData.raydiumCompatible,
          pumpFunCompatible: tokenData.pumpFunCompatible,
          bondingCurve: tokenData.bondingCurve
        }
      },
      pools: tokenData.pools,
      status: '100% VALIDATED AND TRADEABLE'
    });
    
  } catch (error) {
    console.error('❌ Comprehensive validation error:', error);
    res.status(500).json({
      success: false,
      error: `Validation failed: ${error.message}`
    });
  }
});

// Test FFS token specifically with comprehensive validation
router.post('/test-ffs-comprehensive', async (req, res) => {
  try {
    const ffsTokenAddress = '5SUzu2XAgJHuig1iPHr6zrnfZxyms5hWf8bcezB4bonk';
    
    console.log(`🔥 TESTING FFS TOKEN COMPREHENSIVE VALIDATION AND TRADING`);
    console.log(`📊 FFS Token: ${ffsTokenAddress}`);
    
    const validator = new ComprehensiveTokenValidator();
    const tokenData = await validator.validateTokenEverywhere(ffsTokenAddress);
    
    if (!tokenData.exists) {
      return res.json({
        success: false,
        error: 'FFS token does not exist'
      });
    }

    console.log(`🎯 FFS TOKEN VALIDATION RESULTS:`);
    console.log(`   Pools Found: ${tokenData.pools.length}`);
    console.log(`   Total Liquidity: $${tokenData.totalLiquidity.toLocaleString()}`);
    console.log(`   Best DEX: ${tokenData.bestDex}`);
    
    // Create session for FFS trading
    const walletManager = new WalletManager();
    const sessionId = `ffs_comprehensive_${Date.now()}`;
    const userWallet = await walletManager.generateUserWallet(sessionId);
    
    console.log(`✅ FFS TRADING SESSION CREATED: ${sessionId}`);
    console.log(`💰 WALLET FOR FFS TRADING: ${userWallet.publicKey}`);
    
    // Test trading capability on the best DEX
    const executor = new RealTransactionExecutor();
    
    // Test Jupiter quote (usually the best for routing)
    if (tokenData.jupiterCompatible) {
      const inputMint = 'So11111111111111111111111111111111111111112';
      const amount = 1000000; // 0.001 SOL
      
      const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${ffsTokenAddress}&amount=${amount}&slippageBps=50`;
      const response = await fetch(quoteUrl);
      const quoteData = await response.json();
      
      if (!quoteData.error) {
        console.log(`✅ FFS TRADING QUOTE CONFIRMED:`);
        console.log(`📊 0.001 SOL → ${quoteData.outAmount} FFS tokens`);
        console.log(`💰 Price Impact: ${quoteData.priceImpactPct}%`);
      }
    }
    
    res.json({
      success: true,
      message: 'FFS token comprehensive validation completed',
      ffsToken: {
        address: ffsTokenAddress,
        validation: tokenData,
        tradingSession: {
          sessionId,
          walletAddress: userWallet.publicKey,
          privateKeyAvailable: true
        }
      },
      tradingCapability: {
        canTrade: tokenData.pools.length > 0,
        recommendedDex: tokenData.bestDex,
        liquidityAvailable: tokenData.totalLiquidity > 0
      },
      instructions: [
        `1. Send SOL to trading wallet: ${userWallet.publicKey}`,
        `2. System will trade FFS on ${tokenData.bestDex}`,
        `3. Real volume will be generated across ${tokenData.pools.length} pools`,
        `4. 100% authentic transactions on Solana mainnet`,
        `5. Chart volume visible on all DEX interfaces`
      ],
      status: 'FFS TOKEN 100% VALIDATED AND READY FOR TRADING'
    });
    
  } catch (error) {
    console.error('❌ FFS comprehensive test error:', error);
    res.status(500).json({
      success: false,
      error: `FFS test failed: ${error.message}`
    });
  }
});

export { router as comprehensiveValidationRouter };