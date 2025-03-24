import React, { useEffect, useState } from 'react';
import { timeSplitManager, RunStatus } from '../services/timesplit_manager';
import { formatTokenAmount } from '../utils/format';
import '../styles/TimeSplitProgress.css';

interface TimeSplitProgressProps {
  tokenPairKey: string;
  onComplete?: () => void;
}

export function TimeSplitProgress({ tokenPairKey, onComplete }: TimeSplitProgressProps) {
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formattedAmounts, setFormattedAmounts] = useState<{
    traded: string;
    total: string;
    nextTrade: string;
    tradeHistory: Array<{
      amount: string;
      icpswapAmount: string | null;
      kongAmount: string | null;
    }>;
  }>({
    traded: '0.0',
    total: '0.0',
    nextTrade: '0.0',
    tradeHistory: []
  });

  // Get token IDs from tokenPairKey
  const [fromToken, toToken] = tokenPairKey.split('-');

  // Format amounts using metadata
  useEffect(() => {
    if (!status || !fromToken) return;

    const updateFormattedAmounts = async () => {
      const [traded, total, nextTrade] = await Promise.all([
        formatTokenAmount(BigInt(status.amountProgress.traded_e8s), fromToken),
        formatTokenAmount(BigInt(status.amountProgress.total_e8s), fromToken),
        formatTokenAmount(BigInt(status.nextTrade.estimatedAmount_e8s), fromToken)
      ]);

      const tradeHistory = await Promise.all(
        status.tradeHistory.map(async trade => ({
          amount: await formatTokenAmount(BigInt(trade.amount_e8s), fromToken),
          icpswapAmount: trade.icpswapAmount_e8s ? 
            await formatTokenAmount(BigInt(trade.icpswapAmount_e8s), fromToken) : null,
          kongAmount: trade.kongAmount_e8s ? 
            await formatTokenAmount(BigInt(trade.kongAmount_e8s), fromToken) : null
        }))
      );

      setFormattedAmounts({
        traded,
        total,
        nextTrade,
        tradeHistory
      });
    };

    updateFormattedAmounts();
  }, [status, fromToken]);

  // Fetch status periodically
  useEffect(() => {
    let mounted = true;
    let intervalId: NodeJS.Timeout;

    const fetchStatus = async () => {
      try {
        const currentStatus = await timeSplitManager.getRunStatus(tokenPairKey);
        if (mounted) {
          setStatus(currentStatus);
          setError(null);

          // Call onComplete when run is finished
          if (!currentStatus.runControl.canPause && 
              !currentStatus.runControl.canResume && 
              !currentStatus.runControl.canStop) {
            onComplete?.();
          }
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch status');
        }
      }
    };

    // Initial fetch
    fetchStatus();

    // Set up polling
    intervalId = setInterval(fetchStatus, 1000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [tokenPairKey, onComplete]);

  const formatDuration = (nanoseconds: bigint): string => {
    const milliseconds = Number(nanoseconds / BigInt(1000000));
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const handlePause = async () => {
    try {
      await timeSplitManager.pauseRun(tokenPairKey);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause run');
    }
  };

  const handleResume = async () => {
    try {
      await timeSplitManager.resumeRun(tokenPairKey);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume run');
    }
  };

  const handleStop = async () => {
    try {
      await timeSplitManager.stopRun(tokenPairKey);
      setError(null);
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop run');
    }
  };

  if (error) {
    return (
      <div className="time-split-progress error">
        <div className="error-message">{error}</div>
        <button onClick={() => setError(null)}>Dismiss</button>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="time-split-progress loading">
        <div className="loading-spinner" />
        <div>Loading progress...</div>
      </div>
    );
  }

  return (
    <div className="time-split-progress">
      {/* Amount Progress */}
      <div className="progress-section">
        <h4>Amount Progress</h4>
        <div className="progress-bar">
          <div 
            className="progress-fill"
            style={{ width: `${status.amountProgress.percentage}%` }}
          />
        </div>
        <div className="progress-details">
          <span>{formattedAmounts.traded}</span>
          <span>of</span>
          <span>{formattedAmounts.total}</span>
          <span className="percentage">({status.amountProgress.percentage.toFixed(1)}%)</span>
        </div>
      </div>

      {/* Trade Progress */}
      <div className="progress-section">
        <h4>Trades</h4>
        <div className="trade-info">
          <span>{status.tradeProgress.executed}</span>
          {status.tradeProgress.maximum && (
            <>
              <span>of</span>
              <span>{status.tradeProgress.maximum}</span>
            </>
          )}
          <span>trades executed</span>
        </div>
      </div>

      {/* Time Progress */}
      <div className="progress-section">
        <h4>Time</h4>
        <div className="time-info">
          <div>
            <span>Elapsed: </span>
            <span>{formatDuration(status.timeProgress.elapsed)}</span>
          </div>
          {typeof status.timeProgress.maximum === 'bigint' && (
            <div>
              <span>Remaining: </span>
              <span>
                {formatDuration(status.timeProgress.maximum - status.timeProgress.elapsed)}
              </span>
            </div>
          )}
          {status.timeProgress.pausedTime !== BigInt(0) && (
            <div>
              <span>Paused: </span>
              <span>{formatDuration(status.timeProgress.pausedTime)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Next Trade */}
      <div className="progress-section">
        <h4>Next Trade</h4>
        <div className="next-trade-info">
          <div>
            <span>Amount: </span>
            <span>{formattedAmounts.nextTrade}</span>
          </div>
          <div>
            <span>In: </span>
            <span>
              {formatDuration(status.nextTrade.scheduledFor - (BigInt(Date.now()) * BigInt(1000000)))}
            </span>
          </div>
        </div>
      </div>

      {/* Price Status */}
      <div className="progress-section">
        <h4>Price Status</h4>
        <div className="price-info">
          <div>
            <span>Current: </span>
            <span>{formatTokenAmount(BigInt(Math.round(status.priceStatus.current * 1e8)), toToken)}</span>
          </div>
          <div>
            <span>Range: </span>
            <span>
              {formatTokenAmount(BigInt(Math.round(status.priceStatus.min * 1e8)), toToken)} - {formatTokenAmount(BigInt(Math.round(status.priceStatus.max * 1e8)), toToken)}
            </span>
          </div>
          <div className={`price-status ${status.priceStatus.isInRange ? 'in-range' : 'out-of-range'}`}>
            Price is {status.priceStatus.isInRange ? 'in range' : 'out of range'}
          </div>
        </div>
      </div>

      {/* Trade History */}
      <div className="progress-section">
        <h4>Trade History</h4>
        <div className="trade-history">
          {status.tradeHistory.map((trade, index) => (
            <div key={index} className={`trade-card ${trade.success ? 'success' : 'failed'}`}>
              <div className="trade-amount">
                {formattedAmounts.tradeHistory[index]?.amount} {tokenPairKey.split('-')[0]}
              </div>
              <div className="trade-details">
                {trade.icpswapAmount_e8s && formattedAmounts.tradeHistory[index]?.icpswapAmount && (
                  <span className="dex-amount">
                    ICP: {formattedAmounts.tradeHistory[index]?.icpswapAmount}
                  </span>
                )}
                {trade.kongAmount_e8s && formattedAmounts.tradeHistory[index]?.kongAmount && (
                  <span className="dex-amount">
                    Kong: {formattedAmounts.tradeHistory[index]?.kongAmount}
                  </span>
                )}
              </div>
              <div className="trade-time">
                {new Date(Number(trade.timestamp / BigInt(1000000))).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="progress-controls">
        {/* Always show Stop button */}
        <button onClick={handleStop} className="stop-button">
          Stop
        </button>
        {status.runControl.canPause && (
          <button onClick={handlePause} className="pause-button">
            Pause
          </button>
        )}
        {status.runControl.canResume && (
          <button onClick={handleResume} className="resume-button">
            Resume
          </button>
        )}
      </div>
    </div>
  );
} 