import { WalletManager } from './services/walletManager';
import { AutoTradingService } from './services/autoTradingService';

// Test script to simulate funding and start trading
async function testTradingSystem() {
  console.log('🧪 TESTING TRADING SYSTEM - SIMULATING FUND DETECTION');
  
  try {
    // Get instances
    const walletManager = WalletManager.getInstance();
    const tradingService = AutoTradingService.getInstance();
    
    // Create test session
    const sessionId = `test_session_${Date.now()}`;
    const tokenAddress = '5SUzu2XAgJHuig1iPHr6zrnfZxyms5hWf8bcezB4bonk';
    
    console.log(`🔐 Creating test wallet for session: ${sessionId}`);
    const testWallet = await walletManager.generateUserWallet(sessionId);
    
    console.log(`✅ Test wallet created: ${testWallet.publicKey}`);
    console.log(`🎯 Token address: ${tokenAddress}`);
    
    // Start monitoring
    console.log(`🔍 Starting wallet monitoring...`);
    await tradingService.startWalletMonitoring(sessionId, tokenAddress, 'Jupiter');
    
    // Simulate funding after 3 seconds
    setTimeout(async () => {
      console.log(`💰 SIMULATING FUND DETECTION - 0.5 SOL`);
      
      // Manually trigger funding detection
      try {
        const fundingSplit = await walletManager.processFunding(sessionId, 0.5);
        console.log(`✅ Funding processed: ${JSON.stringify(fundingSplit)}`);
        
        // Start trading session directly
        await tradingService.startTradingSession(sessionId, tokenAddress, 'Jupiter', fundingSplit.userWalletAmount);
      } catch (error) {
        console.error('❌ Funding simulation failed:', error);
      }
    }, 3000);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Export for use in routes
export { testTradingSystem };