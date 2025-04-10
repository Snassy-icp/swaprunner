import React, { useState, useEffect } from 'react';
import { FiX, FiCheck, FiLoader, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { Principal } from '@dfinity/principal';
import { TokenMetadata } from '../types/token';
import { useTokens } from '../contexts/TokenContext';
import { useTokenSecurity } from '../contexts/TokenSecurityContext';
import { formatTokenAmount } from '../utils/format';
import '../styles/SwapModal.css';
import { SwapStep } from '../types/swap';
import { tokenService } from '../services/token';
import { useSwapTimer } from '../hooks/useSwapTimer';
import { TimerDisplay } from './TimerDisplay';
import { checkKongWarnings } from '../utils/swapWarnings';
import { SwapWarnings } from './SwapWarnings';

interface SwapDetails {
  fromToken: {
    symbol: string;
    amount_e8s: string;  // Base unit amount
    original_amount_e8s: string;  // Base unit amount
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
}

interface KongSwapModalProps {
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
  // Use separate timer instance per step like SwapModal
  const { stepTimers } = useSwapTimer([step]);
  
  return (
    <div 
      key={index} 
      className={`execution-step ${step.status} ${expandedSteps.has(index) ? 'expanded' : ''}`}
    >
      <div className="step-header" onClick={() => toggleStep(index)}>
        <div className="step-status">
          {step.status === 'complete' && <FiCheck className="status-icon complete" />}
          {step.status === 'loading' && <FiLoader className="status-icon loading" />}
          {step.status === 'pending' && <div className="status-icon pending" />}
          {step.status === 'error' && <div className="status-icon error" />}
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
              {step.details.amount && (
                <div className="detail-row">
                  <span>Amount</span>
                  <span>{step.details.amount} {step.details.tokenSymbol}</span>
                </div>
              )}
              {step.details.amountOut && (
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
              {step.details.kongTransactionId && (
                <div className="detail-row">
                  <span>Transaction ID</span>
                  <span className="monospace">{step.details.kongTransactionId}</span>
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

export const KongSwapModal: React.FC<KongSwapModalProps> = ({
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
  const { isTokenSuspended, getTokenSuspensionDetails } = useTokenSecurity();
  const [loadedLogos, setLoadedLogos] = useState<Record<string, string>>({});
  
  // Use a single timer instance for overall duration
  const { timer } = useSwapTimer(steps);

  const fromToken = tokens.find(t => t.canisterId === details.fromToken.canisterId);
  const toToken = tokens.find(t => t.canisterId === details.toToken.canisterId);

  const fromTokenInfo = fromToken?.metadata ? { metadata: fromToken.metadata, isLoading: false } : { isLoading: true };
  const toTokenInfo = toToken?.metadata ? { metadata: toToken.metadata, isLoading: false } : { isLoading: true };

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

  // Reset states when modal closes
  useEffect(() => {
    if (!isOpen) {
      setExpandedSteps(new Set());
      setUserInteractedSteps(new Set());
      setError(null);
      setIsExecuting(true);
      setIsSuccess(false);
    }
  }, [isOpen]);

  // Effect to handle success state and auto-expand on error
  useEffect(() => {
    if (steps.every(step => step.status === 'complete' || step.status === 'skipped')) {
      setIsSuccess(true);
      onSuccess();
    }
    // Auto-expand when there's an error
    if (steps.some(step => step.status === 'error')) {
      setIsExecuting(false);
    }
  }, [steps, onSuccess]);

  // Debug state changes
  useEffect(() => {
    console.log('KongSwapModal view changed:', view);
  }, [view]);

  useEffect(() => {
    console.log('KongSwapModal isSuccess changed:', isSuccess);
  }, [isSuccess]);

  useEffect(() => {
    console.log('KongSwapModal steps changed:', steps);
  }, [steps]);

  useEffect(() => {
    console.log('KongSwapModal isOpen changed:', isOpen);
  }, [isOpen]);

  useEffect(() => {
    console.log('KongSwapModal mounted');
    return () => {
      console.log('KongSwapModal unmounting');
    };
  }, []);

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

  const handleClose = () => {
    console.log('KongSwapModal handleClose called, isSuccess:', isSuccess);
    onClose();
  };

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

  if (!isOpen) return null;

  const renderConfirmationView = () => (
    <div className="swap-confirmation">
      <SwapWarnings 
        warnings={checkKongWarnings({
          fromToken: {
            canisterId: details.fromToken.canisterId,
            metadata: fromToken?.metadata
          },
          toToken: {
            canisterId: details.toToken.canisterId,
            metadata: toToken?.metadata
          },
          slippageTolerance: details.slippageTolerance,
          tokenSecurity: {
            isTokenSuspended,
            getTokenSuspensionDetails
          }
        })}
      />
      <div className="swap-amounts">
        <div className="amount-row">
          <div className="amount-label">You pay</div>
          <div className="amount-content">
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
              {fromTokenInfo.metadata ? 
                formatTokenAmount(BigInt(details.fromToken.original_amount_e8s), details.fromToken.canisterId)
                : details.fromToken.original_amount_e8s
              } {fromTokenInfo.metadata?.symbol || details.fromToken.symbol}
            </div>
          </div>
        </div>
        <div className="amount-row">
          <div className="amount-label">You Receive</div>
          <div className="amount-content">
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
              {toTokenInfo.metadata ? 
                formatTokenAmount(BigInt(details.toToken.amount_e8s), details.toToken.canisterId)
                : details.toToken.amount_e8s
              } {toTokenInfo.metadata?.symbol || details.toToken.symbol}
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
          <span className={details.priceImpact > 2 ? 'warning' : ''}>{details.priceImpact}%</span>
        </div>
        <div className="detail-row">
          <span>Slippage tolerance</span>
          <span>{details.slippageTolerance}%</span>
        </div>
        <div className="detail-row">
          <span>Minimum received</span>
          <span>
            {toTokenInfo.metadata ? 
              formatTokenAmount(BigInt(details.minimumReceived_e8s), details.toToken.canisterId)
              : details.minimumReceived_e8s
            } {toTokenInfo.metadata?.symbol || details.toToken.symbol}
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
      >
        Confirm Kong Swap
      </button>
    </div>
  );

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
          onClick={() => setIsExecuting(!isExecuting)}
        >
          <div className="swap-summary">
            <div className="token-pair">
              <img 
                src={loadedLogos[details.fromToken.canisterId] || '/generic_token.svg'}
                alt={fromTokenInfo.metadata?.symbol}
                className="token-logo"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  img.src = fromTokenInfo.metadata?.symbol === 'ICP' ? '/icp_symbol.svg' : '/generic_token.svg';
                }}
              />
              <span className="arrow">→</span>
              <img 
                src={loadedLogos[details.toToken.canisterId] || '/generic_token.svg'}
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
                formatTokenAmount(BigInt(details.fromToken.amount_e8s), details.fromToken.canisterId)
                : details.fromToken.amount_e8s
              } {fromTokenInfo.metadata?.symbol}</span>
              <span className="arrow">→</span>
              <span>{toTokenInfo.metadata ? 
                formatTokenAmount(BigInt(details.toToken.amount_e8s), details.toToken.canisterId)
                : details.toToken.amount_e8s
              } {toTokenInfo.metadata?.symbol}</span>
              <TimerDisplay
                startTime={timer.startTime}
                endTime={timer.endTime}
                isRunning={timer.isRunning}
              />
            </div>
          </div>

          <div className={`compact-progress ${isExecuting ? 'visible' : ''}`}>
            <div className="progress-bar-container">
              <div 
                className="progress-bar" 
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="current-step">
              <span>{currentStep}</span>
              <div className={`status-icon ${isLoading ? 'loading' : isComplete ? 'complete' : hasError ? 'error' : ''}`}>
                {isLoading ? (
                  <FiLoader />
                ) : isComplete ? (
                  <FiCheck />
                ) : hasError ? (
                  <FiX />
                ) : null}
              </div>
              <TimerDisplay
                startTime={timer.startTime}
                endTime={timer.endTime}
                isRunning={timer.isRunning}
              />
            </div>
          </div>
        </div>

        <div className={`execution-content ${!isExecuting ? 'expanded' : 'collapsed'}`}>
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

          {hasError && (
            <div className="execution-error">
              <div className="error-message">
                <FiX className="error-icon" />
                <span>Swap failed. Please try a new swap.</span>
              </div>
              <button className="close-button" onClick={handleClose}>Close</button>
            </div>
          )}

          {isComplete && (
            <div className="execution-success">
              <div className="success-icon">✓</div>
              <p>Swap completed successfully!</p>
              <button className="close-button" onClick={handleClose}>Close</button>
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
            <h2>{view === 'confirm' ? 'Confirm Kong Swap' : 'Kong Swap Details'}</h2>
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
            onClick={handleClose}
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