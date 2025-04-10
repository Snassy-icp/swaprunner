import React, { useState, useEffect } from 'react';
import { FiX, FiCheck, FiLoader, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { Principal } from '@dfinity/principal';
import { tokenService } from '../services/token';
import { TokenMetadata } from '../types/token';
import { useTokens } from '../contexts/TokenContext';
import { formatTokenAmount } from '../utils/format';
import '../styles/SwapModal.css';
import { SwapStep } from '../types/swap';
import { useSwapTimer } from '../hooks/useSwapTimer';
import { TimerDisplay } from './TimerDisplay';
import { checkIcpSwapWarnings } from '../utils/swapWarnings';
import { SwapWarnings } from './SwapWarnings';
import { useTokenSecurity } from '../contexts/TokenSecurityContext';

interface SwapDetails {
  fromToken: {
    symbol: string;
    amount_e8s: string;  // Base unit amount
    original_amount_e8s: string;
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
    from: string;  // Fee in input token
    to: string;    // Fee in output token
  };
  dex: 'icpswap' | 'kong';
  poolId?: string;
  depositNeeds?: {
    fromDeposited: bigint;
    fromUndeposited: bigint;
    fromWallet: bigint;
    adjustedAmount: bigint;
    originalAmount: bigint;
  };
}

interface TokenInfo {
  metadata?: TokenMetadata;
  isLoading: boolean;
  error?: string;
}

interface SwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  details: SwapDetails;
  onConfirm: () => void;
  onSuccess: () => void;
  steps: SwapStep[];
}

interface StepItemProps {
  step: SwapStep;
  index: number;
  expandedSteps: Set<number>;
  toggleStep: (index: number) => void;
}

const StepItem: React.FC<StepItemProps> = ({ step, index, expandedSteps, toggleStep }) => {
  const { stepTimers } = useSwapTimer([step]);
  
  return (
    <div className={`execution-step ${step.status} ${expandedSteps.has(index) ? 'expanded' : ''}`}>
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
              {step.details.amount && !step.title.toLowerCase().includes('withdraw') && (
                <div className="detail-row">
                  <span>Amount</span>
                  <span>{step.details.amount} {step.details.tokenSymbol}</span>
                </div>
              )}
              {step.details.amountOut && step.title.toLowerCase().includes('withdraw') && (
                <div className="detail-row">
                  <span>Output Amount</span>
                  <span>{step.details.amountOut} {step.details.tokenOutSymbol}</span>
                </div>
              )}
              {step.details.amountOut && !step.title.toLowerCase().includes('withdraw') && (
                <div className="detail-row">
                  <span>Output Amount</span>
                  <span>{step.details.amountOut} {step.details.tokenOutSymbol}</span>
                </div>
              )}
              {step.details.canisterId && (
                <div className="detail-row">
                  <span>Canister ID</span>
                  <span className="monospace">{step.details.canisterId instanceof Principal ? step.details.canisterId.toString() : step.details.canisterId}</span>
                </div>
              )}
              {step.details.transactionId && step.status === 'complete' && (
                <div className="detail-row">
                  <span>Transaction ID</span>
                  <span className="monospace">{step.details.transactionId}</span>
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

export const SwapModal: React.FC<SwapModalProps> = ({
  isOpen,
  onClose,
  details,
  onConfirm,
  onSuccess,
  steps,
}) => {
  const [view, setView] = useState<'confirm' | 'execute'>('confirm');
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [userInteractedSteps, setUserInteractedSteps] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);
  const { tokens } = useTokens();
  const [loadedLogos, setLoadedLogos] = useState<Record<string, string>>({});
  const { isTokenSuspended, getTokenSuspensionDetails } = useTokenSecurity();
  
  // Auto-expand steps with details
  useEffect(() => {
    if (view === 'execute') {
      const stepsToExpand = new Set<number>();
      
      steps.forEach((step, index) => {
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
  }, [steps, view, userInteractedSteps]);

  // Effect to handle success state and auto-expand on error
  useEffect(() => {
    if (steps.every(step => step.status === 'complete' || step.status === 'skipped')) {
      setIsSuccess(true);
    }
    // Auto-expand when there's an error
    if (steps.some(step => step.status === 'error')) {
      setIsExecutionViewExpanded(true);
    }
  }, [steps]);

  // Load logos for the tokens in the modal
  useEffect(() => {
    if (!isOpen) return;

    const loadLogos = async () => {
      try {
        // Load logo for fromToken
        if (details.fromToken.canisterId && !loadedLogos[details.fromToken.canisterId]) {
          const logo = await tokenService.getTokenLogo(details.fromToken.canisterId);
          setLoadedLogos(prev => ({
            ...prev,
            [details.fromToken.canisterId]: logo || '/generic_token.svg'
          }));
        }

        // Load logo for toToken
        if (details.toToken.canisterId && !loadedLogos[details.toToken.canisterId]) {
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
  }, [isOpen, details.fromToken.canisterId, details.toToken.canisterId]);

  const fromToken = tokens.find(t => t.canisterId === details?.fromToken?.canisterId);
  const toToken = tokens.find(t => t.canisterId === details?.toToken?.canisterId);

  const fromTokenInfo = fromToken?.metadata ? { metadata: fromToken.metadata, isLoading: false } : { isLoading: true };
  const toTokenInfo = toToken?.metadata ? { metadata: toToken.metadata, isLoading: false } : { isLoading: true };

  const [isExecutionViewExpanded, setIsExecutionViewExpanded] = useState(false);

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

  const handleClose = () => {
    if (isSuccess) {
      onSuccess();
    }
    onClose();
  };

  // Get timer state for overall duration
  const { timer } = useSwapTimer([...steps]);

  if (!isOpen) return null;

  const renderConfirmationView = () => {
    // Check if either token is suspended
    const fromTokenSuspended = isTokenSuspended(details.fromToken.canisterId);
    const toTokenSuspended = isTokenSuspended(details.toToken.canisterId);
    
    // Get all warnings
    const warnings = checkIcpSwapWarnings({
      fromToken: {
        canisterId: details.fromToken.canisterId,
        metadata: fromToken?.metadata
      },
      toToken: {
        canisterId: details.toToken.canisterId,
        metadata: toToken?.metadata
      },
      slippageTolerance: details.slippageTolerance,
      depositNeeds: details.depositNeeds,
      tokenSecurity: {
        isTokenSuspended,
        getTokenSuspensionDetails
      }
    });

    // Check if there are any suspension warnings
    const hasSuspendedWarning = warnings.some(warning => warning.type === 'suspended');

    return (
      <div className="swap-confirmation">
        <SwapWarnings warnings={warnings} />
        <div className="swap-amounts">
          <div className="amount-row">
            <div className="amount-label">You pay</div>
            <div className="amount-content">
              <div className="main-amount">
                {fromTokenInfo.metadata && (
                  <img 
                    src={loadedLogos[details.fromToken.canisterId] || '/generic_token.svg'}
                    alt={typeof fromTokenInfo.metadata.symbol === 'string' ? fromTokenInfo.metadata.symbol : Array.isArray(fromTokenInfo.metadata.symbol) ? fromTokenInfo.metadata.symbol[0] : 'Unknown'}
                    className="token-logo"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.src = fromTokenInfo.metadata?.symbol === 'ICP' ? '/icp_symbol.svg' : '/generic_token.svg';
                    }}
                  />
                )}
                <div className="amount-value">
                  {formatTokenAmount(BigInt(details.fromToken.original_amount_e8s), details.fromToken.canisterId)} {fromTokenInfo.metadata?.symbol || details.fromToken.symbol}
                </div>
              </div>
            </div>
          </div>
          <div className="amount-row">
            <div className="amount-label">You get</div>
            <div className="amount-content">
              <div className="main-amount">
                {toTokenInfo.metadata && (
                  <img 
                    src={loadedLogos[details.toToken.canisterId] || '/generic_token.svg'}
                    alt={typeof toTokenInfo.metadata.symbol === 'string' ? toTokenInfo.metadata.symbol : Array.isArray(toTokenInfo.metadata.symbol) ? toTokenInfo.metadata.symbol[0] : 'Unknown'}
                    className="token-logo"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.src = toTokenInfo.metadata?.symbol === 'ICP' ? '/icp_symbol.svg' : '/generic_token.svg';
                    }}
                  />
                )}
                <div className="amount-value">
                  {formatTokenAmount(BigInt(details.toToken.amount_e8s), details.toToken.canisterId)} {toTokenInfo.metadata?.symbol || details.toToken.symbol}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="swap-details">
          <div className="detail-row">
            <span>Price</span>
            <span>
              1 {fromTokenInfo.metadata?.symbol || details.fromToken.symbol} = {details.price} {toTokenInfo.metadata?.symbol || details.toToken.symbol}
              {details.priceUSD > 0 && ` ($${details.priceUSD.toFixed(2)})`}
            </span>
          </div>
          <div className="detail-row">
            <span>Liquidity Provider Fee</span>
            <span>{details.lpFee}</span>
          </div>
          <div className="detail-row">
            <span>Price Impact</span>
            <span className={details.priceImpact > 2 ? 'warning' : ''}>{details.priceImpact.toFixed(2)}%</span>
          </div>
          <div className="detail-row">
            <span>Slippage tolerance</span>
            <span>{details.slippageTolerance}%</span>
          </div>
          <div className="detail-row">
            <span>Minimum received</span>
            <span>
              {formatTokenAmount(BigInt(details.minimumReceived_e8s), details.toToken.canisterId)} {toTokenInfo.metadata?.symbol || details.toToken.symbol}
            </span>
          </div>
          <div className="detail-row">
            <span>Transfer fees</span>
            <div className="fee-details">
              <span>{details.estimatedFees.from} {fromTokenInfo.metadata?.symbol || details.fromToken.symbol}</span>
              <span>{details.estimatedFees.to} {toTokenInfo.metadata?.symbol || details.toToken.symbol}</span>
            </div>
          </div>
        </div>

        <button 
          className="confirm-swap-button"
          onClick={() => {
            setView('execute');
            onConfirm();
          }}
          disabled={hasSuspendedWarning}
        >
          {hasSuspendedWarning ? 'Swap Disabled - Token Suspended' : `Confirm ${details.dex === 'kong' ? 'Kong' : 'ICPSwap'} Swap`}
        </button>
      </div>
    );
  };

  const renderExecutionView = () => {
    // Calculate progress
    const completedSteps = steps.filter(step => step.status === 'complete' || step.status === 'skipped').length;
    const progress = (completedSteps / steps.length) * 100;
    
    const currentStep = steps.find(step => step.status === 'loading')?.title || 
                       steps.find(step => step.status === 'pending')?.title ||
                       (completedSteps === steps.length ? 'Swap completed' : '');

    const hasError = steps.some(step => step.status === 'error');
    const isLoading = steps.some(step => step.status === 'loading');
    const isComplete = completedSteps === steps.length;

    return (
      <div className="swap-execution">
        <div 
          className="swap-execution-header"
          onClick={() => setIsExecutionViewExpanded(!isExecutionViewExpanded)}
        >
          <div className="swap-summary">
            <div className="token-pair">
              <img src={loadedLogos[details.fromToken.canisterId] || '/generic_token.svg'} alt={fromTokenInfo.metadata?.symbol} className="token-logo" />
              <span className="arrow">→</span>
              <img src={loadedLogos[details.toToken.canisterId] || '/generic_token.svg'} alt={toTokenInfo.metadata?.symbol} className="token-logo" />
            </div>
            <div className="swap-amounts-summary">
              <span>{formatTokenAmount(BigInt(details.fromToken.amount_e8s), details.fromToken.canisterId)} {fromTokenInfo.metadata?.symbol}</span>
              <span className="arrow">→</span>
              <span>{formatTokenAmount(BigInt(details.toToken.amount_e8s), details.toToken.canisterId)} {toTokenInfo.metadata?.symbol}</span>
            </div>
            <TimerDisplay
              startTime={timer.startTime}
              endTime={timer.endTime}
              isRunning={timer.isRunning}
            />
          </div>

          <div className={`compact-progress ${!isExecutionViewExpanded ? 'visible' : ''}`}>
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: `${progress}%` }} />
            </div>
            <div className="current-step">
              <span>{currentStep}</span>
              <div className={`status-icon ${isLoading ? 'loading' : isComplete ? 'complete' : hasError ? 'error' : ''}`}>
                {isLoading ? <FiLoader /> : isComplete ? <FiCheck /> : hasError ? <FiX /> : null}
              </div>
            </div>
          </div>
        </div>

        <div className={`execution-content ${isExecutionViewExpanded ? 'expanded' : 'collapsed'}`}>
          {details.dex === 'icpswap' && (
            <div className="execution-info">
              If you have sufficient balance in the swap pool, you may be able to swap
              directly without needing to deposit.
            </div>
          )}

          <div className="execution-steps">
            {steps.map((step, index) => (
              <StepItem
                key={index}
                step={step}
                index={index}
                expandedSteps={expandedSteps}
                toggleStep={toggleStep}
              />
            ))}
          </div>

          {steps.some(step => step.status === 'error') && (
            <div className="execution-error">
              <div className="error-message">
                <FiX className="error-icon" />
                <span>Swap failed. Please try a new swap.</span>
              </div>
              <button className="close-button" onClick={() => handleClose()}>Close</button>
            </div>
          )}

          {steps.every(step => step.status === 'complete' || step.status === 'skipped') && (
            <div className="execution-success">
              <div className="success-icon">✓</div>
              <p>Swap completed successfully!</p>
              <button className="close-button" onClick={() => handleClose()}>Close</button>
            </div>
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
            <h2>{view === 'confirm' ? `Confirm ${details.dex === 'kong' ? 'Kong' : 'ICPSwap'} Swap` : `${details.dex === 'kong' ? 'Kong' : 'ICPSwap'} Swap Details`}</h2>
            {view === 'execute' && (
              <button 
                className={`collapse-button ${isExecutionViewExpanded ? 'expanded' : ''}`}
                onClick={() => setIsExecutionViewExpanded(!isExecutionViewExpanded)}
                title={isExecutionViewExpanded ? 'Collapse' : 'Expand'}
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