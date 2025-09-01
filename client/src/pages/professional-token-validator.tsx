import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, XCircle, Search, Wallet, TrendingUp, DollarSign, AlertCircle } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useWebSocket } from '@/hooks/use-websocket';
import { MaintenanceBanner } from '@/components/maintenance-banner';
const wubbasolLogoPath = '/wubbasol-logo.png';
// Frog-themed background image
const frogBgUrl = '/frog-themed-background.svg';

interface TokenValidationResult {
  success: boolean;
  token?: {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    supply: string;
  };
  primaryDex?: string;
  liquidityUsd?: number;
  pools?: Array<{
    dex: string;
    liquidity: number;
    volume24h: number;
    isValid: boolean;
  }>;
  bestPool?: {
    dex: string;
    liquidity: number;
    poolAddress: string;
  };
  error?: string;
}

interface SessionResult {
  success: boolean;
  sessionId?: string;
  userWallet?: {
    address: string;
    balance: number;
  };
  token?: {
    address: string;
    symbol: string;
    name: string;
  };
  primaryDex?: string;
  instructions?: {
    step1: string;
    step2: string;
    step3: string;
  };
  autoTrading?: {
    enabled: boolean;
    monitoringActive: boolean;
    tradeInterval: string;
    chartVisibility: string;
  };
  error?: string;
}

export default function ProfessionalTokenValidator() {
  const [contractAddress, setContractAddress] = useState('');
  const [validationResult, setValidationResult] = useState<TokenValidationResult | null>(null);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tradingStatus, setTradingStatus] = useState<string>('');
  const [liveStats, setLiveStats] = useState<any>(null);
  
  // WebSocket connection for real-time updates
  const { isConnected, lastMessage } = useWebSocket();

  // Check maintenance status
  const { data: maintenanceStatus } = useQuery({
    queryKey: ['maintenance-status'],
    queryFn: async () => {
      const response = await fetch('/api/maintenance-status');
      return response.json();
    },
    refetchInterval: 10000, // Check every 10 seconds
  });

  const validateTokenMutation = useMutation({
    mutationFn: async (address: string) => {
      const response = await fetch('/api/professional/validate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractAddress: address })
      });
      return response.json();
    },
    onSuccess: (data) => {
      setValidationResult(data);
    }
  });

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/professional/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          contractAddress: contractAddress,
          tokenSymbol: validationResult?.token?.symbol || 'Unknown'
        })
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setSessionResult(data);
        setSessionId(data.sessionId);
        // Do NOT store in localStorage to prevent auto-loading
      }
    }
  });

  const handleValidateToken = () => {
    if (!contractAddress.trim()) return;
    validateTokenMutation.mutate(contractAddress);
  };

  const handleCreateSession = () => {
    if (!validationResult?.success) return;
    createSessionMutation.mutate();
  };

  const handleReset = () => {
    setContractAddress('');
    setValidationResult(null);
    setSessionResult(null);
    setSessionId(null);
    // Clear localStorage
    localStorage.removeItem('currentSessionId');
    localStorage.removeItem('currentContractAddress');
  };

  // Ensure clean state on mount - NO automatic session loading
  useEffect(() => {
    // ALWAYS clear any stored session data to ensure fresh start
    localStorage.removeItem('currentSessionId');
    localStorage.removeItem('currentContractAddress');
    sessionStorage.clear();
    
    // Reset all form state
    setContractAddress('');
    setValidationResult(null);
    setSessionResult(null);
    setSessionId(null);
  }, []);

  // Handle WebSocket messages for real-time updates
  useEffect(() => {
    if (!lastMessage || !sessionId) return;

    // Only process messages relevant to our current session
    if (lastMessage.type === 'bot_status' && lastMessage.payload?.sessionId === sessionId) {
      const status = lastMessage.payload.status;
      setTradingStatus(status);
      
      // Update session result if trading started
      if (status.includes('TRADING STARTED') || status.includes('PROFESSIONAL VOLUME')) {
        setSessionResult(prev => prev ? {
          ...prev,
          autoTrading: {
            ...prev.autoTrading,
            enabled: true,
            monitoringActive: true,
            tradeInterval: '7 seconds',
            chartVisibility: '100% real swaps on DexScreener'
          }
        } : prev);
      }
    }

    if (lastMessage.type === 'session_stats' && lastMessage.payload?.sessionId === sessionId) {
      setLiveStats(lastMessage.payload.stats);
    }
  }, [lastMessage, sessionId]);

  return (
    <div 
      className="min-h-screen bg-cover bg-center bg-no-repeat relative"
      style={{
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0.85)), url('${frogBgUrl}')`
      }}
    >
      <MaintenanceBanner 
        isVisible={maintenanceStatus?.maintenanceMode || false} 
        message={maintenanceStatus?.message}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/20 via-emerald-900/20 to-yellow-900/20"></div>
      
      <div className="relative z-10 container mx-auto max-w-4xl p-6">
        {/* Header with Your Logo */}
        <div className="text-center mb-8">
          <div className="flex flex-col items-center justify-center mb-6">
            {/* Volume Bot Logo */}
            <div className="relative mb-4">
              <img 
                src={wubbasolLogoPath} 
                alt="WubbaSol Logo" 
                className="w-32 h-32 object-contain drop-shadow-2xl"
              />
              {/* Glow effect behind logo */}
              <div className="absolute inset-0 w-32 h-32 bg-gradient-to-br from-cyan-400 via-emerald-400 to-yellow-400 rounded-full blur-xl opacity-20 animate-pulse"></div>
            </div>
            
            <div className="text-center">
              <p className="text-cyan-200 text-lg font-semibold tracking-wide mb-2">Volume Bot</p>
              <div className="flex items-center justify-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-green-300 text-sm font-medium">Live Volume System</span>
              </div>
            </div>
          </div>
          
          <p className="text-gray-300 max-w-3xl mx-auto text-lg leading-relaxed">
            Validate any Solana token and start volume generation with real DEX trades visible on all charts
          </p>
        </div>

        {/* Step 1: Token Validation */}
        {!sessionResult && (
          <Card className="mb-8 bg-gray-900/80 border-cyan-500/30 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-cyan-300 flex items-center gap-2">
                <Search className="w-5 h-5" />
                Step 1: Validate Token Contract
              </CardTitle>
              <CardDescription className="text-gray-400">
                Enter any Solana token contract address to verify its validity and trading pools
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <Input
                    placeholder="Enter Solana token contract address..."
                    value={contractAddress}
                    onChange={(e) => setContractAddress(e.target.value)}
                    className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                    data-testid="input-contract-address"
                  />
                  <Button
                    onClick={handleValidateToken}
                    disabled={validateTokenMutation.isPending || !contractAddress.trim()}
                    className="bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600"
                    data-testid="button-validate-token"
                  >
                    {validateTokenMutation.isPending ? (
                      <>
                        <Search className="w-4 h-4 mr-2 animate-spin" />
                        Validating...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4 mr-2" />
                        Validate
                      </>
                    )}
                  </Button>
                </div>

                {/* Validation Results */}
                {validationResult && (
                  <div className="mt-6">
                    {validationResult.success ? (
                      <div className="space-y-4">
                        {/* Token Success */}
                        <div className="p-4 bg-emerald-900/30 border border-emerald-500/30 rounded-lg">
                          <div className="flex items-center gap-2 text-emerald-300 mb-3">
                            <CheckCircle className="w-5 h-5" />
                            <span className="font-semibold">Token Validated Successfully!</span>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-gray-400">Token:</span>
                              <span className="text-white ml-2">{validationResult.token?.symbol || 'Unknown'}</span>
                            </div>
                            <div>
                              <span className="text-gray-400">Type:</span>
                              <span className="text-cyan-300 ml-2">SPL</span>
                            </div>
                          </div>
                        </div>

                        {/* Comprehensive Liquidity Pools Display */}
                        <div className="p-4 bg-cyan-900/30 border border-cyan-500/30 rounded-lg">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2 text-cyan-300">
                              <TrendingUp className="w-5 h-5" />
                              <span className="font-semibold">Discovered Liquidity Pools</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className="bg-cyan-600 text-cyan-100">
                                {validationResult.pools?.length || 0} pools found
                              </Badge>
                              <Badge className="bg-emerald-600 text-emerald-100">
                                ${validationResult.liquidityUsd?.toLocaleString() || '0'} best liquidity
                              </Badge>
                            </div>
                          </div>

                          {/* Primary Pool (Best Liquidity) */}
                          {validationResult.pools && validationResult.pools.length > 0 && (
                            <div className="mb-4 p-3 bg-emerald-900/40 border border-emerald-500/50 rounded-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge className="bg-emerald-500 text-black font-semibold">PRIMARY</Badge>
                                <Badge className="bg-gray-700 text-gray-100">{validationResult.bestPool?.dex || validationResult.primaryDex}</Badge>
                              </div>
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <span className="text-gray-400">Trading Pair:</span>
                                  <span className="text-white ml-2">{validationResult.token?.symbol}/SOL</span>
                                </div>
                                <div>
                                  <span className="text-gray-400">Liquidity:</span>
                                  <span className="text-emerald-300 ml-2 font-mono">${validationResult.liquidityUsd?.toLocaleString()}</span>
                                </div>
                                {validationResult.bestPool?.poolAddress && (
                                  <div className="col-span-2">
                                    <span className="text-gray-400">Pool Address:</span>
                                    <span className="text-cyan-300 ml-2 font-mono text-xs break-all">
                                      {validationResult.bestPool.poolAddress}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* All Discovered Pools */}
                          {validationResult.pools && validationResult.pools.length > 1 && (
                            <div>
                              <div className="text-sm text-gray-300 mb-2 font-medium">
                                All Discovered Pools ({validationResult.pools.length})
                              </div>
                              <div className="space-y-2 max-h-64 overflow-y-auto">
                                {validationResult.pools
                                  .sort((a, b) => b.liquidity - a.liquidity)
                                  .map((pool, index) => (
                                    <div key={index} className="flex items-center justify-between p-2 bg-gray-800/50 rounded border border-gray-700/50 hover:border-cyan-500/30 transition-colors">
                                      <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1">
                                          <span className="text-xs text-gray-400 font-mono">#{index + 1}</span>
                                          <Badge 
                                            className={`text-xs ${
                                              index === 0 
                                                ? 'bg-emerald-600 text-emerald-100' 
                                                : 'bg-gray-600 text-gray-100'
                                            }`}
                                          >
                                            {pool.dex}
                                          </Badge>
                                        </div>
                                        <span className="text-gray-300 text-sm">{validationResult.token?.symbol}/SOL</span>
                                        {pool.volume24h && pool.volume24h > 0 && (
                                          <span className="text-xs text-yellow-400">
                                            Vol: ${pool.volume24h.toLocaleString()}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-right">
                                        <div className="text-cyan-300 font-mono text-sm">
                                          ${pool.liquidity.toLocaleString()}
                                        </div>
                                        {pool.isValid && (
                                          <div className="text-xs text-green-400">✓ Tradeable</div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}

                          {/* Single Pool Display */}
                          {validationResult.pools && validationResult.pools.length === 1 && (
                            <div className="text-center text-gray-300 text-sm">
                              Single pool discovered - ready for volume generation
                            </div>
                          )}

                          {/* Comprehensive Discovery Info */}
                          <div className="mt-4 p-3 bg-blue-900/30 border border-blue-500/30 rounded-lg">
                            <div className="text-blue-300 text-sm font-medium mb-2">
                              🔍 Comprehensive DEX Search Completed
                            </div>
                            <div className="text-xs text-blue-200 space-y-1">
                              <div>• Searched across all major DEXs: Raydium, Meteora, Orca, Jupiter, LaunchLab, Pump.fun</div>
                              <div>• Real liquidity data from DexScreener API and direct DEX sources</div>
                              <div>• Smart validation using volume + liquidity + FDV metrics</div>
                              <div>• Ready for authentic volume generation with real swaps</div>
                            </div>
                          </div>
                        </div>

                        {/* Next Step Button */}
                        <Button
                          onClick={handleCreateSession}
                          disabled={createSessionMutation.isPending}
                          className="w-full bg-gradient-to-r from-emerald-500 to-yellow-500 hover:from-emerald-600 hover:to-yellow-600 text-black font-semibold"
                          data-testid="button-create-session"
                        >
                          {createSessionMutation.isPending ? (
                            <>
                              <Wallet className="w-4 h-4 mr-2 animate-spin" />
                              Creating Session...
                            </>
                          ) : (
                            <>
                              <Wallet className="w-4 h-4 mr-2" />
                              Create Volume Session
                            </>
                          )}
                        </Button>
                      </div>
                    ) : (
                      <div className="p-4 bg-red-900/30 border border-red-500/30 rounded-lg">
                        <div className="flex items-center gap-2 text-red-300">
                          <XCircle className="w-5 h-5" />
                          <span className="font-semibold">Validation Failed</span>
                        </div>
                        <p className="text-red-200 mt-2">{validationResult.error}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Trading Session Created */}
        {sessionResult && sessionResult.success && (
          <Card className="mb-8 bg-emerald-900/80 border-emerald-500/30 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-emerald-300 flex items-center gap-2">
                <Wallet className="w-5 h-5" />
                Step 2: Fund Your Session
              </CardTitle>
              <CardDescription className="text-emerald-200">
                Send SOL to activate volume generation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Live Trading Status - Real-time updates */}
                {tradingStatus && (
                  <div className="p-4 bg-emerald-900/40 border border-emerald-400/50 rounded-lg">
                    <div className="flex items-center gap-2 text-emerald-300 mb-2">
                      <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                      <span className="font-semibold">🚀 LIVE TRADING STATUS</span>
                    </div>
                    <div className="text-white text-sm bg-black/20 p-2 rounded font-mono">{tradingStatus}</div>
                    {liveStats && (
                      <div className="mt-2 text-xs text-emerald-300 bg-emerald-900/20 p-2 rounded">
                        Balance: {liveStats.balance} SOL | Volume: {liveStats.totalVolume} | Trades: {liveStats.tradeCount || 0}
                      </div>
                    )}
                  </div>
                )}

                {/* Wallet Address */}
                <div className="p-6 bg-black/40 border border-emerald-500/50 rounded-lg">
                  <div className="text-center">
                    <div className="text-sm text-emerald-300 mb-2">Your Unique Volume Wallet</div>
                    <div className="text-xl font-mono text-white bg-gray-800 p-3 rounded border break-all">
                      {sessionResult.userWallet?.address}
                    </div>
                    <div className="flex gap-3 pt-4">
                      <Button
                        onClick={handleReset}
                        variant="outline"
                        className="border-gray-600 text-gray-300 hover:bg-gray-800"
                      >
                        Start New Session
                      </Button>
                      <Button
                        onClick={() => {
                          navigator.clipboard.writeText(sessionResult.userWallet?.address || '');
                        }}
                        className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600"
                      >
                        Copy Wallet Address
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Enhanced Instructions */}
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-cyan-900/30 border border-cyan-500/30 rounded-lg">
                    <div className="w-6 h-6 bg-cyan-500 text-black rounded-full flex items-center justify-center font-bold text-sm mt-0.5">1</div>
                    <div className="flex-1">
                      <div className="text-cyan-200 font-medium mb-1">Fund Your Volume Wallet</div>
                      <div className="text-cyan-300 text-sm">Send SOL to the unique wallet address above</div>
                      <div className="text-cyan-400 text-xs mt-1">Minimum: 0.1 SOL • Recommended: 1+ SOL for longer sessions</div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-4 bg-emerald-900/30 border border-emerald-500/30 rounded-lg">
                    <div className="w-6 h-6 bg-emerald-500 text-black rounded-full flex items-center justify-center font-bold text-sm mt-0.5">2</div>
                    <div className="flex-1">
                      <div className="text-emerald-200 font-medium mb-1">Automatic Fund Distribution</div>
                      <div className="text-emerald-300 text-sm">75% allocated for volume trading • 25% revenue collection</div>
                      <div className="text-emerald-400 text-xs mt-1">Revenue goes to: 8oj8bJ43BPE7818Pj3CAUnAe5gqGHHMKTCiMF4aCEtW6</div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-4 bg-yellow-900/30 border border-yellow-500/30 rounded-lg">
                    <div className="w-6 h-6 bg-yellow-500 text-black rounded-full flex items-center justify-center font-bold text-sm mt-0.5">3</div>
                    <div className="flex-1">
                      <div className="text-yellow-200 font-medium mb-2">Real Volume Generation Begins</div>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-yellow-300">
                          <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full"></div>
                          <span>Automatic detection within 3 seconds of funding</span>
                        </div>
                        <div className="flex items-center gap-2 text-yellow-300">
                          <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full"></div>
                          <span>Continuous BUY/SELL trades every 7 seconds</span>
                        </div>
                        <div className="flex items-center gap-2 text-yellow-300">
                          <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full"></div>
                          <span>100% real Jupiter DEX swaps on Solana mainnet</span>
                        </div>
                        <div className="flex items-center gap-2 text-yellow-300">
                          <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full"></div>
                          <span>All transactions visible on DexScreener charts</span>
                        </div>
                        <div className="flex items-center gap-2 text-yellow-300">
                          <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full"></div>
                          <span>Your wallet serves as the DEX maker for authenticity</span>
                        </div>
                        <div className="flex items-center gap-2 text-yellow-300">
                          <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full"></div>
                          <span>Trading continues until 75% of funds are depleted</span>
                        </div>
                      </div>
                      <div className="mt-3 p-2 bg-yellow-800/20 border border-yellow-600/30 rounded text-xs text-yellow-400">
                        💡 Pro Tip: Monitor your token's chart on DexScreener to see the real-time volume impact
                      </div>
                    </div>
                  </div>
                </div>

                {/* Enhanced Auto Volume Info */}
                {sessionResult.autoTrading && (
                  <div className="p-4 bg-blue-900/30 border border-blue-500/30 rounded-lg">
                    <div className="text-blue-300 font-semibold mb-3 flex items-center gap-2">
                      <DollarSign className="w-5 h-5" />
                      PROFESSIONAL VOLUME SYSTEM ACTIVE
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="space-y-2">
                        <div className="text-blue-200 font-medium">Monitoring & Detection</div>
                        <div className="space-y-1 text-blue-300">
                          <div>• Wallet scanning every 3 seconds</div>
                          <div>• Instant funding detection</div>
                          <div>• Auto fund distribution (75%/25%)</div>
                          <div>• Revenue collection guaranteed</div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-blue-200 font-medium">Trading Execution</div>
                        <div className="space-y-1 text-blue-300">
                          <div>• Real DEX swaps every {sessionResult.autoTrading.tradeInterval}</div>
                          <div>• Individual wallet as DEX maker</div>
                          <div>• Jupiter aggregator routing</div>
                          <div>• 100% authentic blockchain activity</div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-blue-200 font-medium">Chart Visibility</div>
                        <div className="space-y-1 text-blue-300">
                          <div>• Real-time DexScreener updates</div>
                          <div>• Visible volume candles</div>
                          <div>• Authentic price movements</div>
                          <div>• Traceable on-chain transactions</div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-blue-200 font-medium">Session Management</div>
                        <div className="space-y-1 text-blue-300">
                          <div>• Continuous until fund depletion</div>
                          <div>• Smart trade sizing optimization</div>
                          <div>• Anti-duplicate revenue protection</div>
                          <div>• Automatic session completion</div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 p-3 bg-blue-800/20 border border-blue-600/30 rounded">
                      <div className="text-blue-300 text-xs font-medium mb-1">PROFESSIONAL FEATURES</div>
                      <div className="text-blue-400 text-xs">
                        Ultra-high frequency trading • Zero error tolerance • 100% mainnet execution • Revenue guarantee system • Individual session isolation
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error State */}
        {sessionResult && !sessionResult.success && (
          <Card className="mb-8 bg-red-900/80 border-red-500/30 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-red-300 mb-3">
                <AlertCircle className="w-5 h-5" />
                <span className="font-semibold">Session Creation Failed</span>
              </div>
              <p className="text-red-200">{sessionResult.error}</p>
              <Button
                onClick={handleReset}
                className="mt-4 bg-red-600 hover:bg-red-700"
              >
                Try Again
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}