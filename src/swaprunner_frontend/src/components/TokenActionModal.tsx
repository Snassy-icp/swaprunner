import React, { useState, useEffect } from 'react';
import { FiX, FiCheck, FiLoader } from 'react-icons/fi';
import { formatTokenAmount, parseTokenAmount } from '../utils/format';
import '../styles/TokenActionModal.css';

export interface TokenActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (amount_e8s: bigint) => Promise<void>;
  tokenId: string;
  tokenSymbol: string;
  maxAmount_e8s: bigint;
  fee_e8s: bigint;
  title: string;
  action: string;
  balanceLabel: string;
  subtractFees: bigint;
  error?: string | null;
}

export const TokenActionModal: React.FC<TokenActionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  tokenId,
  tokenSymbol,
  maxAmount_e8s,
  fee_e8s,
  title,
  action,
  balanceLabel,
  subtractFees = 0n,
  error: externalError = null,
}) => {
  const [amount, setAmount] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [internalError, setInternalError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setInternalError(null);
      setIsSuccess(false);
      setIsProcessing(false);
    }
  }, [isOpen]);

  const handleAmountChange = (value: string) => {
    // Remove any non-numeric characters except decimal point
    const cleanedValue = value.replace(/[^0-9.]/g, '');
    
    // Ensure only one decimal point
    const parts = cleanedValue.split('.');
    if (parts.length > 2) return;
    
    // Limit decimal places to token decimals (8)
    if (parts[1] && parts[1].length > 8) return;
    
    setAmount(cleanedValue);
    setInternalError(null);
  };

  const handleSetMax = () => {
    // Only subtract fee if subtractFee is true
    const displayAmount = formatTokenAmount(
      subtractFees > 0 ? maxAmount_e8s - subtractFees : maxAmount_e8s,
      tokenId
    );
    setAmount(displayAmount);
    setInternalError(null);
  };

  const handleConfirm = async () => {
    try {
      setInternalError(null);
      setIsProcessing(true);

      // Use parseTokenAmount which handles decimals correctly based on token metadata
      const amount_e8s = parseTokenAmount(amount, tokenId);
      
      // Validate amount
      if (amount_e8s <= BigInt(0)) {
        throw new Error('Amount must be greater than 0');
      }
      // Only check against maxAmount minus fee if subtractFee is true
      if (amount_e8s > (subtractFees > 0 ? maxAmount_e8s - subtractFees : maxAmount_e8s)) {
        throw new Error('Amount exceeds maximum available balance');
      }

      await onConfirm(amount_e8s);
      setIsSuccess(true);
      
      // Auto close after success with a delay to show success state
      setTimeout(() => {
        onClose();
      }, 2000);

    } catch (err: any) {
      setInternalError(err?.message || 'An error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  // Use external error if provided, otherwise use internal error
  const displayError = externalError || internalError;

  return (
    <div className="modal-overlay">
      <div className="token-action-modal">
        <div className="modal-header">
          <h2>{title}</h2>
          <button 
            className="modal-close-button"
            onClick={onClose}
            disabled={isProcessing}
          >
            <FiX />
          </button>
        </div>

        <div className="modal-content">
          <div className="amount-input-section">
            <div className="balance-info">
              <span>{balanceLabel}</span>
              <span className="balance-amount">
                {formatTokenAmount(maxAmount_e8s, tokenId)} {tokenSymbol}
              </span>
            </div>

            <div className="amount-input-container">
              <input
                type="text"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0.0"
                disabled={isProcessing || isSuccess || externalError !== null}
              />
              <div className="amount-input-right">
                <button 
                  className="max-button"
                  onClick={handleSetMax}
                  disabled={isProcessing || isSuccess || externalError !== null}
                >
                  MAX
                </button>
                <span className="token-symbol">{tokenSymbol}</span>
              </div>
            </div>

            <div className="fee-info">
              <span>Transaction Fee</span>
              <span>{formatTokenAmount(fee_e8s, tokenId)} {tokenSymbol}</span>
            </div>
          </div>

          {displayError && (
            <div className="error-message">
              {displayError}
            </div>
          )}

          <button
            className={`confirm-button ${isSuccess ? 'success' : ''}`}
            onClick={handleConfirm}
            disabled={!amount || isProcessing || isSuccess || externalError !== null}
          >
            {isProcessing ? (
              <>
                <FiLoader className="spinner" />
                Processing...
              </>
            ) : isSuccess ? (
              <>
                <FiCheck />
                Success!
              </>
            ) : (
              action
            )}
          </button>
        </div>
      </div>
    </div>
  );
}; 