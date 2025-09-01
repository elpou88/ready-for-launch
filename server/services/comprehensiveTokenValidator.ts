import { Connection, PublicKey } from '@solana/web3.js';

export interface TokenPoolInfo {
  dex: string;
  poolAddress?: string;
  liquidity: number;
  volume24h?: number;
  tradeable: boolean;
}

export interface ComprehensiveTokenData {
  address: string;
  exists: boolean;
  pools: TokenPoolInfo[];
  bestDex: string;
  totalLiquidity: number;
  jupiterCompatible: boolean;
  raydiumCompatible: boolean;
  pumpFunCompatible: boolean;
  bondingCurve: boolean;
}

export class ComprehensiveTokenValidator {
  private connection: Connection;

  constructor() {
    this.connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  }

  // Validate token across ALL DEXs and bonding curves
  async validateTokenEverywhere(tokenAddress: string): Promise<ComprehensiveTokenData> {
    console.log(`🔍 COMPREHENSIVE VALIDATION FOR TOKEN: ${tokenAddress}`);
    
    const result: ComprehensiveTokenData = {
      address: tokenAddress,
      exists: false,
      pools: [],
      bestDex: '',
      totalLiquidity: 0,
      jupiterCompatible: false,
      raydiumCompatible: false,
      pumpFunCompatible: false,
      bondingCurve: false
    };

    try {
      // 1. Verify token exists on mainnet
      const tokenMint = new PublicKey(tokenAddress);
      const accountInfo = await this.connection.getAccountInfo(tokenMint);
      
      if (!accountInfo) {
        console.log('❌ Token does not exist on Solana mainnet');
        return result;
      }
      
      result.exists = true;
      console.log('✅ Token exists on Solana mainnet');

      // 2. Check Jupiter DEX compatibility
      await this.checkJupiterCompatibility(tokenAddress, result);
      
      // 3. Check Raydium pools
      await this.checkRaydiumPools(tokenAddress, result);
      
      // 4. Check Pump.fun bonding curve
      await this.checkPumpFunBondingCurve(tokenAddress, result);
      
      // 5. Check other DEXs
      await this.checkOtherDEXs(tokenAddress, result);
      
      // Calculate totals
      result.totalLiquidity = result.pools.reduce((sum, pool) => sum + pool.liquidity, 0);
      result.bestDex = this.getBestDex(result.pools);
      
      console.log(`📊 COMPREHENSIVE VALIDATION COMPLETE:`);
      console.log(`   Total Pools Found: ${result.pools.length}`);
      console.log(`   Total Liquidity: $${result.totalLiquidity.toLocaleString()}`);
      console.log(`   Best DEX: ${result.bestDex}`);
      console.log(`   Jupiter Compatible: ${result.jupiterCompatible}`);
      console.log(`   Raydium Compatible: ${result.raydiumCompatible}`);
      console.log(`   Pump.fun Compatible: ${result.pumpFunCompatible}`);
      
      return result;
      
    } catch (error) {
      console.error('❌ Comprehensive validation failed:', error);
      return result;
    }
  }

  // Check Jupiter DEX aggregator compatibility
  private async checkJupiterCompatibility(tokenAddress: string, result: ComprehensiveTokenData): Promise<void> {
    try {
      console.log('🔍 Checking Jupiter DEX compatibility...');
      
      const inputMint = 'So11111111111111111111111111111111111111112'; // SOL
      const amount = 1000000; // 0.001 SOL
      
      const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${tokenAddress}&amount=${amount}&slippageBps=50`;
      const response = await fetch(quoteUrl);
      const data = await response.json();
      
      if (!data.error && data.outAmount) {
        result.jupiterCompatible = true;
        
        // Jupiter aggregates multiple DEXs, extract route info
        const routeInfo = data.routePlan || [];
        const liquidityEstimate = parseFloat(data.outAmount) || 0;
        
        result.pools.push({
          dex: 'Jupiter (Aggregator)',
          liquidity: liquidityEstimate,
          tradeable: true
        });
        
        console.log(`✅ Jupiter compatible - Output: ${data.outAmount} tokens`);
        console.log(`📊 Price Impact: ${data.priceImpactPct}%`);
        
        // Log which DEXs Jupiter uses
        if (routeInfo.length > 0) {
          console.log(`🔗 Jupiter routing through: ${routeInfo.map(r => r.swapInfo?.ammKey || 'Unknown').join(', ')}`);
        }
      } else {
        console.log('❌ Jupiter: Token not tradeable');
      }
    } catch (error) {
      console.log('❌ Jupiter check failed:', error.message);
    }
  }

  // Check Raydium AMM pools
  private async checkRaydiumPools(tokenAddress: string, result: ComprehensiveTokenData): Promise<void> {
    try {
      console.log('🔍 Checking Raydium AMM pools...');
      
      // Check Raydium API for pools
      const raydiumUrl = `https://api.raydium.io/v2/ammPools`;
      const response = await fetch(raydiumUrl);
      const pools = await response.json();
      
      if (pools && pools.data) {
        const tokenPools = pools.data.filter(pool => 
          pool.baseMint === tokenAddress || pool.quoteMint === tokenAddress
        );
        
        if (tokenPools.length > 0) {
          result.raydiumCompatible = true;
          
          tokenPools.forEach(pool => {
            result.pools.push({
              dex: 'Raydium',
              poolAddress: pool.id,
              liquidity: parseFloat(pool.liquidity) || 0,
              volume24h: parseFloat(pool.volume24h) || 0,
              tradeable: true
            });
          });
          
          console.log(`✅ Raydium: Found ${tokenPools.length} pools`);
        } else {
          console.log('❌ Raydium: No pools found');
        }
      }
    } catch (error) {
      console.log('❌ Raydium check failed:', error.message);
    }
  }

  // Check Pump.fun bonding curve
  private async checkPumpFunBondingCurve(tokenAddress: string, result: ComprehensiveTokenData): Promise<void> {
    try {
      console.log('🔍 Checking Pump.fun bonding curve...');
      
      // Check if token has Pump.fun bonding curve
      const pumpUrl = `https://frontend-api.pump.fun/coins/${tokenAddress}`;
      const response = await fetch(pumpUrl);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data && !data.error) {
          result.pumpFunCompatible = true;
          result.bondingCurve = true;
          
          result.pools.push({
            dex: 'Pump.fun',
            liquidity: parseFloat(data.virtual_sol_reserves) || 0,
            tradeable: true
          });
          
          console.log(`✅ Pump.fun: Bonding curve active`);
          console.log(`💰 Virtual SOL reserves: ${data.virtual_sol_reserves}`);
        } else {
          console.log('❌ Pump.fun: No bonding curve found');
        }
      } else {
        console.log('❌ Pump.fun: Token not found');
      }
    } catch (error) {
      console.log('❌ Pump.fun check failed:', error.message);
    }
  }

  // Check other DEXs (Orca, Serum, etc.)
  private async checkOtherDEXs(tokenAddress: string, result: ComprehensiveTokenData): Promise<void> {
    try {
      console.log('🔍 Checking other DEXs...');
      
      // Check DexScreener for comprehensive pool data
      const dexScreenerUrl = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
      const response = await fetch(dexScreenerUrl);
      const data = await response.json();
      
      if (data && data.pairs && data.pairs.length > 0) {
        data.pairs.forEach(pair => {
          if (pair.dexId && pair.liquidity) {
            result.pools.push({
              dex: pair.dexId,
              poolAddress: pair.pairAddress,
              liquidity: parseFloat(pair.liquidity.usd) || 0,
              volume24h: parseFloat(pair.volume.h24) || 0,
              tradeable: true
            });
          }
        });
        
        console.log(`✅ DexScreener: Found ${data.pairs.length} additional pools`);
      } else {
        console.log('❌ DexScreener: No additional pools found');
      }
    } catch (error) {
      console.log('❌ Other DEXs check failed:', error.message);
    }
  }

  // Determine best DEX based on liquidity and volume
  private getBestDex(pools: TokenPoolInfo[]): string {
    if (pools.length === 0) return 'None';
    
    // Prioritize by liquidity, then by known reliability
    const sortedPools = pools.sort((a, b) => {
      // Jupiter aggregator gets priority due to best routing
      if (a.dex.includes('Jupiter')) return -1;
      if (b.dex.includes('Jupiter')) return 1;
      
      // Then by liquidity
      return b.liquidity - a.liquidity;
    });
    
    return sortedPools[0].dex;
  }
}