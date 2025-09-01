import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { IStorage } from '../storage';

export interface BackupConfig {
  enabled: boolean;
  interval: number; // in minutes
  retention: number; // number of backups to keep
  backupPath: string;
  compressionEnabled: boolean;
}

export interface BackupMetadata {
  timestamp: string;
  type: 'full' | 'incremental';
  size: number;
  checksum: string;
  sessionCount: number;
  transactionCount: number;
}

export interface RecoveryOptions {
  backupTimestamp: string;
  restoreDatabase: boolean;
  restoreSessions: boolean;
  restoreConfig: boolean;
}

export class BackupService {
  private storage: IStorage;
  private config: BackupConfig;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(storage: IStorage) {
    this.storage = storage;
    this.config = {
      enabled: true,
      interval: 30, // 30 minutes
      retention: 24, // keep 24 backups (12 hours)
      backupPath: './backups',
      compressionEnabled: true
    };
  }

  async initialize(): Promise<void> {
    console.log('🔄 Initializing Backup Service...');
    
    // Create backup directory
    await this.ensureBackupDirectory();
    
    // Load existing backup config if available
    await this.loadConfig();
    
    // Start automated backups if enabled
    if (this.config.enabled) {
      await this.startAutomatedBackups();
      console.log(`✅ Automated backups enabled (${this.config.interval}min intervals)`);
    }

    // Cleanup old backups on startup
    await this.cleanupOldBackups();
  }

  private async ensureBackupDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.config.backupPath, { recursive: true });
      await fs.mkdir(path.join(this.config.backupPath, 'sessions'), { recursive: true });
      await fs.mkdir(path.join(this.config.backupPath, 'config'), { recursive: true });
      await fs.mkdir(path.join(this.config.backupPath, 'database'), { recursive: true });
    } catch (error) {
      console.error('Failed to create backup directories:', error);
      throw error;
    }
  }

  private async loadConfig(): Promise<void> {
    try {
      const configPath = path.join(this.config.backupPath, 'backup-config.json');
      const configData = await fs.readFile(configPath, 'utf-8');
      const savedConfig = JSON.parse(configData);
      this.config = { ...this.config, ...savedConfig };
    } catch (error) {
      // Config doesn't exist, use defaults
      await this.saveConfig();
    }
  }

  private async saveConfig(): Promise<void> {
    const configPath = path.join(this.config.backupPath, 'backup-config.json');
    await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
  }

  async createFullBackup(): Promise<BackupMetadata> {
    console.log('📦 Creating full system backup...');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(this.config.backupPath, `backup-${timestamp}`);
    
    await fs.mkdir(backupDir, { recursive: true });

    try {
      // Backup user sessions
      const sessions = await this.storage.getAllUserSessions();
      await fs.writeFile(
        path.join(backupDir, 'sessions.json'),
        JSON.stringify(sessions, null, 2)
      );

      // Backup bot configurations
      const botConfig = await this.storage.getBotConfig();
      await fs.writeFile(
        path.join(backupDir, 'bot-config.json'),
        JSON.stringify(botConfig, null, 2)
      );

      // Backup tokens
      const tokens = await this.storage.getTokens();
      await fs.writeFile(
        path.join(backupDir, 'tokens.json'),
        JSON.stringify(tokens, null, 2)
      );

      // Backup transactions
      const transactions = await this.storage.getAllTransactions();
      await fs.writeFile(
        path.join(backupDir, 'transactions.json'),
        JSON.stringify(transactions, null, 2)
      );

      // Create metadata
      const metadata: BackupMetadata = {
        timestamp,
        type: 'full',
        size: await this.calculateBackupSize(backupDir),
        checksum: await this.calculateChecksum(backupDir),
        sessionCount: sessions.length,
        transactionCount: transactions.length
      };

      // Save metadata
      await fs.writeFile(
        path.join(backupDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      );

      // Compress if enabled
      if (this.config.compressionEnabled) {
        await this.compressBackup(backupDir);
      }

      console.log(`✅ Full backup created: ${timestamp}`);
      console.log(`📊 Sessions: ${metadata.sessionCount}, Transactions: ${metadata.transactionCount}`);
      
      return metadata;
    } catch (error) {
      console.error('❌ Backup creation failed:', error);
      // Cleanup partial backup
      await fs.rmdir(backupDir, { recursive: true }).catch(() => {});
      throw error;
    }
  }

  async restoreFromBackup(options: RecoveryOptions): Promise<void> {
    console.log(`🔄 Starting system recovery from backup: ${options.backupTimestamp}`);
    
    const backupDir = path.join(this.config.backupPath, `backup-${options.backupTimestamp}`);
    
    // Verify backup exists
    try {
      await fs.access(backupDir);
    } catch (error) {
      throw new Error(`Backup not found: ${options.backupTimestamp}`);
    }

    // Load metadata
    const metadata = await this.loadBackupMetadata(backupDir);
    console.log(`📋 Backup info: ${metadata.type}, ${metadata.sessionCount} sessions, ${metadata.transactionCount} transactions`);

    try {
      if (options.restoreSessions) {
        console.log('🔄 Restoring user sessions...');
        const sessions = JSON.parse(await fs.readFile(path.join(backupDir, 'sessions.json'), 'utf-8'));
        for (const session of sessions) {
          await this.storage.createUserSession(session);
        }
        console.log(`✅ Restored ${sessions.length} user sessions`);
      }

      if (options.restoreConfig) {
        console.log('🔄 Restoring bot configuration...');
        const botConfig = JSON.parse(await fs.readFile(path.join(backupDir, 'bot-config.json'), 'utf-8'));
        if (botConfig) {
          await this.storage.createOrUpdateBotConfig(botConfig);
          console.log('✅ Bot configuration restored');
        }

        // Restore tokens
        const tokens = JSON.parse(await fs.readFile(path.join(backupDir, 'tokens.json'), 'utf-8'));
        for (const token of tokens) {
          await this.storage.createToken(token);
        }
        console.log(`✅ Restored ${tokens.length} tokens`);
      }

      if (options.restoreDatabase) {
        console.log('🔄 Restoring transaction history...');
        const transactions = JSON.parse(await fs.readFile(path.join(backupDir, 'transactions.json'), 'utf-8'));
        for (const transaction of transactions) {
          await this.storage.createTransaction(transaction);
        }
        console.log(`✅ Restored ${transactions.length} transactions`);
      }

      console.log('🎉 System recovery completed successfully!');
    } catch (error) {
      console.error('❌ Recovery failed:', error);
      throw error;
    }
  }

  async listAvailableBackups(): Promise<BackupMetadata[]> {
    const backups: BackupMetadata[] = [];
    
    try {
      const entries = await fs.readdir(this.config.backupPath);
      const backupDirs = entries.filter(entry => entry.startsWith('backup-'));
      
      for (const dir of backupDirs) {
        try {
          const metadata = await this.loadBackupMetadata(path.join(this.config.backupPath, dir));
          backups.push(metadata);
        } catch (error) {
          console.warn(`Skipping invalid backup: ${dir}`);
        }
      }
    } catch (error) {
      console.error('Failed to list backups:', error);
    }

    return backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  private async loadBackupMetadata(backupDir: string): Promise<BackupMetadata> {
    const metadataPath = path.join(backupDir, 'metadata.json');
    const data = await fs.readFile(metadataPath, 'utf-8');
    return JSON.parse(data);
  }

  private async calculateBackupSize(backupDir: string): Promise<number> {
    let totalSize = 0;
    const files = await fs.readdir(backupDir);
    
    for (const file of files) {
      const filePath = path.join(backupDir, file);
      const stats = await fs.stat(filePath);
      totalSize += stats.size;
    }
    
    return totalSize;
  }

  private async calculateChecksum(backupDir: string): Promise<string> {
    try {
      // Simple checksum using file sizes and names
      const files = await fs.readdir(backupDir);
      let checksumData = '';
      
      for (const file of files.sort()) {
        const filePath = path.join(backupDir, file);
        const stats = await fs.stat(filePath);
        checksumData += `${file}:${stats.size}:${stats.mtime.getTime()};`;
      }
      
      // Create hash
      const crypto = require('crypto');
      return crypto.createHash('sha256').update(checksumData).digest('hex').substring(0, 16);
    } catch (error) {
      return 'unknown';
    }
  }

  private async compressBackup(backupDir: string): Promise<void> {
    try {
      const archiveName = `${path.basename(backupDir)}.tar.gz`;
      const archivePath = path.join(path.dirname(backupDir), archiveName);
      
      execSync(`tar -czf "${archivePath}" -C "${path.dirname(backupDir)}" "${path.basename(backupDir)}"`);
      
      // Remove uncompressed directory
      await fs.rmdir(backupDir, { recursive: true });
      
      console.log(`📦 Backup compressed: ${archiveName}`);
    } catch (error) {
      console.warn('Compression failed, keeping uncompressed backup:', error.message);
    }
  }

  private startAutomatedBackups(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(async () => {
      try {
        await this.createFullBackup();
        await this.cleanupOldBackups();
      } catch (error) {
        console.error('Automated backup failed:', error);
      }
    }, this.config.interval * 60 * 1000);
  }

  private async cleanupOldBackups(): Promise<void> {
    try {
      const backups = await this.listAvailableBackups();
      
      if (backups.length > this.config.retention) {
        const backupsToDelete = backups.slice(this.config.retention);
        
        for (const backup of backupsToDelete) {
          const backupPath = path.join(this.config.backupPath, `backup-${backup.timestamp}`);
          const compressedPath = `${backupPath}.tar.gz`;
          
          try {
            // Try to delete compressed version first
            await fs.unlink(compressedPath);
          } catch {
            // If compressed doesn't exist, try uncompressed
            try {
              await fs.rmdir(backupPath, { recursive: true });
            } catch (error) {
              console.warn(`Failed to delete backup: ${backup.timestamp}`);
            }
          }
        }
        
        console.log(`🧹 Cleaned up ${backupsToDelete.length} old backups`);
      }
    } catch (error) {
      console.warn('Backup cleanup failed:', error);
    }
  }

  async updateConfig(newConfig: Partial<BackupConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    await this.saveConfig();
    
    // Restart automated backups with new config
    if (this.config.enabled) {
      this.startAutomatedBackups();
    } else if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    console.log('🔧 Backup configuration updated');
  }

  getConfig(): BackupConfig {
    return { ...this.config };
  }

  async getSystemHealth(): Promise<{
    backupCount: number;
    lastBackup: string | null;
    nextBackup: string;
    diskUsage: number;
    isEnabled: boolean;
  }> {
    const backups = await this.listAvailableBackups();
    const lastBackup = backups.length > 0 ? backups[0].timestamp : null;
    const nextBackup = this.config.enabled 
      ? new Date(Date.now() + this.config.interval * 60 * 1000).toISOString()
      : 'Disabled';

    // Calculate disk usage
    let diskUsage = 0;
    try {
      const entries = await fs.readdir(this.config.backupPath);
      for (const entry of entries) {
        const entryPath = path.join(this.config.backupPath, entry);
        const stats = await fs.stat(entryPath);
        if (stats.isFile()) {
          diskUsage += stats.size;
        } else if (stats.isDirectory()) {
          diskUsage += await this.calculateBackupSize(entryPath);
        }
      }
    } catch (error) {
      console.warn('Failed to calculate disk usage:', error);
    }

    return {
      backupCount: backups.length,
      lastBackup,
      nextBackup,
      diskUsage,
      isEnabled: this.config.enabled
    };
  }

  async shutdown(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('🔄 Backup service shutdown complete');
  }
}