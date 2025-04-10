import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FiArrowDown, FiChevronDown, FiChevronUp, FiLogIn, FiDownload, FiRepeat } from 'react-icons/fi';
import { TokenSelect } from './TokenSelect';
import { icpSwapService } from '../services/icpswap';
import { kongSwapService } from '../services/kongswap';
import { canisterId as kongCanisterId } from '../../../external/kongswap';
import { SwapModal } from './SwapModal';
import { KongSwapModal } from './KongSwapModal';
import { ICPSwapExecutionService, ICPSwapExecutionParams, ExecutionResult } from '../services/icpswap_execution';
import '../styles/SwapInterface.css';
import { tokenService } from '../services/token';
import { SplitSwapModal } from './SplitSwapModal';
import { TimeSplitProgress } from './TimeSplitProgress';
import { timeSplitManager, RunConfig } from '../services/timesplit_manager';
import { useTokens } from '../contexts/TokenContext';
import { TokenMetadata } from '../types/token';
import { formatTokenAmount, cacheTokenMetadata, getCachedTokenMetadata, parseTokenAmount } from '../utils/format';
import { authService } from '../services/auth';
import { isFeatureEnabled } from '../config/featureFlags';
import { icpSwapFactoryService } from '../services/icpswap_factory';
import { backendService } from '../services/backend';
import { statsService } from '../services/stats';
import { SwapStep } from '../types/swap';
import { TransferModal } from './TransferModal';
import { DepositModal } from './DepositModal';
import { WithdrawModal } from './WithdrawModal';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { priceService } from '../services/price';
import { SearchRangeProgress } from './SearchRangeProgress';
import '../styles/SearchRangeProgress.css';
import { useLogoLoading } from '../contexts/LogoLoadingContext';
import { Principal } from '@dfinity/principal';
import { principalToSubAccount } from "@dfinity/utils";
import { usePool } from '../contexts/PoolContext';
import { useAchievements } from '../contexts/AchievementContext';

// Add this near the other type definitions at the top
type DexType = 'icpswap' | 'kong' | 'split' | null;

interface TokenWithMetadata {
  canisterId: string;
  metadata?: TokenMetadata;
  balance?: string;
  error?: string;
  isLoading: boolean;
}

interface Price {
  loading: boolean;
  value: number | null;
  error: string | null;
}

interface Quote {
  loading: boolean;
  amountOut: bigint | null;
  priceImpact: number | null;
  error: string | null;
  request: {
    tokenIn: string;
    tokenOut: string;
    amount_e8s: bigint;
  } | null;
  // Add deposit needs information
  depositNeeds?: {
    fromDeposited: bigint;
    fromUndeposited: bigint;
    fromWallet: bigint;
    adjustedAmount: bigint;
    originalAmount: bigint;
  };
}

// Default fee tier (0.3%)
const DEFAULT_FEE = BigInt(3000);

interface SwapInterfaceProps {
  slippageTolerance: number;
  fromTokenParam?: string | null;
  toTokenParam?: string | null;
}

// Add type for swap result
interface SwapResult {
  success: boolean;
  error?: string;
}

interface TokenActionState {
  isOpen: boolean;
  type: 'transfer' | 'deposit' | 'withdraw' | null;
  tokenId: string;
  tokenSymbol: string;
  source?: 'undeposited' | 'deposited' | 'pool' | 'wallet';  // Added 'pool' for combined pool balances
  poolId?: string;
  isToken0: boolean;  // Make this required
}

interface BalanceState {
  undeposited0?: { balance_e8s: bigint; error?: string };
  undeposited1?: { balance_e8s: bigint; error?: string };
  deposited0?: bigint;
  deposited1?: bigint;
  usdValue0?: number;
  usdValue1?: number;
}

interface Notification {
  type: 'error' | 'success' | 'info';  // Add 'info' to allowed types
  message: string;
}

interface KongQuoteRequest {
  tokenIn: string;
  tokenOut: string;
  amount_e8s: bigint;
  depositNeeds: {
    fromDeposited: bigint;
    fromUndeposited: bigint;
    fromWallet: bigint;
    adjustedAmount: bigint;
    originalAmount: bigint;
  };
}

interface KongQuote {
  loading: boolean;
  amountOut: bigint | null;
  priceImpact: number | null;
  error: string | null;
  request: KongQuoteRequest | null;
}

// Add at the top of the file with other interfaces
interface DepositNeeds {
  fromDeposited: bigint;
  fromUndeposited: bigint;
  fromWallet: bigint;
  adjustedAmount: bigint;
  originalAmount: bigint;
}

interface QuoteWithDepositNeeds {
  amountOut: bigint | null;
  priceImpact: number | null;
  depositNeeds?: DepositNeeds;
}

interface QuoteDistributionResult {
  amountOut: bigint;
  icpswapResult: QuoteWithDepositNeeds;
  kongResult: QuoteWithDepositNeeds;
}

export function SwapInterface({ slippageTolerance, fromTokenParam, toTokenParam }: SwapInterfaceProps) {
  const { tokens, setTokens } = useTokens();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showTimeSplit, setShowTimeSplit] = useState(false);
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [isAmountPercent, setIsAmountPercent] = useState(true);
  const [distribution, setDistribution] = useState(50);
  const [timeDistribution, setTimeDistribution] = useState(false);
  const [timePeriod, setTimePeriod] = useState('1');
  const [minInterval, setMinInterval] = useState('5');
  const [maxInterval, setMaxInterval] = useState('15');
  const [fromToken, setFromToken] = useState('');
  const [toToken, setToToken] = useState('');
  const [fromAmount, setFromAmount] = useState('');
  const [isPriceReversed, setIsPriceReversed] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [fromTokenBalance, setFromTokenBalance] = useState<string | null>(null);
  const [toTokenBalance, setToTokenBalance] = useState<string | null>(null);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [activeTimeSplitRun, setActiveTimeSplitRun] = useState<string | null>(null);
  const [previousInputAmount, setPreviousInputAmount] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isQuotesCollapsed, setIsQuotesCollapsed] = useState(false);
  const [isFooCollapsed, setIsFooCollapsed] = useState(true);
  const [isToken0PoolCollapsed, setIsToken0PoolCollapsed] = useState(true);
  const [isToken1PoolCollapsed, setIsToken1PoolCollapsed] = useState(true);
  const [token0Address, setToken0Address] = useState<string | null>(null);
  const [token1Address, setToken1Address] = useState<string | null>(null);
  const [balances, setBalances] = useState<BalanceState>({});
  const [tokenAction, setTokenAction] = useState<TokenActionState>({
    isOpen: false,
    type: null,
    tokenId: '',
    tokenSymbol: '',
    isToken0: false,
  });

  const [loadedLogos, setLoadedLogos] = useState<Record<string, string>>({});
  const [isSearchingBestSplit, setIsSearchingBestSplit] = useState(false);
  const [lastRefreshTimestamp, setLastRefreshTimestamp] = useState<number | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [fromUSDPrice, setFromUSDPrice] = useState<number | null>(null);
  const [toUSDPrice, setToUSDPrice] = useState<number | null>(null);
  const [isLoadingUSDPrices, setIsLoadingUSDPrices] = useState(false);
  const [searchRange, setSearchRange] = useState<{ left: number; right: number; m1?: number; m2?: number }>({
    left: 0,
    right: 100
  });
  const { progress: logoLoadingProgress } = useLogoLoading();
  const [isDirectQuotesCollapsed, setIsDirectQuotesCollapsed] = useState(true);
  const [isLoadingFromToken, setIsLoadingFromToken] = useState(true);
  const [isLoadingToToken, setIsLoadingToToken] = useState(true);
  const { keepTokensInPool, setKeepTokensInPool } = usePool();
  const { setNeedsScan } = useAchievements();
  
  // Set ICP as default fromToken on mount ONLY if no URL parameter
  useEffect(() => {
    const ICP_CANISTER_ID = 'ryjl3-tyaaa-aaaaa-aaaba-cai';
    if (!fromTokenParam) {
      handleFromTokenChange(ICP_CANISTER_ID);
      setHasInitialized(true);
    }
  }, []);

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

  // Show time split section automatically when there's an active run
  useEffect(() => {
    if (activeTimeSplitRun) {
      setShowAdvanced(true);
      setShowTimeSplit(true);
    }
  }, [activeTimeSplitRun]);

  // Function to handle swapping direction
  const handleSwapDirection = async () => {
    const tempFromToken = fromToken;
 
    setFromAmount('');
    setFromToken(toToken);
    setToToken(tempFromToken);
  };

  // Debug notification state changes
  useEffect(() => {
    console.log('SwapInterface notification changed:', notification);
  }, [notification]);

  // Clear notification after 3 seconds
  useEffect(() => {
    if (notification) {
      console.log('SwapInterface setting notification timeout');
      const timer = setTimeout(() => {
        console.log('SwapInterface clearing notification');
        setNotification(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Price and quote states
  const [price, setPrice] = useState<Price>({ loading: false, value: null, error: null });
  const [quote, setQuote] = useState<Quote>({ 
    loading: false, 
    amountOut: null, 
    priceImpact: null, 
    error: null,
    request: null
  });
  const [kongPrice, setKongPrice] = useState<Price>({ loading: false, value: null, error: null });
  const [kongQuote, setKongQuote] = useState<KongQuote>({ 
    loading: false, 
    amountOut: null, 
    priceImpact: null, 
    error: null,
    request: null
  });

  // Swap modal state
  const [showModal, setShowModal] = useState(false);
  const [swapDetails, setSwapDetails] = useState<any>(null);
  const [selectedDex, setSelectedDex] = useState<'icpswap' | 'kong' | 'split' | null>(null);
  const [userHasSelectedDex, setUserHasSelectedDex] = useState(false);
  const [splitQuotes, setSplitQuotes] = useState<{
    icpswap: { loading: boolean; amountOut: string | null; priceImpact: number | null; error: string | null; request: { tokenIn: string; tokenOut: string; amount_e8s: bigint; depositNeeds?: { fromDeposited: bigint; fromUndeposited: bigint; fromWallet: bigint; adjustedAmount: bigint; originalAmount: bigint; } } | null; };
    kong: { loading: boolean; amountOut: string | null; priceImpact: number | null; error: string | null; request: { tokenIn: string; tokenOut: string; amount_e8s: bigint; depositNeeds?: { fromDeposited: bigint; fromUndeposited: bigint; fromWallet: bigint; adjustedAmount: bigint; originalAmount: bigint; } } | null; };
    split: { loading: boolean; amountOut: string | null; priceImpact: number | null; error: string | null; request: { tokenIn: string; tokenOut: string; amount_e8s: bigint; } | null; };
  }>({
    icpswap: { loading: false, amountOut: null, priceImpact: null, error: null, request: null },
    kong: { loading: false, amountOut: null, priceImpact: null, error: null, request: null },
    split: { loading: false, amountOut: null, priceImpact: null, error: null, request: null }
  });
  const [steps, setSteps] = useState<SwapStep[]>(() => {
    if (!selectedDex) return [];
    
    return selectedDex === 'icpswap' ? [
      {
        title: '1. Prepare tokens',
        description: 'Approve or transfer tokens to the pool',
        status: 'pending',
        details: {
          amount: fromAmount ? `${fromAmount}` : undefined,
          canisterId: fromToken || undefined,
        }
      },
      {
        title: '2. Deposit',
        description: 'Deposit tokens into the pool',
        status: 'pending',
        details: {
          amount: fromAmount ? `${fromAmount}` : undefined,
          canisterId: fromToken || undefined,
        }
      },
      {
        title: '3. Swap',
        description: 'Swap tokens in the pool',
        status: 'pending',
        details: {
          amount: fromAmount ? `${fromAmount}` : undefined,
          canisterId: fromToken || undefined,
          tokenOutSymbol: getTokenSymbol(toToken || ''),
        }
      },
      {
        title: '4. Withdraw',
        description: 'Withdraw tokens from the pool',
        status: 'pending',
        details: {
          amount: fromAmount ? `${fromAmount}` : undefined,
          canisterId: toToken || undefined,
        }
      }
    ] : selectedDex === 'kong' ? [
      {
        title: '1. Transfer to Kong',
        description: 'Transfer tokens to Kong',
        status: 'pending' as const,  // Fix type error by explicitly typing as const
        details: {
          amount: fromAmount ? `${fromAmount}` : undefined,
          canisterId: fromToken || undefined
        }
      },
      {
        title: '2. Execute Swap',
        description: 'Execute Kong swap',
        status: 'pending' as const,  // Fix type error by explicitly typing as const
        details: {
          amount: kongQuote.amountOut && toToken ? `${formatTokenAmount(kongQuote.amountOut, toToken)}` : undefined,
          canisterId: toToken || undefined
        }
      }
    ] : [
      {
        title: '1. Transfer to pool',
        description: 'Transfer tokens to the pool',
        status: 'pending',
      },
      {
        title: '2. Deposit',
        description: 'Deposit tokens into the pool',
        status: 'pending',
      },
      {
        title: '3. Swap',
        description: 'Swap tokens in the pool',
        status: 'pending',
      },
      {
        title: '4. Withdraw',
        description: 'Withdraw tokens from the pool',
        status: 'pending',
      }
    ];
  });

  // Memoize the execution service
  const icpSwapExecutionService = useMemo(() => new ICPSwapExecutionService(), []);

  // Add poolId state
  const [poolId, setPoolId] = useState<string | null>(null);

  // Add clearQuotes function after the formatAmount function
  const clearQuotes = () => {
    setQuote({ 
      loading: false, 
      amountOut: null, 
      priceImpact: null, 
      error: null,
      request: null
    });
    setKongQuote({ 
      loading: false, 
      amountOut: null, 
      priceImpact: null, 
      error: null,
      request: null
    });
    setSplitQuotes({
      icpswap: { loading: false, amountOut: null, priceImpact: null, error: null, request: null },
      kong: { loading: false, amountOut: null, priceImpact: null, error: null, request: null },
      split: { loading: false, amountOut: null, priceImpact: null, error: null, request: null }
    });
  };

  // Effect for token order initialization using fast getPool
  useEffect(() => {
    if (fromToken && toToken) {
      // Clear existing quotes when tokens change
      clearQuotes();
      
      // Get pool info and authoritative token order
      icpSwapFactoryService.getPool({
        token0: { address: fromToken, standard: 'ICRC1' },
        token1: { address: toToken, standard: 'ICRC1' },
        fee: DEFAULT_FEE,
      })
        .then(poolData => {
          setPoolId(poolData.canisterId);
          // Set token addresses based on pool's authoritative order
          setToken0Address(poolData.token0.address);
          setToken1Address(poolData.token1.address);
        })
        .catch(error => {
          console.error('Failed to get pool data:', error);
          setPoolId(null);
          setToken0Address(null);
          setToken1Address(null);
        });

      // Kong price (can run in parallel)
      setKongPrice({ loading: true, value: null, error: null });
      kongSwapService.getPrice({
        tokenA: fromToken,
        tokenB: toToken,
      })
        .then(price => {
          setKongPrice({ loading: false, value: price, error: null });
        })
        .catch(error => {
          setKongPrice({ loading: false, value: null, error: error.message });
        });
    }
  }, [fromToken, toToken]);

  // Separate effect for price calculation using getPoolMetadata
  useEffect(() => {
    if (fromToken && toToken && poolId) {
      // ICPSwap price calculation
      setPrice({ loading: true, value: null, error: null });
      icpSwapService.getPoolMetadata({
        tokenA: fromToken,
        tokenB: toToken,
        fee: DEFAULT_FEE,
      })
        .then(metadata => {
          const currentPrice = icpSwapService.calculatePrice(metadata);
          setPrice({ loading: false, value: currentPrice, error: null });
        })
        .catch(error => {
          setPrice({ loading: false, value: null, error: error.message });
        });
    }
  }, [fromToken, toToken, poolId]);

  // Get quotes when amount changes
  useEffect(() => {
    if (fromToken && toToken && fromAmount) {
      // Validate amount is a valid positive number
      const numericAmount = Number(fromAmount);
      if (isNaN(numericAmount) || numericAmount <= 0) {
        clearQuotes();
        return;
      }

      // Clear existing quotes when amount changes
      clearQuotes();
      
      // Reset distribution to 50/50 when amount changes
      setDistribution(50);
      
      // Get token metadata for decimals
      const getQuotes = async () => {
        if (!fromToken || !toToken || !fromAmount) {
          clearQuotes();
          return;
        }

        try {
          // Calculate amount in base units
          const amountInE8s = await parseTokenAmount(fromAmount, fromToken);

          // Get token metadata for fee calculations
          const fromTokenMetadata = await tokenService.getMetadata(fromToken);
    
          let icpswapAllowance = BigInt(0);
          let kongAllowance = BigInt(0);
          // If ICRC2 or DIP20 token, fetch existing allowance on ICPSwap and Kong.
          if (fromTokenMetadata.standard.toLowerCase().includes('dip20') || 
              fromTokenMetadata.standard.toLowerCase().includes('icrc2')) {
            // Check ICPSwap allowance
            if (poolId) {
              icpswapAllowance = await icpSwapExecutionService.checkAllowance({
                tokenId: fromToken,
                spender: typeof poolId === 'string' ? Principal.fromText(poolId) : poolId,
              });
              console.log('ICPSwap allowance:', icpswapAllowance.toString());
            }

            // Check Kong allowance 
            kongAllowance = await icpSwapExecutionService.checkAllowance({
              tokenId: fromToken,
              spender: typeof kongCanisterId === 'string' ? Principal.fromText(kongCanisterId) : kongCanisterId
            });
            console.log('Kong allowance:', kongAllowance.toString());
          }

          // Get wallet balance
          const walletBalance = await icpSwapExecutionService.getBalance(fromToken);
          let depositedBalance = BigInt(0);
          let undepositedBalance = BigInt(0);
          
          // Only fetch ICPSwap quote if we have a valid pool
          if (poolId) {
            // Get pool balances for ICPSwap
            const [deposited, undeposited] = await Promise.all([
              icpSwapExecutionService.getDepositedPoolBalance({ poolId: poolId.toString() }),
              icpSwapExecutionService.getUndepositedPoolBalance({ poolId: poolId.toString(), tokenId: fromToken })
            ]);

            depositedBalance = isToken0(fromToken) ? deposited.balance0_e8s : deposited.balance1_e8s;
            undepositedBalance = !undeposited.error ? undeposited.balance_e8s : BigInt(0);

            // Calculate ICPSwap's deposit needs
            const icpswapNeeds = await calculateICPSwapDepositNeeds(amountInE8s, walletBalance.balance_e8s, depositedBalance, undepositedBalance, icpswapAllowance, fromTokenMetadata.standard);
            
            let icpswapQuoteAmount = icpswapNeeds?.adjustedAmount || amountInE8s;

            // ICPSwap quote
            const icpSwapParams = {
              amountIn: icpswapQuoteAmount,
              tokenIn: fromToken,
              tokenOut: toToken,
              fee: DEFAULT_FEE,
            };

            setQuote({ 
              loading: true, 
              amountOut: null, 
              priceImpact: null, 
              error: null, 
              request: { 
                tokenIn: fromToken, 
                tokenOut: toToken, 
                amount_e8s: icpswapQuoteAmount, 
              },
              depositNeeds: icpswapNeeds ? {
                ...icpswapNeeds,
                originalAmount: amountInE8s,
                adjustedAmount: icpswapQuoteAmount
              } : undefined
            });

            icpSwapService.getQuote(icpSwapParams)
              .then(async quote => {
                // Compare against current form values
                if (fromToken === icpSwapParams.tokenIn && 
                    toToken === icpSwapParams.tokenOut && 
                    amountInE8s === parseTokenAmount(fromAmount, fromToken)) {
                  setQuote({ 
                    loading: false, 
                    amountOut: quote.amountOut,
                    priceImpact: quote.priceImpact,
                    error: null,
                    request: { 
                      tokenIn: fromToken, 
                      tokenOut: toToken, 
                      amount_e8s: icpswapQuoteAmount, 
                    },
                    depositNeeds: icpswapNeeds ? {
                      ...icpswapNeeds,
                      originalAmount: amountInE8s,
                      adjustedAmount: icpswapQuoteAmount
                    } : undefined
                  });
                }
              })
              .catch(error => {
                setQuote({ 
                  loading: false, 
                  amountOut: null, 
                  priceImpact: null, 
                  error: error.message, 
                  request: null 
                });
              });
          } else {
            // Clear ICPSwap quote if no pool exists
            setQuote({ 
              loading: false, 
              amountOut: null, 
              priceImpact: null, 
              error: "No ICPSwap pool available", 
              request: null 
            });
          }

          // Kong quote logic - independent of ICPSwap pool
          // Calculate withdrawal needs for Kong quote
          const withdrawalNeeds = await calculatePoolWithdrawalNeeds(amountInE8s, walletBalance.balance_e8s, depositedBalance, undepositedBalance, kongAllowance, fromTokenMetadata.standard);

          // For Kong quote, use the adjusted amount if available
          let kongQuoteAmount = withdrawalNeeds?.adjustedInput || amountInE8s;

          const kongQuoteParams = {
            amountIn: kongQuoteAmount,
            tokenIn: fromToken,
            tokenOut: toToken,
          };

          setKongQuote({ 
            loading: true, 
            amountOut: null, 
            priceImpact: null, 
            error: null, 
            request: { 
              tokenIn: fromToken, 
              tokenOut: toToken, 
              amount_e8s: kongQuoteAmount,
              depositNeeds: {
                fromDeposited: withdrawalNeeds?.fromDeposited || BigInt(0),
                fromUndeposited: withdrawalNeeds?.fromUndeposited || BigInt(0),
                fromWallet: kongQuoteAmount,
                adjustedAmount: kongQuoteAmount,
                originalAmount: amountInE8s
              }
            } 
          });
          console.log("get Kong quote starting.");

          kongSwapService.getQuote(kongQuoteParams)
            .then(async quote => {
              // Compare against current form values
              console.log("got Kong quote:", quote);
              if (fromToken === kongQuoteParams.tokenIn && 
                  toToken === kongQuoteParams.tokenOut && 
                  amountInE8s === parseTokenAmount(fromAmount, fromToken)) {
                setKongQuote({
                  loading: false,
                  amountOut: quote.amountOut,
                  priceImpact: quote.priceImpact,
                  error: null,
                  request: { 
                    tokenIn: fromToken, 
                    tokenOut: toToken, 
                    amount_e8s: kongQuoteAmount,
                    depositNeeds: {
                      fromDeposited: withdrawalNeeds?.fromDeposited || BigInt(0),
                      fromUndeposited: withdrawalNeeds?.fromUndeposited || BigInt(0),
                      fromWallet: kongQuoteAmount,
                      adjustedAmount: kongQuoteAmount,
                      originalAmount: amountInE8s
                    }
                  }
                });
              } else {
                const msg = 'Discarding outdated Kong quote - form values have changed';
                console.log(msg);
                setKongQuote({ loading: false, amountOut: null, priceImpact: null, error: msg, request: null });
              }
            })
            .catch(error => {
              setKongQuote({ loading: false, amountOut: null, priceImpact: null, error: error.message, request: null });
            });
        } catch (error) {
          console.error('Error getting quotes:', error);
          clearQuotes();
        }
      };

      getQuotes();
    }
  }, [fromToken, toToken, fromAmount, poolId]);

  // Update the quote amounts display to use synchronous formatting
  useEffect(() => {
    if (quote.amountOut && toToken) {
      setFormattedQuoteAmount(formatTokenAmount(quote.amountOut, toToken));
    }
  }, [quote.amountOut, toToken]);

  const [formattedQuoteAmount, setFormattedQuoteAmount] = useState('0.0');
  const [formattedKongQuoteAmount, setFormattedKongQuoteAmount] = useState('0.0');
  const [formattedSplitAmounts, setFormattedSplitAmounts] = useState({
    icpswap: '0.0',
    kong: '0.0',
    total: '0.0'
  });

  const calculateMinimumReceived = (amount: bigint, slippagePercent: number): bigint => {
    // Convert slippage to a decimal (e.g., 0.5% -> 0.995)
    const slippageMultiplier = (100 - slippagePercent) / 100;
    // Use the decimal to calculate minimum, then round down
    return BigInt(Math.floor(Number(amount) * slippageMultiplier));
  };

  const getTokenSymbol = (canisterId: string): string => {
    const token = tokens.find(t => t.canisterId === canisterId);
    return token?.metadata?.symbol || 'Token';
  };

  const formatPrice = (price: number | null, reversed: boolean): string => {
    if (!price) return '0';
    const value = reversed ? 1 / price : price;
    const metadata = getCachedTokenMetadata(reversed ? toToken : fromToken);
    return value.toFixed(metadata?.decimals ?? 8).replace(/\.?0+$/, '');
  };

  // Determine best quote
  const getBestQuote = (): 'icpswap' | 'kong' | 'split' | null => {
    // Get the main DEX quotes
    const icpswapAmount = quote.amountOut;
    const kongAmount = kongQuote.amountOut;
    
    // Get the split quote if available
    const splitAmount = splitQuotes.split?.amountOut ? BigInt(splitQuotes.split.amountOut) : null;

    // If we only have one quote, return that DEX
    if (icpswapAmount && !kongAmount) return 'icpswap';
    if (!icpswapAmount && kongAmount) return 'kong';

    // If we have both quotes, compare them
    if (icpswapAmount && kongAmount) {
      const bestMainDex = kongAmount > icpswapAmount ? 'kong' : 'icpswap';
      const bestMainAmount = kongAmount > icpswapAmount ? kongAmount : icpswapAmount;

      // If we have a valid split amount, compare it with the best main DEX
      if (splitAmount && splitAmount > bestMainAmount) {
        return 'split';
      }

      return bestMainDex;
    }

    return null;
  };

  const bestDex = getBestQuote();

  // Add effect to handle automatic selection
  useEffect(() => {
    const bestDex = getBestQuote();
    
    // Only auto-select if:
    // 1. User hasn't made a manual selection, OR
    // 2. Current selection is no longer valid
    const currentSelectionInvalid = selectedDex && (
      (selectedDex === 'icpswap' && !quote.amountOut) ||
      (selectedDex === 'kong' && !kongQuote.amountOut) ||
      (selectedDex === 'split' && (!splitQuotes.icpswap.amountOut || !splitQuotes.kong.amountOut))
    );

    if ((!userHasSelectedDex || currentSelectionInvalid) && bestDex) {
      setSelectedDex(bestDex);
    }
  }, [quote.amountOut, kongQuote.amountOut, splitQuotes.split?.amountOut, userHasSelectedDex]);

  // Update the quote selection handler
  const handleQuoteSelection = (dex: 'icpswap' | 'kong' | 'split') => {
    setSelectedDex(dex);
    setUserHasSelectedDex(true);
  };

  // Reset user selection when tokens or amount changes
  useEffect(() => {
    setUserHasSelectedDex(false);
  }, [fromToken, toToken, fromAmount]);

  // Add effect to fetch balances when tokens change
  useEffect(() => {
    const fetchBalances = async () => {
      if (!fromToken && !toToken) return;
      setIsLoadingBalances(true);
      try {
        const [fromBalance, toBalance] = await Promise.all([
          fromToken ? icpSwapExecutionService.getBalance(fromToken) : null,
          toToken ? icpSwapExecutionService.getBalance(toToken) : null,
        ]);
        
        if (fromBalance && !fromBalance.error && fromToken) {
          setFromTokenBalance(formatTokenAmount(fromBalance.balance_e8s, fromToken));
        }
        if (toBalance && !toBalance.error && toToken) {
          setToTokenBalance(formatTokenAmount(toBalance.balance_e8s, toToken));
        }
      } catch (error) {
        console.error('Error fetching balances:', error);
      } finally {
        setIsLoadingBalances(false);
      }
    };

    fetchBalances();
  }, [fromToken, toToken]);

  // Add effect to listen for auth state changes
  useEffect(() => {
    const unsubscribe = authService.onAuthStateChange(() => {
      if (fromToken || toToken) {
        setIsLoadingBalances(true);
        const fetchBalances = async () => {
          try {
            const [fromBalance, toBalance] = await Promise.all([
              fromToken ? icpSwapExecutionService.getBalance(fromToken) : null,
              toToken ? icpSwapExecutionService.getBalance(toToken) : null,
            ]);
            
            if (fromBalance && !fromBalance.error && fromToken) {
              setFromTokenBalance(formatTokenAmount(fromBalance.balance_e8s, fromToken));
            }
            if (toBalance && !toBalance.error && toToken) {
              setToTokenBalance(formatTokenAmount(toBalance.balance_e8s, toToken));
            }
          } catch (error) {
            console.error('Error fetching balances:', error);
          } finally {
            setIsLoadingBalances(false);
          }
        };
        fetchBalances();
      }
    });

    return () => unsubscribe();
  }, [fromToken, toToken]);

  // Memoize the fetchPoolBalances function to prevent recreation on every render
  const fetchPoolBalances = useCallback(async () => {
    if (!isAuthenticated || !poolId || !token0Address || !token1Address) {
      return;
    }

    try {
      const [undeposited0, undeposited1, deposited] = await Promise.all([
        icpSwapExecutionService.getUndepositedPoolBalance({ poolId, tokenId: token0Address }),
        icpSwapExecutionService.getUndepositedPoolBalance({ poolId, tokenId: token1Address }),
        icpSwapExecutionService.getDepositedPoolBalance({ poolId })
      ]);

      // Get USD prices for both tokens
      const [token0USDPrice, token1USDPrice] = await Promise.all([
        priceService.getTokenUSDPrice(token0Address).catch(err => {
          console.warn('Failed to fetch USD price for token0:', err);
          return null;
        }),
        priceService.getTokenUSDPrice(token1Address).catch(err => {
          console.warn('Failed to fetch USD price for token1:', err);
          return null;
        })
      ]);

      // Get token metadata for decimal adjustments
      const [token0Metadata, token1Metadata] = await Promise.all([
        tokenService.getMetadata(token0Address),
        tokenService.getMetadata(token1Address)
      ]);

      // Calculate USD values
      const token0Total = (undeposited0?.balance_e8s || BigInt(0)) + (deposited.balance0_e8s || BigInt(0));
      const token1Total = (undeposited1?.balance_e8s || BigInt(0)) + (deposited.balance1_e8s || BigInt(0));

      const token0BaseUnitMultiplier = BigInt(10) ** BigInt(token0Metadata.decimals);
      const token1BaseUnitMultiplier = BigInt(10) ** BigInt(token1Metadata.decimals);

      const token0WholeUnits = Number(token0Total) / Number(token0BaseUnitMultiplier);
      const token1WholeUnits = Number(token1Total) / Number(token1BaseUnitMultiplier);

      const usdValue0 = token0USDPrice ? token0WholeUnits * token0USDPrice : undefined;
      const usdValue1 = token1USDPrice ? token1WholeUnits * token1USDPrice : undefined;

      setBalances({
        undeposited0,
        undeposited1,
        deposited0: deposited.balance0_e8s,
        deposited1: deposited.balance1_e8s,
        usdValue0,
        usdValue1
      });
    } catch (error) {
      console.error('Error fetching pool balances:', error);
    }
  }, [isAuthenticated, poolId, token0Address, token1Address, icpSwapExecutionService]);

  // Update the refreshBalances function
  const refreshBalances = async () => {
    console.log('Refreshing balances...');
    
    // Add just the rate limit check
    const now = Date.now();
    if (lastRefreshTimestamp && now - lastRefreshTimestamp < 10000) {  // 10 seconds
      console.log('Refresh rate limited, skipping... Next refresh in', 
        Math.ceil((60000 - (now - lastRefreshTimestamp)) / 1000), 'seconds');
      return;
    }
    setLastRefreshTimestamp(now);

    // Bail if we're already loading balances
    if (isLoadingBalances) {
      console.log('Already loading balances, skipping...');
      return;
    }

    setIsLoadingBalances(true);
    
    try {
      // Fetch all balances first
      const [fromBalance, toBalance] = await Promise.all([
        fromToken ? icpSwapExecutionService.getBalance(fromToken) : null,
        toToken ? icpSwapExecutionService.getBalance(toToken) : null
      ]);

      // Update states after we have the balances
      if (fromBalance && !fromBalance.error && fromToken) {
        const formattedBalance = formatTokenAmount(fromBalance.balance_e8s, fromToken);
        setFromTokenBalance(formattedBalance);
        setTokens(prevTokens => prevTokens.map(token => 
          token.canisterId === fromToken ? {
            ...token,
            balance: formattedBalance,
            error: undefined,
            isLoading: false
          } : token
        ));
      }

      if (toBalance && !toBalance.error && toToken) {
        const formattedBalance = formatTokenAmount(toBalance.balance_e8s, toToken);
        setToTokenBalance(formattedBalance);
        setTokens(prevTokens => prevTokens.map(token => 
          token.canisterId === toToken ? {
            ...token,
            balance: formattedBalance,
            error: undefined,
            isLoading: false
          } : token
        ));
      }

      // Fetch pool balances last since they're displayed separately
      await fetchPoolBalances();
    } catch (error) {
      console.error('Error refreshing balances:', error);
    } finally {
      setIsLoadingBalances(false);
    }
  };

  // Execute the swap with the callback
  const onConfirm = async (): Promise<SwapResult> => {
    if (!fromToken || !toToken || !swapDetails) return { success: false };
    
    if (selectedDex !== 'icpswap') return { success: false };

    setIsSwapping(true);
    try {
      // Save the kong quote
      const kongOutput = kongQuote?.amountOut || BigInt(0);

      // Get pool metadata to determine token order
      const metadata = await icpSwapFactoryService.getPool({
        token0: { address: fromToken, standard: 'ICRC1' },
        token1: { address: toToken, standard: 'ICRC1' },
        fee: DEFAULT_FEE,
      });

      // Initialize steps before execution
      const newSteps: SwapStep[] = [
        {
          title: '1. Prepare tokens',
          description: 'Approve or transfer tokens to the pool',
          status: 'pending' as const,
          details: {
            amount: fromAmount ? `${fromAmount}` : undefined,
            canisterId: fromToken,
            tokenSymbol: getTokenSymbol(fromToken),
            tokenOutSymbol: getTokenSymbol(toToken),
          }
        },
        {
          title: '2. Deposit',
          description: 'Deposit tokens into the pool',
          status: 'pending' as const,
          details: {
            amount: fromAmount ? `${fromAmount}` : undefined,
            canisterId: fromToken,
            tokenSymbol: getTokenSymbol(fromToken),
            tokenOutSymbol: getTokenSymbol(toToken),
          }
        },
        {
          title: '3. Swap',
          description: 'Swap tokens in the pool',
          status: 'pending' as const,
          details: {
            amount: fromAmount ? `${fromAmount}` : undefined,
            amountOut: quote?.amountOut ? 
              `${quote.amountOut}` : 
              undefined,
            canisterId: fromToken,
            tokenSymbol: getTokenSymbol(fromToken),
            tokenOutSymbol: getTokenSymbol(toToken),
          }
        },
        {
          title: '4. Withdraw',
          description: 'Withdraw tokens from the pool',
          status: 'pending' as const,
          details: {
            amount: fromAmount ? `${fromAmount}` : undefined,
            amountOut: quote?.amountOut ? 
              `${quote.amountOut}` : 
              undefined,
            canisterId: toToken,
          }
        },
      ];
      setSteps(newSteps);

      let amount_e8s = BigInt(swapDetails.fromToken.amount_e8s);
      let swapped_amount = BigInt(0);
      
      // Create execution parameters from the swap details
      const executionParams: ICPSwapExecutionParams = {
        poolId: swapDetails?.poolId || '',
        fromToken: {
          amount_e8s: amount_e8s.toString(),
          canisterId: swapDetails.fromToken.canisterId,
        },
        toToken: {
          minAmount_e8s: swapDetails?.minimumReceived_e8s,
          canisterId: swapDetails.toToken.canisterId,
        },
        zeroForOne: fromToken === metadata.token0.address,
        slippageTolerance: swapDetails.slippageTolerance,
      };

      console.log('Executing swap with params:', executionParams);
      // Execute the swap
      const results = await icpSwapExecutionService.executeICPSwap(swapDetails.depositNeeds, executionParams, async (result) => {
        const step = result.step;
        const status = result.status;
        if (!step || !status) return;
        
        swapped_amount = result.outputAmount || swapped_amount;

        // Map backend steps to UI steps more reliably using step names
        let stepIndex = -1;
        if (step === 'approve' || step === 'transfer') {
          stepIndex = 0; // First step
        } else if (step === 'deposit') {
          stepIndex = 1; // Second step
        } else if (step === 'swap') {
          stepIndex = 2; // Third step
        } else if (step === 'withdraw') {
          stepIndex = 3; // Fourth step
        }

        if (stepIndex === -1) return;
        console.log('setSteps, stepIndex', stepIndex);

        // Update the step with new status and details
        setSteps(currentSteps => {
          const updatedSteps = [...currentSteps];
          updatedSteps[stepIndex] = {
            ...updatedSteps[stepIndex],
            status,
            details: {
              ...updatedSteps[stepIndex].details,
              ...result.details,
            },
            optimizationMessage: result.optimizationMessage
          };

          // If this step completed and there's a next step, start it
          if (status === 'complete' && stepIndex < updatedSteps.length - 1) {
            updatedSteps[stepIndex + 1] = {
              ...updatedSteps[stepIndex + 1],
              status: 'loading'
            };
          }

          return updatedSteps;
        });
      }, keepTokensInPool);
      
      // Check if all steps succeeded
      const allSucceeded = results.every(result => !result.error);
      if (!allSucceeded) {
        const failedResult = results.find(result => result.error);
        setNotification({ type: 'error', message: `Swap failed: ${failedResult?.error || 'Unknown error'}` });
        console.log('Refreshing balances after failed swap');
        await refreshBalances();
        return { success: false, error: failedResult?.error };
      }

      setNotification({ type: 'success', message: 'Swap executed successfully!' });
      // Record statistics
      try {
        const principal = authService.getPrincipal();
        if (principal && poolId) {
          // Calculate savings using our existing quotes - if ICPSwap was chosen, compare with Kong quote
          const icpswapOutput = swapped_amount;
          // If ICPSwap gives better output than Kong, savings is the difference, otherwise 0
          const savings = icpswapOutput > kongOutput ? (icpswapOutput - kongOutput).toString() : '0';

          /*await*/ statsService.recordICPSwapSwap(
            principal,
            executionParams.fromToken.canisterId,
            executionParams.fromToken.amount_e8s,
            executionParams.toToken.canisterId,
            swapped_amount.toString() || '0',
            savings,
            typeof poolId === 'string' ? Principal.fromText(poolId) : poolId,
          );
        }
      } catch (error) {
        console.error('Failed to record ICPSwap stats:', error);
        // Fire and forget - no error handling per spec
      }
      console.log('Refreshing balances after swap');
      /*await*/ refreshBalances();
      //console.log('Resetting form after swap');
      //resetForm();
      
      // After successful swap
      setNeedsScan(true);
      
      return { success: true };
    } catch (error) {
      console.error('Swap execution failed:', error);
      console.log('Refreshing balances after failed swap');
      /*await*/ refreshBalances();
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during swap execution',
      };
    }
  };

  // Add helper function to calculate pool withdrawal needs
  const calculatePoolWithdrawalNeeds = async (amount_e8s: bigint, walletBalance: bigint, depositedBalance: bigint, undepositedBalance: bigint, allowance_e8s: bigint, standard: string, options?: {
    reservedDeposited?: bigint;
    reservedUndeposited?: bigint;
    reservedWallet?: bigint;
  }): Promise<{
    fromDeposited: bigint;
    fromUndeposited: bigint;
    adjustedInput?: bigint;  // Add this to signal if we had to adjust the input down
  } | null> => {
    if (!fromToken || !poolId || !icpSwapExecutionService) return null;

    try {
      const isICRC1 = standard.toLowerCase().includes('icrc1');
      
      // Get wallet balance and metadata
      const metadata = await tokenService.getMetadata(fromToken);
      const fee = metadata.fee;

      if (amount_e8s <= fee) {
        return {
          fromDeposited: BigInt(0),
          fromUndeposited: BigInt(0),
          adjustedInput: BigInt(0)
        };
      }

      // we will always end up using the wallet, so we will always use 1 fee
      let availableWallet = walletBalance - (options?.reservedWallet || 0n);
      let stashedFee = BigInt(0);
      if (availableWallet < fee) {
        stashedFee = fee; // stash a fee if we don't have enough in wallet to pay for the first fee yet, but we will after withdrawing
      }
      availableWallet = availableWallet >= fee ? availableWallet - fee : availableWallet; 

      let adjustedAmount = amount_e8s > fee ? amount_e8s - fee : BigInt(0);

      if (!isICRC1 && adjustedAmount > allowance_e8s) {

        if (adjustedAmount <= fee) {
          return {
            fromDeposited: BigInt(0),
            fromUndeposited: BigInt(0),
            adjustedInput: BigInt(0)
          };
        }

        adjustedAmount = adjustedAmount >= fee ? adjustedAmount - fee : BigInt(0); 
        if (availableWallet < fee) {
          stashedFee += fee; // stash a fee if we don't have enough in wallet to pay for the first fee yet, but we will after withdrawing
        }
        availableWallet = availableWallet >= fee ? availableWallet - fee : availableWallet;
      }

      console.log('Kong Initial values:', {
        amount_e8s: amount_e8s.toString(),
        walletBalance: walletBalance.toString(),
        reservedWallet: (options?.reservedWallet || 0n).toString(),
        availableWallet: availableWallet.toString(),
        adjustedAmount: adjustedAmount.toString(),
        allowance_e8s: allowance_e8s.toString(),
        fee: fee.toString()
      });

      // If wallet has enough for input + fees, no need to withdraw
      if (availableWallet >= adjustedAmount) {
        console.log('Sufficient wallet balance, no withdrawal needed');
        return {
          fromDeposited: BigInt(0),
          fromUndeposited: BigInt(0),
          adjustedInput: adjustedAmount
        };
      };

      // Account for any reserved amounts
      const availableDeposited = depositedBalance - (options?.reservedDeposited || 0n);
      const availableUndeposited = undepositedBalance - (options?.reservedUndeposited || 0n);

      console.log('Pool balances:', {
        depositedBalance: depositedBalance.toString(),
        undepositedBalance: undepositedBalance.toString(),
        availableDeposited: availableDeposited.toString(),
        availableUndeposited: availableUndeposited.toString()
      });

      // Calculate how much we need from deposited
      //const remain = adjustedAmount - (availableWallet > fee ? availableWallet : BigInt(0));
      const remain = adjustedAmount - availableWallet;
      const fromWallet = adjustedAmount; // stash away in case we don't withdraw remainder from deposited funds
      console.log('Remain after wallet:', remain.toString());

      // We can never withdraw dust from deposited funds, so we need to check for that first
      if (remain <= fee) {
        return {
          fromDeposited: BigInt(0),
          fromUndeposited: BigInt(0),
          adjustedInput: adjustedAmount - remain  // Adjust input to skip tiny withdrawal
        };
      }
      
      let fromDeposited = BigInt(0);
      
      // Try to get it all from deposited if possible
      if (availableDeposited >= remain + fee) {
        fromDeposited = remain + fee;
        console.log('Can get all from deposited:', fromDeposited.toString(), ', adjustedInput: ', adjustedAmount - fee);
        return {
          fromDeposited,
          fromUndeposited: BigInt(0),
          adjustedInput: adjustedAmount - fee
        };
      }

      // If we need undeposited funds
      fromDeposited = availableDeposited;

      //let remain2 = adjustedAmount - (availableWallet > fee ? availableWallet : BigInt(0)) - (availableDeposited > fee ? availableDeposited - fee : BigInt(0)) ;
      let remain2 = adjustedAmount - availableWallet - availableDeposited;
      
      if (fromDeposited > BigInt(0)) {

        if (adjustedAmount <= fee) {  // we can't afford the fees.
          return {
            fromDeposited: BigInt(0),
            fromUndeposited: BigInt(0),
            adjustedInput: BigInt(0)
          };
        }

        adjustedAmount -= fee;
      }

      // If we have reservedUndeposited, this is a split swap where the deposits will be combined, so we don't need another fee here
      const depositFee = options?.reservedUndeposited || BigInt(0) > BigInt(0) ? BigInt(0) : fee;
      if (remain2 > depositFee) {
        adjustedAmount -= depositFee;
      } else {
        adjustedAmount -= remain2;  // We can't use dust from undeposited funds, unless this is a split swap where the icpswap portion will also use funds from undeposited
        remain2 = BigInt(0);
      }
            
      console.log('Need undeposited funds:', {
        remain2: remain2.toString(),
        availableUndeposited: availableUndeposited.toString()
      });
 
      // Calculate final fromUndeposited and update fromDeposited
      const fromUndeposited = remain2;
      fromDeposited = availableDeposited + (remain2 > depositFee ? remain2 - depositFee : BigInt(0));  // Add remain2 to fromDeposited since we'll deposit it
      
      // We can never withdraw dust from deposited funds, so we need to check for that first
      if (fromDeposited <= fee) {
        console.log('Will not withdraw dust from deposited funds:', {
          fromDeposited: '0',
          fromUndeposited: fromUndeposited.toString(),
          adjustedAmount: (fromWallet - remain).toString()
        });
        return {
          fromDeposited: BigInt(0),
          fromUndeposited: fromUndeposited, // Allow split swap ICPSwap portion to move undeposited dust in combo deposit (why not?)
          adjustedInput: fromWallet - remain  // Adjust input to skip tiny withdrawal
        };
      }

      console.log('Kong Final values:', {
        fromDeposited: fromDeposited.toString(),
        fromUndeposited: fromUndeposited.toString(),
        adjustedAmount: adjustedAmount.toString()
      });

      return {
        fromDeposited,
        fromUndeposited,
        adjustedInput: adjustedAmount
      };
    } catch (error) {
      console.error('Error calculating pool withdrawal needs:', error);
      return null;
    }
  };

  // Modify Kong swap steps based on withdrawal needs
  const createKongSwapDetails = async (fromToken: string, toToken: string, quote: KongQuote | null) => {
    if (!fromToken || !toToken || !quote || quote.loading || !quote.amountOut || !quote.request) return null;

    const depositNeeds = quote.request.depositNeeds;
    const amountOut = quote.amountOut;

    // Get token metadata for fees
    const toTokenMetadata = await tokenService.getMetadata(toToken);

    // Calculate minimum amount out with slippage
    const minAmountOut = calculateMinimumReceived(amountOut, slippageTolerance);

    // Calculate input fees from the difference between original and adjusted amounts
    const inputFees = depositNeeds.originalAmount - depositNeeds.adjustedAmount;

    return {
      fromToken: {
        symbol: fromToken,
        amount_e8s: depositNeeds.adjustedAmount,
        original_amount_e8s: depositNeeds.originalAmount,
        canisterId: fromToken,
        deposited: depositNeeds.fromDeposited,
        undeposited: depositNeeds.fromUndeposited,
        wallet: depositNeeds.fromWallet,
      },
      toToken: {
        symbol: toToken,
        amount_e8s: amountOut,
        canisterId: toToken,
      },
      price: calculatePrice(depositNeeds.adjustedAmount, amountOut),
      lpFee: `${formatTokenAmount(BigInt(Math.round(Number(depositNeeds.adjustedAmount) * 0.003)), fromToken)} ${getTokenSymbol(fromToken)}`, // Kong's LP fee is 0.3%
      priceImpact: quote.priceImpact || 0,
      slippageTolerance,
      minimumReceived_e8s: minAmountOut.toString(),
      depositNeeds,
      estimatedFees: {
        from: formatTokenAmount(inputFees, fromToken),
        to: formatTokenAmount(toTokenMetadata.fee, toToken),
      },
    };
  };

const createSplitSwapDetails = async() => {
  if (!fromToken || !toToken || !splitQuotes || splitQuotes.icpswap.loading || splitQuotes.kong.loading || !quote.amountOut || !quote.depositNeeds || !poolId) return null;

    // Get amount in base units using proper token metadata
    //const amountInBaseUnits = (await parseTokenAmount(fromAmount, fromToken || '')).toString();

    // Calculate minimum amounts with slippage (no additional adjustments needed since fees are handled in quotes)
    const icpswapMinAmountOut = splitQuotes.icpswap.amountOut ? calculateMinimumReceived(BigInt(splitQuotes.icpswap.amountOut), slippageTolerance) : BigInt(0);
    const kongMinAmountOut = splitQuotes.kong.amountOut ? calculateMinimumReceived(BigInt(splitQuotes.kong.amountOut), slippageTolerance) : BigInt(0);

    // Get token metadata for fee calculations
    const toTokenMetadata = await tokenService.getMetadata(toToken || '');

    const icpswap_amount_e8s = splitQuotes.icpswap.request?.depositNeeds?.adjustedAmount || BigInt(0);
    const kong_amount_e8s = splitQuotes.kong.request?.depositNeeds?.adjustedAmount || BigInt(0);
    const total_e8s = icpswap_amount_e8s + kong_amount_e8s;
    const original_total_e8s =  (BigInt(splitQuotes.icpswap.request?.depositNeeds?.originalAmount || icpswap_amount_e8s.toString())) + (BigInt(splitQuotes.kong.request?.depositNeeds?.originalAmount || kong_amount_e8s.toString())) ;

    // Calculate fees from the difference between original and adjusted amounts
    const icpswapFees = splitQuotes.icpswap.request?.depositNeeds ? 
      BigInt(splitQuotes.icpswap.request.depositNeeds?.originalAmount?.toString() || icpswap_amount_e8s.toString()) - BigInt(splitQuotes.icpswap.request.depositNeeds?.adjustedAmount.toString() || icpswap_amount_e8s.toString()) : 
      BigInt(0);
    const kongFees = splitQuotes.kong.request?.depositNeeds ? 
      BigInt(splitQuotes.kong.request.depositNeeds?.originalAmount?.toString() || kong_amount_e8s.toString()) - BigInt(splitQuotes.kong.request.depositNeeds?.adjustedAmount.toString() || kong_amount_e8s.toString()) : 
      BigInt(0);
    const icpswapOutputFees = keepTokensInPool ? BigInt(0) : toTokenMetadata.fee;

    // Create split swap details
    return {
      fromToken: {
        symbol: getTokenSymbol(fromToken || ''),
        amount_e8s: total_e8s,
        original_amount_e8s: original_total_e8s,
        canisterId: fromToken,
      },
      toToken: {
        symbol: getTokenSymbol(toToken || ''),
        amount_e8s: splitQuotes.split.amountOut,
        canisterId: toToken,
      },
      price: (Number(splitQuotes.split.amountOut) / Number(total_e8s)),
      priceUSD: 0, // TODO: Add USD price calculation
      lpFee: await (async () => {
        const feeAmount = await (async () => {          
          // Calculate ICPSwap portion (0.3%)
          const icpswapFee = BigInt(Math.floor(Number(icpswap_amount_e8s) * 0.003));
          
          // Calculate Kong portion - for now use 0.3% since we can't easily get the fee
          const kongFee = BigInt(Math.floor(Number(kong_amount_e8s) * 0.003));
          
          return icpswapFee + kongFee;
        })();
        
        return `${await formatTokenAmount(feeAmount, fromToken || '')} ${getTokenSymbol(fromToken || '')}`;
      })(),
      priceImpact: splitQuotes.split.priceImpact || 0,
      slippageTolerance,
      minimumReceived_e8s: (icpswapMinAmountOut + kongMinAmountOut).toString(),
      estimatedFees: {
        icpswap: {
          from: formatTokenAmount(icpswapFees, fromToken || ''),
          to: formatTokenAmount(icpswapOutputFees, toToken || '')
        },
        kong: {
          from: formatTokenAmount(kongFees, fromToken || ''),
          to: formatTokenAmount(toTokenMetadata.fee, toToken || '')
        }
      },
      dex: 'split' as const,
      poolId: poolId,
      distribution,      
      icpswap: {
        amount_e8s: icpswap_amount_e8s.toString(),
        amountOut_e8s: splitQuotes.icpswap.amountOut || '0',
        priceImpact: splitQuotes.icpswap.priceImpact || 0,
        minimumReceived_e8s: icpswapMinAmountOut.toString(),
        depositNeeds: splitQuotes.icpswap.request?.depositNeeds
      },
      kong: {
        amount_e8s: kong_amount_e8s.toString(),
        amountOut_e8s: splitQuotes.kong.amountOut || '0',
        priceImpact: splitQuotes.kong.priceImpact || 0,
        minimumReceived_e8s: kongMinAmountOut.toString(),
        depositNeeds: splitQuotes.kong.request?.depositNeeds
      }
    };  
}
/*
  // Update steps when Kong swap is selected
  useEffect(() => {
    if (!selectedDex) return;
     const hasWithdrawalNeed = (swapDetails?.withdrawalNeeds?.fromDeposited || BigInt(0)) + (swapDetails?.withdrawalNeeds?.fromUndeposited || BigInt(0)) > BigInt(0); 
    setSteps(selectedDex === 'icpswap' ? [
      // ... existing ICPSwap steps ...
    ] : selectedDex === 'kong' ? [
      // Add conditional withdrawal steps for Kong
      ...(hasWithdrawalNeed ? [
        {
          title: '1. Withdraw from Pool',
          description: 'Withdraw tokens from ICPSwap pool',
          status: 'pending' as const,  // Fix type error by explicitly typing as const
          details: {
            amount: swapDetails.withdrawalNeeds.fromDeposited > 0 ? 
              formatTokenAmount(swapDetails.withdrawalNeeds.fromDeposited, swapDetails.fromToken.canisterId) : undefined,
            tokenSymbol: getTokenSymbol(swapDetails.fromToken.canisterId),
            canisterId: swapDetails.fromToken.canisterId
          }
        }
      ] : []),
      {
        title: hasWithdrawalNeed ? '2. Transfer to Kong' : '1. Transfer to Kong',
        description: 'Transfer tokens to Kong',
        status: 'pending' as const,  // Fix type error by explicitly typing as const
        details: {
          amount: fromAmount ? `${fromAmount}` : undefined,
          canisterId: fromToken || undefined
        }
      },
      {
        title: hasWithdrawalNeed ? '3. Execute Swap' : '2. Execute Swap',
        description: 'Execute Kong swap',
        status: 'pending' as const,  // Fix type error by explicitly typing as const
        details: {
          amount: kongQuote.amountOut && toToken ? `${formatTokenAmount(kongQuote.amountOut, toToken)}` : undefined,
          canisterId: toToken || undefined
        }
      }
    ] : [
      // ... existing split swap steps ...
    ]);
  }, [selectedDex, swapDetails]);
*/
  // Modify Kong swap execution to handle withdrawals
  const onConfirmKongSwap = async (): Promise<SwapResult> => {
    if (!fromToken || !toToken || !fromAmount || !kongQuote.amountOut || !kongQuote.request  || !kongQuote.request.depositNeeds) 
      return { success: false, error: 'Missing required data' };

    try {
      // Save the ICPSwap quote for savings comparison
      const icpswapOutput = BigInt(quote?.amountOut?.toString() || '0');

      // Use the adjusted amount from the quote instead of parsing raw input
      const amount_e8s = BigInt(kongQuote.request.amount_e8s);
      console.log('Using adjusted amount from quote:', amount_e8s.toString());
      
      const withdrawalNeeds = kongQuote.request.depositNeeds;
      console.log("withdrawalNeeds: ", withdrawalNeeds);
      const actualAmount = withdrawalNeeds?.adjustedAmount || amount_e8s;

      if (withdrawalNeeds && (withdrawalNeeds.fromDeposited + withdrawalNeeds.fromUndeposited > BigInt(0))) {
        // Update steps to include withdrawal
        console.log("Withdrawal Needs!");

        if (!poolId) {
          console.log("No Pool ID, Withdrawal Needed but no pool.");
          return { success: false, error: 'No Pool ID, Withdrawal Needed but no pool.' };
        }
  
        setSteps([
          {
            title: `Withdraw from ICPSwap pool`,
            description: `Withdrawing ${formatTokenAmount(withdrawalNeeds.fromDeposited, fromToken)} ${getTokenSymbol(fromToken)}`,
            status: 'pending' as const,
            details: {
              amount: formatTokenAmount(withdrawalNeeds.fromDeposited, fromToken),
              tokenSymbol: getTokenSymbol(fromToken)
            }
          },
          {
            title: `Transfer to Kong`,
            description: 'Transferring tokens to Kong',
            status: 'pending' as const,
            details: {
              amount: formatTokenAmount(actualAmount, fromToken),
              tokenSymbol: getTokenSymbol(fromToken)
            }
          },
          {
            title: `Execute swap`,
            description: 'Executing swap on Kong',
            status: 'pending' as const,
            details: {
              amount: formatTokenAmount(actualAmount, fromToken),
              tokenSymbol: getTokenSymbol(fromToken),
              tokenOutSymbol: getTokenSymbol(toToken)
            }
          }
        ]);

        startNextStep();  // Start withdraw step

        // First deposit any undeposited amount if needed
        if (withdrawalNeeds.fromUndeposited > 0 && poolId) {
          const depositResult = await icpSwapExecutionService.depositTokenToPool({
            poolId: poolId.toString(),
            tokenId: fromToken,
            amount_e8s: withdrawalNeeds.fromUndeposited.toString(),
            source: 'undeposited'
          });

          if (!depositResult.success) {
            failStep(0, depositResult.error || 'Failed to deposit undeposited balance');
            throw new Error(depositResult.error || 'Failed to deposit undeposited balance');
          }
        }

        // Then withdraw the deposited amount
        const withdrawResult = await icpSwapExecutionService.withdrawFromPool({
          poolId: poolId.toString(),
          tokenId: fromToken,
          amount_e8s: withdrawalNeeds.fromDeposited.toString()
        });

        if (!withdrawResult.success) {
          failStep(0, withdrawResult.error || 'Failed to withdraw');
          throw new Error(withdrawResult.error || 'Failed to withdraw');
        }
        completeStep(0);  // Complete withdraw step

        startNextStep();  // Start transfer step
        const transferResult = await kongSwapService.transferToKong({
          tokenId: fromToken,
          amount_e8s: actualAmount.toString(),
        });

        if (!transferResult.success) {
          failStep(1, transferResult.error || 'Failed to transfer');
          throw new Error(transferResult.error || 'Failed to transfer');
        }
        completeStep(1);  // Complete transfer step

        startNextStep();  // Start swap step
        const swapDetails = await createKongSwapDetails(fromToken, toToken, kongQuote);
        if (!swapDetails) {
          failStep(2, 'Failed to create swap details');
          throw new Error('Failed to create swap details');
        }

        const kongSwapParams = {
          fromToken: {
            canisterId: swapDetails.fromToken.canisterId,
            amount_e8s: actualAmount.toString(),
            txId: transferResult.txId,
          },
          toToken: {
            canisterId: swapDetails.toToken.canisterId,
            minAmount_e8s: swapDetails.toToken.amount_e8s.toString(),
          },
          slippageTolerance: swapDetails.slippageTolerance + (swapDetails.priceImpact || 0),
        };

        const swapResult = await kongSwapService.executeKongSwap(kongSwapParams);
        if (!swapResult.success) {
          failStep(2, swapResult.error || 'Failed to execute swap');
          throw new Error(swapResult.error || 'Failed to execute swap');
        }
        completeStep(2);  // Complete swap step

        // Record statistics
        try {
          const principal = authService.getPrincipal();
          if (principal) {
            // Calculate savings using saved quotes - if Kong was chosen, compare with ICPSwap quote
            const kongOutput = swapResult.success ? swapResult?.amountOut || BigInt(0) : BigInt(0);
            // If Kong gives better output than ICPSwap, savings is the difference, otherwise 0
            const savings = kongOutput > icpswapOutput ? kongOutput - icpswapOutput : BigInt(0);

            /*await*/ statsService.recordKongSwap(
              principal,
              swapDetails.fromToken.canisterId,
              actualAmount,
              swapDetails.toToken.canisterId,
              swapResult.success ? swapResult?.amountOut || BigInt(0) : BigInt(0),
              savings,
            );
          }
        } catch (error) {
          console.error('Failed to record Kong stats:', error);
          // Fire and forget - no error handling per spec
        }

        /*await*/ refreshBalances();

        return { success: true };
      } else {
        console.log("No Withdrawal Needed.");
        // No withdrawal needed, proceed with direct Kong swap
        startNextStep();
        const transferResult = await kongSwapService.transferToKong({
          tokenId: fromToken,
          amount_e8s: actualAmount.toString(),
        });

        if (!transferResult.success) {
          failStep(0, transferResult.error || 'Failed to transfer');
          return { success: false, error: transferResult.error || 'Failed to transfer' };
        }
        completeStep(0);

        startNextStep();
        const swapDetails = await createKongSwapDetails(fromToken, toToken, kongQuote);
        if (!swapDetails) {
          failStep(1, 'Failed to create swap details');
          return { success: false, error: 'Failed to create swap details' };
        }

        const kongSwapParams = {
          fromToken: {
            canisterId: swapDetails.fromToken.canisterId,
            amount_e8s: actualAmount.toString(),
            txId: transferResult.txId,
          },
          toToken: {
            canisterId: swapDetails.toToken.canisterId,
            minAmount_e8s: swapDetails.toToken.amount_e8s.toString(),
          },
          slippageTolerance: swapDetails.slippageTolerance + (swapDetails.priceImpact || 0),
        };

        const swapResult = await kongSwapService.executeKongSwap(kongSwapParams);
        if (!swapResult.success) {
          failStep(1, swapResult.error || 'Failed to execute swap');
          throw new Error(swapResult.error || 'Failed to execute swap');
        }
        completeStep(1);

        // Record statistics
        try {
          const principal = authService.getPrincipal();
          if (principal) {
            // Calculate savings using saved quotes - if Kong was chosen, compare with ICPSwap quote
            const kongOutput = swapResult.success ? BigInt(swapResult.amountOut?.toString() || '0') : BigInt(0);
            // If Kong gives better output than ICPSwap, savings is the difference, otherwise 0
            const savings = kongOutput > icpswapOutput ? kongOutput - icpswapOutput : BigInt(0);
            /*await*/ statsService.recordKongSwap(
              principal,
              swapDetails.fromToken.canisterId,
              BigInt(actualAmount.toString()),
              swapDetails.toToken.canisterId,
              BigInt(swapResult.success ? swapResult.amountOut?.toString() || '0' : '0'),
              BigInt(savings.toString()),
            );
          }
        } catch (error) {
          console.error('Failed to record Kong stats:', error);
          // Fire and forget - no error handling per spec
        }
        
        /*await*/ refreshBalances();
        return { success: true };
      }
    } catch (error) {
      console.error('Kong swap error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  };

  const startNextStep = () => {
    setSteps(currentSteps => {
      const nextStepIndex = currentSteps.findIndex(step => step.status === 'pending');
      if (nextStepIndex === -1) return currentSteps;

      return currentSteps.map((step, index) => 
        index === nextStepIndex ? { ...step, status: 'loading' } : step
      );
    });
    return steps.findIndex(step => step.status === 'pending');
  };

  const completeStep = (stepIndex: number) => {
    setSteps(currentSteps =>
      currentSteps.map((step, index) =>
        index === stepIndex ? { ...step, status: 'complete' } : step
      )
    );
  };

  const failStep = (stepIndex: number, error: string) => {
    setSteps(currentSteps =>
      currentSteps.map((step, index) =>
        index === stepIndex ? { ...step, status: 'error', error } : step
      )
    );
  };

  const resetSteps = () => {
    console.log("RESET STEPS");
    setSteps(steps => steps.map(step => ({ ...step, status: 'pending', details: undefined, error: undefined })));
    resetSplitSteps();
  };

  // Update steps when selectedDex changes
  useEffect(() => {
    if (!selectedDex) return;
    
    const newSteps: SwapStep[] = selectedDex === 'icpswap' ? [
      {
        title: '1. Prepare tokens',
        description: 'Approve or transfer tokens to the pool',
        status: 'pending' as const,
        details: {
          amount: fromAmount ? `${fromAmount}` : undefined,
          canisterId: fromToken || undefined,
          tokenSymbol: getTokenSymbol(fromToken || ''),
          tokenOutSymbol: getTokenSymbol(toToken || ''),
        }
      },
      {
        title: '2. Deposit',
        description: 'Deposit tokens into the pool',
        status: 'pending' as const,
        details: {
          amount: fromAmount ? `${fromAmount}` : undefined,
          canisterId: fromToken || undefined,
          tokenSymbol: getTokenSymbol(fromToken || ''),
          tokenOutSymbol: getTokenSymbol(toToken || ''),
        }
      },
      {
        title: '3. Swap',
        description: 'Swap tokens in the pool',
        status: 'pending' as const,
        details: {
          amount: fromAmount ? `${fromAmount}` : undefined,
          amountOut: quote?.amountOut? 
            `${formatTokenAmount(BigInt(quote.amountOut), toToken || '')}` : 
            undefined,
          canisterId: fromToken || undefined,
          tokenSymbol: getTokenSymbol(fromToken || ''),
          tokenOutSymbol: getTokenSymbol(toToken || ''),
        }
      },
      {
        title: '4. Withdraw',
        description: 'Withdraw tokens from the pool',
        status: 'pending' as const,
        details: {
          amount: fromAmount ? `${fromAmount}` : undefined,
          amountOut: quote?.amountOut ? 
            `${formatTokenAmount(BigInt(quote.amountOut), toToken || '')}` : 
            undefined,
          canisterId: toToken || undefined,
          tokenSymbol: getTokenSymbol(fromToken || ''),
          tokenOutSymbol: getTokenSymbol(toToken || ''),
        }
      }
    ] : selectedDex === 'kong' ? [
      {
        title: '1. Transfer to Kong',
        description: 'Transfer tokens to Kong',
        status: 'pending' as const,
        details: {
          amount: fromAmount ? `${fromAmount}` : undefined,
          canisterId: fromToken || undefined,
          tokenSymbol: getTokenSymbol(fromToken || ''),
          tokenOutSymbol: getTokenSymbol(toToken || ''),
        }
      },
      {
        title: '2. Execute Swap',
        description: 'Execute Kong swap',
        status: 'pending' as const,
        details: {
          amount: kongQuote.amountOut && toToken ? `${formatTokenAmount(kongQuote.amountOut, toToken)}` : undefined,
          canisterId: toToken || undefined,
          tokenSymbol: getTokenSymbol(fromToken || ''),
          tokenOutSymbol: getTokenSymbol(toToken || ''),
        }
      }
    ] : [];

    setSteps(newSteps);
  }, [selectedDex, fromToken, toToken, fromAmount, kongQuote.amountOut, splitQuotes?.icpswap?.amountOut]);

  // Use slippageTolerance in swap details
  const createSwapDetails = async () => {
    if (!fromToken || !toToken || !quote || quote.loading || !quote.amountOut || !quote.depositNeeds || !poolId) return null;

    // Create local variables after null check
    const { depositNeeds } = quote;
    const amountOut = quote.amountOut;

    // Get token metadata for fees
    const toTokenMetadata = await tokenService.getMetadata(toToken);

    // Calculate minimum amount out with slippage
    const minAmountOut = calculateMinimumReceived(amountOut, slippageTolerance);

    // Calculate input fees from the difference between original and adjusted amounts
    const inputFees = depositNeeds.originalAmount - depositNeeds.adjustedAmount;
    const outputFees = keepTokensInPool ? BigInt(0) : toTokenMetadata.fee;
    return {
      fromToken: {
        symbol: getTokenSymbol(fromToken),
        amount_e8s: depositNeeds.adjustedAmount.toString(),
        original_amount_e8s: depositNeeds.originalAmount.toString(),
        canisterId: fromToken,
      },
      toToken: {
        symbol: getTokenSymbol(toToken),
        amount_e8s: amountOut.toString(),
        canisterId: toToken,
      },
      price: Number(amountOut) / Number(depositNeeds.originalAmount),
      priceUSD: 0,
      lpFee: await (async () => {
        const feeAmount = BigInt(Math.floor(Number(depositNeeds.originalAmount) * 0.003));
        return `${formatTokenAmount(feeAmount, fromToken)} ${getTokenSymbol(fromToken)}`;
      })(),
      priceImpact: quote.priceImpact || 0,
      slippageTolerance,
      minimumReceived_e8s: minAmountOut.toString(),
      estimatedFees: {
        from: formatTokenAmount(inputFees, fromToken),
        to: formatTokenAmount(outputFees, toToken),
      },
      dex: 'icpswap' as const,
      poolId, 
      depositNeeds,           
    };
  };

  const updateSplitQuotes = async (callFromToken?: string, callToToken?: string, callFromAmount?: string, callDistribution?: number) => {
    const nullSplitQuote = {
      icpswap: { loading: false, amountOut: null, priceImpact: null, error: null, request: null },
      kong: { loading: false, amountOut: null, priceImpact: null, error: null, request: null },
      split: { loading: false, amountOut: null, priceImpact: null, error: null, request: null }
    };

    const useFromToken = callFromToken || fromToken;
    const useToToken = callToToken || toToken;
    const useFromAmount = callFromAmount ? parseTokenAmount(callFromAmount, useFromToken) : parseTokenAmount(fromAmount, fromToken);
    //const useFromAmount = parseTokenAmount(fromAmount, fromToken);
    const useDistribution = callDistribution || distribution;

    if (!useFromToken || !useToToken || !useFromAmount || !poolId) {
      setSplitQuotes(nullSplitQuote);
      return;
    }

    // Check for zero amount before proceeding
    const amountInE8s = useFromAmount;
    if (amountInE8s <= 0n) {
      setSplitQuotes(nullSplitQuote);
      return;
    }

    try {
      console.log('Updating split quotes with:', {
        useFromToken,
        useToToken,
        useFromAmount,
        useDistribution
      });

      // Calculate total amount in base units first
      let totalAmountInE8s = useFromAmount;
      // Handle dust for odd amounts
      let dust = totalAmountInE8s % 2n;
      let evenAmount = totalAmountInE8s - dust;

      // Calculate amounts for each DEX based on distribution
      let org_icpswapAmount = (evenAmount * BigInt(100 - useDistribution)) / BigInt(100);
      let org_kongAmount = (evenAmount * BigInt(useDistribution)) / BigInt(100);

      // Add dust to the DEX with higher distribution (or random for 50/50)
      if (dust > 0n) {
        if (useDistribution === 50) {
          // For 50/50, randomly assign dust
          if (Math.random() < 0.5) {
            console.log("ICPSwap won dust lottery! Congratulations!");
            org_icpswapAmount = org_icpswapAmount + dust;
          } else {
            console.log("Kong won dust lottery! Congratulations!");
            org_kongAmount = org_kongAmount + dust;
          }
        } else {
          // Give dust to DEX with higher distribution
          if (useDistribution > 50) {
            org_kongAmount = org_kongAmount + dust;
          } else {
            org_icpswapAmount = org_icpswapAmount + dust;
          }
        }
      }

      let icpswapAmount = org_icpswapAmount;
      let kongAmount = org_kongAmount;      

      // Calculate ICPSwap's needs - it prefers pool funds first
      const fromTokenMetadata = await tokenService.getMetadata(useFromToken);
      let icpswapAllowance = BigInt(0);
      let kongAllowance = BigInt(0);
      // If ICRC2 or DIP20 token, fetch existing allowance on ICPSwap and Kong.
      if (fromTokenMetadata.standard.toLowerCase().includes('dip20') || 
          fromTokenMetadata.standard.toLowerCase().includes('icrc2')) {
        // Check ICPSwap allowance
        icpswapAllowance = await icpSwapExecutionService.checkAllowance({
          tokenId: useFromToken,
          spender: typeof poolId === 'string' ? Principal.fromText(poolId) : poolId,
        });
        console.log('ICPSwap allowance:', icpswapAllowance.toString());  

        // Check Kong allowance 
        kongAllowance = await icpSwapExecutionService.checkAllowance({
          tokenId: useFromToken,
          spender: typeof kongCanisterId === 'string' ? Principal.fromText(kongCanisterId) : kongCanisterId
        });
        console.log('Kong allowance:', kongAllowance.toString());
      }

      // Get wallet balance
      const walletBalance = await icpSwapExecutionService.getBalance(useFromToken);

      // Get pool balances
      const [deposited, undeposited] = await Promise.all([
        icpSwapExecutionService.getDepositedPoolBalance({ poolId: poolId.toString() }),
        icpSwapExecutionService.getUndepositedPoolBalance({ poolId: poolId.toString(), tokenId: useFromToken })
      ]);

      const depositedBalance = isToken0(useFromToken) ? deposited.balance0_e8s : deposited.balance1_e8s;
      const undepositedBalance = !undeposited.error ? undeposited.balance_e8s : BigInt(0);
      
      const icpswapNeeds = await calculateICPSwapDepositNeeds(icpswapAmount, walletBalance.balance_e8s, depositedBalance, undepositedBalance, icpswapAllowance, fromTokenMetadata.standard);
      if (!icpswapNeeds) return { success: false, error: 'Failed to calculate ICPSwap needs' };
      
      icpswapAmount = icpswapNeeds?.adjustedAmount || icpswapAmount;

      // Calculate Kong's withdrawal needs, accounting for ICPSwap's reserved amounts
      const kongWithdrawalNeeds = await calculatePoolWithdrawalNeeds(
        kongAmount, walletBalance.balance_e8s, depositedBalance, undepositedBalance, kongAllowance, fromTokenMetadata.standard,
        {
          reservedDeposited: icpswapNeeds.fromDeposited,
          reservedUndeposited: icpswapNeeds.fromUndeposited,
          reservedWallet: icpswapNeeds.fromWallet > BigInt(0) ? icpswapNeeds.fromWallet + fromTokenMetadata.fee : BigInt(0)
        }
      );
      if (!kongWithdrawalNeeds) return { success: false, error: 'Failed to calculate Kong swap needs' };

      kongAmount = kongWithdrawalNeeds?.adjustedInput || kongAmount;

      setSplitQuotes(prev => ({
        icpswap: { 
          ...prev.icpswap, 
          loading: true, 
          error: null,
          request: {
            tokenIn: useFromToken,
            tokenOut: useToToken,
            amount_e8s: icpswapAmount,
            depositNeeds: {
              fromDeposited: icpswapNeeds.fromDeposited,
              fromUndeposited: icpswapNeeds.fromUndeposited,
              fromWallet: icpswapNeeds.fromWallet,
              adjustedAmount: icpswapAmount,
              originalAmount: totalAmountInE8s
            }
          }
        },
        kong: { 
          ...prev.kong, 
          loading: true, 
          error: null,
          request: {
            tokenIn: useFromToken,
            tokenOut: useToToken,
            amount_e8s: kongAmount,
            depositNeeds: {
              fromDeposited: kongWithdrawalNeeds.fromDeposited,
              fromUndeposited: kongWithdrawalNeeds.fromUndeposited,
              fromWallet: kongWithdrawalNeeds.adjustedInput || kongAmount,
              adjustedAmount: kongAmount,
              originalAmount: totalAmountInE8s
            }
          }
        },
        split: { ...prev.split, loading: true, error: null }
      }));

      const baseUnitMultiplier = BigInt(10) ** BigInt(fromTokenMetadata.decimals);

      console.log('Calculated split amounts:', {
        icpswapAmount: icpswapAmount.toString(),
        kongAmount: kongAmount.toString(),
        baseUnitMultiplier: baseUnitMultiplier.toString(),
        decimals: fromTokenMetadata.decimals,
      });
  
      const testFromToken = callFromToken || fromToken;
      const testToToken = callToToken || toToken;
      const testFromAmount = callFromAmount ? parseTokenAmount(callFromAmount, useFromToken) : parseTokenAmount(fromAmount, fromToken);
      const testDistribution = callDistribution || distribution;

      // Get quotes from both DEXes in parallel
      try {
        const [icpswapQuote, kongQuote] = await Promise.all([
          icpswapAmount > 0 
            ? icpSwapService.getQuote({
                amountIn: icpswapAmount,
                tokenIn: fromToken,
                tokenOut: toToken,
                fee: DEFAULT_FEE,
              }).catch(error => {
                console.error('ICPSwap quote error:', error);
                setSplitQuotes(nullSplitQuote);
                throw new Error(`ICPSwap quote failed: ${error.message}`);
              })
            : Promise.resolve({ amountOut: BigInt(0), priceImpact: 0 }),
          kongAmount > 0 
            ? kongSwapService.getQuote({
                amountIn: kongAmount,
                tokenIn: fromToken,
                tokenOut: toToken,
              }).catch(error => {
                console.error('Kong quote error:', error);
                setSplitQuotes(nullSplitQuote);
                throw new Error(`Kong quote failed: ${error.message}`);
              })
            : Promise.resolve({ amountOut: BigInt(0), priceImpact: 0 })
        ]);

        console.log('Received quotes:', {
          icpswap: {
            amountOut: icpswapQuote.amountOut.toString(),
            priceImpact: icpswapQuote.priceImpact
          },
          kong: {
            amountOut: kongQuote.amountOut.toString(),
            priceImpact: kongQuote.priceImpact
          }
        });

        if (useFromToken === testFromToken && 
          useToToken === testToToken && 
          useDistribution === testDistribution &&
          parseTokenAmount(fromAmount, useFromToken) === testFromAmount) {

          // Calculate total output amount
          const totalOutput = icpswapQuote.amountOut + kongQuote.amountOut;

          // Update split quotes state
          setSplitQuotes({
            icpswap: {
              loading: false,
              amountOut: icpswapQuote.amountOut.toString(),
              priceImpact: icpswapQuote.priceImpact,
              error: null,
              request: icpswapAmount > 0 ? {
                tokenIn: fromToken,
                tokenOut: toToken,
                amount_e8s: icpswapAmount,
                depositNeeds: {
                  fromDeposited: icpswapNeeds.fromDeposited,
                  fromUndeposited: icpswapNeeds.fromUndeposited,
                  fromWallet: icpswapNeeds.fromWallet,
                  adjustedAmount: icpswapAmount,
                  originalAmount: org_icpswapAmount
                }
              } : null
            },
            kong: {
              loading: false,
              amountOut: kongQuote.amountOut.toString(),
              priceImpact: kongQuote.priceImpact,
              error: null,
              request: kongAmount > 0 ? {
                tokenIn: fromToken,
                tokenOut: toToken,
                amount_e8s: kongAmount,
                depositNeeds: {
                  fromDeposited: kongWithdrawalNeeds?.fromDeposited || 0n,
                  fromUndeposited: kongWithdrawalNeeds?.fromUndeposited || 0n,
                  fromWallet: kongWithdrawalNeeds?.adjustedInput || kongAmount,
                  adjustedAmount: kongAmount,
                  originalAmount: org_kongAmount
                }
              } : null
            },
            split: {
              loading: false,
              amountOut: totalOutput.toString(),
              priceImpact: (icpswapQuote.priceImpact * (100 - distribution) + kongQuote.priceImpact * distribution) / 100,
              error: null,
              request: {
                tokenIn: fromToken,
                tokenOut: toToken,
                amount_e8s: icpswapAmount + kongAmount
              }
            }
          });        
        } else {
          setSplitQuotes(nullSplitQuote);
        }
      } catch (quoteError: any) {
        console.error('Error fetching quotes:', quoteError);
        setSplitQuotes(nullSplitQuote);

      }
    } catch (error: any) {
      console.error('Error in updateSplitQuotes:', error);
      setSplitQuotes(nullSplitQuote);

    }
  };

  // Add effect to load initial split quotes
  useEffect(() => {
    if (fromToken && toToken && fromAmount) {
      updateSplitQuotes();
    }
  }, [fromToken, toToken, fromAmount]);

  // Add this helper function near the top with other functions
  const getQuoteRanking = (
    icpswapAmount: bigint | null, 
    kongAmount: bigint | null, 
    splitAmount: bigint | null
  ): { [key: string]: 'best' | 'middle' | 'worst' } => {
    const validAmounts = [
      { dex: 'icpswap', amount: icpswapAmount },
      { dex: 'kong', amount: kongAmount },
      { dex: 'split', amount: splitAmount }
    ].filter((q): q is { dex: string; amount: bigint } => q.amount !== null);

    const sortedAmounts = [...validAmounts].sort((a, b) => 
      a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0
    );

    const rankings: { [key: string]: 'best' | 'middle' | 'worst' } = {};
    validAmounts.forEach(({ dex }) => {
      const position = sortedAmounts.findIndex(a => a.dex === dex);
      rankings[dex] = position === 0 ? 'best' : position === 1 ? 'middle' : 'worst';
    });

    return rankings;
  };

  // Helper function to get quote for a specific distribution
  const getQuoteForDistribution = async (distribution: number, balanceInfo?: {
    walletBalance: bigint,
    depositedBalance: bigint,
    undepositedBalance: bigint,
    icpswapAllowance: bigint,
    kongAllowance: bigint,
    fromTokenMetadata: any
  }): Promise<QuoteDistributionResult | null> => {
    if (!fromToken || !toToken || !fromAmount) return null;
    
    // Calculate total amount in base units first
    const totalAmountInE8s = await parseTokenAmount(fromAmount, fromToken);
    
    // Calculate amounts for each DEX based on distribution
    const icpswapAmount = (totalAmountInE8s * BigInt(100 - distribution)) / BigInt(100);
    const kongAmount = (totalAmountInE8s * BigInt(distribution)) / BigInt(100);

    console.log('Getting quotes for distribution:', {
        distribution,
        icpswapAmount: icpswapAmount.toString(),
        kongAmount: kongAmount.toString()
    });

    // Calculate deposit needs if balance info is provided
    const icpswapDepositNeeds = balanceInfo && icpswapAmount > 0 
      ? await calculateICPSwapDepositNeeds(
          icpswapAmount,
          balanceInfo.walletBalance,
          balanceInfo.depositedBalance,
          balanceInfo.undepositedBalance,
          balanceInfo.icpswapAllowance,
          balanceInfo.fromTokenMetadata.standard
        )
      : null;

    const kongDepositNeeds = balanceInfo && kongAmount > 0
      ? await calculatePoolWithdrawalNeeds(
          kongAmount,
          balanceInfo.walletBalance,
          balanceInfo.depositedBalance,
          balanceInfo.undepositedBalance,
          balanceInfo.kongAllowance,
          balanceInfo.fromTokenMetadata.standard,
          {
            reservedDeposited: icpswapDepositNeeds?.fromDeposited || 0n,
            reservedUndeposited: icpswapDepositNeeds?.fromUndeposited || 0n,
            reservedWallet: (icpswapDepositNeeds?.fromWallet || BigInt(0)) > BigInt(0) ? icpswapDepositNeeds?.fromWallet + (balanceInfo?.fromTokenMetadata.fee || BigInt(0)) : BigInt(0)
          }
        )
      : null;
      
    const [icpswapResult, kongResult] = await Promise.all([
      icpswapAmount > 0 
        ? (async () => {
            console.log('Getting ICPSwap quote for:', {
                amountIn: icpswapAmount.toString(),
                tokenIn: fromToken,
                tokenOut: toToken
            });
            const quote = await icpSwapService.getQuote({
                amountIn: icpswapDepositNeeds?.adjustedAmount || icpswapAmount,
                tokenIn: fromToken,
                tokenOut: toToken,
                fee: DEFAULT_FEE || BigInt(0),
            });
            console.log('ICPSwap quote result:', {
                amountOut: quote.amountOut.toString(),
                priceImpact: quote.priceImpact
            });
            return {
                ...quote,
                depositNeeds: icpswapDepositNeeds || undefined
            } as QuoteWithDepositNeeds;
        })()
        : Promise.resolve({ amountOut: BigInt(0), priceImpact: 0 } as QuoteWithDepositNeeds),
      kongAmount > 0 
        ? (async () => {
            const quote = await kongSwapService.getQuote({
                amountIn: kongDepositNeeds?.adjustedInput || kongAmount,
                tokenIn: fromToken,
                tokenOut: toToken,
            });
            return {
                ...quote,
                depositNeeds: kongDepositNeeds ? {
                    fromDeposited: kongDepositNeeds.fromDeposited,
                    fromUndeposited: kongDepositNeeds.fromUndeposited,
                    fromWallet: BigInt(0),
                    adjustedAmount: kongDepositNeeds.adjustedInput || kongAmount,
                    originalAmount: kongAmount
                } : undefined
            } as QuoteWithDepositNeeds;
        })()
        : Promise.resolve({ amountOut: BigInt(0), priceImpact: 0 } as QuoteWithDepositNeeds)
    ]);

    // Sum the outputs, treating null as 0
    const totalOutput = (icpswapResult.amountOut || BigInt(0)) + (kongResult.amountOut || BigInt(0));
    console.log('Combined quote result:', {
        icpswapAmount: icpswapResult.amountOut?.toString(),
        kongAmount: kongResult.amountOut?.toString(),
        totalOutput: totalOutput.toString()
    });
    return { 
        amountOut: totalOutput,
        icpswapResult,
        kongResult
    };
  };

  const findBestSplitRatio = async () => {
    if (!fromToken || !toToken || !fromAmount || !poolId) return;

    setIsSearchingBestSplit(true);
    const points = new Map<number, bigint>();
    let left = 0;
    let right = 100;
    // Initialize search range display
    setSearchRange({ left, right });
    const PRECISION = 1;
    const MAX_ITERATIONS = 10;
    let iteration = 0;

    const useFromToken = fromToken;
    const useToToken = toToken;
    const useFromAmount = fromAmount;

    try {
        // Get all the necessary data once
        const fromTokenMetadata = await tokenService.getMetadata(fromToken);
        const walletBalance = await icpSwapExecutionService.getBalance(fromToken);
        
        // Get pool balances
        const [deposited, undeposited] = await Promise.all([
          icpSwapExecutionService.getDepositedPoolBalance({ poolId }),
          icpSwapExecutionService.getUndepositedPoolBalance({ poolId, tokenId: fromToken })
        ]);

        const depositedBalance = isToken0(fromToken) ? deposited.balance0_e8s : deposited.balance1_e8s;
        const undepositedBalance = !undeposited.error ? undeposited.balance_e8s : BigInt(0);

        // Get allowances if needed
        let icpswapAllowance = BigInt(0);
        let kongAllowance = BigInt(0);
        if (fromTokenMetadata.standard.toLowerCase().includes('dip20') || 
            fromTokenMetadata.standard.toLowerCase().includes('icrc2')) {
          const poolPrincipal = typeof poolId === 'string' ? Principal.fromText(poolId) : poolId;
          const kongPrincipal = typeof kongCanisterId === 'string' ? Principal.fromText(kongCanisterId) : kongCanisterId;
          [icpswapAllowance, kongAllowance] = await Promise.all([
            icpSwapExecutionService.checkAllowance({
              tokenId: fromToken,
              spender: poolPrincipal,
            }),
            icpSwapExecutionService.checkAllowance({
              tokenId: fromToken,
              spender: kongPrincipal,
            })
          ]);
        }

        const balanceInfo = {
          walletBalance: walletBalance.balance_e8s,
          depositedBalance,
          undepositedBalance,
          icpswapAllowance,
          kongAllowance,
          fromTokenMetadata: fromTokenMetadata
        };

        // Test endpoints first
        const zeroQuote = await getQuoteForDistribution(0, balanceInfo);
        const hundredQuote = await getQuoteForDistribution(100, balanceInfo);
                
        if (zeroQuote?.amountOut) points.set(0, zeroQuote.amountOut);
        if (hundredQuote?.amountOut) points.set(100, hundredQuote.amountOut);

        const zeroVal = zeroQuote?.amountOut || 0; // there may be fee based wiggle room around the edges...
        const hundredVal = hundredQuote?.amountOut || 0;
        console.log(`Left edge value: ${zeroVal}, Right edge value: ${hundredVal}`);

        while (right - left > PRECISION && iteration < MAX_ITERATIONS) {
            console.log(`\nIteration ${iteration + 1}:`);
            console.log(`Current range: [${left}, ${right}]`);

            // Calculate two internal points that divide range into three equal parts
            const leftThird = left + Math.floor((right - left) / 3);
            const rightThird = right - Math.floor((right - left) / 3);

            // Update search range display with test points
            setSearchRange({ left, right, m1: leftThird, m2: rightThird });

            // Get quotes for points we haven't tested yet
            const pointsToTest = [leftThird, rightThird].filter(p => !points.has(p));
            
            if (pointsToTest.length > 0) {
                // Fetch all quotes in parallel
                const quotePromises = pointsToTest.map(point => 
                    getQuoteForDistribution(point, balanceInfo)
                        .then(quote => ({ point, quote }))
                );

                const results = await Promise.all(quotePromises);

                // Process results and update points map
                for (const { point, quote } of results) {
                    if (quote && quote.amountOut) {
                        points.set(point, quote.amountOut);
                    } else {
                        throw new Error('Failed to get quote');
                    }
                }
            }

            // Get values for comparison (f(m1) and f(m2))
            const leftVal = points.get(leftThird)!;
            const rightVal = points.get(rightThird)!;
            console.log(`Left value: ${leftVal}, Right value: ${rightVal}`);

            // Compare values and narrow the range according to ternary search rules
            if (leftVal < rightVal) {
                if (zeroVal > rightVal && zeroVal > hundredVal) { //fee based wiggle room around the edges...
                  // Peak must be to the left of m2
                  right = rightThird;
                  console.log('Special case - peak is to the left of m2, new range:', [left, right]);
                } else {
                  // Peak must be to the right of m1
                  left = leftThird;
                  console.log('Peak is to the right of m1, new range:', [left, right]);
                }
            } else if (leftVal > rightVal) {
              if (hundredVal > leftVal && hundredVal > zeroVal) { //fee based wiggle room around the edges...
                  // Peak must be to the right of m1
                  left = leftThird;
                  console.log('Peak is to the right of m1, new range:', [left, right]);
              } else {
                // Peak must be to the left of m2
                right = rightThird;
                console.log('Peak is to the left of m2, new range:', [left, right]);
              }
            } else {
                // In case of equal values, we can shrink from either side
                // We choose to shrink from the right for consistency
                right = rightThird;
                console.log('Equal values found, shrinking from right, new range:', [left, right]);
            }
/*
            // Update search range based on comparison
            if (leftVal < rightVal) {
                left = leftThird;
            } else if (leftVal > rightVal) {
                right = rightThird;
            } else {
                right = rightThird;
            }
*/
            // Update search range display without test points
            setSearchRange({ left, right });

            iteration++;
            console.log(`New range after iteration: [${left}, ${right}]`);
        }

        // Find the best point across ALL tested points
        let bestRatio = 0;  // Start with 0 as default
        let bestAmount = points.get(0) || BigInt(0);

        // Check all points in our map
        for (const [point, amount] of points) {
            console.log(`Point: ${point}, Amount: ${amount}, Best Amount: ${bestAmount}`);
            if (amount > bestAmount) {
                console.log(`New best amount: ${amount}, Best Ratio: ${point}`);
                bestAmount = amount;
                bestRatio = point;
            }
        }

        console.log(`Best ratio found: ${bestRatio}% (Amount: ${bestAmount})`);
        
        // Only set the distribution once we've found the best ratio
        setDistribution(bestRatio);

        // Get final quote to ensure accuracy
        const finalQuote = await getQuoteForDistribution(bestRatio, balanceInfo);
        if (finalQuote) {
            setSplitQuotes(prev => ({
                ...prev,
                icpswap: {
                    ...prev.icpswap,
                    amountOut: finalQuote.icpswapResult.amountOut?.toString() || null,
                    priceImpact: finalQuote.icpswapResult.priceImpact,
                    request: finalQuote.icpswapResult.amountOut ? {
                        tokenIn: fromToken,
                        tokenOut: toToken,
                        amount_e8s: BigInt(finalQuote.amountOut) * BigInt(100 - bestRatio) / BigInt(100),
                        depositNeeds: finalQuote.icpswapResult.depositNeeds
                    } : null
                },
                kong: {
                    ...prev.kong,
                    amountOut: finalQuote.kongResult.amountOut?.toString() || null,
                    priceImpact: finalQuote.kongResult.priceImpact,
                    request: finalQuote.kongResult.amountOut ? {
                        tokenIn: fromToken,
                        tokenOut: toToken,
                        amount_e8s: BigInt(finalQuote.amountOut) * BigInt(bestRatio) / BigInt(100),
                        depositNeeds: finalQuote.kongResult.depositNeeds
                    } : null
                },
                split: {
                    ...prev.split,
                    amountOut: finalQuote.amountOut.toString(),
                    priceImpact: Math.max(
                        finalQuote.icpswapResult.priceImpact || 0,
                        finalQuote.kongResult.priceImpact || 0
                    )
                }
            }));
        }

    } catch (error) {
        console.error('Error in findBestSplitRatio:', error);
    } finally {
        setIsSearchingBestSplit(false);
        // Reset search range display
        setSearchRange({ left: 0, right: 100 });
    }
  };

  // Add state for split swap steps
  const [icpswapSteps, setIcpswapSteps] = useState<SwapStep[]>([
    {
      title: '1. Prepare tokens',
      description: 'Approve or transfer tokens to the pool',
      status: 'pending',
      details: {
        amount: splitQuotes?.icpswap?.request?.amount_e8s ? 
          formatTokenAmount(splitQuotes.icpswap.request.amount_e8s, fromToken || '') : 
          undefined,
        canisterId: fromToken || undefined,
        tokenSymbol: getTokenSymbol(fromToken || ''),
        tokenOutSymbol: getTokenSymbol(toToken || ''),
      }
    },
    {
      title: '2. Deposit',
      description: 'Deposit tokens into the pool',
      status: 'pending',
      details: {
        amount: splitQuotes?.icpswap?.request?.amount_e8s ? 
          formatTokenAmount(splitQuotes.icpswap.request.amount_e8s, fromToken || '') : 
          undefined,
        canisterId: fromToken || undefined,
        tokenSymbol: getTokenSymbol(fromToken || ''),
        tokenOutSymbol: getTokenSymbol(toToken || ''),
      }
    },
    {
      title: '3. Swap',
      description: 'Swap tokens in the pool',
      status: 'pending',
      details: {
        amount: splitQuotes?.icpswap?.request?.amount_e8s ? 
          formatTokenAmount(splitQuotes.icpswap.request.amount_e8s, fromToken || '') : 
          undefined,
        tokenSymbol: getTokenSymbol(fromToken || ''),
        amountOut: splitQuotes?.icpswap?.amountOut ? 
          `${formatTokenAmount(BigInt(splitQuotes.icpswap.amountOut), toToken || '')}` : 
          undefined,
        tokenOutSymbol: getTokenSymbol(toToken || ''),
        canisterId: fromToken || undefined,
      }
    },
    {
      title: '4. Withdraw',
      description: 'Withdraw tokens from the pool',
      status: 'pending',
      details: {
        tokenSymbol: getTokenSymbol(fromToken || ''),
        amountOut: splitQuotes?.icpswap?.amountOut ? 
          `${formatTokenAmount(BigInt(splitQuotes.icpswap.amountOut), toToken || '')}` : 
          undefined,
        tokenOutSymbol: getTokenSymbol(toToken || ''),
        canisterId: toToken || undefined,
      }
    }
  ]);

  const [kongSteps, setKongSteps] = useState<SwapStep[]>([
    {
      title: '1. Transfer to Kong',
      description: 'Transfer tokens to Kong',
      status: 'pending',
      details: {
        amount: splitQuotes?.kong?.request?.amount_e8s ? 
          formatTokenAmount(splitQuotes.kong.request.amount_e8s, fromToken || '') : 
          undefined,
        canisterId: fromToken || undefined,
        tokenSymbol: getTokenSymbol(fromToken || ''),
        tokenOutSymbol: getTokenSymbol(toToken || ''),
      }
    },
    {
      title: '2. Execute Swap',
      description: 'Execute Kong swap',
      status: 'pending',
      details: {
        amount: splitQuotes?.kong?.request?.amount_e8s ? 
          formatTokenAmount(splitQuotes.kong.request.amount_e8s, fromToken || '') : 
          undefined,
        amountOut: splitQuotes?.kong?.amountOut ? 
          `${formatTokenAmount(BigInt(splitQuotes.kong.amountOut), toToken || '')}` : 
          undefined,
        canisterId: fromToken || undefined,
        tokenSymbol: getTokenSymbol(fromToken || ''),
        tokenOutSymbol: getTokenSymbol(toToken || ''),
      }
    }
  ]);

  // Add functions to update steps
  const updateIcpswapStep = (index: number, status: SwapStep['status'], details?: SwapStep['details'], error?: string, optimizationMessage?: string) => {
    setIcpswapSteps(current => {
      const newSteps = [...current];
      newSteps[index] = {
        ...newSteps[index],
        status,
        error,
        optimizationMessage,
        details: details ? {
          ...(newSteps[index]?.details || {}),  // Safely spread existing details or empty object
          ...details,  // Merge with new details
        } : newSteps[index]?.details  // If no new details, keep existing ones if they exist
      };
      return newSteps;
    });
  };

  const updateKongStep = (index: number, status: SwapStep['status'], details?: SwapStep['details'], error?: string) => {
    setKongSteps(current => {
      const newSteps = [...current];
      newSteps[index] = {
        ...newSteps[index],
        status,
        error,
        details: details ? {
          ...(newSteps[index]?.details || {}),  // Safely spread existing details or empty object
          ...details,  // Merge with new details
        } : newSteps[index]?.details  // If no new details, keep existing ones if they exist
      };
      return newSteps;
    });
  };

  const resetSplitSteps = () => {
    setIcpswapSteps(steps => steps.map(step => ({ 
      ...step, 
      status: 'pending',
      error: undefined,
      optimizationMessage: undefined,
      details: {
        ...step.details,  // Keep all initial details
        // Only clear execution-specific details
        transactionId: undefined,
        depositedAmount: undefined,
        kongTransactionId: undefined
      }
    })));
    setKongSteps(steps => steps.map(step => ({ 
      ...step, 
      status: 'pending',
      error: undefined,
      details: {
        ...step.details,  // Keep all initial details
        // Only clear execution-specific details
        transactionId: undefined,
        kongTransactionId: undefined
      }
    })));
  };

  // Update onConfirmSplitSwap to preserve step details
  const onConfirmSplitSwap = async () => {
    try {
      if (!swapDetails || !poolId) return { success: false, error: 'No swap details or pool ID available' };

      // For extreme distributions, use the appropriate single DEX flow
      if (distribution === 0) {
        return onConfirm();
      } else if (distribution === 100) {
        return onConfirmKongSwap();
      }

      // Save the direct swap quotes for savings comparison
      const icpswapOutput = quote?.amountOut || BigInt(0);
      const kongOutput = kongQuote?.amountOut || BigInt(0);

      const icpswapNeeds = swapDetails.icpswap.depositNeeds;
      const kongWithdrawalNeeds = swapDetails.kong.depositNeeds;

      const icpswap_amount_e8s = icpswapNeeds?.adjustedAmount || BigInt(swapDetails.icpswap.amount_e8s);
      const kong_amount_e8s = kongWithdrawalNeeds?.adjustedInput || BigInt(swapDetails.kong.amount_e8s);
  
      // Calculate total undeposited amount needed
      let totalUndepositedNeeded = (kongWithdrawalNeeds?.fromUndeposited || 0n) + icpswapNeeds.fromUndeposited;

      // Check if token is ICRC1
      const isICRC1 = swapDetails.fromToken.metadata?.standard === "ICRC1";
      const fee = swapDetails.fromToken.metadata?.fee || BigInt(0);

      let icpswap_swapped_amount = BigInt(0);      
      let kong_swapped_amount = BigInt(0);      

      // If we need to deposit anything, do it once upfront
      let depositPromise: Promise<ExecutionResult> | undefined;
      if (totalUndepositedNeeded > 0n || (isICRC1 && icpswapNeeds.fromWallet > BigInt(0))) {
        // If we do deposit here, and we have an ICRC1 transfer to do, it must take place first. 
        if (isICRC1 && icpswapNeeds.fromWallet > BigInt(0)) {
          // Convert Principal to subaccount bytes      const userPrincipal = authService.getPrincipal();
          const userPrincipal = authService.getPrincipal();
          if (!userPrincipal) {
            throw new Error('User principal not found');
          }
          const subaccountBytes = principalToSubAccount(userPrincipal);

          const transferResult = await icpSwapExecutionService.transferToPool({
            tokenId: swapDetails.fromToken.canisterId,
            poolId: swapDetails.poolId.toString(),
            amount_e8s: icpswapNeeds.fromWallet.toString(),
            subaccount: Array.from(subaccountBytes),
          });

          if (!transferResult.success) {
            return { success: false, error: transferResult.error || 'Failed to transfer to pool' };
          }
          totalUndepositedNeeded += icpswapNeeds.fromWallet > fee ? icpswapNeeds.fromWallet - fee : BigInt(0); 
          icpswapNeeds.fromUndeposited += icpswapNeeds.fromWallet > fee ? icpswapNeeds.fromWallet - fee : BigInt(0); 
          //icpswapNeeds.fromDeposited += icpswapNeeds.fromWallet; 
          icpswapNeeds.fromWallet = BigInt(0); // Avoid transferring again!
          /*
          const transferStepResult: ExecutionResult = { 
            ...transferResult, 
            step: 'transfer',
            status: transferResult.success ? 'complete' as const : 'error' as const,
            details: {
              amount: formatTokenAmount(icpswapNeeds.fromWallet, swapDetails.fromToken.canisterId),
              canisterId: swapDetails.fromToken.canisterId,
              tokenSymbol: getTokenSymbol(swapDetails.fromToken.canisterId),
              tokenOutSymbol: getTokenSymbol(swapDetails.toToken.canisterId),
              transactionId: transferResult.txId
            }
          };
          results.push(transferStepResult);
          if (stepCallback) await stepCallback(transferStepResult);
          if (!transferResult.success) return results;            
          */
        }

        depositPromise = icpSwapExecutionService.depositTokenToPool({
          poolId: poolId.toString(),
          tokenId: fromToken || '',
          amount_e8s: totalUndepositedNeeded.toString(),
          source: 'undeposited'
        });
      }

      // Get pool metadata to determine token order
      const metadata = await icpSwapFactoryService.getPool({
        token0: { address: swapDetails.fromToken.canisterId, standard: (await tokenService.getMetadata(swapDetails.fromToken.canisterId)).standard },
        token1: { address: swapDetails.toToken.canisterId, standard: (await tokenService.getMetadata(swapDetails.toToken.canisterId)).standard },
        fee: DEFAULT_FEE,
      });

      // Create base execution params for ICPSwap
      const baseIcpswapParams: ICPSwapExecutionParams = {
        poolId,
        fromToken: {
          canisterId: swapDetails.fromToken.canisterId,
          amount_e8s: icpswap_amount_e8s.toString()
        },
        toToken: {
          canisterId: swapDetails.toToken.canisterId,
          minAmount_e8s: swapDetails.icpswap.minimumReceived_e8s
        },
        zeroForOne: swapDetails.fromToken.canisterId === metadata.token0.address,
        slippageTolerance
      };

      // Start ICPSwap steps
      updateIcpswapStep(0, 'loading', {
        ...icpswapSteps[0].details,
        amount: formatTokenAmount(icpswap_amount_e8s, swapDetails.fromToken.canisterId),
        tokenSymbol: getTokenSymbol(swapDetails.fromToken.canisterId),
        canisterId: swapDetails.fromToken.canisterId,
      });
      
      // Start Kong steps
      updateKongStep(0, 'pending', {
        ...kongSteps[0].details,
        amount: formatTokenAmount(kong_amount_e8s, swapDetails.fromToken.canisterId),
        tokenSymbol: getTokenSymbol(swapDetails.fromToken.canisterId),
        canisterId: swapDetails.fromToken.canisterId
      });

      // Start both swaps in parallel
      const [icpswapResult, kongResult] = await Promise.allSettled([
        // Execute ICPSwap with its portion of the amount
        (async () => {
          // Wait for deposit to complete if ICPSwap needs any funds from it
          if (icpswapNeeds && depositPromise) {
            const depositResult = await depositPromise;
            if (!depositResult.success) {
              return { success: false, error: depositResult.error || 'Failed to deposit' };
            }
            if (isICRC1) { // the deposited amount will be used in the swap.
              icpswapNeeds.fromDeposited += (icpswapNeeds.fromUndeposited > fee ? icpswapNeeds.fromUndeposited - fee : BigInt(0)); 
            }
            icpswapNeeds.fromUndeposited = BigInt(0); // So we don't try to deposit again.
          }

          return icpSwapExecutionService.executeICPSwap(
            icpswapNeeds,
            baseIcpswapParams,
            async (result: ExecutionResult) => {
              if (!result.step) return;
              const stepName = result.step.toString();
              const stepIndex = stepName === 'approve' || stepName === 'transfer' ? 0 :
                              icpswapSteps.findIndex(s => s.title.toLowerCase().includes(stepName));
              if (stepIndex === -1) return;

              const status = result.status as SwapStep['status'];

              // For swap step, ensure we use the updated amount
              if (stepName === 'swap') {
                result.details = {
                  ...result.details,
                  amount: formatTokenAmount(BigInt(baseIcpswapParams.fromToken.amount_e8s), baseIcpswapParams.fromToken.canisterId)
                };
              }

              icpswap_swapped_amount = result.outputAmount || icpswap_swapped_amount;
              updateIcpswapStep(stepIndex, status, result.details, result.error, result.optimizationMessage);
              
              // Handle step completion and skipping
              if ((status === 'complete' || status === 'skipped') && stepIndex < 3) {
                const nextStepDetails = {
                  amount: stepIndex === 2 ? 
                    undefined : 
                    formatTokenAmount(BigInt(baseIcpswapParams.fromToken.amount_e8s), 
                      stepIndex === 0 ? baseIcpswapParams.fromToken.canisterId : baseIcpswapParams.toToken.canisterId),
                  canisterId: stepIndex === 0 ? baseIcpswapParams.fromToken.canisterId : baseIcpswapParams.toToken.canisterId,
                  tokenSymbol: stepIndex === 2 ? 
                    getTokenSymbol(baseIcpswapParams.toToken.canisterId) :
                    getTokenSymbol(stepIndex === 0 ? baseIcpswapParams.fromToken.canisterId : baseIcpswapParams.toToken.canisterId)
                };
                updateIcpswapStep(stepIndex + 1, 'loading', nextStepDetails);
              }
            },
            keepTokensInPool
          ).then(results => {
            const success = results.every(r => r.success);
            return { success, error: results.find(r => !r.success)?.error };
          });
        })(),
        // Execute Kong with its portion of the amount
        (async () => {
          const hasWithdrawalNeeds = kongWithdrawalNeeds && (kongWithdrawalNeeds.fromUndeposited + kongWithdrawalNeeds.fromDeposited) > 0n; 
          console.log('hasWithdrawalNeeds', hasWithdrawalNeeds, kongWithdrawalNeeds);
          if (hasWithdrawalNeeds) {
            // Add withdrawal step to Kong steps
            const withdrawStep = {
              title: '1. Withdraw from Pool',
              description: 'Withdraw tokens from ICPSwap pool',
              status: 'loading' as const,
              details: {
                amount: formatTokenAmount(kongWithdrawalNeeds.fromDeposited, swapDetails.fromToken.canisterId),
                tokenSymbol: getTokenSymbol(swapDetails.fromToken.canisterId),
                canisterId: swapDetails.fromToken.canisterId
              }
            };
            
            // Insert withdrawal step at the beginning
            setKongSteps(current => [withdrawStep, ...current.map(step => ({
              ...step,
              title: `${Number(step.title.split('.')[0]) + 1}. ${step.title.split('.')[1].trim()}`
            }))]);
            
            // Wait for the deposit to complete if it was needed
            if (depositPromise) {
              const depositResult = await depositPromise;
              if (!depositResult.success) {
                updateKongStep(0, 'error', undefined, depositResult.error || 'Failed to deposit');
                return { success: false, error: depositResult.error || 'Failed to deposit' };
              }
            }

            // Then withdraw the deposited amount
            const withdrawResult = await icpSwapExecutionService.withdrawFromPool({
              poolId: poolId.toString(),
              tokenId: swapDetails.fromToken.canisterId,
              amount_e8s: kongWithdrawalNeeds.fromDeposited.toString()
            });

            // Update the withdrawal step status
            if (!withdrawResult.success) {
              updateKongStep(0, 'error', undefined, withdrawResult.error || 'Failed to withdraw');
              return { success: false, error: withdrawResult.error || 'Failed to withdraw' };
            }

            updateKongStep(0, 'complete', {
              amount: formatTokenAmount(kongWithdrawalNeeds.fromDeposited, swapDetails.fromToken.canisterId),
              tokenSymbol: getTokenSymbol(swapDetails.fromToken.canisterId),
              canisterId: swapDetails.fromToken.canisterId
            });
          }

          updateKongStep(hasWithdrawalNeeds ? 1 : 0, 'loading', {
            ...kongSteps[hasWithdrawalNeeds ? 1 : 0].details,
            amount: formatTokenAmount(kong_amount_e8s, swapDetails.fromToken.canisterId),
            tokenSymbol: getTokenSymbol(swapDetails.fromToken.canisterId),
            canisterId: swapDetails.fromToken.canisterId
          });
    
          // First transfer to Kong
          const transferResult = await kongSwapService.transferToKong({
            tokenId: swapDetails.fromToken.canisterId,
            amount_e8s: kongWithdrawalNeeds?.adjustedInput?.toString() || kong_amount_e8s.toString()
          });

          if (!transferResult.success) {
            updateKongStep(hasWithdrawalNeeds ? 1 : 0, 'error', {
              amount: formatTokenAmount(kongWithdrawalNeeds?.adjustedInput ||  kong_amount_e8s, swapDetails.fromToken.canisterId),
              tokenSymbol: getTokenSymbol(swapDetails.fromToken.canisterId),
              canisterId: swapDetails.fromToken.canisterId
            }, transferResult.error);
            return transferResult;
          }

          updateKongStep(hasWithdrawalNeeds ? 1 : 0, 'complete', {
            amount: formatTokenAmount(kongWithdrawalNeeds?.adjustedInput || kong_amount_e8s, swapDetails.fromToken.canisterId),
            tokenSymbol: getTokenSymbol(swapDetails.fromToken.canisterId),
            canisterId: swapDetails.fromToken.canisterId
          });

          updateKongStep(hasWithdrawalNeeds ? 2 : 1, 'loading', {
            amount: formatTokenAmount(BigInt(kongWithdrawalNeeds?.adjustedInput?.toString() || kong_amount_e8s), swapDetails.fromToken.canisterId),
            amountOut: formatTokenAmount(BigInt(swapDetails.kong.amountOut_e8s), swapDetails.toToken.canisterId),
            tokenSymbol: getTokenSymbol(swapDetails.fromToken.canisterId),
            tokenOutSymbol: getTokenSymbol(swapDetails.toToken.canisterId),
            canisterId: swapDetails.toToken.canisterId
          });

          // Then execute the swap
          const kongParams = {
            fromToken: {
              canisterId: swapDetails.fromToken.canisterId,
              amount_e8s: kongWithdrawalNeeds?.adjustedInput?.toString() || kong_amount_e8s.toString(),
              txId: transferResult.txId!
            },
            toToken: {
              canisterId: swapDetails.toToken.canisterId,
              minAmount_e8s: swapDetails.kong.minimumReceived_e8s
            },
            slippageTolerance: slippageTolerance + (swapDetails.kong.priceImpact || 0),
          };

          const swapResult = await kongSwapService.executeKongSwap(kongParams);
          if (swapResult.success) {
            kong_swapped_amount = BigInt(swapResult.amountOut || '0');
            updateKongStep(hasWithdrawalNeeds ? 2 : 1, 'complete', {
              amount: formatTokenAmount(kongWithdrawalNeeds?.adjustedInput || kong_amount_e8s, swapDetails.fromToken.canisterId),
              amountOut: formatTokenAmount(BigInt(swapResult.amountOut || '0'), swapDetails.toToken.canisterId),
              tokenSymbol: getTokenSymbol(swapDetails.fromToken.canisterId),
              tokenOutSymbol: getTokenSymbol(swapDetails.toToken.canisterId),
              canisterId: swapDetails.toToken.canisterId,
              kongTransactionId: swapResult.txId
            });
          } else {
            updateKongStep(hasWithdrawalNeeds ? 2 : 1, 'error', {
              amount: formatTokenAmount(kongWithdrawalNeeds?.adjustedInput || kong_amount_e8s, swapDetails.fromToken.canisterId),
              amountOut: formatTokenAmount(BigInt(swapDetails.kong.amountOut_e8s), swapDetails.toToken.canisterId),
              tokenSymbol: getTokenSymbol(swapDetails.fromToken.canisterId),
              tokenOutSymbol: getTokenSymbol(swapDetails.toToken.canisterId),
              canisterId: swapDetails.toToken.canisterId
            }, swapResult.error);
          }
          return swapResult;
        })()
      ]);

      // Handle results
      if (icpswapResult.status === 'rejected') {
        console.error('ICPSwap execution failed:', icpswapResult.reason);
      }
      if (kongResult.status === 'rejected') {
        console.error('Kong execution failed:', kongResult.reason);
      }

      // Return combined success status
      const success = icpswapResult.status === 'fulfilled' && kongResult.status === 'fulfilled' &&
                     icpswapResult.value.success && kongResult.value.success;
      
      if (success) {
        setNotification({ type: 'success', message: 'Split swap executed successfully!' });
        // Record statistics using statsService
        try {
          // Calculate savings - for split swaps, savings is the difference between total output and best direct output
          const totalOutput = BigInt(icpswap_swapped_amount.toString()) + BigInt(kong_swapped_amount.toString());
           
          const bestDirectOutput = icpswapOutput > kongOutput ? icpswapOutput : kongOutput;
          const savings = totalOutput > bestDirectOutput ? (totalOutput - bestDirectOutput).toString() : '0';

            /*await*/ statsService.recordSplitSwap(
              authService.getPrincipal()!,
              swapDetails.fromToken.canisterId,
              icpswap_amount_e8s.toString(),
              kong_amount_e8s.toString(),
              swapDetails.toToken.canisterId,
              icpswap_swapped_amount.toString(),
              kong_swapped_amount.toString(),
              savings,
              typeof poolId === 'string' ? Principal.fromText(poolId) : poolId,
            );
        } catch (error) {
          console.error('Failed to record split swap stats:', error);
        }
        console.log('Refreshing balances after split swap');
        /*await*/ refreshBalances();
      } else {
        console.log('Refreshing balances after failed split swap');
        /*await*/ refreshBalances();
      }
      
      return {
        success,
        error: [
          icpswapResult.status === 'rejected' ? icpswapResult.reason : 
          icpswapResult.status === 'fulfilled' && !icpswapResult.value.success ? icpswapResult.value.error : null,
          kongResult.status === 'rejected' ? kongResult.reason :
          kongResult.status === 'fulfilled' && !kongResult.value.success ? kongResult.value.error : null,
        ].filter(Boolean).join('; '),
      };
        } catch (error) {
      console.error('Split swap execution failed:', error);
      console.log('Refreshing balances after failed split swap');
      /*await*/ refreshBalances();
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during split swap execution',
      };
    }
  };

  const [isPriceRangePercent, setIsPriceRangePercent] = useState(true);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  const handleStartTimeSplitRun = async () => {
    if (!fromToken || !toToken || !fromAmount || !minAmount || !maxAmount) return;

    // Convert amounts to base units using proper token metadata
    const totalAmountInE8s = await parseTokenAmount(fromAmount, fromToken);
    const minAmountInE8s = isAmountPercent 
      ? (totalAmountInE8s * BigInt(Math.floor(Number(minAmount))) / BigInt(100))
      : await parseTokenAmount(minAmount, fromToken);
    const maxAmountInE8s = isAmountPercent
      ? (totalAmountInE8s * BigInt(Math.floor(Number(maxAmount))) / BigInt(100))
      : await parseTokenAmount(maxAmount, fromToken);

    const config: RunConfig = {
      tokenPair: {
        fromToken,
        toToken,
        fromSymbol: getTokenSymbol(fromToken),
        toSymbol: getTokenSymbol(toToken)
      },
      amounts: {
        total_e8s: totalAmountInE8s.toString(),
        min_e8s: minAmountInE8s.toString(),
        max_e8s: maxAmountInE8s.toString(),
        isPercentage: isAmountPercent
      },
      prices: {
        reference: 0, // TODO: Get current price
        min: Number(minPrice),
        max: Number(maxPrice),
        isPercentage: isPriceRangePercent
      },
      intervals: {
        min: BigInt(Number(minInterval) * 1e9), // Convert seconds to nanoseconds
        max: BigInt(Number(maxInterval) * 1e9),
        unit: 'seconds'
      },
      limits: {
        maxTime: timePeriod ? BigInt(Number(timePeriod) * 3600 * 1e9) : undefined, // Convert hours to nanoseconds
        maxTrades: undefined // TODO: Add max trades input
      },
      slippageTolerance // Add slippage tolerance from props
    };

    try {
      const run = await timeSplitManager.startRun(config);
      setActiveTimeSplitRun(`${fromToken}-${toToken}`);
      setNotification({ type: 'success', message: 'Time split run started successfully!' });
    } catch (error) {
      setNotification({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Failed to start time split run' 
      });
    }
  };

  const handleTimeSplitComplete = () => {
    setActiveTimeSplitRun(null);
    setNotification({ type: 'success', message: 'Time split run completed successfully!' });
  };

  // Reset user selection when quotes change
  useEffect(() => {
    // Get current total input amount from any available quote
    const currentAmount = quote.request?.amount_e8s.toString() || 
                         kongQuote.request?.amount_e8s.toString() || 
                         splitQuotes.split?.request?.amount_e8s?.toString();
    
    // Only reset selection if the total input amount has changed
    if (currentAmount && currentAmount !== previousInputAmount) {
      setPreviousInputAmount(currentAmount);
      setUserHasSelectedDex(false);
    }
  }, [quote.amountOut, kongQuote.amountOut, splitQuotes.split?.amountOut]);

  // Add effect to automatically select best quote
  useEffect(() => {
    if (!userHasSelectedDex) {
      const bestQuote = getBestQuote();
      if (bestQuote) {
        setSelectedDex(bestQuote);
      }
    }
  }, [quote.amountOut, kongQuote.amountOut, splitQuotes.split?.amountOut, userHasSelectedDex]);

  // Update Kong quote formatting
  useEffect(() => {
    if (kongQuote.amountOut && toToken) {
      setFormattedKongQuoteAmount(formatTokenAmount(kongQuote.amountOut, toToken));
    }
  }, [kongQuote.amountOut, toToken]);

  // Update split amounts formatting
  useEffect(() => {
    if (toToken) {
      // Format ICPSwap amount
      const icpswapAmount = splitQuotes.icpswap.amountOut ? BigInt(splitQuotes.icpswap.amountOut) : null;
      if (icpswapAmount) {
        setFormattedSplitAmounts(prev => ({ 
          ...prev, 
          icpswap: formatTokenAmount(icpswapAmount, toToken)
        }));
      }
      
      // Format Kong amount
      const kongAmount = splitQuotes.kong.amountOut ? BigInt(splitQuotes.kong.amountOut) : null;
      if (kongAmount) {
        setFormattedSplitAmounts(prev => ({ 
          ...prev, 
          kong: formatTokenAmount(kongAmount, toToken)
        }));
      }
      
      // Format total amount
      const totalAmount = splitQuotes.split.amountOut ? BigInt(splitQuotes.split.amountOut) : null;
      if (totalAmount) {
        setFormattedSplitAmounts(prev => ({ 
          ...prev, 
          total: formatTokenAmount(totalAmount, toToken)
        }));
      }
    }
  }, [splitQuotes.icpswap.amountOut, splitQuotes.kong.amountOut, splitQuotes.split.amountOut, toToken]);

  // Add state for formatted request amounts
  const [formattedRequestAmount, setFormattedRequestAmount] = useState('');

  // Add effect to format request amount
  useEffect(() => {
    if (!fromAmount || !quote.request?.tokenIn) return;
    const tokenIn = quote.request.tokenIn;  // Store in local variable to satisfy type checker
    const amount_e8s = parseTokenAmount(fromAmount, tokenIn);
    const formatted = formatTokenAmount(amount_e8s, tokenIn);
    setFormattedRequestAmount(formatted);
  }, [fromAmount, quote.request?.tokenIn]);

  // Wrap token setters to cache metadata
  const handleFromTokenChange = async (tokenId: string, clearInput: boolean = true) => {
    if (clearInput) {
      setFromAmount(''); // Clear input amount when token changes
  }
    await cacheTokenMetadata(tokenId);
    setFromToken(tokenId);
  };

  const handleToTokenChange = async (tokenId: string) => {
    await cacheTokenMetadata(tokenId);
    setToToken(tokenId);
  };

  const handleMax = async () => {
    if (!fromToken || !fromTokenBalance || !icpSwapExecutionService) return;
    
    try {
      // Get token metadata for fee
      const walletBalance = await parseTokenAmount(fromTokenBalance, fromToken);
      
      // Get pool balances if we have a pool
      let totalBalance = walletBalance;
      let deposited = { balance0_e8s: BigInt(0), balance1_e8s: BigInt(0) };
      let undeposited: { balance_e8s: bigint; error?: string } = { balance_e8s: BigInt(0) };

      if (poolId) {
        [deposited, undeposited] = await Promise.all([
          icpSwapExecutionService.getDepositedPoolBalance({ poolId: poolId.toString() }),
          icpSwapExecutionService.getUndepositedPoolBalance({ poolId: poolId.toString(), tokenId: fromToken })
        ]);
      }

      // Add deposited balance if it exists
      if (isToken0(fromToken)) {
        totalBalance += deposited.balance0_e8s;
      } else {
        totalBalance += deposited.balance1_e8s;
      }

      // Add undeposited balance if it exists and no error
      if (!undeposited.error) {
        totalBalance += undeposited.balance_e8s;
      }
      setFromAmount(formatTokenAmount(totalBalance, fromToken));
    } catch (error) {
      console.error('Error in handleMax:', error);
    }
  };

  // Add function to check if amount exceeds balance
  const hasInsufficientFunds = async (): Promise<boolean> => {
    if (!fromToken || !fromAmount || !fromTokenBalance || !poolId || !icpSwapExecutionService) return false;
    
    try {
      const walletBalance = await parseTokenAmount(fromTokenBalance, fromToken);
      const amount = await parseTokenAmount(fromAmount, fromToken);

      // Get pool balances
      const [deposited, undeposited] = await Promise.all([
        icpSwapExecutionService.getDepositedPoolBalance({ poolId: poolId.toString() }),
        icpSwapExecutionService.getUndepositedPoolBalance({ poolId: poolId.toString(), tokenId: fromToken })
      ]);

      // Calculate total balance
      let totalBalance = walletBalance;
      
      // Add deposited balance if it exists
      if (isToken0(fromToken)) {
        totalBalance += deposited.balance0_e8s;
      } else {
        totalBalance += deposited.balance1_e8s;
      }

      // Add undeposited balance if it exists and no error
      if (!undeposited.error) {
        totalBalance += undeposited.balance_e8s;
      }

      // Check if amount + fee exceeds total balance
      return amount > totalBalance;
    } catch (error) {
      console.error('Error checking balance:', error);
      return false;
    }
  };

  // Add state to track insufficient funds
  const [isInsufficientFunds, setIsInsufficientFunds] = useState(false);

  // Add effect to check balance when amount changes
  useEffect(() => {
    const checkBalance = async () => {
      const insufficient = await hasInsufficientFunds();
      setIsInsufficientFunds(insufficient);
    };
    checkBalance();
  }, [fromAmount, fromTokenBalance, fromToken]);


  // Update the pool balances effect to use polling with proper cleanup
  useEffect(() => {
    // Initial fetch only
    fetchPoolBalances();
  }, [fetchPoolBalances]);

 

  // Handler for header deposit button
  const handleHeaderDeposit = (tokenId: string) => {
    if (!poolId) return;
    setTokenAction({
      isOpen: true,
      type: 'deposit',
      tokenId,
      tokenSymbol: getTokenSymbol(tokenId),
      source: 'wallet',
      poolId,
      isToken0: isToken0(tokenId)
    });
  };

  // Handler for header withdraw button
  const handleHeaderWithdraw = (tokenId: string) => {
    if (!poolId) return;
    setTokenAction({
      isOpen: true,
      type: 'withdraw',
      tokenId,
      tokenSymbol: getTokenSymbol(tokenId),
      source: 'pool',  // Changed to 'pool' to indicate combined pool balances
      poolId,
      isToken0: isToken0(tokenId)
    });
  };

  // Handler for undeposited transfer button
  const handleUndepositedTransfer = (tokenId: string) => {
    if (!poolId) return;
    setTokenAction({
      isOpen: true,
      type: 'transfer',
      tokenId,
      tokenSymbol: getTokenSymbol(tokenId),
      poolId,
      isToken0: isToken0(tokenId)
    });
  };

  // Handler for undeposited deposit button
  const handleUndepositedDeposit = (tokenId: string) => {
    if (!poolId) return;  // Add null check
    setTokenAction({
      isOpen: true,
      type: 'deposit',
      tokenId,
      tokenSymbol: getTokenSymbol(tokenId),
      source: 'undeposited',
      poolId,
      isToken0: isToken0(tokenId)
    });
  };

  // Handler for undeposited withdraw button
  const handleUndepositedWithdraw = (tokenId: string) => {
    if (!poolId) return;  // Add null check
    setTokenAction({
      isOpen: true,
      type: 'withdraw',
      tokenId,
      tokenSymbol: getTokenSymbol(tokenId),
      source: 'undeposited',
      poolId,
      isToken0: isToken0(tokenId)
    });
  };

  // Handler for deposited withdraw button
  const handleDepositedWithdraw = (tokenId: string) => {
    if (!poolId) return;  // Add null check
    setTokenAction({
      isOpen: true,
      type: 'withdraw',
      tokenId,
      tokenSymbol: getTokenSymbol(tokenId),
      source: 'deposited',
      poolId,
      isToken0: isToken0(tokenId)
    });
  };

  // Handler for closing modals
  const handleCloseModal = () => {
    setTokenAction({
      isOpen: false,
      type: null,
      tokenId: '',
      tokenSymbol: '',
      isToken0: false,  // Add default value for isToken0
    });
  };

  // Handler for successful action
  const handleActionSuccess = () => {
    handleCloseModal();
    setFromAmount('');
    //console.log('Refreshing balances after action success');
    //refreshBalances(); // don't do this, it led to infinite loop!
  };

  // Helper function to determine if a token is token0
  const isToken0 = (tokenId: string): boolean => {
    return tokenId === token0Address;
  };

  const isDIP20Token = (tokenId: string | undefined): boolean => {
    if (!tokenId) return false;
    const token = tokens.find(t => t.canisterId === tokenId);
    return token?.metadata?.standard?.toLowerCase?.()?.includes('dip20') || false;
  };

  // Add effect to load logos for pool tokens
  useEffect(() => {
    const loadPoolLogos = async () => {
      if (!token0Address && !token1Address) return;
      
      for (const tokenId of [token0Address, token1Address]) {
        if (!tokenId) continue;
        const token = tokens.find(t => t.canisterId === tokenId);
        if (!token?.metadata) continue;  // Skip if metadata isn't loaded yet

        try {
          const logo = await tokenService.getTokenLogo(tokenId);
          setLoadedLogos(prev => ({
            ...prev,
            [tokenId]: logo || '/generic_token.svg'
          }));
        } catch (err) {
          console.error('Error loading logo:', err);
          setLoadedLogos(prev => ({
            ...prev,
            [tokenId]: '/generic_token.svg'
          }));
        }
      }
    };

    loadPoolLogos();
  }, [token0Address, token1Address, tokens]);
/*
  // Add effect to update split swap steps when quotes change
  useEffect(() => {
    if (selectedDex !== 'split' || !fromToken || !toToken || !fromAmount || !splitQuotes) return;

    setIcpswapSteps(current => current.map(step => ({
      ...step,
      details: {
        ...step.details,
        amount: step.title.includes('Prepare') || step.title.includes('Deposit') || step.title.includes('Swap') ?
          splitQuotes?.icpswap?.request?.amount_e8s ? 
            formatTokenAmount(splitQuotes.icpswap.request.amount_e8s, fromToken) : 
            undefined :
          undefined, // Don't set amount for withdraw step
        amountOut: step.title.includes('Swap') || step.title.includes('Withdraw') ? 
          splitQuotes?.icpswap?.amountOut ? 
            `${formatTokenAmount(BigInt(splitQuotes.icpswap.amountOut), toToken || '')}` : 
            undefined : 
          undefined,
        canisterId: step.title.includes('Withdraw') ? toToken : fromToken,
        tokenSymbol: getTokenSymbol(fromToken),
        tokenOutSymbol: getTokenSymbol(toToken),
      }
    })));

    setKongSteps(current => current.map(step => ({
      ...step,
      details: {
        ...step.details,
        amount: splitQuotes?.kong?.request?.amount_e8s ? 
          formatTokenAmount(splitQuotes.kong.request.amount_e8s, fromToken) : 
          undefined,
        amountOut: step.title.includes('Execute') ? 
          splitQuotes?.kong?.amountOut ? 
            `${formatTokenAmount(BigInt(splitQuotes.kong.amountOut), toToken || '')}` : 
            undefined : 
          undefined,
        canisterId: fromToken,
        tokenSymbol: getTokenSymbol(fromToken),
        tokenOutSymbol: getTokenSymbol(toToken),
      }
    })));
  }, [selectedDex, fromToken, toToken, fromAmount, splitQuotes, poolId]);
*/
  // Handle URL parameters on mount
  useEffect(() => {
    const initializeFromUrlParams = async () => {
      // Wait for tokens to be loaded
      if (tokens.length === 0) return;

      if (fromTokenParam) {
        // Set loading state for from token
        setIsLoadingFromToken(true);
        // Verify the token exists in our list
        const fromTokenExists = tokens.some(t => t.canisterId === fromTokenParam);
        if (fromTokenExists) {
          await handleFromTokenChange(fromTokenParam, false);
        } else {
          console.warn(`Token ${fromTokenParam} from URL not found in token list`);
        }
        setIsLoadingFromToken(false);
      } else { setIsLoadingFromToken(false); }

      if (toTokenParam) {
        // Set loading state for to token
        setIsLoadingToToken(true);
        // Verify the token exists in our list
        const toTokenExists = tokens.some(t => t.canisterId === toTokenParam);
        if (toTokenExists) {
          await handleToTokenChange(toTokenParam);
        } else {
          console.warn(`Token ${toTokenParam} from URL not found in token list`);
        }
        setIsLoadingToToken(false);
      } else { setIsLoadingToToken(false); }

      // Load logos for URL parameter tokens first
      const preloadLogos = async () => {
        if (fromTokenParam) {
          /*await*/ tokenService.getTokenLogo(fromTokenParam);
        }
        if (toTokenParam) {
          /*await*/ tokenService.getTokenLogo(toTokenParam);
        }
      };
      
      preloadLogos();

      // Mark initialization as complete after handling URL parameters
      setHasInitialized(true);
    };

    initializeFromUrlParams();
  }, [fromTokenParam, toTokenParam, tokens]);

  // Update URL when tokens change, but only after initialization
  useEffect(() => {
    // Don't update URL until initialization is complete
    if (!hasInitialized) return;

    const params = new URLSearchParams(searchParams);
    
    if (fromToken) {
      params.set('input', fromToken);
    } else {
      params.delete('input');
    }
    
    if (toToken) {
      params.set('output', toToken);
    } else {
      params.delete('output');
    }
    
    setSearchParams(params);
  }, [fromToken, toToken, hasInitialized]);

  // Add effect to calculate USD prices
  useEffect(() => {
    const calculateUSDPrices = async () => {
      if (!fromToken || !toToken) {
        setFromUSDPrice(null);
        setToUSDPrice(null);
        return;
      }

      try {
        setIsLoadingUSDPrices(true);

        // Calculate input USD price
        if (fromAmount && fromToken) {
          const amountInE8s = await parseTokenAmount(fromAmount, fromToken);
          const tokenUSDPrice = await priceService.getTokenUSDPrice(fromToken);
          const fromTokenMetadata = await tokenService.getMetadata(fromToken);
          const baseUnitMultiplier = BigInt(10) ** BigInt(fromTokenMetadata.decimals);
          const amountInWholeUnits = Number(amountInE8s) / Number(baseUnitMultiplier);
          setFromUSDPrice(amountInWholeUnits * tokenUSDPrice);
        } else {
          setFromUSDPrice(null);
        }

        // Calculate output USD price
        if (selectedDex && toToken) {
          let outputAmountE8s: bigint | null = null;
          
          if (selectedDex === 'icpswap' && quote.amountOut) {
            outputAmountE8s = quote.amountOut;
          } else if (selectedDex === 'kong' && kongQuote.amountOut) {
            outputAmountE8s = kongQuote.amountOut;
          } else if (selectedDex === 'split' && splitQuotes.split.amountOut) {
            outputAmountE8s = BigInt(splitQuotes.split.amountOut);
          }

          if (outputAmountE8s) {
            const tokenUSDPrice = await priceService.getTokenUSDPrice(toToken);
            const toTokenMetadata = await tokenService.getMetadata(toToken);
            const baseUnitMultiplier = BigInt(10) ** BigInt(toTokenMetadata.decimals);
            const amountInWholeUnits = Number(outputAmountE8s) / Number(baseUnitMultiplier);
            setToUSDPrice(amountInWholeUnits * tokenUSDPrice);
          } else {
            setToUSDPrice(null);
          }
        } else {
          setToUSDPrice(null);
        }
      } catch (error) {
        console.error('Error calculating USD prices:', error);
        setFromUSDPrice(null);
        setToUSDPrice(null);
      } finally {
        setIsLoadingUSDPrices(false);
      }
    };

    calculateUSDPrices();
  }, [fromToken, toToken, fromAmount, quote.amountOut, kongQuote.amountOut, splitQuotes.split.amountOut, selectedDex]);

  // Helper function to calculate USD value for a specific balance amount
  const calculateUSDValue = (amount: bigint, totalAmount: bigint, totalUSDValue: number | undefined, tokenId: string): string | undefined => {
    if (totalUSDValue === undefined) return undefined;
    if (totalAmount === BigInt(0)) return "0.00";
    const decimals = getCachedTokenMetadata(tokenId)?.decimals || 8;
    const baseUnitMultiplier = BigInt(10) ** BigInt(decimals);
    const amountInWholeUnits = Number(amount) / Number(baseUnitMultiplier);
    const totalInWholeUnits = Number(totalAmount) / Number(baseUnitMultiplier);
    const usdValue = amountInWholeUnits * (totalUSDValue / totalInWholeUnits);
    return usdValue.toFixed(2);
  };

  // Add effect to auto-expand pool balances section when there are non-zero balances
  useEffect(() => {
    if (balances) {
      const hasToken0Balance = (balances?.undeposited0?.balance_e8s || BigInt(0)) + (balances?.deposited0 || BigInt(0)) > BigInt(0);
      const hasToken1Balance = (balances?.undeposited1?.balance_e8s || BigInt(0)) + (balances?.deposited1 || BigInt(0)) > BigInt(0);
      
      if (hasToken0Balance || hasToken1Balance) {
        setIsFooCollapsed(false);
      }
    }
  }, [balances]);

  // Add effect to auto-expand Direct Quotes when needed
  useEffect(() => {
    // Get amounts for ranking
    const icpswapAmount = quote?.amountOut || null;
    const kongAmount = kongQuote?.amountOut || null;
    const splitAmount = (splitQuotes.icpswap.amountOut && splitQuotes.kong.amountOut) 
      ? BigInt(splitQuotes.icpswap.amountOut) + BigInt(splitQuotes.kong.amountOut)
      : null;

    // Only calculate rankings if we have a split quote
    if (splitAmount) {
      const rankings = getQuoteRanking(icpswapAmount, kongAmount, splitAmount);
      // Auto-expand only if split is not the best quote
      if (rankings.split !== 'best') {
        setIsDirectQuotesCollapsed(false);
      } else {
        // If split is the best quote, keep Direct Quotes collapsed
        setIsDirectQuotesCollapsed(true);
      }
    } else {
      // If no split quote exists, auto-expand Direct Quotes
      setIsDirectQuotesCollapsed(false);
    }
  }, [quote, kongQuote, splitQuotes]);

  // Calculate how much ICPSwap needs from pool vs wallet, preferring pool funds first
  const calculateICPSwapDepositNeeds = async (amount_e8s: bigint, walletBalance: bigint, depositedBalance: bigint, undepositedBalance: bigint, allowance_e8s: bigint , standard: string, options?: {
    reservedDeposited?: bigint;
    reservedUndeposited?: bigint;
  }): Promise<{
    fromDeposited: bigint;
    fromUndeposited: bigint;
    fromWallet: bigint;
    adjustedAmount: bigint;  // Add this to signal if we had to adjust the input down
  } | null> => {
    if (!fromToken || !poolId || !icpSwapExecutionService) return null;

    try {

      const isICRC1 = standard.toLowerCase().includes('icrc1');
      const isDIP20 = standard.toLowerCase().includes('dip20');

      // Account for any reserved amounts
      const availableDeposited = depositedBalance - (options?.reservedDeposited || 0n);
      let availableUndeposited = undepositedBalance - (options?.reservedUndeposited || 0n);

      if (isDIP20) {
        availableUndeposited = BigInt(0);
      }

      // Get wallet balance and metadata for fee calculation
      const metadata = await tokenService.getMetadata(fromToken);
      const fee = metadata.fee;

      console.log('ICPSwap deposit needs - Initial values:', {
        amount_e8s: amount_e8s.toString(),
        availableDeposited: availableDeposited.toString(),
        availableUndeposited: availableUndeposited.toString(),
        walletBalance: walletBalance.toString(),
        allowance_e8s: allowance_e8s.toString(),
        fee: fee.toString()
      });

      // First try to use deposited funds
      let remainingNeeded = amount_e8s;
      let fromDeposited = BigInt(0);

      if (availableDeposited >= remainingNeeded) {
        return {
          fromDeposited: remainingNeeded,
          fromUndeposited: BigInt(0),
          fromWallet: BigInt(0),
          adjustedAmount: remainingNeeded
        };
      }

      if (availableDeposited > 0n) {
        fromDeposited = remainingNeeded > availableDeposited ? availableDeposited : remainingNeeded;
        remainingNeeded -= fromDeposited;
      }

      // Then try to use undeposited funds
      let fromUndeposited = BigInt(0);
      let adjustedAmount = amount_e8s;

      // If we're selling an ICRC1 token, we may start by transferring an amount from wallet to undeposited.
      // If so, dust on the undeposited balance could be used, together with the funds from the wallet. 
      // In all other cases, dust (less than a fee) can not be deposited.
      if (remainingNeeded > 0n && availableUndeposited > 0n) {

        if (availableUndeposited > fee || (isICRC1 && remainingNeeded - availableUndeposited > fee)) { // if we will still need funds from wallet even after using undeposited funds, and it is ICRC1, we can use dust
          // Use up to availableUndeposited
          fromUndeposited = remainingNeeded > availableUndeposited ? availableUndeposited : remainingNeeded;

          remainingNeeded -= fromUndeposited; 

          // Track that we lost a fee worth of the amount
          adjustedAmount -= fee;
        } else {

          // Remove the dust from the amount
          remainingNeeded -= availableUndeposited; 
          adjustedAmount -= availableUndeposited;
        }
      }

      // Any remaining amount needs to come from wallet
      let fromWallet = remainingNeeded >= fee ? remainingNeeded - fee : remainingNeeded;

      // If we need wallet funds, adjust the amount down
      if (fromWallet > fee) {
        //let takeFee = isICRC1 && availableUndeposited === BigInt(0) ? fee + fee : fee;
        let takeFee = fee;
        if (isICRC1) {
          if (fromUndeposited > 0) { // if we had undeposited funds we will be using them and that fee has already been counted
            takeFee += fee;
          }
        } else {
          if (fromWallet > allowance_e8s) { // one extra fee required for the call to create allowance
            takeFee += fee;
            fromWallet -= fee;
          }            
        }

        adjustedAmount -= takeFee;
        console.log('ICPSwap deposit needs - Final values:', {
          fromDeposited: fromDeposited.toString(),
          fromUndeposited: fromUndeposited.toString(),
          fromWallet: fromWallet.toString(),
          adjustedAmount: adjustedAmount.toString() 
        });
        return {
          fromDeposited,
          fromUndeposited,
          fromWallet,
          adjustedAmount
        };
      } else if (fromWallet > 0n) {
        // Any remaining amount needs to come from wallet
        adjustedAmount -= fromWallet;
        fromWallet = BigInt(0);
      }
   
      console.log('ICPSwap deposit needs (no wallet) - Final values:', {
        fromDeposited: fromDeposited.toString(),
        fromUndeposited: fromUndeposited.toString(),
        fromWallet: '0',
        adjustedAmount: adjustedAmount.toString() 
      });

      return {
        fromDeposited,
        fromUndeposited,
        fromWallet: BigInt(0),
        adjustedAmount
      };

    } catch (error) {
      console.error('Error calculating ICPSwap deposit needs:', error);
      return null;
    }
  };

  const calculatePrice = (amountIn: bigint, amountOut: bigint): number => {
    return Number(amountOut) / Number(amountIn);
  };

  return (
    <div className="swap-interface">
      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}
      <div className="swap-box">
        <div className="psa-warning">
          <div className="warning-content">
            <strong>⚠️ Important Notice:</strong>
            <p>$SNOGE token is currently experiencing issues with its ledger! Please refrain from swapping, depositing, withdrawing or doing any actions with $SNOGE tokens until this issue has been resolved. Thank you!</p>
          </div>
        </div>        
        <div className="token-input-panel">
          <div className="input-details">
            <span className="usd-value">
              {isLoadingUSDPrices ? (
                '$...'
              ) : fromUSDPrice !== null ? (
                `$${fromUSDPrice.toFixed(2)}`
              ) : (
                '$0.00'
              )}
            </span>
          </div>
          <div className="token-input-row">
            <TokenSelect 
              value={fromToken}
              onChange={(tokenId) => {
                handleFromTokenChange(tokenId);
              }}
              label=""
              onMax={handleMax}
              isLoading={isLoadingFromToken}
            />
            <input
              type="number"
              className="amount-input"
              placeholder="0.00"
              value={fromAmount}
              onChange={(e) => setFromAmount(e.target.value)}
              min="0"
            />
          </div>
        </div>

        <button
          className="swap-direction-button"
          onClick={handleSwapDirection}
          disabled={!fromToken || !toToken}
        >
          <FiArrowDown />
        </button>

        <div className="token-input-panel">
          <div className="input-details">
            <span className="usd-value">
              {isLoadingUSDPrices ? (
                '$...'
              ) : toUSDPrice !== null ? (
                `$${toUSDPrice.toFixed(2)}`
              ) : (
                '$0.00'
              )}
            </span>
          </div>
          <div className="token-input-row">
            <TokenSelect
              value={toToken}
              onChange={handleToTokenChange}
              label=""
              isLoading={isLoadingToToken}
            />
            <div className="amount-display">
              {(() => {
                if (!selectedDex) return <span className="amount-input">0.00</span>;
                
                let amount = '0.00';
                let colorClass = '';
                let priceDiff = null;
                
                // Get all valid amounts as raw bigints
                const icpswapAmount = quote.amountOut;
                const kongAmount = kongQuote.amountOut;
                const splitAmount = splitQuotes.icpswap.amountOut && splitQuotes.kong.amountOut ? 
                  BigInt(splitQuotes.icpswap.amountOut) + BigInt(splitQuotes.kong.amountOut) : null;
                
                // Get rankings if we have at least two valid amounts
                const validAmounts = [
                  { dex: 'icpswap', amount: icpswapAmount },
                  { dex: 'kong', amount: kongAmount },
                  { dex: 'split', amount: splitAmount }
                ].filter(q => q.amount !== null);
                
                if (validAmounts.length >= 2) {
                  // Sort by amount descending using bigint comparison
                  validAmounts.sort((a, b) => (b.amount || BigInt(0)) > (a.amount || BigInt(0)) ? 1 : -1);
                  const bestAmount = validAmounts[0].amount || BigInt(0);
                  
                  if (selectedDex === 'icpswap' && icpswapAmount !== null) {
                    amount = formattedQuoteAmount;
                    const ranking = getQuoteRanking(icpswapAmount, kongAmount, splitAmount).icpswap;
                    colorClass = ranking;
                    
                    if (ranking === 'best') {
                      const nextBest = validAmounts.find(q => q.dex !== 'icpswap')?.amount || BigInt(0);
                      // Add safety check for division by zero
                      const percentDiff = nextBest === BigInt(0) ? 0 : 
                        Number((icpswapAmount - nextBest) * BigInt(10000) / nextBest) / 100;
                      const formattedAbsDiff = formatTokenAmount(BigInt(Math.round(Number(icpswapAmount - nextBest))), toToken);
                      priceDiff = (
                        <div className="price-diff best">
                          <span className="percent">+{percentDiff.toFixed(2)}%</span>
                          <span className="absolute">+{formattedAbsDiff} {getTokenSymbol(toToken)}</span>
                        </div>
                      );
                    } else {
                      // Add safety check for division by zero
                      const percentDiff = icpswapAmount === BigInt(0) ? 0 :
                        Number((bestAmount - icpswapAmount) * BigInt(10000) / icpswapAmount) / 100;
                      const formattedAbsDiff = formatTokenAmount(BigInt(Math.round(Number(bestAmount - icpswapAmount))), toToken);
                      priceDiff = (
                        <div className="price-diff worst">
                          <span className="percent">-{percentDiff.toFixed(2)}%</span>
                          <span className="absolute">-{formattedAbsDiff} {getTokenSymbol(toToken)}</span>
                        </div>
                      );
                    }
                  } else if (selectedDex === 'kong' && kongAmount !== null) {
                    amount = formattedKongQuoteAmount;
                    const ranking = getQuoteRanking(icpswapAmount, kongAmount, splitAmount).kong;
                    colorClass = ranking;
                    
                    if (ranking === 'best') {
                      const nextBest = validAmounts.find(q => q.dex !== 'kong')?.amount || BigInt(0);
                      // Add safety check for division by zero
                      const percentDiff = nextBest === BigInt(0) ? 0 :
                        Number((kongAmount - nextBest) * BigInt(10000) / nextBest) / 100;
                      const formattedAbsDiff = formatTokenAmount(BigInt(Math.round(Number(kongAmount - nextBest))), toToken);
                      priceDiff = (
                        <div className="price-diff best">
                          <span className="percent">+{percentDiff.toFixed(2)}%</span>
                          <span className="absolute">+{formattedAbsDiff} {getTokenSymbol(toToken)}</span>
                        </div>
                      );
                    } else {
                      // Add safety check for division by zero
                      const percentDiff = kongAmount === BigInt(0) ? 0 :
                        Number((bestAmount - kongAmount) * BigInt(10000) / kongAmount) / 100;
                      const formattedAbsDiff = formatTokenAmount(BigInt(Math.round(Number(bestAmount - kongAmount))), toToken);
                      priceDiff = (
                        <div className="price-diff worst">
                          <span className="percent">-{percentDiff.toFixed(2)}%</span>
                          <span className="absolute">-{formattedAbsDiff} {getTokenSymbol(toToken)}</span>
                        </div>
                      );
                    }
                  } else if (selectedDex === 'split' && splitAmount !== null) {
                    amount = formattedSplitAmounts.total;
                    const ranking = getQuoteRanking(icpswapAmount, kongAmount, splitAmount).split;
                    colorClass = ranking;
                    
                    if (ranking === 'best') {
                      const nextBest = validAmounts.find(q => q.dex !== 'split')?.amount || BigInt(0);
                      // Add safety check for division by zero
                      const percentDiff = nextBest === BigInt(0) ? 0 :
                        Number((splitAmount - nextBest) * BigInt(10000) / nextBest) / 100;
                      const formattedAbsDiff = formatTokenAmount(BigInt(Math.round(Number(splitAmount - nextBest))), toToken);
                      priceDiff = (
                        <div className="price-diff best">
                          <span className="percent">+{percentDiff.toFixed(2)}%</span>
                          <span className="absolute">+{formattedAbsDiff} {getTokenSymbol(toToken)}</span>
                        </div>
                      );
                    } else {
                      // Add safety check for division by zero
                      const percentDiff = splitAmount === BigInt(0) ? 0 :
                        Number((bestAmount - splitAmount) * BigInt(10000) / splitAmount) / 100;
                      const formattedAbsDiff = formatTokenAmount(BigInt(Math.round(Number(bestAmount - splitAmount))), toToken);
                      priceDiff = (
                        <div className="price-diff worst">
                          <span className="percent">-{percentDiff.toFixed(2)}%</span>
                          <span className="absolute">-{formattedAbsDiff} {getTokenSymbol(toToken)}</span>
                        </div>
                      );
                    }
                  }
                } else {
                  // If we don't have enough valid amounts for comparison, just show the amount
                  if (selectedDex === 'icpswap' && quote.amountOut) {
                    amount = formattedQuoteAmount;
                  } else if (selectedDex === 'kong' && kongQuote.amountOut) {
                    amount = formattedKongQuoteAmount;
                  } else if (selectedDex === 'split' && splitAmount !== null) {
                    amount = formattedSplitAmounts.total;
                  }
                }
                
                return (
                  <>
                    <span className={`amount-input ${colorClass}`}>{amount}</span>
                    {priceDiff && <span className={`price-diff ${colorClass}`}>{priceDiff}</span>}
                  </>
                );
              })()}
            </div>
          </div>
          <div className="input-details">
            <div className="action-buttons">
              <span className="usd-value">
                {isLoadingUSDPrices ? (
                  '$...'
                ) : toUSDPrice !== null ? (
                  `$${toUSDPrice.toFixed(2)}`
                ) : (
                  '$0.00'
                )}
              </span>
            </div>
          </div>
          <button 
            className="swap-button" 
            disabled={isInsufficientFunds || (!isAuthenticated ? (quote.loading || kongQuote.loading) : (!quote.amountOut && !kongQuote.amountOut) || quote.loading || kongQuote.loading)}
            onClick={async () => {
              if (!isAuthenticated && !quote.loading && !kongQuote.loading) {
                const success = await authService.login();
                if (success) {
                  setIsAuthenticated(true);
                }
                return;
              }

              if (!selectedDex) return;

              if (selectedDex === 'icpswap') {
                // Check if we have a valid ICPSwap quote
                if (!quote.amountOut) {
                  console.error('ICPSwap quote not available');
                  return;
                }
                const details = await createSwapDetails();
                if (details) {
                  setSwapDetails(details);
                  setShowModal(true);
                }
              } else if (selectedDex === 'kong') {
                // Check if we have a valid Kong quote
                if (!kongQuote.amountOut) {
                  console.error('Kong quote not available');
                  return;
                }
                const details = await createKongSwapDetails(fromToken, toToken, kongQuote);
                if (details) {
                  setSwapDetails(details);
                  setShowModal(true);
                }
              } else if (selectedDex === 'split') {
                // For extreme distributions, use the appropriate single DEX
                if (distribution === 0) {
                  // Use ICPSwap
                  setSelectedDex('icpswap');
                  const details = await createSwapDetails();
                  if (details) {
                    setSwapDetails(details);
                    setShowModal(true);
                  }
                } else if (distribution === 100) {
                  // Use Kong
                  setSelectedDex('kong');
                  const details = await createKongSwapDetails(fromToken, toToken, kongQuote);
                  if (details) {
                    setSwapDetails(details);
                    setShowModal(true);
                  }
                } else {
                  // Use split swap for all other distributions
                  if (!splitQuotes.icpswap.amountOut || !splitQuotes.kong.amountOut) {
                    console.error('Split quotes not available');
                    return;
                  }

                  const splitDetails = await createSplitSwapDetails();

                  setSwapDetails(splitDetails);
                  setShowModal(true);
                }
              } else {
                const details = await createSwapDetails();
                if (details) {
                  setSwapDetails(details);
                  setShowModal(true);
                }
              }
            }}
          >
            {!isAuthenticated ? 'Login to Swap' : 
            isInsufficientFunds ? 'Insufficient Funds' :
            (quote.loading || kongQuote.loading ? 'Getting Best Price...' : 
              (!fromToken || !toToken) ? 'Select Tokens' :
              selectedDex === 'split' && distribution > 0 && distribution < 100 ? 'Split Swap' : 'Swap')}
          </button>
          <div className="quote-amounts">
            {Boolean(quote.amountOut || kongQuote.amountOut) && (() => {
              const icpswapAmount = quote.amountOut;
              const kongAmount = kongQuote.amountOut;
              const combinedAmount = splitQuotes.icpswap.amountOut && splitQuotes.kong.amountOut ? 
                BigInt(splitQuotes.icpswap.amountOut) + BigInt(splitQuotes.kong.amountOut) : null;
              const rankings = getQuoteRanking(icpswapAmount, kongAmount, combinedAmount);
              
              return (
                <React.Fragment>
                  <div 
                    className="quotes-header"
                    onClick={() => setIsQuotesCollapsed(!isQuotesCollapsed)}
                  >
                    <span className="section-title">Available Quotes</span>
                    <div className="available-quotes-actions">
                      <button
                        className="collapse-toggle"
                        onClick={(e) => {
                          e.stopPropagation();  // Prevent double-toggle
                          setIsQuotesCollapsed(!isQuotesCollapsed);
                        }}
                      >
                        {isQuotesCollapsed ? '▼' : '▲'}
                      </button>
                    </div>
                  </div>
                  {!isQuotesCollapsed && (
                    <>
                      {/* Split Quote moved here */}
                      {splitQuotes.icpswap.amountOut && splitQuotes.kong.amountOut && (
                        <div 
                          className={`quote-amount split ${rankings.split || ''} ${selectedDex === 'split' ? 'selected' : ''}`}
                          onClick={() => handleQuoteSelection('split')}
                          style={{ cursor: 'pointer' }}
                        >
                          {splitQuotes.icpswap.request && (
                            <div className="quote-request">
                              <span className="quote-tokens">SPLIT</span>
                              <span className="quote-amount-requested">{formattedRequestAmount} {getTokenSymbol(splitQuotes.icpswap.request.tokenIn)}</span>
                            </div>
                          )}
                          <input 
                            type="text" 
                            className="amount-input" 
                            placeholder="0.0"
                            value={formattedSplitAmounts.total}
                            readOnly
                          />
                          <div className="quote-details">
                            <span className="dex-label">SPLIT</span>
                            <div className="split-info">
                              <div className="split-row">
                                <span>ICPSwap {100 - distribution}%</span>
                                <span>Kong {distribution}%</span>
                              </div>
                              <div className="split-row">
                                <span>{formattedSplitAmounts.icpswap}</span>
                                <span>{formattedSplitAmounts.kong}</span>
                              </div>
                            </div>
                          </div>
                          <div className="distribution-controls">
                            <input 
                                type="range"
                                min="0"
                                max="100"
                                value={distribution}
                                onChange={(e) => setDistribution(Number(e.target.value))}
                                disabled={isSearchingBestSplit}
                                onMouseUp={() => {
                                  updateSplitQuotes();
                                  setSelectedDex('split');
                                  setUserHasSelectedDex(true);
                                }}
                                onTouchEnd={() => {
                                  updateSplitQuotes();
                                  setSelectedDex('split');
                                  setUserHasSelectedDex(true);
                                }}
                            />
                            <SearchRangeProgress 
                                left={searchRange.left}
                                right={searchRange.right}
                                m1={searchRange.m1}
                                m2={searchRange.m2}
                                isSearching={isSearchingBestSplit}
                            />
                            <button 
                              className="find-best-split"
                              onClick={findBestSplitRatio}
                              disabled={isSearchingBestSplit || !fromAmount || !fromToken || !toToken}
                              data-searching={isSearchingBestSplit}
                            >
                              {isSearchingBestSplit ? 'Searching...' : 'Find Best Split'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Direct Quotes Header */}
                      <div 
                        className="quotes-header"
                        onClick={() => setIsDirectQuotesCollapsed(!isDirectQuotesCollapsed)}
                      >
                        <span className="section-title">Direct Quotes</span>
                        <div className="available-quotes-actions">
                          <button
                            className="collapse-toggle"
                            onClick={(e) => {
                              e.stopPropagation();  // Prevent double-toggle
                              setIsDirectQuotesCollapsed(!isDirectQuotesCollapsed);
                            }}
                          >
                            {isDirectQuotesCollapsed ? '▼' : '▲'}
                          </button>
                        </div>
                      </div>
                      {!isDirectQuotesCollapsed && (
                        <>
                          {Boolean(quote.amountOut) && (
                            <div className={`quote-amount ${rankings.icpswap || ''} ${selectedDex === 'icpswap' ? 'selected' : ''}`}
                              onClick={() => quote.amountOut && handleQuoteSelection('icpswap')}
                              style={{ cursor: quote.amountOut ? 'pointer' : 'default' }}
                            >
                              {quote.request && (
                                <div className="quote-request">
                                  <span className="quote-tokens">ICPSWAP</span>
                                  <span className="quote-amount-requested">{formattedRequestAmount} {getTokenSymbol(quote.request.tokenIn)}</span>
                                </div>
                              )}
                              <input 
                                type="text" 
                                className="amount-input" 
                                placeholder="0.0"
                                value={quote.amountOut ? formattedQuoteAmount : ''}
                                readOnly
                              />
                              {quote.amountOut !== null && (
                                <div className="quote-details">
                                  <span className="dex-label">ICPSwap</span>
                                  {quote.priceImpact !== null && (
                                    <span 
                                      className="price-impact"
                                      data-impact={quote.priceImpact < 1 ? "low" : quote.priceImpact < 5 ? "medium" : "high"}
                                    >
                                      Impact: {quote.priceImpact.toFixed(2)}%
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          {Boolean(kongQuote.amountOut) && (
                            <div className={`quote-amount ${rankings.kong || ''} ${selectedDex === 'kong' ? 'selected' : ''}`}
                              onClick={() => kongQuote.amountOut && handleQuoteSelection('kong')}
                              style={{ cursor: kongQuote.amountOut ? 'pointer' : 'default' }}
                            >
                              {kongQuote.request && (
                                <div className="quote-request">
                                  <span className="quote-tokens">KONG</span>
                                  <span className="quote-amount-requested">{formattedRequestAmount} {getTokenSymbol(kongQuote.request.tokenIn)}</span>
                                </div>
                              )}
                              <input 
                                type="text" 
                                className="amount-input" 
                                placeholder="0.0"
                                value={kongQuote.amountOut ? formattedKongQuoteAmount : ''}
                                readOnly
                              />
                              {kongQuote.amountOut !== null && (
                                <div className="quote-details">
                                  <span className="dex-label">Kong</span>
                                  {kongQuote.priceImpact !== null && (
                                    <span 
                                      className="price-impact"
                                      data-impact={kongQuote.priceImpact < 1 ? "low" : kongQuote.priceImpact < 5 ? "medium" : "high"}
                                    >
                                      Impact: {kongQuote.priceImpact.toFixed(2)}%
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </React.Fragment>
              );
            })()}
          </div>
          <div 
              className="quotes-header"
              onClick={() => setIsFooCollapsed(!isFooCollapsed)}
          >
          <div className="header-content">
            <span className="section-title">ICPSwap Pool Balances</span>
            {/* Show combined balances if they exist */}
            <div className="combined-balances">
              {/* Show token0 balance if non-zero */}
              {token0Address && (balances?.undeposited0?.balance_e8s || BigInt(0)) + (balances?.deposited0 || BigInt(0)) > BigInt(0) && (
                <div className="balance-item">
                  <img 
                    src={loadedLogos[token0Address] || '/generic_token.svg'}
                    alt={tokens.find(t => t.canisterId === token0Address)?.metadata?.symbol}
                    className="token-logo"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.src = '/generic_token.svg';
                      img.onerror = null;
                    }}
                  />
                  <span>
                    {formatTokenAmount(
                      token0Address && isDIP20Token(token0Address) ?
                        (balances?.deposited0 || BigInt(0)) :  // Only deposited balance for DIP20
                        (balances?.undeposited0?.balance_e8s || BigInt(0)) + (balances?.deposited0 || BigInt(0)),  // Combined for others
                      token0Address || ''
                    )}
                    {/* Show USD value only if it's the only non-zero balance */}
                    {balances.usdValue0 !== undefined && 
                      (!token1Address || (balances?.undeposited1?.balance_e8s || BigInt(0)) + (balances?.deposited1 || BigInt(0)) === BigInt(0)) && (
                      <>
                        <span className="separator">•</span>
                        <span className="balance-usd-value">
                          ${calculateUSDValue(
                            (balances?.undeposited0?.balance_e8s || BigInt(0)) + (balances?.deposited0 || BigInt(0)),
                            (balances?.undeposited0?.balance_e8s || BigInt(0)) + (balances?.deposited0 || BigInt(0)),
                            balances.usdValue0,
                            token0Address || ''
                          )}
                        </span>
                      </>
                    )}
                  </span>
                </div>
              )}
              {/* Show token1 balance if non-zero */}
              {token1Address && (balances?.undeposited1?.balance_e8s || BigInt(0)) + (balances?.deposited1 || BigInt(0)) > BigInt(0) && (
                <div className="balance-item">
                  <img 
                    src={loadedLogos[token1Address] || '/generic_token.svg'}
                    alt={tokens.find(t => t.canisterId === token1Address)?.metadata?.symbol}
                    className="token-logo"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.src = '/generic_token.svg';
                      img.onerror = null;
                    }}
                  />
                  <span>
                    {formatTokenAmount(
                      token1Address && isDIP20Token(token1Address) ?
                        (balances?.deposited1 || BigInt(0)) :  // Only deposited balance for DIP20
                        (balances?.undeposited1?.balance_e8s || BigInt(0)) + (balances?.deposited1 || BigInt(0)),  // Combined for others
                      token1Address || ''
                    )}
                    {/* Show USD value only if it's the only non-zero balance */}
                    {balances.usdValue1 !== undefined && 
                      (!token0Address || (balances?.undeposited0?.balance_e8s || BigInt(0)) + (balances?.deposited0 || BigInt(0)) === BigInt(0)) && (
                      <>
                        <span className="separator">•</span>
                        <span className="balance-usd-value">
                          ${calculateUSDValue(
                            (balances?.undeposited1?.balance_e8s || BigInt(0)) + (balances?.deposited1 || BigInt(0)),
                            (balances?.undeposited1?.balance_e8s || BigInt(0)) + (balances?.deposited1 || BigInt(0)),
                            balances.usdValue1,
                            token1Address || ''
                          )}
                        </span>
                      </>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="pool-actions">
            <button
              className="collapse-toggle"
              onClick={(e) => {
                e.stopPropagation();  // Prevent double-toggle
                setIsFooCollapsed(!isFooCollapsed);
              }}
            >
              {isFooCollapsed ? '▼' : '▲'}
            </button>
          </div>

          </div>
          {!isFooCollapsed && (
            <div className="pool-subsections">
              {!isAuthenticated && (
                  <div className="quotes-header">
                  <label className="skip-withdraw-label">
                    Please log in to see your ICPSwap pool balances.
                  </label>
                </div>
              )} 
              {isAuthenticated && (
              <>
                <div className="quotes-header">
                  <label className="skip-withdraw-label">
                    <input
                      type="checkbox"
                      checked={keepTokensInPool}
                      onChange={(e) => setKeepTokensInPool(e.target.checked)}
                    />
                    Keep your swapped tokens in swap pool
                  </label>
                  <button 
                    className="action-button"
                    onClick={fetchPoolBalances}
                    title="Refresh balances"
                  >↻</button>
                </div>
                {(!poolId || !fromToken || !toToken) && (
                  <div className="quotes-header">
                    <label className="skip-withdraw-label">
                      Please select a token pair to see your ICPSwap pool balances.
                    </label>
                  </div>
                )}
                {poolId && fromToken && toToken && (
                  <>
                    <div 
                      className="quotes-header"
                      onClick={() => setIsToken0PoolCollapsed(!isToken0PoolCollapsed)}
                    >
                      <div className="token-info">
                        <div className="token-info-content">
                          {token0Address && tokens.find(t => t.canisterId === token0Address)?.metadata && (
                            <img 
                              src={loadedLogos[token0Address] || '/generic_token.svg'}
                              alt={tokens.find(t => t.canisterId === token0Address)?.metadata?.symbol}
                              className="token-logo"
                              onError={(e) => {
                                const img = e.target as HTMLImageElement;
                                img.src = '/generic_token.svg';
                                img.onerror = null;
                              }}
                            />
                          )}
                          <div className="pool-balance">
                            {formatTokenAmount(
                              token0Address && isDIP20Token(token0Address) ?
                                (balances?.deposited0 || BigInt(0)) :  // Only deposited balance for DIP20
                                (balances?.undeposited0?.balance_e8s || BigInt(0)) + (balances?.deposited0 || BigInt(0)),  // Combined for others
                              token0Address || ''
                            )}
                            {balances.usdValue0 !== undefined && (
                              <>
                                <span className="separator">•</span>
                                <span className="balance-usd-value">
                                  ${calculateUSDValue(
                                    (balances?.undeposited0?.balance_e8s || BigInt(0)) + (balances?.deposited0 || BigInt(0)),
                                    (balances?.undeposited0?.balance_e8s || BigInt(0)) + (balances?.deposited0 || BigInt(0)),
                                    balances.usdValue0,
                                    token0Address || ''
                                  )}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="pool-actions">
                        <button 
                          className="pool-action-button" 
                          title="Deposit"
                          onClick={(e) => {
                            e.stopPropagation();
                            token0Address && handleHeaderDeposit(token0Address);
                          }}
                          disabled={!fromTokenBalance || fromTokenBalance === '0'}
                        ><FiLogIn /></button>
                        <button 
                          className="pool-action-button" 
                          title="Withdraw"
                          onClick={(e) => {
                            e.stopPropagation();
                            token0Address && handleHeaderWithdraw(token0Address);
                          }}
                          disabled={!balances?.undeposited0?.balance_e8s && !balances?.deposited0 || 
                                  (balances?.undeposited0?.balance_e8s || BigInt(0)) + (balances?.deposited0 || BigInt(0)) <= BigInt(0)}
                        ><FiDownload /></button>
                        <button 
                          className="collapse-toggle"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsToken0PoolCollapsed(!isToken0PoolCollapsed);
                          }}
                        >
                          {isToken0PoolCollapsed ? '▼' : '▲'}
                        </button>
                      </div>
                    </div>
                    {!isToken0PoolCollapsed && token0Address && (
                      <div className="pool-content">
                        <div className="pool-balance-section">
                          {/* Only show undeposited balance row for non-DIP20 tokens */}
                          {token0Address && !isDIP20Token(token0Address) && (
                            <div className="balance-row undeposited">
                              <div className="balance-info">
                                <span className="balance-label">Transferred:</span>
                                <span className="balance-amount">
                                  {formatTokenAmount(
                                    balances?.undeposited0?.balance_e8s || BigInt(0),
                                    token0Address
                                  )}
                                  {balances.usdValue0 !== undefined && (
                                    <>
                                      <span className="separator">•</span>
                                      <span className="balance-usd-value">
                                        ${calculateUSDValue(
                                          balances?.undeposited0?.balance_e8s || BigInt(0),
                                          (balances?.undeposited0?.balance_e8s || BigInt(0)) + (balances?.deposited0 || BigInt(0)),
                                          balances.usdValue0,
                                          token0Address || ''
                                        )}
                                      </span>
                                    </>
                                  )}
                                </span>
                              </div>
                              <div className="balance-actions">
                                <button 
                                  className="pool-action-button" 
                                  title="Transfer"
                                  onClick={() => handleUndepositedTransfer(token0Address)}
                                ><FiRepeat /></button>
                                <button 
                                  className="pool-action-button" 
                                  title="Deposit"
                                  onClick={() => handleUndepositedDeposit(token0Address)}
                                  disabled={!balances?.undeposited0?.balance_e8s || balances.undeposited0.balance_e8s <= BigInt(0)}
                                ><FiLogIn /></button>
                                <button 
                                  className="pool-action-button" 
                                  title="Withdraw"
                                  onClick={() => handleUndepositedWithdraw(token0Address)}
                                  disabled={!balances?.undeposited0?.balance_e8s || balances.undeposited0.balance_e8s <= BigInt(0)}
                                ><FiDownload /></button>
                              </div>
                            </div>
                          )}
                          <div className="balance-row deposited">
                            <div className="balance-info">
                              <span className="balance-label">Deposited:</span>
                              <span className="balance-amount">
                                {formatTokenAmount(
                                  balances?.deposited0 || BigInt(0),
                                  token0Address
                                )}
                                {balances.usdValue0 !== undefined && (
                                  <>
                                    <span className="separator">•</span>
                                    <span className="balance-usd-value">
                                      ${calculateUSDValue(
                                        balances?.deposited0 || BigInt(0),
                                        (balances?.undeposited0?.balance_e8s || BigInt(0)) + (balances?.deposited0 || BigInt(0)),
                                        balances.usdValue0,
                                        token0Address || ''
                                      )}
                                    </span>
                                  </>
                                )}
                              </span>
                            </div>
                            <div className="balance-actions">
                              <button 
                                className="pool-action-button" 
                                title="Withdraw"
                                onClick={() => handleDepositedWithdraw(token0Address)}
                                disabled={!balances?.deposited0 || balances.deposited0 <= BigInt(0)}
                              ><FiDownload /></button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Second token subsection */}
                    <div 
                      className="quotes-header"
                      onClick={() => setIsToken1PoolCollapsed(!isToken1PoolCollapsed)}
                    >
                      <div className="token-info">
                        <div className="token-info-content">
                          {token1Address && tokens.find(t => t.canisterId === token1Address)?.metadata && (
                            <img 
                              src={loadedLogos[token1Address] || '/generic_token.svg'}
                              alt={tokens.find(t => t.canisterId === token1Address)?.metadata?.symbol}
                              className="token-logo"
                              onError={(e) => {
                                const img = e.target as HTMLImageElement;
                                img.src = '/generic_token.svg';
                                img.onerror = null;
                              }}
                            />
                          )}
                          <div className="pool-balance">
                            {formatTokenAmount(
                              token1Address && isDIP20Token(token1Address) ?
                                (balances?.deposited1 || BigInt(0)) :  // Only deposited balance for DIP20
                                (balances?.undeposited1?.balance_e8s || BigInt(0)) + (balances?.deposited1 || BigInt(0)),  // Combined for others
                              token1Address || ''
                            )}
                            {balances.usdValue1 !== undefined && (
                              <>
                                <span className="separator">•</span>
                                <span className="balance-usd-value">
                                  ${calculateUSDValue(
                                    (balances?.undeposited1?.balance_e8s || BigInt(0)) + (balances?.deposited1 || BigInt(0)),  // Use combined balance
                                    (balances?.undeposited1?.balance_e8s || BigInt(0)) + (balances?.deposited1 || BigInt(0)),
                                    balances.usdValue1,
                                    token1Address || ''
                                  )}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="pool-actions">
                        <button 
                          className="pool-action-button" 
                          title="Deposit"
                          onClick={(e) => {
                            e.stopPropagation();
                            token1Address && handleHeaderDeposit(token1Address);
                          }}
                          disabled={!toTokenBalance || toTokenBalance === '0'}
                        ><FiLogIn /></button>
                        <button 
                          className="pool-action-button" 
                          title="Withdraw"
                          onClick={(e) => {
                            e.stopPropagation();
                            token1Address && handleHeaderWithdraw(token1Address);
                          }}
                          disabled={!balances?.undeposited1?.balance_e8s && !balances?.deposited1 || 
                                  (balances?.undeposited1?.balance_e8s || BigInt(0)) + (balances?.deposited1 || BigInt(0)) <= BigInt(0)}
                        ><FiDownload /></button>
                        <button 
                          className="collapse-toggle"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsToken1PoolCollapsed(!isToken1PoolCollapsed);
                          }}
                        >
                          {isToken1PoolCollapsed ? '▼' : '▲'}
                        </button>
                      </div>
                    </div>
                    {!isToken1PoolCollapsed && token1Address && (
                      <div className="pool-content">
                        <div className="pool-balance-section">
                          {/* Only show undeposited balance row for non-DIP20 tokens */}
                          {token1Address && !isDIP20Token(token1Address) && (
                            <div className="balance-row undeposited">
                              <div className="balance-info">
                                <span className="balance-label">Transferred:</span>
                                <span className="balance-amount">
                                  {formatTokenAmount(
                                    balances?.undeposited1?.balance_e8s || BigInt(0),
                                    token1Address
                                  )}
                                  {balances.usdValue1 !== undefined && (
                                    <>
                                      <span className="separator">•</span>
                                      <span className="balance-usd-value">
                                        ${calculateUSDValue(
                                          balances?.undeposited1?.balance_e8s || BigInt(0),
                                          (balances?.undeposited1?.balance_e8s || BigInt(0)) + (balances?.deposited1 || BigInt(0)),
                                          balances.usdValue1,
                                          token1Address || ''
                                        )}
                                      </span>
                                    </>
                                  )}
                                </span>
                              </div>
                              <div className="balance-actions">
                                <button 
                                  className="pool-action-button" 
                                  title="Transfer"
                                  onClick={() => handleUndepositedTransfer(token1Address)}
                                ><FiRepeat /></button>
                                <button 
                                  className="pool-action-button" 
                                  title="Deposit"
                                  onClick={() => handleUndepositedDeposit(token1Address)}
                                  disabled={!balances?.undeposited1?.balance_e8s || balances.undeposited1.balance_e8s <= BigInt(0)}
                                ><FiLogIn /></button>
                                <button 
                                  className="pool-action-button" 
                                  title="Withdraw"
                                  onClick={() => handleUndepositedWithdraw(token1Address)}
                                  disabled={!balances?.undeposited1?.balance_e8s || balances.undeposited1.balance_e8s <= BigInt(0)}
                                ><FiDownload /></button>
                              </div>
                            </div>
                          )}
                          <div className="balance-row deposited">
                            <div className="balance-info">
                              <span className="balance-label">Deposited:</span>
                              <span className="balance-amount">
                                {formatTokenAmount(
                                  balances?.deposited1 || BigInt(0),
                                  token1Address
                                )}
                                {balances.usdValue1 !== undefined && (
                                  <>
                                    <span className="separator">•</span>
                                    <span className="balance-usd-value">
                                      ${calculateUSDValue(
                                        balances?.deposited1 || BigInt(0),
                                        (balances?.undeposited1?.balance_e8s || BigInt(0)) + (balances?.deposited1 || BigInt(0)),
                                        balances.usdValue1,
                                        token1Address || ''
                                      )}
                                    </span>
                                  </>
                                )}
                              </span>
                            </div>
                            <div className="balance-actions">
                              <button 
                                className="pool-action-button" 
                                title="Withdraw"
                                onClick={() => handleDepositedWithdraw(token1Address)}
                                disabled={!balances?.deposited1 || balances.deposited1 <= BigInt(0)}
                              ><FiDownload /></button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                </>
                )}
              </>
              )}
            </div>
          )}
          {isFeatureEnabled('SHOW_TIME_SPLIT_SWAP') && (
            <div className="time-split-section">
              <button 
                className="time-split-toggle"
                onClick={() => setShowTimeSplit(!showTimeSplit)}
              >
                Time Split Swap <FiChevronDown style={{ transform: showTimeSplit ? 'rotate(180deg)' : 'none' }} />
              </button>
              {showTimeSplit && (
                <div className="time-split-content">
                  {activeTimeSplitRun ? (
                    <TimeSplitProgress 
                      tokenPairKey={activeTimeSplitRun}
                      onComplete={handleTimeSplitComplete}
                    />
                  ) : (
                    <>
                      <div className="form-section">
                        <h4>Amount per Trade</h4>
                        <div className="input-group">
                          <div className="input-row">
                            <label>Min</label>
                            <input 
                              type="number" 
                              placeholder="0.00" 
                              min="0"
                              value={minAmount}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (isAmountPercent && Number(value) > 100) return;
                                setMinAmount(value);
                                if (Number(value) > Number(maxAmount)) {
                                  setMaxAmount(value);
                                }
                              }}
                            />
                            <button 
                              className={`unit-toggle ${isAmountPercent ? 'active' : ''}`}
                              onClick={() => setIsAmountPercent(!isAmountPercent)}
                            >
                              {isAmountPercent ? '%' : getTokenSymbol(fromToken || '')}
                            </button>
                          </div>
                          <div className="input-row">
                            <label>Max</label>
                            <input 
                              type="number" 
                              placeholder="0.00" 
                              min="0"
                              value={maxAmount}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (isAmountPercent && Number(value) > 100) return;
                                setMaxAmount(value);
                                if (Number(value) < Number(minAmount)) {
                                  setMinAmount(value);
                                }
                              }}
                            />
                            <button 
                              className={`unit-toggle ${isAmountPercent ? 'active' : ''}`}
                              onClick={() => setIsAmountPercent(!isAmountPercent)}
                            >
                              {isAmountPercent ? '%' : getTokenSymbol(fromToken || '')}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="form-section">
                        <h4>Time Between Trades</h4>
                        <div className="input-group">
                          <div className="input-row">
                            <label>Min</label>
                            <input 
                              type="number" 
                              placeholder="30" 
                              min="0"
                              value={minInterval}
                              onChange={(e) => setMinInterval(e.target.value)}
                            />
                            <button className="unit-toggle">sec</button>
                          </div>
                          <div className="input-row">
                            <label>Max</label>
                            <input 
                              type="number" 
                              placeholder="90" 
                              min="0"
                              value={maxInterval}
                              onChange={(e) => setMaxInterval(e.target.value)}
                            />
                            <button className="unit-toggle">sec</button>
                          </div>
                        </div>
                      </div>

                      <div className="form-section">
                        <h4>Price Range</h4>
                        <div className="input-group">
                          <div className="input-row">
                            <label>Min</label>
                            <input 
                              type="number" 
                              placeholder="0.00" 
                              min="0"
                              value={minPrice}
                              onChange={(e) => setMinPrice(e.target.value)}
                            />
                            <button 
                              className={`unit-toggle ${isPriceRangePercent ? 'active' : ''}`}
                              onClick={() => setIsPriceRangePercent(!isPriceRangePercent)}
                            >
                              {isPriceRangePercent ? '%' : '$'}
                            </button>
                          </div>
                          <div className="input-row">
                            <label>Max</label>
                            <input 
                              type="number" 
                              placeholder="0.00" 
                              min="0"
                              value={maxPrice}
                              onChange={(e) => setMaxPrice(e.target.value)}
                            />
                            <button 
                              className={`unit-toggle ${isPriceRangePercent ? 'active' : ''}`}
                              onClick={() => setIsPriceRangePercent(!isPriceRangePercent)}
                            >
                              {isPriceRangePercent ? '%' : '$'}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="form-section">
                        <h4>Limits (Optional)</h4>
                        <div className="input-group">
                          <div className="input-row">
                            <label>Max Time</label>
                            <input 
                              type="number" 
                              placeholder="24" 
                              min="0"
                              value={timePeriod}
                              onChange={(e) => setTimePeriod(e.target.value)}
                            />
                            <button className="unit-toggle">hr</button>
                          </div>
                        </div>
                      </div>

                      <div className="time-split-buttons">
                        <button 
                          className="start-run-button"
                          onClick={handleStartTimeSplitRun}
                          disabled={!fromToken || !toToken || !fromAmount || !minAmount || !maxAmount}
                        >
                          Start Time Split Run
                        </button>
                        <button 
                          className="clear-run-button"
                          onClick={async () => {
                            try {
                              await timeSplitManager.clearRun(`${fromToken}-${toToken}`);
                              setNotification({ type: 'success', message: 'Stale run cleared. You can now start a new run.' });
                            } catch (error) {
                              setNotification({ 
                                type: 'error', 
                                message: error instanceof Error ? error.message : 'Failed to clear stale run' 
                              });
                            }
                          }}
                        >
                          Clear Stale Run
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}          
        </div>

        <div className="price-comparison subtle">
          <div className="dex-price">
            {!fromToken || !toToken ? ( 
              <span>Select token pair for ICPSwap price.</span>
            ) : price.loading ? (
              <span>Loading ICPSwap price...</span>
            ) : price.error ? (
              <span>Error: {price.error}</span>
            ) : price.value ? (
              <div className="price-with-switch">
                <span>
                  ICPSwap: 1 {isPriceReversed ? getTokenSymbol(toToken) : getTokenSymbol(fromToken)} = {formatPrice(price.value, isPriceReversed)} {isPriceReversed ? getTokenSymbol(fromToken) : getTokenSymbol(toToken)}
                </span>
                <button className="switch-price" onClick={() => setIsPriceReversed(!isPriceReversed)}>
                  ⇄
                </button>
              </div>
            ) : null}
          </div>
          <div className="dex-price">
            {!fromToken || !toToken ? ( 
              <span>Select token pair for Kong price.</span>
            ) : kongPrice.loading ? (
              <span>Loading Kong price...</span>
            ) : kongPrice.error ? (
              <span>Error: {kongPrice.error}</span>
            ) : kongPrice.value ? (
              <div className="price-with-switch">
                <span>
                  Kong: 1 {isPriceReversed ? getTokenSymbol(toToken) : getTokenSymbol(fromToken)} = {formatPrice(kongPrice.value, isPriceReversed)} {isPriceReversed ? getTokenSymbol(fromToken) : getTokenSymbol(toToken)}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Replace the SwapModal section with conditional rendering for all three cases */}
        {showModal && (
          selectedDex === 'kong' || (selectedDex === 'split' && distribution === 100) ? (
            <KongSwapModal
              isOpen={showModal}
              onClose={() => {                
                setShowModal(false);
                resetSteps();
              }}
              details={swapDetails}
              onConfirm={onConfirmKongSwap}
              onSuccess={() => {}}
              steps={steps}
            />
          ) : selectedDex === 'split' && distribution > 0 && distribution < 100 ? (
            <SplitSwapModal
              isOpen={showModal}
              onClose={() => {
                setShowModal(false);
                resetSteps();
              }}
              details={swapDetails}
              onConfirm={onConfirmSplitSwap}
              onSuccess={() => {}}
              icpswapSteps={icpswapSteps}
              kongSteps={kongSteps}
            />
          ) : (
            <SwapModal
              isOpen={showModal}
              onClose={() => {
                setShowModal(false);
                resetSteps();
              }}
              details={swapDetails}
              onConfirm={onConfirm}
              onSuccess={() => {}}
              steps={steps}
            />
          )
        )}

        {/* Add modals */}
        {tokenAction && tokenAction.isOpen && tokenAction.type === 'transfer' && tokenAction.tokenId && tokenAction.tokenSymbol && poolId && (
          <TransferModal
            isOpen={true}
            onClose={handleCloseModal}
            tokenId={tokenAction.tokenId}
            tokenSymbol={tokenAction.tokenSymbol}
            poolId={poolId}
            onSuccess={handleActionSuccess}
            isToken0={tokenAction.isToken0}
            refreshBalances={refreshBalances}
          />
        )}

        {tokenAction && tokenAction.isOpen && tokenAction.type === 'deposit' && tokenAction.tokenId && tokenAction.tokenSymbol && poolId && (
          <DepositModal
            isOpen={true}
            onClose={handleCloseModal}
            tokenId={tokenAction.tokenId}
            tokenSymbol={tokenAction.tokenSymbol}
            poolId={poolId}
            source={tokenAction.source === 'undeposited' ? 'undeposited' : 'wallet'}
            onSuccess={handleActionSuccess}
            isToken0={tokenAction.isToken0}
            refreshBalances={refreshBalances}
          />
        )}

        {tokenAction && tokenAction.type === 'withdraw' && tokenAction.tokenId && tokenAction.tokenSymbol && poolId && (
          <WithdrawModal
            isOpen={tokenAction.isOpen}
            onClose={handleCloseModal}
            tokenId={tokenAction.tokenId}
            tokenSymbol={tokenAction.tokenSymbol}
            poolId={poolId}
            source={tokenAction.source || 'deposited'}
            onSuccess={handleActionSuccess}
            isToken0={tokenAction.isToken0}
            refreshBalances={refreshBalances}
          />
        )}
      </div>

      <div className="powered-by-container">
        <a href={`https://app.icpswap.com/swap?input=${fromToken || ''}&output=${toToken || ''}`} target="_blank" rel="noopener noreferrer">
          <img src="/Powered by ICPSwap.png" alt="Powered by ICPSwap" />
        </a>
        <a href={`https://www.kongswap.io/swap?from=${fromToken || ''}&to=${toToken || ''}`} target="_blank" rel="noopener noreferrer">
          <img src="/powered_by_kong.png" alt="Powered by Kong" />
        </a>
      </div>
      
      {/* Add logo loading progress indicator */}
      {logoLoadingProgress.isLoading && (
        <div className="logo-loading-progress">
          <div className="progress-text">
            Loading token logos ({logoLoadingProgress.progress.toFixed(1)}%)
          </div>
          <div className="search-range-progress">
            <SearchRangeProgress
              left={0}
              right={100}
              m1={logoLoadingProgress.progress}
              isSearching={true}
              mode="progress"
            />
          </div>
          <div className="progress-details">
            {logoLoadingProgress.processedTokens} / {logoLoadingProgress.totalTokens} tokens processed 
            ({logoLoadingProgress.cachedTokens} cached, {logoLoadingProgress.skippedTokens} skipped)
          </div>
        </div>
      )}
    </div>
  );
}
