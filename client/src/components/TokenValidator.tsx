import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, Search, ExternalLink } from 'lucide-react';

interface LiquidityPool {
  dexName: string;
  pairAddress: string;
  baseToken: string;
  quoteToken: string;
  liquidity: number;
  volume24h: number;
  priceUsd: number;
  isActive: boolean;
}

interface TokenValidationResult {
  isValid: boolean;
  tokenInfo?: {
    name: string;
    symbol: string;
    address: string;
    decimals: number;
  };
  liquidityPools: LiquidityPool[];
  totalLiquidity: number;
  is24hVolumeActive: boolean;
  recommendedDex: string;
  validationErrors: string[];
}

export function TokenValidator() {
  const [tokenAddress, setTokenAddress] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<TokenValidationResult | null>(null);

  const validateToken = async () => {
    if (!tokenAddress.trim()) return;

    setIsValidating(true);
    try {
      const response = await fetch('/api/validate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenAddress: tokenAddress.trim() })
      });

      const result = await response.json();
      setValidationResult(result);
    } catch (error) {
      console.error('Validation failed:', error);
      setValidationResult({
        isValid: false,
        liquidityPools: [],
        totalLiquidity: 0,
        is24hVolumeActive: false,
        recommendedDex: '',
        validationErrors: ['Network error during validation']
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      validateToken();
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Token Validation
          </CardTitle>
          <CardDescription>
            Validate any Solana token by checking its liquidity pools across all major DEXs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Enter Solana token address (e.g., 5SUzu2XAgJHuig1iPHr6zrnfZxyms5hWf8bcezB4bonk)"
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1"
              data-testid="input-token-address"
            />
            <Button 
              onClick={validateToken} 
              disabled={isValidating || !tokenAddress.trim()}
              data-testid="button-validate-token"
            >
              {isValidating ? 'Validating...' : 'Validate'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {validationResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {validationResult.isValid ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              Validation Result
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            
            {/* Token Info */}
            {validationResult.tokenInfo && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg" data-testid="token-info">
                <div>
                  <p className="text-sm text-muted-foreground">Token Name</p>
                  <p className="font-medium" data-testid="text-token-name">
                    {validationResult.tokenInfo.name}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Symbol</p>
                  <p className="font-medium" data-testid="text-token-symbol">
                    {validationResult.tokenInfo.symbol}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Liquidity</p>
                  <p className="font-medium text-green-600" data-testid="text-total-liquidity">
                    ${validationResult.totalLiquidity.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">24h Volume Active</p>
                  <Badge variant={validationResult.is24hVolumeActive ? "default" : "secondary"}>
                    {validationResult.is24hVolumeActive ? "Yes" : "No"}
                  </Badge>
                </div>
              </div>
            )}

            {/* Recommended DEX */}
            {validationResult.recommendedDex && (
              <Alert>
                <AlertDescription>
                  <strong>Recommended DEX:</strong> {validationResult.recommendedDex}
                  {validationResult.isValid && " - This token is ready for volume bot trading!"}
                </AlertDescription>
              </Alert>
            )}

            {/* Liquidity Pools - Enhanced Display */}
            {validationResult.liquidityPools.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-lg">Found Liquidity Pools ({validationResult.liquidityPools.length})</h4>
                  <Badge variant="default" className="bg-green-500">
                    {validationResult.isValid ? "✅ Tradeable" : "⚠️ Review Required"}
                  </Badge>
                </div>
                <div className="grid gap-3">
                  {validationResult.liquidityPools.map((pool, index) => (
                    <div 
                      key={index}
                      className="p-4 bg-gradient-to-r from-cyan-50 to-emerald-50 dark:from-cyan-950 dark:to-emerald-950 border border-cyan-200 dark:border-cyan-800 rounded-lg hover:shadow-md transition-all"
                      data-testid={`pool-${index}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-3">
                            <Badge 
                              variant="outline" 
                              className="bg-white dark:bg-gray-800 border-cyan-300 text-cyan-700 dark:text-cyan-300"
                            >
                              {pool.dexName}
                            </Badge>
                            <span className="font-semibold text-lg">
                              {pool.baseToken}/{pool.quoteToken}
                            </span>
                            {pool.priceUsd > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                ${pool.priceUsd.toFixed(6)}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>Pair: {pool.pairAddress.slice(0, 8)}...{pool.pairAddress.slice(-8)}</span>
                            {pool.isActive && (
                              <Badge variant="outline" className="text-green-600 border-green-300">
                                Active
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right space-y-1">
                            <p className="text-sm font-semibold text-green-600">
                              ${pool.liquidity.toLocaleString()} liquidity
                            </p>
                            <p className="text-xs text-muted-foreground">
                              ${pool.volume24h.toLocaleString()} 24h volume
                            </p>
                          </div>
                          <a
                            href={`https://dexscreener.com/solana/${pool.pairAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-md transition-colors"
                            data-testid={`link-pool-${index}`}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    💡 <strong>Pool Information:</strong> These are the real liquidity pools found for this token across all major Solana DEXs. 
                    The volume bot will use these pools to generate authentic trading volume.
                  </p>
                </div>
              </div>
            )}

            {/* Validation Errors */}
            {validationResult.validationErrors.length > 0 && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Validation Issues:</strong>
                  <ul className="list-disc list-inside mt-1">
                    {validationResult.validationErrors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Trading Readiness */}
            <div className="p-4 bg-gradient-to-r from-cyan-50 to-blue-50 rounded-lg border">
              <h4 className="font-medium mb-2">Volume Bot Compatibility</h4>
              {validationResult.isValid ? (
                <p className="text-green-700">
                  ✅ This token is compatible with the volume bot and has active trading pairs.
                  You can proceed to create a trading session.
                </p>
              ) : (
                <p className="text-red-700">
                  ❌ This token is not suitable for volume bot trading due to insufficient liquidity or missing trading pairs.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}