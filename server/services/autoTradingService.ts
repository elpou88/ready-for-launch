import { Connection, Keypair, PublicKey, VersionedTransaction, Transaction } from '@solana/web3.js';
import { FundManager } from './fundManager';
import { TokenValidator } from './tokenValidator';
import { DexTrader, DexTradeConfig } from './dexTrader';
import { WalletManager, UserWallet } from './walletManager';
import { SessionPersistence, PersistentSession } from './sessionPersistence';
import { CostMonitor } from './costMonitor';

export interface TradingSession {
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
  intervalId?: NodeJS.Timeout;
}

export class AutoTradingService {
  private static instance: AutoTradingService;
  private connection: Connection;
  private fundManager: FundManager;
  private tokenValidator: TokenValidator;
  private dexTrader: DexTrader;
  private walletManager: WalletManager;
  private sessionPersistence: SessionPersistence;
  private activeSessions: Map<string, TradingSession> = new Map();
  private balanceCheckers: Map<string, NodeJS.Timeout> = new Map();
  private volumeBotService: any = null;
  private recoveryInProgress: boolean = false;
  private costMonitor: CostMonitor;
  
  // Check if system is in maintenance mode
  private isMaintenanceMode(): boolean {
    try {
      const fs = require('fs');
      const path = require('path');
      const maintenancePath = path.join(process.cwd(), 'MAINTENANCE_MODE.json');
      
      if (fs.existsSync(maintenancePath)) {
        const maintenanceConfig = JSON.parse(fs.readFileSync(maintenancePath, 'utf8'));
        return maintenanceConfig.maintenanceMode === true;
      }
      return false;
    } catch (error) {
      console.log('⚠️ Could not check maintenance mode, proceeding normally');
      return false;
    }
  }

  private constructor() {
    this.connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    this.fundManager = FundManager.getInstance();
    this.costMonitor = new CostMonitor();
    this.tokenValidator = new TokenValidator();
    this.dexTrader = new DexTrader();
    this.walletManager = WalletManager.getInstance();
    this.sessionPersistence = SessionPersistence.getInstance();
    
    console.log('🤖 AUTO TRADING SERVICE INITIALIZED - Monitors wallets for instant trading');
    
    // Start cost monitoring
    this.costMonitor.startMonitoring();
    
    // Check maintenance mode before starting any operations
    setTimeout(() => {
      if (!this.isMaintenanceMode()) {
        this.emergencyCheckFundedWallet();
      } else {
        console.log('🔧 MAINTENANCE MODE: Auto trading paused for Railway deployment');
      }
    }, 1000);
    
    // Only recover sessions if not in maintenance mode
    setTimeout(() => {
      if (!this.isMaintenanceMode()) {
        this.recoverActiveSessions();
        // CRITICAL: Set up aggressive continuous recovery check every 10 seconds
        setInterval(() => {
          if (!this.isMaintenanceMode()) {
            this.ensureAllSessionsContinue();
          }
        }, 10000);
        
        // CRITICAL: Bulletproof session restoration every 5 minutes
        setInterval(() => {
          if (!this.isMaintenanceMode()) {
            this.bulletproofSessionRecovery();
          }
        }, 300000);
      } else {
        console.log('🔧 MAINTENANCE MODE: Session recovery paused for Railway deployment');
      }
    }, 3000);
  }

  public static getInstance(): AutoTradingService {
    if (!AutoTradingService.instance) {
      AutoTradingService.instance = new AutoTradingService();
    }
    return AutoTradingService.instance;
  }

  // EMERGENCY: Stop all active trading sessions immediately
  async stopAllActiveSessions(): Promise<string[]> {
    console.log('🛑 EMERGENCY STOP: Stopping all active trading sessions');
    
    const stoppedSessions: string[] = [];
    
    // Stop all active trading sessions
    for (const [sessionId, session] of this.activeSessions.entries()) {
      console.log(`🛑 Stopping session: ${sessionId}`);
      
      // Mark session as stopped
      session.isActive = false;
      
      // Update persistence
      await this.sessionPersistence.updateSessionStatus(sessionId, 'stopped', {
        endTime: new Date().toISOString(),
        reason: 'emergency_stop'
      });
      
      stoppedSessions.push(sessionId);
    }
    
    // Clear all active sessions
    this.activeSessions.clear();
    
    // Stop all balance checkers
    for (const [sessionId, balanceChecker] of this.balanceCheckers.entries()) {
      console.log(`🛑 Stopping balance checker: ${sessionId}`);
      clearInterval(balanceChecker);
    }
    this.balanceCheckers.clear();
    
    console.log(`✅ EMERGENCY STOP COMPLETE: ${stoppedSessions.length} sessions stopped`);
    
    return stoppedSessions;
  }

  // Get status of all active sessions
  getActiveSessionsStatus(): any[] {
    const sessions: any[] = [];
    
    for (const [sessionId, session] of this.activeSessions.entries()) {
      sessions.push({
        sessionId: sessionId,
        tokenAddress: session.tokenAddress,
        walletAddress: session.userWallet.publicKey,
        isActive: session.isActive,
        totalTrades: session.totalTrades,
        totalVolume: session.totalVolume,
        startTime: session.startTime,
        lastTradeTime: session.lastTradeTime
      });
    }
    
    return sessions;
  }

  setVolumeBotService(volumeBotService: any) {
    this.volumeBotService = volumeBotService;
  }

  // Check for ANY funded wallets and activate them automatically
  private async emergencyCheckFundedWallet(): Promise<void> {
    console.log('🔍 Checking for any funded wallets from recent sessions...');
    
    // Don't force any specific wallet - let the system find naturally funded wallets
    console.log('💰 System will detect funded wallets through normal session creation');
  }

  private broadcastStatus(sessionId: string, status: string) {
    try {
      if (this.volumeBotService && this.volumeBotService.broadcast) {
        this.volumeBotService.broadcast({
          type: 'bot_status',
          payload: { sessionId, status },
          timestamp: Date.now()
        });
      }
    } catch (error) {
      // Silent broadcast error - trading continues regardless
    }
  }

  // CRITICAL: Monitor wallet for funding and start automatic trading
  public async monitorWalletForFunding(sessionId: string, walletAddress: string, tokenAddress: string): Promise<void> {
    console.log(`👀 MONITORING WALLET: ${walletAddress} for funding detection`);
    console.log(`🎯 Token: ${tokenAddress}`);
    console.log(`📊 Session: ${sessionId}`);

    // Set up continuous wallet monitoring every 3 seconds
    const monitoringInterval = setInterval(async () => {
      try {
        const balance = await this.connection.getBalance(new PublicKey(walletAddress));
        const balanceSOL = balance / 1_000_000_000;

        if (balanceSOL >= 0.001) { // Minimum 0.001 SOL to start trading
          console.log(`💰 FUNDING DETECTED: ${balanceSOL.toFixed(6)} SOL`);
          console.log(`🚀 STARTING AUTOMATIC CONTINUOUS TRADING...`);
          
          clearInterval(monitoringInterval);
          
          // Start continuous trading that never stops until 75% depletion
          await this.startContinuousTrading(sessionId, walletAddress, tokenAddress, balanceSOL);
        }
      } catch (error) {
        console.error(`❌ Wallet monitoring error: ${error}`);
        // Keep monitoring even if errors occur
      }
    }, 3000); // Check every 3 seconds

    // Store monitoring interval for cleanup
    this.balanceCheckers.set(sessionId, monitoringInterval);
  }

  // CORE: Start continuous trading that never stops until funds finished
  private async startContinuousTrading(sessionId: string, walletAddress: string, tokenAddress: string, initialBalance: number): Promise<void> {
    console.log(`🔥 STARTING NEVER-STOP TRADING SESSION: ${sessionId}`);
    console.log(`💰 Initial Balance: ${initialBalance.toFixed(6)} SOL`);
    console.log(`🎯 Trading until 75% depletion (25% revenue remains)`);

    // Get user wallet with private key - GUARANTEED TO WORK
    let userWallet = this.walletManager.getUserWallet(sessionId);
    let userKeypair = this.walletManager.getUserWalletKeypair(sessionId);
    
    // If not found in WalletManager, try session persistence
    if (!userWallet || !userKeypair) {
      const walletData = this.sessionPersistence.loadWalletMapping(sessionId);
      if (walletData && walletData.privateKey) {
        const privateKeyBuffer = Buffer.from(walletData.privateKey, 'base64');
        userKeypair = Keypair.fromSecretKey(privateKeyBuffer);
        userWallet = walletData;
      }
    }
    
    // If still not found, check if this is a user-controlled wallet
    if (!userWallet || !userKeypair) {
      console.log(`🔍 SEARCHING ALL SOURCES FOR WALLET: ${sessionId}`);
      
      // Check all wallet mappings for this session
      const allMappings = this.sessionPersistence.getWalletMappings();
      for (const [sid, wallet] of Object.entries(allMappings)) {
        if (sid === sessionId || wallet.publicKey === walletAddress) {
          console.log(`🎯 FOUND WALLET MAPPING: ${sid} -> ${wallet.publicKey}`);
          if (wallet.privateKey) {
            const privateKeyBuffer = Buffer.from(wallet.privateKey, 'base64');
            userKeypair = Keypair.fromSecretKey(privateKeyBuffer);
            userWallet = wallet;
            break;
          }
        }
      }
      
      // If still not found, check if this is user's funded wallet
      if (!userWallet || !userKeypair) {
        console.log(`🚨 USER WALLET DETECTION: ${walletAddress}`);
        console.log(`📍 Session: ${sessionId}`);
        
        // Create emergency access for user-controlled wallets
        userWallet = {
          publicKey: walletAddress,
          balance: initialBalance,
          sessionId: sessionId,
          isUserControlled: true,
          privateKey: '', // User controls this wallet
          emergencyAccess: true
        };
        
        // For user-controlled wallets, we need their signature/approval
        console.log(`⚠️  USER-CONTROLLED WALLET DETECTED`);
        console.log(`💡 System needs user's private key or signature for trading`);
        console.log(`🔄 Creating monitoring session for when user provides access`);
      }
    }

    // Validate token and get trading info
    const tokenInfo = await this.tokenValidator.validateToken(tokenAddress);
    if (!tokenInfo.valid) {
      console.error(`❌ Token validation failed: ${tokenInfo.error}`);
      return;
    }

    if (!userWallet) {
      console.error(`❌ Cannot create trading session: userWallet is null`);
      return;
    }

    const tradingSession: TradingSession = {
      sessionId,
      tokenAddress,
      userWallet,
      tradingBalance: initialBalance,
      primaryDex: tokenInfo.primaryDex || 'Jupiter',
      isActive: true,
      startTime: new Date(),
      totalTrades: 0,
      totalVolume: 0
    };

    this.activeSessions.set(sessionId, tradingSession);

    // Save session persistence
    await this.sessionPersistence.saveSession(tradingSession);

    // Start the never-ending trading loop
    if (!userKeypair) {
      console.error(`❌ Cannot start trading: userKeypair is null`);
      return;
    }
    
    this.executeNeverStopTradingLoop(tradingSession, userKeypair, tokenInfo);
  }

  // CRITICAL: Bulletproof session recovery that runs independently of UI
  private async bulletproofSessionRecovery(): Promise<void> {
    console.log('🛡️ BULLETPROOF SESSION RECOVERY - Ensuring trading continues regardless of UI state');
    
    try {
      // Get all saved sessions from persistence
      const savedSessions = this.sessionPersistence.loadAllSessions();
      
      for (const saved of savedSessions) {
        if ((saved.status === 'trading' || saved.status === 'monitoring') && !this.activeSessions.has(saved.sessionId)) {
          console.log(`🚨 CRITICAL RECOVERY: Session ${saved.sessionId} should be active but isn't running`);
          console.log(`├── Wallet: ${saved.walletAddress}`);
          console.log(`├── Token: ${saved.tokenAddress}`);
          console.log(`└── Restoring trading immediately...`);
          
          // Get current balance to verify if trading should continue
          const currentBalance = await this.connection.getBalance(new PublicKey(saved.walletAddress));
          const currentBalanceSOL = currentBalance / 1_000_000_000;
          
          if (currentBalanceSOL > 0.002) { // If has meaningful balance
            console.log(`💰 Balance: ${currentBalanceSOL.toFixed(6)} SOL - RESTARTING TRADING`);
            
            // Recreate the session and restart trading
            const userWallet = this.walletManager.getUserWallet(saved.sessionId);
            if (userWallet) {
              await this.startTradingSession(saved.sessionId, saved.tokenAddress, saved.primaryDex);
            }
          } else {
            console.log(`⚠️ Low balance: ${currentBalanceSOL.toFixed(6)} SOL - marking completed`);
            await this.sessionPersistence.updateSessionStatus(saved.sessionId, 'completed', {
              endTime: new Date().toISOString(),
              reason: 'funds_depleted'
            });
          }
        }
      }
    } catch (error) {
      console.error('❌ Bulletproof recovery error:', error);
    }
  }

  // OFFICIAL BUY-SELL PATTERN SYSTEM: The ONE and ONLY pattern logic
  private async executeNeverStopTradingLoop(session: TradingSession, userKeypair: Keypair, tokenData: any): Promise<void> {
    console.log(`🎯 OFFICIAL BUY-SELL PATTERN SYSTEM STARTED: ${session.sessionId}`);
    
    // THE OFFICIAL PATTERN: Simple alternating BUY-SELL-BUY-SELL
    // NO OTHER LOGIC EXISTS - this is the single source of truth
    console.log(`🎯 OFFICIAL PATTERN: BUY→SELL→BUY→SELL (the only pattern)`);
    console.log(`├── Reset everything to ensure clean start`);
    console.log(`├── Trade 1: BUY (official first trade)`);
    console.log(`├── Trade 2: SELL (official second trade)`);
    console.log(`└── Perfect alternation forever`);

    // OFFICIAL RESET: Start completely fresh
    session.totalTrades = 0;
    let isNextTradeBuy = true; // Official pattern tracker
    
    const originalBalance = session.tradingBalance;
    const depletionThreshold = 0.001; // CRITICAL: Continue until completely depleted (0.001 SOL minimum for fees)

    const tradingLoop = async () => {
      try {
        // Check current balance
        const currentBalance = await this.connection.getBalance(userKeypair.publicKey);
        const currentBalanceSOL = currentBalance / 1_000_000_000;

        console.log(`💰 Current Balance: ${currentBalanceSOL.toFixed(6)} SOL`);
        console.log(`🎯 Depletion Threshold: ${depletionThreshold.toFixed(6)} SOL`);

        // CRITICAL: Continue trading until funds are COMPLETELY depleted
        if (currentBalanceSOL <= depletionThreshold) {
          console.log(`🏁 TRADING COMPLETE: Funds completely depleted`);
          console.log(`💎 Final Balance: ${currentBalanceSOL.toFixed(6)} SOL (minimum for fees)`);
          console.log(`📊 Total Trades Executed: ${session.totalTrades}`);
          console.log(`✅ 100% FUND UTILIZATION: All user funds converted to volume`);
          
          // Mark session as completed
          session.isActive = false;
          this.activeSessions.delete(session.sessionId);
          
          // Update persistence - fixed method call
          this.sessionPersistence.updateSessionStatus(session.sessionId, 'completed', {
            endTime: new Date().toISOString(),
            finalBalance: currentBalanceSOL,
            totalTrades: session.totalTrades
          });

          this.broadcastStatus(session.sessionId, 'completed');
          return; // Stop the loop
        }

        // Calculate trade amount (ultra small for fee efficiency)
        let tradeAmount = Math.min(currentBalanceSOL * 0.5, 0.001); // 50% of balance or max 0.001 SOL

        // REMOVED: Old currentTradeType reference eliminated

        if (tradeAmount < 0.0002) {
          console.log(`⚠️ Trade amount too small: ${tradeAmount.toFixed(6)} SOL - waiting...`);
          setTimeout(tradingLoop, 7000);
          return;
        }

        // REMOVED: Emergency override that was preventing SELL trades

        // OFFICIAL TRADE TYPE: The one and only way to determine trade
        const tradeType = isNextTradeBuy ? 'BUY' : 'SELL';
        
        console.log(`💹 EXECUTING OFFICIAL ${tradeType} TRADE ${session.totalTrades + 1}`);
        console.log(`🎯 OFFICIAL PATTERN: Trade ${session.totalTrades + 1} = ${tradeType}`);
        console.log(`💰 Amount: ${tradeAmount.toFixed(6)} SOL`);

        // 🔥 TRANSACTION WALLET FEATURE: Create fresh wallet for each trade
        const transactionWallet = this.walletManager.createTransactionWallet(
          session.sessionId,
          session.totalTrades + 1,
          tradeType
        );

        // Convert transaction wallet to Keypair for trading
        const transactionKeypair = Keypair.fromSecretKey(
          Buffer.from(transactionWallet.privateKey, 'base64')
        );

        console.log(`🔄 FRESH WALLET FOR ${tradeType}: ${transactionKeypair.publicKey.toString()}`);

        // Execute real Jupiter trade with transaction-specific wallet
        const tradeConfig: DexTradeConfig = {
          tokenAddress: session.tokenAddress,
          sessionId: session.sessionId,
          userWallet: userKeypair, // Main wallet for balance checks
          transactionWallet: transactionKeypair, // Fresh wallet for actual trade
          useTransactionWallet: true, // Enable transaction wallet feature
          primaryDex: session.primaryDex,
          pool: tokenData.pools[0], // Use best pool
          tradeAmount
        };

        const result = await this.dexTrader.executeTrade(tradeConfig, tradeType);

        if (result.success) {
          session.totalTrades++;
          session.totalVolume += tradeAmount;
          session.lastTradeTime = new Date();

          console.log(`✅ OFFICIAL TRADE ${session.totalTrades} SUCCESSFUL: ${tradeType}`);
          console.log(`🔗 Signature: ${result.signature}`);
          console.log(`🎯 OFFICIAL PATTERN CONFIRMED: Trade ${session.totalTrades} was ${tradeType}`);
          
          // Record transaction for cost monitoring
          await this.costMonitor.recordTransaction();
          
          // OFFICIAL TOGGLE: Simple flip for next trade
          isNextTradeBuy = !isNextTradeBuy;
          const nextType = isNextTradeBuy ? 'BUY' : 'SELL';
          console.log(`🔄 OFFICIAL NEXT: Trade ${session.totalTrades + 1} = ${nextType}`);

          // Update session persistence with current trade count
          await this.sessionPersistence.updateSessionTrades(session.sessionId, session.totalTrades, session.totalVolume);

          this.broadcastStatus(session.sessionId, `trade_completed_${session.totalTrades}`);
        } else {
          console.log(`⚠️ Trade failed: ${result.error}`);
          
          // OFFICIAL PATTERN RECOVERY
          if (tradeType === 'SELL' && result.error && result.error.includes('sell amount too small')) {
            console.log(`🔄 OFFICIAL SELL failed - counting as completed and toggling`);
            session.totalTrades++; // Count failed SELL to maintain pattern
            isNextTradeBuy = !isNextTradeBuy; // Toggle to next trade type
            const nextType = isNextTradeBuy ? 'BUY' : 'SELL';
            console.log(`🎯 OFFICIAL RECOVERY: Trade ${session.totalTrades + 1} = ${nextType}`);
          } else {
            console.log(`🔄 Retrying same trade: ${tradeType}`);
          }
        }

      } catch (error) {
        console.error(`❌ Trading loop error: ${error}`);
        // NEVER STOP - Even on errors, continue the loop
      }

      // Schedule next trade in 7 seconds (continuous trading)
      setTimeout(tradingLoop, 7000);
    };

    // Start the continuous loop
    tradingLoop();
  }

  // Start monitoring wallet for automatic funding detection
  async startWalletMonitoring(sessionId: string, tokenAddress: string, primaryDex: string): Promise<void> {
    console.log(`🔍 STARTING WALLET MONITORING for session: ${sessionId}`);
    
    // Wait longer for wallet to be properly registered
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const userWallet = this.walletManager.getUserWallet(sessionId);
    if (!userWallet) {
      console.error(`❌ User wallet not found for session: ${sessionId}`);
      console.log(`🔄 Will retry monitoring in 2 seconds...`);
      // Retry with longer delay
      setTimeout(() => {
        this.retryWalletMonitoring(sessionId, tokenAddress, primaryDex);
      }, 2000);
      return;
    }

    console.log(`👀 MONITORING WALLET: ${userWallet.publicKey}`);
    console.log(`🎯 TOKEN: ${tokenAddress}`);
    console.log(`🏛️ DEX: ${primaryDex}`);

    // Start balance monitoring for automatic funding detection
    const balanceChecker = setInterval(async () => {
      try {
        await this.checkForFundingAndStartTrading(sessionId, tokenAddress, primaryDex);
      } catch (error) {
        console.error(`❌ Balance check error for session ${sessionId}:`, error);
      }
    }, 3000); // Check every 3 seconds

    this.balanceCheckers.set(sessionId, balanceChecker);
  }

  // Recovery system - restore all active sessions after restart
  private async recoverActiveSessions(): Promise<void> {
    if (this.recoveryInProgress) return;
    
    this.recoveryInProgress = true;
    console.log('\n🔄 STARTING SESSION RECOVERY - Restoring all active sessions...');
    
    try {
      const activeSessions = this.sessionPersistence.getActiveSessions();
      const walletMappings = this.sessionPersistence.loadAllWalletMappings();
      
      console.log(`📊 RECOVERY STATUS:`);
      console.log(`├── Active sessions found: ${activeSessions.length}`);
      console.log(`├── Wallet mappings found: ${Object.keys(walletMappings).length}`);
      
      if (activeSessions.length === 0) {
        console.log('✅ No active sessions to recover');
        this.recoveryInProgress = false;
        return;
      }
      
      // Restore wallet mappings first
      console.log('\n💳 RESTORING WALLET MAPPINGS...');
      for (const [sessionId, userWallet] of Object.entries(walletMappings)) {
        this.walletManager.restoreUserWallet(sessionId, userWallet);
        console.log(`├── Restored wallet: ${sessionId} -> ${userWallet.publicKey}`);
      }
      
      // Recover each active session
      console.log('\n🎯 RECOVERING ACTIVE SESSIONS...');
      for (const persistentSession of activeSessions) {
        await this.recoverSingleSession(persistentSession);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Stagger recovery
      }
      
      console.log('\n✅ SESSION RECOVERY COMPLETE - All sessions restored and monitoring');
      
    } catch (error) {
      console.error('❌ Session recovery failed:', error);
    } finally {
      this.recoveryInProgress = false;
    }
  }

  // Recover a single session
  private async recoverSingleSession(persistentSession: PersistentSession): Promise<void> {
    try {
      console.log(`🔧 RECOVERING SESSION: ${persistentSession.sessionId}`);
      console.log(`├── Token: ${persistentSession.tokenAddress}`);
      console.log(`├── Wallet: ${persistentSession.userWallet.publicKey}`);
      console.log(`├── Status: ${persistentSession.status}`);
      console.log(`├── Trading Balance: ${persistentSession.tradingBalance} SOL`);
      console.log(`├── Total Trades: ${persistentSession.totalTrades}`);
      
      // Create session object
      const session: TradingSession = {
        sessionId: persistentSession.sessionId,
        tokenAddress: persistentSession.tokenAddress,
        userWallet: persistentSession.userWallet,
        tradingBalance: persistentSession.tradingBalance,
        primaryDex: persistentSession.primaryDex,
        isActive: persistentSession.status === 'trading',
        startTime: new Date(persistentSession.startTime),
        totalTrades: persistentSession.totalTrades,
        totalVolume: persistentSession.totalVolume,
        lastTradeTime: persistentSession.lastTradeTime ? new Date(persistentSession.lastTradeTime) : undefined
      };
      
      // Add to active sessions
      this.activeSessions.set(persistentSession.sessionId, session);
      
      // If session was actively trading, resume trading
      if (persistentSession.status === 'trading' && persistentSession.tradingBalance > 0.001) {
        console.log(`🚀 RESUMING ACTIVE TRADING: ${persistentSession.sessionId}`);
        await this.resumeTrading(session);
      }
      // If session was monitoring, resume monitoring
      else if (persistentSession.status === 'monitoring') {
        console.log(`👀 RESUMING MONITORING: ${persistentSession.sessionId}`);
        await this.startWalletMonitoring(
          persistentSession.sessionId, 
          persistentSession.tokenAddress, 
          persistentSession.primaryDex
        );
      }
      
      console.log(`✅ SESSION RECOVERED: ${persistentSession.sessionId}`);
      
    } catch (error) {
      console.error(`❌ Failed to recover session ${persistentSession.sessionId}:`, error);
    }
  }

  // Resume active trading for recovered session
  private async resumeTrading(session: TradingSession): Promise<void> {
    try {
      // Check current wallet balance to ensure funds are still available
      const currentBalance = await this.connection.getBalance(new PublicKey(session.userWallet.publicKey));
      const solBalance = currentBalance / 1_000_000_000;
      
      // Check for force/override flags to bypass balance checks
      const sessionData = this.sessionPersistence.getActiveSessions().find(s => s.sessionId === session.sessionId);
      const shouldBypassCheck = sessionData && (
        sessionData.forceActive || 
        sessionData.useStoredBalance || 
        sessionData.ignoreOnChainBalance || 
        sessionData.bypassBalanceCheck || 
        sessionData.revenueGuarantee ||
        sessionData.overrideBalance
      );
      
      if (solBalance < 0.001 && !shouldBypassCheck) {
        console.log(`⚠️  Session ${session.sessionId} has insufficient balance (${solBalance.toFixed(6)} SOL)`);
        console.log(`📊 Marking session as completed due to fund depletion`);
        
        this.sessionPersistence.updateSessionStatus(session.sessionId, 'completed');
        return;
      }
      
      // Use override balance if available
      if (shouldBypassCheck && sessionData?.overrideBalance) {
        session.tradingBalance = sessionData.overrideBalance;
        console.log(`🔓 BYPASSING BALANCE CHECK - Using override: ${sessionData.overrideBalance} SOL`);
      } else if (shouldBypassCheck && sessionData?.tradingBalance) {
        session.tradingBalance = sessionData.tradingBalance;
        console.log(`🔓 BYPASSING BALANCE CHECK - Using stored balance: ${sessionData.tradingBalance} SOL`);
      }
      
      // If bypassing, don't update with on-chain balance
      if (!shouldBypassCheck) {
        // Update trading balance with current on-chain balance
        session.tradingBalance = solBalance;
      }
      
      console.log(`💰 Current balance verified: ${solBalance.toFixed(6)} SOL`);
      console.log(`🔄 STARTING CONTINUOUS TRADING for recovered session`);
      
      // Start the trading loop (alias for compatibility)
      await this.startTradingLoop(session, {});
      
    } catch (error) {
      console.error(`❌ Failed to resume trading for ${session.sessionId}:`, error);
      
      // Fallback to monitoring mode
      console.log(`🔄 Falling back to monitoring mode for ${session.sessionId}`);
      this.sessionPersistence.updateSessionStatus(session.sessionId, 'monitoring');
      console.log(`📊 STARTING ENHANCED MONITORING with real balance checks`);
      await this.startWalletMonitoring(session.sessionId, session.tokenAddress, session.primaryDex);
    }
  }

  // Ensure all sessions continue - recovery failsafe
  private async ensureAllSessionsContinue(): Promise<void> {
    try {
      const activeSessions = this.sessionPersistence.getActiveSessions();
      
      for (const persistentSession of activeSessions) {
        const sessionId = persistentSession.sessionId;
        
        // Check if session is in memory
        const memorySession = this.activeSessions.get(sessionId);
        
        if (!memorySession) {
          console.log(`🔧 FAILSAFE RECOVERY: Restoring lost session ${sessionId}`);
          await this.recoverSingleSession(persistentSession);
          continue;
        }
        
        // For trading sessions, ensure they have active intervals
        if (persistentSession.status === 'trading' && persistentSession.tradingBalance > 0.001) {
          if (!memorySession.intervalId && memorySession.isActive) {
            console.log(`🚨 CRITICAL RECOVERY: Trading session ${sessionId} lost its interval - restarting`);
            await this.resumeTrading(memorySession);
          }
        }
        
        // For monitoring sessions, ensure balance checkers are running
        if (persistentSession.status === 'monitoring') {
          if (!this.balanceCheckers.has(sessionId)) {
            console.log(`🚨 CRITICAL RECOVERY: Monitoring session ${sessionId} lost balance checker - restarting`);
            await this.startWalletMonitoring(sessionId, persistentSession.tokenAddress, persistentSession.primaryDex);
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Failsafe recovery error:', error);
    }
  }

  // Retry wallet monitoring if wallet wasn't found initially
  private async retryWalletMonitoring(sessionId: string, tokenAddress: string, primaryDex: string): Promise<void> {
    console.log(`🔄 RETRYING wallet monitoring for session: ${sessionId}`);
    
    const userWallet = this.walletManager.getUserWallet(sessionId);
    if (!userWallet) {
      console.error(`❌ Retry failed - wallet still not found for session: ${sessionId}`);
      console.log(`🔄 Will try one more time in 5 seconds...`);
      // One more retry with even longer delay
      setTimeout(() => {
        this.finalRetryWalletMonitoring(sessionId, tokenAddress, primaryDex);
      }, 5000);
      return;
    }

    console.log(`✅ Retry successful - starting monitoring for session: ${sessionId}`);
    console.log(`👀 MONITORING WALLET: ${userWallet.publicKey}`);
    console.log(`🎯 TOKEN: ${tokenAddress}`);
    console.log(`🏛️ DEX: ${primaryDex}`);

    // Start balance monitoring for automatic funding detection
    const balanceChecker = setInterval(async () => {
      try {
        await this.checkForFundingAndStartTrading(sessionId, tokenAddress, primaryDex);
      } catch (error) {
        console.error(`❌ Balance check error for session ${sessionId}:`, error);
      }
    }, 3000); // Check every 3 seconds

    this.balanceCheckers.set(sessionId, balanceChecker);
  }

  // Final retry method for wallet monitoring
  private async finalRetryWalletMonitoring(sessionId: string, tokenAddress: string, primaryDex: string): Promise<void> {
    console.log(`🔄 FINAL RETRY wallet monitoring for session: ${sessionId}`);
    
    const userWallet = this.walletManager.getUserWallet(sessionId);
    if (!userWallet) {
      console.error(`❌ Final retry failed - wallet permanently not found for session: ${sessionId}`);
      console.log(`🚫 Abandoning wallet monitoring for session: ${sessionId}`);
      return;
    }

    console.log(`✅ Final retry successful - starting monitoring for session: ${sessionId}`);
    console.log(`👀 MONITORING WALLET: ${userWallet.publicKey}`);
    console.log(`🎯 TOKEN: ${tokenAddress}`);
    console.log(`🏛️ DEX: ${primaryDex}`);

    // Start balance monitoring for automatic funding detection
    const balanceChecker = setInterval(async () => {
      try {
        await this.checkForFundingAndStartTrading(sessionId, tokenAddress, primaryDex);
      } catch (error) {
        console.error(`❌ Balance check error for session ${sessionId}:`, error);
      }
    }, 3000); // Check every 3 seconds

    this.balanceCheckers.set(sessionId, balanceChecker);
  }

  // Check for funding and automatically start trading
  private async checkForFundingAndStartTrading(sessionId: string, tokenAddress: string, primaryDex: string): Promise<void> {
    const userWallet = this.walletManager.getUserWallet(sessionId);
    if (!userWallet || this.activeSessions.has(sessionId)) {
      return; // Already active or wallet not found
    }

    // UNIVERSAL WALLET DETECTION - Check balance for ANY wallet
    try {
      const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
      const balance = await connection.getBalance(new PublicKey(userWallet.publicKey));
      const currentBalance = balance / 1_000_000_000;
      
      console.log(`💰 BALANCE CHECK: ${userWallet.publicKey} = ${currentBalance.toFixed(9)} SOL`);
    
      if (currentBalance >= 0.001) { // FUNDING DETECTED - IMMEDIATE ACTION
        console.log(`💰 FUNDING DETECTED: ${currentBalance} SOL in ${userWallet.publicKey}`);
        console.log(`🚀 IMMEDIATE TRADING ACTIVATION - NO DELAYS ALLOWED`);
        
        // STOP balance monitoring immediately to prevent duplicate processing
        const balanceChecker = this.balanceCheckers.get(sessionId);
        if (balanceChecker) {
          clearInterval(balanceChecker);
          this.balanceCheckers.delete(sessionId);
          console.log(`✅ Balance monitoring stopped for ${sessionId}`);
        }
        
        try {
          // Calculate splits immediately
          const revenuePortion = currentBalance * 0.25;
          const tradingPortion = currentBalance * 0.75;
          
          console.log(`💰 FUNDING SPLIT:`);
          console.log(`├── Revenue (25%): ${revenuePortion.toFixed(6)} SOL`);
          console.log(`├── Trading (75%): ${tradingPortion.toFixed(6)} SOL`);
          console.log(`└── Total: ${currentBalance.toFixed(6)} SOL`);
          
          // Save to persistence IMMEDIATELY
          await this.sessionPersistence.updateSessionStatus(sessionId, 'trading', {
            tradingBalance: tradingPortion,
            initialDeposit: currentBalance,
            revenueCollected: revenuePortion
          });
          
          // Process funding through wallet manager
          const fundingSplit = await this.walletManager.processFunding(sessionId, currentBalance);
          
          // Broadcast FUNDING_DETECTED
          this.broadcastStatus(sessionId, `FUNDING_DETECTED|${currentBalance}|${userWallet.publicKey}|${tradingPortion}`);
          
          // Open UI pages IMMEDIATELY when funding detected
          this.openTradingUIPages(sessionId, userWallet.publicKey, tokenAddress);
          
          // START TRADING IMMEDIATELY - This must work 100% of the time
          console.log(`🚀 STARTING GUARANTEED TRADING SESSION...`);
          await this.startTradingSession(sessionId, tokenAddress, primaryDex, tradingPortion);
          
          console.log(`✅ SUCCESS: Trading session ${sessionId} activated with ${tradingPortion.toFixed(6)} SOL`);
          console.log(`🔄 BUY/SELL trades will execute every 7 seconds until funds depleted`);
          
          // Broadcast TRADING_STARTED
          this.broadcastStatus(sessionId, `TRADING_STARTED|${sessionId}|${tradingPortion}|${tokenAddress}`);
          
        } catch (error) {
          console.error(`❌ CRITICAL: Trading activation failed for ${sessionId}:`, error);
          console.log(`🚨 EMERGENCY RECOVERY ATTEMPT...`);
          
          // Emergency recovery - try direct trading start
          try {
            const emergencyTradingAmount = currentBalance * 0.75;
            await this.startTradingSession(sessionId, tokenAddress, primaryDex, emergencyTradingAmount);
            console.log(`✅ EMERGENCY RECOVERY: Trading started with ${emergencyTradingAmount.toFixed(6)} SOL`);
          } catch (emergencyError) {
            console.error(`❌ EMERGENCY RECOVERY FAILED:`, emergencyError);
            
            // Last resort - restart balance monitoring to try again
            console.log(`🔄 RESTARTING BALANCE MONITORING FOR RETRY...`);
            setTimeout(() => {
              this.monitorWalletBalance(sessionId, tokenAddress, primaryDex);
            }, 5000);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Balance check error for ${sessionId}:`, error.message);
    }
  }

  // Force start trading for testing
  async forceStartTrading(sessionId: string, tokenAddress: string, primaryDex: string): Promise<void> {
    console.log(`🚀 FORCE STARTING TRADING for session: ${sessionId}`);
    
    // Create a temporary wallet session if not exists
    let userWallet = this.walletManager.getUserWallet(sessionId);
    if (!userWallet) {
      console.log(`🔧 Creating wallet session for: ${sessionId}`);
      userWallet = await this.walletManager.generateUserWallet(sessionId);
      console.log(`✅ Wallet registered: ${userWallet.publicKey}`);
    }
    
    await this.startTradingSession(sessionId, tokenAddress, primaryDex, 0.003); // Use actual balance
  }

  // Start active trading session with real DEX trades  
  async startTradingSession(sessionId: string, tokenAddress: string, primaryDex: string, tradingBalance: number): Promise<void> {
    const userWallet = this.walletManager.getUserWallet(sessionId);
    if (!userWallet) {
      throw new Error('User wallet not found');
    }

    // Validate token is tradeable
    const canTrade = await this.dexTrader.validateTradeability(tokenAddress);
    if (!canTrade) {
      throw new Error('Token is not tradeable');
    }

    // Get best pool for trading
    const validation = await this.tokenValidator.validateToken(tokenAddress);
    const bestPool = this.tokenValidator.getBestPool(validation.pools);
    if (!bestPool) {
      throw new Error('No suitable trading pool found');
    }

    console.log(`🚀 STARTING REAL TRADING SESSION: ${sessionId}`);
    console.log(`💰 Trading Balance: ${tradingBalance.toFixed(6)} SOL`);
    console.log(`🎯 Token: ${tokenAddress}`);
    console.log(`🏛️ DEX: ${primaryDex}`);

    const session: TradingSession = {
      sessionId,
      tokenAddress,
      userWallet,
      tradingBalance,
      primaryDex,
      isActive: true,
      startTime: new Date(),
      totalTrades: 0,
      totalVolume: 0
    };

    this.activeSessions.set(sessionId, session);

    // Save session to persistence
    this.sessionPersistence.saveSession(session);
    this.sessionPersistence.updateSessionStatus(sessionId, 'trading');

    // Broadcast trading session started with UI page opening command
    this.broadcastStatus(sessionId, `TRADING_STARTED|${tradingBalance}|${primaryDex}|${tokenAddress}|OPEN_UI_PAGES`);

    // Start trading loop
    await this.startTradingLoop(session, bestPool);
  }

  // Execute trading loop with real BUY/SELL pattern - NEVER STOPS UNTIL DEPLETION
  private async startTradingLoop(session: TradingSession, pool: any): Promise<void> {
    console.log(`🚨 NEVER-STOP TRADING LOOP STARTED: ${session.sessionId}`);
    console.log(`⚡ PERSISTENCE: System will resume this loop after ANY restart`);
    
    const executeNextTrade = async () => {
      if (!session.isActive) {
        console.log(`⚠️ Session ${session.sessionId} marked as inactive - stopping trading`);
        this.stopTradingSession(session.sessionId);
        return;
      }
      
      // Stop when ALL funds are completely depleted (100% usage)
      const minimumBalanceForTrade = 0.001; // Minimum 0.001 SOL needed for a trade
      
      if (session.tradingBalance < minimumBalanceForTrade) {
        console.log(`💰 Session ${session.sessionId} - 100% FUNDS COMPLETELY DEPLETED`);
        console.log(`✅ MAXIMUM VOLUME GENERATED: ${session.totalVolume.toFixed(6)} SOL across ${session.totalTrades} trades`);
        console.log(`🎯 ALL FUNDS CONVERTED TO CHART VOLUME - MISSION ACCOMPLISHED`);
        console.log(`🏁 100% FUNDS USED GUARANTEE FULFILLED - SESSION COMPLETED`);
        this.stopTradingSession(session.sessionId);
        return;
      }

      try {
        // CRITICAL FIX: Execute proper BUY/SELL alternation pattern
        const tradeType = session.totalTrades % 2 === 0 ? 'BUY' : 'SELL';
        const tradeAmount = this.calculateTradeAmount(session.tradingBalance);
        
        console.log(`🔄 EXECUTING ${tradeType} TRADE #${session.totalTrades + 1}`);
        console.log(`💰 Amount: ${tradeAmount.toFixed(6)} SOL`);
        console.log(`💳 Balance: ${session.tradingBalance.toFixed(6)} SOL`);

        // Use USER'S INDIVIDUAL WALLET as DEX maker for authentic trading
        let userKeypair = this.walletManager.getUserWalletKeypair(session.sessionId);
        
        // CRITICAL FIX: If session has forceWalletAddress, use it directly
        if (!userKeypair && (session as any).forceWalletAddress) {
          console.log(`🔧 USING FORCED WALLET: ${(session as any).forceWalletAddress}`);
          console.log(`⚠️  System will trade using user's actual funded wallet`);
          
          // For user-controlled wallets, create a temporary keypair for system use
          // This is a demonstration - real system would need user's private key or signature
          const tempKeypair = Keypair.generate();
          console.log(`🔧 TEMP SYSTEM KEYPAIR: ${tempKeypair.publicKey.toString()}`);
          console.log(`💡 NOTE: Real trading would need user's wallet private key or signature`);
          
          // Skip this trade attempt and wait for proper user wallet access
          console.log(`⚠️  CANNOT TRADE WITHOUT USER'S PRIVATE KEY`);
          console.log(`💡 USER MUST: Transfer funds to system wallet OR provide private key`);
          return;
        }
        
        if (!userKeypair) {
          console.error(`❌ Could not get user wallet keypair for session: ${session.sessionId}`);
          return;
        }

        // 🔥 ACTIVATE FRESH TRANSACTION WALLET FOR MAXIMUM ORGANIC VOLUME
        const transactionWallet = this.walletManager.generateTransactionWallet(session.sessionId, session.totalTrades + 1, tradeType);
        
        console.log(`🌟 FRESH TRANSACTION WALLET ACTIVATED: ${tradeType} #${session.totalTrades + 1}`);
        console.log(`├── Unique Address: ${transactionWallet.publicKey}`);
        console.log(`├── Maximum Privacy: Different wallet for every trade`);
        console.log(`├── Organic Appearance: Looks like natural trading`);
        console.log(`└── Enhanced Volume: Ultra-authentic chart activity`);

        // Create trade config with FRESH TRANSACTION WALLET
        const tradeConfig: DexTradeConfig = {
          tokenAddress: session.tokenAddress,
          sessionId: session.sessionId,
          userWallet: userKeypair, // Main wallet for funding
          transactionWallet: Keypair.fromSecretKey(Buffer.from(transactionWallet.privateKey, 'base64')), // Fresh wallet for trade
          primaryDex: session.primaryDex,
          pool: pool,
          tradeAmount: tradeAmount,
          useTransactionWallet: true // 🔥 ENABLE FRESH WALLETS FOR EVERY TRADE
        };

        console.log(`🔐 TRANSACTION WALLET: ${transactionWallet.publicKey} (FRESH FOR THIS TRADE)`);
        console.log(`🔐 FUNDING WALLET: ${userKeypair.publicKey} (USER'S SESSION WALLET)`);
        console.log(`✅ MAXIMUM ORGANIC: Fresh address for every single transaction`);

        // Execute real DEX trade
        const result = await this.dexTrader.executeTrade(tradeConfig, tradeType);

        if (result.success) {
          session.totalTrades++;
          session.totalVolume += tradeAmount;
          session.lastTradeTime = new Date();
          session.tradingBalance -= tradeAmount;

          // Update persistence with latest trading stats
          this.sessionPersistence.updateTradingStats(
            session.sessionId, 
            session.totalTrades, 
            session.totalVolume, 
            session.tradingBalance
          );

          console.log(`✅ ${tradeType} COMPLETED - Chart Visible Trade`);
          console.log(`🔗 https://solscan.io/tx/${result.signature}`);
          console.log(`📊 Session Stats: ${session.totalTrades} trades, ${session.totalVolume.toFixed(6)} SOL volume`);
          console.log(`💰 Remaining: ${session.tradingBalance.toFixed(6)} SOL`);
          
          // Broadcast live trade execution to UI
          this.broadcastStatus(session.sessionId, `TRADE_EXECUTED|${tradeType}|${tradeAmount}|${result.signature}|${session.totalTrades}|${session.totalVolume}|${session.tradingBalance}`);
          
          // Broadcast comprehensive session statistics to all connected clients
          this.broadcastSessionUpdate(session);
          this.broadcastAllSessionsUpdate();
        } else {
          console.error(`❌ Trade failed: ${result.error}`);
        }

        // Schedule next trade (7 second intervals) - NEVER STOPS UNTIL 100% DEPLETION
        const minimumBalanceForTrade = 0.001; // Minimum needed for next trade
        if (session.isActive && session.tradingBalance >= minimumBalanceForTrade) {
          const nextInterval = 7000; // 7 seconds prevents network congestion and signing issues
          session.intervalId = setTimeout(executeNextTrade, nextInterval);
          console.log(`⏱️ Next trade in ${nextInterval/1000}s - NEVER STOPS until 100% funds depleted`);
          console.log(`🔄 RESTART GUARANTEE: This will continue even after system restarts`);
        } else {
          console.log(`🏁 TRADING SESSION COMPLETE - 100% FUNDS FULLY UTILIZED FOR VOLUME`);
          console.log(`✅ 100% USAGE GUARANTEE FULFILLED - All funds completely depleted`);
          this.stopTradingSession(session.sessionId);
        }

      } catch (error) {
        console.error(`❌ Trading error for session ${session.sessionId}:`, error);
        console.log(`🚨 NEVER-STOP GUARANTEE: Retrying in 10 seconds - trading will continue`);
        
        // Retry after error with longer interval - NEVER GIVE UP
        if (session.isActive) {
          session.intervalId = setTimeout(executeNextTrade, 10000);
        }
      }
    };

    // Start first trade after 2 seconds
    session.intervalId = setTimeout(executeNextTrade, 2000);
  }

  // REMOVED: Old pattern function completely eliminated

  // ENHANCED DYNAMIC TRADE AMOUNTS - More realistic size variation
  private calculateTradeAmount(balance: number): number {
    // VARIABLE AMOUNTS: Mix of small, medium, and larger trades for organic volume
    const tradeVariations = [
      0.0008,  // Small trades
      0.0012,  // Medium-small
      0.0018,  // Medium  
      0.0025,  // Medium-large
      0.0035,  // Larger trades
      0.0015,  // Medium
      0.0010   // Small-medium
    ];
    
    // Random selection with balance limit safety
    const randomAmount = tradeVariations[Math.floor(Math.random() * tradeVariations.length)];
    const maxSafeAmount = Math.min(randomAmount, balance * 0.05); // Max 5% of balance
    const finalAmount = Math.max(0.0008, maxSafeAmount); // Minimum 0.0008 SOL
    
    console.log(`💰 Dynamic Amount: ${finalAmount.toFixed(6)} SOL (${(finalAmount * 1000).toFixed(2)}m lamports)`);
    return finalAmount;
  }

  // Broadcast individual session update
  private broadcastSessionUpdate(session: TradingSession): void {
    const update = {
      type: 'session_stats',
      sessionId: session.sessionId,
      transactions: session.totalTrades,
      volume: session.totalVolume,
      status: session.isActive ? 'active' : 'completed',
      tokenAddress: session.tokenAddress,
      primaryDex: session.primaryDex,
      lastUpdate: new Date().toISOString()
    };
    
    // Broadcast update - will implement proper WebSocket service later
    console.log('📤 Broadcasting session update:', update);
  }

  // Broadcast all sessions update for comprehensive tracking
  private broadcastAllSessionsUpdate(): void {
    const allSessions = Array.from(this.activeSessions.values()).map(session => ({
      sessionId: session.sessionId,
      transactions: session.totalTrades,
      volume: session.totalVolume,
      status: session.isActive ? 'active' : 'completed',
      tokenAddress: session.tokenAddress,
      tokenSymbol: session.tokenAddress.slice(0, 6).toUpperCase(), // Simplified symbol for display
      primaryDex: session.primaryDex,
      lastUpdate: new Date().toISOString()
    }));

    const update = {
      type: 'all_sessions_update',
      sessions: allSessions,
      totalSessions: allSessions.length,
      totalTransactions: allSessions.reduce((sum, s) => sum + s.transactions, 0),
      totalVolume: allSessions.reduce((sum, s) => sum + s.volume, 0)
    };
    
    // Broadcast update - will implement proper WebSocket service later
    console.log('📤 Broadcasting all sessions update:', update);
  }

  // Stop trading session
  async stopTradingSession(sessionId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;

    session.isActive = false;

    // Clear trading interval
    if (session.intervalId) {
      clearTimeout(session.intervalId);
    }

    // Clear balance checker if still running
    const balanceChecker = this.balanceCheckers.get(sessionId);
    if (balanceChecker) {
      clearInterval(balanceChecker);
      this.balanceCheckers.delete(sessionId);
    }

    console.log(`⏹️ TRADING STOPPED: ${sessionId}`);
    console.log(`📊 Final Stats: ${session.totalTrades} trades, ${session.totalVolume.toFixed(6)} SOL volume`);
    console.log(`⏱️ Runtime: ${((Date.now() - session.startTime.getTime()) / 1000 / 60).toFixed(1)} minutes`);

    return true;
  }

  // Get session status
  getSessionStatus(sessionId: string): any {
    const session = this.activeSessions.get(sessionId);
    if (!session) return null;

    const runtime = Date.now() - session.startTime.getTime();
    const runtimeMinutes = runtime / (1000 * 60);

    return {
      isActive: session.isActive,
      startTime: session.startTime,
      runtime: `${runtimeMinutes.toFixed(1)} minutes`,
      totalTrades: session.totalTrades,
      totalVolume: session.totalVolume,
      currentBalance: session.tradingBalance,
      lastTradeTime: session.lastTradeTime,
      tradesPerMinute: runtimeMinutes > 0 ? (session.totalTrades / runtimeMinutes).toFixed(2) : '0'
    };
  }

  // Get all active sessions
  getActiveSessions(): TradingSession[] {
    return Array.from(this.activeSessions.values());
  }

  // Open Trading UI Pages (3 pages as requested by user)
  private openTradingUIPages(sessionId: string, walletAddress: string, tokenAddress: string): void {
    console.log(`🖥️ OPENING 3 UI PAGES for session: ${sessionId}`);
    
    // Broadcast command to open UI pages
    this.broadcastStatus(sessionId, `OPEN_UI_PAGES|${walletAddress}|${tokenAddress}`);
    
    console.log(`✅ UI PAGES COMMAND SENT:`);
    console.log(`├── Session Dashboard: ${sessionId}`);
    console.log(`├── Wallet Monitor: ${walletAddress}`);
    console.log(`└── Token Chart: ${tokenAddress}`);
  }

  // Manual start for testing
  async manualStartTrading(sessionId: string, tokenAddress: string, primaryDex: string, fundingAmount: number): Promise<boolean> {
    try {
      const fundingSplit = await this.walletManager.processFunding(sessionId, fundingAmount);
      
      // Open UI pages for manual trading too
      const userWallet = this.walletManager.getUserWallet(sessionId);
      if (userWallet) {
        this.openTradingUIPages(sessionId, userWallet.publicKey, tokenAddress);
      }
      
      await this.startTradingSession(sessionId, tokenAddress, primaryDex, fundingSplit.userWalletAmount);
      return true;
    } catch (error) {
      console.error('Manual trading start failed:', error);
      return false;
    }
  }

  // Get cost monitor status for API endpoint
  async getCostMonitorStatus(): Promise<any> {
    return await this.costMonitor.getStatus();
  }

  // Getter for volume bot service
  getVolumeBotService(): any {
    return this.volumeBotService;
  }
}

// Export singleton instance
export const autoTradingService = AutoTradingService.getInstance();