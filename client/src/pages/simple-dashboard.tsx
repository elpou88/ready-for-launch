import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useWebSocket } from '@/hooks/use-websocket';
import logoPath from "@assets/image_1754295054789.png";
import { 
  Play, 
  Square, 
  Volume2, 
  TrendingUp, 
  Coins,
  Wallet,
  Users,
  Headphones,
  Bot
} from 'lucide-react';

type TokenType = 'spl' | 'bonkfun' | 'pumpfun';

export default function SimpleDashboard(): React.JSX.Element {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isConnected, lastMessage } = useWebSocket();
  
  const [step, setStep] = useState(1); // 1: Token Setup, 2: Funding, 3: Bot Running
  const [userWallet, setUserWallet] = useState('');
  const [fundingAmount, setFundingAmount] = useState('0.15');
  const [depositAmount, setDepositAmount] = useState('0.15');
  const [selectedTokenType, setSelectedTokenType] = useState<TokenType>('spl');
  const [tokenName, setTokenName] = useState('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [sessionId, setSessionId] = useState('');

  // Queries
  const { data: botConfig } = useQuery({
    queryKey: ['/api/bot/config'],
  });

  const { data: metrics } = useQuery({
    queryKey: ['/api/metrics'],
  });

  const { data: walletBalance } = useQuery({
    queryKey: ['/api/wallet/main'],
  });

  const { data: tokens = [] } = useQuery({
    queryKey: ['/api/tokens'],
  });

  // Mutations
  const startBotMutation = useMutation({
    mutationFn: () => fetch('/api/bot/start', { method: 'POST' }),
    onSuccess: () => {
      toast({ title: "Bot started successfully!" });
      queryClient.invalidateQueries({ queryKey: ['/api/bot/status'] });
    },
    onError: () => {
      toast({ title: "Failed to start bot", variant: "destructive" });
    }
  });

  const stopBotMutation = useMutation({
    mutationFn: () => fetch('/api/bot/stop', { method: 'POST' }),
    onSuccess: () => {
      toast({ title: "Bot stopped" });
      queryClient.invalidateQueries({ queryKey: ['/api/bot/status'] });
    },
  });

  const createSessionMutation = useMutation({
    mutationFn: (data: any) => fetch('/api/user-sessions', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(res => res.json()),
    onSuccess: (data) => {
      setSessionId(data.id);
      setStep(2);
      toast({ 
        title: "Token Validated Successfully!", 
        description: `${tokenName} ready for volume generation. Now fund your session.`
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
        title: "Session Funded Successfully!", 
        description: `Bot started! ${(parseFloat(fundingAmount) * 0.75).toFixed(3)} SOL available for trading.`
      });
      queryClient.invalidateQueries();
    },
    onError: (error: any) => {
      toast({ 
        title: "Funding Failed", 
        description: error.message || "Failed to fund session",
        variant: "destructive" 
      });
    }
  });

  const addTokenMutation = useMutation({
    mutationFn: (data: any) => fetch('/api/tokens', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }),
    onSuccess: () => {
      toast({ title: "Session created successfully!" });
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
    },
  });

  const createTokenMutation = useMutation({
    mutationFn: (data: any) => fetch('/api/tokens', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }),
    onSuccess: () => {
      toast({ title: "Token added successfully!" });
      queryClient.invalidateQueries({ queryKey: ['/api/tokens'] });
      setTokenName('');
      setTokenAddress('');
    },
  });

  // WebSocket handling
  useEffect(() => {
    if (!lastMessage) return;
    
    switch (lastMessage.type) {
      case 'bot_status':
        queryClient.setQueryData(['/api/bot/status'], lastMessage);
        break;
      case 'transaction_completed':
      case 'session_stats':
        queryClient.setQueryData(['/api/metrics'], lastMessage);
        break;
    }
  }, [lastMessage, queryClient]);

  const handleStartBot = () => {
    if (parseFloat(depositAmount) < 0.15) {
      toast({ title: "Minimum deposit is 0.15 SOL", variant: "destructive" });
      return;
    }
    
    // Create session first
    createSessionMutation.mutate({
      userId: 'user-' + Date.now(),
      depositAmount: depositAmount,
    });
    
    // Then start bot
    startBotMutation.mutate();
  };

  const validateTokenAddress = (address: string, type: TokenType): boolean => {
    // Basic Solana address validation (base58, 32-44 chars)
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!base58Regex.test(address)) {
      return false;
    }

    // Additional type-specific validation
    if (type === 'spl') {
      // SPL tokens should be valid Solana public keys (44 chars typically)
      return address.length >= 32 && address.length <= 44;
    }
    
    // For bonkfun and pumpfun, validate bonding curve addresses
    return address.length >= 32 && address.length <= 44;
  };

  const handleAddToken = () => {
    if (!tokenName || !tokenAddress) {
      toast({ title: "Please enter both token name and address", variant: "destructive" });
      return;
    }

    // Validate token address format
    if (!validateTokenAddress(tokenAddress, selectedTokenType)) {
      toast({
        title: "Invalid Address",
        description: "Please enter a valid Solana address (32-44 characters, base58 format)",
        variant: "destructive"
      });
      return;
    }

    // Check for duplicate addresses
    if (Array.isArray(tokens)) {
      const isDuplicate = tokens.some(token => 
        (token.mint === tokenAddress && selectedTokenType === 'spl') ||
        (token.bonding === tokenAddress && selectedTokenType !== 'spl')
      );
      
      if (isDuplicate) {
        toast({
          title: "Duplicate Token",
          description: "This token address is already being tracked",
          variant: "destructive"
        });
        return;
      }
    }

    createTokenMutation.mutate({
      name: tokenName.trim(),
      type: selectedTokenType,
      mint: selectedTokenType === 'spl' ? tokenAddress.trim() : null,
      bonding: selectedTokenType !== 'spl' ? tokenAddress.trim() : null,
    });

    // Clear form after successful addition
    setTokenName('');
    setTokenAddress('');
    
    toast({
      title: "Token Added",
      description: `${tokenName} ready for volume generation`,
    });
  };

  const metricsData = metrics as any;
  const isActive = metricsData?.totalTransactions && metricsData.totalTransactions > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0f1a] via-[#1a1f2e] to-[#0a0f1a] text-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center space-x-3">
            <Bot className="h-16 w-16 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-emerald-400 to-yellow-400 bg-clip-text text-transparent">
              FFS VOLUME BOT
            </h1>
            <p className="text-emerald-300/90 mt-2">High-Frequency Volume Generator • Creates Trending Activity</p>
          </div>
          <div className="flex items-center justify-center space-x-2 text-sm">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50' : 'bg-red-400'}`} />
            <span className="text-emerald-300">Solana Network: {isConnected ? 'Connected' : 'Disconnected'}</span>
            <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              {isActive ? 'Ready' : 'Inactive'}
            </Badge>
          </div>
        </div>

        {/* Main Control Card */}
        <div className="bg-gradient-to-br from-[#0a0f1a]/95 via-[#1a1f2e]/90 to-[#0f1419]/95 border border-emerald-500/30 backdrop-blur-sm shadow-2xl shadow-emerald-500/20 rounded-lg p-6" style={{
          backgroundImage: `
            radial-gradient(circle at 20% 50%, rgba(16, 185, 129, 0.08) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(245, 158, 11, 0.08) 0%, transparent 50%),
            radial-gradient(circle at 40% 80%, rgba(6, 182, 212, 0.05) 0%, transparent 50%)
          `
        }}>
          <div className="text-center mb-6">
            <h2 className="text-white text-xl font-semibold mb-2">Welcome to FFS Volume Bot!</h2>
            <p className="text-emerald-300/90">
              Experience the power of our volume bot. We offer tools to boost your tokens metrics!
            </p>
          </div>
          <div className="space-y-6">
            
            {/* Features */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center space-x-3">
                <Volume2 className="h-5 w-5 text-cyan-400" />
                <div>
                  <div className="text-white font-medium">Volume:</div>
                  <div className="text-white/90">Organic and Performance volume options</div>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
                <div>
                  <div className="text-white font-medium">Trending:</div>
                  <div className="text-white/90">Boost your Dexscreener metrics</div>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Wallet className="h-5 w-5 text-yellow-400" />
                <div>
                  <div className="text-white font-medium">Fresh wallets</div>
                  <div className="text-white/90">generated for buys/sells on every transaction</div>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Coins className="h-5 w-5 text-emerald-400" />
                <div>
                  <div className="text-white font-medium">Get started</div>
                  <div className="text-white/90">for as low as 0.15 SOL</div>
                </div>
              </div>
            </div>

            {/* Deposit Section */}
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-white font-medium mb-4">Enter your deposit amount to get started 💰</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="deposit" className="text-white font-medium">Deposit Amount (Min 0.15 SOL)</Label>
                <Input 
                  id="deposit"
                  type="number" 
                  min="0.15"
                  step="0.01"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0.15"
                  className="bg-gradient-to-r from-[#0f1419] to-[#1a1f2e] border-emerald-500/30 text-white placeholder-emerald-300/50 text-center text-lg py-6 shadow-lg shadow-emerald-500/10"
                  data-testid="input-deposit-amount"
                />
                <div className="text-center text-sm">
                  <span className="text-white/80">• Secure server wallet system</span>
                </div>
              </div>

              {/* Token Selection - Simple dropdown */}
              <div className="grid grid-cols-1 gap-4 p-4 bg-gradient-to-r from-emerald-500/10 via-yellow-500/5 to-emerald-500/10 border border-emerald-500/30 rounded-lg shadow-lg shadow-emerald-500/10">
                <div className="text-center text-white font-medium">Add Token for Volume</div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-2">
                    <Label className="text-white text-sm font-medium">Type</Label>
                    <select 
                      value={selectedTokenType} 
                      onChange={(e) => setSelectedTokenType(e.target.value as TokenType)}
                      className="w-full bg-gradient-to-r from-[#0f1419] to-[#1a1f2e] border border-emerald-500/30 text-white rounded-md px-3 py-2 text-sm shadow-md"
                    >
                      <option value="spl">SPL Token</option>
                      <option value="bonkfun">Bonk.fun</option>
                      <option value="pumpfun">Pump.fun</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white text-sm font-medium">Name</Label>
                    <Input 
                      value={tokenName}
                      onChange={(e) => setTokenName(e.target.value)}
                      placeholder="Token name"
                      className="bg-gradient-to-r from-[#0f1419] to-[#1a1f2e] border-emerald-500/30 text-white shadow-md"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white text-sm font-medium">Address</Label>
                    <Input 
                      value={tokenAddress}
                      onChange={(e) => setTokenAddress(e.target.value)}
                      placeholder="Token address"
                      className="bg-gradient-to-r from-[#0f1419] to-[#1a1f2e] border-emerald-500/30 text-white shadow-md"
                    />
                  </div>
                </div>
                <Button 
                  onClick={handleAddToken}
                  className="bg-gradient-to-r from-emerald-500 to-yellow-500 hover:from-emerald-600 hover:to-yellow-600 shadow-lg shadow-emerald-500/25"
                  disabled={createTokenMutation.isPending}
                >
                  Add Token
                </Button>
              </div>

              {/* Active Tokens */}
              {Array.isArray(tokens) && tokens.length > 0 && (
                <div className="space-y-2">
                  <div className="text-center text-white font-medium text-sm">Active Tokens ({tokens.length})</div>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {tokens.map((token: any) => (
                      <div key={token.id} className="flex items-center justify-between p-2 bg-gradient-to-r from-emerald-900/20 to-yellow-900/20 border border-emerald-500/20 rounded shadow-md">
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                          <span className="text-white text-sm">{token.name}</span>
                          <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">{token.type}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Start Button */}
              <Button 
                onClick={handleStartBot}
                disabled={startBotMutation.isPending || isActive}
                className="w-full bg-gradient-to-r from-emerald-500 via-yellow-500 to-emerald-500 hover:from-emerald-600 hover:via-yellow-600 hover:to-emerald-600 text-white py-6 text-lg font-semibold shadow-lg shadow-emerald-500/30"
                data-testid="button-start-bot"
              >
                <Play className="w-5 h-5 mr-2" />
                {isActive ? 'Bot Running' : 'START - Start the bot for volume'}
              </Button>

              {isActive && (
                <Button 
                  onClick={() => stopBotMutation.mutate()}
                  variant="outline"
                  className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10"
                  data-testid="button-stop-bot"
                >
                  <Square className="w-4 h-4 mr-2" />
                  Stop Bot
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center justify-center space-x-2 py-6 border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 rounded-lg hover:bg-emerald-500/20 shadow-lg cursor-pointer transition-all duration-200">
            <Users className="w-5 h-5 text-emerald-400" />
            <span className="text-emerald-400 font-medium">Referrals</span>
          </div>
          <div className="flex items-center justify-center space-x-2 py-6 border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 rounded-lg hover:bg-emerald-500/20 shadow-lg cursor-pointer transition-all duration-200">
            <Headphones className="w-5 h-5 text-emerald-400" />
            <span className="text-emerald-400 font-medium">Support</span>
          </div>
        </div>

        {/* Stats */}
        {metrics && (
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-gradient-to-br from-emerald-900/40 to-[#0f1419]/80 border border-emerald-500/30 rounded-lg p-4 shadow-lg shadow-emerald-500/20">
              <div className="text-2xl font-bold text-emerald-400">{(metrics as any)?.totalTransactions || 0}</div>
              <div className="text-xs text-white/80 font-medium">Total Transactions</div>
            </div>
            <div className="bg-gradient-to-br from-yellow-900/40 to-[#0f1419]/80 border border-yellow-500/30 rounded-lg p-4 shadow-lg shadow-yellow-500/20">
              <div className="text-2xl font-bold text-yellow-400">${(metrics as any)?.volumeGenerated || '0'}</div>
              <div className="text-xs text-white/80 font-medium">Volume Generated</div>
            </div>
            <div className="bg-gradient-to-br from-emerald-900/40 to-[#0f1419]/80 border border-emerald-500/30 rounded-lg p-4 shadow-lg shadow-emerald-500/20">
              <div className="text-2xl font-bold text-emerald-400">{Array.isArray(tokens) ? tokens.length : 0}</div>
              <div className="text-xs text-white/80 font-medium">Active Tokens</div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center">
          <div className="text-xs text-white/70 font-medium">
            Server Wallet Balance: {parseFloat((walletBalance as any)?.balance || '0').toFixed(2)} SOL
          </div>
        </div>
      </div>
    </div>
  );
}