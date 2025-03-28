import { FiPlus, FiLoader, FiChevronDown, FiChevronUp, FiRefreshCw, FiCreditCard, FiLogIn, FiSend, FiDownload, FiX } from 'react-icons/fi';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TokenSelect } from '../components/TokenSelect';
import { SendTokenModal } from '../components/SendTokenModal';
import { authService } from '../services/auth';
import { tokenService } from '../services/token';
import { ICPSwapExecutionService } from '../services/icpswap_execution';
import { formatTokenAmount } from '../utils/format';
import { TokenMetadata } from '../types/token';
import { priceService } from '../services/price';
import { backendService } from '../services/backend';
import '../styles/Wallet.css';
import { AddSubaccountModal } from '../components/AddSubaccountModal';
import '../styles/AddSubaccountModal.css';
import { Principal } from '@dfinity/principal';
import { formatHex, formatBytes, formatPrincipal } from '../utils/subaccounts';
import { dip20Service } from '../services/dip20_service';
import { icrc1Service } from '../services/icrc1_service';

const icpSwapExecutionService = new ICPSwapExecutionService();

interface NamedSubaccount {
  name: string;
  subaccount: number[];
  created_at: bigint;
}

interface WalletToken {
  canisterId: string;
  metadata: TokenMetadata;
  balance: string;
  usdValue: number | null;
  usdPrice: number | null;
  isLoadingMetadata: boolean;
  isLoadingBalance: boolean;
  isLoadingUSDPrice: boolean;
  subaccounts: NamedSubaccount[];
  isLoadingSubaccounts: boolean;
}

interface SubaccountBalance {
  balance_e8s?: bigint;
  isLoading: boolean;
  error?: string;
}

type SubaccountBalances = Record<string, Record<string, SubaccountBalance>>;

export const WalletPage: React.FC = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [tokens, setTokens] = useState<Record<string, WalletToken>>({});
  const [subaccountBalances, setSubaccountBalances] = useState<SubaccountBalances>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showTokenSelect, setShowTokenSelect] = useState(false);
  const [expandedTokens, setExpandedTokens] = useState<Set<string>>(new Set());
  const [expandedSubaccounts, setExpandedSubaccounts] = useState<Set<string>>(new Set());
  const [showSendModal, setShowSendModal] = useState(false);
  const [selectedTokenForSend, setSelectedTokenForSend] = useState<string | null>(null);
  const [selectedSubaccountForSend, setSelectedSubaccountForSend] = useState<number[] | null>(null);
  const [hideEmptyBalances, setHideEmptyBalances] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const [showAddSubaccountModal, setShowAddSubaccountModal] = useState(false);
  const [selectedTokenForSubaccount, setSelectedTokenForSubaccount] = useState<string | null>(null);

  useEffect(() => {
    // Check authentication status on mount
    authService.init().then((authenticated) => {
      setIsAuthenticated(authenticated);
    });

    // Listen for auth state changes
    const unsubscribe = authService.onAuthStateChange(() => {
      setIsAuthenticated(authService.isAuthenticated());
    });

    return () => unsubscribe();
  }, []);

  // Update a single token's data
  const updateToken = (
    canisterId: string,
    updates: Partial<WalletToken>
  ) => {
    setTokens(prevTokens => {
      const token = prevTokens[canisterId];
      if (!token) return prevTokens;

      return {
        ...prevTokens,
        [canisterId]: {
          ...token,
          ...updates,
          // Ensure subaccounts is always an array
          subaccounts: updates.subaccounts || token.subaccounts || []
        }
      };
    });
  };

  // Load subaccounts for a single token
  const loadTokenSubaccounts = async (id: string) => {
    try {
      updateToken(id, { isLoadingSubaccounts: true });
      const actor = await backendService.getActor();
      const result = await actor.get_named_subaccounts(Principal.fromText(id));
      if ('ok' in result) {
        updateToken(id, {
          subaccounts: result.ok || [], // Ensure we always have an array
          isLoadingSubaccounts: false
        });
      } else {
        updateToken(id, {
          subaccounts: [], // Initialize as empty array on error
          isLoadingSubaccounts: false
        });
        console.error('Error loading subaccounts:', result.err);
      }
    } catch (error) {
      console.error('Error loading subaccounts:', error);
      updateToken(id, {
        subaccounts: [], // Initialize as empty array on error
        isLoadingSubaccounts: false
      });
    }
  };

  // Update loadTokenMetadata to not automatically load subaccounts
  const loadTokenMetadata = async (id: string) => {
    const startTime = performance.now();
    try {
      const metadata = await tokenService.getMetadataWithLogo(id);
      const endTime = performance.now();
      updateToken(id, { 
        metadata,
        isLoadingMetadata: false 
      });
    } catch (error) {
      const endTime = performance.now();
      console.error(`[${new Date().toISOString()}] Error loading metadata for ${id} after ${(endTime - startTime).toFixed(2)}ms:`, error);
      updateToken(id, {
        metadata: {
          name: 'Error loading token',
          symbol: 'ERROR',
          decimals: 8,
          fee: BigInt(0),
          hasLogo: false,
          standard: 'UNKNOWN'
        },
        isLoadingMetadata: false
      });
    }
  };

  // Load balance for a single token
  const loadTokenBalance = async (id: string) => {
    const startTime = performance.now();
    try {
      const executionService = new ICPSwapExecutionService();
      const balanceResult = await executionService.getBalance(id);
      const endTime = performance.now();
      console.log(`[${new Date().toISOString()}] Loaded balance for ${id} in ${(endTime - startTime).toFixed(2)}ms`);
      
      // Get USD price after balance is loaded
      updateToken(id, {
        balance: formatTokenAmount(balanceResult.balance_e8s, id),
        isLoadingBalance: false,
        isLoadingUSDPrice: true
      });

      try {
        const usdPrice = await priceService.getTokenUSDPrice(id);
        const balance = Number(formatTokenAmount(balanceResult.balance_e8s, id));
        const usdValue = balance * usdPrice;
        updateToken(id, {
          usdValue,
          usdPrice,
          isLoadingUSDPrice: false
        });
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error loading USD price for ${id}:`, error);
        updateToken(id, {
          usdValue: null,
          usdPrice: null,
          isLoadingUSDPrice: false
        });
      }
    } catch (error) {
      const endTime = performance.now();
      console.error(`[${new Date().toISOString()}] Error loading balance for ${id} after ${(endTime - startTime).toFixed(2)}ms:`, error);
      updateToken(id, {
        balance: '0',
        isLoadingBalance: false,
        usdValue: null,
        usdPrice: null,
        isLoadingUSDPrice: false
      });
    }
  };

  // Load wallet tokens
  const loadWalletTokens = async () => {
    try {
      setIsLoading(true);
      const tokenIds = await backendService.get_wallet_tokens();
      
      // Initialize tokens with empty arrays for subaccounts
      const initialTokens = tokenIds.reduce((acc, id) => {
        acc[id] = {
          canisterId: id,
          metadata: {
            name: '',
            symbol: '',
            fee: BigInt(0),
            decimals: 8,
            hasLogo: false,
            standard: ''
          },
          balance: '0',
          usdValue: null,
          usdPrice: null,
          isLoadingMetadata: true,
          isLoadingBalance: true,
          isLoadingUSDPrice: false,
          subaccounts: [],
          isLoadingSubaccounts: true
        };
        return acc;
      }, {} as Record<string, WalletToken>);

      setTokens(initialTokens);
      setIsLoading(false);

      // First load essential data (metadata and balances)
      await Promise.all(tokenIds.map(async (id) => {
        await loadTokenMetadata(id);
        await loadTokenBalance(id);
      }));

      // Then load all subaccounts in one call
      try {
        const allSubaccounts = await backendService.get_all_named_subaccounts();
        // Update each token's subaccounts
        for (const tokenSubaccounts of allSubaccounts) {
          updateToken(tokenSubaccounts.token_id.toString(), {
            subaccounts: tokenSubaccounts.subaccounts,
            isLoadingSubaccounts: false
          });
        }
        // Mark remaining tokens as not loading subaccounts
        for (const id of tokenIds) {
          if (!allSubaccounts.some(ts => ts.token_id.toString() === id)) {
            updateToken(id, {
              isLoadingSubaccounts: false
            });
          }
        }
      } catch (error) {
        console.error('Error loading subaccounts:', error);
        // Mark all tokens as not loading subaccounts on error
        for (const id of tokenIds) {
          updateToken(id, {
            isLoadingSubaccounts: false
          });
        }
      }
    } catch (error) {
      console.error('Error loading wallet tokens:', error);
      setIsLoading(false);
    }
  };

  // Load wallet tokens on component mount and auth state change
  useEffect(() => {
    const initializeWallet = async () => {
      try {
        await authService.init();
        const isAuthed = await authService.isAuthenticated();
        setIsAuthenticated(isAuthed);
        if (isAuthed) {
          await loadWalletTokens();
        } else {
          setIsLoading(false); // Make sure to set loading to false if not authenticated
        }
      } catch (error) {
        console.error('Failed to initialize wallet:', error);
        setIsAuthenticated(false);
        setIsLoading(false); // Make sure to set loading to false on error
      }
    };

    initializeWallet();

    // Listen for auth state changes
    const unsubscribe = authService.onAuthStateChange(async () => {
      const isAuthed = await authService.isAuthenticated();
      setIsAuthenticated(isAuthed);
      if (isAuthed) {
        await loadWalletTokens();
      } else {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []); // Empty dependency array for component mount

  // Handle wallet changes
  const handleWalletChange = () => {
    console.log('[WalletPage] Wallet changed, reloading tokens...');
    loadWalletTokens();
  };

  const toggleTokenExpand = (tokenId: string) => {
    setExpandedTokens(prev => {
      const next = new Set(prev);
      if (next.has(tokenId)) {
        next.delete(tokenId);
      } else {
        next.add(tokenId);
      }
      return next;
    });
  };

  // Add toggle function for subaccounts
  const toggleSubaccountExpand = (tokenId: string, subaccountName: string) => {
    const key = `${tokenId}-${subaccountName}`;
    setExpandedSubaccounts(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Add handler for send success
  const handleSendSuccess = () => {
    setShowSendModal(false);
    setSelectedTokenForSend(null);
    setSelectedSubaccountForSend(null);
    // Reload wallet tokens after successful send
    loadWalletTokens();
  };

  // Add handler for opening send modal
  const handleOpenSendModal = (tokenId: string) => {
    setSelectedTokenForSend(tokenId);
    setShowSendModal(true);
  };

  // Add handler for opening send modal with subaccount
  const handleOpenSendModalWithSubaccount = (tokenId: string, subaccount: number[]) => {
    setSelectedTokenForSend(tokenId);
    setSelectedSubaccountForSend(subaccount);
    setShowSendModal(true);
  };

  // Add handler for removing subaccount
  const handleRemoveSubaccount = async (tokenId: string, subaccount: number[]) => {
    if (!confirm('Are you sure you want to remove this subaccount? Any remaining funds will be withdrawn to your main account.')) {
      return;
    }

    try {
      updateToken(tokenId, { isLoadingSubaccounts: true });
      const actor = await backendService.getActor();
      await actor.remove_named_subaccount({
        token_id: tokenId,
        subaccount: subaccount
      });
      // Reload subaccounts and balance after removal
      await loadTokenSubaccounts(tokenId);
      await loadTokenBalance(tokenId);
    } catch (error) {
      console.error('Error removing subaccount:', error);
      updateToken(tokenId, { isLoadingSubaccounts: false });
    }
  };

  // Add handler for opening add subaccount modal
  const handleOpenAddSubaccountModal = (tokenId: string) => {
    setSelectedTokenForSubaccount(tokenId);
    setShowAddSubaccountModal(true);
  };

  const handleCloseAddSubaccountModal = () => {
    setShowAddSubaccountModal(false);
    setSelectedTokenForSubaccount(null);
  };

  const handleSubaccountAdded = async () => {
    if (selectedTokenForSubaccount) {
      await loadTokenSubaccounts(selectedTokenForSubaccount);
    }
    handleCloseAddSubaccountModal();
  };

  const handleSwap = (tokenId: string) => {
    if (tokenId === 'ryjl3-tyaaa-aaaaa-aaaba-cai') {
      // For ICP, navigate to swap page with ICP as input and no output selected
      navigate('/?input=ryjl3-tyaaa-aaaaa-aaaba-cai');
    } else {
      // For other tokens, navigate with selected token as input and ICP as output
      navigate(`/?input=${tokenId}&output=ryjl3-tyaaa-aaaaa-aaaba-cai`);
    }
  };

  // Filter tokens based on hideEmptyBalances setting
  const filteredTokens = Object.values(tokens).filter(token => 
    !hideEmptyBalances || (
      !token.isLoadingBalance && 
      token.balance !== '0' && 
      token.balance !== '0.0'
    )
  );

  const handleLogin = async () => {
    try {
      await authService.init(true);
      const success = await authService.login();
      if (success) {
        setIsAuthenticated(true);
        // Load wallet tokens immediately after successful login
        await loadWalletTokens();
      }
    } catch (error) {
      console.error('Login failed:', error);
      setIsAuthenticated(false);
    }
  };

  // Add this helper function near the top of the file
  const formatUSDPrice = (price: number | null): string => {
    if (price === null) return '-';
    if (price === 0) return '$0.00';
    
    // If price is less than 0.01, find the first non-zero decimal place
    if (price < 0.01) {
      let decimals = 2;
      let tempPrice = price;
      while (tempPrice < 0.01) {
        tempPrice *= 10;
        decimals++;
      }
      return `$${price.toFixed(decimals)}`;
    }
    
    // For normal prices, use 2 decimal places
    return `$${price.toFixed(2)}`;
  };

  // Add scan function
  const scanForTokens = async () => {
    try {
      setIsScanning(true);
      
      // Get all whitelisted tokens
      const allTokens = await tokenService.getAllTokens();
      
      // Filter out tokens already in wallet
      const walletTokenIds = new Set(Object.keys(tokens));
      const tokensToScan = allTokens.filter(([id]) => !walletTokenIds.has(id.toString()));
      
      setScanProgress({ current: 0, total: tokensToScan.length });
      
      // Create execution service for balance checks
      const executionService = new ICPSwapExecutionService();
      
      // Scan tokens serially
      for (let i = 0; i < tokensToScan.length; i++) {
        const [id] = tokensToScan[i];
        const canisterId = id.toString();
        setScanProgress({ current: i + 1, total: tokensToScan.length });
        
        try {
          const balanceResult = await executionService.getBalance(canisterId);
          
          // If balance is non-zero, add to wallet
          if (balanceResult.balance_e8s > BigInt(0)) {
            const actor = await backendService.getActor();
            await actor.add_wallet_token(canisterId);
            
            // Add to local state
            const metadata = await tokenService.getMetadataWithLogo(canisterId);
            const newToken: WalletToken = {
              canisterId,
              metadata,
              balance: formatTokenAmount(balanceResult.balance_e8s, canisterId),
              usdValue: null,
              usdPrice: null,
              isLoadingMetadata: false,
              isLoadingBalance: false,
              isLoadingUSDPrice: true,
              subaccounts: [],
              isLoadingSubaccounts: true
            };
            
            setTokens(current => ({ ...current, [canisterId]: newToken }));
            
            // Load USD price in background
            loadTokenUSDPrice(canisterId, balanceResult.balance_e8s);
          }
        } catch (error) {
          console.error(`Error checking balance for token ${canisterId}:`, error);
          // Continue with next token
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error('Error scanning for tokens:', error);
    } finally {
      setIsScanning(false);
      setScanProgress({ current: 0, total: 0 });
    }
  };

  // Add helper function for loading USD price
  const loadTokenUSDPrice = async (id: string, balance_e8s: bigint) => {
    try {
      const usdPrice = await priceService.getTokenUSDPrice(id);
      const balance = Number(formatTokenAmount(balance_e8s, id));
      const usdValue = balance * usdPrice;
      updateToken(id, {
        usdValue,
        usdPrice,
        isLoadingUSDPrice: false
      });
    } catch (error) {
      console.error(`Error loading USD price for ${id}:`, error);
      updateToken(id, {
        usdValue: null,
        usdPrice: null,
        isLoadingUSDPrice: false
      });
    }
  };

  // Load balance for a subaccount
  const loadSubaccountBalance = async (token: WalletToken, subaccount: NamedSubaccount) => {
    const key = `${token.canisterId}-${subaccount.name}`;
    try {
      setSubaccountBalances(prev => ({
        ...prev,
        [token.canisterId]: {
          ...(prev[token.canisterId] || {}),
          [key]: {
            isLoading: true,
            balance_e8s: prev[token.canisterId]?.[key]?.balance_e8s
          }
        }
      }));

      const metadata = await tokenService.getMetadata(token.canisterId);
      const userPrincipal = await authService.getPrincipal();

      if (!userPrincipal) {
        throw new Error('User not authenticated');
      }

      // Use appropriate service based on token standard
      const isDIP20 = metadata.standard.toLowerCase().includes('dip20');
      const balance = isDIP20
        ? await dip20Service.getBalance(token.canisterId)
        : await icrc1Service.getBalanceWithSubaccount(token.canisterId, Array.from(subaccount.subaccount));

      setSubaccountBalances(prev => ({
        ...prev,
        [token.canisterId]: {
          ...(prev[token.canisterId] || {}),
          [key]: {
            isLoading: false,
            balance_e8s: balance.balance_e8s
          }
        }
      }));
    } catch (error: any) {
      console.error('Error loading subaccount balance:', error);
      setSubaccountBalances(prev => ({
        ...prev,
        [token.canisterId]: {
          ...(prev[token.canisterId] || {}),
          [key]: {
            isLoading: false,
            error: error.message || 'Failed to load balance'
          }
        }
      }));
    }
  };

  // Load subaccount balances when subaccounts are loaded or expanded
  useEffect(() => {
    Object.entries(tokens).forEach(([tokenId, token]) => {
      if (expandedTokens.has(tokenId)) {
        token.subaccounts.forEach(subaccount => {
          const key = `${tokenId}-${subaccount.name}`;
          const existing = subaccountBalances[tokenId]?.[key];
          if (!existing || existing.error) {
            loadSubaccountBalance(token, subaccount);
          }
        });
      }
    });
  }, [tokens, expandedTokens]);

  return (
    <div className="wallet-page">
      <div className="wallet-box">
        {!isAuthenticated ? (
          <div className="wallet-empty-state">
            <FiCreditCard className="empty-icon" />
            <h3>Welcome to Your Wallet</h3>
            <p>Please log in to view and manage your tokens</p>
            <button 
              className="login-button"
              onClick={handleLogin}
            >
              <FiLogIn className="icon" />
              Log In
            </button>
          </div>
        ) : isLoading ? (
          <div className="wallet-empty-state">
            <FiLoader className="empty-icon spinner" />
            <h3>Loading Your Wallet</h3>
            <p>Please wait while we fetch your tokens...</p>
          </div>
        ) : Object.keys(tokens).length === 0 ? (
          <div className="wallet-empty-state">
            <FiCreditCard className="empty-icon" />
            <h3>Your wallet is empty</h3>
            <p>Add your first token to start managing your assets</p>
            <button 
              className="add-first-token-button"
              onClick={() => setShowTokenSelect(true)}
            >
              <FiPlus className="icon" />
              Add Token
            </button>
          </div>
        ) : (
          <>
            <div className="wallet-header-row">
              <div className="wallet-total">
                <span className="total-label">Total Value:</span>
                <span className="total-value">
                  {formatUSDPrice(Object.values(tokens).reduce((total, token) => total + (token.usdValue || 0), 0))}
                </span>
              </div>
              <button 
                className="expanded-action-button"
                onClick={loadWalletTokens}
                disabled={isLoading}
                title="Refresh wallet balances"
              >
                <span className="action-symbol"><FiRefreshCw /></span>
                <span className="action-text">{isLoading ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            </div>
            <div className="controls-row">
              <div className="top-row">
                <label className="hide-empty-toggle">
                  <input
                    type="checkbox"
                    checked={hideEmptyBalances}
                    onChange={(e) => setHideEmptyBalances(e.target.checked)}
                  />
                  <span>Hide empty balances</span>
                </label>
                <div className="controls-buttons">
                  <button 
                    className="expanded-action-button" 
                    onClick={() => setShowTokenSelect(true)}
                    title="Add or remove tokens from your wallet"
                  >
                    <span className="action-symbol"><FiPlus /></span>
                    <span className="action-text">Add/Remove Tokens</span>
                  </button>
                </div>
              </div>
              {isAuthenticated && (
                <div className="bottom-row">
                  <button
                    className={`action-button ${isScanning ? 'scanning' : ''}`}
                    onClick={scanForTokens}
                    disabled={isScanning}
                  >
                    {isScanning ? (
                      <>
                        <FiLoader className="spin" />
                        Scanning ({scanProgress.current}/{scanProgress.total})
                      </>
                    ) : (
                      <>
                        <FiRefreshCw />
                        Scan for Tokens
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
            <div className="wallet-tokens">
              {filteredTokens.map((token) => (
                <div 
                  key={token.canisterId} 
                  className={`wallet-token-card ${expandedTokens.has(token.canisterId) ? 'expanded' : ''}`}
                >
                  <div 
                    className="token-main-content"
                    onClick={() => toggleTokenExpand(token.canisterId)}
                  >
                    <div className="token-logo-container">
                      <img 
                        src={token.metadata?.logo} 
                        alt={token.metadata?.symbol} 
                        className="token-logo"
                      />
                      {token.isLoadingMetadata && (
                        <div className="token-loading-overlay">
                          <FiLoader className="spinner" />
                        </div>
                      )}
                    </div>
                    <div className="token-info">
                      <div className="token-header">
                        <div className="token-name">
                          {token.isLoadingMetadata ? 'Loading...' : token.metadata?.name}
                        </div>
                        <div className="token-usd-value" title="Total USD value of your holdings">
                          {token.isLoadingUSDPrice ? (
                            <FiLoader className="spinner" />
                          ) : token.usdValue !== null ? (
                            `$${token.usdValue.toFixed(2)}`
                          ) : (
                            '-'
                          )}
                        </div>                        
                      </div>
                      <div className="token-balance-row">
                        <div className="balance-amount">
                          <span className="token-balance" title="Your token balance">
                            {token.isLoadingBalance ? (
                              <FiLoader className="spinner" />
                            ) : (
                              token.balance
                            )} {token.isLoadingMetadata ? '...' : token.metadata?.symbol}
                          </span>
                        </div>
                        <button 
                          className="token-expand-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTokenExpand(token.canisterId);
                          }}
                        >
                          {expandedTokens.has(token.canisterId) ? '▲' : '▼'}
                        </button>
                      </div>
                    </div>
                  </div>
                  {expandedTokens.has(token.canisterId) && (
                    <div className="token-expanded-content" onClick={(e) => e.stopPropagation()}>
                      <div className="token-expanded-actions">
                        <button className="expanded-action-button" onClick={(e) => {
                          e.stopPropagation();
                          handleOpenSendModal(token.canisterId);
                        }}>
                          <span className="action-symbol">⤤</span>
                          <span className="action-text">Send</span>
                        </button>
                        <button className="expanded-action-button" onClick={(e) => {
                          e.stopPropagation();
                          handleSwap(token.canisterId);
                        }}>
                          <span className="action-symbol"><FiRefreshCw /></span>
                          <span className="action-text">Swap</span>
                        </button>
                      </div>
                      <div className="token-metadata-row">
                        <span className="metadata-label">Wallet:</span>
                        <div className="metadata-value">
                          <span className="token-usd-value" title="Total USD value of your holdings">
                            {token.isLoadingUSDPrice ? (
                              <FiLoader className="spinner" />
                            ) : token.usdValue !== null ? (
                              `$${token.usdValue.toFixed(2)}`
                            ) : (
                              '-'
                            )}
                          </span>
                          <span className="separator">•</span>
                          <span className="metadata-value">
                            {token.isLoadingBalance ? (
                              <FiLoader className="spinner" />
                            ) : (
                              `${token.balance} ${token.metadata?.symbol}`
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="token-metadata-row">
                        <span className="metadata-label">USD Price:</span>
                        <span className="metadata-value">
                          {token.isLoadingUSDPrice ? (
                            <FiLoader className="spinner" />
                          ) : token.usdPrice !== null ? (
                            formatUSDPrice(token.usdPrice)
                          ) : (
                            '-'
                          )}
                        </span>
                      </div>
                      <div className="token-metadata-row">
                        <span className="metadata-label">Decimals:</span>
                        <span className="metadata-value">{token.metadata?.decimals}</span>
                      </div>
                      <div className="token-metadata-row">
                        <span className="metadata-label">Fee:</span>
                        <span className="metadata-value">
                          {token.metadata?.fee !== undefined && token.metadata?.fee !== null
                            ? formatTokenAmount(token.metadata.fee, token.canisterId)
                            : '0'}
                        </span>
                      </div>
                      <div className="token-metadata-row">
                        <span className="metadata-label">Standard:</span>
                        <span className="metadata-value">{token.metadata?.standard || 'Unknown'}</span>
                      </div>
                      <div className="token-metadata-row">
                        <span className="metadata-label">Canister ID:</span>
                        <span className="metadata-value">{token.canisterId}</span>
                      </div>

                      {/* Subaccounts section */}
                      <div className="token-subaccounts-section">
                        <div className="subaccounts-header">
                          <h4>Named Subaccounts</h4>
                          <button 
                            className="add-subaccount-button"
                            onClick={() => handleOpenAddSubaccountModal(token.canisterId)}
                          >
                            <FiPlus /> Add Subaccount
                          </button>
                        </div>
                        {token.isLoadingSubaccounts ? (
                          <div className="subaccounts-loading">
                            <FiLoader className="spinner" /> Loading subaccounts...
                          </div>
                        ) : token.subaccounts.length === 0 ? (
                          <div className="no-subaccounts">
                            No named subaccounts yet
                          </div>
                        ) : (
                          <div className="subaccounts-list">
                            {token.subaccounts.map((subaccount) => {
                              const isExpanded = expandedSubaccounts.has(`${token.canisterId}-${subaccount.name}`);
                              return (
                                <div key={subaccount.name} className={`subaccount-item ${isExpanded ? 'expanded' : ''}`}>
                                  <div className="subaccount-header"
                                    onClick={() => toggleSubaccountExpand(token.canisterId, subaccount.name)}
                                  >
                                    <div className="subaccount-info">
                                      <div className="subaccount-title">
                                        <span className="subaccount-name">{subaccount.name}</span>
                                        <span className="subaccount-created">
                                          Created {new Date(Number(subaccount.created_at / BigInt(1000000))).toLocaleDateString()}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="subaccount-expand">
                                      {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
                                    </div>
                                  </div>
                                  {isExpanded && (
                                    <div className="subaccount-details">
                                      <div className="subaccount-actions">
                                        <button
                                          className="subaccount-action-button send"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenSendModalWithSubaccount(token.canisterId, subaccount.subaccount);
                                          }}
                                          title="Send from this subaccount"
                                        >
                                          <FiSend />
                                          Send
                                        </button>
                                        <button
                                          className="subaccount-action-button withdraw"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenSendModalWithSubaccount(token.canisterId, subaccount.subaccount);
                                          }}
                                          title="Withdraw to main account"
                                        >
                                          <FiDownload />
                                          Withdraw
                                        </button>
                                        <button
                                          className="subaccount-action-button remove"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveSubaccount(token.canisterId, subaccount.subaccount);
                                          }}
                                          title="Remove subaccount"
                                        >
                                          <FiX />
                                          Remove
                                        </button>
                                      </div>
                                      <div className="token-metadata-row">
                                        <span className="metadata-label">Created</span>
                                        <span className="metadata-value">{new Date(Number(subaccount.created_at / BigInt(1000000))).toLocaleString()}</span>
                                      </div>
                                      <div className="token-metadata-row">
                                        <span className="metadata-label">Balance</span>
                                        <span className="metadata-value">
                                          {subaccountBalances[token.canisterId]?.[`${token.canisterId}-${subaccount.name}`]?.isLoading ? (
                                            <span>Loading...</span>
                                          ) : subaccountBalances[token.canisterId]?.[`${token.canisterId}-${subaccount.name}`]?.error ? (
                                            <span className="error">{subaccountBalances[token.canisterId]?.[`${token.canisterId}-${subaccount.name}`]?.error}</span>
                                          ) : (
                                            <span>{formatTokenAmount(subaccountBalances[token.canisterId]?.[`${token.canisterId}-${subaccount.name}`]?.balance_e8s || BigInt(0), token.canisterId)}</span>
                                          )}
                                        </span>
                                      </div>
                                      <div className="subaccount-format">
                                        <div className="format-label">Hex:</div>
                                        <code>0x{formatHex(Array.from(subaccount.subaccount))}</code>
                                      </div>
                                      <div className="subaccount-format">
                                        <div className="format-label">Bytes:</div>
                                        <code>{formatBytes(subaccount.subaccount)}</code>
                                      </div>
                                      <div className="subaccount-format">
                                        <div className="format-label">Principal:</div>
                                        <code>{formatPrincipal(subaccount.subaccount)}</code>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <TokenSelect
        value=""
        onChange={() => {}}
        label=""
        mode="wallet"
        onWalletChange={handleWalletChange}
        isOpen={showTokenSelect}
        onClose={() => setShowTokenSelect(false)}
      />
      {showSendModal && selectedTokenForSend && (
        <SendTokenModal
          isOpen={showSendModal}
          onClose={() => {
            setShowSendModal(false);
            setSelectedTokenForSend(null);
            setSelectedSubaccountForSend(null);
          }}
          tokenId={selectedTokenForSend}
          onSuccess={handleSendSuccess}
        />
      )}
      {showAddSubaccountModal && selectedTokenForSubaccount && (
        <AddSubaccountModal
          isOpen={showAddSubaccountModal}
          onClose={handleCloseAddSubaccountModal}
          tokenId={selectedTokenForSubaccount}
          onSuccess={handleSubaccountAdded}
        />
      )}
    </div>
  );
}; 