import React, { useState, useEffect } from 'react';
import { FiX } from 'react-icons/fi';
import { Principal } from '@dfinity/principal';
import { TokenMetadata } from '../types/token';
import { icrc1Service } from '../services/icrc1_service';
import { tokenService } from '../services/token';
import { backendService } from '../services/backend';
import { authService } from '../services/auth';
import { formatTokenAmount } from '../utils/format';
import { AccountParser, ParsedAccount } from '../utils/account';
import { formatHex, formatBytes, formatPrincipal } from '../utils/subaccounts';
import '../styles/SendTokenModal.css';
import { dip20Service } from '../services/dip20_service';
import { statsService } from '../services/stats';

// Utility function to convert Uint8Array to hex string
const toHexString = (bytes: Uint8Array): string => {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

interface SendTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokenId: string;
  onSuccess: () => void;
  fromSubaccount?: number[];
  fromSubaccountName?: string;
  isWithdrawMode?: boolean;
  isTransferMode?: boolean;
  isDepositMode?: boolean;
  availableSubaccounts?: { name: string; subaccount: number[] }[];
}

export const SendTokenModal: React.FC<SendTokenModalProps> = ({
  isOpen,
  onClose,
  tokenId,
  onSuccess,
  fromSubaccount,
  fromSubaccountName,
  isWithdrawMode,
  isTransferMode,
  isDepositMode,
  availableSubaccounts,
}) => {
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [showSubaccount, setShowSubaccount] = useState(false);
  const [subaccountInput, setSubaccountInput] = useState({
    type: 'hex' as 'hex' | 'bytes' | 'principal',
    value: ''
  });
  const [parsedAccount, setParsedAccount] = useState<ParsedAccount | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
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
          : await icrc1Service.getBalanceWithSubaccount(tokenId, fromSubaccount);

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
  }, [tokenId, isOpen, fromSubaccount]);

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

  // Parse account whenever recipient or subaccount inputs change
  useEffect(() => {
    if (!recipient) {
      setParsedAccount(null);
      setAccountError(null);
      return;
    }

    const parsed = AccountParser.parseAccount(
      recipient,
      showSubaccount && subaccountInput.value ? subaccountInput : undefined
    );

    if (!parsed) {
      setParsedAccount(null);
      setAccountError('Invalid account format');
      return;
    }

    setParsedAccount(parsed);
    setAccountError(null);
  }, [recipient, showSubaccount, subaccountInput.type, subaccountInput.value]);

  useEffect(() => {
    if (isOpen) {
      if (isWithdrawMode) {
        // When opening in withdraw mode, set the recipient to the user's principal
        const userPrincipal = authService.getPrincipal();
        if (userPrincipal) {
          setRecipient(userPrincipal.toString());
        }
      } else if (isTransferMode) {
        // Reset recipient when opening in transfer mode
        setRecipient('');
      }
    }
  }, [isOpen, isWithdrawMode, isTransferMode]);

  const handleMax = () => {
    if (tokenInfo.balance && tokenInfo.metadata?.fee) {
      // In withdraw mode, we can use the entire balance minus fee
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

  const handleSend = async () => {
    if (!amount || !parsedAccount || !tokenInfo.metadata) return;

    setIsSending(true);
    setError(null);

    try {
      const amountE8s = parseAmount(amount, tokenInfo.metadata.decimals);

      // Check token standard and use appropriate service
      const isDIP20 = tokenInfo.metadata.standard.toLowerCase().includes('dip20');
      
      // For DIP20, we can only use the principal (no subaccount support)
      // For ICRC1, we can use the full account with subaccount
      const result = isDIP20 
        ? await dip20Service.transfer({
            tokenId,
            to: parsedAccount.principal.toString(), // DIP20 only supports principal
            amount_e8s: amountE8s.toString()
          })
        : await icrc1Service.transfer({
            tokenId,
            to: parsedAccount.principal.toString(),
            amount_e8s: amountE8s.toString(),
            subaccount: parsedAccount.subaccount?.resolved, // Pass subaccount if present
            from_subaccount: fromSubaccount // Pass the source subaccount if present
          });

      if (!result.success) {
        throw new Error(result.error || 'Transfer failed');
      }

      setTransactionHash(result.txId || null);
      
      // Record statistics
      try {
        /*await*/ statsService.recordSend(
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
    // Validate account
    if (!parsedAccount) {
      setError('Invalid account format');
      return;
    }

    // Check if trying to use subaccount with DIP20
    const isDIP20 = tokenInfo.metadata?.standard.toLowerCase().includes('dip20');
    if (isDIP20 && parsedAccount.subaccount) {
      setError('Warning: This token uses the DIP20 standard which does not support subaccounts. The subaccount will be ignored.');
    } else {
      setError(null);
    }

    // Validate amount
    const amountBig = parseAmount(amount, tokenInfo.metadata?.decimals);
    if (amountBig <= BigInt(0)) {
      setError('Invalid amount');
      return;
    }

    if (tokenInfo.balance && amountBig + (tokenInfo.metadata?.fee || BigInt(0)) > tokenInfo.balance) {
      setError('Insufficient balance (including fee)');
      return;
    }

    setShowConfirmation(true);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="send-modal">
        <div className="send-modal-header">
          <div className="send-modal-title">
            <h2>{isTransferMode ? 'Transfer' : isWithdrawMode ? 'Withdraw' : isDepositMode ? 'Deposit' : 'Send'} {tokenInfo.metadata?.symbol || 'Tokens'}</h2>
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
          {fromSubaccount && (
            <div className="send-modal-source">
              <div className="source-label">
                {isTransferMode ? 'Transferring' : isWithdrawMode ? 'Withdrawing' : 'Sending'} from {fromSubaccountName ? `subaccount "${fromSubaccountName}"` : 'subaccount'}
              </div>
            </div>
          )}

          {!showConfirmation ? (
            <>
              {isTransferMode || isDepositMode ? (
                <div className="send-modal-recipient">
                  <label>{isTransferMode ? 'Transfer to Subaccount' : 'Deposit to Subaccount'}</label>
                  <select
                    value={(() => {
                      // Find the subaccount name that matches the current recipient
                      if (!recipient || !availableSubaccounts) return '';
                      const userPrincipal = authService.getPrincipal();
                      if (!userPrincipal) return '';
                      
                      // Parse the current recipient
                      const parsed = AccountParser.parseAccount(recipient);
                      if (!parsed?.subaccount?.resolved) return '';
                      
                      // Find matching subaccount
                      const match = availableSubaccounts.find(s => 
                        arraysEqual(Array.from(parsed.subaccount!.resolved), s.subaccount)
                      );
                      return match?.name || '';
                    })()}
                    onChange={(e) => {
                      const selected = availableSubaccounts?.find(s => s.name === e.target.value);
                      if (selected) {
                        // Set the recipient to the principal and subaccount using AccountParser
                        const userPrincipal = authService.getPrincipal();
                        if (userPrincipal) {
                          const account = {
                            principal: userPrincipal,
                            subaccount: {
                              type: 'bytes' as const,
                              value: formatBytes(selected.subaccount),
                              resolved: new Uint8Array(selected.subaccount)
                            }
                          };
                          setRecipient(AccountParser.encodeLongAccount(account));
                        }
                      } else {
                        setRecipient('');
                      }
                    }}
                    className="send-modal-subaccount-select"
                    disabled={isSending}
                  >
                    <option value="">Select a subaccount</option>
                    {availableSubaccounts?.filter(s => 
                      // Filter out the source subaccount
                      !fromSubaccount || 
                      !arraysEqual(s.subaccount, fromSubaccount)
                    ).map(s => (
                      <option key={s.name} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>
              ) : !isWithdrawMode && (
                <div className="send-modal-recipient">
                  <label>Recipient Principal ID</label>
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="Enter Principal ID"
                    className="send-modal-principal-input"
                    disabled={isSending || isWithdrawMode}
                  />
                  {parsedAccount?.original && (
                    <div className="send-modal-parsed-account">
                      <small>Detected extended address format. Resolved to:</small>
                      <div>Principal: {parsedAccount.principal.toString()}</div>
                      {parsedAccount.subaccount && (
                        <div>With subaccount: {toHexString(parsedAccount.subaccount.resolved)}</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {!isWithdrawMode && !isTransferMode && !isDepositMode && (
                <div className="send-modal-subaccount">
                  <label className="send-modal-subaccount-toggle">
                    <input
                      type="checkbox"
                      checked={showSubaccount}
                      onChange={(e) => {
                        setShowSubaccount(e.target.checked);
                        if (!e.target.checked) {
                          setSubaccountInput({ ...subaccountInput, value: '' });
                        }
                      }}
                    />
                    <span>Advanced: Send To Subaccount</span>
                  </label>

                  {showSubaccount && (
                    <div className="send-modal-subaccount-inputs">
                      <div className="send-modal-subaccount-type">
                        <select
                          value={subaccountInput.type}
                          onChange={(e) => setSubaccountInput({
                            type: e.target.value as 'hex' | 'bytes' | 'principal',
                            value: ''  // Clear value when type changes
                          })}
                          disabled={isSending}
                        >
                          <option value="hex">Hex String</option>
                          <option value="bytes">Byte Array</option>
                          <option value="principal">Principal ID</option>
                        </select>
                      </div>

                      <div className="send-modal-subaccount-value">
                        <input
                          type="text"
                          value={subaccountInput.value}
                          onChange={(e) => setSubaccountInput({
                            ...subaccountInput,
                            value: e.target.value
                          })}
                          placeholder={
                            subaccountInput.type === 'hex' ? "e.g. 0A1B2C3D..." :
                            subaccountInput.type === 'bytes' ? "e.g. 1,2,3,4..." :
                            "Enter Principal ID"
                          }
                          disabled={isSending}
                        />
                      </div>

                      <div className="send-modal-subaccount-preview">
                          <small>Resolved subaccount:</small>
                          <code>{parsedAccount?.subaccount?.resolved ? toHexString(parsedAccount.subaccount.resolved) : ''}</code>
                          <button
                            className="send-modal-encode-button"
                            onClick={() => {
                              if (parsedAccount) {
                                const longAccount = AccountParser.encodeLongAccount(parsedAccount);
                                setRecipient(longAccount);
                                setShowSubaccount(false);
                                setSubaccountInput({ type: 'hex', value: '' });
                              }
                            }}
                            disabled={isSending}
                          >
                            Convert to Extended Address String
                          </button>
                        </div>
                    </div>
                  )}

                  {accountError && (
                    <div className="send-modal-account-error">
                      {accountError}
                    </div>
                  )}
                </div>
              )}

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
                Review {isTransferMode ? 'Transfer' : isWithdrawMode ? 'Withdrawal' : isDepositMode ? 'Deposit' : 'Send'}
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
                <h3>Confirm {isTransferMode ? 'Transfer' : isWithdrawMode ? 'Withdrawal' : 'Transaction'}</h3>
                <div className="send-modal-detail-row">
                  <span>Amount:</span>
                  <span>{amount} {tokenInfo.metadata?.symbol}</span>
                </div>
                <div className="send-modal-detail-row">
                  <span>To Account:</span>
                  {isWithdrawMode ? (
                    <span className="send-modal-principal">Main Account</span>
                  ) : (isTransferMode || isDepositMode) && parsedAccount?.subaccount?.resolved ? (
                    <div className="send-modal-confirm-account">
                      {(() => {
                        // Find the subaccount name that matches
                        const match = availableSubaccounts?.find(s => 
                          arraysEqual(Array.from(parsedAccount.subaccount!.resolved), s.subaccount)
                        );
                        return match?.name ? (
                          <div className="account-section">
                            <div className="account-section-value">Subaccount "{match.name}"</div>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  ) : parsedAccount?.original ? (
                    <div className="send-modal-confirm-account">
                      <div className="account-section">
                        <div className="account-section-label">Extended Address Format:</div>
                        <div className="account-section-value">{parsedAccount.original}</div>
                      </div>
                      <div className="account-section">
                        <div className="account-section-label">Principal:</div>
                        <div className="account-section-value">{parsedAccount.principal.toString()}</div>
                      </div>
                      {parsedAccount.subaccount && (
                        <div className="account-section">
                          <div className="account-section-label">Subaccount:</div>
                          <div className="account-section-value">{toHexString(parsedAccount.subaccount.resolved)}</div>
                        </div>
                      )}
                    </div>
                  ) : parsedAccount ? (
                    <div className="send-modal-confirm-account">
                      <div className="account-section">
                        <div className="account-section-label">Principal:</div>
                        <div className="account-section-value">{parsedAccount.principal.toString()}</div>
                      </div>
                      {parsedAccount.subaccount && (
                        <div className="account-section">
                          <div className="account-section-label">Subaccount ({parsedAccount.subaccount.type}):</div>
                          <div className="account-section-value">{parsedAccount.subaccount.value}</div>
                          <div className="account-section-label">Resolves to:</div>
                          <div className="account-section-value">{toHexString(parsedAccount.subaccount.resolved)}</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="send-modal-principal">{recipient}</span>
                  )}
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
                  {isSending ? 
                    (isTransferMode ? 'Transferring...' : isWithdrawMode ? 'Withdrawing...' : isDepositMode ? 'Depositing...' : 'Sending...') : 
                    (isTransferMode ? 'Confirm Transfer' : isWithdrawMode ? 'Confirm Withdrawal' : isDepositMode ? 'Confirm Deposit' : 'Confirm Send')
                  }
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

function arraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((val, idx) => val === b[idx]);
} 