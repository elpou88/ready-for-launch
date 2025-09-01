import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

export interface TransactionVerification {
  isValid: boolean;
  txSignature: string;
  amount: number;
  sender: string;
  receiver: string;
  timestamp: number;
  isOnChain: boolean;
  explorerUrl: string;
  blockHeight?: number;
  confirmations: number;
}

export class TransactionVerifierService {
  private connection: Connection;

  constructor() {
    this.connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );
  }

  // Verify transaction exists on-chain and is not fake
  async verifyTransaction(signature: string): Promise<TransactionVerification> {
    try {
      console.log(`🔍 Verifying transaction: ${signature}`);
      
      // Get transaction details from blockchain
      const transaction = await this.connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });

      if (!transaction) {
        return {
          isValid: false,
          txSignature: signature,
          amount: 0,
          sender: '',
          receiver: '',
          timestamp: 0,
          isOnChain: false,
          explorerUrl: `https://solscan.io/tx/${signature}`,
          confirmations: 0
        };
      }

      // Extract transaction details
      const { meta, transaction: tx, slot, blockTime } = transaction;
      
      if (!meta || meta.err) {
        console.log(`❌ Transaction failed or has errors: ${JSON.stringify(meta?.err)}`);
        return {
          isValid: false,
          txSignature: signature,
          amount: 0,
          sender: '',
          receiver: '',
          timestamp: blockTime || 0,
          isOnChain: true,
          explorerUrl: `https://solscan.io/tx/${signature}`,
          confirmations: 0
        };
      }

      // Extract SOL transfer details
      const preBalances = meta.preBalances;
      const postBalances = meta.postBalances;
      const accounts = tx.message.staticAccountKeys.map(key => key.toString());

      let transferAmount = 0;
      let sender = '';
      let receiver = '';

      // Find the account that sent SOL (balance decreased)
      for (let i = 0; i < preBalances.length; i++) {
        const balanceChange = postBalances[i] - preBalances[i];
        
        if (balanceChange < 0) {
          // This account sent SOL
          sender = accounts[i] || '';
          transferAmount = Math.abs(balanceChange) / LAMPORTS_PER_SOL;
        } else if (balanceChange > 0) {
          // This account received SOL
          receiver = accounts[i] || '';
        }
      }

      // Get current slot for confirmation count
      const currentSlot = await this.connection.getSlot();
      const confirmations = currentSlot - slot;

      const verification: TransactionVerification = {
        isValid: true,
        txSignature: signature,
        amount: transferAmount,
        sender,
        receiver,
        timestamp: blockTime || 0,
        isOnChain: true,
        explorerUrl: `https://solscan.io/tx/${signature}`,
        blockHeight: slot,
        confirmations
      };

      console.log(`✅ Transaction verified: ${transferAmount.toFixed(6)} SOL from ${sender.slice(0,8)}... to ${receiver.slice(0,8)}...`);
      console.log(`🔗 Explorer: ${verification.explorerUrl}`);
      console.log(`📊 Confirmations: ${confirmations}`);

      return verification;

    } catch (error) {
      console.error(`❌ Transaction verification failed: ${error.message}`);
      
      return {
        isValid: false,
        txSignature: signature,
        amount: 0,
        sender: '',
        receiver: '',
        timestamp: 0,
        isOnChain: false,
        explorerUrl: `https://solscan.io/tx/${signature}`,
        confirmations: 0
      };
    }
  }

  // Verify multiple transactions for a session
  async verifySessionTransactions(sessionId: string, signatures: string[]): Promise<{
    totalVerified: number;
    totalAmount: number;
    allValid: boolean;
    transactions: TransactionVerification[];
  }> {
    console.log(`🔍 Verifying ${signatures.length} transactions for session ${sessionId}`);
    
    const verifications: TransactionVerification[] = [];
    let totalAmount = 0;
    let validCount = 0;

    for (const signature of signatures) {
      const verification = await this.verifyTransaction(signature);
      verifications.push(verification);
      
      if (verification.isValid) {
        validCount++;
        totalAmount += verification.amount;
      }
    }

    const result = {
      totalVerified: validCount,
      totalAmount,
      allValid: validCount === signatures.length,
      transactions: verifications
    };

    console.log(`📊 Session ${sessionId} verification: ${validCount}/${signatures.length} valid transactions`);
    console.log(`💰 Total verified amount: ${totalAmount.toFixed(6)} SOL`);

    return result;
  }

  // Check if an address is a legitimate DEX program
  async verifyDexProgram(programId: string): Promise<boolean> {
    const knownDexPrograms = [
      'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter
      '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM
      'EhYXq3ANp5nAerUpbSgd7VK2RRcxK1zNuSQ755G5Mtc1', // Raydium Stable
      '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', // Orca Whirlpool
      'BJ3jrUzddfuSrZHXSCxMUUQsjKEyLmuuyZebkcaFp2fg', // Meteora
      '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',  // Pump.fun
    ];

    try {
      const accountInfo = await this.connection.getAccountInfo(new PublicKey(programId));
      
      // Check if it's a known DEX program
      if (knownDexPrograms.includes(programId)) {
        console.log(`✅ Verified DEX program: ${programId}`);
        return true;
      }

      // Check if account exists and is executable (program)
      if (accountInfo && accountInfo.executable) {
        console.log(`⚠️ Unknown but valid program: ${programId}`);
        return true;
      }

      console.log(`❌ Invalid or non-existent program: ${programId}`);
      return false;

    } catch (error) {
      console.error(`❌ Error verifying DEX program: ${error.message}`);
      return false;
    }
  }

  // Verify token mint address exists and is valid
  async verifyTokenMint(mintAddress: string): Promise<{
    isValid: boolean;
    supply: number;
    decimals: number;
    mintAuthority: string | null;
    freezeAuthority: string | null;
  }> {
    try {
      const mintPublicKey = new PublicKey(mintAddress);
      const mintInfo = await this.connection.getParsedAccountInfo(mintPublicKey);

      if (!mintInfo.value || !mintInfo.value.data) {
        return {
          isValid: false,
          supply: 0,
          decimals: 0,
          mintAuthority: null,
          freezeAuthority: null
        };
      }

      const parsedData = mintInfo.value.data as any;
      
      if (parsedData.program !== 'spl-token' || parsedData.parsed.type !== 'mint') {
        return {
          isValid: false,
          supply: 0,
          decimals: 0,
          mintAuthority: null,
          freezeAuthority: null
        };
      }

      const mintData = parsedData.parsed.info;

      console.log(`✅ Valid token mint: ${mintAddress}`);
      console.log(`📊 Supply: ${mintData.supply}, Decimals: ${mintData.decimals}`);

      return {
        isValid: true,
        supply: parseInt(mintData.supply),
        decimals: mintData.decimals,
        mintAuthority: mintData.mintAuthority,
        freezeAuthority: mintData.freezeAuthority
      };

    } catch (error) {
      console.error(`❌ Token mint verification failed: ${error.message}`);
      return {
        isValid: false,
        supply: 0,
        decimals: 0,
        mintAuthority: null,
        freezeAuthority: null
      };
    }
  }
}

export const transactionVerifier = new TransactionVerifierService();