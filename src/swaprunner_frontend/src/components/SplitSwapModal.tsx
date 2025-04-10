import React, { useState, useEffect, useMemo } from 'react';
import { FiX, FiCheck, FiLoader, FiChevronDown } from 'react-icons/fi';
import { useTokens } from '../contexts/TokenContext';
import { useTokenSecurity } from '../contexts/TokenSecurityContext';
import { formatTokenAmount } from '../utils/format';
import '../styles/SwapModal.css';
import { SwapStep } from '../types/swap';
import { tokenService } from '../services/token';
import { useSwapTimer } from '../hooks/useSwapTimer';
import { TimerDisplay } from '../components/TimerDisplay';
import { checkSplitSwapWarnings } from '../utils/swapWarnings';
import { SwapWarnings } from './SwapWarnings';

interface SwapDetails {
  fromToken: {
    symbol: string;
    original_amount_e8s: string;  // Base unit amount
    amount_e8s: string;  // Base unit amount
    canisterId: string;
  };
  toToken: {
    symbol: string;
    amount_e8s: string;  // Base unit amount
    canisterId: string;
  };
  price: number;
  priceUSD: number;
  lpFee: string;
  priceImpact: number;
  slippageTolerance: number;
  minimumReceived_e8s: string;  // Base unit amount
  estimatedFees: {
    icpswap: {
      from: string;  // Fee in input token
      to: string;    // Fee in output token
    };
    kong: {
      from: string;  // Fee in input token
      to: string;    // Fee in output token
    };
  };
  dex: 'icpswap' | 'kong' | 'split';
  poolId?: string;
  distribution: number;
  icpswap: {
    amount_e8s: string;
    amountOut_e8s: string;
    priceImpact: number;
    minimumReceived_e8s: string;
    depositNeeds: {
      fromDeposited: bigint;
      fromUndeposited: bigint;
      fromWallet: bigint;
      adjustedAmount: bigint;
      originalAmount: bigint;
    };
  };
  kong: {
    amount_e8s: string;
    amountOut_e8s: string;
    priceImpact: number;
    minimumReceived_e8s: string;
    depositNeeds?: {
      fromDeposited: bigint;
      fromUndeposited: bigint;
      fromWallet: bigint;
      adjustedAmount: bigint;
      originalAmount: bigint;
    };
  };
}

interface SplitSwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  details: SwapDetails;
  onConfirm: () => void;
  onSuccess: () => void;
  icpswapSteps: SwapStep[];
  kongSteps: SwapStep[];
}

interface StepItemProps {
  step: SwapStep;
  index: number;
  expandedSteps: Set<number>;
  toggleStep: (index: number) => void;
}

const StepItem: React.FC<StepItemProps> = ({ step, index, expandedSteps, toggleStep }) => {
  const { stepTimers } = useSwapTimer([step]);
  
  // Helper function to safely convert values to string
  const formatValue = (value: any): string => {
    if (!value) return '';
    if (typeof value === 'object' && '_isPrincipal' in value) {
      return value.toString();
    }
    return String(value);
  };

  return (
    <div 
      className={`execution-step ${step.status} ${expandedSteps.has(index) ? 'expanded' : ''}`}
    >
      <div className="step-header" onClick={() => toggleStep(index)}>
        <div className="step-status">
          {step.status === 'complete' && !step.optimizationMessage && (
            <FiCheck className="status-icon complete" />
          )}
          {step.status === 'loading' && (
            <FiLoader className="status-icon loading" />
          )}
          {step.status === 'pending' && (
            <div className="status-icon pending">●</div>
          )}
          {step.status === 'error' && (
            <FiX className="status-icon error" />
          )}
          {step.status === 'skipped' && (
            <div className="status-icon skipped">↷</div>
          )}
        </div>
        <div className="step-info">
          <span className="step-title">{step.title}</span>
          {step.optimizationMessage && (
            <span className="optimization-message">{step.optimizationMessage}</span>
          )}
        </div>
        {(step.status === 'loading' || step.status === 'complete' || step.status === 'error') && (
          <TimerDisplay
            startTime={stepTimers[0].startTime}
            endTime={stepTimers[0].endTime}
            isRunning={stepTimers[0].isRunning}
          />
        )}
        <FiChevronDown className={`expand-icon ${expandedSteps.has(index) ? 'active' : ''}`} />
      </div>

      {expandedSteps.has(index) && (
        <div className="step-content">
          {step.details && (
            <div className="step-details">
              {step.details.amount && !step.details.depositedAmount && (
                <div className="detail-row">
                  <span>Amount</span>
                  <span>{step.details.amount} {step.details.tokenSymbol}</span>
                </div>
              )}
              {step.details.depositedAmount && (step.title.toLowerCase().includes('deposit')) && (
                <div className="detail-row">
                  <span>Amount</span>
                  <span>{step.details.depositedAmount} {step.details.tokenSymbol}</span>
                </div>
              )}
              {step.details.amountOut && (
                <div className="detail-row">
                  <span>Output Amount</span>
                  <span>{step.details.amountOut} {step.details.tokenOutSymbol}</span>
                </div>
              )}
              {step.details.destination && (
                <div className="detail-row">
                  <span>Destination</span>
                  <span className="monospace">{formatValue(step.details.destination)}</span>
                </div>
              )}
              {step.details.canisterId && (
                <div className="detail-row">
                  <span>Canister ID</span>
                  <span className="monospace">{formatValue(step.details.canisterId)}</span>
                </div>
              )}
              {step.details.transactionId && (
                <div className="detail-row">
                  <span>ICPSwap Transaction ID</span>
                  <span className="monospace">{step.details.transactionId}</span>
                </div>
              )}
              {step.details.kongTransactionId && (
                <div className="detail-row">
                  <span>Kong Transaction ID</span>
                  <span className="monospace">{step.details.kongTransactionId}</span>
                </div>
              )}
              {step.details.priceImpact && (
                <div className="detail-row">
                  <span>Price Impact</span>
                  <span>{step.details.priceImpact.toFixed(2)}%</span>
                </div>
              )}
              {step.details.optimizationReason && (
                <div className="detail-row">
                  <span>Optimization</span>
                  <span>{step.details.optimizationReason}</span>
                </div>
              )}
            </div>
          )}
          {step.error && (
            <div className="step-error">
              <div className="error-icon">⚠️</div>
              <div className="error-message">{step.error}</div>
            </div>
          )}
          {step.status === 'loading' && (
            <div className="step-progress">
              <div className="progress-bar">
                <div className="progress-indicator"></div>
              </div>
              <span className="progress-text">Processing...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const SplitSwapModal: React.FC<SplitSwapModalProps> = ({
  isOpen,
  onClose,
  details,
  onConfirm,
  onSuccess,
  icpswapSteps,
  kongSteps,
}) => {
  const [view, setView] = useState<'confirm' | 'execute'>('confirm');
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [userInteractedSteps, setUserInteractedSteps] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);
  const { tokens } = useTokens();
  const { isTokenSuspended, getTokenSuspensionDetails } = useTokenSecurity();
  const [loadedLogos, setLoadedLogos] = useState<Record<string, string>>({});
  
  // Memoize token info to prevent recreation on every render
  const fromToken = useMemo(() => tokens.find(t => t.canisterId === details?.fromToken?.canisterId), [tokens, details?.fromToken?.canisterId]);
  const toToken = useMemo(() => tokens.find(t => t.canisterId === details?.toToken?.canisterId), [tokens, details?.toToken?.canisterId]);

  const fromTokenInfo = useMemo(() => fromToken?.metadata ? { metadata: fromToken.metadata, isLoading: false } : { isLoading: true }, [fromToken]);
  const toTokenInfo = useMemo(() => toToken?.metadata ? { metadata: toToken.metadata, isLoading: false } : { isLoading: true }, [toToken]);

  // Memoize warnings to prevent recalculation on every render
  const warnings = useMemo(() => checkSplitSwapWarnings({
    fromToken: {
      canisterId: details?.fromToken?.canisterId,
      metadata: fromToken?.metadata
    },
    toToken: {
      canisterId: details?.toToken?.canisterId,
      metadata: toToken?.metadata
    },
    slippageTolerance: details?.slippageTolerance,
    depositNeeds: details?.icpswap?.depositNeeds,
    tokenSecurity: {
      isTokenSuspended,
      getTokenSuspensionDetails
    }
  }), [details?.fromToken?.canisterId, fromToken?.metadata, details?.toToken?.canisterId, toToken?.metadata, details?.slippageTolerance, details?.icpswap?.depositNeeds]);

  const toggleStep = (index: number) => {
    // Track that this step has been manually interacted with
    setUserInteractedSteps(prev => new Set(prev).add(index));

    // Toggle expansion state
    const newExpandedSteps = new Set(expandedSteps);
    if (newExpandedSteps.has(index)) {
      newExpandedSteps.delete(index);
    } else {
      newExpandedSteps.add(index);
    }
    setExpandedSteps(newExpandedSteps);
  };
  
  // Effect to handle success state and auto-expand on error
  useEffect(() => {
    const hasError = icpswapSteps.some(step => step.status === 'error') || 
                    kongSteps.some(step => step.status === 'error');
    // Auto-expand when there's an error
    if (hasError) {
      setIsExecuting(false);
    }
  }, [icpswapSteps, kongSteps]);

  // Effect to handle success state
  const isComplete = icpswapSteps.every(step => 
    step.status === 'complete' || step.status === 'skipped'
  ) && kongSteps.every(step => 
    step.status === 'complete' || step.status === 'skipped'
  );

  const handleClose = () => {
    if (isComplete) {
      onSuccess();
    }
    onClose();
  };

  // Load logos for the tokens in the modal
  useEffect(() => {
    if (!isOpen) return;

    const loadLogos = async () => {
      try {
        // Load logo for fromToken
        if (details?.fromToken?.canisterId && !loadedLogos[details.fromToken.canisterId]) {
          const logo = await tokenService.getTokenLogo(details.fromToken.canisterId);
          setLoadedLogos(prev => ({
            ...prev,
            [details.fromToken.canisterId]: logo || '/generic_token.svg'
          }));
        }

        // Load logo for toToken
        if (details?.toToken?.canisterId && !loadedLogos[details.toToken.canisterId]) {
          const logo = await tokenService.getTokenLogo(details.toToken.canisterId);
          setLoadedLogos(prev => ({
            ...prev,
            [details.toToken.canisterId]: logo || '/generic_token.svg'
          }));
        }
      } catch (err) {
        console.error('Error loading logos:', err);
      }
    };

    loadLogos();
  }, [isOpen, details?.fromToken?.canisterId, details?.toToken?.canisterId]);

  const { timer: grandTotalTimer } = useSwapTimer([...icpswapSteps, ...kongSteps]);
  const { timer: icpswapTimer } = useSwapTimer([...icpswapSteps]);
  const { timer: kongTimer } = useSwapTimer([...kongSteps]);

  // Auto-expand steps with details
  useEffect(() => {
    if (view === 'execute') {
      const stepsToExpand = new Set<number>();
      const allSteps = [...icpswapSteps, ...kongSteps];
      
      allSteps.forEach((step, index) => {
        // Skip steps that user has manually interacted with
        if (!userInteractedSteps.has(index)) {
          // Keep a step expanded if:
          // 1. It's the currently loading step
          // 2. It has an error
          if (step.status === 'loading' || step.status === 'error') {
            stepsToExpand.add(index);
          }
        }
      });

      // Preserve expansion state of user-interacted steps
      userInteractedSteps.forEach(index => {
        if (expandedSteps.has(index)) {
          stepsToExpand.add(index);
        }
      });

      setExpandedSteps(stepsToExpand);
    }
  }, [icpswapSteps, kongSteps, view, userInteractedSteps]);

  // Reset states when modal closes
  useEffect(() => {
    if (!isOpen) {
      setExpandedSteps(new Set());
      setUserInteractedSteps(new Set());
      setError(null);
      setIsExecuting(true);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const renderConfirmationView = () => (
    <div className="swap-confirmation">
      <SwapWarnings 
        warnings={warnings}
      />
      <div className="swap-amounts">
        {/* Input amount section */}
        <div className="amount-section">
          <div className="amount-row">
            <div className="amount-label">You pay</div>
            <div className="amount-content">
              <img 
                src={loadedLogos[details?.fromToken?.canisterId || ''] || '/generic_token.svg'}
                alt={fromTokenInfo.metadata?.symbol}
                className="token-logo"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  img.src = fromTokenInfo.metadata?.symbol === 'ICP' ? '/icp_symbol.svg' : '/generic_token.svg';
                }}
              />
              <div className="amount-value">
                {formatTokenAmount(BigInt(details?.fromToken?.original_amount_e8s || '0'), details?.fromToken?.canisterId || '')} {details?.fromToken?.symbol || ''}
              </div>
            </div>
          </div>
        </div>

        {/* Total output amount */}
        <div className="amount-section">
          <div className="amount-row">
            <div className="amount-label">You get</div>
            <div className="amount-content">
              <img 
                src={loadedLogos[details?.toToken?.canisterId || ''] || '/generic_token.svg'}
                alt={toTokenInfo.metadata?.symbol}
                className="token-logo"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  img.src = toTokenInfo.metadata?.symbol === 'ICP' ? '/icp_symbol.svg' : '/generic_token.svg';
                }}
              />
              <div className="amount-value">
                {formatTokenAmount(BigInt(details?.toToken?.amount_e8s || '0'), details?.toToken?.canisterId || '')} {details?.toToken?.symbol || ''}
              </div>
            </div>
          </div>
        </div>

        {/* Split details section */}
        <div className="split-details">
          {/* ICPSwap portion */}
          {(details?.icpswap?.amount_e8s || '0') !== '0' && (
            <div className="split-info-item">
              <div className="split-info-header">ICPSwap ({(100 - (details?.distribution || 0)).toFixed(2)}%)</div>
              <div className="split-info-content">
                <div className="split-info-row">
                  <span className="split-info-label">Input:</span>
                  <div className="split-info-amount">
                    <img 
                      src={loadedLogos[details?.fromToken?.canisterId || ''] || '/generic_token.svg'}
                      alt={fromTokenInfo.metadata?.symbol}
                      className="token-logo-small"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        img.src = fromTokenInfo.metadata?.symbol === 'ICP' ? '/icp_symbol.svg' : '/generic_token.svg';
                      }}
                    />
                    {formatTokenAmount(BigInt(details?.icpswap?.amount_e8s || '0'), details?.fromToken?.canisterId || '')} {details?.fromToken?.symbol || ''}
                  </div>
                </div>
                <div className="split-info-row">
                  <span className="split-info-label">Output:</span>
                  <div className="split-info-amount">
                    <img 
                      src={loadedLogos[details?.toToken?.canisterId || ''] || '/generic_token.svg'}
                      alt={toTokenInfo.metadata?.symbol}
                      className="token-logo-small"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        img.src = toTokenInfo.metadata?.symbol === 'ICP' ? '/icp_symbol.svg' : '/generic_token.svg';
                      }}
                    />
                    {formatTokenAmount(BigInt(details?.icpswap?.amountOut_e8s || '0'), details?.toToken?.canisterId || '')} {details?.toToken?.symbol || ''}
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Kong portion */}
          {(details?.kong?.amount_e8s || '0') !== '0' && (
            <div className="split-info-item">
              <div className="split-info-header">Kong ({details?.distribution?.toFixed(2) || '0'}%)</div>
              <div className="split-info-content">
                <div className="split-info-row">
                  <span className="split-info-label">Input:</span>
                  <div className="split-info-amount">
                    <img 
                      src={loadedLogos[details?.fromToken?.canisterId || ''] || '/generic_token.svg'}
                      alt={fromTokenInfo.metadata?.symbol}
                      className="token-logo-small"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        img.src = fromTokenInfo.metadata?.symbol === 'ICP' ? '/icp_symbol.svg' : '/generic_token.svg';
                      }}
                    />
                    {formatTokenAmount(BigInt(details?.kong?.amount_e8s || '0'), details?.fromToken?.canisterId || '')} {details?.fromToken?.symbol || ''}
                  </div>
                </div>
                <div className="split-info-row">
                  <span className="split-info-label">Output:</span>
                  <div className="split-info-amount">
                    <img 
                      src={loadedLogos[details?.toToken?.canisterId || ''] || '/generic_token.svg'}
                      alt={toTokenInfo.metadata?.symbol}
                      className="token-logo-small"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        img.src = toTokenInfo.metadata?.symbol === 'ICP' ? '/icp_symbol.svg' : '/generic_token.svg';
                      }}
                    />
                    {formatTokenAmount(BigInt(details?.kong?.amountOut_e8s || ''), details?.toToken?.canisterId || '')} {details?.toToken?.symbol || ''}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="swap-details">
        <div className="detail-row">
          <span>Price</span>
          <span>
            1 {fromTokenInfo.metadata?.symbol || details?.fromToken?.symbol || ''} = {details?.price || '0'} {toTokenInfo.metadata?.symbol || details?.toToken?.symbol || ''}
            {(details?.priceUSD || 0) > 0 && ` ($${details?.priceUSD?.toFixed(2)})`}
          </span>
        </div>
        <div className="detail-row">
          <span>Liquidity Provider Fees</span>
          <div className="split-fees">
            <span>ICPSwap: {details?.lpFee || '0'}</span>
            <span>Kong: {details?.lpFee || '0'}</span>
          </div>
        </div>
        <div className="detail-row">
          <span>Price Impact</span>
          <div className="split-impacts">
            <span className={(details?.icpswap?.priceImpact || 0) > 2 ? 'warning' : ''}>
              ICPSwap: {details?.icpswap?.priceImpact?.toFixed(2) || ''}%
            </span>
            <span className={(details?.kong?.priceImpact || 0) > 2 ? 'warning' : ''}>
              Kong: {details?.kong?.priceImpact?.toFixed(2) || ''}%
            </span>
          </div>
        </div>
        <div className="detail-row">
          <span>Slippage tolerance</span>
          <span>{details?.slippageTolerance || ''}%</span>
        </div>
        <div className="detail-row">
          <span>Minimum received</span>
          <div className="split-minimums">
            <span>
              ICPSwap: {toTokenInfo.metadata ? 
                formatTokenAmount(BigInt(details?.icpswap?.minimumReceived_e8s || '0'), details?.toToken?.canisterId || '')
                : details?.icpswap?.minimumReceived_e8s || '0'
              } {toTokenInfo.metadata?.symbol}
            </span>
            <span>
              Kong: {toTokenInfo.metadata ? 
                formatTokenAmount(BigInt(details?.kong?.minimumReceived_e8s || '0'), details?.toToken?.canisterId || '')
                : details?.kong?.minimumReceived_e8s || ''
              } {toTokenInfo.metadata?.symbol}
            </span>
          </div>
        </div>
        <div className="detail-row">
          <span>Transfer fees</span>
          <div className="fee-details">
            <span>ICPSwap: {details?.estimatedFees?.icpswap?.from || ''} {fromTokenInfo.metadata?.symbol} + {details?.estimatedFees?.icpswap?.to || ''} {toTokenInfo.metadata?.symbol}</span>
            <span>Kong: {details?.estimatedFees?.kong?.from || ''} {fromTokenInfo.metadata?.symbol} + {details?.estimatedFees?.kong?.to || ''} {toTokenInfo.metadata?.symbol}</span>
          </div>
        </div>
      </div>

      <button 
        className="confirm-swap-button"
        onClick={() => {
          setView('execute');
          onConfirm();
        }}
      >
        Confirm Split Swap
      </button>
    </div>
  );

  const renderExecutionView = () => {
    // Calculate progress for both step arrays
    const icpswapCompleted = icpswapSteps.filter(step => 
      step.status === 'complete' || step.status === 'skipped'
    ).length;
    const kongCompleted = kongSteps.filter(step => 
      step.status === 'complete' || step.status === 'skipped'
    ).length;
    const totalSteps = icpswapSteps.length + kongSteps.length;
    const progress = ((icpswapCompleted + kongCompleted) / totalSteps) * 100;

    const currentStep = 
      icpswapSteps.find(step => step.status === 'loading')?.title || 
      kongSteps.find(step => step.status === 'loading')?.title ||
      (icpswapCompleted + kongCompleted === totalSteps ? 'Split swap completed' : '');

    const hasError = icpswapSteps.some(step => step.status === 'error') || 
                    kongSteps.some(step => step.status === 'error');
    const isLoading = icpswapSteps.some(step => step.status === 'loading') ||
                     kongSteps.some(step => step.status === 'loading');
    const isComplete = icpswapCompleted + kongCompleted === totalSteps;

    return (
      <div className="swap-execution">
        <div 
          className="swap-execution-header"
          onClick={() => setIsExecuting(!isExecuting)}
        >
          <div className="swap-summary">
            <div className="token-pair">
              <img 
                src={loadedLogos[details?.fromToken?.canisterId] || '/generic_token.svg'}
                alt={fromTokenInfo.metadata?.symbol}
                className="token-logo"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  img.src = fromTokenInfo.metadata?.symbol === 'ICP' ? '/icp_symbol.svg' : '/generic_token.svg';
                }}
              />
              <span className="arrow">→</span>
              <img 
                src={loadedLogos[details?.toToken?.canisterId] || '/generic_token.svg'}
                alt={toTokenInfo.metadata?.symbol}
                className="token-logo"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  img.src = toTokenInfo.metadata?.symbol === 'ICP' ? '/icp_symbol.svg' : '/generic_token.svg';
                }}
              />
            </div>
            <div className="swap-amounts-summary">
              <span>{fromTokenInfo.metadata ? 
                formatTokenAmount(BigInt(details?.fromToken?.amount_e8s || '0'), details?.fromToken?.canisterId || '')
                : details?.fromToken?.amount_e8s || '0'
              } {fromTokenInfo.metadata?.symbol}</span>
              <span className="arrow">→</span>
              <span>{toTokenInfo.metadata ? 
                formatTokenAmount(BigInt(details?.toToken?.amount_e8s || '0'), details?.toToken?.canisterId || '')
                : details?.toToken?.amount_e8s || ''
              } {toTokenInfo.metadata?.symbol}</span>
            </div>
            <TimerDisplay
              startTime={grandTotalTimer.startTime}
              endTime={grandTotalTimer.endTime}
              isRunning={grandTotalTimer.isRunning}
            />
            <div className="split-summary">
              <div className="split-row">
                <span>ICPSwap ({(100 - (details?.distribution || 0)).toFixed(2)}%)</span>
                <span>Kong ({details?.distribution?.toFixed(2) || '0'}%)</span>
              </div>
            </div>
          </div>

          <div className={`compact-progress ${isExecuting ? 'visible' : ''}`}>
            <div className="progress-bar-container">
              <div 
                className="progress-bar"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <div className="progress-status">
              <span>{currentStep || 'Starting...'}</span>
              <span>{Math.round(progress)}%</span>
            </div>
          </div>
        </div>

        <div className={`execution-content ${!isExecuting ? 'expanded' : 'collapsed'}`}>
          <div className="execution-steps">
            <div className="step-group">
              <h4>ICPSwap Steps</h4>
              <TimerDisplay
                startTime={icpswapTimer.startTime}
                endTime={icpswapTimer.endTime}
                isRunning={icpswapTimer.isRunning}
              />
              {icpswapSteps.map((step, index) => (
                <StepItem key={index} step={step} index={index} expandedSteps={expandedSteps} toggleStep={toggleStep} />
              ))}
            </div>
            <div className="step-group">
              <h4>Kong Steps</h4>
              <TimerDisplay
                startTime={kongTimer.startTime}
                endTime={kongTimer.endTime}
                isRunning={kongTimer.isRunning}
              />
              {kongSteps.map((step, index) => (
                <StepItem key={index} step={step} index={index + icpswapSteps.length} expandedSteps={expandedSteps} toggleStep={toggleStep} />
              ))}
            </div>
          </div>

          {hasError && (
            <div className="execution-error">
              <div className="error-message">
                <FiX className="error-icon" />
                <span>Split swap failed. Please try a new swap.</span>
              </div>
              <button className="close-button" onClick={handleClose}>Close</button>
            </div>
          )}

          {isComplete && (
            <div className="execution-success">
              <div className="success-icon">✓</div>
              <p>Split swap completed successfully!</p>
              <button className="close-button" onClick={handleClose}>Close</button>
            </div>
          )}

          {view === 'execute' && (
            <button 
              className={`collapse-button ${!isExecuting ? 'expanded' : ''}`}
              onClick={() => setIsExecuting(!isExecuting)}
              title={!isExecuting ? 'Collapse' : 'Expand'}
            >
              ⌃
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="modal-overlay">
      <div className="swap-modal">
        <div className="modal-header">
          <div className="header-content">
            <h2>{view === 'confirm' ? 'Confirm Split Swap' : 'Split Swap Details'}</h2>
            {view === 'execute' && (
              <button 
                className={`collapse-button ${!isExecuting ? 'expanded' : ''}`}
                onClick={() => setIsExecuting(!isExecuting)}
                title={!isExecuting ? 'Collapse' : 'Expand'}
              >
                ⌃
              </button>
            )}
          </div>
          <button 
            className="modal-close-button" 
            onClick={() => handleClose()}
            title="Close"
          >
            <FiX size={16} color="currentColor" />
          </button>
        </div>

        <div className="modal-content">
          {view === 'confirm' ? renderConfirmationView() : renderExecutionView()}
        </div>
      </div>
    </div>
  );
}; 