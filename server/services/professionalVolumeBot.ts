import { Keypair } from '@solana/web3.js';
import { TokenValidator } from './tokenValidator';
import { DexTrader, DexTradeConfig } from './dexTrader';
import { UserWallet } from './walletManager';

export interface BotSession {
  sessionId: string;
  tokenAddress: string;
  userWallet: UserWallet;
  tradingBalance: number;
  primaryDex: string;
  isActive: boolean;
  startTime: Date;
  totalTrades: number;
  totalVolume: number;
  lastTradeTime?: Date;
  errors: number;
}

export interface SessionConfig {
  sessionId: string;
  tokenAddress: string;
  userWallet: UserWallet;
  tradingBalance: number;
  primaryDex: string;
}

export class ProfessionalVolumeBot {
  private activeSessions: Map<string, BotSession> = new Map();
  private sessionIntervals: Map<string, NodeJS.Timeout> = new Map();
  private tokenValidator: TokenValidator;
  private dexTrader: DexTrader;

  constructor() {
    this.tokenValidator = new TokenValidator();
    this.dexTrader = new DexTrader();
  }

  // Start a new trading session
  async startSession(config: SessionConfig): Promise<boolean> {
    try {
      console.log(`🚀 STARTING PROFESSIONAL SESSION: ${config.sessionId}`);
      console.log(`🎯 Token: ${config.tokenAddress}`);
      console.log(`💰 Trading balance: ${config.tradingBalance.toFixed(6)} SOL`);
      console.log(`🏛️ Primary DEX: ${config.primaryDex}`);

      // Validate token and get pools
      const validation = await this.tokenValidator.validateToken(config.tokenAddress);
      if (!validation.valid) {
        console.error(`❌ Token validation failed: ${validation.error}`);
        return false;
      }

      const bestPool = this.tokenValidator.getBestPool(validation.pools);
      if (!bestPool) {
        console.error(`❌ No suitable trading pool found`);
        return false;
      }

      // Create session
      const session: BotSession = {
        sessionId: config.sessionId,
        tokenAddress: config.tokenAddress,
        userWallet: config.userWallet,
        tradingBalance: config.tradingBalance,
        primaryDex: config.primaryDex,
        isActive: true,
        startTime: new Date(),
        totalTrades: 0,
        totalVolume: 0,
        errors: 0
      };

      this.activeSessions.set(config.sessionId, session);

      // Start trading loop
      await this.startTradingLoop(session, bestPool);

      console.log(`✅ SESSION STARTED: ${config.sessionId}`);
      return true;

    } catch (error) {
      console.error(`❌ Failed to start session: ${error}`);
      return false;
    }
  }

  // Start the trading loop for a session
  private async startTradingLoop(session: BotSession, pool: any): Promise<void> {
    const tradeInterval = 3500 + Math.random() * 1500; // 3.5-5 seconds
    
    const executeNextTrade = async () => {
      if (!session.isActive) return;

      try {
        // Determine trade type (organic pattern)
        const tradeType = this.getNextTradeType(session);
        
        // Calculate trade amount (micro-trading)
        const tradeAmount = this.calculateTradeAmount(session);
        
        if (tradeAmount > session.tradingBalance) {
          console.log(`💰 Session ${session.sessionId} funds depleted - stopping`);
          this.stopSession(session.sessionId);
          return;
        }

        // Create trade config
        const tradeConfig: DexTradeConfig = {
          tokenAddress: session.tokenAddress,
          sessionId: session.sessionId,
          userWallet: this.reconstructKeypair(session.userWallet),
          primaryDex: session.primaryDex,
          pool: pool,
          tradeAmount: tradeAmount
        };

        // Execute trade
        const result = await this.dexTrader.executeTrade(tradeConfig, tradeType);
        
        if (result.success) {
          session.totalTrades++;
          session.totalVolume += tradeAmount;
          session.lastTradeTime = new Date();
          session.tradingBalance -= tradeAmount;
          
          console.log(`✅ ${tradeType} COMPLETED - Session: ${session.sessionId}`);
          console.log(`📊 Trade #${session.totalTrades} - ${tradeAmount.toFixed(6)} SOL`);
          console.log(`🔗 https://solscan.io/tx/${result.signature}`);
          console.log(`💰 Remaining balance: ${session.tradingBalance.toFixed(6)} SOL`);
        } else {
          session.errors++;
          console.error(`❌ Trade failed for session ${session.sessionId}: ${result.error}`);
        }

        // Schedule next trade
        if (session.isActive && session.tradingBalance > 0.0001) {
          const nextInterval = 3500 + Math.random() * 1500;
          const timeout = setTimeout(executeNextTrade, nextInterval);
          this.sessionIntervals.set(session.sessionId, timeout);
        } else {
          this.stopSession(session.sessionId);
        }

      } catch (error) {
        session.errors++;
        console.error(`❌ Trading loop error for session ${session.sessionId}:`, error);
        
        // Retry after error
        if (session.isActive) {
          const retryTimeout = setTimeout(executeNextTrade, 10000);
          this.sessionIntervals.set(session.sessionId, retryTimeout);
        }
      }
    };

    // Start first trade
    const initialTimeout = setTimeout(executeNextTrade, 1000);
    this.sessionIntervals.set(session.sessionId, initialTimeout);
  }

  // Stop a trading session
  async stopSession(sessionId: string): Promise<boolean> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) return false;

      session.isActive = false;
      
      // Clear interval
      const interval = this.sessionIntervals.get(sessionId);
      if (interval) {
        clearTimeout(interval);
        this.sessionIntervals.delete(sessionId);
      }

      console.log(`⏹️ SESSION STOPPED: ${sessionId}`);
      console.log(`📊 Total trades: ${session.totalTrades}`);
      console.log(`💰 Total volume: ${session.totalVolume.toFixed(6)} SOL`);
      console.log(`⚠️ Errors: ${session.errors}`);

      return true;

    } catch (error) {
      console.error(`❌ Failed to stop session: ${error}`);
      return false;
    }
  }

  // Get session status
  getSessionStatus(sessionId: string): any {
    const session = this.activeSessions.get(sessionId);
    if (!session) return null;

    const runtime = Date.now() - session.startTime.getTime();
    const runtimeHours = runtime / (1000 * 60 * 60);

    return {
      isActive: session.isActive,
      startTime: session.startTime,
      runtime: `${runtimeHours.toFixed(2)} hours`,
      totalTrades: session.totalTrades,
      totalVolume: session.totalVolume,
      currentBalance: session.tradingBalance,
      lastTradeTime: session.lastTradeTime,
      errors: session.errors,
      successRate: session.totalTrades > 0 ? ((session.totalTrades - session.errors) / session.totalTrades * 100).toFixed(2) + '%' : '0%'
    };
  }

  // Get organic trade pattern
  private getNextTradeType(session: BotSession): 'BUY' | 'SELL' {
    // Create organic pattern based on trade count
    const patterns = ['BUY', 'SELL', 'BUY', 'SELL', 'SELL', 'BUY', 'BUY', 'SELL'];
    return patterns[session.totalTrades % patterns.length] as 'BUY' | 'SELL';
  }

  // Calculate optimal trade amount
  private calculateTradeAmount(session: BotSession): number {
    // Ultra-micro trading: 0.0001-0.0005 SOL per trade
    const baseAmount = 0.0001;
    const maxAmount = Math.min(0.0005, session.tradingBalance * 0.1);
    
    return Math.max(baseAmount, Math.random() * maxAmount);
  }

  // Reconstruct keypair from stored wallet
  private reconstructKeypair(userWallet: UserWallet): Keypair {
    const privateKeyBuffer = Buffer.from(userWallet.privateKey, 'base64');
    return Keypair.fromSecretKey(privateKeyBuffer);
  }

  // Get all active sessions
  getActiveSessions(): BotSession[] {
    return Array.from(this.activeSessions.values());
  }

  // Cleanup finished sessions
  cleanupSessions(): void {
    this.activeSessions.forEach((session, sessionId) => {
      if (!session.isActive && session.tradingBalance < 0.0001) {
        console.log(`🧹 Cleaning up finished session: ${sessionId}`);
        this.activeSessions.delete(sessionId);
        
        const interval = this.sessionIntervals.get(sessionId);
        if (interval) {
          clearTimeout(interval);
          this.sessionIntervals.delete(sessionId);
        }
      }
    });
  }
}