import React, { useEffect, useState } from 'react';
import { FiLoader, FiCreditCard, FiLogIn, FiPlus, FiDroplet, FiRefreshCw } from 'react-icons/fi';
import { usePool } from '../contexts/PoolContext';
import { useAuth } from '../contexts/AuthContext';
import { tokenService } from '../services/token';
import { TokenMetadata } from '../types/token';
import { AddPoolModal } from '../components/AddPoolModal';
import { formatTokenAmount } from '../utils/format';
import { priceService } from '../services/price';
import { WithdrawModal } from '../components/WithdrawModal';
import '../styles/Pools.css';
import { ICPSwapExecutionService } from '../services/icpswap_execution';
import { useTokens } from '../contexts/TokenContext';
import type { Pool } from '../contexts/PoolContext';

interface TokenDisplay {
  metadata: TokenMetadata | null;
  isLoading: boolean;
  usdPrice: number | null;
}

export const PoolsPage: React.FC = () => {
  const { pools, isLoading: poolsLoading, refreshPools } = usePool();
  const { isAuthenticated, login } = useAuth();
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, TokenDisplay>>({});
  const [showAddPoolModal, setShowAddPoolModal] = useState(false);
  const [hideEmptyBalances, setHideEmptyBalances] = useState(false);
  const [expandedPools, setExpandedPools] = useState<Set<string>>(new Set());
  const [withdrawModalState, setWithdrawModalState] = useState<{
    isOpen: boolean;
    tokenId: string;
    tokenSymbol: string;
    poolId: string;
    isToken0: boolean;
  } | null>(null);
  const [withdrawingPools, setWithdrawingPools] = useState<Record<string, boolean>>({});
  const { tokens } = useTokens();
  const [isWithdrawingEverything, setIsWithdrawingEverything] = useState(false);

  // Load token metadata and USD prices progressively
  useEffect(() => {
    const loadTokenData = async (tokenAddress: string) => {
      if (tokenMetadata[tokenAddress]?.metadata) return; // Skip if already loaded

      // Set initial loading state if not exists
      if (!tokenMetadata[tokenAddress]) {
        setTokenMetadata(prev => ({
          ...prev,
          [tokenAddress]: { metadata: null, isLoading: true, usdPrice: null }
        }));
      }

      try {
        const [metadata, usdPrice] = await Promise.all([
          tokenService.getMetadataWithLogo(tokenAddress),
          priceService.getTokenUSDPrice(tokenAddress)
        ]);

        setTokenMetadata(prev => ({
          ...prev,
          [tokenAddress]: { metadata, isLoading: false, usdPrice }
        }));
      } catch (error) {
        console.error(`Error loading data for token ${tokenAddress}:`, error);
        setTokenMetadata(prev => ({
          ...prev,
          [tokenAddress]: { metadata: null, isLoading: false, usdPrice: null }
        }));
      }
    };

    // Load data for each token in pools
    pools.forEach(pool => {
      if (!pool.metadata) return;
      loadTokenData(pool.metadata.token0.address);
      loadTokenData(pool.metadata.token1.address);
    });
  }, [pools]);

  const withdrawAll = async (pool: Pool) => {
    if (!pool.metadata || !pool.balances || withdrawingPools[pool.canisterId]) return;
    
    try {
      setWithdrawingPools(prev => ({ ...prev, [pool.canisterId]: true }));
      const executionService = new ICPSwapExecutionService();

      // Helper function to withdraw a single token
      const withdrawToken = async (tokenId: string, isToken0: boolean) => {
        // Get token metadata for fee
        const token = tokens.find(t => t.canisterId === tokenId);
        if (!token?.metadata) return;

        const fee_e8s = token.metadata.fee;
        const isDIP20 = token.metadata.standard.toLowerCase().includes('dip20');
        const balance = isToken0 ? pool.balances!.token0 : pool.balances!.token1;

        // For DIP20 tokens, only withdraw deposited balance
        if (isDIP20) {
          if (balance.deposited > BigInt(0)) {
            await executionService.withdrawFromPool({
              poolId: pool.canisterId,
              tokenId,
              amount_e8s: balance.deposited.toString(),
            });
          }
          return;
        }

        // For non-DIP20 tokens, handle both deposited and undeposited
        if (balance.undeposited > BigInt(0)) {
          // Calculate amount to deposit (need to account for fee)
          const amountToDeposit = balance.undeposited;
          
          // Deposit undeposited balance
          await executionService.depositTokenToPool({
            poolId: pool.canisterId,
            tokenId,
            amount_e8s: amountToDeposit.toString(),
            source: 'undeposited',
          });

          // Calculate actual deposited amount (original minus fee)
          const actualDeposited = amountToDeposit - fee_e8s;
          
          // Withdraw the deposited amount plus original deposited balance
          if (actualDeposited + balance.deposited > BigInt(0)) {
            await executionService.withdrawFromPool({
              poolId: pool.canisterId,
              tokenId,
              amount_e8s: (actualDeposited + balance.deposited).toString(),
            });
          }
        } else if (balance.deposited > BigInt(0)) {
          // Just withdraw deposited balance
          await executionService.withdrawFromPool({
            poolId: pool.canisterId,
            tokenId,
            amount_e8s: balance.deposited.toString(),
          });
        }
      };

      // Withdraw both tokens
      await withdrawToken(pool.metadata.token0.address, true);
      await withdrawToken(pool.metadata.token1.address, false);

      // Refresh balances
      await refreshPools();
    } catch (error) {
      console.error('Error withdrawing all:', error);
    } finally {
      setWithdrawingPools(prev => ({ ...prev, [pool.canisterId]: false }));
    }
  };

  // Add this filter function before the return statement
  const filteredPools = pools.filter(pool => {
    if (!hideEmptyBalances) return true;
    if (!pool.balances) return false;
    
    const token0Total = (pool.balances.token0.deposited || BigInt(0)) + (pool.balances.token0.undeposited || BigInt(0));
    const token1Total = (pool.balances.token1.deposited || BigInt(0)) + (pool.balances.token1.undeposited || BigInt(0));
    
    return token0Total > BigInt(0) || token1Total > BigInt(0);
  });

  const withdrawEverything = async () => {
    if (isWithdrawingEverything) return;
    
    try {
      setIsWithdrawingEverything(true);
      
      // Withdraw from each pool sequentially
      for (const pool of filteredPools) {
        if (!pool.metadata || !pool.balances) continue;
        
        // Use the existing withdrawAll function
        await withdrawAll(pool);
      }
    } catch (error) {
      console.error('Error withdrawing everything:', error);
    } finally {
      setIsWithdrawingEverything(false);
    }
  };

  const togglePoolExpand = (poolId: string, event: React.MouseEvent) => {
    // Don't toggle if clicking the withdraw button
    const target = event.target as HTMLElement;
    if (target.closest('.withdraw-button')) {
      return;
    }

    setExpandedPools(prev => {
      const next = new Set(prev);
      if (next.has(poolId)) {
        next.delete(poolId);
      } else {
        next.add(poolId);
      }
      return next;
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="pools-page">
        <div className="pools-box">
          <div className="pools-empty-state">
            <FiDroplet className="empty-icon" />
            <h3>Welcome to Your Pools</h3>
            <p>Please log in to view and manage your ICPSwap pool balances.</p>
            <button className="login-button" onClick={login}>
              <FiLogIn className="icon" />
              Log In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pools-page">
      <div className="pools-box">
        <div className="pools-container">
          <div className="wallet-header-row">
            <div className="wallet-total">
              <span className="total-label">Total Value:</span>
              <span className="total-value">
                ${pools.reduce((total, pool) => {
                  if (!pool.metadata || !pool.balances) return total;
                  
                  const token0 = tokenMetadata[pool.metadata.token0.address];
                  const token1 = tokenMetadata[pool.metadata.token1.address];
                  
                  if (!token0?.usdPrice || !token1?.usdPrice) return total;
                  
                  const token0Value = (
                    Number(formatTokenAmount(pool.balances.token0.deposited || BigInt(0), pool.metadata.token0.address)) +
                    Number(formatTokenAmount(pool.balances.token0.undeposited || BigInt(0), pool.metadata.token0.address))
                  ) * token0.usdPrice;
                  
                  const token1Value = (
                    Number(formatTokenAmount(pool.balances.token1.deposited || BigInt(0), pool.metadata.token1.address)) +
                    Number(formatTokenAmount(pool.balances.token1.undeposited || BigInt(0), pool.metadata.token1.address))
                  ) * token1.usdPrice;
                  
                  return total + token0Value + token1Value;
                }, 0).toFixed(2)}
              </span>
            </div>
            <button 
              className="expanded-action-button"
              onClick={refreshPools}
              disabled={poolsLoading}
              title="Refresh pool balances"
            >
              <span className="action-symbol"><FiRefreshCw /></span>
              <span className="action-text">{poolsLoading ? 'Refreshing...' : 'Refresh'}</span>
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
                  onClick={withdrawEverything}
                  disabled={isWithdrawingEverything || filteredPools.length === 0}
                  title="Withdraw all tokens from all pools back to your wallet"
                >
                  {isWithdrawingEverything ? 'Consolidating...' : '🎩 Consolidate'}
                </button>
                <button 
                  className="expanded-action-button" 
                  onClick={() => setShowAddPoolModal(true)}
                  title="Add a new pool to track"
                >
                  <span className="action-symbol"><FiPlus /></span>
                  <span className="action-text">Add Pool</span>
                </button>
              </div>
            </div>
          </div>
          {filteredPools.length === 0 && !poolsLoading ? (
            <div className="pools-empty-state">
              <FiCreditCard className="empty-icon" />
              <h3>No Pools Found</h3>
              <p>You haven't added any ICPSwap pools yet</p>
              <button 
                className="add-first-pool-button"
                onClick={() => setShowAddPoolModal(true)}
              >
                <FiPlus className="icon" />
                Add Your First Pool
              </button>
            </div>
          ) : (
            <div className="pools-list">
              {filteredPools.map((pool) => (
                <div className="pool-details" key={pool.canisterId}>
                  {!pool.metadata ? (
                    <div className="pool-loading">
                      <FiLoader className="spinner" />
                      <span>Loading pool details...</span>
                    </div>
                  ) : (
                    <div className={`pool-tokens ${expandedPools.has(pool.canisterId) ? 'expanded' : ''}`}>
                      <div 
                        className="pool-header"
                        onClick={(e) => togglePoolExpand(pool.canisterId, e)}
                      >
                        <div className="pool-header-logos">
                          {pool.metadata && tokenMetadata[pool.metadata.token0.address]?.metadata ? (
                            <img 
                              src={tokenMetadata[pool.metadata.token0.address]!.metadata!.logo} 
                              alt={tokenMetadata[pool.metadata.token0.address]!.metadata!.symbol} 
                              className="pool-token-logo"
                            />
                          ) : (
                            <div className="pool-token-logo-placeholder" />
                          )}
                          {pool.metadata && tokenMetadata[pool.metadata.token1.address]?.metadata ? (
                            <img 
                              src={tokenMetadata[pool.metadata.token1.address]!.metadata!.logo} 
                              alt={tokenMetadata[pool.metadata.token1.address]!.metadata!.symbol} 
                              className="pool-token-logo"
                            />
                          ) : (
                            <div className="pool-token-logo-placeholder" />
                          )}
                          <span className="pool-header-symbols">
                            {pool.metadata ? (
                              <>
                                {tokenMetadata[pool.metadata.token0.address]?.metadata?.symbol || '...'} / {tokenMetadata[pool.metadata.token1.address]?.metadata?.symbol || '...'}
                                {!pool.balances?.token0.isLoading && !pool.balances?.token1.isLoading && tokenMetadata[pool.metadata.token0.address]?.usdPrice !== null && tokenMetadata[pool.metadata.token1.address]?.usdPrice !== null && (
                                  <>
                                    <span className="separator">•</span>
                                    <span className="usd-value">
                                      ${(
                                        ((Number(formatTokenAmount(pool.balances?.token0.deposited || BigInt(0), pool.metadata.token0.address)) +
                                          Number(formatTokenAmount(pool.balances?.token0.undeposited || BigInt(0), pool.metadata.token0.address))) *
                                          (tokenMetadata[pool.metadata.token0.address]?.usdPrice || 0) +
                                        ((Number(formatTokenAmount(pool.balances?.token1.deposited || BigInt(0), pool.metadata.token1.address)) +
                                          Number(formatTokenAmount(pool.balances?.token1.undeposited || BigInt(0), pool.metadata.token1.address))) *
                                          (tokenMetadata[pool.metadata.token1.address]?.usdPrice || 0)
                                      ))).toFixed(2)}
                                    </span>
                                  </>
                                )}
                              </>
                            ) : (
                              '... / ...'
                            )}
                          </span>
                        </div>
                        <div className="pool-header-right">
                          <button 
                            className={`withdraw-button ${withdrawingPools[pool.canisterId] ? 'disabled' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              withdrawAll(pool);
                            }}
                            disabled={withdrawingPools[pool.canisterId] || !pool.metadata || !pool.balances}
                          >
                            {withdrawingPools[pool.canisterId] ? 'Withdrawing...' : 'Withdraw All'}
                          </button>
                        </div>
                      </div>
                      {expandedPools.has(pool.canisterId) && (
                        <>
                          {/* Token 0 */}
                          <div className="token-row">
                            <div className="token-info-group">
                              {tokenMetadata[pool.metadata.token0.address]?.metadata ? (
                                <img 
                                  src={tokenMetadata[pool.metadata.token0.address]!.metadata!.logo} 
                                  alt={tokenMetadata[pool.metadata.token0.address]!.metadata!.symbol} 
                                  className="pool-token-logo"
                                />
                              ) : (
                                <div className="pool-token-logo-placeholder" />
                              )}
                              {pool.balances?.token0.isLoading ? (
                                <FiLoader className="spinner" />
                              ) : (
                                <div className="balance-group">
                                  <span className="balance-value">
                                    {formatTokenAmount(
                                      (pool.balances?.token0.deposited || BigInt(0)) + 
                                      (pool.balances?.token0.undeposited || BigInt(0)), 
                                      pool.metadata.token0.address
                                    )}
                                  </span>
                                  {tokenMetadata[pool.metadata.token0.address]?.usdPrice !== null && (
                                    <>
                                      <span className="separator">•</span>
                                      <span className="usd-value">
                                        ${((Number(formatTokenAmount(pool.balances?.token0.deposited || BigInt(0), pool.metadata.token0.address)) +
                                            Number(formatTokenAmount(pool.balances?.token0.undeposited || BigInt(0), pool.metadata.token0.address))) *
                                            (tokenMetadata[pool.metadata.token0.address]?.usdPrice || 0)).toFixed(2)}
                                      </span>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                            <button 
                              className="withdraw-button"
                              onClick={() => setWithdrawModalState({
                                isOpen: true,
                                tokenId: pool.metadata!.token0.address,
                                tokenSymbol: tokenMetadata[pool.metadata!.token0.address]?.metadata?.symbol || '...',
                                poolId: pool.canisterId,
                                isToken0: true
                              })}
                            >
                              Withdraw
                            </button>
                          </div>

                          {/* Token 1 */}
                          <div className="token-row">
                            <div className="token-info-group">
                              {tokenMetadata[pool.metadata.token1.address]?.metadata ? (
                                <img 
                                  src={tokenMetadata[pool.metadata.token1.address]!.metadata!.logo} 
                                  alt={tokenMetadata[pool.metadata.token1.address]!.metadata!.symbol} 
                                  className="pool-token-logo"
                                />
                              ) : (
                                <div className="pool-token-logo-placeholder" />
                              )}
                              {pool.balances?.token1.isLoading ? (
                                <FiLoader className="spinner" />
                              ) : (
                                <div className="balance-group">
                                  <span className="balance-value">
                                    {formatTokenAmount(
                                      (pool.balances?.token1.deposited || BigInt(0)) + 
                                      (pool.balances?.token1.undeposited || BigInt(0)), 
                                      pool.metadata.token1.address
                                    )}
                                  </span>
                                  {tokenMetadata[pool.metadata.token1.address]?.usdPrice !== null && (
                                    <>
                                      <span className="separator">•</span>
                                      <span className="usd-value">
                                        ${((Number(formatTokenAmount(pool.balances?.token1.deposited || BigInt(0), pool.metadata.token1.address)) +
                                            Number(formatTokenAmount(pool.balances?.token1.undeposited || BigInt(0), pool.metadata.token1.address))) *
                                            (tokenMetadata[pool.metadata.token1.address]?.usdPrice || 0)).toFixed(2)}
                                      </span>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                            <button 
                              className="withdraw-button"
                              onClick={() => setWithdrawModalState({
                                isOpen: true,
                                tokenId: pool.metadata!.token1.address,
                                tokenSymbol: tokenMetadata[pool.metadata!.token1.address]?.metadata?.symbol || '...',
                                poolId: pool.canisterId,
                                isToken0: false
                              })}
                            >
                              Withdraw
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <AddPoolModal 
          isOpen={showAddPoolModal}
          onClose={() => setShowAddPoolModal(false)}
        />
        {withdrawModalState && (
          <WithdrawModal
            isOpen={withdrawModalState.isOpen}
            onClose={() => setWithdrawModalState(null)}
            tokenId={withdrawModalState.tokenId}
            tokenSymbol={withdrawModalState.tokenSymbol}
            poolId={withdrawModalState.poolId}
            source="pool"
            isToken0={withdrawModalState.isToken0}
            refreshBalances={refreshPools}
            onSuccess={() => setWithdrawModalState(null)}
          />
        )}
      </div>
    </div>
  );
}; 