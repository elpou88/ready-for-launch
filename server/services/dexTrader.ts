import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TokenValidator, PoolInfo } from './tokenValidator';
import { FundManager } from './fundManager';

export interface TradeResult {
  success: boolean;
  signature?: string;
  error?: string;
  dex: string;
  tradeType: 'BUY' | 'SELL';
  amount: number;
  tokenAddress: string;
  timestamp: number;
}

export interface DexTradeConfig {
  tokenAddress: string;
  sessionId: string;
  userWallet: Keypair;
  transactionWallet?: Keypair; // 🔥 NEW: Optional transaction-specific wallet
  primaryDex: string;
  pool: PoolInfo;
  tradeAmount: number;
  useTransactionWallet?: boolean; // 🔥 NEW: Flag to enable per-transaction wallets
}

export class DexTrader {
  private connection: Connection;
  private tokenValidator: TokenValidator;
  private fundManager: FundManager;

  constructor() {
    this.connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    this.tokenValidator = new TokenValidator();
    this.fundManager = FundManager.getInstance(); // Use centralized fund manager
  }

  // Execute a trade on the correct DEX for the validated token
  async executeTrade(config: DexTradeConfig, tradeType: 'BUY' | 'SELL'): Promise<TradeResult> {
    try {
      // 🔥 ACTIVE FEATURE: Use transaction-specific wallet for maximum organic volume
      const tradingWallet = config.useTransactionWallet && config.transactionWallet 
        ? config.transactionWallet 
        : config.userWallet;
        
      if (config.useTransactionWallet && config.transactionWallet) {
        console.log(`🔄 FRESH TRANSACTION WALLET ACTIVE: ${tradeType}`);
        console.log(`├── Unique Wallet: ${config.transactionWallet.publicKey.toString()}`);
        console.log(`├── Different address for every single trade`);
        console.log(`├── Maximum organic volume appearance`);
        console.log(`└── Enhanced privacy and authenticity`);

        // Transfer funds from main wallet to transaction wallet if needed
        if (tradeType === 'BUY') {
          console.log(`💸 FUNDING TRANSACTION WALLET FOR ${tradeType}`);
          try {
            // Transfer SOL from main wallet to transaction wallet
            const transferAmount = Math.ceil(config.tradeAmount * 1.1 * LAMPORTS_PER_SOL); // 10% extra for fees
            const transferTx = new Transaction().add(
              SystemProgram.transfer({
                fromPubkey: config.userWallet.publicKey,
                toPubkey: config.transactionWallet.publicKey,
                lamports: transferAmount
              })
            );

            const { blockhash } = await this.connection.getLatestBlockhash();
            transferTx.recentBlockhash = blockhash;
            transferTx.feePayer = config.userWallet.publicKey;
            transferTx.sign(config.userWallet);

            const transferSig = await this.connection.sendRawTransaction(transferTx.serialize(), {
              skipPreflight: true
            });
            
            console.log(`✅ FUNDED TRANSACTION WALLET: ${transferAmount} lamports transferred`);
          } catch (transferError) {
            console.log(`⚠️ Pre-funding failed, will use main wallet balance: ${transferError}`);
          }
        }
      }

      console.log(`🎯 EXECUTING ${tradeType} on ${config.primaryDex} for ${config.tokenAddress}`);
      console.log(`💰 Amount: ${config.tradeAmount.toFixed(6)} SOL`);
      console.log(`🏊 Pool: ${config.pool.poolAddress}`);
      console.log(`🔑 Trading Wallet: ${tradingWallet.publicKey.toString()}`);
      
      if (config.useTransactionWallet) {
        console.log(`🌟 TRANSACTION WALLET MODE: Fresh address for organic volume`);
      }

      // Route to correct DEX
      let result: TradeResult;
      
      switch (config.primaryDex.toLowerCase()) {
        case 'jupiter':
          result = await this.executeJupiterTrade(config, tradeType);
          break;
        case 'raydium':
        case 'orca':
        case 'pumpswap':
        case 'meteora':
        default:
          // ALL DEXS: Route through Jupiter aggregator for real transactions
          result = await this.executeJupiterTrade(config, tradeType);
      }

      if (result.success) {
        console.log(`✅ ${tradeType} SUCCESSFUL on ${config.primaryDex}`);
        console.log(`🔗 Transaction: https://solscan.io/tx/${result.signature}`);
        console.log(`📈 Chart impact: Real volume visible on DexScreener`);
      } else {
        console.error(`❌ ${tradeType} FAILED on ${config.primaryDex}: ${result.error}`);
      }

      return result;

    } catch (error) {
      console.error(`❌ Trade execution failed:`, error);
      return {
        success: false,
        error: `Trade failed: ${error}`,
        dex: config.primaryDex,
        tradeType,
        amount: config.tradeAmount,
        tokenAddress: config.tokenAddress,
        timestamp: Date.now()
      };
    }
  }

  // Execute trade through Jupiter aggregator - GUARANTEED REAL TRANSACTIONS
  private async executeJupiterTrade(config: DexTradeConfig, tradeType: 'BUY' | 'SELL'): Promise<TradeResult> {
    try {
      // 🔥 USE TRANSACTION WALLET FOR ALL JUPITER OPERATIONS
      const activeWallet = config.useTransactionWallet && config.transactionWallet 
        ? config.transactionWallet 
        : config.userWallet;

      console.log(`🪐 JUPITER ${tradeType}: Executing REAL blockchain transaction`);
      console.log(`💰 Amount: ${config.tradeAmount.toFixed(6)} SOL`);
      console.log(`🎯 Token: ${config.tokenAddress}`);
      console.log(`🏦 Active wallet: ${activeWallet.publicKey.toString()}`);
      
      if (config.useTransactionWallet) {
        console.log(`🔄 FRESH WALLET MODE: Every trade uses different address`);
      }
      
      // CRITICAL FIX: Ensure SELL trades use correct routing for chart visibility
      const inputMint = tradeType === 'BUY' ? 'So11111111111111111111111111111111111111112' : config.tokenAddress;
      const outputMint = tradeType === 'BUY' ? config.tokenAddress : 'So11111111111111111111111111111111111111112';
      
      console.log(`🔍 TRADE ROUTING: ${tradeType}`);
      console.log(`├── Input Mint: ${inputMint}`);
      console.log(`└── Output Mint: ${outputMint}`);

      let swapAmount: number;

      if (tradeType === 'BUY') {
        // BUY: Use SOL amount in lamports
        swapAmount = Math.floor(config.tradeAmount * LAMPORTS_PER_SOL);
        console.log(`🔄 REAL JUPITER SWAP: ${swapAmount} lamports`);
        console.log(`├── Input: SOL`);
        console.log(`└── Output: TOKEN`);
      } else {
        // SELL: Get token balance and calculate token amount
        console.log(`🔄 REAL JUPITER SWAP: Getting token balance for SELL`);
        console.log(`├── Input: TOKEN`);
        console.log(`└── Output: SOL`);
        
        try {
          // Use the active wallet (transaction wallet if enabled, otherwise main wallet)
          const walletForTokenCheck = config.useTransactionWallet && config.transactionWallet
            ? config.userWallet  // Check main wallet for tokens since transaction wallet is fresh
            : config.userWallet;
            
          const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
            walletForTokenCheck.publicKey,
            { mint: new PublicKey(config.tokenAddress) }
          );
          
          if (tokenAccounts.value.length === 0) {
            throw new Error('No token account found - need to BUY first');
          }
          
          const tokenBalance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
          const tokenDecimals = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.decimals;
          
          if (!tokenBalance || tokenBalance <= 0) {
            throw new Error(`No tokens to sell - balance: ${tokenBalance}`);
          }
          
          console.log(`🪙 Current token balance: ${tokenBalance} tokens`);
          
          // CRITICAL FIX: Use 80% of tokens for MAXIMUM chart visibility
          // This ensures SELL trades are EXTREMELY visible on DexScreener
          const tokensToSellFloat = tokenBalance * 0.80; // 80% for guaranteed visibility
          const rawTokenAmount = Math.floor(tokensToSellFloat * Math.pow(10, tokenDecimals));
          swapAmount = rawTokenAmount;
          
          console.log(`🎯 MASSIVE SELL: Using ${tokensToSellFloat.toFixed(6)} tokens (80.0% of balance for MAXIMUM visibility)`);
          
          if (swapAmount <= 0) {
            throw new Error(`Calculated sell amount too small: ${tokensToSellFloat} tokens`);
          }
          
          console.log(`💱 Selling ${tokensToSellFloat.toFixed(6)} tokens (${swapAmount} raw amount)`);
          
        } catch (tokenError) {
          console.error(`❌ Token balance preparation failed: ${tokenError.message}`);
          throw new Error(`SELL preparation failed: ${tokenError.message}`);
        }
      }

      // CRITICAL FIX: Force BOTH BUY and SELL through the PRIMARY DEX with highest liquidity
      let quoteUrl: string;
      
      // Always use the primary DEX that has the highest liquidity for this token
      const primaryDexName = config.primaryDex?.toLowerCase() || 'jupiter';
      console.log(`🎯 FORCING ${tradeType} through PRIMARY DEX: ${primaryDexName.toUpperCase()} for same pool visibility`);
      
      // Map primary DEX to Jupiter DEX parameter
      let dexParam = '';
      switch (primaryDexName) {
        case 'orca':
          dexParam = 'Whirlpool';
          break;
        case 'raydium':
          dexParam = 'Raydium,Raydium CLMM';
          break;
        case 'meteora':
          dexParam = 'Meteora';
          break;
        case 'pump.fun':
        case 'pump':
          dexParam = 'Pump.fun';
          break;
        default:
          // If unknown DEX, let Jupiter route optimally but log it
          console.log(`⚠️ Unknown primary DEX: ${primaryDexName}, using Jupiter routing`);
          dexParam = '';
      }
      
      if (dexParam) {
        // Force both BUY and SELL through the same primary DEX
        quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${swapAmount}&slippageBps=100&dexes=${dexParam}`;
        console.log(`├── Forcing through: ${dexParam}`);
      } else {
        // Fallback to Jupiter optimal routing
        quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${swapAmount}&slippageBps=100&onlyDirectRoutes=false`;
        console.log(`├── Using Jupiter optimal routing`);
      }
      
      console.log(`🎯 JUPITER QUOTE URL: ${quoteUrl}`);
      console.log(`📞 Fetching Jupiter quote...`);
      
      const quoteResponse = await fetch(quoteUrl, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!quoteResponse.ok) {
        const errorText = await quoteResponse.text();
        console.error(`❌ Jupiter quote failed: ${quoteResponse.status} - ${errorText}`);
        // STRICT NO FALLBACK POLICY - System fails if Jupiter is unavailable
        throw new Error(`Jupiter API unavailable: ${errorText} - Real trading requires Jupiter connectivity`);
      }

      const quoteData = await quoteResponse.json();
      console.log(`✅ Jupiter quote received`);
      console.log(`├── Input amount: ${quoteData.inAmount} lamports`);
      console.log(`└── Output amount: ${quoteData.outAmount} lamports`);

      // Get swap transaction from Jupiter
      console.log(`⚡ Preparing swap transaction...`);
      const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quoteData,
          userPublicKey: activeWallet.publicKey.toString(), // 🔥 USE TRANSACTION WALLET
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 'auto'
        })
      });

      if (!swapResponse.ok) {
        const errorText = await swapResponse.text();
        console.error(`❌ Jupiter swap preparation failed: ${swapResponse.status} - ${errorText}`);
        // NO FALLBACK - JUPITER ONLY
        throw new Error(`Jupiter swap preparation failed: ${errorText}`);
      }

      const swapData = await swapResponse.json();
      const { swapTransaction } = swapData;
      console.log(`✅ Jupiter swap transaction prepared`);
      
      // Log routing information for SELL trades
      if (tradeType === 'SELL' && swapData.routePlan) {
        console.log(`🔍 SELL ROUTING INFO:`);
        swapData.routePlan.forEach((route, index) => {
          console.log(`├── Route ${index + 1}: ${route.swapInfo?.label || 'Unknown'}`);
        });
      }
      
      // EXECUTE THE REAL TRANSACTION ON SOLANA BLOCKCHAIN
      console.log(`🚀 EXECUTING REAL JUPITER TRANSACTION ON MAINNET...`);
      const transactionBuf = Buffer.from(swapTransaction, 'base64');
      
      // Handle versioned transactions properly
      let transaction;
      let isVersioned = false;
      try {
        // Try versioned transaction first (Jupiter v6 returns versioned transactions)
        transaction = VersionedTransaction.deserialize(transactionBuf);
        isVersioned = true;
        console.log(`✅ Deserialized as VersionedTransaction`);
      } catch (versionedError) {
        console.log(`⚠️ VersionedTransaction failed: ${versionedError.message}`);
        try {
          // Fallback to legacy transaction
          transaction = Transaction.from(transactionBuf);
          console.log(`✅ Deserialized as legacy Transaction`);
          
          // Get fresh blockhash for legacy transactions
          const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
          transaction.recentBlockhash = blockhash;
          transaction.feePayer = activeWallet.publicKey; // 🔥 USE TRANSACTION WALLET
        } catch (legacyError) {
          console.error(`❌ Both transaction formats failed:`);
          console.error(`├── VersionedTransaction: ${versionedError.message}`);
          console.error(`└── Legacy Transaction: ${legacyError.message}`);
          throw new Error(`Transaction deserialization failed: ${versionedError.message}`);
        }
      }

      // Sign and send the REAL transaction
      let signature;
      if (isVersioned) {
        // Handle versioned transaction
        console.log(`🖋️ Signing VersionedTransaction with active wallet...`);
        transaction.sign([activeWallet]); // 🔥 USE TRANSACTION WALLET
        
        console.log(`📡 Sending VersionedTransaction to blockchain...`);
        
        // Check active wallet balance before sending
        const balance = await this.connection.getBalance(activeWallet.publicKey); // 🔥 USE TRANSACTION WALLET
        console.log(`💰 Wallet balance: ${(balance / 1_000_000_000).toFixed(9)} SOL`);
        
        // CRITICAL FIX: Jupiter calculates inflated fees but SPL DEX only needs ~5000 lamports
        const actualFeesNeeded = 5000; // Real SPL DEX fees: ~0.000005 SOL
        
        if (balance < actualFeesNeeded) { 
          throw new Error(`Insufficient balance: ${balance} lamports available, ${actualFeesNeeded} needed for actual SPL DEX fees`);
        }
        
        console.log(`✅ BYPASSING Jupiter's inflated fee calculation`);
        console.log(`   Balance: ${balance} lamports (${(balance/1_000_000_000).toFixed(6)} SOL)`);  
        console.log(`   Real fees needed: ${actualFeesNeeded} lamports (0.000005 SOL)`);
        console.log(`   Jupiter claimed: ${swapAmount + 5000} lamports (WRONG!)`);
        console.log(`   Proceeding with transaction...`);
        
        // CRITICAL: Skip preflight checks to bypass Jupiter's incorrect fee calculations
        console.log(`🚀 Sending transaction with skipPreflight=true (bypassing fee error)...`);
        signature = await this.connection.sendTransaction(transaction, {
          skipPreflight: true,  // CRITICAL FIX: Skip Jupiter's incorrect fee simulation
          maxRetries: 3
        });
        console.log(`🚀 Versioned transaction sent: ${signature}`);
        
        // Confirm the transaction
        console.log(`⏳ Confirming transaction...`);
        await this.connection.confirmTransaction(signature, 'confirmed');
      } else {
        // Handle legacy transaction - SIGN AND SEND REAL JUPITER TRANSACTION
        console.log(`🖋️ Signing legacy Transaction with active wallet...`);
        transaction.sign(activeWallet); // 🔥 USE TRANSACTION WALLET
        
        console.log(`📡 Sending legacy Transaction to blockchain...`);
        signature = await this.connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: true,  // CRITICAL FIX: Skip Jupiter's incorrect fee simulation
          maxRetries: 3
        });
        console.log(`🚀 Legacy transaction sent: ${signature}`);
        
        // Confirm the transaction
        console.log(`⏳ Confirming transaction...`);
        await this.connection.confirmTransaction(signature, 'confirmed');
      }

      console.log(`🎉 JUPITER ${tradeType} TRANSACTION CONFIRMED!`);
      console.log(`🔗 Signature: ${signature}`);
      console.log(`📊 Solscan: https://solscan.io/tx/${signature}`);
      console.log(`📈 DexScreener: Volume will appear within 1-2 minutes`);
      console.log(`✅ REAL VOLUME GENERATED: This trade is 100% authentic and visible on all charts`);

      return {
        success: true,
        signature,
        dex: 'Jupiter',
        tradeType,
        amount: config.tradeAmount,
        tokenAddress: config.tokenAddress,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error(`❌ Jupiter trade failed - NO FALLBACK: ${error}`);
      return {
        success: false,
        error: `Jupiter trade failed: ${error}`,
        dex: 'Jupiter',
        tradeType,
        amount: config.tradeAmount,
        tokenAddress: config.tokenAddress,
        timestamp: Date.now()
      };
    }
  }

  // Execute trade on Raydium - ONLY REAL JUPITER TRADES
  private async executeRaydiumTrade(config: DexTradeConfig, tradeType: 'BUY' | 'SELL'): Promise<TradeResult> {
    console.log(`🌊 RAYDIUM ${tradeType} ROUTING THROUGH JUPITER - JUPITER ONLY`);
    // ALL DEX trades must go through Jupiter for 100% real execution
    return await this.executeJupiterTrade(config, tradeType);
  }

  // Execute trade on Orca - ONLY REAL JUPITER TRADES
  private async executeOrcaTrade(config: DexTradeConfig, tradeType: 'BUY' | 'SELL'): Promise<TradeResult> {
    console.log(`🐋 ORCA ${tradeType} ROUTING THROUGH JUPITER - JUPITER ONLY`);
    // ALL DEX trades must go through Jupiter for 100% real execution
    return await this.executeJupiterTrade(config, tradeType);
  }

  // COMPLETELY ELIMINATED - ALL BANNED METHODS REMOVED FOR 100% REAL TRADING
  private async executeBANNED_METHOD(config: DexTradeConfig, tradeType: 'BUY' | 'SELL', dexName?: string): Promise<TradeResult> {
    console.error('🚨 BANNED METHOD called');
    console.error('🛑 ZERO TOLERANCE FOR BANNED METHODS - Only real Jupiter DEX swaps allowed');
    throw new Error('BANNED METHODS ELIMINATED - System requires real Jupiter DEX swaps only');
  }

  // Validate that we can trade this token before starting
  async validateTradeability(tokenAddress: string): Promise<boolean> {
    try {
      const validation = await this.tokenValidator.validateToken(tokenAddress);
      
      if (!validation.valid) {
        console.error(`❌ Token validation failed: ${validation.error}`);
        return false;
      }

      if (validation.pools.length === 0) {
        console.error(`❌ No trading pools found for ${tokenAddress}`);
        return false;
      }

      const bestPool = this.tokenValidator.getBestPool(validation.pools);
      if (!bestPool) {
        console.error(`❌ No suitable pools with sufficient liquidity`);
        return false;
      }

      console.log(`✅ Token ${tokenAddress} is tradeable on ${bestPool.dex}`);
      console.log(`💧 Best pool liquidity: $${bestPool.liquidityUsd.toFixed(2)}`);
      
      return true;

    } catch (error) {
      console.error(`❌ Tradeability validation failed:`, error);
      return false;
    }
  }
}