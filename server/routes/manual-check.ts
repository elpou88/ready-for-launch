import express from 'express';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const router = express.Router();

// Manually check if any of our created wallets have been funded
router.get('/check-funded-wallets', async (req, res) => {
  try {
    console.log('🔍 CHECKING ALL CREATED WALLETS FOR FUNDING');
    
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    
    // Check the original funded wallet
    const originalWallet = 'EonxcBJ2WipzdfjsVsDi8QfCaEiaQ1WayEaakZb9AUZY';
    
    // Check the new session wallets we created
    const sessionWallets = [
      '8DE3iLZtFuWM8cLvKmdKkdt3taerH8q41etqg7zRDrvc', // USDC session
      '8jNKkJSJt9rBuCu6moTfb5on51pYj2nf5AFXw5gL3prL', // Bonk session  
      'CJvKENmv2oyBtJUqgvdyjnBf9fvGTmLzyEJJ2Fx71hCi', // FFS session
      'BVSyH6iFSxLU2NNEdxZU2dMTc9ow3GkALnWwm2tCodEM',
      'FmNxUHtH5oNxRy3LtyAJWMLzVZLUSwPfi8JrPn5xcb6p',
      '45EGsb4wX7KJGqAZEWqgUdqA1zh2QMXJSkuRJE9oWAmX'
    ];
    
    const walletBalances = [];
    
    // Check original wallet
    try {
      const balance = await connection.getBalance(new PublicKey(originalWallet));
      const balanceSOL = balance / LAMPORTS_PER_SOL;
      walletBalances.push({
        address: originalWallet,
        balance: balanceSOL,
        type: 'original_funded',
        status: balanceSOL > 0 ? 'FUNDED' : 'empty'
      });
      console.log(`💰 Original wallet ${originalWallet}: ${balanceSOL} SOL`);
    } catch (error) {
      console.log(`❌ Failed to check original wallet: ${error.message}`);
    }
    
    // Check all session wallets
    for (const wallet of sessionWallets) {
      try {
        const balance = await connection.getBalance(new PublicKey(wallet));
        const balanceSOL = balance / LAMPORTS_PER_SOL;
        walletBalances.push({
          address: wallet,
          balance: balanceSOL,
          type: 'session_wallet',
          status: balanceSOL > 0 ? 'FUNDED' : 'empty'
        });
        console.log(`💰 Session wallet ${wallet}: ${balanceSOL} SOL`);
      } catch (error) {
        console.log(`❌ Failed to check wallet ${wallet}: ${error.message}`);
      }
    }
    
    const fundedWallets = walletBalances.filter(w => w.balance > 0);
    
    console.log(`📊 WALLET CHECK COMPLETE: ${fundedWallets.length} funded wallets found`);
    
    res.json({
      success: true,
      message: 'Wallet funding check complete',
      totalWallets: walletBalances.length,
      fundedWallets: fundedWallets.length,
      wallets: walletBalances,
      readyForVolumeGeneration: fundedWallets.length > 0
    });
    
  } catch (error) {
    console.error('❌ Wallet check error:', error);
    res.status(500).json({
      success: false,
      error: `Failed to check wallet funding: ${error.message}`
    });
  }
});

export { router as manualCheckRouter };