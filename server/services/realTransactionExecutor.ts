import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { WalletManager } from './walletManager.js';

export class RealTransactionExecutor {
  private connection: Connection;
  private walletManager: WalletManager;

  constructor() {
    this.connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    this.walletManager = new WalletManager();
  }

  // Execute real Jupiter swap with session wallet
  async executeJupiterSwap(sessionId: string, inputMint: string, outputMint: string, amount: number): Promise<string | null> {
    try {
      console.log(`🔥 EXECUTING REAL JUPITER SWAP FOR SESSION: ${sessionId}`);
      
      // Get user wallet with private key
      const userWallet = this.walletManager.getUserWallet(sessionId);
      if (!userWallet) {
        console.error('❌ No wallet found for session:', sessionId);
        return null;
      }

      console.log(`💰 Using wallet: ${userWallet.publicKey}`);
      console.log(`🔑 Private key available: YES`);

      // Reconstruct keypair from stored private key
      const privateKeyBuffer = Buffer.from(userWallet.privateKey, 'base64');
      const keypair = Keypair.fromSecretKey(privateKeyBuffer);

      console.log(`📊 Swap: ${amount} units of ${inputMint} → ${outputMint}`);

      // Get Jupiter quote
      const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`;
      const quoteResponse = await fetch(quoteUrl);
      const quoteData = await quoteResponse.json();

      if (quoteData.error) {
        console.error('❌ Jupiter quote error:', quoteData.error);
        return null;
      }

      console.log(`✅ Quote received: ${quoteData.inAmount} → ${quoteData.outAmount}`);
      console.log(`💰 Price impact: ${quoteData.priceImpactPct}%`);

      // Get swap transaction
      const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteResponse: quoteData,
          userPublicKey: keypair.publicKey.toString(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 'auto'
        }),
      });

      const swapData = await swapResponse.json();

      if (swapData.error) {
        console.error('❌ Jupiter swap transaction error:', swapData.error);
        return null;
      }

      // Deserialize and sign transaction
      const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

      // Sign with user's private key
      transaction.sign([keypair]);

      console.log('📡 Sending transaction to Solana mainnet...');

      // Execute on mainnet
      const txid = await this.connection.sendTransaction(transaction, {
        skipPreflight: false,
        maxRetries: 3
      });

      console.log(`🎉 REAL TRANSACTION SENT: ${txid}`);
      console.log(`🔗 Explorer: https://solscan.io/tx/${txid}`);

      // Wait for confirmation
      const confirmation = await this.connection.confirmTransaction(txid, 'confirmed');
      
      if (confirmation.value.err) {
        console.error('❌ Transaction failed:', confirmation.value.err);
        return null;
      }

      console.log(`✅ TRANSACTION CONFIRMED: ${txid}`);
      return txid;

    } catch (error) {
      console.error('❌ Real transaction execution failed:', error);
      return null;
    }
  }

  // Execute BUY trade (SOL → Token)
  async executeBuyTrade(sessionId: string, tokenAddress: string, solAmount: number): Promise<string | null> {
    const inputMint = 'So11111111111111111111111111111111111111112'; // SOL
    const amount = Math.floor(solAmount * 1000000000); // Convert to lamports

    console.log(`🟢 EXECUTING REAL BUY TRADE: ${solAmount} SOL → ${tokenAddress}`);
    
    return await this.executeJupiterSwap(sessionId, inputMint, tokenAddress, amount);
  }

  // Execute SELL trade (Token → SOL)  
  async executeSellTrade(sessionId: string, tokenAddress: string, tokenAmount: number): Promise<string | null> {
    const outputMint = 'So11111111111111111111111111111111111111112'; // SOL

    console.log(`🔴 EXECUTING REAL SELL TRADE: ${tokenAmount} tokens → SOL`);
    
    return await this.executeJupiterSwap(sessionId, tokenAddress, outputMint, tokenAmount);
  }
}