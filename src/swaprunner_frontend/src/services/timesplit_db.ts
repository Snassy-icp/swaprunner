import { openDB, IDBPDatabase } from 'idb';

// Database types
export interface TimeSplitRun {
  id: string;
  tokenPair: {
    fromToken: string;
    toToken: string;
    fromSymbol: string;
    toSymbol: string;
  };
  amounts: {
    total_e8s: string;
    min_e8s: string;
    max_e8s: string;
    isPercentage: boolean;
  };
  prices: {
    reference: number;
    min: number;
    max: number;
    isPercentage: boolean;
  };
  intervals: {
    min: bigint;
    max: bigint;
    unit: 'seconds' | 'minutes' | 'hours';
  };
  limits: {
    maxTime?: bigint;
    maxTrades?: number;
  };
  slippageTolerance: number;
  progress: {
    startTime: bigint;
    amountTraded_e8s: string;
    tradesExecuted: number;
    nextTradeTime: bigint;
    nextTradeAmount_e8s: string;
    status: 'running' | 'paused' | 'completed' | 'stopped';
    pausedAt?: bigint;
    totalPausedTime: bigint;
    tradeHistory: Array<{
      timestamp: bigint;
      amount_e8s: string;
      icpswapAmount_e8s?: string;
      kongAmount_e8s?: string;
      success: boolean;
      error?: string;
    }>;
  };
}

export interface TimeSplitDB {
  activeRuns: {
    [tokenPairKey: string]: TimeSplitRun;
  };
  historicalRuns: TimeSplitRun[];
}

// Database configuration
const DB_NAME = 'SwaprunnerDB';
const DB_VERSION = 1;
const STORES = {
  activeRuns: 'activeRuns',
  historicalRuns: 'historicalRuns'
} as const;

class TimeSplitDBService {
  private db: IDBPDatabase | null = null;

  // Initialize the database
  async init(): Promise<void> {
    try {
      this.db = await openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          // Create stores if they don't exist
          if (!db.objectStoreNames.contains(STORES.activeRuns)) {
            db.createObjectStore(STORES.activeRuns, { keyPath: 'tokenPairKey' });
          }
          if (!db.objectStoreNames.contains(STORES.historicalRuns)) {
            db.createObjectStore(STORES.historicalRuns, { keyPath: 'id', autoIncrement: true });
          }
        },
      });
      console.log('TimeSplit database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize TimeSplit database:', error);
      throw new Error('Failed to initialize database');
    }
  }

  // Create a new active run
  async createRun(tokenPairKey: string, run: TimeSplitRun): Promise<void> {
    if (!this.db) await this.init();
    try {
      const tx = this.db!.transaction(STORES.activeRuns, 'readwrite');
      await tx.store.put({ ...run, tokenPairKey });
      await tx.done;
    } catch (error) {
      console.error('Failed to create run:', error);
      throw new Error('Failed to create run');
    }
  }

  // Get an active run by token pair key
  async getRun(tokenPairKey: string): Promise<TimeSplitRun | null> {
    if (!this.db) await this.init();
    try {
      return await this.db!.get(STORES.activeRuns, tokenPairKey);
    } catch (error) {
      console.error('Failed to get run:', error);
      throw new Error('Failed to get run');
    }
  }

  // Update an existing active run
  async updateRun(tokenPairKey: string, run: Partial<TimeSplitRun>): Promise<void> {
    if (!this.db) await this.init();
    try {
      const tx = this.db!.transaction(STORES.activeRuns, 'readwrite');
      const existingRun = await tx.store.get(tokenPairKey);
      if (!existingRun) {
        throw new Error('Run not found');
      }
      await tx.store.put({
        ...existingRun,
        ...run,
        tokenPairKey
      });
      await tx.done;
    } catch (error) {
      console.error('Failed to update run:', error);
      throw new Error('Failed to update run');
    }
  }

  // Move a run from active to historical and delete from active
  async archiveRun(tokenPairKey: string): Promise<void> {
    if (!this.db) await this.init();
    try {
      const tx = this.db!.transaction([STORES.activeRuns, STORES.historicalRuns], 'readwrite');
      const run = await tx.objectStore(STORES.activeRuns).get(tokenPairKey);
      if (!run) {
        throw new Error('Run not found');
      }
      await tx.objectStore(STORES.historicalRuns).add(run);
      await tx.objectStore(STORES.activeRuns).delete(tokenPairKey);
      await tx.done;
    } catch (error) {
      console.error('Failed to archive run:', error);
      throw new Error('Failed to archive run');
    }
  }

  // Delete an active run
  async deleteRun(tokenPairKey: string): Promise<void> {
    if (!this.db) await this.init();
    try {
      await this.db!.delete(STORES.activeRuns, tokenPairKey);
    } catch (error) {
      console.error('Failed to delete run:', error);
      throw new Error('Failed to delete run');
    }
  }

  // Get all active runs
  async getAllActiveRuns(): Promise<TimeSplitRun[]> {
    if (!this.db) await this.init();
    try {
      return await this.db!.getAll(STORES.activeRuns);
    } catch (error) {
      console.error('Failed to get all active runs:', error);
      throw new Error('Failed to get all active runs');
    }
  }

  // Get historical runs with optional limit and offset
  async getHistoricalRuns(limit?: number, offset?: number): Promise<TimeSplitRun[]> {
    if (!this.db) await this.init();
    try {
      const tx = this.db!.transaction(STORES.historicalRuns, 'readonly');
      let cursor = await tx.store.openCursor();
      const runs: TimeSplitRun[] = [];
      
      // Skip offset
      if (offset) {
        let count = 0;
        while (cursor && count < offset) {
          cursor = await cursor.continue();
          count++;
        }
      }
      
      // Collect runs up to limit
      while (cursor && (!limit || runs.length < limit)) {
        runs.push(cursor.value);
        cursor = await cursor.continue();
      }
      
      return runs;
    } catch (error) {
      console.error('Failed to get historical runs:', error);
      throw new Error('Failed to get historical runs');
    }
  }

  // Clear all data (for testing/development)
  async clearAll(): Promise<void> {
    if (!this.db) await this.init();
    try {
      const tx = this.db!.transaction([STORES.activeRuns, STORES.historicalRuns], 'readwrite');
      await tx.objectStore(STORES.activeRuns).clear();
      await tx.objectStore(STORES.historicalRuns).clear();
      await tx.done;
    } catch (error) {
      console.error('Failed to clear database:', error);
      throw new Error('Failed to clear database');
    }
  }
}

// Export a singleton instance
export const timeSplitDBService = new TimeSplitDBService();