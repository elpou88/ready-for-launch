import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  BANNED_SEND_AND_CONFIRM,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import bs58 from 'bs58';
import { derivePath } from 'ed25519-hd-key';
import * as bip39 from 'bip39';
import axios from 'axios';
import { storage } from '../storage';
import { WebSocket } from 'ws';
import type { BotConfig, WebSocketMessage } from '@shared/schema';

export class VolumeBotService {
  private connection: Connection | null = null;
  private mainWallet: Keypair | null = null;
  private isRunning = false;
  private isPaused = false;
  private currentTokenIndex = 0;
  private wsClients: Set<WebSocket> = new Set();
  private botConfig: BotConfig | null = null;
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeBot();
  }

  addWebSocketClient(ws: WebSocket) {
    this.wsClients.add(ws);
    ws.on('close', () => {
      this.wsClients.delete(ws);
    });
  }

  private broadcast(message: WebSocketMessage) {
    const messageStr = JSON.stringify(message);
    this.wsClients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    });
  }

  private async initializeBot() {
    try {
      // Initialize with default configuration using environment variables
      const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
      const walletMnemonic = process.env.WALLET_MNEMONIC || 'cause panda property rude gown color scan reflect eye vicious fog congress';
      const pumpProgramId = process.env.PUMP_PROGRAM_ID || '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
      const bonkProgramId = process.env.BONK_PROGRAM_ID || '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg';

      // Generate wallet from mnemonic
      const seed = bip39.mnemonicToSeedSync(walletMnemonic);
      const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
      this.mainWallet = Keypair.fromSeed(derivedSeed);

      this.connection = new Connection(rpcUrl, 'confirmed');

      // Create or update bot config
      this.botConfig = await storage.createOrUpdateBotConfig({
        rpcUrl,
        mainWalletPrivateKey: bs58.encode(this.mainWallet.secretKey),
        pumpProgramId,
        bonkProgramId,
        isActive: false
      });

      await this.updateMainWalletBalance();
      console.log(`Bot initialized with wallet: ${this.mainWallet.publicKey.toBase58()}`);
    } catch (error) {
      console.error('Failed to initialize bot:', error);
    }
  }

  async updateConfig(config: any) {
    try {
      this.botConfig = await storage.createOrUpdateBotConfig(config);
      this.connection = new Connection(this.botConfig.rpcUrl, 'confirmed');
      
      // If new mnemonic is provided, regenerate wallet
      if (config.walletMnemonic) {
        const seed = bip39.mnemonicToSeedSync(config.walletMnemonic);
        const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
        this.mainWallet = Keypair.fromSeed(derivedSeed);
      } else {
        // Decode private key from base58 format
        const privateKeyBytes = Buffer.from(this.botConfig.mainWalletPrivateKey, 'base64');
        this.mainWallet = Keypair.fromSecretKey(privateKeyBytes);
      }
      
      await this.updateMainWalletBalance();
      
      this.broadcast({
        type: 'bot_status',
        data: { isActive: this.isRunning, status: 'Configuration updated' }
      });
    } catch (error) {
      this.broadcast({
        type: 'error',
        data: { message: `Failed to update config: ${error instanceof Error ? error.message : 'Unknown error'}` }
      });
    }
  }

  private async updateMainWalletBalance() {
    if (!this.connection || !this.mainWallet) return;
    
    try {
      const balance = await this.connection.getBalance(this.mainWallet.publicKey);
      const solBalance = balance / LAMPORTS_PER_SOL;
      
      await storage.updateWalletBalance({
        address: this.mainWallet.publicKey.toBase58(),
        balance: solBalance.toString(),
      });

      this.broadcast({
        type: 'wallet_balance_update',
        data: {
          id: '',
          address: this.mainWallet.publicKey.toBase58(),
          balance: solBalance.toString(),
          lastUpdated: new Date(),
        }
      });
    } catch (error) {
      console.error('Failed to update wallet balance:', error);
    }
  }

  async start() {
    if (!this.botConfig || !this.connection || !this.mainWallet) {
      this.broadcast({
        type: 'error',
        data: { message: 'Bot not configured properly. Please check configuration.' }
      });
      return;
    }

    if (this.isRunning) {
      this.broadcast({
        type: 'error',
        data: { message: 'Bot is already running' }
      });
      return;
    }

    this.isRunning = true;
    this.isPaused = false;
    
    await storage.createOrUpdateBotConfig({
      ...this.botConfig,
      isActive: true,
    });

    this.broadcast({
      type: 'bot_status',
      data: { isActive: true, status: 'Bot started' }
    });

    this.runBotLoop();
  }

  async startBot() {
    return this.start();
  }

  async stop() {
    this.isRunning = false;
    this.isPaused = false;
    
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }

    if (this.botConfig) {
      await storage.createOrUpdateBotConfig({
        ...this.botConfig,
        isActive: false,
      });
    }

    this.broadcast({
      type: 'bot_status',
      data: { isActive: false, status: 'Bot stopped' }
    });
  }

  async stopBot() {
    return this.stop();
  }

  async pauseBot() {
    this.isPaused = !this.isPaused;
    
    this.broadcast({
      type: 'bot_status',
      data: { 
        isActive: this.isRunning, 
        status: this.isPaused ? 'Bot paused' : 'Bot resumed' 
      }
    });
  }

  private async runBotLoop() {
    if (!this.isRunning) return;

    if (!this.isPaused) {
      try {
        const tokens = await storage.getTokens();
        const activeTokens = tokens.filter(token => token.isActive);
        
        if (activeTokens.length === 0) {
          this.broadcast({
            type: 'error',
            data: { message: 'No active tokens configured' }
          });
          await this.stopBot();
          return;
        }

        console.log(`🚀 Starting volume burst for ${activeTokens.length} tokens...`);
        
        // Generate high-frequency volume for all tokens simultaneously
        const volumePromises = activeTokens.map(token => 
          this.generateVolumeBurst(token).catch(error => {
            console.error(`Volume burst failed for ${token.name}:`, error);
          })
        );
        
        await Promise.allSettled(volumePromises);
        await this.updateMetrics();
        
      } catch (error) {
        console.error('Error in bot loop:', error);
        this.broadcast({
          type: 'error',
          data: { message: error instanceof Error ? error.message : 'Unknown error' }
        });
      }
    }

    // Schedule next high-frequency cycle - every 20 seconds for trending
    this.intervalId = setTimeout(() => this.runBotLoop(), 20000);
  }

  // High-frequency volume generation - creates multiple rapid transactions
  private async generateVolumeBurst(token: any) {
    if (!this.connection || !this.mainWallet) return;

    console.log(`💥 Generating volume burst for ${token.name}...`);
    
    // Create 3-5 rapid transactions to simulate trending activity
    const burstCount = Math.floor(Math.random() * 3) + 3; // 3-5 transactions
    const wallets: Keypair[] = [];
    
    try {
      // Generate multiple wallets for rapid trading
      for (let i = 0; i < burstCount; i++) {
        const wallet = Keypair.generate();
        wallets.push(wallet);
        
        // Fund wallet with smaller amounts for rapid trading
        await this.fundWalletQuick(wallet);
        
        // Small delay between fundings
        await this.wait(1000);
      }
      
      // Execute rapid trades with all wallets simultaneously
      const tradePromises = wallets.map((wallet, index) => 
        this.executeRapidTrade(wallet, token, index).catch(error => {
          console.error(`Rapid trade ${index + 1} failed for ${token.name}:`, error);
        })
      );
      
      await Promise.allSettled(tradePromises);
      console.log(`✅ Volume burst completed for ${token.name} - ${burstCount} transactions`);
      
    } catch (error) {
      console.error(`Volume burst failed for ${token.name}:`, error);
    }
  }

  // Quick wallet funding with smaller amounts for rapid trading - BLOCKED
  private async fundWalletQuick(wallet: Keypair) {
    // QUICK FUNDING BLOCKED - Only Jupiter DEX swaps allowed
    throw new Error("QUICK_FUNDING_BANNED - Only real Jupiter DEX swaps allowed");
  }

  // Execute rapid buy/sell trades to create chart activity
  private async executeRapidTrade(wallet: Keypair, token: any, tradeIndex: number) {
    if (!this.connection || !this.mainWallet) return;

    const tokenAddress = token.type === 'spl' ? token.mint : token.bonding;
    if (!tokenAddress) return;

    try {
      switch (token.type) {
        case 'spl':
          // Rapid SPL token trading
          if (await this.validateTokenMint(token.mint)) {
            // Buy (SOL -> Token)
            await this.rapidSwapJupiter(wallet, "So11111111111111111111111111111111111111112", token.mint, token, `buy-${tradeIndex}`);
            
            // Quick delay then sell (Token -> SOL)
            await this.wait(2000 + Math.random() * 3000); // 2-5 second random delay
            
            const tokenBalance = await this.getTokenBalance(wallet.publicKey, token.mint);
            if (tokenBalance > 0) {
              await this.rapidSwapJupiter(wallet, token.mint, "So11111111111111111111111111111111111111112", token, `sell-${tradeIndex}`);
            }
          }
          break;
          
        case 'pumpfun':
        case 'bonkfun':
          // Only real Jupiter DEX swaps for all tokens
          if (await this.validateTokenMint(token.bonding)) {
            await this.rapidSwapJupiter(wallet, "So11111111111111111111111111111111111111112", token.bonding, token, `buy-${tradeIndex}`);
            await this.wait(2000 + Math.random() * 3000);
            const tokenBalance = await this.getTokenBalance(wallet.publicKey, token.bonding);
            if (tokenBalance > 0) {
              await this.rapidSwapJupiter(wallet, token.bonding, "So11111111111111111111111111111111111111112", token, `sell-${tradeIndex}`);
            }
          }
          break;
      }
      
    } catch (error) {
      console.error(`Rapid trade ${tradeIndex} failed for ${token.name}:`, error);
    }
  }

  // Optimized Jupiter swaps for rapid trading
  private async rapidSwapJupiter(wallet: Keypair, inputMint: string, outputMint: string, token: any, tradeType: string) {
    try {
      // Smaller amounts for rapid trading
      const amount = inputMint === "So11111111111111111111111111111111111111112" ? 500000 : 100; // 0.0005 SOL
      const quoteURL = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=1000&onlyDirectRoutes=true`;
      
      const quoteResponse = await axios.get(quoteURL);
      const quotes = quoteResponse.data;
      
      if (!quotes || quotes.length === 0) {
        throw new Error('No rapid route available');
      }

      const bestQuote = quotes[0];
      
      const swapResponse = await axios.post('https://quote-api.jup.ag/v6/swap', {
        userPublicKey: wallet.publicKey.toBase58(),
        quoteResponse: bestQuote,
        wrapAndUnwrapSol: true,
        computeUnitPriceMicroLamports: 'auto',
      });

      const txBuf = Buffer.from(swapResponse.data.swapTransaction, 'base64');
      const tx = Transaction.from(txBuf);
      tx.partialSign(wallet);

      const sig = await this.connection!.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
        preflightCommitment: 'processed',
        maxRetries: 1
      });

      // Record rapid transaction
      await storage.createTransaction({
        tokenId: token.id,
        type: `rapid_${tradeType}`,
        walletAddress: wallet.publicKey.toBase58(),
        signature: sig,
        status: 'success',
        errorMessage: null,
      });

      console.log(`⚡ Rapid ${tradeType} completed: ${sig.substring(0, 8)}...`);
      
    } catch (error) {
      console.error(`Rapid ${tradeType} failed:`, error);
      throw error;
    }
  }

  private async handleToken(token: any) {
    if (!this.connection || !this.mainWallet) return;

    const freshWallet = Keypair.generate();
    console.log(`Processing ${token.name} with wallet: ${freshWallet.publicKey.toBase58()}`);
    
    try {
      // Validate token addresses before processing
      const tokenAddress = token.type === 'spl' ? token.mint : token.bonding;
      if (!tokenAddress) {
        throw new Error(`Invalid token address for ${token.name}`);
      }

      await this.fundWallet(freshWallet);
      await this.wait(8000); // Wait for funding confirmation

      switch (token.type) {
        case 'spl':
          // Validate SPL token exists on-chain
          const isValidToken = await this.validateTokenMint(token.mint);
          if (!isValidToken) {
            throw new Error(`Invalid or non-existent SPL token: ${token.mint}`);
          }
          
          // SOL to Token swap
          await this.swapJupiter(freshWallet, "So11111111111111111111111111111111111111112", token.mint, token);
          await this.wait(20000); // Longer wait for Jupiter confirmations
          
          // Check if we have tokens to swap back
          const tokenBalance = await this.getTokenBalance(freshWallet.publicKey, token.mint);
          if (tokenBalance > 0) {
            // Token back to SOL swap
            await this.swapJupiter(freshWallet, token.mint, "So11111111111111111111111111111111111111112", token);
          }
          break;
          
        case 'pumpfun':
        case 'bonkfun':
          // Only real Jupiter DEX swaps for pump.fun/bonk.fun tokens
          if (await this.validateTokenMint(token.bonding)) {
            await this.swapJupiter(freshWallet, "So11111111111111111111111111111111111111112", token.bonding, token);
            await this.wait(15000);
            const tokenBalance = await this.getTokenBalance(freshWallet.publicKey, token.bonding);
            if (tokenBalance > 0) {
              await this.swapJupiter(freshWallet, token.bonding, "So11111111111111111111111111111111111111112", token);
            }
          }
          break;
          
        default:
          throw new Error(`Unsupported token type: ${token.type}`);
      }

      // Log successful volume generation
      console.log(`Volume generated successfully for ${token.name} using wallet ${freshWallet.publicKey.toBase58()}`);
      
    } catch (error) {
      console.error(`Error handling token ${token.name}:`, error);
      
      // Record failed operation
      const transaction = await storage.createTransaction({
        tokenId: token.id,
        type: `${token.type}_error`,
        walletAddress: freshWallet.publicKey.toBase58(),
        signature: '',
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      this.broadcast({
        type: 'error',
        data: { 
          message: `${token.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      });
    }
  }

  private async getTokenBalance(walletAddress: PublicKey, tokenMint: string): Promise<number> {
    try {
      if (!this.connection) return 0;
      
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        walletAddress,
        { mint: new PublicKey(tokenMint) }
      );
      
      if (tokenAccounts.value.length === 0) return 0;
      
      const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
      return balance || 0;
    } catch (error) {
      console.error('Failed to get token balance:', error);
      return 0;
    }
  }

  private async fundWallet(wallet: Keypair) {
    if (!this.connection || !this.mainWallet) throw new Error('Connection or main wallet not initialized');

    // WALLET FUNDING BLOCKED - Only Jupiter DEX swaps allowed
    throw new Error("WALLET_FUNDING_BANNED - Only real Jupiter DEX swaps allowed");
  }

  private async validateTokenMint(mintAddress: string): Promise<boolean> {
    try {
      if (!this.connection) return false;
      
      const mintPublicKey = new PublicKey(mintAddress);
      const accountInfo = await this.connection.getAccountInfo(mintPublicKey);
      
      // Check if the account exists and is a valid SPL token mint
      return accountInfo !== null && accountInfo.owner.equals(new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'));
    } catch (error) {
      console.error(`Token validation failed for ${mintAddress}:`, error);
      return false;
    }
  }

  private async swapJupiter(wallet: Keypair, inputMint: string, outputMint: string, token: any) {
    try {
      // Validate token mints before attempting swap
      if (inputMint !== "So11111111111111111111111111111111111111112") {
        const isValidInput = await this.validateTokenMint(inputMint);
        if (!isValidInput) {
          throw new Error(`Invalid input token mint: ${inputMint}`);
        }
      }
      
      if (outputMint !== "So11111111111111111111111111111111111111112") {
        const isValidOutput = await this.validateTokenMint(outputMint);
        if (!isValidOutput) {
          throw new Error(`Invalid output token mint: ${outputMint}`);
        }
      }

      // Dynamic amount based on wallet balance
      let amount = 1000000; // Default 0.001 SOL
      if (inputMint === "So11111111111111111111111111111111111111112") {
        const balance = await this.connection!.getBalance(wallet.publicKey);
        amount = Math.floor(balance * 0.8); // Use 80% of SOL balance
      }

      const quoteURL = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=500&onlyDirectRoutes=false`;
      
      const quoteResponse = await axios.get(quoteURL);
      const quotes = quoteResponse.data;
      
      if (!quotes || quotes.length === 0) {
        throw new Error('No Jupiter routes available for this token pair');
      }

      const bestQuote = quotes[0];
      
      const swapResponse = await axios.post('https://quote-api.jup.ag/v6/swap', {
        userPublicKey: wallet.publicKey.toBase58(),
        quoteResponse: bestQuote,
        wrapAndUnwrapSol: true,
        computeUnitPriceMicroLamports: 'auto',
        prioritizationFeeLamports: 'auto',
      });

      const txBuf = Buffer.from(swapResponse.data.swapTransaction, 'base64');
      const tx = Transaction.from(txBuf);
      tx.partialSign(wallet);

      const sig = await this.connection!.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'processed',
        maxRetries: 3
      });

      // Wait for confirmation with timeout
      const confirmation = await this.connection!.confirmTransaction({
        signature: sig,
        blockhash: tx.recentBlockhash!,
        lastValidBlockHeight: (await this.connection!.getLatestBlockhash()).lastValidBlockHeight
      }, 'confirmed');

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`);
      }

      // Send 25% revenue fee to main wallet
      await this.collectRevenueFee(wallet, inputMint === "So11111111111111111111111111111111111111112" ? amount * 0.25 : 0);

      const transaction = await storage.createTransaction({
        tokenId: token.id,
        type: 'jupiter_swap',
        walletAddress: wallet.publicKey.toBase58(),
        signature: sig,
        status: 'success',
        errorMessage: null,
      });

      this.broadcast({
        type: 'new_transaction',
        data: transaction
      });

      console.log(`Jupiter swap successful: https://solscan.io/tx/${sig}`);
    } catch (error) {
      console.error('Jupiter swap failed:', error);
      
      // Record failed transaction
      await storage.createTransaction({
        tokenId: token.id,
        type: 'jupiter_swap',
        walletAddress: wallet.publicKey.toBase58(),
        signature: '',
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      
      throw error;
    }
  }

  private async collectRevenueFee(wallet: Keypair, feeAmount: number) {
    if (!this.connection || !this.mainWallet || feeAmount <= 0) return;

    // REVENUE FEE COLLECTION BLOCKED - Only Jupiter DEX swaps allowed
    throw new Error("REVENUE_FEE_BANNED - Only real Jupiter DEX swaps allowed");
  }

  // REMOVED: Mock bonding - only real Jupiter DEX swaps allowed

  private async updateMetrics() {
    const transactions = await storage.getTransactions();
    const tokens = await storage.getTokens();
    
    const successfulTxs = transactions.filter(tx => tx.status === 'success').length;
    const failedTxs = transactions.filter(tx => tx.status === 'failed').length;
    const activeTks = tokens.filter(token => token.isActive).length;

    const metrics = await storage.updateBotMetrics({
      totalTransactions: transactions.length,
      successfulTransactions: successfulTxs,
      failedTransactions: failedTxs,
      volumeGenerated: "0", // TODO: Calculate actual volume
      activeTokens: activeTks,
    });

    this.broadcast({
      type: 'metrics_update',
      data: metrics
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Real-time blockchain validation for any token address
  async validateTokenOnChain(address: string, tokenType: string): Promise<boolean> {
    try {
      if (!this.connection) {
        console.error('❌ No Solana connection available for validation');
        return false;
      }

      console.log(`🔍 Checking ${tokenType} token ${address} on Solana blockchain...`);

      // Basic address format validation first
      const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
      if (!base58Regex.test(address)) {
        console.log('❌ Invalid base58 address format');
        return false;
      }

      // Try to create PublicKey object - this will throw if invalid
      let publicKey: PublicKey;
      try {
        publicKey = new PublicKey(address);
      } catch (error) {
        console.log('❌ Invalid PublicKey format');
        return false;
      }

      if (tokenType === 'spl') {
        // For SPL tokens, check if the mint account exists
        try {
          const mintInfo = await this.connection.getAccountInfo(publicKey);
          if (!mintInfo) {
            console.log('❌ SPL token mint account does not exist');
            return false;
          }
          
          // Additional check: verify it's actually a mint account (should have owner as Token Program)
          const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
          if (mintInfo.owner.toBase58() !== TOKEN_PROGRAM_ID) {
            console.log('❌ Address exists but is not a valid SPL token mint');
            return false;
          }
          
          console.log('✅ Valid SPL token confirmed on blockchain');
          return true;
        } catch (error) {
          console.log('❌ Error validating SPL token:', error);
          return false;
        }
      } else {
        // For pump.fun and bonk.fun tokens, just verify the address exists on chain
        try {
          const accountInfo = await this.connection.getAccountInfo(publicKey);
          if (!accountInfo) {
            console.log(`❌ ${tokenType} bonding account does not exist`);
            return false;
          }
          
          console.log(`✅ Valid ${tokenType} bonding account confirmed on blockchain`);
          return true;
        } catch (error) {
          console.log(`❌ Error validating ${tokenType} token:`, error);
          return false;
        }
      }
    } catch (error) {
      console.error('❌ Blockchain validation error:', error);
      return false;
    }
  }

  async getStatus() {
    const transactions = await storage.getTransactions();
    const tokens = await storage.getTokens();
    
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      isConfigured: !!this.botConfig && !!this.connection && !!this.mainWallet,
      status: this.isRunning 
        ? (this.isPaused ? 'paused' : 'running') 
        : 'stopped',
      totalTransactions: transactions.length,
      activeTokens: tokens.filter(t => t.isActive).length,
    };
  }
}

export const volumeBotService = new VolumeBotService();
