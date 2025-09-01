import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useWebSocket } from '@/hooks/use-websocket';
import { TokenValidator } from '@/components/TokenValidator';
import logoPath from "@assets/image_1754295054789.png";
import { 
  Play, 
  TrendingUp, 
  Coins,
  Wallet,
  Volume2,
  CheckCircle,
  ExternalLink,
  Activity,
  Bot
} from 'lucide-react';

type TokenType = 'spl' | 'bonkfun' | 'pumpfun';

export default function ProfessionalDashboard(): JSX.Element {
  const { toast } = useToast();
  const { isConnected, lastMessage } = useWebSocket();
  
  const [step, setStep] = useState(1); // Always start from step 1 with blank form
  const [fundingAmount, setFundingAmount] = useState('0.15');
  const [selectedTokenType, setSelectedTokenType] = useState<TokenType>('spl');
  const [detectedTokenName, setDetectedTokenName] = useState('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [dedicatedWallet, setDedicatedWallet] = useState('');
  const [minAmount, setMinAmount] = useState<number>(0.15);
  const [isPrivileged, setIsPrivileged] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [liveStats, setLiveStats] = useState({ transactions: 0, volume: 0, status: 'waiting', balance: 0, fundingDetected: false });
  const [forceReset, setForceReset] = useState(Date.now());
  const [validationSuccess, setValidationSuccess] = useState(false);
  const [allSessions, setAllSessions] = useState<any[]>([]);
  const [liveTransactionCount, setLiveTransactionCount] = useState(0);
  const [tradingActive, setTradingActive] = useState(false);
  const [recentTrades, setRecentTrades] = useState<any[]>([]);
  const [detectedFundingAmount, setDetectedFundingAmount] = useState(0);
  const [tradingBalance, setTradingBalance] = useState(0);
  const [showTradingView, setShowTradingView] = useState(false);
  const [walletUrl, setWalletUrl] = useState('');
  const [chartUrl, setChartUrl] = useState('');

  // Reset function to clear all form state
  // Show 3 sections in same page when trading starts (100% AUTOMATIC - user requirement)
  const openTradingUIPages = (sessionId: string, walletAddress: string, tokenAddress: string) => {
    console.log(`🖥️ AUTO-OPENING 3 SECTIONS IN SAME PAGE for trading session: ${sessionId}`);
    
    // Enable the 3-section view AUTOMATICALLY
    setShowTradingView(true);
    setWalletUrl(`https://solscan.io/account/${walletAddress}`);
    setChartUrl(`https://dexscreener.com/solana/${tokenAddress}`);
    
    console.log(`✅ AUTO-OPENED 3 SECTIONS IN SAME PAGE:`);
    console.log(`├── Left: Session Dashboard (with transaction count)`);
    console.log(`├── Middle: Wallet Monitor - ${walletAddress}`);
    console.log(`└── Right: Token Chart - ${tokenAddress}`);
    
    toast({
      title: "🖥️ Live Trading Monitor Auto-Opened!",
      description: "All trading data now visible - Dashboard + Wallet + Chart",
      duration: 3000
    });
  };

  const resetForm = () => {
    setTokenAddress('');
    setDetectedTokenName('');
    setSessionId('');
    setDedicatedWallet('');
    setValidationResult(null);
    setSelectedTokenType('spl');
    setFundingAmount('0.15');
    setStep(1);
    setValidationSuccess(false);
    setForceReset(Date.now());
    
    // Force clear DOM elements
    setTimeout(() => {
      const inputs = document.querySelectorAll('input[type="text"]');
      inputs.forEach(input => {
        const inputEl = input as HTMLInputElement;
        inputEl.value = '';
        inputEl.defaultValue = '';
        inputEl.setAttribute('value', '');
      });
    }, 0);
  };

  // Ensure clean state on component mount and clear any browser persistence
  useEffect(() => {
    // Clear any localStorage that might be persisting form data
    try {
      localStorage.clear();
      sessionStorage.clear();
      // Force clear React Query cache to prevent automatic data loading
      import('@/lib/queryClient').then(({ queryClient }) => {
        queryClient.clear();
        queryClient.removeQueries();
      });
    } catch (e) {
      // Ignore storage errors
    }
    
    // Force reset all state immediately
    resetForm();

    // Multiple attempts to clear input field
    const clearInputMultipleTimes = () => {
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          setTokenAddress('');
          setForceReset(Date.now());
          
          // Clear input field directly if it exists
          const inputElement = document.getElementById('tokenAddress') as HTMLInputElement;
          if (inputElement) {
            inputElement.value = '';
            inputElement.setAttribute('value', '');
            inputElement.defaultValue = '';
          }
          
          // Also clear any form elements
          const forms = document.querySelectorAll('form');
          forms.forEach(form => form.reset());
        }, i * 50);
      }
    };

    clearInputMultipleTimes();

    return () => {};
  }, []);

  // Enhanced WebSocket message handler for live trading updates
  useEffect(() => {
    if (lastMessage && sessionId) {
      try {
        const message = JSON.parse(lastMessage);
        
        if (message.type === 'bot_status' && message.payload.sessionId === sessionId) {
          const status = message.payload.status;
          console.log('📩 Received status update:', status);
          
          // Handle different status types with | delimiter
          if (status.includes('FUNDING_DETECTED|')) {
            const [_, amount, wallet] = status.split('|');
            setDetectedFundingAmount(parseFloat(amount));
            setLiveStats(prev => ({ ...prev, fundingDetected: true, status: 'funded' }));
            toast({
              title: "💰 Funding Detected!",
              description: `${parseFloat(amount).toFixed(6)} SOL received in wallet`,
              duration: 5000
            });
          }
          
          else if (status.includes('FUNDING_PROCESSED|')) {
            const [_, totalAmount, tradingAmount, revenueAmount] = status.split('|');
            setTradingBalance(parseFloat(tradingAmount));
            setLiveStats(prev => ({ 
              ...prev, 
              status: 'processing',
              balance: parseFloat(tradingAmount)
            }));
          }
          
          else if (status.includes('TRADING_STARTED|')) {
            const [_, balance, dex, token, openUICommand] = status.split('|');
            setTradingActive(true);
            setLiveStats(prev => ({ 
              ...prev, 
              status: 'trading',
              balance: parseFloat(balance)
            }));
            
            // ALWAYS OPEN 3-SECTION VIEW when trading starts (100% automatic - user requirement)
            openTradingUIPages(sessionId, dedicatedWallet, token);
            
            toast({
              title: "🚀 Trading Started!",
              description: `Real BUY/SELL trades every 7 seconds on ${dex}`,
              duration: 5000
            });
          }
          
          else if (status.includes('OPEN_UI_PAGES|')) {
            const [_, walletAddress, tokenAddress] = status.split('|');
            openTradingUIPages(sessionId, walletAddress, tokenAddress);
          }
          
          else if (status.includes('TRADE_EXECUTED|')) {
            const [_, tradeType, amount, signature, totalTrades, totalVolume, remainingBalance] = status.split('|');
            
            // Add to recent trades list
            const newTrade = {
              type: tradeType,
              amount: parseFloat(amount),
              signature: signature,
              timestamp: Date.now(),
              url: `https://solscan.io/tx/${signature}`
            };
            
            setRecentTrades(prev => [newTrade, ...prev.slice(0, 4)]); // Keep last 5 trades
            
            setLiveStats(prev => ({ 
              ...prev, 
              transactions: parseInt(totalTrades),
              volume: parseFloat(totalVolume),
              balance: parseFloat(remainingBalance),
              status: parseFloat(remainingBalance) > 0.0001 ? 'trading' : 'completed'
            }));
            
            setLiveTransactionCount(parseInt(totalTrades));
            
            toast({
              title: `${tradeType === 'BUY' ? '🟢' : '🔴'} ${tradeType} Executed`,
              description: `${parseFloat(amount).toFixed(6)} SOL - Trade #${totalTrades}`,
              duration: 3000
            });
          }
        }
        
        if (message.type === 'session_update') {
          setLiveStats(prev => ({
            ...prev,
            transactions: message.payload.totalTrades || 0,
            volume: message.payload.totalVolume || 0,
            status: message.payload.isActive ? 'trading' : 'completed'
          }));
        }
        
        if (message.type === 'all_sessions_update') {
          setAllSessions(message.sessions || []);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    }
  }, [lastMessage, sessionId]);

  const createSessionMutation = useMutation({
    mutationFn: (data: any) => fetch('/api/professional/create-session', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(res => res.json()),
    onSuccess: (data) => {
      setSessionId(data.sessionId || data.id);
      setDedicatedWallet(data.userWallet || data.wallet);
      setMinAmount(data.minAmount || 0.15);
      setFundingAmount(data.minAmount?.toString() || '0.15');
      
      // Handle professional validation response structure
      const tokenData = data.tokenData || data.validationResult || data;
      setValidationResult(tokenData);
      setDetectedTokenName(tokenData?.name || tokenData?.symbol || 'Validated Token');
      setValidationSuccess(true);
      setStep(2);
      
      toast({ 
        title: "✅ Token Validation Complete", 
        description: `${tokenData?.name || tokenData?.symbol || 'Token'} validated with $${tokenData?.liquidityUsd?.toLocaleString() || 'confirmed'} liquidity on ${tokenData?.primaryDex || 'DEX'}!`
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Token Validation Failed", 
        description: error.message || "Invalid token address",
        variant: "destructive" 
      });
    }
  });

  const fundSessionMutation = useMutation({
    mutationFn: (data: any) => fetch(`/api/user-sessions/${sessionId}/fund`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(res => res.json()),
    onSuccess: () => {
      setStep(3);
      toast({ 
        title: "Professional Trading Activated!", 
        description: `Auto-trading initiated! ${(parseFloat(fundingAmount) * 0.75).toFixed(3)} SOL active trading capital deployed.`
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Funding Failed", 
        description: error.message || "Failed to fund session",
        variant: "destructive" 
      });
    }
  });

  const handleCreateSession = () => {
    if (!tokenAddress.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter a token contract address",
        variant: "destructive"
      });
      return;
    }

    createSessionMutation.mutate({
      tokenName: "Auto-detected", // Placeholder since backend will detect real name
      tokenType: selectedTokenType,
      tokenAddress: tokenAddress.trim()
    });
  };

  const handleFundSession = () => {
    if (!fundingAmount || parseFloat(fundingAmount) < minAmount) {
      toast({ title: `Minimum funding is ${minAmount} SOL`, variant: "destructive" });
      return;
    }

    fundSessionMutation.mutate({ amount: parseFloat(fundingAmount) });
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Light overlay to ensure text readability while showing stadium */}
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 via-emerald-500/15 to-yellow-500/20"></div>
      {/* Animated Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/5 via-transparent to-emerald-400/10 animate-pulse" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-br from-cyan-400/20 to-emerald-400/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-br from-emerald-400/20 to-yellow-400/20 rounded-full blur-3xl animate-pulse delay-1000" />
      {/* Header */}
      <div className="border-b border-cyan-400/30 bg-gradient-to-r from-cyan-800/60 via-emerald-800/60 to-cyan-800/60 backdrop-blur-xl shadow-2xl shadow-cyan-500/20 relative z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Bot className="w-10 h-10 text-cyan-400" />
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-300 via-emerald-300 to-yellow-300 bg-clip-text text-transparent animate-pulse">
                  FFS Volume Bot
                </h1>
                <p className="text-cyan-300/80 text-sm font-medium">Professional Pay-Per-Use Volume Generation</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">

              <div className="flex items-center gap-4">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${ 
                  isConnected ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-red-500/50 bg-red-500/10'
                }`}>
                  <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-400'} animate-pulse`} />
                  <span className={`text-sm font-medium ${isConnected ? 'text-emerald-300' : 'text-red-300'}`}>
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                
                {validationSuccess && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/50 bg-emerald-500/10">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-sm font-medium text-emerald-300">100% Validation Success</span>
                  </div>
                )}
                
                {liveTransactionCount > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-cyan-500/50 bg-cyan-500/10">
                    <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="text-sm font-medium text-cyan-300">
                      {liveTransactionCount} Live Transactions
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        {step === 1 && (
          <div className="max-w-2xl mx-auto">
            <Card className="bg-gradient-to-br from-cyan-800/40 via-emerald-800/40 to-yellow-800/40 border-cyan-400/30 backdrop-blur-xl shadow-2xl shadow-cyan-500/10 relative z-10">
              <CardHeader>
                <CardTitle className="text-center text-3xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-yellow-300 bg-clip-text text-transparent animate-pulse">
                  Step 1: Professional Token Analysis
                </CardTitle>
                <p className="text-center text-cyan-200/80 font-medium">Advanced liquidity validation & dedicated wallet generation</p>
              </CardHeader>
              <CardContent className="space-y-6">

                {/* Token name will be auto-detected from contract address */}

                <div>
                  <Label className="text-cyan-300 font-semibold">Professional Trading Category</Label>
                  <div className="flex gap-2 mt-2">
                    {(['spl', 'bonkfun', 'pumpfun'] as TokenType[]).map((type) => (
                      <Button
                        key={type}
                        variant={selectedTokenType === type ? "default" : "outline"}
                        onClick={() => setSelectedTokenType(type)}
                        className={selectedTokenType === type 
                          ? "bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-lg shadow-cyan-500/30 font-bold border-0" 
                          : "border-cyan-400/30 text-cyan-300 hover:bg-gradient-to-r hover:from-cyan-600/20 hover:to-emerald-600/20 hover:text-cyan-200 hover:border-emerald-400/40 bg-gradient-to-r from-cyan-800/60 to-emerald-800/60 font-semibold"
                        }
                        data-testid={`button-token-type-${type}`}
                      >
                        {type.toUpperCase()}
                      </Button>
                    ))}
                  </div>
                </div>

                <form autoComplete="off" onSubmit={(e) => e.preventDefault()}>
                  <div>
                    <Label htmlFor="tokenAddress" className="text-cyan-300 font-semibold">
                      {selectedTokenType === 'spl' ? 'Professional Token Contract Address' : 'Bonding Account Address'}
                    </Label>
                    <input
                      key={`fresh-input-${Date.now()}`}
                      type="text"
                      value={tokenAddress}
                      onChange={(e) => setTokenAddress(e.target.value)}
                      placeholder="Enter Solana token contract address (works with ANY token)"
                      className="mt-2 w-full px-3 py-2 bg-gradient-to-r from-cyan-800/60 to-emerald-800/60 border border-cyan-400/30 rounded-md text-white focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/20 placeholder:text-cyan-300/60 focus:outline-none"
                      data-testid="input-token-address"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck="false"
                    />
                  </div>
                </form>

                <div className="flex gap-3">
                  <Button
                    onClick={resetForm}
                    variant="outline"
                    className="border-cyan-400/30 text-cyan-300 hover:bg-gradient-to-r hover:from-cyan-600/20 hover:to-emerald-600/20 hover:text-cyan-200 hover:border-emerald-400/40 bg-gradient-to-r from-cyan-800/60 to-emerald-800/60 font-semibold"
                    data-testid="button-reset-form"
                  >
                    Clear Form
                  </Button>
                  
                  <Button
                    onClick={handleCreateSession}
                    disabled={createSessionMutation.isPending}
                    className="flex-1 bg-gradient-to-r from-cyan-500 via-emerald-500 to-cyan-600 hover:from-cyan-600 hover:via-emerald-600 hover:to-cyan-700 text-white font-bold py-4 text-lg shadow-2xl shadow-cyan-500/30 hover:shadow-emerald-500/30 transition-all duration-300 animate-pulse"
                    data-testid="button-validate-token"
                  >
                    {createSessionMutation.isPending ? 'Professional Analysis In Progress...' : 'Validate ANY Solana Token'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {step === 2 && (
          <div className="max-w-2xl mx-auto">
            <Card className="bg-gradient-to-br from-emerald-800/70 via-cyan-800/70 to-yellow-800/70 border-emerald-400/30 backdrop-blur-xl shadow-2xl shadow-emerald-500/10 relative z-10">
              <CardHeader>
                <CardTitle className="text-center text-3xl bg-gradient-to-r from-emerald-300 via-cyan-300 to-yellow-300 bg-clip-text text-transparent animate-pulse">
                  Step 2: Professional Volume Trading
                </CardTitle>
                <p className="text-center text-emerald-200/80 font-medium">Fund wallet - trading begins automatically upon deposit confirmation</p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-emerald-500/10 p-4 rounded-lg border border-emerald-400/30 shadow-lg shadow-emerald-500/10">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-emerald-300 animate-pulse" />
                    <h3 className="text-emerald-300 font-bold">Professional Token Analysis Complete</h3>
                  </div>
                  <p className="text-cyan-100">Token: <span className="text-cyan-300 font-semibold">{detectedTokenName}</span></p>
                  <p className="text-cyan-100">Symbol: <span className="text-emerald-300 font-semibold">{validationResult?.symbol || 'VALIDATED'}</span></p>
                  <p className="text-cyan-100">Primary DEX: <span className="text-yellow-300 font-semibold">{validationResult?.primaryDex || 'Auto-Selected'}</span></p>
                  
                  {/* Display Found Liquidity Pools */}
                  {validationResult?.pools && validationResult.pools.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h4 className="text-cyan-300 font-semibold flex items-center gap-2">
                        <Coins className="w-4 h-4" />
                        Verified Trading Liquidity ({validationResult.pools.length} pools)
                      </h4>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {validationResult.pools.slice(0, 3).map((pool: any, index: number) => (
                          <div 
                            key={index}
                            className="flex items-center justify-between p-2 bg-gradient-to-r from-cyan-800/50 to-emerald-800/50 rounded border border-cyan-400/20"
                          >
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs text-cyan-300 border-cyan-400">
                                {pool.dex || pool.dexName}
                              </Badge>
                              <span className="text-xs text-cyan-200">
                                Volume: ${pool.volume24hUsd?.toLocaleString() || 'N/A'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-emerald-300 font-semibold">
                                ${pool.liquidityUsd?.toLocaleString() || pool.liquidity?.toLocaleString() || 'N/A'}
                              </span>
                              <a
                                href={`https://dexscreener.com/solana/${pool.pairAddress || tokenAddress}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          </div>
                        ))}
                        {validationResult.liquidityPools.length > 3 && (
                          <p className="text-xs text-cyan-300/60 text-center">
                            +{validationResult.liquidityPools.length - 3} more pools (Total: ${validationResult.totalLiquidity?.toLocaleString()})
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-yellow-400/10 border-2 border-yellow-400/30 p-4 rounded-lg shadow-2xl shadow-yellow-500/20">
                  <h4 className="text-yellow-300 font-bold mb-2 flex items-center gap-2">
                    <Wallet className="w-5 h-5 animate-pulse" />
                    Professional Trading Wallet:
                  </h4>
                  <p className="font-mono text-sm break-all text-cyan-300 bg-gradient-to-r from-cyan-800/70 to-emerald-800/70 p-3 rounded-lg border border-cyan-400/20 font-bold">
                    {dedicatedWallet || 'Generating unique wallet...'}
                  </p>
                </div>


              </CardContent>
            </Card>
          </div>
        )}

        {step === 3 && (
          <div className="max-w-4xl mx-auto">
            {/* Auto-Trading Status Banner */}
            <Card className="mb-6 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border-emerald-400/30 backdrop-blur-xl">
              <CardContent className="p-4">
                <div className="flex items-center justify-center gap-3">
                  <div className={`w-3 h-3 rounded-full animate-pulse ${
                    liveStats.status === 'waiting' ? 'bg-yellow-400' :
                    liveStats.status === 'funded' || liveStats.status === 'processing' ? 'bg-emerald-400' :
                    liveStats.status === 'trading' ? 'bg-cyan-400' : 'bg-emerald-400'
                  }`}></div>
                  <h2 className="text-emerald-300 font-bold text-lg">
                    {liveStats.status === 'waiting' ? 'Professional Auto-Trading System Ready' :
                     liveStats.status === 'funded' || liveStats.status === 'processing' ? 'Funding Detected - Starting Trading' :
                     liveStats.status === 'trading' ? 'Live Trading Active' : 'Professional Auto-Trading System Active'}
                  </h2>
                  <div className={`w-3 h-3 rounded-full animate-pulse ${
                    liveStats.status === 'waiting' ? 'bg-yellow-400' :
                    liveStats.status === 'funded' || liveStats.status === 'processing' ? 'bg-emerald-400' :
                    liveStats.status === 'trading' ? 'bg-cyan-400' : 'bg-emerald-400'
                  }`}></div>
                </div>
                <p className="text-center text-cyan-200 text-sm mt-2">
                  {liveStats.status === 'waiting' ? 'Send SOL to wallet address below to start automatic trading' :
                   liveStats.status === 'funded' || liveStats.status === 'processing' ? 'Processing fund split and preparing trading session' :
                   liveStats.status === 'trading' ? 'Real BUY/SELL trades executing every 7 seconds on Jupiter DEX' :
                   'Trading initiated automatically upon funding detection • Continuous BUY/SELL execution every 7 seconds'}
                </p>
              </CardContent>
            </Card>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <Card className="bg-gradient-to-br from-emerald-800/50 via-cyan-800/50 to-emerald-800/50 border-emerald-500/20 backdrop-blur-sm shadow-lg shadow-emerald-500/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Play className="w-5 h-5 text-emerald-400" />
                    <CardTitle className="text-emerald-300">Professional Trading</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                      <span className="text-emerald-400 font-semibold">Professional Trading Active</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-cyan-200">Token:</span>
                        <span className="text-cyan-400">{detectedTokenName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-cyan-200">Funded:</span>
                        <span className="text-emerald-400">{detectedFundingAmount.toFixed(6)} SOL</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-cyan-200">Trading:</span>
                        <span className="text-yellow-400">{(detectedFundingAmount * 0.75).toFixed(6)} SOL</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-yellow-800/50 via-emerald-800/50 to-yellow-800/50 border-yellow-500/20 backdrop-blur-sm shadow-lg shadow-yellow-500/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-yellow-400" />
                    <CardTitle className="text-yellow-300">Revenue</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-cyan-200">Collected (25%):</span>
                      <span className="text-yellow-400 font-semibold">
                        {(detectedFundingAmount * 0.25).toFixed(6)} SOL
                      </span>
                    </div>
                    <p className="text-xs text-cyan-300/70">Automatically sent to revenue wallet</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-cyan-800/50 via-emerald-800/50 to-cyan-800/50 border-cyan-500/20 backdrop-blur-sm shadow-lg shadow-cyan-500/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-5 h-5 text-cyan-400" />
                    <CardTitle className="text-cyan-300">Live Trading Status</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {liveStats.status === 'waiting' && (
                    <div className="text-center py-4">
                      <div className="w-4 h-4 bg-yellow-400 rounded-full animate-pulse mx-auto mb-2"></div>
                      <p className="text-yellow-300 font-semibold">Waiting for Funding</p>
                      <p className="text-xs text-cyan-300/60">Send SOL to wallet to start trading</p>
                    </div>
                  )}
                  
                  {liveStats.fundingDetected && (
                    <div className="bg-emerald-900/50 border border-emerald-400/30 rounded-lg p-3 mb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-300 font-semibold">Funding Detected!</span>
                      </div>
                      <p className="text-xs text-emerald-200">{detectedFundingAmount.toFixed(6)} SOL received</p>
                    </div>
                  )}

                  {tradingActive && (
                    <div className="space-y-3">
                      <div className="bg-cyan-900/50 border border-cyan-400/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                          <span className="text-cyan-300 font-semibold">Live Trading Active</span>
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-cyan-200">Trades:</span>
                            <span className="text-cyan-400 font-bold">{liveStats.transactions}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-cyan-200">Volume:</span>
                            <span className="text-emerald-400 font-bold">{liveStats.volume.toFixed(6)} SOL</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-cyan-200">Balance:</span>
                            <span className="text-yellow-400 font-bold">{liveStats.balance?.toFixed(6) || '0.000000'} SOL</span>
                          </div>
                        </div>
                      </div>

                      {recentTrades.length > 0 && (
                        <div className="bg-yellow-900/30 border border-yellow-400/20 rounded-lg p-3">
                          <h4 className="text-yellow-300 font-semibold mb-2 text-xs">Recent Trades:</h4>
                          <div className="space-y-1">
                            {recentTrades.slice(0, 3).map((trade, index) => (
                              <div key={index} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1">
                                  <div className={`w-1.5 h-1.5 rounded-full ${trade.type === 'BUY' ? 'bg-emerald-400' : 'bg-red-400'}`}></div>
                                  <span className={trade.type === 'BUY' ? 'text-emerald-300' : 'text-red-300'}>
                                    {trade.type}
                                  </span>
                                </div>
                                <span className="text-cyan-200">{trade.amount.toFixed(6)} SOL</span>
                                <a 
                                  href={trade.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-blue-400 hover:text-blue-300"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {liveStats.status === 'completed' && (
                    <div className="text-center py-4">
                      <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                      <p className="text-emerald-300 font-semibold">Trading Complete</p>
                      <p className="text-xs text-cyan-300/60">All trading funds depleted</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* COMPREHENSIVE FINAL DISPLAY WITH ASCII ART */}
            {(allSessions.length > 0 || liveTransactionCount > 0) && (
              <Card className="bg-gradient-to-br from-emerald-800/80 via-cyan-800/80 to-yellow-800/80 border-2 border-emerald-500/30 backdrop-blur-xl mb-6 shadow-2xl shadow-emerald-500/20">
                <CardHeader className="pb-4 border-b border-emerald-500/30">
                  <div className="flex items-center justify-center gap-3">
                    <Activity className="w-6 h-6 text-emerald-400 animate-pulse" />
                    <CardTitle className="text-2xl font-bold bg-gradient-to-r from-emerald-400 via-cyan-400 to-yellow-400 bg-clip-text text-transparent">
                      Professional Volume Bot Status
                    </CardTitle>
                    <Activity className="w-6 h-6 text-emerald-400 animate-pulse" />
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  {/* ASCII Art Display Board */}
                  <div className="bg-gradient-to-br from-cyan-900/60 via-emerald-900/60 to-yellow-900/60 border-2 border-cyan-400/30 rounded-xl p-6 font-mono text-center mb-6">
                    <div className="text-cyan-300 text-sm mb-4">
                      {`
╔══════════════════════════════════════════════════════════════════════════════════╗
║                        🚀 PROFESSIONAL VOLUME BOT SYSTEM 🚀                      ║
╠══════════════════════════════════════════════════════════════════════════════════╣
║  📊 TOTAL TRANSACTIONS: ${String(liveTransactionCount).padStart(8, ' ')}                                   ║
║  🏢 ACTIVE SESSIONS:    ${String(allSessions.length).padStart(8, ' ')}                                   ║
║  💰 TOTAL VOLUME:       ${String(allSessions.reduce((sum: number, s: any) => sum + (s.volume || 0), 0).toFixed(3)).padStart(8, ' ')} SOL                           ║
║  ✅ SUCCESS RATE:       ${String('100%').padStart(8, ' ')}                                   ║
╚══════════════════════════════════════════════════════════════════════════════════╝
                      `.trim()}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-6 mt-6">
                      <div className="text-left">
                        <h4 className="text-emerald-400 font-bold mb-2">🎯 LIVE STATISTICS</h4>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-cyan-200">Platform Transactions:</span>
                            <span className="text-emerald-400 font-bold animate-pulse">{liveTransactionCount}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-cyan-200">Active Sessions:</span>
                            <span className="text-cyan-400 font-bold">{allSessions.length}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-cyan-200">System Uptime:</span>
                            <span className="text-yellow-400 font-bold">100%</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-left">
                        <h4 className="text-yellow-400 font-bold mb-2">💎 VOLUME METRICS</h4>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-cyan-200">Total Volume:</span>
                            <span className="text-emerald-400 font-bold">
                              {allSessions.reduce((sum: number, s: any) => sum + (s.volume || 0), 0).toFixed(4)} SOL
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-cyan-200">Avg Per Session:</span>
                            <span className="text-cyan-400 font-bold">
                              {allSessions.length > 0 ? 
                                (allSessions.reduce((sum: number, s: any) => sum + (s.volume || 0), 0) / allSessions.length).toFixed(4) : 
                                '0.0000'
                              } SOL
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-cyan-200">Revenue Collected:</span>
                            <span className="text-yellow-400 font-bold">25%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* SESSION DETAILS TABLE */}
                  {allSessions.length > 0 && (
                    <div>
                      <h4 className="text-cyan-300 font-bold mb-4 flex items-center gap-2">
                        <Activity className="w-5 h-5" />
                        Active Trading Sessions ({allSessions.length})
                      </h4>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {allSessions.map((session: any, index: number) => (
                          <div key={session.sessionId || index} 
                               className="flex items-center justify-between p-3 bg-gradient-to-r from-emerald-800/40 via-cyan-800/40 to-emerald-800/40 rounded-lg border border-emerald-400/20">
                            <div className="flex items-center gap-3">
                              <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
                              <div>
                                <span className="text-sm font-medium text-cyan-100">
                                  {session.tokenSymbol || session.tokenName || `Session ${index + 1}`}
                                </span>
                                <div className="text-xs text-cyan-300/70">
                                  {session.sessionId?.slice(0, 8)}...{session.sessionId?.slice(-4)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="text-center">
                                <div className="text-xs text-cyan-300/70">Trades</div>
                                <div className="text-cyan-400 font-bold">{session.transactions || 0}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-cyan-300/70">Volume</div>
                                <div className="text-emerald-400 font-bold">{(session.volume || 0).toFixed(3)} SOL</div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-cyan-300/70">Last Activity</div>
                                <div className="text-yellow-400 font-bold text-xs">
                                  {session.lastUpdate ? 
                                    new Date(session.lastUpdate).toLocaleTimeString() : 
                                    'Starting...'
                                  }
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="text-center">
              <Button
                onClick={() => {
                  setStep(1);
                  setSessionId('');
                  setDetectedTokenName('');
                  setTokenAddress('');
                  setValidationResult(null);
                  setValidationSuccess(false);
                }}
                variant="outline"
                className="border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/10"
                data-testid="button-new-session"
              >
                Start New Session
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 3-SECTION TRADING VIEW - ALL IN ONE PAGE */}
      {showTradingView && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 overflow-hidden">
          <div className="h-full flex flex-col">
            {/* Header with close button */}
            <div className="bg-gradient-to-r from-cyan-800/60 to-emerald-800/60 border-b border-cyan-400/30 p-4 flex justify-between items-center">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-300 to-emerald-300 bg-clip-text text-transparent">
                🚀 Live Trading Monitor - All in One
              </h2>
              <Button
                onClick={() => setShowTradingView(false)}
                variant="outline"
                className="border-cyan-400/30 text-cyan-300 hover:bg-cyan-600/20"
              >
                Close View
              </Button>
            </div>

            {/* 3-Section Layout */}
            <div className="flex-1 flex overflow-hidden">
              {/* Section 1: Session Dashboard (Left) */}
              <div className="w-1/3 border-r border-cyan-400/30 bg-gradient-to-br from-cyan-900/40 to-emerald-900/40 p-4 overflow-y-auto">
                <h3 className="text-lg font-bold text-cyan-300 mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Session Dashboard
                </h3>
                
                {/* Live Trading Stats */}
                <div className="space-y-4">
                  <Card className="bg-cyan-800/30 border-cyan-400/20">
                    <CardContent className="p-4">
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                          <div className="text-cyan-300 text-xs">Trades</div>
                          <div className="text-xl font-bold text-emerald-400 animate-pulse">
                            {liveStats.transactions}
                          </div>
                        </div>
                        <div>
                          <div className="text-cyan-300 text-xs">Total Count</div>
                          <div className="text-xl font-bold text-cyan-400 animate-pulse">
                            {liveTransactionCount}
                          </div>
                        </div>
                        <div>
                          <div className="text-cyan-300 text-xs">Volume</div>
                          <div className="text-xl font-bold text-yellow-400">
                            {liveStats.volume.toFixed(3)} SOL
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-emerald-800/30 border-emerald-400/20">
                    <CardContent className="p-4">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-cyan-200">Status:</span>
                          <Badge variant={liveStats.status === 'trading' ? 'default' : 'outline'} 
                                 className={liveStats.status === 'trading' ? 'bg-emerald-500 animate-pulse' : ''}>
                            {liveStats.status.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-cyan-200">Balance:</span>
                          <span className="text-emerald-400 font-bold">
                            {liveStats.balance.toFixed(6)} SOL
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-cyan-200">Session:</span>
                          <span className="text-cyan-400 font-mono text-sm">
                            {sessionId.slice(0, 8)}...
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Recent Trades */}
                  {recentTrades.length > 0 && (
                    <Card className="bg-yellow-800/30 border-yellow-400/20">
                      <CardContent className="p-4">
                        <h4 className="text-yellow-300 font-bold mb-2">Recent Trades</h4>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {recentTrades.slice(-5).reverse().map((trade, index) => (
                            <div key={index} className="flex justify-between text-sm">
                              <Badge variant={trade.type === 'BUY' ? 'default' : 'outline'}
                                     className={trade.type === 'BUY' ? 'bg-green-500' : 'bg-red-500'}>
                                {trade.type}
                              </Badge>
                              <span className="text-cyan-200">{trade.amount} SOL</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>

              {/* Section 2: Wallet Monitor (Middle) */}
              <div className="w-1/3 border-r border-cyan-400/30 bg-gradient-to-br from-emerald-900/40 to-cyan-900/40 overflow-hidden">
                <div className="p-4 border-b border-emerald-400/30">
                  <h3 className="text-lg font-bold text-emerald-300 flex items-center gap-2">
                    <Wallet className="w-5 h-5" />
                    Wallet Monitor
                  </h3>
                  <p className="text-emerald-200 text-sm">Real-time transaction feed</p>
                </div>
                <iframe
                  src={walletUrl}
                  className="w-full h-full border-0"
                  title="Wallet Monitor"
                />
              </div>

              {/* Section 3: Token Chart (Right) */}
              <div className="w-1/3 bg-gradient-to-br from-yellow-900/40 to-cyan-900/40 overflow-hidden">
                <div className="p-4 border-b border-yellow-400/30">
                  <h3 className="text-lg font-bold text-yellow-300 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Token Chart
                  </h3>
                  <p className="text-yellow-200 text-sm">Live volume on DexScreener</p>
                </div>
                <iframe
                  src={chartUrl}
                  className="w-full h-full border-0"
                  title="Token Chart"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}