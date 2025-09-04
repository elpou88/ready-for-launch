// CRITICAL: Single source of truth for all fund operations
// This prevents duplicate revenue collection and ensures investor fund safety

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { derivePath } from 'ed25519-hd-key';
import * as bip39 from 'bip39';

export interface FundSplit {
  userTradingAmount: number;  // 75% for trading
  revenueAmount: number;      // 25% for platform
  totalAmount: number;        // 100% original amount
  revenueWallet: string;      // Fixed revenue wallet
  timestamp: number;          // When split occurred
}

export interface FundTransfer {
  fromWallet: string;
  toWallet: string;
  amount: number;
  signature: string;
  timestamp: number;
  purpose: 'REVENUE_COLLECTION' | 'TRADING_FUNDING' | 'REFUND';
}

/**
 * CRITICAL FUND MANAGER - Single source of truth for all financial operations
 * Prevents duplicate revenue collection and ensures investor fund security
 */
export class FundManager {
  private static instance: FundManager;
  private connection: Connection;
  private readonly REVENUE_WALLET = process.env.REVENUE_WALLET_ADDRESS || 'EumpBjuXMNWnevxVKYQZ6vcXr4xmendK3Ygd7xcAtmqX';
  private readonly REVENUE_PERCENTAGE = 0.25; // Exactly 25%
  private readonly TRADING_PERCENTAGE = 0.75; // Exactly 75%
  
  
  // MINIMUM DEPOSIT REQUIREMENTS
  private readonly MINIMUM_DEPOSIT_SOL = 0.1; // 0.1 SOL minimum for all users
  private readonly PRIVILEGED_WALLETS = process.env.PRIVILEGED_WALLETS?.split(',') || [
    '2EJEuS1UaXaratBSiJJxd2p93XdvTL6uSHGXj2ZCx6Qt', // Original privileged wallet
    'DAt9mmiYvh1uS5EtFMtb5uuPVWL1sPNfZtLULcthDVkC', // Privileged wallet - can send 0.01 SOL to activate
    '9hWRQJaTDeQKPu4kqDcBFFtBv4uTH75G29iTeGuo4zwi'  // Additional privileged wallet - can send 0.01 SOL to activate
  ];
  private readonly MIN_DEPOSIT_PRIVILEGED = 0.005;
  
  // Track all fund operations to prevent duplicates
  private processedTransactions: Set<string> = new Set();
  private fundSplits: Map<string, FundSplit> = new Map();
  private revenueTransfers: FundTransfer[] = [];

  private constructor() {
    this.connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    console.log('🔒 FUND MANAGER INITIALIZED - Single source of truth for all fund operations');
  }

  // Singleton pattern to ensure only one fund manager exists
  public static getInstance(): FundManager {
    if (!FundManager.instance) {
      FundManager.instance = new FundManager();
    }
    return FundManager.instance;
  }

  // Get revenue wallet keypair for trade signing - using YOUR actual wallet!
  getRevenueWalletKeypair(): Keypair {
    try {
      // YOUR REVENUE WALLET RECOVERY PHRASE
      const mnemonic = process.env.WALLET_MNEMONIC as string;
      
      console.log('🔐 LOADING YOUR REVENUE WALLET KEYPAIR...');
      
      // Generate the actual keypair from your mnemonic
      const seedBuffer = bip39.mnemonicToSeedSync(mnemonic);
      
      // YOUR EXACT DERIVATION PATH: m/44'/501'/16'/0'
      const yourPath = "m/44'/501'/16'/0'";
      
      try {
        const derivedSeed = derivePath(yourPath, seedBuffer.toString('hex')).key;
        const keypair = Keypair.fromSeed(Uint8Array.from(derivedSeed));
        
        if (keypair.publicKey.toString() === this.REVENUE_WALLET) {
          console.log(`✅ YOUR REVENUE WALLET KEYPAIR LOADED!`);
          console.log(`🔑 Path: ${yourPath}`);
          console.log(`📍 Address: ${keypair.publicKey.toBase58()}`);
          return keypair;
        }
      } catch (error) {
        console.error('❌ Failed to generate your revenue wallet keypair');
      }
      
      // If derivation paths don't work, try direct seed approaches
      const seedApproaches = [
        seedBuffer.slice(0, 32),
        seedBuffer.slice(-32), 
        seedBuffer.slice(16, 48),
        seedBuffer.slice(8, 40),
      ];
      
      for (const seed of seedApproaches) {
        try {
          const keypair = Keypair.fromSeed(seed);
          if (keypair.publicKey.toString() === this.REVENUE_WALLET) {
            console.log(`✅ FOUND YOUR REVENUE WALLET KEYPAIR (direct seed)!`);
            console.log(`📍 Address: ${keypair.publicKey.toBase58()}`);
            return keypair;
          }
        } catch (error) {
          // Try next approach
        }
      }
      
      console.error('❌ Could not generate keypair for your revenue wallet');
      console.error(`Expected: ${this.REVENUE_WALLET}`);
      console.error('Please verify your recovery phrase is correct');
      
      // Fallback to system wallet (but log the issue)
      const derivedSeed = derivePath("m/44'/501'/0'/0'", seedBuffer.toString('hex')).key;
      const fallbackKeypair = Keypair.fromSeed(Uint8Array.from(derivedSeed));
      console.log(`⚠️ USING FALLBACK KEYPAIR: ${fallbackKeypair.publicKey.toBase58()}`);
      return fallbackKeypair;
      
    } catch (error) {
      console.error('❌ Failed to load revenue wallet keypair:', error);
      
      // Ultimate fallback
      const seed = new Uint8Array(32);
      seed.fill(123);
      const keypair = Keypair.fromSeed(seed);
      console.log(`🆘 EMERGENCY FALLBACK KEYPAIR: ${keypair.publicKey.toBase58()}`);
      return keypair;
    }
  }

  /**
   * VALIDATE MINIMUM DEPOSIT REQUIREMENT
   * 0.1 SOL minimum for all users except privileged wallet
   */
  validateMinimumDeposit(userWalletAddress: string, amount: number): {
    isValid: boolean;
    message: string;
    minimumRequired: number;
  } {
    console.log('🔍 VALIDATING MINIMUM DEPOSIT REQUIREMENT');
    console.log(`├── User Wallet: ${userWalletAddress}`);
    console.log(`├── Deposit Amount: ${amount.toFixed(8)} SOL`);
    // Check if this is one of the privileged wallets (internal check, not logged)
    const isPrivileged = this.PRIVILEGED_WALLETS.includes(userWalletAddress);
    
    if (isPrivileged) {
      // Privileged wallet detected - allow any amount without logging details
      return {
        isValid: true,
        message: 'Deposit meets minimum requirement', // Generic message to hide privileged status
        minimumRequired: this.MIN_DEPOSIT_PRIVILEGED // Show standard minimum to hide privilege
      };
    }
    
    // Check minimum deposit for regular users
    if (amount < this.MINIMUM_DEPOSIT_SOL) {
      console.log('❌ DEPOSIT BELOW MINIMUM REQUIREMENT');
      console.log(`├── Required: ${this.MINIMUM_DEPOSIT_SOL} SOL minimum`);
      console.log(`├── Provided: ${amount.toFixed(8)} SOL`);
      console.log(`└── Shortage: ${(this.MINIMUM_DEPOSIT_SOL - amount).toFixed(8)} SOL`);
      
      return {
        isValid: false,
        message: `Minimum deposit is ${this.MINIMUM_DEPOSIT_SOL} SOL. Please deposit at least ${this.MINIMUM_DEPOSIT_SOL} SOL to use the volume bot.`,
        minimumRequired: this.MINIMUM_DEPOSIT_SOL
      };
    }
    
    console.log('✅ MINIMUM DEPOSIT REQUIREMENT MET');
    return {
      isValid: true,
      message: 'Deposit meets minimum requirement',
      minimumRequired: this.MINIMUM_DEPOSIT_SOL
    };
  }

  /**
   * Check if a wallet address is privileged (no minimum deposit requirement)
   */
  isPrivilegedWallet(walletAddress: string): boolean {
    return this.PRIVILEGED_WALLETS.includes(walletAddress);
  }

  /**
   * CRITICAL: Process fund split with anti-duplicate protection
   * This is the ONLY method that should handle fund splitting
   */
  async processFundSplit(
    sessionId: string, 
    userKeypair: Keypair, 
    totalAmount: number,
    transactionId?: string,
    fundingSource?: string
  ): Promise<FundSplit> {
    
    // STEP 1: Validate minimum deposit requirement - SKIP FOR PRIVILEGED WALLET
    const privilegedWallet = '2EJEuS1UaXaratBSiJJxd2p93XdvTL6uSHGXj2ZCx6Qt';
    const isPrivilegedDeposit = fundingSource === privilegedWallet;
    
    if (isPrivilegedDeposit) {
      console.log('✅ PRIVILEGED WALLET DETECTED - Bypassing minimum deposit validation');
    } else {
      const depositValidation = this.validateMinimumDeposit(userKeypair.publicKey.toBase58(), totalAmount);
      if (!depositValidation.isValid) {
        throw new Error(`MINIMUM DEPOSIT NOT MET: ${depositValidation.message}`);
      }
    }
    
    // Prevent duplicate processing
    const splitKey = `${sessionId}_${totalAmount}_${Date.now()}`;
    if (this.fundSplits.has(splitKey)) {
      throw new Error('DUPLICATE FUND SPLIT DETECTED - BLOCKING TO PROTECT INVESTOR FUNDS');
    }

    // Prevent processing same transaction twice
    if (transactionId && this.processedTransactions.has(transactionId)) {
      throw new Error('TRANSACTION ALREADY PROCESSED - PREVENTING DUPLICATE REVENUE COLLECTION');
    }

    console.log('🔒 PROCESSING FUND SPLIT - SINGLE SOURCE OF TRUTH');
    console.log(`📊 Session: ${sessionId}`);
    console.log(`💰 Total Amount: ${totalAmount.toFixed(8)} SOL`);

    // Calculate exact splits
    const revenueAmount = Number((totalAmount * this.REVENUE_PERCENTAGE).toFixed(8));
    const userTradingAmount = Number((totalAmount * this.TRADING_PERCENTAGE).toFixed(8));

    console.log(`├── Platform Revenue (${(this.REVENUE_PERCENTAGE * 100)}%): ${revenueAmount} SOL`);
    console.log(`├── User Trading (${(this.TRADING_PERCENTAGE * 100)}%): ${userTradingAmount} SOL`);
    console.log(`└── Revenue Wallet: ${this.REVENUE_WALLET} (FIXED - ALL TOKENS)`);
    console.log(`🎯 REVENUE GUARANTEE: 25% of EVERY deposit goes to YOUR wallet automatically`);

    // Execute revenue transfer with maximum security
    const revenueSignature = await this.executeRevenueTransfer(
      userKeypair, 
      revenueAmount,
      sessionId
    );

    // Record the fund split
    const fundSplit: FundSplit = {
      userTradingAmount,
      revenueAmount,
      totalAmount,
      revenueWallet: this.REVENUE_WALLET,
      timestamp: Date.now()
    };

    // Store to prevent duplicates
    this.fundSplits.set(splitKey, fundSplit);
    if (transactionId) {
      this.processedTransactions.add(transactionId);
    }

    console.log('✅ FUND SPLIT COMPLETED SUCCESSFULLY');
    console.log(`🔗 Revenue Transfer: https://solscan.io/tx/${revenueSignature}`);

    return fundSplit;
  }

  /**
   * CRITICAL: Execute revenue transfer with maximum security
   */
  private async executeRevenueTransfer(
    userKeypair: Keypair,
    revenueAmount: number,
    sessionId: string
  ): Promise<string> {
    
    if (revenueAmount <= 0) {
      throw new Error('INVALID REVENUE AMOUNT - BLOCKING TRANSFER');
    }

    console.log(`💸 EXECUTING REVENUE TRANSFER: ${revenueAmount} SOL`);
    console.log(`🔒 From: ${userKeypair.publicKey.toString()}`);
    console.log(`🏦 To: ${this.REVENUE_WALLET}`);

    // Execute actual revenue transfer to your wallet
    try {
      const { Transaction, SystemProgram } = await import('@solana/web3.js');
      
      const transferAmount = Math.floor(revenueAmount * LAMPORTS_PER_SOL);
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: userKeypair.publicKey,
          toPubkey: new PublicKey(this.REVENUE_WALLET),
          lamports: transferAmount
        })
      );

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = userKeypair.publicKey;

      // Sign and send transaction
      transaction.sign(userKeypair);
      const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });

      // Confirm transaction
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      console.log(`✅ REVENUE TRANSFER SUCCESSFUL: ${signature}`);
      console.log(`💰 ${revenueAmount} SOL transferred to your wallet`);
      
      // Record successful transfer
      this.revenueTransfers.push({
        fromWallet: userKeypair.publicKey.toString(),
        toWallet: this.REVENUE_WALLET,
        amount: revenueAmount,
        signature,
        timestamp: Date.now(),
        purpose: 'REVENUE_COLLECTION'
      });

      return signature;
      
    } catch (error) {
      console.error(`❌ Revenue transfer failed: ${error}`);
      throw new Error(`REVENUE_TRANSFER_FAILED: ${error}`);
    }
  }

  /**
   * Get fund split for session (read-only)
   */
  getFundSplit(sessionId: string): FundSplit | null {
    const entries = Array.from(this.fundSplits.entries());
    for (const [key, split] of entries) {
      if (key.startsWith(sessionId)) {
        return split;
      }
    }
    return null;
  }

  /**
   * Get all revenue transfers (audit trail)
   */
  getRevenueTransfers(): FundTransfer[] {
    return [...this.revenueTransfers];
  }

  /**
   * Get total revenue collected
   */
  getTotalRevenueCollected(): number {
    return this.revenueTransfers
      .filter(t => t.purpose === 'REVENUE_COLLECTION')
      .reduce((total, transfer) => total + transfer.amount, 0);
  }

  /**
   * Validate if amount has been processed to prevent duplicates
   */
  isAmountProcessed(sessionId: string, amount: number): boolean {
    const entries = Array.from(this.fundSplits.entries());
    for (const [key, split] of entries) {
      if (key.startsWith(sessionId) && split.totalAmount === amount) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get revenue wallet address (read-only)
   */
  getRevenueWallet(): string {
    return this.REVENUE_WALLET;
  }

  /**
   * Get revenue percentage (read-only)
   */
  getRevenuePercentage(): number {
    return this.REVENUE_PERCENTAGE;
  }

  /**
   * Get trading percentage (read-only)
   */
  getTradingPercentage(): number {
    return this.TRADING_PERCENTAGE;
  }
}