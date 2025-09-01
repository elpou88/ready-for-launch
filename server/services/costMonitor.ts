import fs from 'fs/promises';

interface CostMonitorConfig {
  maxDailyCost: number;
  checkIntervalMinutes: number;
  costTrackingFile: string;
}

interface CostData {
  date: string;
  estimatedCost: number;
  sessionsCount: number;
  transactionsCount: number;
  lastReset: string;
}

export class CostMonitor {
  private config: CostMonitorConfig;
  private isMonitoring: boolean = false;
  private monitoringInterval?: NodeJS.Timeout;

  constructor() {
    this.config = {
      maxDailyCost: 20.0, // $20 daily limit
      checkIntervalMinutes: 10, // Check every 10 minutes
      costTrackingFile: './cost_tracking.json'
    };
  }

  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) return;

    console.log(`💰 COST MONITOR STARTED - Daily limit: $${this.config.maxDailyCost}`);
    this.isMonitoring = true;

    // Check immediately
    await this.checkCosts();

    // Set up periodic checking
    this.monitoringInterval = setInterval(async () => {
      await this.checkCosts();
    }, this.config.checkIntervalMinutes * 60 * 1000);
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    this.isMonitoring = false;
    console.log(`💰 COST MONITOR STOPPED`);
  }

  private async checkCosts(): Promise<void> {
    try {
      const costData = await this.loadCostData();
      const today = new Date().toISOString().split('T')[0];

      // Reset costs if it's a new day
      if (costData.date !== today) {
        costData.date = today;
        costData.estimatedCost = 0;
        costData.sessionsCount = 0;
        costData.transactionsCount = 0;
        costData.lastReset = new Date().toISOString();
        await this.saveCostData(costData);
        console.log(`📅 Cost tracking reset for new day: ${today}`);
      }

      // Estimate current costs based on activity
      const currentEstimate = await this.estimateCurrentCosts(costData);
      
      console.log(`💰 Current estimated cost: $${currentEstimate.toFixed(4)} / $${this.config.maxDailyCost}`);

      // Check if we're approaching or exceeding the limit
      if (currentEstimate >= this.config.maxDailyCost) {
        console.error(`🚨 COST LIMIT EXCEEDED: $${currentEstimate.toFixed(2)} >= $${this.config.maxDailyCost}`);
        await this.emergencyShutdown();
      } else if (currentEstimate >= this.config.maxDailyCost * 0.8) {
        console.warn(`⚠️ COST WARNING: 80% of daily limit reached ($${currentEstimate.toFixed(2)})`);
      }

    } catch (error) {
      console.error(`❌ Cost monitoring error:`, error);
    }
  }

  private async estimateCurrentCosts(costData: CostData): Promise<number> {
    // Estimate costs based on typical Replit autoscale pricing
    // These are rough estimates based on CPU/RAM usage patterns
    
    const hoursRunning = this.getHoursRunningToday();
    const sessionsActive = await this.getActiveSessions();
    
    // Base server cost (minimal when idle)
    const baseCost = hoursRunning * 0.01; // ~$0.01/hour base
    
    // Session-based cost (more CPU/RAM per active session)
    const sessionCost = sessionsActive * hoursRunning * 0.05; // ~$0.05/hour per session
    
    // Transaction processing cost
    const transactionCost = costData.transactionsCount * 0.0001; // ~$0.0001 per transaction
    
    const totalEstimate = baseCost + sessionCost + transactionCost;
    
    // Update cost data
    costData.estimatedCost = totalEstimate;
    costData.sessionsCount = sessionsActive;
    await this.saveCostData(costData);
    
    return totalEstimate;
  }

  private getHoursRunningToday(): number {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const hoursRunning = (now.getTime() - startOfDay.getTime()) / (1000 * 60 * 60);
    return hoursRunning;
  }

  private async getActiveSessions(): Promise<number> {
    try {
      // Count active trading sessions
      const sessionFiles = await fs.readdir('./').catch(() => []);
      const activeSessionFiles = sessionFiles.filter(file => 
        file.startsWith('active_') && file.endsWith('.json')
      );
      return activeSessionFiles.length;
    } catch {
      return 0;
    }
  }

  private async emergencyShutdown(): Promise<void> {
    console.error(`🛑 EMERGENCY SHUTDOWN - Cost limit exceeded!`);
    
    // Create maintenance mode
    const maintenanceMode = {
      maintenanceMode: true,
      reason: `Emergency shutdown - daily cost limit of $${this.config.maxDailyCost} exceeded`,
      enabledAt: new Date().toISOString(),
      message: "System temporarily paused due to cost limits",
      allowNewSessions: false,
      pauseExistingSessions: true,
      costLimitExceeded: true
    };

    await fs.writeFile('MAINTENANCE_MODE.json', JSON.stringify(maintenanceMode, null, 2));
    
    console.error(`💰 Bot will resume tomorrow with reset cost tracking`);
    
    // Send alert (could extend to email/webhook in future)
    this.logCostAlert();
  }

  private logCostAlert(): void {
    const alertLog = {
      timestamp: new Date().toISOString(),
      event: 'COST_LIMIT_EXCEEDED',
      limit: this.config.maxDailyCost,
      action: 'EMERGENCY_SHUTDOWN'
    };
    
    console.error(`🚨 COST ALERT:`, JSON.stringify(alertLog, null, 2));
  }

  private async loadCostData(): Promise<CostData> {
    try {
      const data = await fs.readFile(this.config.costTrackingFile, 'utf-8');
      return JSON.parse(data);
    } catch {
      // Create default cost data
      return {
        date: new Date().toISOString().split('T')[0],
        estimatedCost: 0,
        sessionsCount: 0,
        transactionsCount: 0,
        lastReset: new Date().toISOString()
      };
    }
  }

  private async saveCostData(data: CostData): Promise<void> {
    await fs.writeFile(this.config.costTrackingFile, JSON.stringify(data, null, 2));
  }

  // Method to increment transaction count
  async recordTransaction(): Promise<void> {
    const costData = await this.loadCostData();
    costData.transactionsCount++;
    await this.saveCostData(costData);
  }

  // Method to get current status
  async getStatus(): Promise<{ withinLimits: boolean; currentCost: number; limit: number }> {
    const costData = await this.loadCostData();
    const currentCost = await this.estimateCurrentCosts(costData);
    
    return {
      withinLimits: currentCost < this.config.maxDailyCost,
      currentCost,
      limit: this.config.maxDailyCost
    };
  }
}