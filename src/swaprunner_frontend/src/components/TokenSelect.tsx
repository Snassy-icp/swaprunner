import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { FiChevronDown, FiSearch, FiX, FiLoader, FiPlus } from 'react-icons/fi';
import { BiWallet } from 'react-icons/bi';
import { ICPSwapExecutionService } from '../services/icpswap_execution';
import { authService } from '../services/auth';
import { useTokens } from '../contexts/TokenContext';
import { tokenService, WhitelistTokenMetadata } from '../services/token';
import { TokenMetadata } from '../types/token';
import { SendTokenModal } from './SendTokenModal';
import { formatTokenAmount } from '../utils/format';
import '../styles/TokenSelect.css';
import { isFeatureEnabled } from '../config/featureFlags';
import { AddCustomTokenModal } from './AddCustomTokenModal';
import { Principal } from '@dfinity/principal';
import { backendService } from '../services/backend';
import { priceService } from '../services/price';

interface TokenOption {
  canisterId: string;
  metadata: TokenMetadata;
}

interface TokenSelectProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  onMax?: () => void;
  mode?: 'swap' | 'wallet';
  onWalletChange?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
  isLoading?: boolean;
  hideBalance?: boolean;
}

// Helper function to handle BigInt serialization
const toJsonString = (obj: any) => {
  return JSON.stringify(obj, (key, value) =>
    typeof value === 'bigint'
      ? value.toString()
      : value
  );
};

export const TokenSelect: React.FC<TokenSelectProps> = ({ 
  value, 
  onChange, 
  label, 
  onMax, 
  mode = 'swap', 
  onWalletChange,
  isOpen: isOpenProp,
  onClose,
  isLoading = true,
  hideBalance = false
}) => {
  const { tokens, isLoadingMetadata, refreshMetadata, setTokens } = useTokens();
  const [isOpenState, setIsOpenState] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showAddCustomModal, setShowAddCustomModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [balances, setBalances] = useState<Record<string, { balance?: string, error?: string, isLoading: boolean, usdValue?: number }>>({});
  const [popularTokens, setPopularTokens] = useState<[Principal, WhitelistTokenMetadata][]>([]);
  const [isLoadingPopular, setIsLoadingPopular] = useState(false);
  const [loadedLogos, setLoadedLogos] = useState<Record<string, string>>({});
  const [customTokens, setCustomTokens] = useState<string[]>([]);
  const [walletTokens, setWalletTokens] = useState<string[]>([]);
  const [removingTokens, setRemovingTokens] = useState<Set<string>>(new Set());
  const [addingTokens, setAddingTokens] = useState<Set<string>>(new Set());
  const lastBalanceRequestRef = useRef<number>(0);
  const hasInitializedRef = useRef(false);
  const BALANCE_REQUEST_DELAY = 200; // 200ms between individual balance requests

  // Use either controlled or uncontrolled open state
  const isOpen = isOpenProp ?? isOpenState;
  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      setIsOpenState(false);
    }
  };
  
  // Fetch popular tokens when modal opens
  useEffect(() => {
    if (isOpen) {
      const fetchPopularTokens = async () => {
        setIsLoadingPopular(true);
        try {
          const popular = await tokenService.getPopularTokens(8);
          setPopularTokens(popular);
          
          // Load logos in the background with rate limiting
          for (const [principal, metadata] of popular) {
            if (metadata.hasLogo && !loadedLogos[principal.toString()]) {
              try {
                const logo = await tokenService.getTokenLogo(principal.toString());
                if (logo) {
                  setLoadedLogos(prev => ({
                    ...prev,
                    [principal.toString()]: logo
                  }));
                }
              } catch (err) {
                console.error('Error loading logo:', err);
              }
            }
          }
        } catch (error) {
          console.error('Error fetching popular tokens:', error);
        } finally {
          setIsLoadingPopular(false);
        }
      };
      fetchPopularTokens();
    }
  }, [isOpen]);

  // Fetch custom tokens when modal opens
  useEffect(() => {
    if (isOpen && isAuthenticated) {
      const fetchCustomTokens = async () => {
        try {
          const customTokenIds = await backendService.get_custom_tokens();
          setCustomTokens(customTokenIds);
        } catch (error) {
          console.error('Error fetching custom tokens:', error);
        }
      };
      fetchCustomTokens();
    }
  }, [isOpen, isAuthenticated]);

  const filteredTokens = useMemo(() => {
    const filtered = tokens.filter(token => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();

      // Safely get string values, handling array cases
      const name = Array.isArray(token.metadata?.name) 
        ? token.metadata.name[0] || ''
        : token.metadata?.name || '';
      const symbol = Array.isArray(token.metadata?.symbol)
        ? token.metadata.symbol[0] || ''
        : token.metadata?.symbol || '';
      const standard = token.metadata?.standard || '';

      // Check if query matches any token standard keywords
      const standardMatches = 
        (query === 'dip20' && standard.toLowerCase() === 'dip20') ||
        (query === 'icrc1' && standard.toLowerCase() === 'icrc1') ||
        (query === 'icrc2' && standard.toLowerCase() === 'icrc2') ||
        standard.toLowerCase().includes(query);

      return (
        token.canisterId.toLowerCase().includes(query) ||
        name.toLowerCase().includes(query) ||
        symbol.toLowerCase().includes(query) ||
        standardMatches
      );
    });

    // Sort tokens alphabetically by symbol, then prioritize custom tokens
    return filtered.sort((a, b) => {
      // Get symbols, handling array cases
      const symbolA = (Array.isArray(a.metadata?.symbol) ? a.metadata?.symbol[0] : a.metadata?.symbol)?.toLowerCase() || '';
      const symbolB = (Array.isArray(b.metadata?.symbol) ? b.metadata?.symbol[0] : b.metadata?.symbol)?.toLowerCase() || '';
      
      // First sort by custom token status
      const aIsCustom = customTokens.includes(a.canisterId);
      const bIsCustom = customTokens.includes(b.canisterId);
      if (aIsCustom && !bIsCustom) return -1;
      if (!aIsCustom && bIsCustom) return 1;
      
      // Then sort alphabetically by symbol
      return symbolA.localeCompare(symbolB);
    });
  }, [tokens, searchQuery, customTokens]);

  // Helper function to prioritize loading logos for URL param tokens
  const loadLogoForToken = async (principalStr: string) => {
    try {
      // First check if logo is in cache
      const cachedLogo = await tokenService.getCachedLogo(principalStr);
      if (cachedLogo !== undefined) {
        setLoadedLogos(prev => ({
          ...prev,
          [principalStr]: cachedLogo || '/generic_token.svg'
        }));
        return;
      }

      // If not in cache and token has logo, prioritize fetching it
      const token = tokens.find(t => t.canisterId === principalStr);
      if (token?.metadata?.hasLogo) {
        const logo = await tokenService.getTokenLogo(principalStr);
        setLoadedLogos(prev => ({
          ...prev,
          [principalStr]: logo || '/generic_token.svg'
        }));
      } else {
        setLoadedLogos(prev => ({
          ...prev,
          [principalStr]: '/generic_token.svg'
        }));
      }
    } catch (err) {
      console.error(`[TokenSelect] Error loading logo for URL param token ${principalStr}:`, err);
      setLoadedLogos(prev => ({
        ...prev,
        [principalStr]: '/generic_token.svg'
      }));
    }
  };

  // Effect to handle URL param tokens
  useEffect(() => {
    if (value && tokens.length > 0) {
      const token = tokens.find(t => t.canisterId === value);
      if (token?.metadata?.hasLogo && loadedLogos[value] === undefined) {
        loadLogoForToken(value);
      }
      if (!selectedBalance) {
        fetchSelectedTokenBalance(value);        
      }
    }
  }, [value, tokens]);

  // Keep the existing cache-only effects for the modal
  useEffect(() => {
    if (!isOpen) return;

    const loadCachedLogos = async () => {
      try {
        // Load cached logos for all visible tokens at once
        for (const token of filteredTokens) {
          // Only check cache if we haven't loaded this logo yet
          if (loadedLogos[token.canisterId] === undefined) {
            const cachedLogo = await tokenService.getCachedLogo(token.canisterId);
            if (cachedLogo !== undefined) {
              setLoadedLogos(prev => ({
                ...prev,
                [token.canisterId]: cachedLogo || '/generic_token.svg'
              }));
            } else {
              // If not in cache, use default logo
              setLoadedLogos(prev => ({
                ...prev,
                [token.canisterId]: '/generic_token.svg'
              }));
            }
          }
        }
      } catch (err) {
        console.error('[TokenSelect] Error loading cached logos:', err);
      }
    };

    loadCachedLogos();
  }, [isOpen, filteredTokens]);

  // Load cached logo for selected token even when dropdown is closed
  useEffect(() => {
    if (!value) return;
    
    const loadSelectedTokenLogo = async () => {
      try {
        const cachedLogo = await tokenService.getCachedLogo(value);
        if (cachedLogo !== undefined) {
          setLoadedLogos(prev => ({
            ...prev,
            [value]: cachedLogo || '/generic_token.svg'
          }));
        }
      } catch (err) {
        console.error(`[TokenSelect] Error loading cached logo for selected token:`, err);
      }
    };

    if (loadedLogos[value] === undefined) {
      loadSelectedTokenLogo();
    }
  }, [value]);

  // Separate effect for balance fetching
  useEffect(() => {
    if (!hasInitializedRef.current && isAuthenticated && value && tokens.length > 0) {
      const token = tokens.find(t => t.canisterId === value);
      
      if (token?.metadata) {
        fetchSelectedTokenBalance(value);
        hasInitializedRef.current = true;
      }
    }

    let intervalId: NodeJS.Timeout;
    if (isAuthenticated && value && tokens.length > 0) {
      //console.log('[TokenSelect] Setting up balance refresh interval');
      intervalId = setInterval(() => {
        const token = tokens.find(t => t.canisterId === value);
        if (token?.metadata) {
          //console.log('[TokenSelect] Interval refresh for:', value);
          fetchSelectedTokenBalance(value);
        }
      }, 60000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [value, isAuthenticated, tokens]);
/*
  // Add effect to retry balance fetch when tokens are loaded
  useEffect(() => {
    if (isAuthenticated && value && tokens.length > 0 && !hasInitializedRef.current) {
      const token = tokens.find(t => t.canisterId === value);
      if (token?.metadata) {
        console.log('[TokenSelect] Retrying balance fetch after tokens loaded');
        fetchSelectedTokenBalance(value);
        hasInitializedRef.current = true;
      }
    }
  }, [tokens, value, isAuthenticated]);
*/
  const fetchSelectedTokenBalance = async (tokenId: string) => {
    
    const token = tokens.find(t => t.canisterId === tokenId);
    if (!token?.metadata) { return; }
    
    const now = Date.now();
    const timeSinceLastRequest = now - lastBalanceRequestRef.current;
    if (timeSinceLastRequest < BALANCE_REQUEST_DELAY) {
      await new Promise(resolve => setTimeout(resolve, BALANCE_REQUEST_DELAY - timeSinceLastRequest));
    }
    lastBalanceRequestRef.current = Date.now();
    const icpSwapExecutionService = new ICPSwapExecutionService();

    setBalances(prev => ({
      ...prev,
      [tokenId]: {
        ...prev[tokenId],
        isLoading: true
      }
    }));

    try {
      const [balanceResult, usdPrice] = await Promise.all([
        icpSwapExecutionService.getBalance(tokenId),
        priceService.getTokenUSDPrice(tokenId).catch(err => {
          console.warn('[TokenSelect] Failed to fetch USD price:', err);
          return null;
        })
      ]);      

      const formattedBalance = !balanceResult.error 
        ? formatTokenAmount(balanceResult.balance_e8s, tokenId)
        : undefined;

      const usdValue = formattedBalance !== undefined && usdPrice !== null 
        ? parseFloat(formattedBalance) * usdPrice
        : undefined;

      setBalances(prev => {
        const newBalance = {
          ...prev,
          [tokenId]: {
            ...prev[tokenId],
            balance: formattedBalance,
            error: balanceResult.error,
            isLoading: false,
            usdValue
          }
        };
        return newBalance;
      });
    } catch (err) {
      console.error('[TokenSelect] Error fetching balance:', err);
      setBalances(prev => ({
        ...prev,
        [tokenId]: {
          error: 'Failed to fetch balance',
          isLoading: false
        }
      }));
    }
  };

  const updateAllBalances = async () => {
    const icpSwapExecutionService = new ICPSwapExecutionService();
    const BATCH_SIZE = 5; // Process 5 tokens at a time
    const BATCH_DELAY = 1000; // Wait 1 second between batches
    
    // Only update balances for visible tokens
    const tokensToUpdate = filteredTokens;
    
    // Set all balances to loading state first
    setBalances(prev => {
      const newBalances = { ...prev };
      tokensToUpdate.forEach(token => {
        newBalances[token.canisterId] = { ...newBalances[token.canisterId], isLoading: true };
      });
      return newBalances;
    });

    // Process tokens in batches
    for (let i = 0; i < tokensToUpdate.length; i += BATCH_SIZE) {
      const batch = tokensToUpdate.slice(i, i + BATCH_SIZE);
      
      // Process batch with rate limiting
      for (const token of batch) {
        const now = Date.now();
        const timeSinceLastRequest = now - lastBalanceRequestRef.current;
        if (timeSinceLastRequest < BALANCE_REQUEST_DELAY) {
          await new Promise(resolve => setTimeout(resolve, BALANCE_REQUEST_DELAY - timeSinceLastRequest));
        }
        lastBalanceRequestRef.current = Date.now();

        try {
          const balanceResult = await icpSwapExecutionService.getBalance(token.canisterId);
          setBalances(prev => ({
            ...prev,
            [token.canisterId]: {
              balance: !balanceResult.error && token.metadata 
                ? formatTokenAmount(balanceResult.balance_e8s, token.canisterId)
                : undefined,
              error: balanceResult.error,
              isLoading: false
            }
          }));
        } catch (err) {
          setBalances(prev => ({
            ...prev,
            [token.canisterId]: {
              error: 'Failed to fetch balance',
              isLoading: false
            }
          }));
        }
      }

      // Wait before processing next batch, but only if there are more tokens to process
      if (i + BATCH_SIZE < tokensToUpdate.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }
  };

  // Add effect to load balances when modal opens
  useEffect(() => {
    if (!isOpen || !isAuthenticated) return;

    // Only update balances if feature flag is enabled
    if (isFeatureEnabled('FETCH_ALL_TOKEN_BALANCES')) {
      updateAllBalances();
    }
  }, [isOpen, isAuthenticated]);

  // Separate effect for authentication
  useEffect(() => {
    const checkAuth = async () => {
      const isAuth = await authService.init();
      setIsAuthenticated(isAuth);
    };
    checkAuth();

    // Listen for auth state changes
    const unsubscribe = authService.onAuthStateChange(() => {
      const isAuth = authService.isAuthenticated();
      setIsAuthenticated(isAuth);
    });

    return () => {
      unsubscribe();
    };
  }, []); // Only run once on mount

  // Load wallet tokens
  const loadWalletTokens = async () => {
    if (!isAuthenticated) return;
    try {
      const tokens = await backendService.get_wallet_tokens();
      setWalletTokens(tokens);
    } catch (error) {
      console.error('Error loading wallet tokens:', error);
    }
  };

  // Consolidated effect for loading wallet tokens
  useEffect(() => {
    if (isAuthenticated && (isOpen || mode === 'wallet')) {
      loadWalletTokens();
    }
  }, [isAuthenticated, isOpen, mode]);

  const handleTokenSelect = (tokenId: string) => {
    // Reset initialization flag to allow balance fetch for new token
    hasInitializedRef.current = false;
    onChange(tokenId);
    setIsOpenState(false);
    // Fetch balance for the newly selected token
    if (isAuthenticated) {
      fetchSelectedTokenBalance(tokenId);
    }
  };

  const selectedToken = tokens.find(token => token.canisterId === value);
  const selectedBalance = selectedToken ? balances[selectedToken.canisterId] : undefined;

  // Add handler for send button click
  const handleSendClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening the token select modal
    setShowSendModal(true);
  };

  // Add handler for send success
  const handleSendSuccess = () => {
    // Refresh balances after successful send
    if (isAuthenticated) {
      updateAllBalances();
    }
  };

  const handleRemoveCustomToken = async (e: React.MouseEvent, tokenId: string) => {
    e.stopPropagation(); // Prevent token selection
    try {
      setRemovingTokens(prev => new Set([...prev, tokenId]));
      await backendService.remove_custom_token(tokenId);
      
      // Clear token cache first
      await tokenService.clearCache();
      
      // Get updated lists - this will now fetch fresh data since cache is cleared
      const [newCustomTokens, allTokens] = await Promise.all([
        backendService.get_custom_tokens(),
        tokenService.getAllTokens()
      ]);
      
      // Update custom tokens list
      setCustomTokens(newCustomTokens);
      
      // Update tokens list with fresh data
      setTokens(allTokens.map(([principal, metadata]) => ({
        canisterId: principal.toString(),
        metadata: metadata ? {
          name: metadata.name || 'Unknown Token',
          symbol: metadata.symbol || 'UNKNOWN',
          decimals: metadata.decimals ?? 8,
          fee: metadata.fee || BigInt(0),
          hasLogo: metadata.hasLogo,
          standard: metadata.standard || 'ICRC1'
        } : undefined,
        isLoading: false
      })));

      // If this was the selected token, clear the selection
      if (tokenId === value) {
        onChange('');
      }
    } catch (error) {
      console.error('Error removing custom token:', error);
    } finally {
      setRemovingTokens(prev => {
        const next = new Set(prev);
        next.delete(tokenId);
        return next;
      });
    }
  };

  // Add token to wallet
  const handleAddToWallet = async (e: React.MouseEvent, tokenId: string) => {
    e.stopPropagation(); // Prevent token selection
    try {
      setAddingTokens(prev => new Set([...prev, tokenId]));
      const success = await backendService.add_wallet_token(tokenId);
      if (success) {
        // Let parent handle the reload
        onWalletChange?.();
        // Update local state
        setWalletTokens(prev => [...prev, tokenId]);
      }
    } catch (error) {
      console.error('Error adding token to wallet:', error);
    } finally {
      setAddingTokens(prev => {
        const newSet = new Set(prev);
        newSet.delete(tokenId);
        return newSet;
      });
    }
  };

  // Remove token from wallet
  const handleRemoveFromWallet = async (e: React.MouseEvent, tokenId: string) => {
    e.stopPropagation(); // Prevent token selection
    try {
      setRemovingTokens(prev => new Set([...prev, tokenId]));
      const success = await backendService.remove_wallet_token(tokenId);
      if (success) {
        // Let parent handle the reload
        onWalletChange?.();
        // Update local state
        setWalletTokens(prev => prev.filter(id => id !== tokenId));
      }
    } catch (error) {
      console.error('Error removing token from wallet:', error);
    } finally {
      setRemovingTokens(prev => {
        const newSet = new Set(prev);
        newSet.delete(tokenId);
        return newSet;
      });
    }
  };

  // Handle logo loading errors
  const handleLogoError = (e: React.SyntheticEvent<HTMLImageElement>, tokenId: string) => {
    const img = e.target as HTMLImageElement;
    const token = tokens.find(t => t.canisterId === tokenId);
    img.src = token?.metadata?.symbol === 'ICP' ? '/icp_symbol.svg' : '/generic_token.svg';
    img.onerror = null;
  };

  // Update renderTokenOption to handle undefined metadata
  const renderTokenOption = (token: TokenOption) => {
    const isCustomToken = customTokens.includes(token.canisterId);
    const isWalletToken = walletTokens.includes(token.canisterId);
    const balance = balances[token.canisterId];
    const isRemoving = removingTokens.has(token.canisterId);
    const isAdding = addingTokens.has(token.canisterId);

    return (
      <div
        key={token.canisterId}
        className={`token-option ${value === token.canisterId ? 'selected' : ''}`}
        onClick={() => handleTokenSelect(token.canisterId)}
      >
        <div className="token-option-left">
          <div className="token-logo-container">
            <img
              src={token.metadata?.symbol === 'ICP' ? '/icp_symbol.svg' : (loadedLogos[token.canisterId] || '/generic_token.svg')}
              alt={token.metadata?.symbol || 'Token'}
              className="token-logo"
              onError={(e) => handleLogoError(e, token.canisterId)}
            />
          </div>
          <div className="token-details">
            <div className="token-name">{token.metadata?.name || token.canisterId}</div>
            <div className="token-symbol">{token.metadata?.symbol || 'Unknown'}</div>
          </div>
        </div>
        <div className="token-option-right">
          {balance && (
            <div className="token-balance">
              {balance.isLoading ? (
                <FiLoader className="spinner" />
              ) : balance.error ? (
                <span className="error">Error</span>
              ) : (
                <>{balance.balance}</>
              )}
              {balance.usdValue !== undefined && (
                <div className="token-usd-value">
                  ${balance.usdValue.toFixed(2)}
                </div>
              )}
            </div>
          )}
          {mode === 'wallet' && !isCustomToken && (
            isWalletToken ? (
              <button
                className="remove-wallet-token"
                onClick={(e) => handleRemoveFromWallet(e, token.canisterId)}
                disabled={isRemoving}
              >
                {isRemoving ? <FiLoader className="spinner" /> : <FiX />}
              </button>
            ) : (
              <button
                className="add-to-wallet"
                onClick={(e) => handleAddToWallet(e, token.canisterId)}
                disabled={isAdding}
              >
                {isAdding ? <FiLoader className="spinner" /> : <FiPlus />}
              </button>
            )
          )}
          {isCustomToken && (
            <button
              className="remove-custom-token"
              onClick={(e) => handleRemoveCustomToken(e, token.canisterId)}
              disabled={removingTokens.has(token.canisterId)}
            >
              {removingTokens.has(token.canisterId) ? <FiLoader className="spinner" /> : <FiX />}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="token-select">
      {!isOpenProp && mode !== 'wallet' && (  // Only show if not in modal mode and not in wallet mode
        <>
          <button 
            className="token-select-button" 
            onClick={() => setIsOpenState(true)}
            type="button"
            style={{ width: '100%', cursor: 'pointer' }}
          >
            {isLoading ? (
              <>
                <FiLoader className="spinner" />
                <span style={{ flex: 1 }}>Loading...</span>
                <FiChevronDown />
              </>
            ) : selectedToken?.metadata ? (
              <>
                <img 
                  src={selectedToken.metadata?.symbol === 'ICP' ? '/icp_symbol.svg' : (loadedLogos[selectedToken.canisterId] || '/generic_token.svg')}
                  alt={selectedToken.metadata.symbol}
                  className="token-logo"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    img.src = selectedToken.metadata?.symbol === 'ICP' ? '/icp_symbol.svg' : '/generic_token.svg';
                  }}
                />
                <span style={{ flex: 1 }}>{selectedToken.metadata.symbol}</span>
                <FiChevronDown />
              </>
            ) : (
              <>
                <span style={{ flex: 1 }}>Select token</span>
                <FiChevronDown />
              </>
            )}
          </button>

          {!hideBalance && isAuthenticated ? (
            <div className="label-row">
              <div className="balance-group">
                <button 
                  className={`wallet-button ${selectedBalance?.isLoading ? 'loading' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    fetchSelectedTokenBalance(value);
                  }}
                  title="Refresh balance"
                >
                  {selectedBalance?.isLoading ? (
                    <FiLoader className="spinner" />
                  ) : (
                    <BiWallet className="wallet-icon" />
                  )}
                </button>
                <span className={`balance-amount`}>
                  {selectedBalance?.error ? (
                    "Error"
                  ) : (
                    <>
                      <span className="balance-text">
                        {selectedBalance?.balance || "0"}
                      </span>
                      {selectedBalance?.usdValue !== undefined && selectedBalance.usdValue !== null && (
                        <>
                          <span className="separator">•</span>
                          <span className="balance-usd-value">
                            ${selectedBalance.usdValue.toFixed(2)}
                          </span>
                        </>
                      )}
                    </>
                  )}
                </span>
                {onMax && !selectedBalance?.error && typeof selectedBalance?.balance === 'string' && selectedBalance.balance !== "0" && (
                  <button
                    className="max-button"
                    onClick={onMax}
                    disabled={selectedBalance.isLoading}
                  >
                    MAX
                  </button>
                )}
              </div>
              <label>{label}</label>
            </div>
          ) : !hideBalance ? (
            <div className="label-row">
              <div className="balance-group">
                <button 
                  className="wallet-button"
                  disabled
                >
                  <BiWallet className="wallet-icon" />
                </button>
                <span className="balance-amount">
                  <span className="balance-text">--</span>
                </span>
              </div>
              <label>{label}</label>
            </div>
          ) : null}
        </>
      )}

      {isOpen && (
        <div className="token-modal-overlay">
          <div className="token-modal" ref={modalRef}>
            <div className="token-modal-header">
              <h2>Select a token</h2>
              <button 
                className="modal-close-button" 
                onClick={handleClose}
                title="Close"
              >
                <FiX size={16} color="currentColor" />
              </button>
            </div>

            <div className="token-selector-search">
              <div className="token-selector-search-wrapper">
                <FiSearch className="token-selector-search-icon" />
                <input
                  type="text"
                  className="token-selector-search-input"
                  placeholder="Search name or canister ID"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              {isAuthenticated && (
                <button 
                  className="add-custom-token-button" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAddCustomModal(true);
                  }}
                  title="Add Custom Token"
                >
                  +
                </button>
              )}
            </div>

            <div className="popular-tokens">
              {isLoadingPopular ? (
                <div className="loading-spinner">
                  <FiLoader />
                </div>
              ) : (
                popularTokens.map(([principal, metadata]) => (
                  <button
                    key={principal.toString()}
                    className="popular-token-button"
                    onClick={() => handleTokenSelect(principal.toString())}
                  >
                    <img 
                      src={metadata.symbol === 'ICP' ? '/icp_symbol.svg' : (loadedLogos[principal.toString()] || '/generic_token.svg')}
                      alt={metadata.symbol || 'Token'}
                      className="token-logo"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        img.src = metadata.symbol === 'ICP' ? '/icp_symbol.svg' : '/generic_token.svg';
                        img.onerror = null;
                      }}
                    />
                    <span>{metadata.symbol}</span>
                  </button>
                ))
              )}
            </div>

            <div className="token-list-section">
              <h3>Available Tokens</h3>
              <div className="token-list">
                {tokens.length === 0 ? (
                  <div className="no-tokens">No tokens available</div>
                ) : (
                  filteredTokens.map(token => {
                    if (!token.metadata) return null;
                    return renderTokenOption({
                      canisterId: token.canisterId,
                      metadata: token.metadata
                    });
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showSendModal && selectedToken && (
        <SendTokenModal
          isOpen={showSendModal}
          onClose={() => setShowSendModal(false)}
          tokenId={selectedToken.canisterId}
          onSuccess={handleSendSuccess}
        />
      )}

      {showAddCustomModal && (
        <AddCustomTokenModal
          isOpen={showAddCustomModal}
          onClose={() => {
            setShowAddCustomModal(false);
          }}
          onSuccess={async (tokenId, metadata, logo) => {
            
            // Update tokens list with the new metadata
            setTokens(prevTokens => {
              const newTokens = [...prevTokens];
              const existingIndex = newTokens.findIndex(t => t.canisterId === tokenId);
              const tokenData = {
                canisterId: tokenId,
                metadata: {
                  name: metadata.name || 'Unknown Token',
                  symbol: metadata.symbol || 'UNKNOWN',
                  decimals: metadata.decimals ?? 8,
                  fee: metadata.fee || BigInt(0),
                  hasLogo: metadata.hasLogo,
                  standard: metadata.standard || 'ICRC1'
                },
                isLoading: false
              };

              if (existingIndex >= 0) {
                newTokens[existingIndex] = tokenData;
              } else {
                newTokens.push(tokenData);
              }
              return newTokens;
            });

            // Update logo cache if a logo was returned
            if (logo) {
              setLoadedLogos(prev => ({
                ...prev,
                [tokenId]: logo
              }));
            }
            
            setShowAddCustomModal(false);            
            setIsOpenState(false);
            
            // Small delay to ensure state updates have propagated
            await new Promise(resolve => setTimeout(resolve, 100));
            
            handleTokenSelect(tokenId);
          }}
        />
      )}
    </div>
  );
}; 