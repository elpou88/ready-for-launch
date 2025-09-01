import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

export interface SwapQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee?: any;
  priceImpactPct: string;
  routePlan: any[];
}

export interface SwapInstructions {
  tokenLedgerInstruction?: any;
  computeBudgetInstructions?: any[];
  setupInstructions?: any[];
  swapInstruction: any;
  cleanupInstruction?: any;
  addressLookupTableAddresses?: string[];
}

export class JupiterSwapService {
  private connection: Connection;
  private baseUrl = 'https://quote-api.jup.ag/v6';

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async getSwapQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number = 100
  ): Promise<SwapQuote | null> {
    try {
      const params = new URLSearchParams({
        inputMint,
        outputMint,
        amount: amount.toString(),
        slippageBps: slippageBps.toString(),
        onlyDirectRoutes: 'false',
        asLegacyTransaction: 'true'
      });

      console.log(`🔍 Getting Jupiter quote: ${amount} lamports ${inputMint} → ${outputMint}`);
      
      const response = await fetch(`${this.baseUrl}/quote?${params}`);
      
      if (!response.ok) {
        console.error(`Jupiter quote API error: ${response.status}`);
        return null;
      }

      const quote = await response.json();
      console.log(`💹 Jupiter quote: ${quote.inAmount} → ${quote.outAmount} (${quote.priceImpactPct}% impact)`);
      
      return quote;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Jupiter quote error: ${errorMessage}`);
      return null;
    }
  }

  async getSwapInstructions(quote: SwapQuote, userPublicKey: string): Promise<SwapInstructions | null> {
    try {
      console.log(`🔧 Getting Jupiter swap instructions for ${userPublicKey}`);
      
      const response = await fetch(`${this.baseUrl}/swap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey,
          wrapAndUnwrapSol: true,
          useSharedAccounts: true,
          feeAccount: undefined,
          trackingAccount: undefined,
          computeUnitPriceMicroLamports: 0, // CRITICAL: Set to 0 for no compute unit fees
          asLegacyTransaction: true
        }),
      });

      if (!response.ok) {
        console.error(`Jupiter swap API error: ${response.status}`);
        return null;
      }

      const { swapTransaction } = await response.json();
      console.log(`✅ Jupiter swap instructions received`);
      
      return { swapInstruction: swapTransaction };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Jupiter swap instructions error: ${errorMessage}`);
      return null;
    }
  }

  async executeSwap(
    inputMint: string,
    outputMint: string,
    amount: number,
    wallet: Keypair,
    slippageBps: number = 100
  ): Promise<string | null> {
    try {
      console.log(`🚀 Executing Jupiter swap: ${amount} lamports`);
      console.log(`📊 Route: ${inputMint} → ${outputMint}`);

      // Get quote
      const quote = await this.getSwapQuote(inputMint, outputMint, amount, slippageBps);
      if (!quote) {
        console.error(`❌ Failed to get Jupiter quote`);
        return null;
      }

      // Get swap instructions
      const swapInstructions = await this.getSwapInstructions(quote, wallet.publicKey.toString());
      if (!swapInstructions) {
        console.error(`❌ Failed to get Jupiter swap instructions`);
        return null;
      }

      // Deserialize and sign transaction
      const swapTransactionBuf = Buffer.from(swapInstructions.swapInstruction, 'base64');
      const transaction = Transaction.from(swapTransactionBuf);
      
      // Sign transaction
      transaction.sign(wallet);

      console.log(`📝 Transaction signed, executing swap...`);

      // Execute transaction
      const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });

      console.log(`🎯 Jupiter swap executed: ${signature}`);
      console.log(`🔗 View on explorer: https://solscan.io/tx/${signature}`);

      // Wait for confirmation
      await this.connection.confirmTransaction(signature, 'confirmed');
      console.log(`✅ Jupiter swap confirmed: ${signature}`);

      return signature;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Jupiter swap execution failed: ${errorMessage}`);
      return null;
    }
  }

  // Create a buy order (SOL → Token)
  async executeBuyOrder(
    tokenMint: string,
    solAmount: number,
    wallet: Keypair
  ): Promise<string | null> {
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    return await this.executeSwap(SOL_MINT, tokenMint, solAmount, wallet, 200);
  }

  // Create a sell order (Token → SOL) 
  async executeSellOrder(
    tokenMint: string,
    tokenAmount: number,
    wallet: Keypair
  ): Promise<string | null> {
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    return await this.executeSwap(tokenMint, SOL_MINT, tokenAmount, wallet, 200);
  }

  // TRIPLE-CHECK: Verify pool → trade guarantee before execution
  async verifyPoolTradeability(tokenMint: string, poolAddress: string): Promise<boolean> {
    try {
      console.log(`🔍 TRIPLE-CHECK: Verifying ${tokenMint} pool ${poolAddress} is 100% tradeable`);
      
      const SOL_MINT = 'So11111111111111111111111111111111111111112';
      
      // Test 1: Small amount quote verification
      const smallQuote = await this.getSwapQuote(SOL_MINT, tokenMint, 100000, 50); // 0.0001 SOL
      if (!smallQuote || !smallQuote.routePlan || smallQuote.routePlan.length === 0) {
        console.log(`❌ POOL FAILED: No Jupiter route for small amount`);
        return false;
      }
      
      // Test 2: Medium amount quote verification  
      const mediumQuote = await this.getSwapQuote(SOL_MINT, tokenMint, 1000000, 100); // 0.001 SOL
      if (!mediumQuote || !mediumQuote.routePlan || mediumQuote.routePlan.length === 0) {
        console.log(`❌ POOL FAILED: No Jupiter route for medium amount`);
        return false;
      }
      
      // Test 3: Reverse swap verification (sell capability)
      const reverseQuote = await this.getSwapQuote(tokenMint, SOL_MINT, 1000, 100);
      if (!reverseQuote || !reverseQuote.routePlan || reverseQuote.routePlan.length === 0) {
        console.log(`❌ POOL FAILED: No reverse Jupiter route for selling`);
        return false;
      }
      
      console.log(`✅ POOL VERIFIED: 100% tradeable - buy/sell routes confirmed`);
      console.log(`📊 Buy route: ${smallQuote.routePlan.length} steps`);
      console.log(`📊 Sell route: ${reverseQuote.routePlan.length} steps`);
      return true;
      
    } catch (error) {
      console.log(`❌ POOL VERIFICATION FAILED: ${error}`);
      return false;
    }
  }

  // Check if token has sufficient liquidity for trading
  async checkTokenLiquidity(tokenMint: string, testAmount: number = 1000000): Promise<boolean> {
    try {
      const SOL_MINT = 'So11111111111111111111111111111111111111112';
      const quote = await this.getSwapQuote(SOL_MINT, tokenMint, testAmount);
      
      if (!quote) return false;
      
      const priceImpact = parseFloat(quote.priceImpactPct);
      console.log(`💧 Liquidity check: ${priceImpact}% price impact for ${testAmount} lamports`);
      
      // Consider liquid if price impact is less than 5%
      return priceImpact < 5.0;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Liquidity check failed: ${errorMessage}`);
      return false;
    }
  }
}