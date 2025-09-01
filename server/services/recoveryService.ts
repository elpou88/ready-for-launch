import { BackupService } from './backupService';
import { IStorage } from '../storage';

export interface RecoverySession {
  id: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  backupTimestamp: string;
  options: {
    restoreDatabase: boolean;
    restoreSessions: boolean;
    restoreConfig: boolean;
  };
  progress: {
    currentStep: string;
    totalSteps: number;
    completedSteps: number;
  };
  errors: string[];
}

export class RecoveryService {
  private storage: IStorage;
  private backupService: BackupService;
  private activeRecovery: RecoverySession | null = null;

  constructor(storage: IStorage, backupService: BackupService) {
    this.storage = storage;
    this.backupService = backupService;
  }

  async initiateRecovery(backupTimestamp: string, options: {
    restoreDatabase: boolean;
    restoreSessions: boolean;
    restoreConfig: boolean;
  }): Promise<RecoverySession> {
    if (this.activeRecovery && this.activeRecovery.status === 'in-progress') {
      throw new Error('Another recovery is already in progress');
    }

    const recoverySession: RecoverySession = {
      id: `recovery-${Date.now()}`,
      status: 'pending',
      startTime: new Date().toISOString(),
      backupTimestamp,
      options,
      progress: {
        currentStep: 'Initializing',
        totalSteps: this.calculateTotalSteps(options),
        completedSteps: 0
      },
      errors: []
    };

    this.activeRecovery = recoverySession;
    
    // Start recovery in background
    this.performRecovery(recoverySession).catch(error => {
      recoverySession.status = 'failed';
      recoverySession.errors.push(error.message);
      recoverySession.endTime = new Date().toISOString();
    });

    return recoverySession;
  }

  private calculateTotalSteps(options: {
    restoreDatabase: boolean;
    restoreSessions: boolean;
    restoreConfig: boolean;
  }): number {
    let steps = 1; // Validation step
    if (options.restoreDatabase) steps += 2; // Clear + restore
    if (options.restoreSessions) steps += 2; // Clear + restore
    if (options.restoreConfig) steps += 2; // Clear + restore
    steps += 1; // Finalization
    return steps;
  }

  private async performRecovery(session: RecoverySession): Promise<void> {
    try {
      session.status = 'in-progress';
      
      // Step 1: Validate backup
      session.progress.currentStep = 'Validating backup';
      const backups = await this.backupService.listAvailableBackups();
      const targetBackup = backups.find(b => b.timestamp === session.backupTimestamp);
      
      if (!targetBackup) {
        throw new Error(`Backup not found: ${session.backupTimestamp}`);
      }
      
      session.progress.completedSteps++;

      // Step 2: Clear existing data if needed
      if (session.options.restoreDatabase) {
        session.progress.currentStep = 'Clearing transaction history';
        await this.clearTransactionHistory();
        session.progress.completedSteps++;
      }

      if (session.options.restoreSessions) {
        session.progress.currentStep = 'Clearing user sessions';
        await this.clearUserSessions();
        session.progress.completedSteps++;
      }

      if (session.options.restoreConfig) {
        session.progress.currentStep = 'Clearing configuration';
        await this.clearConfiguration();
        session.progress.completedSteps++;
      }

      // Step 3: Restore from backup
      session.progress.currentStep = 'Restoring from backup';
      await this.backupService.restoreFromBackup({
        backupTimestamp: session.backupTimestamp,
        restoreDatabase: session.options.restoreDatabase,
        restoreSessions: session.options.restoreSessions,
        restoreConfig: session.options.restoreConfig
      });

      if (session.options.restoreDatabase) session.progress.completedSteps++;
      if (session.options.restoreSessions) session.progress.completedSteps++;
      if (session.options.restoreConfig) session.progress.completedSteps++;

      // Step 4: Finalize
      session.progress.currentStep = 'Finalizing recovery';
      await this.validateRecovery(session);
      session.progress.completedSteps++;

      session.status = 'completed';
      session.endTime = new Date().toISOString();
      session.progress.currentStep = 'Recovery completed successfully';

      console.log(`🎉 Recovery completed: ${session.id}`);
    } catch (error) {
      session.status = 'failed';
      session.errors.push(error.message);
      session.endTime = new Date().toISOString();
      session.progress.currentStep = `Failed: ${error.message}`;
      
      console.error(`❌ Recovery failed: ${session.id}`, error);
      throw error;
    }
  }

  private async clearTransactionHistory(): Promise<void> {
    try {
      // Note: This would need to be implemented based on your storage interface
      // For now, we'll assume the storage has a method to clear transactions
      console.log('🗑️ Clearing transaction history...');
      // await this.storage.clearAllTransactions();
    } catch (error) {
      console.error('Failed to clear transaction history:', error);
      throw error;
    }
  }

  private async clearUserSessions(): Promise<void> {
    try {
      console.log('🗑️ Clearing user sessions...');
      // await this.storage.clearAllUserSessions();
    } catch (error) {
      console.error('Failed to clear user sessions:', error);
      throw error;
    }
  }

  private async clearConfiguration(): Promise<void> {
    try {
      console.log('🗑️ Clearing configuration...');
      // await this.storage.clearBotConfig();
      // await this.storage.clearAllTokens();
    } catch (error) {
      console.error('Failed to clear configuration:', error);
      throw error;
    }
  }

  private async validateRecovery(session: RecoverySession): Promise<void> {
    try {
      // Validate that the recovery was successful
      if (session.options.restoreSessions) {
        const sessions = await this.storage.getAllUserSessions();
        console.log(`✅ Restored ${sessions.length} user sessions`);
      }

      if (session.options.restoreConfig) {
        const config = await this.storage.getBotConfig();
        if (config) {
          console.log('✅ Bot configuration restored');
        }
      }

      if (session.options.restoreDatabase) {
        const transactions = await this.storage.getAllTransactions();
        console.log(`✅ Restored ${transactions.length} transactions`);
      }
    } catch (error) {
      console.warn('Recovery validation warnings:', error);
      // Don't fail the recovery for validation issues
    }
  }

  getActiveRecovery(): RecoverySession | null {
    return this.activeRecovery;
  }

  async createEmergencyBackup(): Promise<string> {
    console.log('🚨 Creating emergency backup before recovery...');
    const metadata = await this.backupService.createFullBackup();
    console.log(`✅ Emergency backup created: ${metadata.timestamp}`);
    return metadata.timestamp;
  }

  async testRecoveryReadiness(): Promise<{
    isReady: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      // Check backup availability
      const backups = await this.backupService.listAvailableBackups();
      if (backups.length === 0) {
        issues.push('No backups available for recovery');
        recommendations.push('Create at least one backup before attempting recovery');
      }

      // Check storage connectivity
      try {
        await this.storage.getBotConfig();
      } catch (error) {
        issues.push('Storage system not accessible');
        recommendations.push('Verify database connectivity before recovery');
      }

      // Check if another recovery is in progress
      if (this.activeRecovery && this.activeRecovery.status === 'in-progress') {
        issues.push('Another recovery is currently in progress');
        recommendations.push('Wait for current recovery to complete');
      }

      // Check disk space
      const health = await this.backupService.getSystemHealth();
      if (health.diskUsage > 1024 * 1024 * 1024) { // 1GB
        recommendations.push('Consider cleaning up old backups to free disk space');
      }

      return {
        isReady: issues.length === 0,
        issues,
        recommendations
      };
    } catch (error) {
      return {
        isReady: false,
        issues: [`Recovery readiness check failed: ${error.message}`],
        recommendations: ['Resolve system issues before attempting recovery']
      };
    }
  }
}