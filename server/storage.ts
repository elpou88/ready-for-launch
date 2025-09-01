import { type BotConfig, type InsertBotConfig, type UserSession, type InsertUserSession, type Token, type InsertToken, type Transaction, type InsertTransaction, type BotMetrics, type InsertBotMetrics, type WalletBalance, type InsertWalletBalance } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Bot Config
  getBotConfig(): Promise<BotConfig | undefined>;
  createOrUpdateBotConfig(config: InsertBotConfig): Promise<BotConfig>;
  
  // User Sessions
  createUserSession(session: InsertUserSession): Promise<UserSession>;
  getUserSession(id: string): Promise<UserSession | undefined>;
  updateUserSession(id: string, updates: Partial<InsertUserSession>): Promise<UserSession>;
  getTokensBySession(sessionId: string): Promise<Token[]>;
  
  // Tokens
  getTokens(): Promise<Token[]>;
  getToken(id: string): Promise<Token | undefined>;
  createToken(token: InsertToken): Promise<Token>;
  updateToken(id: string, updates: Partial<InsertToken>): Promise<Token | undefined>;
  deleteToken(id: string): Promise<boolean>;
  
  // Transactions
  getTransactions(limit?: number): Promise<Transaction[]>;
  getAllTransactions(): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  
  // User Sessions - Additional methods for backup
  getAllUserSessions(): Promise<UserSession[]>;
  
  // Backup/Recovery support methods
  clearAllTransactions?(): Promise<void>;
  clearAllUserSessions?(): Promise<void>;
  clearBotConfig?(): Promise<void>;
  clearAllTokens?(): Promise<void>;
  
  // Metrics
  getBotMetrics(): Promise<BotMetrics | undefined>;
  updateBotMetrics(metrics: InsertBotMetrics): Promise<BotMetrics>;
  
  // Wallet Balances
  getWalletBalance(address: string): Promise<WalletBalance | undefined>;
  updateWalletBalance(balance: InsertWalletBalance): Promise<WalletBalance>;
  getMainWalletBalance(): Promise<WalletBalance | undefined>;
}

export class MemStorage implements IStorage {
  private botConfigs: Map<string, BotConfig>;
  private userSessions: Map<string, UserSession>;
  private tokens: Map<string, Token>;
  private transactions: Map<string, Transaction>;
  private botMetrics: BotMetrics | undefined;
  private walletBalances: Map<string, WalletBalance>;

  constructor() {
    this.botConfigs = new Map();
    this.userSessions = new Map();
    this.tokens = new Map();
    this.transactions = new Map();
    this.walletBalances = new Map();
    
    // Initialize with default metrics
    this.botMetrics = {
      id: randomUUID(),
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
      volumeGenerated: "0",
      activeTokens: 0,
      lastUpdated: new Date(),
    };
    
    // Initialize with sample tokens
    const sampleTokens: Token[] = [
      {
        id: randomUUID(),
        name: "MySPLToken",
        type: "spl",
        mint: "YOUR_SPL_TOKEN_MINT",
        bonding: null,
        userWallet: "SAMPLE_WALLET",
        sessionId: null,
        volumeGenerated: "0",
        totalSpent: "0",
        isActive: true,
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        name: "BonkToken1",
        type: "bonkfun",
        mint: null,
        bonding: "BONK_BONDING_ACCOUNT",
        userWallet: "SAMPLE_WALLET",
        sessionId: null,
        volumeGenerated: "0",
        totalSpent: "0",
        isActive: true,
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        name: "PumpToken1",
        type: "pumpfun",
        mint: null,
        bonding: "PUMP_BONDING_ACCOUNT",
        userWallet: "SAMPLE_WALLET",
        sessionId: null,
        volumeGenerated: "0",
        totalSpent: "0",
        isActive: false,
        createdAt: new Date(),
      },
    ];
    
    sampleTokens.forEach(token => this.tokens.set(token.id, token));
  }

  async createUserSession(session: InsertUserSession): Promise<UserSession> {
    const newSession: UserSession = {
      id: randomUUID(),
      ...session,
      depositAmount: session.depositAmount ?? "20.00",
      minAmount: session.minAmount ?? "20.00",
      revenueShare: session.revenueShare ?? "0.25",
      isActive: session.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.userSessions.set(newSession.id, newSession);
    return newSession;
  }

  async getUserSession(id: string): Promise<UserSession | undefined> {
    return this.userSessions.get(id);
  }

  async updateUserSession(id: string, updates: Partial<InsertUserSession>): Promise<UserSession> {
    const existing = this.userSessions.get(id);
    if (!existing) {
      throw new Error(`UserSession with id ${id} not found`);
    }
    
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.userSessions.set(id, updated);
    return updated;
  }

  async getTokensBySession(sessionId: string): Promise<Token[]> {
    return Array.from(this.tokens.values()).filter(token => token.sessionId === sessionId);
  }

  async getBotConfig(): Promise<BotConfig | undefined> {
    return Array.from(this.botConfigs.values())[0];
  }

  async createOrUpdateBotConfig(config: InsertBotConfig): Promise<BotConfig> {
    const existing = await this.getBotConfig();
    if (existing) {
      const updated: BotConfig = {
        ...existing,
        ...config,
        updatedAt: new Date(),
      };
      this.botConfigs.set(existing.id, updated);
      return updated;
    } else {
      const newConfig: BotConfig = {
        id: randomUUID(),
        ...config,
        isActive: config.isActive ?? false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.botConfigs.set(newConfig.id, newConfig);
      return newConfig;
    }
  }

  async getTokens(): Promise<Token[]> {
    return Array.from(this.tokens.values());
  }

  async getToken(id: string): Promise<Token | undefined> {
    return this.tokens.get(id);
  }

  async createToken(token: InsertToken): Promise<Token> {
    const newToken: Token = {
      id: randomUUID(),
      ...token,
      isActive: token.isActive ?? true,
      mint: token.mint ?? null,
      bonding: token.bonding ?? null,
      createdAt: new Date(),
    };
    this.tokens.set(newToken.id, newToken);
    return newToken;
  }

  async updateToken(id: string, updates: Partial<InsertToken>): Promise<Token | undefined> {
    const existing = this.tokens.get(id);
    if (!existing) return undefined;
    
    const updated: Token = { ...existing, ...updates };
    this.tokens.set(id, updated);
    return updated;
  }

  async deleteToken(id: string): Promise<boolean> {
    return this.tokens.delete(id);
  }

  async getTransactions(limit: number = 50): Promise<Transaction[]> {
    const txs = Array.from(this.transactions.values())
      .sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime())
      .slice(0, limit);
    return txs;
  }

  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const newTransaction: Transaction = {
      id: randomUUID(),
      ...transaction,
      tokenId: transaction.tokenId ?? null,
      signature: transaction.signature ?? null,
      errorMessage: transaction.errorMessage ?? null,
      timestamp: new Date(),
    };
    this.transactions.set(newTransaction.id, newTransaction);
    return newTransaction;
  }

  async getAllTransactions(): Promise<Transaction[]> {
    return Array.from(this.transactions.values());
  }

  async getAllUserSessions(): Promise<UserSession[]> {
    return Array.from(this.userSessions.values());
  }

  async clearAllTransactions(): Promise<void> {
    this.transactions.clear();
  }

  async clearAllUserSessions(): Promise<void> {
    this.userSessions.clear();
  }

  async clearBotConfig(): Promise<void> {
    this.botConfigs.clear();
  }

  async clearAllTokens(): Promise<void> {
    this.tokens.clear();
  }

  async getBotMetrics(): Promise<BotMetrics | undefined> {
    return this.botMetrics;
  }

  async updateBotMetrics(metrics: InsertBotMetrics): Promise<BotMetrics> {
    this.botMetrics = {
      id: this.botMetrics?.id || randomUUID(),
      ...metrics,
      totalTransactions: metrics.totalTransactions ?? 0,
      successfulTransactions: metrics.successfulTransactions ?? 0,
      failedTransactions: metrics.failedTransactions ?? 0,
      volumeGenerated: metrics.volumeGenerated ?? "0",
      activeTokens: metrics.activeTokens ?? 0,
      lastUpdated: new Date(),
    };
    return this.botMetrics;
  }

  async getWalletBalance(address: string): Promise<WalletBalance | undefined> {
    return this.walletBalances.get(address);
  }

  async updateWalletBalance(balance: InsertWalletBalance): Promise<WalletBalance> {
    const existing = this.walletBalances.get(balance.address);
    const updated: WalletBalance = {
      id: existing?.id || randomUUID(),
      ...balance,
      balance: balance.balance ?? "0",
      lastUpdated: new Date(),
    };
    this.walletBalances.set(balance.address, updated);
    return updated;
  }

  async getMainWalletBalance(): Promise<WalletBalance | undefined> {
    // Return the first wallet balance as main wallet for now
    return Array.from(this.walletBalances.values())[0];
  }
}

export const storage = new MemStorage();
