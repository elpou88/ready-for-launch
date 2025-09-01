import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, decimal, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const botConfig = pgTable("bot_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rpcUrl: text("rpc_url").notNull(),
  mainWalletPrivateKey: text("main_wallet_private_key").notNull(),
  bonkProgramId: text("bonk_program_id").notNull(),
  pumpProgramId: text("pump_program_id").notNull(),
  isActive: boolean("is_active").default(false),
  createdAt: timestamp("created_at").default(sql`now()`),
  updatedAt: timestamp("updated_at").default(sql`now()`),
});

export const userSessions = pgTable("user_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userWallet: text("user_wallet").notNull(), // User's funding wallet address
  fundingAmount: decimal("funding_amount", { precision: 20, scale: 9 }).notNull(), // SOL deposited
  availableBalance: decimal("available_balance", { precision: 20, scale: 9 }).notNull(), // 75% for trading
  revenueCollected: decimal("revenue_collected", { precision: 20, scale: 9 }).default("0"), // 25% revenue
  revenueWallet: text("revenue_wallet").default("8oj8bJ43BPE7818Pj3CAUnAe5gqGHHMKTCiMF4aCEtW6"),
  minDeposit: decimal("min_deposit", { precision: 20, scale: 9 }).default("0.15"), // 0.15 SOL minimum
  isActive: boolean("is_active").default(false), // Only active when funded
  createdAt: timestamp("created_at").default(sql`now()`),
  updatedAt: timestamp("updated_at").default(sql`now()`),
});

export const tokens = pgTable("tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => userSessions.id),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'spl', 'bonkfun', 'pumpfun'
  mint: text("mint"), // for SPL tokens
  bonding: text("bonding"), // for bonkfun/pumpfun tokens
  userWallet: text("user_wallet").notNull(), // Owner of this token config
  volumeGenerated: decimal("volume_generated", { precision: 20, scale: 9 }).default("0"),
  totalSpent: decimal("total_spent", { precision: 20, scale: 9 }).default("0"), // Total SOL used for this token
  isActive: boolean("is_active").default(false), // Only active when session is funded
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => userSessions.id),
  tokenId: varchar("token_id").references(() => tokens.id),
  type: text("type").notNull(), // 'jupiter_swap', 'bonk_bond', 'pump_bond', 'revenue_collection'
  walletAddress: text("wallet_address").notNull(),
  signature: text("signature"),
  amount: decimal("amount", { precision: 20, scale: 6 }).default("0"),
  revenueGenerated: decimal("revenue_generated", { precision: 20, scale: 6 }).default("0"),
  status: text("status").notNull(), // 'success', 'failed', 'pending', 'critical_failure'
  errorMessage: text("error_message"),
  error: text("error"), // Additional error field for detailed logging
  timestamp: timestamp("timestamp").default(sql`now()`),
});

export const botMetrics = pgTable("bot_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  totalTransactions: integer("total_transactions").default(0),
  successfulTransactions: integer("successful_transactions").default(0),
  failedTransactions: integer("failed_transactions").default(0),
  volumeGenerated: decimal("volume_generated", { precision: 20, scale: 6 }).default("0"),
  activeTokens: integer("active_tokens").default(0),
  lastUpdated: timestamp("last_updated").default(sql`now()`),
});

export const walletBalances = pgTable("wallet_balances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  address: text("address").notNull(),
  balance: decimal("balance", { precision: 20, scale: 9 }).default("0"),
  lastUpdated: timestamp("last_updated").default(sql`now()`),
});

// WebSocket message schema for real-time communication
export const webSocketMessageSchema = z.object({
  type: z.enum([
    'bot_status',
    'transaction_completed', 
    'session_stats',
    'connection',
    'error',
    'wallet_balance_update',
    'new_transaction',
    'metrics_update'
  ]),
  payload: z.record(z.any()).optional(),
  data: z.record(z.any()).optional(),
  timestamp: z.number().optional()
});



export const insertBotConfigSchema = createInsertSchema(botConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserSessionSchema = createInsertSchema(userSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTokenSchema = createInsertSchema(tokens).omit({
  id: true,
  createdAt: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  timestamp: true,
});

export const insertBotMetricsSchema = createInsertSchema(botMetrics).omit({
  id: true,
  lastUpdated: true,
});

export const insertWalletBalanceSchema = createInsertSchema(walletBalances).omit({
  id: true,
  lastUpdated: true,
});

export type BotConfig = typeof botConfig.$inferSelect;
export type InsertBotConfig = z.infer<typeof insertBotConfigSchema>;

export type UserSession = typeof userSessions.$inferSelect;
export type InsertUserSession = z.infer<typeof insertUserSessionSchema>;

export type Token = typeof tokens.$inferSelect;
export type InsertToken = z.infer<typeof insertTokenSchema>;

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

export type BotMetrics = typeof botMetrics.$inferSelect;
export type InsertBotMetrics = z.infer<typeof insertBotMetricsSchema>;

export type WalletBalance = typeof walletBalances.$inferSelect;
export type InsertWalletBalance = z.infer<typeof insertWalletBalanceSchema>;

// WebSocket message types - using interface for better compatibility
export interface WebSocketMessage {
  type: 'bot_status' | 'transaction_completed' | 'session_stats' | 'connection' | 'error' | 'wallet_balance_update' | 'new_transaction' | 'metrics_update' | 'all_sessions_update';
  sessionId?: string;
  amount?: string;
  signature?: string;
  status?: string;
  transactions?: number;
  volume?: number;
  message?: string;
  timestamp?: string;
  payload?: Record<string, any>;
  data?: Record<string, any>;
  sessions?: any[];
  totalSessions?: number;
  totalTransactions?: number;
  totalVolume?: number;
}
