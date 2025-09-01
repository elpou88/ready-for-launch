import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '@/hooks/use-websocket';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { 
  Play, 
  Square, 
  Pause, 
  Settings, 
  Bot, 
  TrendingUp, 
  Coins, 
  BarChart3, 
  CheckCircle,
  ExternalLink,
  Plus,
  MoreVertical,
  Filter,
  Download,
  DollarSign,
  Wallet,
  Shield
} from 'lucide-react';
// Volume Bot Logo removed - using text branding
import type { BotConfig, Token, Transaction, BotMetrics, WalletBalance, WebSocketMessage } from '@shared/schema';

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isConnected, lastMessage } = useWebSocket();
  
  const [botStatus, setBotStatus] = useState({ isRunning: false, isPaused: false, isConfigured: false });
  const [mainWalletBalance, setMainWalletBalance] = useState('0');

  // Queries
  const { data: config } = useQuery<BotConfig>({
    queryKey: ['/api/bot/config'],
  });

  const { data: tokens = [] } = useQuery<Token[]>({
    queryKey: ['/api/tokens'],
  });

  const { data: transactions = [] } = useQuery<Transaction[]>({
    queryKey: ['/api/transactions'],
  });

  const { data: metrics } = useQuery<BotMetrics>({
    queryKey: ['/api/metrics'],
  });

  const { data: walletBalance } = useQuery<WalletBalance>({
    queryKey: ['/api/wallet/main'],
  });

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.type) {
      case 'bot_status':
        setBotStatus(prev => ({ ...prev, isRunning: lastMessage.data.isActive }));
        toast({
          title: 'Bot Status Update',
          description: lastMessage.data.status,
        });
        break;
      case 'new_transaction':
        queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
        queryClient.invalidateQueries({ queryKey: ['/api/metrics'] });
        break;
      case 'metrics_update':
        queryClient.setQueryData(['/api/metrics'], lastMessage.data);
        break;
      case 'wallet_balance_update':
        setMainWalletBalance(lastMessage.data.balance || '0');
        break;
      case 'error':
        toast({
          title: 'Bot Error',
          description: lastMessage.data.message,
          variant: 'destructive',
        });
        break;
    }
  }, [lastMessage, queryClient, toast]);

  // Update wallet balance when data changes
  useEffect(() => {
    if (walletBalance && walletBalance.balance) {
      setMainWalletBalance(walletBalance.balance);
    }
  }, [walletBalance]);

  // Mutations
  const startBotMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/bot/start'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bot/status'] });
    },
  });

  const stopBotMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/bot/stop'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bot/status'] });
    },
  });

  const pauseBotMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/bot/pause'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bot/status'] });
    },
  });

  const saveConfigMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/bot/config', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bot/config'] });
      toast({
        title: 'Configuration Saved',
        description: 'Bot configuration has been updated successfully.',
      });
    },
  });

  const handleSaveConfig = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    
    const configData = {
      rpcUrl: formData.get('rpcUrl') as string,
      mainWalletPrivateKey: formData.get('privateKey') as string,
      bonkProgramId: formData.get('bonkProgramId') as string,
      pumpProgramId: formData.get('pumpProgramId') as string,
    };

    saveConfigMutation.mutate(configData);
  };

  const getTokenIcon = (type: string) => {
    switch (type) {
      case 'spl': return 'SPL';
      case 'bonkfun': return 'BNK';
      case 'pumpfun': return 'PMP';
      default: return 'TKN';
    }
  };

  const getTokenIconColor = (type: string) => {
    switch (type) {
      case 'spl': return 'bg-emerald-500';
      case 'bonkfun': return 'bg-amber-500';
      case 'pumpfun': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  const getTransactionTypeColor = (type: string) => {
    if (type.includes('swap')) return 'bg-emerald-500/20 text-emerald-400';
    if (type.includes('bond')) return 'bg-amber-500/20 text-amber-400';
    if (type.includes('unbond')) return 'bg-purple-500/20 text-purple-400';
    return 'bg-gray-500/20 text-gray-400';
  };

  const formatTransactionType = (type: string) => {
    if (type.includes('jupiter')) return 'Jupiter Swap';
    if (type.includes('bonk') && type.includes('bond')) return 'Bonk Bond';
    if (type.includes('bonk') && type.includes('unbond')) return 'Bonk Unbond';
    if (type.includes('pump') && type.includes('bond')) return 'Pump Bond';
    if (type.includes('pump') && type.includes('unbond')) return 'Pump Unbond';
    return type;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0f1a] via-[#1a1f2e] to-[#0a0f1a] text-gray-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#1a1f2e] to-[#0f1419] border-b border-cyan-500/20 px-6 py-4 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <Bot className="h-10 w-10 text-cyan-400" />
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 via-emerald-400 to-yellow-400 bg-clip-text text-transparent">
                  Volume Bot
                </h1>
                <p className="text-sm text-cyan-300/80">Solana Volume Bot</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 border border-cyan-500/20 rounded-full backdrop-blur-sm">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50' : 'bg-red-400'}`} />
              <span className="text-sm text-cyan-100">
                {isConnected ? 'Connected to RPC' : 'Disconnected'}
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 px-4 py-2 rounded-lg border border-emerald-500/20">
              <div className="text-sm text-cyan-300">Server Wallet Balance</div>
              <div className="font-bold text-emerald-400 text-lg">{parseFloat(mainWalletBalance).toFixed(2)} SOL</div>
            </div>
            <Button variant="ghost" size="icon" className="hover:bg-cyan-500/10 border border-cyan-500/20">
              <Settings className="h-5 w-5 text-cyan-400" />
            </Button>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-8">
        {/* User Session & Bot Control Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 bg-gradient-to-br from-[#1a1f2e] to-[#0f1419] border-cyan-500/20 shadow-xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white flex items-center space-x-2">
                  <Shield className="h-5 w-5 text-cyan-400" />
                  <span>Server-Side Volume Bot</span>
                </CardTitle>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-cyan-300">Status:</span>
                  <Badge className={botStatus.isRunning ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}>
                    {botStatus.isRunning ? (botStatus.isPaused ? 'Paused' : 'Running') : 'Stopped'}
                  </Badge>
                </div>
              </div>
              <p className="text-sm text-cyan-300/80">
                Secure server-wallet system • No private keys exposed • 25% revenue share • Minimum $20 deposit
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-4">
                <Button 
                  onClick={() => startBotMutation.mutate()}
                  disabled={startBotMutation.isPending || botStatus.isRunning}
                  className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white shadow-lg"
                  data-testid="button-start-bot"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Start Bot
                </Button>
                <Button 
                  onClick={() => stopBotMutation.mutate()}
                  disabled={stopBotMutation.isPending || !botStatus.isRunning}
                  className="bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white"
                  data-testid="button-stop-bot"
                >
                  <Square className="w-4 h-4 mr-2" />
                  Stop Bot
                </Button>
                <Button 
                  onClick={() => pauseBotMutation.mutate()}
                  disabled={pauseBotMutation.isPending || !botStatus.isRunning}
                  className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white"
                  data-testid="button-pause-bot"
                >
                  <Pause className="w-4 h-4 mr-2" />
                  {botStatus.isPaused ? 'Resume' : 'Pause'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Deposit & Revenue Card */}
          <Card className="bg-gradient-to-br from-[#1a1f2e] to-[#0f1419] border-yellow-500/20 shadow-xl">
            <CardHeader>
              <CardTitle className="text-white flex items-center space-x-2">
                <DollarSign className="h-5 w-5 text-yellow-400" />
                <span>Your Session</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="deposit" className="text-cyan-300">Deposit Amount (Min $20)</Label>
                <Input 
                  id="deposit"
                  type="number" 
                  min="20"
                  placeholder="20.00"
                  className="bg-[#0f1419] border-cyan-500/30 text-white placeholder-cyan-300/50"
                  data-testid="input-deposit-amount"
                />
              </div>
              <div className="p-3 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 rounded-lg">
                <div className="text-sm text-yellow-300 mb-1">Revenue Share</div>
                <div className="text-2xl font-bold text-yellow-400">25%</div>
                <div className="text-xs text-yellow-300/80">of all volume generated</div>
              </div>
              <Button className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white">
                <Wallet className="w-4 h-4 mr-2" />
                Create Session
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Metrics Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-gradient-to-br from-[#1a1f2e]/80 to-[#0f1419]/80 border-emerald-500/20 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-emerald-300">Total Transactions</h3>
                <BarChart3 className="h-5 w-5 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-white mb-1" data-testid="text-total-transactions">
                {metrics?.totalTransactions || 0}
              </div>
              <div className="flex items-center text-xs">
                <span className="text-emerald-400">Live</span>
                <span className="text-emerald-300/60 ml-1">updates</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-[#1a1f2e]/80 to-[#0f1419]/80 border-yellow-500/20 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-yellow-300">Volume Generated</h3>
                <Coins className="h-5 w-5 text-yellow-400" />
              </div>
              <div className="text-2xl font-bold text-white mb-1" data-testid="text-volume-generated">
                ${metrics?.volumeGenerated || '0'}
              </div>
              <div className="flex items-center text-xs">
                <span className="text-yellow-400">25%</span>
                <span className="text-yellow-300/60 ml-1">your share</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-[#1a1f2e]/80 to-[#0f1419]/80 border-cyan-500/20 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-cyan-300">Active Tokens</h3>
                <TrendingUp className="h-5 w-5 text-cyan-400" />
              </div>
              <div className="text-2xl font-bold text-white mb-1" data-testid="text-active-tokens">
                {metrics?.activeTokens || 0}
              </div>
              <div className="flex items-center text-xs">
                <span className="text-cyan-300/60">tokens configured</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-[#1a1f2e]/80 to-[#0f1419]/80 border-emerald-500/20 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-emerald-300">Success Rate</h3>
                <CheckCircle className="h-5 w-5 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-white mb-1" data-testid="text-success-rate">
                {metrics && metrics.totalTransactions && metrics.successfulTransactions ? 
                  metrics.totalTransactions > 0 ? 
                    Math.round((metrics.successfulTransactions / metrics.totalTransactions) * 100) + '%' 
                    : '0%'
                  : '0%'
                }
              </div>
              <div className="flex items-center text-xs">
                <span className="text-emerald-400">
                  {metrics?.successfulTransactions || 0}/{metrics?.totalTransactions || 0} successful
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Token Configuration & Live Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-gradient-to-br from-[#1a1f2e]/80 to-[#0f1419]/80 border-cyan-500/20 backdrop-blur-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white flex items-center space-x-2">
                  <Coins className="h-5 w-5 text-cyan-400" />
                  <span>Active Tokens</span>
                </CardTitle>
                <Button size="sm" className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600" data-testid="button-add-token">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Token
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {tokens.map((token) => (
                  <div key={token.id} className="flex items-center justify-between p-3 bg-gradient-to-r from-[#0f1419] to-[#1a1f2e] border border-cyan-500/10 rounded-lg" data-testid={`token-${token.id}`}>
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 ${getTokenIconColor(token.type)} rounded-full flex items-center justify-center text-xs font-bold text-white shadow-lg`}>
                        {getTokenIcon(token.type)}
                      </div>
                      <div>
                        <div className="font-medium text-white">{token.name}</div>
                        <div className="text-xs text-cyan-300/60 capitalize">{token.type} token</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${token.isActive ? 'bg-emerald-400 shadow-lg shadow-emerald-400/50' : 'bg-yellow-400'}`} />
                      <span className="text-xs text-cyan-300/80">{token.isActive ? 'Active' : 'Paused'}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-cyan-500/10">
                        <MoreVertical className="w-3 h-3 text-cyan-400" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-[#1a1f2e]/80 to-[#0f1419]/80 border-emerald-500/20 backdrop-blur-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white flex items-center space-x-2">
                  <BarChart3 className="h-5 w-5 text-emerald-400" />
                  <span>Live Activity</span>
                </CardTitle>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50' : 'bg-red-400'}`} />
                  <span className="text-xs text-emerald-300">Live</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {transactions.slice(0, 5).map((tx) => (
                  <div key={tx.id} className="flex items-start space-x-3 p-3 bg-gradient-to-r from-[#0f1419] to-[#1a1f2e] border border-emerald-500/10 rounded-lg" data-testid={`activity-${tx.id}`}>
                    <div className={`w-8 h-8 ${tx.status === 'success' ? 'bg-gradient-to-r from-emerald-500 to-cyan-500' : 'bg-gradient-to-r from-red-500 to-orange-500'} rounded-full flex items-center justify-center flex-shrink-0 shadow-lg`}>
                      {tx.status === 'success' ? '✓' : '✗'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white mb-1">{formatTransactionType(tx.type)}</div>
                      <div className="text-xs text-cyan-300/60 mb-1 font-mono">
                        {tx.walletAddress.slice(0, 8)}...{tx.walletAddress.slice(-6)}
                      </div>
                      {tx.signature && (
                        <a 
                          href={`https://solscan.io/tx/${tx.signature}`}
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center"
                        >
                          View on Solscan <ExternalLink className="w-3 h-3 ml-1" />
                        </a>
                      )}
                    </div>
                    <div className="text-xs text-cyan-300/40">
                      {new Date(tx.timestamp!).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
                {transactions.length === 0 && (
                  <div className="text-center py-8 text-cyan-300/60">
                    <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-50 text-emerald-400" />
                    <p>No transactions yet</p>
                    <p className="text-xs">Create a session and start the bot to see activity</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Transaction History */}
        <Card className="bg-gradient-to-br from-[#1a1f2e]/80 to-[#0f1419]/80 border-cyan-500/20 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-white flex items-center space-x-2">
                <BarChart3 className="h-5 w-5 text-cyan-400" />
                <span>Recent Transactions</span>
              </CardTitle>
              <div className="flex items-center space-x-2">
                <Button variant="ghost" size="sm" className="hover:bg-cyan-500/10 border border-cyan-500/20" data-testid="button-filter">
                  <Filter className="w-4 h-4 mr-1 text-cyan-400" />
                  Filter
                </Button>
                <Button variant="ghost" size="sm" className="hover:bg-emerald-500/10 border border-emerald-500/20" data-testid="button-export">
                  <Download className="w-4 h-4 mr-1 text-emerald-400" />
                  Export
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-cyan-500/20">
                    <th className="text-left text-xs font-medium text-cyan-300 uppercase tracking-wider py-3">Time</th>
                    <th className="text-left text-xs font-medium text-cyan-300 uppercase tracking-wider py-3">Type</th>
                    <th className="text-left text-xs font-medium text-cyan-300 uppercase tracking-wider py-3">Wallet</th>
                    <th className="text-left text-xs font-medium text-cyan-300 uppercase tracking-wider py-3">Status</th>
                    <th className="text-left text-xs font-medium text-cyan-300 uppercase tracking-wider py-3">Transaction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/10">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gradient-to-r hover:from-cyan-500/5 hover:to-emerald-500/5 transition-colors" data-testid={`transaction-${tx.id}`}>
                      <td className="py-3 text-sm text-cyan-100">
                        {new Date(tx.timestamp!).toLocaleTimeString()}
                      </td>
                      <td className="py-3">
                        <Badge className={getTransactionTypeColor(tx.type)}>
                          {formatTransactionType(tx.type)}
                        </Badge>
                      </td>
                      <td className="py-3 text-sm text-cyan-200 font-mono">
                        {tx.walletAddress.slice(0, 8)}...{tx.walletAddress.slice(-6)}
                      </td>
                      <td className="py-3">
                        <Badge className={tx.status === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}>
                          {tx.status}
                        </Badge>
                      </td>
                      <td className="py-3">
                        {tx.signature ? (
                          <a 
                            href={`https://solscan.io/tx/${tx.signature}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-400 hover:text-emerald-300 text-sm flex items-center"
                          >
                            View on Solscan <ExternalLink className="w-3 h-3 ml-1" />
                          </a>
                        ) : (
                          <span className="text-cyan-300/40 text-sm">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Configuration Panel */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Environment Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveConfig} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="rpcUrl" className="text-gray-300">RPC URL</Label>
                  <Input
                    id="rpcUrl"
                    name="rpcUrl"
                    type="text"
                    defaultValue={config?.rpcUrl || ''}
                    placeholder="https://api.mainnet-beta.solana.com"
                    className="bg-slate-700 border-slate-600 text-white"
                    data-testid="input-rpc-url"
                  />
                </div>
                <div>
                  <Label htmlFor="privateKey" className="text-gray-300">Main Wallet Private Key</Label>
                  <Input
                    id="privateKey"
                    name="privateKey"
                    type="password"
                    defaultValue={config?.mainWalletPrivateKey || ''}
                    placeholder="•••••••••••••••••••••••••••••"
                    className="bg-slate-700 border-slate-600 text-white"
                    data-testid="input-private-key"
                  />
                </div>
                <div>
                  <Label htmlFor="bonkProgramId" className="text-gray-300">Bonk.fun Program ID</Label>
                  <Input
                    id="bonkProgramId"
                    name="bonkProgramId"
                    type="text"
                    defaultValue={config?.bonkProgramId || ''}
                    placeholder="BoNkFuNDt6zZctyPNP83z3sZC2RfTS9j5AUbGSmG31X2"
                    className="bg-slate-700 border-slate-600 text-white font-mono text-sm"
                    data-testid="input-bonk-program-id"
                  />
                </div>
                <div>
                  <Label htmlFor="pumpProgramId" className="text-gray-300">Pump.fun Program ID</Label>
                  <Input
                    id="pumpProgramId"
                    name="pumpProgramId"
                    type="text"
                    defaultValue={config?.pumpProgramId || ''}
                    placeholder="PUmpFunD1111111111111111111111111111111111"
                    className="bg-slate-700 border-slate-600 text-white font-mono text-sm"
                    data-testid="input-pump-program-id"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button 
                  type="submit" 
                  disabled={saveConfigMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700"
                  data-testid="button-save-config"
                >
                  {saveConfigMutation.isPending ? 'Saving...' : 'Save Configuration'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
