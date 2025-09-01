import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  Shield, 
  Database, 
  Clock, 
  RefreshCw, 
  Download, 
  Upload, 
  Settings,
  AlertTriangle,
  CheckCircle,
  HardDrive,
  Activity
} from 'lucide-react';

interface BackupMetadata {
  timestamp: string;
  type: 'full' | 'incremental';
  size: number;
  checksum: string;
  sessionCount: number;
  transactionCount: number;
}

interface BackupStatus {
  status: string;
  backupService: {
    backupCount: number;
    lastBackup: string | null;
    nextBackup: string;
    diskUsage: number;
    isEnabled: boolean;
  };
}

interface RecoverySession {
  id: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  backupTimestamp: string;
  progress: {
    currentStep: string;
    totalSteps: number;
    completedSteps: number;
  };
  errors: string[];
}

export default function BackupDashboard() {
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [backups, setBackups] = useState<BackupMetadata[]>([]);
  const [recovery, setRecovery] = useState<RecoverySession | null>(null);
  const [selectedBackup, setSelectedBackup] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [config, setConfig] = useState({
    enabled: true,
    interval: 30,
    retention: 24
  });
  
  const { toast } = useToast();

  useEffect(() => {
    loadBackupStatus();
    loadBackupList();
    loadRecoveryStatus();
    
    // Poll for updates every 10 seconds
    const interval = setInterval(() => {
      loadBackupStatus();
      loadRecoveryStatus();
    }, 10000);
    
    return () => clearInterval(interval);
  }, []);

  const loadBackupStatus = async () => {
    try {
      const response = await fetch('/api/backup/status');
      const data = await response.json();
      setBackupStatus(data);
      setConfig({
        enabled: data.backupService.isEnabled,
        interval: 30, // Default, would need to be returned from API
        retention: 24  // Default, would need to be returned from API
      });
    } catch (error) {
      console.error('Failed to load backup status:', error);
    }
  };

  const loadBackupList = async () => {
    try {
      const response = await fetch('/api/backup/list');
      const data = await response.json();
      setBackups(data.backups);
    } catch (error) {
      console.error('Failed to load backup list:', error);
    }
  };

  const loadRecoveryStatus = async () => {
    try {
      const response = await fetch('/api/recovery/status');
      const data = await response.json();
      setRecovery(data.activeRecovery);
    } catch (error) {
      console.error('Failed to load recovery status:', error);
    }
  };

  const createBackup = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/backup/create', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Backup Created",
          description: "System backup completed successfully"
        });
        loadBackupList();
        loadBackupStatus();
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      toast({
        title: "Backup Failed",
        description: error.message || "Failed to create backup",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const createEmergencyBackup = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/recovery/emergency-backup', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Emergency Backup Created",
          description: `Backup created: ${data.backupTimestamp}`
        });
        loadBackupList();
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      toast({
        title: "Emergency Backup Failed",
        description: error.message || "Failed to create emergency backup",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const initiateRecovery = async () => {
    if (!selectedBackup) {
      toast({
        title: "No Backup Selected",
        description: "Please select a backup to restore from",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/recovery/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backupTimestamp: selectedBackup,
          restoreDatabase: true,
          restoreSessions: true,
          restoreConfig: true
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Recovery Initiated",
          description: "System recovery has started"
        });
        setRecovery(data.recovery);
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      toast({
        title: "Recovery Failed",
        description: error.message || "Failed to initiate recovery",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateConfig = async () => {
    try {
      const response = await fetch('/api/backup/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Configuration Updated",
          description: "Backup settings have been saved"
        });
        loadBackupStatus();
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update configuration",
        variant: "destructive"
      });
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-500/10 via-slate-900 to-emerald-500/20 relative overflow-hidden">
      {/* Animated Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/5 via-transparent to-emerald-400/10 animate-pulse" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-br from-cyan-400/20 to-emerald-400/20 rounded-full blur-3xl animate-pulse" />
      
      <div className="container mx-auto px-6 py-8 relative z-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-300 via-emerald-300 to-yellow-300 bg-clip-text text-transparent">
            Backup & Recovery Center
          </h1>
          <p className="text-cyan-200/80 mt-2">Automated system protection and data recovery</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
          {/* System Status */}
          <Card className="bg-slate-900/70 border-cyan-400/30 backdrop-blur-xl shadow-2xl shadow-cyan-500/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-cyan-300">
                <Shield className="w-5 h-5" />
                System Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {backupStatus && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Backup Service:</span>
                    <Badge variant={backupStatus.backupService.isEnabled ? "default" : "destructive"}>
                      {backupStatus.backupService.isEnabled ? 'Active' : 'Disabled'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Total Backups:</span>
                    <span className="text-emerald-400 font-semibold">
                      {backupStatus.backupService.backupCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Disk Usage:</span>
                    <span className="text-yellow-400 font-semibold">
                      {formatBytes(backupStatus.backupService.diskUsage)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">
                    Last backup: {backupStatus.backupService.lastBackup 
                      ? formatDate(backupStatus.backupService.lastBackup)
                      : 'Never'
                    }
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="bg-slate-900/70 border-emerald-400/30 backdrop-blur-xl shadow-2xl shadow-emerald-500/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-emerald-300">
                <Activity className="w-5 h-5" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={createBackup}
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600"
                data-testid="button-create-backup"
              >
                <Download className="w-4 h-4 mr-2" />
                {isLoading ? 'Creating...' : 'Create Backup'}
              </Button>
              
              <Button
                onClick={createEmergencyBackup}
                disabled={isLoading}
                variant="outline"
                className="w-full border-yellow-400/30 text-yellow-300 hover:bg-yellow-400/10"
                data-testid="button-emergency-backup"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Emergency Backup
              </Button>
            </CardContent>
          </Card>

          {/* Recovery Status */}
          <Card className="bg-slate-900/70 border-yellow-400/30 backdrop-blur-xl shadow-2xl shadow-yellow-500/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-300">
                <RefreshCw className="w-5 h-5" />
                Recovery Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recovery ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Status:</span>
                    <Badge variant={recovery.status === 'completed' ? 'default' : 
                                   recovery.status === 'failed' ? 'destructive' : 'secondary'}>
                      {recovery.status}
                    </Badge>
                  </div>
                  
                  {recovery.status === 'in-progress' && (
                    <div className="space-y-2">
                      <div className="text-sm text-slate-300">
                        {recovery.progress.currentStep}
                      </div>
                      <Progress 
                        value={(recovery.progress.completedSteps / recovery.progress.totalSteps) * 100}
                        className="h-2"
                      />
                      <div className="text-xs text-slate-400">
                        {recovery.progress.completedSteps} of {recovery.progress.totalSteps} steps
                      </div>
                    </div>
                  )}
                  
                  <div className="text-xs text-slate-400">
                    Started: {formatDate(recovery.startTime)}
                  </div>
                </div>
              ) : (
                <div className="text-slate-400 text-center py-4">
                  No active recovery session
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Configuration Panel */}
        <Card className="bg-slate-900/70 border-cyan-400/30 backdrop-blur-xl shadow-2xl shadow-cyan-500/10 mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-cyan-300">
              <Settings className="w-5 h-5" />
              Backup Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-center justify-between">
                <Label htmlFor="backup-enabled" className="text-slate-300">
                  Automated Backups
                </Label>
                <Switch
                  id="backup-enabled"
                  checked={config.enabled}
                  onCheckedChange={(checked) => setConfig(prev => ({ ...prev, enabled: checked }))}
                />
              </div>
              
              <div>
                <Label htmlFor="backup-interval" className="text-slate-300">
                  Interval (minutes)
                </Label>
                <Input
                  id="backup-interval"
                  type="number"
                  value={config.interval}
                  onChange={(e) => setConfig(prev => ({ ...prev, interval: parseInt(e.target.value) }))}
                  className="mt-1 bg-slate-800/60 border-cyan-400/30 text-white"
                />
              </div>
              
              <div>
                <Label htmlFor="backup-retention" className="text-slate-300">
                  Retention (count)
                </Label>
                <Input
                  id="backup-retention"
                  type="number"
                  value={config.retention}
                  onChange={(e) => setConfig(prev => ({ ...prev, retention: parseInt(e.target.value) }))}
                  className="mt-1 bg-slate-800/60 border-cyan-400/30 text-white"
                />
              </div>
            </div>
            
            <Button
              onClick={updateConfig}
              className="mt-4 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600"
              data-testid="button-update-config"
            >
              Update Configuration
            </Button>
          </CardContent>
        </Card>

        {/* Backup List & Recovery */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Available Backups */}
          <Card className="bg-slate-900/70 border-emerald-400/30 backdrop-blur-xl shadow-2xl shadow-emerald-500/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-emerald-300">
                <Database className="w-5 h-5" />
                Available Backups
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {backups.map((backup) => (
                  <div
                    key={backup.timestamp}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedBackup === backup.timestamp
                        ? 'border-emerald-400 bg-emerald-400/10'
                        : 'border-slate-600 hover:border-emerald-400/50 hover:bg-emerald-400/5'
                    }`}
                    onClick={() => setSelectedBackup(backup.timestamp)}
                    data-testid={`backup-item-${backup.timestamp}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-300">
                        {formatDate(backup.timestamp)}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {backup.type}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs text-slate-400">
                      <div>Size: {formatBytes(backup.size)}</div>
                      <div>Sessions: {backup.sessionCount}</div>
                      <div>Transactions: {backup.transactionCount}</div>
                    </div>
                  </div>
                ))}
                
                {backups.length === 0 && (
                  <div className="text-center text-slate-400 py-8">
                    No backups available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recovery Controls */}
          <Card className="bg-slate-900/70 border-yellow-400/30 backdrop-blur-xl shadow-2xl shadow-yellow-500/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-300">
                <Upload className="w-5 h-5" />
                System Recovery
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedBackup ? (
                <div className="space-y-4">
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Recovery will replace current system data with the selected backup.
                      An emergency backup will be created automatically.
                    </AlertDescription>
                  </Alert>
                  
                  <div className="text-sm text-slate-300">
                    Selected backup: {formatDate(selectedBackup)}
                  </div>
                  
                  <Button
                    onClick={initiateRecovery}
                    disabled={isLoading || (recovery && recovery.status === 'in-progress')}
                    className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600"
                    data-testid="button-initiate-recovery"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {isLoading ? 'Initiating...' : 'Initiate Recovery'}
                  </Button>
                </div>
              ) : (
                <div className="text-center text-slate-400 py-8">
                  Select a backup to enable recovery options
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}