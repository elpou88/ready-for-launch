import * as fs from 'fs';
import * as path from 'path';
import { TradingSession } from './autoTradingService';
import { UserWallet } from './walletManager';

export interface PersistentSession {
  sessionId: string;
  tokenAddress: string;
  tokenSymbol?: string;
  userWallet: UserWallet;
  tradingBalance: number;
  initialDeposit: number;
  primaryDex: string;
  isActive: boolean;
  startTime: string;
  totalTrades: number;
  totalVolume: number;
  lastTradeTime?: string;
  targetDepletion: number; // 75% of initial deposit
  status: 'monitoring' | 'trading' | 'completed' | 'paused';
  createdAt: string;
  completedAt?: string;
}

export class SessionPersistence {
  private static instance: SessionPersistence;
  private sessionsFilePath: string;
  private walletsFilePath: string;

  private constructor() {
    // Store sessions and wallets in root directory for persistence
    this.sessionsFilePath = path.join(process.cwd(), 'active_sessions.json');
    this.walletsFilePath = path.join(process.cwd(), 'session_wallets.json');
    
    // Initialize files if they don't exist
    this.initializeFiles();
    console.log('💾 SESSION PERSISTENCE INITIALIZED - All sessions will survive restarts');
  }

  public static getInstance(): SessionPersistence {
    if (!SessionPersistence.instance) {
      SessionPersistence.instance = new SessionPersistence();
    }
    return SessionPersistence.instance;
  }

  private initializeFiles(): void {
    try {
      if (!fs.existsSync(this.sessionsFilePath)) {
        fs.writeFileSync(this.sessionsFilePath, JSON.stringify([], null, 2));
        console.log('✅ Created sessions persistence file');
      }
      
      if (!fs.existsSync(this.walletsFilePath)) {
        fs.writeFileSync(this.walletsFilePath, JSON.stringify({}, null, 2));
        console.log('✅ Created wallets persistence file');
      }
    } catch (error) {
      console.error('❌ Failed to initialize persistence files:', error);
    }
  }

  // Save session to disk
  saveSession(session: TradingSession): void {
    try {
      const persistentSession: PersistentSession = {
        sessionId: session.sessionId,
        tokenAddress: session.tokenAddress,
        userWallet: session.userWallet,
        tradingBalance: session.tradingBalance,
        initialDeposit: session.tradingBalance / 0.75, // Calculate original deposit
        primaryDex: session.primaryDex,
        isActive: session.isActive,
        startTime: session.startTime.toISOString(),
        totalTrades: session.totalTrades,
        totalVolume: session.totalVolume,
        lastTradeTime: session.lastTradeTime?.toISOString(),
        targetDepletion: session.tradingBalance / 0.75 * 0.75, // 75% of original
        status: session.isActive ? 'trading' : 'monitoring',
        createdAt: session.startTime.toISOString()
      };

      const sessions = this.loadAllSessions();
      const existingIndex = sessions.findIndex(s => s.sessionId === session.sessionId);
      
      if (existingIndex >= 0) {
        sessions[existingIndex] = persistentSession;
      } else {
        sessions.push(persistentSession);
      }

      fs.writeFileSync(this.sessionsFilePath, JSON.stringify(sessions, null, 2));
      console.log(`💾 SESSION SAVED: ${session.sessionId} - ${persistentSession.status}`);
      
    } catch (error) {
      console.error(`❌ Failed to save session ${session.sessionId}:`, error);
    }
  }

  // Load all sessions from disk
  loadAllSessions(): PersistentSession[] {
    try {
      if (!fs.existsSync(this.sessionsFilePath)) {
        return [];
      }
      
      const data = fs.readFileSync(this.sessionsFilePath, 'utf-8');
      return JSON.parse(data) || [];
    } catch (error) {
      console.error('❌ Failed to load sessions:', error);
      return [];
    }
  }

  // Get active sessions that need to continue trading
  getActiveSessions(): PersistentSession[] {
    const allSessions = this.loadAllSessions();
    
    // Ensure allSessions is always an array
    if (!Array.isArray(allSessions)) {
      console.log('⚠️ Session data is not an array, returning empty array');
      return [];
    }
    
    return allSessions.filter(session => 
      session && session.status && (
        session.status === 'trading' || 
        (session.status === 'monitoring' && session.tradingBalance > 0)
      )
    );
  }

  // Get session by ID
  getSession(sessionId: string): PersistentSession | null {
    const sessions = this.loadAllSessions();
    return sessions.find(s => s.sessionId === sessionId) || null;
  }

  // Update session status
  updateSessionStatus(sessionId: string, status: PersistentSession['status'], additionalData?: Partial<PersistentSession>): void {
    try {
      const sessions = this.loadAllSessions();
      const sessionIndex = sessions.findIndex(s => s.sessionId === sessionId);
      
      if (sessionIndex >= 0) {
        sessions[sessionIndex] = {
          ...sessions[sessionIndex],
          status,
          ...additionalData,
          ...(status === 'completed' ? { completedAt: new Date().toISOString() } : {})
        };
        
        fs.writeFileSync(this.sessionsFilePath, JSON.stringify(sessions, null, 2));
        console.log(`📊 SESSION STATUS UPDATED: ${sessionId} -> ${status}`);
      }
    } catch (error) {
      console.error(`❌ Failed to update session status ${sessionId}:`, error);
    }
  }

  // Update session trading stats
  updateTradingStats(sessionId: string, totalTrades: number, totalVolume: number, tradingBalance: number): void {
    try {
      const sessions = this.loadAllSessions();
      const sessionIndex = sessions.findIndex(s => s.sessionId === sessionId);
      
      if (sessionIndex >= 0) {
        sessions[sessionIndex].totalTrades = totalTrades;
        sessions[sessionIndex].totalVolume = totalVolume;
        sessions[sessionIndex].tradingBalance = tradingBalance;
        sessions[sessionIndex].lastTradeTime = new Date().toISOString();
        
        // Check if session should be completed
        const originalDeposit = sessions[sessionIndex].initialDeposit;
        const remainingPercentage = (tradingBalance / (originalDeposit * 0.75)) * 100;
        
        if (remainingPercentage <= 5) { // Less than 5% remaining = complete
          sessions[sessionIndex].status = 'completed';
          sessions[sessionIndex].completedAt = new Date().toISOString();
          console.log(`🏁 SESSION COMPLETED: ${sessionId} - All funds depleted`);
        }
        
        fs.writeFileSync(this.sessionsFilePath, JSON.stringify(sessions, null, 2));
      }
    } catch (error) {
      console.error(`❌ Failed to update trading stats for ${sessionId}:`, error);
    }
  }

  // Update session trades count and volume
  async updateSessionTrades(sessionId: string, totalTrades: number, totalVolume: number): Promise<void> {
    try {
      const sessions = this.loadAllSessions();
      const sessionIndex = sessions.findIndex(s => s.sessionId === sessionId);
      
      if (sessionIndex !== -1) {
        sessions[sessionIndex].totalTrades = totalTrades;
        sessions[sessionIndex].totalVolume = totalVolume;
        sessions[sessionIndex].lastTradeTime = new Date().toISOString();
        
        fs.writeFileSync(this.sessionsFilePath, JSON.stringify(sessions, null, 2));
        console.log(`💾 Updated session ${sessionId}: ${totalTrades} trades, ${totalVolume.toFixed(6)} SOL volume`);
      }
    } catch (error) {
      console.error(`❌ Failed to update session trades for ${sessionId}:`, error);
    }
  }

  // Save wallet mapping
  saveWalletMapping(sessionId: string, userWallet: UserWallet): void {
    try {
      let wallets: Record<string, UserWallet> = {};
      
      if (fs.existsSync(this.walletsFilePath)) {
        const data = fs.readFileSync(this.walletsFilePath, 'utf-8');
        wallets = JSON.parse(data) || {};
      }
      
      wallets[sessionId] = userWallet;
      
      fs.writeFileSync(this.walletsFilePath, JSON.stringify(wallets, null, 2));
      console.log(`💳 WALLET MAPPING SAVED: ${sessionId} -> ${userWallet.publicKey}`);
      
    } catch (error) {
      console.error(`❌ Failed to save wallet mapping ${sessionId}:`, error);
    }
  }

  // Load wallet mapping
  loadWalletMapping(sessionId: string): UserWallet | null {
    try {
      if (!fs.existsSync(this.walletsFilePath)) {
        return null;
      }
      
      const data = fs.readFileSync(this.walletsFilePath, 'utf-8');
      const wallets = JSON.parse(data) || {};
      return wallets[sessionId] || null;
      
    } catch (error) {
      console.error(`❌ Failed to load wallet mapping ${sessionId}:`, error);
      return null;
    }
  }

  // Get all wallet mappings (alias for compatibility)
  public getWalletMappings(): Record<string, UserWallet> {
    return this.loadAllWalletMappings();
  }

  // Get all wallet mappings
  loadAllWalletMappings(): Record<string, UserWallet> {
    try {
      if (!fs.existsSync(this.walletsFilePath)) {
        return {};
      }
      
      const data = fs.readFileSync(this.walletsFilePath, 'utf-8');
      return JSON.parse(data) || {};
      
    } catch (error) {
      console.error('❌ Failed to load all wallet mappings:', error);
      return {};
    }
  }

  // Clean up completed sessions (optional - keep for history)
  cleanupCompletedSessions(olderThanDays: number = 30): void {
    try {
      const sessions = this.loadAllSessions();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      
      const activeSessions = sessions.filter(session => {
        if (session.status === 'completed' && session.completedAt) {
          const completedDate = new Date(session.completedAt);
          return completedDate > cutoffDate;
        }
        return true; // Keep non-completed or recent sessions
      });
      
      if (activeSessions.length < sessions.length) {
        fs.writeFileSync(this.sessionsFilePath, JSON.stringify(activeSessions, null, 2));
        console.log(`🧹 CLEANED UP ${sessions.length - activeSessions.length} old completed sessions`);
      }
      
    } catch (error) {
      console.error('❌ Failed to cleanup sessions:', error);
    }
  }

  // Get session statistics
  getSessionStats(): {
    total: number;
    active: number;
    monitoring: number;
    trading: number;
    completed: number;
  } {
    const sessions = this.loadAllSessions();
    
    return {
      total: sessions.length,
      active: sessions.filter(s => s.status === 'trading' || s.status === 'monitoring').length,
      monitoring: sessions.filter(s => s.status === 'monitoring').length,
      trading: sessions.filter(s => s.status === 'trading').length,
      completed: sessions.filter(s => s.status === 'completed').length
    };
  }
}