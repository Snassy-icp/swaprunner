import { FiPlus, FiLoader, FiChevronDown, FiChevronUp, FiRefreshCw, FiCreditCard, FiLogIn } from 'react-icons/fi';
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

interface WalletToken {
  canisterId: string;
  metadata: TokenMetadata;
  balance: string;
  usdValue: number | null;
  usdPrice: number | null;
  isLoadingMetadata: boolean;
  isLoadingBalance: boolean;
  isLoadingUSDPrice: boolean;
}

export const WalletPage: React.FC = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [walletTokens, setWalletTokens] = useState<WalletToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showTokenSelect, setShowTokenSelect] = useState(false);
  const [expandedTokens, setExpandedTokens] = useState<Set<string>>(new Set());
  const [showSendModal, setShowSendModal] = useState(false);
  const [selectedTokenForSend, setSelectedTokenForSend] = useState<string | null>(null);
  const [hideEmptyBalances, setHideEmptyBalances] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });

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
    setWalletTokens(current => 
      current.map(token => 
        token.canisterId === canisterId 
          ? { ...token, ...updates }
          : token
      )
    );
  };

  // Load metadata for a single token
  const loadTokenMetadata = async (id: string) => {
    const startTime = performance.now();
    try {
      const metadata = await tokenService.getMetadataWithLogo(id);
      const endTime = performance.now();
      //console.log(`[${new Date().toISOString()}] Loaded metadata for ${id} in ${(endTime - startTime).toFixed(2)}ms`);
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
          logo: '/generic_token.svg',
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
    const startTime = performance.now();
    console.log(`[${new Date().toISOString()}] Starting to load wallet tokens...`);
    
    try {
      setIsLoading(true);
      
      // Get backend actor
      const actorStartTime = performance.now();
      const actor = await backendService.getActor();
      const actorEndTime = performance.now();
      console.log(`[${new Date().toISOString()}] Got backend actor in ${(actorEndTime - actorStartTime).toFixed(2)}ms`);
      
      // Get token IDs
      const tokenIdsStartTime = performance.now();
      const tokenIds = await actor.get_wallet_tokens();
      const tokenIdsEndTime = performance.now();
      console.log(`[${new Date().toISOString()}] Got ${tokenIds.length} wallet tokens in ${(tokenIdsEndTime - tokenIdsStartTime).toFixed(2)}ms`);
      
      // Initialize tokens immediately with loading states
      const initStartTime = performance.now();
      const initialTokens = tokenIds.map((id: string) => ({
        canisterId: id,
        metadata: {
          name: 'Loading...',
          symbol: '...',
          decimals: 8,
          fee: BigInt(0),
          hasLogo: false,
          logo: '/generic_token.svg',
          standard: 'UNKNOWN'
        },
        balance: '0',
        isLoadingMetadata: true,
        isLoadingBalance: true,
        usdValue: null,
        usdPrice: null,
        isLoadingUSDPrice: true
      }));
      setWalletTokens(initialTokens);
      setIsLoading(false);
      const initEndTime = performance.now();
      //console.log(`[${new Date().toISOString()}] Initialized token placeholders in ${(initEndTime - initStartTime).toFixed(2)}ms`);

      // Start loading metadata and balances for each token independently
      //console.log(`[${new Date().toISOString()}] Starting to load metadata and balances for ${tokenIds.length} tokens...`);
      tokenIds.forEach((id: string) => {
        loadTokenMetadata(id);
        loadTokenBalance(id);
      });

      const endTime = performance.now();
      console.log(`[${new Date().toISOString()}] Total initial wallet setup took ${(endTime - startTime).toFixed(2)}ms`);
    } catch (error) {
      const endTime = performance.now();
      console.error(`[${new Date().toISOString()}] Error loading wallet tokens after ${(endTime - startTime).toFixed(2)}ms:`, error);
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

  // Add handler for send success
  const handleSendSuccess = () => {
    setShowSendModal(false);
    setSelectedTokenForSend(null);
    // Reload wallet tokens after successful send
    loadWalletTokens();
  };

  // Add handler for opening send modal
  const handleOpenSendModal = (tokenId: string) => {
    setSelectedTokenForSend(tokenId);
    setShowSendModal(true);
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
  const filteredTokens = walletTokens.filter(token => 
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
      const walletTokenIds = new Set(walletTokens.map(t => t.canisterId));
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
              isLoadingUSDPrice: true
            };
            
            setWalletTokens(current => [...current, newToken]);
            
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
        ) : walletTokens.length === 0 ? (
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
                  {formatUSDPrice(walletTokens.reduce((total, token) => total + (token.usdValue || 0), 0))}
                </span>
              </div>
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
                <button 
                  className="expanded-action-button" 
                  onClick={() => setShowTokenSelect(true)}
                  title="Add or remove tokens from your wallet"
                >
                  <span className="action-symbol"><FiPlus /></span>
                  <span className="action-text">Add/Remove Tokens</span>
                </button>
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
          }}
          tokenId={selectedTokenForSend}
          onSuccess={handleSendSuccess}
        />
      )}
    </div>
  );
}; 