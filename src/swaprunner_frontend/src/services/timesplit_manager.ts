import { timeSplitDBService, TimeSplitRun } from './timesplit_db';
import { TokenService } from './token';
import { icpSwapService } from './icpswap';
import { kongSwapService } from './kongswap';
import { icpSwapFactoryService } from './icpswap_factory';
import { ICPSwapExecutionService, ExecutionResult } from './icpswap_execution';
import { formatTokenAmount } from '../utils/format';

// Initialize services
const icpSwapExecutionService = new ICPSwapExecutionService();

// Types
export interface RunConfig {
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
  limits?: {
    maxTime?: bigint;
    maxTrades?: number;
  };
  slippageTolerance: number;
}

export interface RunStatus {
  amountProgress: {
    traded_e8s: string;
    total_e8s: string;
    percentage: number;
  };
  tradeProgress: {
    executed: number;
    maximum?: number;
  };
  timeProgress: {
    elapsed: bigint;
    maximum?: bigint;
    pausedTime: bigint;
  };
  nextTrade: {
    scheduledFor: bigint;
    estimatedAmount_e8s: string;
  };
  priceStatus: {
    current: number;
    min: number;
    max: number;
    isInRange: boolean;
  };
  runControl: {
    canPause: boolean;
    canResume: boolean;
    canStop: boolean;
  };
  tradeHistory: Array<{
    timestamp: bigint;
    amount_e8s: string;
    icpswapAmount_e8s?: string;
    kongAmount_e8s?: string;
    success: boolean;
    error?: string;
  }>;
}

class TimeSplitManager {
  private activeTimers: Map<string, NodeJS.Timeout> = new Map();
  private executingTrades: Set<string> = new Set(); // Track which pairs are currently executing
  private tokenService: TokenService;
  private initPromise: Promise<void>;

  constructor() {
    this.tokenService = TokenService.getInstance();
    this.initPromise = this.initializeActiveRuns();
  }

  // Make this public so callers can wait for initialization
  public async waitForInit(): Promise<void> {
    return this.initPromise;
  }

  private async initializeActiveRuns() {
    try {
      const activeRuns = await timeSplitDBService.getAllActiveRuns();
      for (const run of activeRuns) {
        if (run.progress.status === 'running') {
          this.scheduleNextTrade(run);
        }
      }
    } catch (error) {
      console.error('Failed to initialize active runs:', error);
    }
  }

  private getTokenPairKey(fromToken: string, toToken: string): string {
    return `${fromToken}-${toToken}`;
  }

  private generateRandomAmount(min_e8s: string, max_e8s: string): string {
    console.log('Generating random amount between:', min_e8s, 'and', max_e8s);
    const min = BigInt(min_e8s);
    const max = BigInt(max_e8s);
    
    // Ensure min and max are in the correct range (0.001 to 0.01)
    // 0.001 = 100000 e8s
    // 0.01 = 1000000 e8s
    const minDefault = BigInt(100_000);  // 0.001 in e8s
    const maxDefault = BigInt(1_000_000); // 0.01 in e8s
    
    // Use provided values or defaults, ensuring they're within valid range
    const effectiveMin = min === BigInt(0) || min < minDefault ? minDefault : min;
    const effectiveMax = max === BigInt(0) || max > maxDefault ? maxDefault : max;
    
    // Validate that min is not greater than max
    if (effectiveMin > effectiveMax) {
      console.warn('Min amount greater than max amount, using defaults');
      return this.generateRandomAmount(minDefault.toString(), maxDefault.toString());
    }
    
    // Generate random amount
    const range = effectiveMax - effectiveMin;
    const random = BigInt(Math.floor(Math.random() * Number(range)));
    const result = effectiveMin + random;
    
    console.log('Generated amount (e8s):', result.toString(), '(', Number(result) / 1e8, 'tokens)');
    return result.toString();
  }

  private generateRandomInterval(min: bigint, max: bigint): bigint {
    const range = Number(max - min);
    const random = Math.floor(Math.random() * range);
    return min + BigInt(random);
  }

  private async scheduleNextTrade(run: TimeSplitRun) {
    try {
      const tokenPairKey = this.getTokenPairKey(run.tokenPair.fromToken, run.tokenPair.toToken);

      // Don't schedule if already executing
      if (this.executingTrades.has(tokenPairKey)) {
        console.log('Trade already executing, skipping schedule');
        return;
      }

      console.log('Scheduling next trade with run:', {
        tokenPair: run.tokenPair,
        amounts: run.amounts,
        progress: run.progress
      });

      // Clear any existing timer
      const existingTimer = this.activeTimers.get(tokenPairKey);
      if (existingTimer) {
        console.log('Clearing existing timer');
        clearTimeout(existingTimer);
        this.activeTimers.delete(tokenPairKey);
      }

      // Calculate next trade time
      const now = BigInt(Date.now()) * BigInt(1000000); // Convert to nanoseconds
      const nextTradeTime = run.progress.nextTradeTime;
      
      // Ensure nextTradeTime is in the future
      const delay = nextTradeTime <= now ? 1000 : // If in past, execute in 1 second
        Number((nextTradeTime - now) / BigInt(1000000)); // Convert to milliseconds
      
      console.log('Trade timing:', { 
        now: now.toString(), 
        nextTradeTime: nextTradeTime.toString(), 
        delay 
      });

      // Schedule next trade with proper async handling
      const timer = setTimeout(async () => {
        try {
          console.log('Timer fired, executing trade');
          // Remove the timer and mark as executing
          this.activeTimers.delete(tokenPairKey);
          this.executingTrades.add(tokenPairKey);
          
          // Execute trade
          await this.executeTrade(run);
          
          // Clear executing flag after trade completes
          this.executingTrades.delete(tokenPairKey);
        } catch (error) {
          console.error('Error executing scheduled trade:', error);
          // Clear executing flag on error
          this.executingTrades.delete(tokenPairKey);
          
          // Schedule retry
          const nextInterval = this.generateRandomInterval(run.intervals.min, run.intervals.max);
          const retryTime = BigInt(Date.now()) * BigInt(1000000) + nextInterval;
          console.log('Scheduling retry after error:', { nextInterval: nextInterval.toString(), retryTime: retryTime.toString() });
          await this.updateRunAndSchedule(run, retryTime).catch(err => {
            console.error('Failed to schedule retry:', err);
          });
        }
      }, delay);
      
      this.activeTimers.set(tokenPairKey, timer);
      console.log('Timer set, waiting for execution');
    } catch (error) {
      console.error('Error in scheduleNextTrade:', error);
      const tokenPairKey = this.getTokenPairKey(run.tokenPair.fromToken, run.tokenPair.toToken);
      this.executingTrades.delete(tokenPairKey);
      
      // Try to recover by scheduling next trade
      const nextInterval = this.generateRandomInterval(run.intervals.min, run.intervals.max);
      const now = BigInt(Date.now()) * BigInt(1000000);
      const nextTradeTime = now + nextInterval;
      console.log('Attempting recovery after error:', { nextInterval: nextInterval.toString(), nextTradeTime: nextTradeTime.toString() });
      await this.updateRunAndSchedule(run, nextTradeTime).catch(err => {
        console.error('Failed to recover from error:', err);
      });
    }
  }

  // Helper method to update run and schedule next trade
  private async updateRunAndSchedule(run: TimeSplitRun, nextTradeTime: bigint) {
    try {
      const tokenPairKey = this.getTokenPairKey(run.tokenPair.fromToken, run.tokenPair.toToken);
      
      // Don't schedule if already executing
      if (this.executingTrades.has(tokenPairKey)) {
        console.log('Trade already executing, skipping schedule');
        return;
      }

      // Generate next trade amount here, when scheduling
      const nextTradeAmount_e8s = this.generateRandomAmount(run.amounts.min_e8s, run.amounts.max_e8s);
      const updatedRun = {
        ...run,
        progress: {
          ...run.progress,
          nextTradeTime,
          nextTradeAmount_e8s // Store the amount for next trade
        }
      };

      await timeSplitDBService.updateRun(tokenPairKey, updatedRun);
      await this.scheduleNextTrade(updatedRun);
    } catch (error) {
      console.error('Error in updateRunAndSchedule:', error);
    }
  }

  private async executeTrade(run: TimeSplitRun) {
    try {
      console.log('Starting trade execution');
      console.log('Run config:', {
        fromToken: run.tokenPair.fromToken,
        toToken: run.tokenPair.toToken,
        min_e8s: run.amounts.min_e8s,
        max_e8s: run.amounts.max_e8s,
        nextTradeAmount_e8s: run.progress.nextTradeAmount_e8s,
        slippageTolerance: run.slippageTolerance
      });

      // Use the pre-generated amount stored in the run
      const tradeAmount_e8s = run.progress.nextTradeAmount_e8s;
      const halfAmount_e8s = (BigInt(tradeAmount_e8s) / BigInt(2)).toString();
      console.log('Using pre-generated trade amount:', tradeAmount_e8s);

      // Get pool data for ICPSwap first (this doesn't change frequently)
      console.log('Getting pool data...');
      const poolData = await icpSwapFactoryService.getPool({
        token0: { address: run.tokenPair.fromToken, standard: 'ICRC1' },
        token1: { address: run.tokenPair.toToken, standard: 'ICRC1' },
        fee: BigInt(3000), // 0.3% fee tier
      });
      console.log('Pool data:', poolData);

      // Execute ICPSwap and Kong trades in parallel, with quotes right before execution
      console.log('Executing trades...');
      
      // Get fresh quotes first to check price range
      console.log('Getting quotes for price check...');
      const [icpswapQuote, kongQuote] = await Promise.all([
        icpSwapService.getQuote({
          amountIn: BigInt(halfAmount_e8s),
          tokenIn: run.tokenPair.fromToken,
          tokenOut: run.tokenPair.toToken,
          fee: BigInt(3000),
        }),
        kongSwapService.getQuote({
          amountIn: BigInt(halfAmount_e8s),
          tokenIn: run.tokenPair.fromToken,
          tokenOut: run.tokenPair.toToken,
        })
      ]);
      
      // Calculate current price as the average of both DEX prices
      const currentPrice = (
        (Number(icpswapQuote.amountOut) / Number(halfAmount_e8s)) +
        (Number(kongQuote.amountOut) / Number(halfAmount_e8s))
      ) / 2;

      console.log('Current price:', currentPrice);

      // Check price range if min and max are set
      if (run.prices.min !== 0 && run.prices.max !== 0) {
        console.log('Price range:', {
          reference: run.prices.reference,
          min: run.prices.min,
          max: run.prices.max,
          isPercentage: run.prices.isPercentage
        });

        const minPrice = run.prices.isPercentage 
          ? currentPrice * (1 - run.prices.min / 100)  // Use current price as reference if percentage
          : run.prices.min;
        const maxPrice = run.prices.isPercentage
          ? currentPrice * (1 + run.prices.max / 100)  // Use current price as reference if percentage
          : run.prices.max;

        console.log('Price bounds:', {
          current: currentPrice,
          min: minPrice,
          max: maxPrice
        });

        if (currentPrice < minPrice || currentPrice > maxPrice) {
          console.log('Price out of range, skipping trade');
          // Schedule next trade
          const nextInterval = this.generateRandomInterval(run.intervals.min, run.intervals.max);
          const now = BigInt(Date.now()) * BigInt(1000000);
          const nextTradeTime = now + nextInterval;
          
          // Record skipped trade in history
          const tradeRecord = {
            timestamp: BigInt(Date.now()) * BigInt(1000000),
            amount_e8s: tradeAmount_e8s,
            success: false,
            error: `Price ${formatTokenAmount(BigInt(Math.round(currentPrice * 1e8)), run.tokenPair.toToken)} outside range [${formatTokenAmount(BigInt(Math.round(minPrice * 1e8)), run.tokenPair.toToken)} - ${formatTokenAmount(BigInt(Math.round(maxPrice * 1e8)), run.tokenPair.toToken)}]`
          };
          
          await timeSplitDBService.updateRun(
            this.getTokenPairKey(run.tokenPair.fromToken, run.tokenPair.toToken),
            {
              progress: {
                ...run.progress,
                nextTradeTime,
                tradeHistory: [...run.progress.tradeHistory, tradeRecord]
              }
            }
          );
          
          await this.scheduleNextTrade({
            ...run,
            progress: {
              ...run.progress,
              nextTradeTime,
              tradeHistory: [...run.progress.tradeHistory, tradeRecord]
            }
          });
          return;
        }
      }

      // Proceed with trades using fresh quotes for each DEX
      const [icpswapResult, kongResult] = await Promise.allSettled([
        // ICPSwap execution with fresh quote
        (async () => {
          console.log('Getting fresh ICPSwap quote for execution...');
          const freshIcpswapQuote = await icpSwapService.getQuote({
            amountIn: BigInt(halfAmount_e8s),
            tokenIn: run.tokenPair.fromToken,
            tokenOut: run.tokenPair.toToken,
            fee: BigInt(3000),
          });
          console.log('ICPSwap quote received:', freshIcpswapQuote);

          // Calculate minimum amount with user's slippage tolerance
          const icpswapSlippageMultiplier = (100 - run.slippageTolerance) / 100;
          const icpswapMinAmount = BigInt(Math.floor(Number(freshIcpswapQuote.amountOut) * icpswapSlippageMultiplier));
          console.log('ICPSwap minimum amount:', {
            minAmount: icpswapMinAmount.toString(),
            slippageMultiplier: icpswapSlippageMultiplier
          });

          console.log('Executing ICPSwap trade...');
          const results = await icpSwapExecutionService.executeICPSwap({ fromDeposited: 0n, fromUndeposited : 0n, fromWallet : 0n }, {
            poolId: poolData.canisterId,
            fromToken: {
              amount_e8s: halfAmount_e8s,
              canisterId: run.tokenPair.fromToken,
            },
            toToken: {
              minAmount_e8s: icpswapMinAmount.toString(),
              canisterId: run.tokenPair.toToken,
            },
            zeroForOne: true,
            slippageTolerance: run.slippageTolerance,
          });
          console.log('ICPSwap results:', results);
          return results;
        })(),
        // Kong execution with fresh quote
        (async () => {
          console.log('Getting Kong quote...');
          const kongQuote = await kongSwapService.getQuote({
            amountIn: BigInt(halfAmount_e8s),
            tokenIn: run.tokenPair.fromToken,
            tokenOut: run.tokenPair.toToken,
          });
          console.log('Kong quote received:', kongQuote);

          // Calculate minimum amount with conservative buffer
          const kongSlippageMultiplier = 0.99; // 1% minimum to account for Kong's constraints and price movement
          const kongMinAmount = BigInt(Math.floor(Number(kongQuote.amountOut) * kongSlippageMultiplier));
          console.log('Kong minimum amount:', {
            minAmount: kongMinAmount.toString(),
            slippageMultiplier: kongSlippageMultiplier
          });

          console.log('Executing Kong trade...');
          const transferResult = await kongSwapService.transferToKong({
            tokenId: run.tokenPair.fromToken,
            amount_e8s: halfAmount_e8s,
          });
          console.log('Kong transfer result:', transferResult);

          if (!transferResult.success) {
            throw new Error(`Kong transfer failed: ${transferResult.error}`);
          }

          const swapResult = await kongSwapService.executeKongSwap({
            fromToken: {
              canisterId: run.tokenPair.fromToken,
              amount_e8s: halfAmount_e8s,
              txId: transferResult.txId!,
            },
            toToken: {
              canisterId: run.tokenPair.toToken,
              minAmount_e8s: kongMinAmount.toString(),
            },
            slippageTolerance: run.slippageTolerance, // Use the configured slippage tolerance
          });
          console.log('Kong swap result:', swapResult);
          return swapResult;
        })()
      ]);

      console.log('Trade execution results:', {
        icpswap: icpswapResult,
        kong: kongResult
      });

      // Handle results
      if (icpswapResult.status === 'rejected') {
        console.error('ICPSwap execution failed:', icpswapResult.reason);
      }
      if (kongResult.status === 'rejected') {
        console.error('Kong execution failed:', kongResult.reason);
      }

      // Update progress only if at least one swap succeeded
      if (icpswapResult.status === 'fulfilled' || kongResult.status === 'fulfilled') {
        const amountTraded_e8s = (BigInt(run.progress.amountTraded_e8s) + BigInt(tradeAmount_e8s)).toString();
        const tradesExecuted = run.progress.tradesExecuted + 1;

        // Record trade in history
        const tradeRecord = {
          timestamp: BigInt(Date.now()) * BigInt(1000000),
          amount_e8s: tradeAmount_e8s,
          success: true,
          icpswapAmount_e8s: icpswapResult.status === 'fulfilled' ? 
            (BigInt(tradeAmount_e8s) / BigInt(2)).toString() : undefined,
          kongAmount_e8s: kongResult.status === 'fulfilled' ? 
            (BigInt(tradeAmount_e8s) / BigInt(2)).toString() : undefined
        };

        // Check if run is complete
        const isComplete = BigInt(amountTraded_e8s) >= BigInt(run.amounts.total_e8s) ||
          (run.limits?.maxTrades && tradesExecuted >= run.limits.maxTrades) ||
          (run.limits?.maxTime && (BigInt(Date.now()) * BigInt(1000000) - run.progress.startTime) >= run.limits.maxTime);

        if (isComplete) {
          // Archive the run
          await timeSplitDBService.updateRun(
            this.getTokenPairKey(run.tokenPair.fromToken, run.tokenPair.toToken),
            {
              progress: {
                ...run.progress,
                amountTraded_e8s,
                tradesExecuted,
                status: 'completed',
                tradeHistory: [...run.progress.tradeHistory, tradeRecord]
              }
            }
          );
          await timeSplitDBService.archiveRun(
            this.getTokenPairKey(run.tokenPair.fromToken, run.tokenPair.toToken)
          );
          return;
        }

        // Schedule next trade
        const nextInterval = this.generateRandomInterval(run.intervals.min, run.intervals.max);
        const nextTradeTime = BigInt(Date.now()) * BigInt(1000000) + nextInterval;

        await timeSplitDBService.updateRun(
          this.getTokenPairKey(run.tokenPair.fromToken, run.tokenPair.toToken),
          {
            progress: {
              ...run.progress,
              amountTraded_e8s,
              tradesExecuted,
              nextTradeTime,
              tradeHistory: [...run.progress.tradeHistory, tradeRecord]
            }
          }
        );

        this.scheduleNextTrade({
          ...run,
          progress: {
            ...run.progress,
            amountTraded_e8s,
            tradesExecuted,
            nextTradeTime,
            tradeHistory: [...run.progress.tradeHistory, tradeRecord]
          }
        });
      } else {
        // Both swaps failed, record failed trade
        const tradeRecord = {
          timestamp: BigInt(Date.now()) * BigInt(1000000),
          amount_e8s: tradeAmount_e8s,
          success: false,
          error: 'Both DEX swaps failed'
        };

        // Retry after delay
        const nextInterval = this.generateRandomInterval(run.intervals.min, run.intervals.max);
        const nextTradeTime = BigInt(Date.now()) * BigInt(1000000) + nextInterval;
        
        await timeSplitDBService.updateRun(
          this.getTokenPairKey(run.tokenPair.fromToken, run.tokenPair.toToken),
          {
            progress: {
              ...run.progress,
              nextTradeTime,
              tradeHistory: [...run.progress.tradeHistory, tradeRecord]
            }
          }
        );

        this.scheduleNextTrade({
          ...run,
          progress: {
            ...run.progress,
            nextTradeTime,
            tradeHistory: [...run.progress.tradeHistory, tradeRecord]
          }
        });
      }
    } catch (error) {
      console.error('Failed to execute trade:', error);
      // Schedule retry after delay
      const nextInterval = this.generateRandomInterval(run.intervals.min, run.intervals.max);
      const nextTradeTime = BigInt(Date.now()) * BigInt(1000000) + nextInterval;
      
      await timeSplitDBService.updateRun(
        this.getTokenPairKey(run.tokenPair.fromToken, run.tokenPair.toToken),
        {
          progress: {
            ...run.progress,
            nextTradeTime
          }
        }
      );

      this.scheduleNextTrade({
        ...run,
        progress: {
          ...run.progress,
          nextTradeTime
        }
      });
    }
  }

  // Public methods

  async clearRun(tokenPairKey: string): Promise<void> {
    try {
      const run = await timeSplitDBService.getRun(tokenPairKey);
      if (!run) {
        return; // Nothing to clear
      }

      // Clear any scheduled trades and execution state
      const timer = this.activeTimers.get(tokenPairKey);
      if (timer) {
        clearTimeout(timer);
        this.activeTimers.delete(tokenPairKey);
      }
      this.executingTrades.delete(tokenPairKey);

      // Delete the run without archiving it since it may be stale
      await timeSplitDBService.deleteRun(tokenPairKey);
    } catch (error) {
      console.error('Failed to clear run:', error);
      throw new Error('Failed to clear run');
    }
  }

  async startRun(config: RunConfig): Promise<TimeSplitRun> {
    const tokenPairKey = this.getTokenPairKey(config.tokenPair.fromToken, config.tokenPair.toToken);

    // Check if there's already an active run for this token pair
    const existingRun = await timeSplitDBService.getRun(tokenPairKey);
    if (existingRun) {
      throw new Error('A run already exists for this token pair. Please clear it first using the Stop button.');
    }

    // Validate and adjust amount ranges if needed
    const minDefault = BigInt(100_000);  // 0.001 in e8s
    const maxDefault = BigInt(1_000_000); // 0.01 in e8s
    
    const min_e8s = BigInt(config.amounts.min_e8s);
    const max_e8s = BigInt(config.amounts.max_e8s);
    
    // Ensure min and max are in valid ranges
    const adjustedConfig = {
      ...config,
      amounts: {
        ...config.amounts,
        min_e8s: (min_e8s < minDefault ? minDefault : min_e8s).toString(),
        max_e8s: (max_e8s > maxDefault ? maxDefault : max_e8s).toString()
      }
    };

    // Generate initial trade amount using adjusted ranges
    const nextTradeAmount_e8s = this.generateRandomAmount(
      adjustedConfig.amounts.min_e8s,
      adjustedConfig.amounts.max_e8s
    );

    // Create new run with adjusted config
    const run: TimeSplitRun = {
      id: crypto.randomUUID(),
      tokenPair: adjustedConfig.tokenPair,
      amounts: adjustedConfig.amounts,
      prices: adjustedConfig.prices,
      intervals: adjustedConfig.intervals,
      limits: adjustedConfig.limits || { maxTime: undefined, maxTrades: undefined },
      slippageTolerance: adjustedConfig.slippageTolerance,
      progress: {
        startTime: BigInt(Date.now()) * BigInt(1000000), // Convert to nanoseconds
        amountTraded_e8s: '0',
        tradesExecuted: 0,
        nextTradeTime: BigInt(Date.now()) * BigInt(1000000), // Start first trade immediately
        nextTradeAmount_e8s, // Store initial trade amount
        status: 'running',
        totalPausedTime: BigInt(0),
        tradeHistory: [] // Initialize empty trade history
      }
    };

    await timeSplitDBService.createRun(tokenPairKey, run);
    this.scheduleNextTrade(run);

    return run;
  }

  async pauseRun(tokenPairKey: string): Promise<void> {
    const run = await timeSplitDBService.getRun(tokenPairKey);
    if (!run || run.progress.status !== 'running') {
      throw new Error('No active run found');
    }

    // Clear scheduled trade
    const timer = this.activeTimers.get(tokenPairKey);
    if (timer) {
      clearTimeout(timer);
      this.activeTimers.delete(tokenPairKey);
    }

    // Update run status
    await timeSplitDBService.updateRun(tokenPairKey, {
      progress: {
        ...run.progress,
        status: 'paused',
        pausedAt: BigInt(Date.now()) * BigInt(1000000)
      }
    });
  }

  async resumeRun(tokenPairKey: string): Promise<void> {
    const run = await timeSplitDBService.getRun(tokenPairKey);
    if (!run || run.progress.status !== 'paused') {
      throw new Error('No paused run found');
    }

    // Calculate total paused time
    const totalPausedTime = run.progress.totalPausedTime + 
      (BigInt(Date.now()) * BigInt(1000000) - run.progress.pausedAt!);

    // Update run status and schedule next trade
    const updatedRun: TimeSplitRun = {
      ...run,
      progress: {
        ...run.progress,
        status: 'running',
        totalPausedTime,
        pausedAt: undefined,
        nextTradeTime: BigInt(Date.now()) * BigInt(1000000) // Resume immediately
      }
    };

    await timeSplitDBService.updateRun(tokenPairKey, updatedRun);
    this.scheduleNextTrade(updatedRun);
  }

  async stopRun(tokenPairKey: string): Promise<void> {
    const run = await timeSplitDBService.getRun(tokenPairKey);
    if (!run) {
      throw new Error('No run found');
    }

    // Clear scheduled trade and execution state
    const timer = this.activeTimers.get(tokenPairKey);
    if (timer) {
      clearTimeout(timer);
      this.activeTimers.delete(tokenPairKey);
    }
    this.executingTrades.delete(tokenPairKey);

    // Update run status and archive
    await timeSplitDBService.updateRun(tokenPairKey, {
      progress: {
        ...run.progress,
        status: 'stopped'
      }
    });
    await timeSplitDBService.archiveRun(tokenPairKey);
  }

  async getRunStatus(tokenPairKey: string): Promise<RunStatus> {
    const run = await timeSplitDBService.getRun(tokenPairKey);
    if (!run) {
      throw new Error('No run found');
    }

    const now = BigInt(Date.now()) * BigInt(1000000);
    const elapsed = now - run.progress.startTime - run.progress.totalPausedTime;
    
    return {
      amountProgress: {
        traded_e8s: run.progress.amountTraded_e8s,
        total_e8s: run.amounts.total_e8s,
        percentage: Number((BigInt(run.progress.amountTraded_e8s) * BigInt(100)) / BigInt(run.amounts.total_e8s))
      },
      tradeProgress: {
        executed: run.progress.tradesExecuted,
        maximum: run.limits?.maxTrades
      },
      timeProgress: {
        elapsed,
        maximum: run.limits?.maxTime,
        pausedTime: run.progress.totalPausedTime
      },
      nextTrade: {
        scheduledFor: run.progress.nextTradeTime,
        estimatedAmount_e8s: run.progress.nextTradeAmount_e8s || '0' // Use stored amount
      },
      priceStatus: {
        current: 0, // TODO: Fetch current price
        min: run.prices.min,
        max: run.prices.max,
        isInRange: true // TODO: Calculate based on current price
      },
      runControl: {
        canPause: run.progress.status === 'running',
        canResume: run.progress.status === 'paused',
        canStop: run.progress.status === 'running' || run.progress.status === 'paused'
      },
      tradeHistory: run.progress.tradeHistory
    };
  }
}

// Export singleton instance
export const timeSplitManager = new TimeSplitManager(); 