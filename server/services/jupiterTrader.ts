import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
// Using built-in fetch (Node 18+)

export class JupiterTrader {
  private connection: Connection;

  constructor() {
    this.connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  }

  // Execute real Jupiter swap on mainnet
  async executeSwap(
    walletKeypair: Keypair,
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number = 50
  ): Promise<string | null> {
    try {
      console.log(`🔄 Executing Jupiter swap: ${amount} lamports`);
      console.log(`📊 ${inputMint} → ${outputMint}`);

      // Get quote from Jupiter
      const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
      const quoteResponse = await fetch(quoteUrl);
      const quoteData = await quoteResponse.json();

      if (quoteData.error) {
        console.error('❌ Jupiter quote error:', quoteData.error);
        return null;
      }

      console.log(`✅ Quote: ${quoteData.inAmount} → ${quoteData.outAmount}`);
      console.log(`💰 Price impact: ${quoteData.priceImpactPct}%`);

      // Get swap transaction from Jupiter
      const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteResponse: quoteData,
          userPublicKey: walletKeypair.publicKey.toString(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 'auto'
        }),
      });

      const swapData = await swapResponse.json();

      if (swapData.error) {
        console.error('❌ Jupiter swap error:', swapData.error);
        return null;
      }

      // Deserialize the transaction
      const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

      // Sign the transaction
      transaction.sign([walletKeypair]);

      // Send the transaction
      console.log('📡 Sending transaction to Solana mainnet...');
      const txid = await this.connection.sendTransaction(transaction, {
        skipPreflight: false,
        maxRetries: 3
      });

      console.log(`✅ Transaction sent: ${txid}`);
      console.log(`🔗 Explorer: https://solscan.io/tx/${txid}`);

      // Wait for confirmation
      const confirmation = await this.connection.confirmTransaction(txid, 'confirmed');
      
      if (confirmation.value.err) {
        console.error('❌ Transaction failed:', confirmation.value.err);
        return null;
      }

      console.log(`🎉 Transaction confirmed: ${txid}`);
      return txid;

    } catch (error) {
      console.error('❌ Jupiter swap execution failed:', error);
      return null;
    }
  }

  // Execute BUY trade (SOL → Token)
  async executeBuyTrade(walletKeypair: Keypair, tokenAddress: string, solAmount: number): Promise<string | null> {
    const inputMint = 'So11111111111111111111111111111111111111112'; // SOL
    const outputMint = tokenAddress;
    const amount = Math.floor(solAmount * 1000000000); // Convert SOL to lamports

    console.log(`🟢 EXECUTING BUY TRADE: ${solAmount} SOL → ${tokenAddress}`);
    
    return await this.executeSwap(walletKeypair, inputMint, outputMint, amount);
  }

  // Execute SELL trade (Token → SOL)
  async executeSellTrade(walletKeypair: Keypair, tokenAddress: string, solAmount: number): Promise<string | null> {
    const inputMint = tokenAddress;
    const outputMint = 'So11111111111111111111111111111111111111112'; // SOL

    console.log(`🔴 EXECUTING SELL TRADE: Converting ${solAmount} SOL worth of tokens → SOL`);
    
    try {
      // First, get current token balance to determine how many tokens to sell
      const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        walletKeypair.publicKey,
        { mint: new PublicKey(tokenAddress) }
      );
      
      if (tokenAccounts.value.length === 0) {
        console.log(`❌ No token account found for ${tokenAddress} - need to BUY first`);
        return null;
      }
      
      const tokenBalance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
      const tokenDecimals = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.decimals;
      
      if (!tokenBalance || tokenBalance <= 0) {
        console.log(`❌ No tokens to sell - balance: ${tokenBalance}`);
        return null;
      }
      
      console.log(`🪙 Current token balance: ${tokenBalance} tokens`);
      
      // Calculate how many tokens to sell (use a portion, not all)
      const sellRatio = Math.min(solAmount / 0.001, 0.5); // Max 50% of tokens
      const tokensToSell = Math.floor(tokenBalance * sellRatio * 0.1); // 10% of calculated amount
      const tokensToSellRaw = tokensToSell * Math.pow(10, tokenDecimals);
      
      if (tokensToSellRaw <= 0) {
        console.log(`❌ Calculated sell amount too small: ${tokensToSell} tokens`);
        return null;
      }
      
      console.log(`💱 Selling ${tokensToSell} tokens (${tokensToSellRaw} raw amount)`);
      
      return await this.executeSwap(walletKeypair, inputMint, outputMint, tokensToSellRaw, 100);
      
    } catch (error) {
      console.error(`❌ SELL trade preparation failed: ${error.message}`);
      return null;
    }
  }
}