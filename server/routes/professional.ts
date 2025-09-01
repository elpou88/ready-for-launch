import express from 'express';
import { TokenValidator } from '../services/tokenValidator';
import { WalletManager } from '../services/walletManager';
import { DexTrader } from '../services/dexTrader';
import { AutoTradingService } from '../services/autoTradingService';
import { SessionPersistence } from '../services/sessionPersistence';

const router = express.Router();
const tokenValidator = new TokenValidator();
const walletManager = WalletManager.getInstance();
const dexTrader = new DexTrader();

// Step 1: Validate token and find pools
router.post('/validate-token', async (req, res) => {
  try {
    const { contractAddress } = req.body;
    
    if (!contractAddress) {
      return res.status(400).json({
        success: false,
        error: 'Contract address is required'
      });
    }

    console.log(`🔍 VALIDATING TOKEN: ${contractAddress}`);
    
    const validation = await tokenValidator.validateToken(contractAddress);
    
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        contractAddress
      });
    }

    // Get best pool for trading
    console.log(`🔍 CHECKING ${validation.pools.length} POOLS FOR BEST SELECTION:`);
    validation.pools.forEach(p => {
      console.log(`├── Pool: ${p.dex}, Volume: $${p.volume24h}, Liquidity: $${p.liquidityUsd}, Valid: ${p.isValid}, HasMetadata: ${!!(p.tokenName && p.tokenSymbol)}`);
    });
    
    const bestPool = tokenValidator.getBestPool(validation.pools);
    
    if (!bestPool) {
      return res.status(400).json({
        success: false,
        error: 'No suitable trading pools found with sufficient liquidity',
        contractAddress,
        pools: validation.pools
      });
    }

    res.json({
      success: true,
      valid: true,
      contractAddress,
      token: {
        symbol: validation.symbol,
        name: validation.name,
        decimals: validation.decimals,
        supply: validation.supply
      },
      primaryDex: validation.primaryDex,
      liquidityUsd: validation.liquidityUsd,
      pools: validation.pools.map(pool => ({
        dex: pool.dex,
        liquidity: pool.liquidityUsd,
        volume24h: pool.volume24h,
        isValid: pool.isValid
      })),
      bestPool: {
        dex: bestPool.dex,
        liquidity: bestPool.liquidityUsd,
        poolAddress: bestPool.poolAddress
      }
    });

  } catch (error) {
    console.error('❌ Token validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Token validation failed',
      details: String(error)
    });
  }
});

// Step 2: Create unique wallet for user session
router.post('/create-session', async (req, res) => {
  try {
    const { contractAddress, tokenSymbol } = req.body;
    
    if (!contractAddress) {
      return res.status(400).json({
        success: false,
        error: 'Contract address is required'
      });
    }

    // Validate token first
    const validation = await tokenValidator.validateToken(contractAddress);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: `Token validation failed: ${validation.error}`
      });
    }

    // Verify tradeability
    const canTrade = await dexTrader.validateTradeability(contractAddress);
    if (!canTrade) {
      return res.status(400).json({
        success: false,
        error: 'Token is not tradeable on any supported DEX'
      });
    }

    // Generate unique session ID
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    // Create unique wallet for this session
    const userWallet = walletManager.createUserWallet(sessionId);
    
    console.log(`✅ SESSION CREATED: ${sessionId}`);
    console.log(`🔐 UNIQUE WALLET: ${userWallet.publicKey}`);
    console.log(`🎯 TOKEN: ${validation.symbol} (${contractAddress})`);

    // Save session to persistence
    const sessionPersistence = SessionPersistence.getInstance();
    sessionPersistence.saveWalletMapping(sessionId, userWallet);
    
    await sessionPersistence.saveSession({
      sessionId,
      tokenAddress: contractAddress,
      userWallet,
      tradingBalance: 0,
      primaryDex: validation.primaryDex || 'Jupiter',
      isActive: false,
      startTime: new Date(),
      totalTrades: 0,
      totalVolume: 0
    });

    // Start AutoTradingService monitoring immediately
    const autoTradingService = AutoTradingService.getInstance();
    console.log(`🚀 STARTING AUTO-TRADING MONITORING for session: ${sessionId}`);
    
    try {
      await autoTradingService.monitorWalletForFunding(sessionId, userWallet.publicKey, contractAddress);
      console.log(`✅ AUTO-TRADING SERVICE ACTIVATED for: ${sessionId}`);
    } catch (monitorError) {
      console.log(`⚠️ Auto-trading setup warning: ${monitorError}`);
    }

    res.json({
      success: true,
      sessionId,
      wallet: userWallet.publicKey,
      userWallet: {
        address: userWallet.publicKey,
        balance: userWallet.balance || 0
      },
      token: {
        address: contractAddress,
        symbol: validation.symbol || tokenSymbol,
        name: validation.name
      },
      primaryDex: validation.primaryDex,
      instructions: {
        step1: 'Send SOL to the unique wallet address above',
        step2: '75% will be used for volume generation, 25% goes to revenue automatically',
        step3: 'Volume generation starts AUTOMATICALLY within 3 seconds of funding'
      },
      autoTrading: {
        enabled: true,
        monitoringActive: true,
        tradeInterval: '3-6 seconds',
        chartVisibility: '100% real swaps on DexScreener'
      }
    });

  } catch (error) {
    console.error('❌ Session creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create trading session',
      details: String(error)
    });
  }
});

// EMERGENCY: Stop all active trading sessions immediately
router.post('/stop-all-sessions', async (req, res) => {
  try {
    console.log('🛑 EMERGENCY STOP: Stopping all active trading sessions');
    
    const autoTradingService = AutoTradingService.getInstance();
    const stoppedSessions = await autoTradingService.stopAllActiveSessions();
    
    console.log(`✅ EMERGENCY STOP COMPLETE: ${stoppedSessions.length} sessions stopped`);
    
    res.json({
      success: true,
      message: 'All active trading sessions stopped',
      stoppedSessions: stoppedSessions
    });
    
  } catch (error) {
    console.error('❌ Emergency stop failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop sessions',
      details: String(error)
    });
  }
});

// Get all active sessions status
router.get('/sessions', async (req, res) => {
  try {
    const autoTradingService = AutoTradingService.getInstance();
    const sessions = autoTradingService.getActiveSessionsStatus();
    
    res.json({
      success: true,
      activeSessions: sessions.length,
      sessions: sessions
    });
    
  } catch (error) {
    console.error('❌ Get sessions failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sessions',
      details: String(error)
    });
  }
});

export default router;
