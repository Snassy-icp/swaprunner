import React, { useState, useEffect } from 'react';
import { FiX } from 'react-icons/fi';
import { Principal } from '@dfinity/principal';
import { TokenMetadata } from '../types/token';
import { icrc1Service } from '../services/icrc1_service';
import { tokenService } from '../services/token';
import { backendService } from '../services/backend';
import { authService } from '../services/auth';
import { formatTokenAmount } from '../utils/format';
import '../styles/SendTokenModal.css';
import { dip20Service } from '../services/dip20_service';
import { statsService } from '../services/stats';

interface SendTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokenId: string;
  onSuccess: () => void;
}

export const SendTokenModal: React.FC<SendTokenModalProps> = ({
  isOpen,
  onClose,
  tokenId,
  onSuccess,
}) => {
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [tokenInfo, setTokenInfo] = useState<{
    metadata?: TokenMetadata;
    balance?: bigint;
    isLoading: boolean;
    error?: string;
  }>({ isLoading: true });
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [loadedLogos, setLoadedLogos] = useState<Record<string, string>>({});

  // Load token info when modal opens
  useEffect(() => {
    const loadTokenInfo = async () => {
      try {
        // First get metadata to determine token standard
        const metadata = await tokenService.getMetadataWithLogo(tokenId);
        
        // Get balance using appropriate service based on token standard
        const isDIP20 = metadata.standard.toLowerCase().includes('dip20');
        const balance = isDIP20 
          ? await dip20Service.getBalance(tokenId)
          : await icrc1Service.getBalance(tokenId);

        setTokenInfo({
          metadata,
          balance: balance.balance_e8s,
          isLoading: false
        });
      } catch (error) {
        console.error('Error loading token info:', error);
        setTokenInfo({
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to load token info'
        });
      }
    };

    if (isOpen) {
      loadTokenInfo();
    }
  }, [tokenId, isOpen]);

  // Load logo when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const loadLogo = async () => {
      try {
        if (tokenId && !loadedLogos[tokenId]) {
          const logo = await tokenService.getTokenLogo(tokenId);
          setLoadedLogos(prev => ({
            ...prev,
            [tokenId]: logo || '/generic_token.svg'
          }));
        }
      } catch (err) {
        console.error('Error loading logo:', err);
      }
    };

    loadLogo();
  }, [isOpen, tokenId]);

  const handleMax = () => {
    if (tokenInfo.balance && tokenInfo.metadata?.fee) {
      // Subtract the fee from the max amount
      const maxAmount = tokenInfo.balance - tokenInfo.metadata.fee;
      if (maxAmount > BigInt(0)) {
        setAmount(formatTokenAmount(maxAmount, tokenId));
      } else {
        setError('Balance too small to cover transfer fee');
      }
    }
  };

  const parseAmount = (input: string, decimals: number = 8): bigint => {
    try {
      const [integerPart, decimalPart = ''] = input.split('.');
      const paddedDecimal = decimalPart.padEnd(decimals, '0').slice(0, decimals);
      return BigInt(integerPart + paddedDecimal);
    } catch {
      return BigInt(0);
    }
  };

  const validatePrincipal = (pid: string): boolean => {
    try {
      Principal.fromText(pid);
      return true;
    } catch {
      return false;
    }
  };

  const handleSend = async () => {
    if (!amount || !recipient || !tokenInfo.metadata) return;

    setIsSending(true);
    setError(null);

    try {
      const amountE8s = parseAmount(amount, tokenInfo.metadata.decimals);

      // Check token standard and use appropriate service
      const isDIP20 = tokenInfo.metadata.standard.toLowerCase().includes('dip20');
      const result = isDIP20 
        ? await dip20Service.transfer({
            tokenId,
            to: recipient,
            amount_e8s: amountE8s.toString()
          })
        : await icrc1Service.transfer({
            tokenId,
            to: recipient,
            amount_e8s: amountE8s.toString()
          });

      if (!result.success) {
        throw new Error(result.error || 'Transfer failed');
      }

      setTransactionHash(result.txId || null);
      
      // Record statistics
      try {
        console.log('Debug - amountE8s type:', typeof amountE8s);
        console.log('Debug - amountE8s value:', amountE8s.toString());
        console.log('Debug - amountE8s raw:', amountE8s);
        await statsService.recordSend(
          authService.getPrincipal()!,
          tokenId,
          amountE8s.toString()
        );
      } catch (error) {
        console.error('Failed to record send stats:', error);
        // Fire and forget - no error handling per spec
      }

      onSuccess();
      // Don't close the modal yet, show success state
    } catch (error) {
      console.error('Send error:', error);
      setError(error instanceof Error ? error.message : 'Failed to send tokens');
      setShowConfirmation(false);
    } finally {
      setIsSending(false);
    }
  };

  const handleProceed = () => {
    // Validate inputs before showing confirmation
    if (!validatePrincipal(recipient)) {
      setError('Invalid Principal ID');
      return;
    }

    const amountBig = parseAmount(amount, tokenInfo.metadata?.decimals);
    if (amountBig <= BigInt(0)) {
      setError('Invalid amount');
      return;
    }

    if (tokenInfo.balance && amountBig + (tokenInfo.metadata?.fee || BigInt(0)) > tokenInfo.balance) {
      setError('Insufficient balance (including fee)');
      return;
    }

    setError(null);
    setShowConfirmation(true);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="send-modal">
        <div className="send-modal-header">
          <div className="send-modal-title">
            <h2>Send {tokenInfo.metadata?.symbol || 'Tokens'}</h2>
            {tokenInfo.metadata && (
              <img 
                src={loadedLogos[tokenId] || '/generic_token.svg'}
                alt={tokenInfo.metadata.symbol}
                className="send-modal-title-logo"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  img.src = tokenInfo.metadata?.symbol === 'ICP' ? '/icp_symbol.svg' : '/generic_token.svg';
                }}
              />
            )}
          </div>
          <button 
            className="modal-close-button" 
            onClick={onClose}
            title="Close"
          >
            <FiX size={16} color="currentColor" />
          </button>
        </div>

        <div className="send-modal-content">
          {!showConfirmation ? (
            <>
              <div className="send-modal-recipient">
                <label>Recipient Principal ID</label>
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="Enter Principal ID"
                  className="send-modal-principal-input"
                  disabled={isSending}
                />
              </div>

              <div className="send-modal-amount">
                <div className="send-modal-amount-row">
                  <input
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.0"
                    className="send-modal-amount-input"
                    disabled={isSending}
                  />
                </div>
                <div className="send-modal-amount-details">
                  <div className="send-modal-balance">
                    <span>Balance: {tokenInfo.balance ? 
                      formatTokenAmount(tokenInfo.balance, tokenId) : 
                      'Loading...'
                    }</span>
                    <button 
                      className="send-modal-max"
                      onClick={handleMax}
                      disabled={isSending || !tokenInfo.balance}
                    >
                      MAX
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="send-modal-error">
                  {error}
                </div>
              )}

              <button
                className="send-modal-proceed"
                onClick={handleProceed}
                disabled={isSending || !amount || !recipient}
              >
                Review Send
              </button>
            </>
          ) : transactionHash ? (
            <div className="send-modal-success">
              <div className="send-modal-success-message">
                Transaction Successful!
              </div>
              <div className="send-modal-tx-details">
                <p>Transaction Hash:</p>
                <code>{transactionHash}</code>
              </div>
              <button
                className="send-modal-close-success"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <div className="send-modal-confirm-details">
                <h3>Confirm Transaction</h3>
                <div className="send-modal-detail-row">
                  <span>Amount:</span>
                  <span>{amount} {tokenInfo.metadata?.symbol}</span>
                </div>
                <div className="send-modal-detail-row">
                  <span>Recipient:</span>
                  <span className="send-modal-principal">{recipient}</span>
                </div>
                <div className="send-modal-detail-row">
                  <span>Fee:</span>
                  <span>{tokenInfo.metadata?.fee ? 
                    formatTokenAmount(tokenInfo.metadata.fee, tokenId) : 
                    '0'
                  } {tokenInfo.metadata?.symbol}</span>
                </div>
                <div className="send-modal-detail-row total">
                  <span>Total:</span>
                  <span>{tokenInfo.metadata?.fee ? 
                    formatTokenAmount(parseAmount(amount) + tokenInfo.metadata.fee, tokenId) : 
                    amount
                  } {tokenInfo.metadata?.symbol}</span>
                </div>
              </div>

              {error && (
                <div className="send-modal-error">
                  {error}
                </div>
              )}

              <div className="send-modal-confirm-buttons">
                <button
                  className="send-modal-back"
                  onClick={() => setShowConfirmation(false)}
                  disabled={isSending}
                >
                  Back
                </button>
                <button
                  className="send-modal-confirm"
                  onClick={handleSend}
                  disabled={isSending}
                >
                  {isSending ? 'Sending...' : 'Confirm Send'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}; 