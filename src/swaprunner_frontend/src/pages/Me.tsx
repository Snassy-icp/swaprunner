import React, { useState, useEffect } from 'react';
import { FiUser, FiLogIn, FiChevronDown, FiChevronUp, FiSettings, FiBarChart2, FiLoader, FiArrowUp, FiArrowDown, FiRefreshCw, FiGift, FiTrendingUp } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { usePool } from '../contexts/PoolContext';
import { statsService, UserTokenStats, TokenSavingsStats, UserTokenAllocationStats } from '../services/stats';
import { tokenService } from '../services/token';
import { TokenMetadata } from '../types/token';
import { formatTokenAmount } from '../utils/format';
import { priceService } from '../services/price';
import { AchievementsSection } from '../components/AchievementsSection';
import { AllocationsSection } from '../components/AllocationsSection';
import '../styles/Me.css';

type SortField = 'token' | 'swaps' | 'volume' | 'savings';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

interface CollapsibleSectionProps {
  title: React.ReactNode;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ 
  title, 
  icon, 
  children,
  defaultExpanded = true 
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="collapsible-section">
      <div 
        className="section-header" 
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="section-title">
          {icon}
          <h2>{title}</h2>
        </div>
        {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
      </div>
      {isExpanded && (
        <div className="section-content">
          {children}
        </div>
      )}
    </div>
  );
};

export const Me: React.FC = () => {
  const { isAuthenticated, principal, login } = useAuth();
  const { keepTokensInPool, setKeepTokensInPool } = usePool();
  const [userTokenStats, setUserTokenStats] = useState<[string, UserTokenStats][]>([]);
  const [tokenSavingsStats, setTokenSavingsStats] = useState<Record<string, TokenSavingsStats>>({});
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, TokenMetadata>>({});
  const [tokenUSDPrices, setTokenUSDPrices] = useState<Record<string, number>>({});
  const [loadingUSDPrices, setLoadingUSDPrices] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: 'volume', direction: 'desc' });
  const [userTokenAllocationStats, setUserTokenAllocationStats] = useState<[string, UserTokenAllocationStats][]>([]);
  const [loadingAllocationStats, setLoadingAllocationStats] = useState(true);

  const fetchStats = async () => {
    if (!isAuthenticated || !principal) return;
    
    try {
      setLoading(true);
      setLoadingAllocationStats(true);
      const [stats, savingsStats, allocationStats] = await Promise.all([
        statsService.getMyTokenStats(),
        statsService.getMyTokenSavingsStats(),
        statsService.getUserTokenAllocationStats(principal)
      ]);
      
      setUserTokenStats(stats);
      setUserTokenAllocationStats(allocationStats);
      
      // Convert savings stats array to record for easier lookup
      const savingsRecord: Record<string, TokenSavingsStats> = {};
      savingsStats.forEach(([tokenId, stats]) => {
        console.log("Token ID: ", tokenId);
        console.log("Savings stats: ", stats);
        savingsRecord[tokenId] = stats;
      });
      setTokenSavingsStats(savingsRecord);

      // Initialize loading state for USD prices
      const initialLoadingState: Record<string, boolean> = {};
      stats.forEach(([tokenId]) => {
        initialLoadingState[tokenId] = true;
      });
      setLoadingUSDPrices(initialLoadingState);

      // Load metadata for each token
      const metadataPromises = stats.map(async ([tokenId]) => {
        try {
          const metadata = await tokenService.getMetadataWithLogo(tokenId);
          setTokenMetadata(prev => ({
            ...prev,
            [tokenId]: metadata
          }));
        } catch (error) {
          console.error('Failed to load metadata for token:', tokenId, error);
        }
      });
      await Promise.all(metadataPromises);

      // Load USD prices progressively
      for (const [tokenId] of stats) {
        try {
          const price = await priceService.getTokenUSDPrice(tokenId);
          setTokenUSDPrices(prev => ({
            ...prev,
            [tokenId]: price
          }));
        } catch (error) {
          console.error('Failed to fetch USD price for token:', tokenId, error);
        } finally {
          setLoadingUSDPrices(prev => ({
            ...prev,
            [tokenId]: false
          }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch user-token stats:', error);
    } finally {
      setLoading(false);
      setLoadingAllocationStats(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [isAuthenticated, principal]);

  const formatAmount = (amount: bigint): string => {
    return Number(amount).toLocaleString();
  };

  const calculateUSDValue = (amount_e8s: bigint, tokenId: string): string => {
    const price = tokenUSDPrices[tokenId];
    if (!price) return '-';
    
    const metadata = tokenMetadata[tokenId];
    if (!metadata) return '-';
    
    const decimals = metadata.decimals ?? 8;
    const baseUnitMultiplier = BigInt(10) ** BigInt(decimals);
    const amountInWholeUnits = Number(amount_e8s) / Number(baseUnitMultiplier);
    const value = amountInWholeUnits * price;
    
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleSort = (field: SortField) => {
    setSortConfig(prevConfig => ({
      field,
      direction: prevConfig.field === field && prevConfig.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const getSortedStats = () => {
    return [...userTokenStats].sort((a, b) => {
      const [tokenIdA, statsA] = a;
      const [tokenIdB, statsB] = b;

      const metadataA = tokenMetadata[tokenIdA];
      const metadataB = tokenMetadata[tokenIdB];

      const multiplier = sortConfig.direction === 'desc' ? -1 : 1;

      switch (sortConfig.field) {
        case 'token':
          const symbolA = metadataA?.symbol || tokenIdA;
          const symbolB = metadataB?.symbol || tokenIdB;
          return multiplier * symbolA.localeCompare(symbolB);

        case 'swaps':
          const swapsA = Number(statsA.swaps_as_input_icpswap) + 
                        Number(statsA.swaps_as_input_kong) + 
                        Number(statsA.swaps_as_input_split) +
                        Number(statsA.swaps_as_output_icpswap) + 
                        Number(statsA.swaps_as_output_kong) + 
                        Number(statsA.swaps_as_output_split);
          const swapsB = Number(statsB.swaps_as_input_icpswap) + 
                        Number(statsB.swaps_as_input_kong) + 
                        Number(statsB.swaps_as_input_split) +
                        Number(statsB.swaps_as_output_icpswap) + 
                        Number(statsB.swaps_as_output_kong) + 
                        Number(statsB.swaps_as_output_split);
          return multiplier * (swapsA - swapsB);

        case 'volume':
          const volumeA = (() => {
            const totalVolume = BigInt(statsA.input_volume_e8s_icpswap) + 
                              BigInt(statsA.input_volume_e8s_kong) + 
                              BigInt(statsA.output_volume_e8s_icpswap) + 
                              BigInt(statsA.output_volume_e8s_kong);
            const price = tokenUSDPrices[tokenIdA];
            if (!price || !metadataA) return 0;
            const decimals = metadataA.decimals ?? 8;
            const baseUnitMultiplier = BigInt(10) ** BigInt(decimals);
            const amountInWholeUnits = Number(totalVolume) / Number(baseUnitMultiplier);
            return amountInWholeUnits * price;
          })();
          const volumeB = (() => {
            const totalVolume = BigInt(statsB.input_volume_e8s_icpswap) + 
                              BigInt(statsB.input_volume_e8s_kong) + 
                              BigInt(statsB.output_volume_e8s_icpswap) + 
                              BigInt(statsB.output_volume_e8s_kong);
            const price = tokenUSDPrices[tokenIdB];
            if (!price || !metadataB) return 0;
            const decimals = metadataB.decimals ?? 8;
            const baseUnitMultiplier = BigInt(10) ** BigInt(decimals);
            const amountInWholeUnits = Number(totalVolume) / Number(baseUnitMultiplier);
            return amountInWholeUnits * price;
          })();
          return multiplier * (volumeA - volumeB);

        case 'savings':
          const savingsUsdA = (() => {
            const savingsA = tokenSavingsStats[tokenIdA];
            if (!savingsA || !metadataA) return 0;
            const totalSavings = savingsA.icpswap_savings_e8s + 
                               savingsA.kong_savings_e8s + 
                               savingsA.split_savings_e8s;
            const price = tokenUSDPrices[tokenIdA];
            if (!price) return 0;
            const decimals = metadataA.decimals ?? 8;
            const baseUnitMultiplier = BigInt(10) ** BigInt(decimals);
            const amountInWholeUnits = Number(totalSavings) / Number(baseUnitMultiplier);
            return amountInWholeUnits * price;
          })();
          const savingsUsdB = (() => {
            const savingsB = tokenSavingsStats[tokenIdB];
            if (!savingsB || !metadataB) return 0;
            const totalSavings = savingsB.icpswap_savings_e8s + 
                               savingsB.kong_savings_e8s + 
                               savingsB.split_savings_e8s;
            const price = tokenUSDPrices[tokenIdB];
            if (!price) return 0;
            const decimals = metadataB.decimals ?? 8;
            const baseUnitMultiplier = BigInt(10) ** BigInt(decimals);
            const amountInWholeUnits = Number(totalSavings) / Number(baseUnitMultiplier);
            return amountInWholeUnits * price;
          })();
          return multiplier * (savingsUsdA - savingsUsdB);

        default:
          return 0;
      }
    });
  };

  const calculateTradingActivity = () => {
    if (!userTokenStats.length) return null;

    let totalSwaps = 0;
    let splitSwaps = 0;
    let icpswapSwaps = 0;
    let kongSwaps = 0;

    userTokenStats.forEach(([_, stats]) => {
      // Count total swaps
      const inputSwaps = Number(stats.swaps_as_input_icpswap) + 
                        Number(stats.swaps_as_input_kong) + 
                        Number(stats.swaps_as_input_split);
      const outputSwaps = Number(stats.swaps_as_output_icpswap) + 
                         Number(stats.swaps_as_output_kong) + 
                         Number(stats.swaps_as_output_split);
      
      // Divide by 2 because each swap is counted twice (once as input, once as output)
      totalSwaps += (inputSwaps + outputSwaps) / 2;
      
      // Count split swaps (divide by 2 for the same reason)
      splitSwaps += (Number(stats.swaps_as_input_split) + Number(stats.swaps_as_output_split)) / 2;
      
      // Count direct swaps (divide by 2 for the same reason)
      icpswapSwaps += (Number(stats.swaps_as_input_icpswap) + Number(stats.swaps_as_output_icpswap)) / 2;
      kongSwaps += (Number(stats.swaps_as_input_kong) + Number(stats.swaps_as_output_kong)) / 2;
    });

    return {
      totalSwaps: Math.floor(totalSwaps),
      splitSwaps: Math.floor(splitSwaps),
      icpswapSwaps: Math.floor(icpswapSwaps),
      kongSwaps: Math.floor(kongSwaps)
    };
  };

  if (!isAuthenticated || !principal) {
    return (
      <div className="me-page">
        <div className="swap-box">
          <div className="wallet-empty-state">
            <FiUser className="empty-icon" />
            <h3>Welcome to Your Profile</h3>
            <p>Please login to view your profile</p>
            <button className="login-button" onClick={login}>
              <FiLogIn className="icon" />
              Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  const LoadingSpinner = () => (
    <div className="loading-spinner">
      <FiLoader />
    </div>
  );

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortConfig.field !== field) {
      return null;
    }
    return sortConfig.direction === 'desc' ? <FiArrowDown className="sort-icon" /> : <FiArrowUp className="sort-icon" />;
  };

  const statisticsContent = (
    <div className="statistics-display">
      {loading ? (
        <LoadingSpinner />
      ) : userTokenStats.length > 0 ? (
        <>
          <div className="trading-activity">
            <div className="total-volume">
              <div className="total-volume-content">
                <span className="total-volume-label">Total Volume</span>
                <span className="total-volume-value">
                  {(() => {
                    const totalUSDVolume = userTokenStats.reduce((sum, [tokenId, stats]) => {
                      const totalVolume = BigInt(stats.input_volume_e8s_icpswap) + 
                                       BigInt(stats.input_volume_e8s_kong) + 
                                       /*BigInt(stats.input_volume_e8s_split) +*/ // Split amounts are already counted in kong and icpswap amounts
                                       BigInt(stats.output_volume_e8s_icpswap) + 
                                       BigInt(stats.output_volume_e8s_kong); // + 
                                       /*BigInt(stats.output_volume_e8s_split);*/ // Split amounts are already counted in kong and icpswap amounts
                      
                      const price = tokenUSDPrices[tokenId];
                      if (price === undefined || loadingUSDPrices[tokenId]) return sum;
                      
                      const metadata = tokenMetadata[tokenId];
                      if (!metadata) return sum;
                      
                      const decimals = metadata.decimals ?? 8;
                      const baseUnitMultiplier = BigInt(10) ** BigInt(decimals);
                      const amountInWholeUnits = Number(totalVolume) / Number(baseUnitMultiplier);
                      return sum + (amountInWholeUnits * price);
                    }, 0);

                    if (Object.values(loadingUSDPrices).some(loading => loading)) {
                      return (
                        <>
                          ${totalUSDVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          <FiLoader className="spinner" />
                        </>
                      );
                    }
                    
                    return `$${totalUSDVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                  })()}
                </span>
              </div>
              <div className="total-volume-content">
                <span className="total-volume-label">Total Savings</span>
                <span className="total-volume-value">
                  {(() => {
                    const totalUSDSavings = userTokenStats.reduce((sum, [tokenId, stats]) => {
                      const savingsStats = tokenSavingsStats[tokenId];
                      if (!savingsStats) return sum;
                      
                      const totalSavings = savingsStats.icpswap_savings_e8s + 
                                         savingsStats.kong_savings_e8s +  
                                         savingsStats.split_savings_e8s;
                                           
                      const price = tokenUSDPrices[tokenId];
                      if (price === undefined || loadingUSDPrices[tokenId]) return sum;
                      
                      const metadata = tokenMetadata[tokenId];
                      if (!metadata) return sum;
                      
                      const decimals = metadata.decimals ?? 8;
                      const baseUnitMultiplier = BigInt(10) ** BigInt(decimals);
                      const amountInWholeUnits = Number(totalSavings) / Number(baseUnitMultiplier);
                      return sum + (amountInWholeUnits * price);
                    }, 0);

                    const totalUSDVolume = userTokenStats.reduce((sum, [tokenId, stats]) => {
                      const totalVolume = BigInt(stats.input_volume_e8s_icpswap) + 
                                       BigInt(stats.input_volume_e8s_kong) + 
                                       BigInt(stats.output_volume_e8s_icpswap) + 
                                       BigInt(stats.output_volume_e8s_kong);
                      
                      const price = tokenUSDPrices[tokenId];
                      if (price === undefined || loadingUSDPrices[tokenId]) return sum;
                      
                      const metadata = tokenMetadata[tokenId];
                      if (!metadata) return sum;
                      
                      const decimals = metadata.decimals ?? 8;
                      const baseUnitMultiplier = BigInt(10) ** BigInt(decimals);
                      const amountInWholeUnits = Number(totalVolume) / Number(baseUnitMultiplier);
                      return sum + (amountInWholeUnits * price);
                    }, 0);

                    const savingsPercentage = totalUSDVolume > 0 ? (totalUSDSavings / totalUSDVolume) * 100 : 0;

                    if (Object.values(loadingUSDPrices).some(loading => loading)) {
                      return (
                        <span className="loading">
                          ${totalUSDSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          {` (${savingsPercentage.toFixed(2)}%)`}
                          <FiLoader className="spinner" />
                        </span>
                      );
                    }
                    
                    return `$${totalUSDSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${savingsPercentage.toFixed(2)}%)`;
                  })()}
                </span>
              </div>
              <button 
                className="expanded-action-button"
                onClick={fetchStats}
                disabled={loading}
                title="Refresh statistics"
              >
                <span className="action-symbol"><FiRefreshCw /></span>
                <span className="action-text">{loading ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            </div>
            <div className="token-statistics-table">
              <table>
                <thead>
                  <tr>
                    <th onClick={() => handleSort('token')} className="sortable">
                      Token <SortIcon field="token" />
                    </th>
                    <th onClick={() => handleSort('swaps')} className="sortable">
                      Total Swaps <SortIcon field="swaps" />
                    </th>
                    <th onClick={() => handleSort('volume')} className="sortable">
                      Total Volume <SortIcon field="volume" />
                    </th>
                    <th onClick={() => handleSort('savings')} className="sortable">
                      Total Savings <SortIcon field="savings" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {getSortedStats().map(([tokenId, stats]) => {
                    const metadata = tokenMetadata[tokenId];
                    const totalSwaps = Number(stats.swaps_as_input_icpswap) + 
                                    Number(stats.swaps_as_input_kong) + 
                                    Number(stats.swaps_as_input_split) +
                                    Number(stats.swaps_as_output_icpswap) + 
                                    Number(stats.swaps_as_output_kong) + 
                                    Number(stats.swaps_as_output_split);
                    const totalVolume = BigInt(stats.input_volume_e8s_icpswap) + 
                                      BigInt(stats.input_volume_e8s_kong) + 
                                      /*BigInt(stats.input_volume_e8s_split) +*/ // Split amounts are already counted in kong and icpswap amounts
                                      BigInt(stats.output_volume_e8s_icpswap) + 
                                      BigInt(stats.output_volume_e8s_kong); // + 
                                      /*BigInt(stats.output_volume_e8s_split);*/ // Split amounts are already counted in kong and icpswap amounts
                    const savingsStats = tokenSavingsStats[tokenId];
                    const totalSavings = savingsStats ? 
                      savingsStats.icpswap_savings_e8s + savingsStats.kong_savings_e8s + savingsStats.split_savings_e8s : 
                      BigInt(0);
                    const isLoadingUSD = loadingUSDPrices[tokenId];
                    const usdValue = tokenUSDPrices[tokenId] !== undefined 
                      ? calculateUSDValue(totalVolume, tokenId)
                      : undefined;
                    const usdSavings = tokenUSDPrices[tokenId] !== undefined 
                      ? calculateUSDValue(totalSavings, tokenId)
                      : undefined;
                    
                    return (
                      <tr key={tokenId}>
                        <td className="token-cell">
                          {metadata && (
                            <img 
                              src={metadata.logo || '/generic_token.svg'}
                              alt={metadata.symbol}
                              className="token-logo"
                              onError={(e) => {
                                const img = e.target as HTMLImageElement;
                                img.src = metadata.symbol === 'ICP' ? '/icp_symbol.svg' : '/generic_token.svg';
                              }}
                            />
                          )}
                          <div className="token-info">
                            <span className="token-symbol">{metadata?.symbol || 'Unknown'}</span>
                          </div>
                        </td>
                        <td>{formatAmount(BigInt(totalSwaps))}</td>
                        <td>
                          {metadata ? formatTokenAmount(totalVolume, tokenId) : formatAmount(totalVolume)}
                          {isLoadingUSD ? (
                            <span className="usd-value">
                              <FiLoader className="spinner" />
                            </span>
                          ) : usdValue !== '-' && (
                            <span className="usd-value"> • {usdValue}</span>
                          )}
                        </td>
                        <td>
                          {metadata ? formatTokenAmount(totalSavings, tokenId) : formatAmount(totalSavings)}
                          {isLoadingUSD ? (
                            <span className="usd-value">
                              <FiLoader className="spinner" />
                            </span>
                          ) : usdSavings !== '-' && (
                            <span className="usd-value">
                              {' • '}{usdSavings}
                              {(() => {
                                const totalVolume = BigInt(stats.input_volume_e8s_icpswap) + 
                                                  BigInt(stats.input_volume_e8s_kong) + 
                                                  BigInt(stats.output_volume_e8s_icpswap) + 
                                                  BigInt(stats.output_volume_e8s_kong);
                                if (totalVolume === 0n) return ' (0.00%)';
                                const savingsPercentage = (Number(totalSavings) / Number(totalVolume)) * 100;
                                return ` (${savingsPercentage.toFixed(2)}%)`;
                              })()}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="activity-grid">
                <div className="activity-card">
                  <h4>Total Swaps</h4>
                  <div className="activity-value">{calculateTradingActivity()?.totalSwaps}</div>
                  <div className="activity-description">All-time swaps</div>
                </div>
                <div className="activity-card">
                  <h4>Split Swaps</h4>
                  <div className="activity-value">{calculateTradingActivity()?.splitSwaps}</div>
                  <div className="activity-description">Multi-DEX swaps</div>
                </div>
                <div className="activity-card">
                  <h4>ICPSwap Swaps</h4>
                  <div className="activity-value">{calculateTradingActivity()?.icpswapSwaps}</div>
                  <div className="activity-description">Direct swaps via ICPSwap</div>
                </div>
                <div className="activity-card">
                  <h4>Kong Swaps</h4>
                  <div className="activity-value">{calculateTradingActivity()?.kongSwaps}</div>
                  <div className="activity-description">Direct swaps via Kong</div>
                </div>
            </div>
          </div>
        </>
      ) : (
        <div className="no-stats">
          No trading activity found.
        </div>
      )}
    </div>
  );

  return (
    <div className="me-page">
      <div className="swap-box">
        <CollapsibleSection title="Profile" icon={<FiUser />} defaultExpanded={false}>
          <div className="principal-display">
            <label>Your Principal ID:</label>
            <div className="principal-value">{principal}</div>
          </div>
        </CollapsibleSection>

        <AchievementsSection />
        <AllocationsSection />

        <CollapsibleSection title="Statistics" icon={<FiBarChart2 />} defaultExpanded={true}>
          <div className="section-header">
            <FiTrendingUp />
            <span>Trades</span>
          </div>
          {statisticsContent}
          <div className="section-header">
            <FiGift />
            <span>Rewards</span>
          </div>
          <div className="token-statistics-table">
            {loadingAllocationStats ? (
              <LoadingSpinner />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Total Allocated</th>
                    <th>Total Claimed</th>
                    <th>Total Fees</th>
                    <th>Total Cuts</th>
                    <th>Allocations</th>
                    <th>Claims</th>
                  </tr>
                </thead>
                <tbody>
                  {userTokenAllocationStats.map(([tokenId, stats]) => {
                    const metadata = tokenMetadata[tokenId];
                    const formattedAllocated = metadata ? formatTokenAmount(stats.total_allocated_e8s, tokenId) : formatAmount(stats.total_allocated_e8s);
                    const formattedClaimed = metadata ? formatTokenAmount(stats.total_claimed_e8s, tokenId) : formatAmount(stats.total_claimed_e8s);
                    const formattedFees = formatTokenAmount(stats.total_fees_paid_e8s, "ryjl3-tyaaa-aaaaa-aaaba-cai"); // ICP
                    const formattedCuts = metadata ? formatTokenAmount(stats.total_cuts_paid_e8s, tokenId) : formatAmount(stats.total_cuts_paid_e8s);
                    const isLoadingUSD = loadingUSDPrices[tokenId];

                    const usdAllocated = tokenUSDPrices[tokenId] !== undefined 
                      ? calculateUSDValue(stats.total_allocated_e8s, tokenId)
                      : undefined;
                    const usdClaimed = tokenUSDPrices[tokenId] !== undefined 
                      ? calculateUSDValue(stats.total_claimed_e8s, tokenId)
                      : undefined;
                    const usdCuts = tokenUSDPrices[tokenId] !== undefined 
                      ? calculateUSDValue(stats.total_cuts_paid_e8s, tokenId)
                      : undefined;

                    return (
                      <tr key={tokenId}>
                        <td className="token-cell">
                          {metadata && (
                            <img 
                              src={metadata.logo || '/generic_token.svg'}
                              alt={metadata.symbol}
                              className="token-logo"
                              onError={(e) => {
                                const img = e.target as HTMLImageElement;
                                img.src = metadata.symbol === 'ICP' ? '/icp_symbol.svg' : '/generic_token.svg';
                              }}
                            />
                          )}
                          <div className="token-info">
                            <span className="token-symbol">{metadata?.symbol || 'Unknown'}</span>
                          </div>
                        </td>
                        <td>
                          {formattedAllocated}
                          {isLoadingUSD ? (
                            <span className="usd-value">
                              <FiLoader className="spinner" />
                            </span>
                          ) : usdAllocated !== '-' && (
                            <span className="usd-value"> • {usdAllocated}</span>
                          )}
                        </td>
                        <td>
                          {formattedClaimed}
                          {isLoadingUSD ? (
                            <span className="usd-value">
                              <FiLoader className="spinner" />
                            </span>
                          ) : usdClaimed !== '-' && (
                            <span className="usd-value"> • {usdClaimed}</span>
                          )}
                        </td>
                        <td>{formattedFees}</td>
                        <td>
                          {formattedCuts}
                          {isLoadingUSD ? (
                            <span className="usd-value">
                              <FiLoader className="spinner" />
                            </span>
                          ) : usdCuts !== '-' && (
                            <span className="usd-value"> • {usdCuts}</span>
                          )}
                        </td>
                        <td>{formatAmount(stats.allocation_count)}</td>
                        <td>{formatAmount(stats.claim_count)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

        </CollapsibleSection>

        <CollapsibleSection title="Settings" icon={<FiSettings />} defaultExpanded={false}>
          <div className="settings-display">
            <div className="setting-item">
              <div className="setting-info">
                <label htmlFor="keepTokensInPool">Keep tokens in ICPSwap Pool</label>
                <p className="setting-description">
                  When enabled, swapped tokens will remain in the ICPSwap pool for faster future swaps.
                  You can view and withdraw these balances in the Pools tab.
                </p>
              </div>
              <div className="setting-control">
                <input
                  type="checkbox"
                  id="keepTokensInPool"
                  checked={keepTokensInPool}
                  onChange={(e) => setKeepTokensInPool(e.target.checked)}
                />
              </div>
            </div>
          </div>
        </CollapsibleSection>        
      </div>
    </div>
  );
};

export default Me; 