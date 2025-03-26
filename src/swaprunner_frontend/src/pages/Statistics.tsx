import { useEffect, useState } from 'react';
import { statsService, GlobalStats, TokenStats, TokenSavingsStats } from '../services/stats';
import { tokenService } from '../services/token';
import { TokenMetadata } from '../types/token';
import { formatTokenAmount } from '../utils/format';
import { priceService } from '../services/price';
import { FiChevronUp, FiChevronDown, FiLoader } from 'react-icons/fi';
import '../styles/Statistics.css';

type SortColumn = 'token' | 'swaps' | 'volume' | 'savings';
type SortDirection = 'asc' | 'desc';

export function Statistics() {
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [tokenStats, setTokenStats] = useState<[string, TokenStats][]>([]);
  const [tokenSavingsStats, setTokenSavingsStats] = useState<Record<string, TokenSavingsStats>>({});
  const [uniqueUsers, setUniqueUsers] = useState<bigint>(0n);
  const [uniqueTraders, setUniqueTraders] = useState<bigint>(0n);
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, TokenMetadata>>({});
  const [tokenUSDPrices, setTokenUSDPrices] = useState<Record<string, number>>({});
  const [loadingUSDPrices, setLoadingUSDPrices] = useState<Record<string, boolean>>({});
  const [sortColumn, setSortColumn] = useState<SortColumn>('swaps');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  // Separate loading states for each section
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingGlobal, setLoadingGlobal] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setError(null);
      setLoadingTokens(true);
      setLoadingUsers(true);
      setLoadingGlobal(true);

      // Fetch token stats and savings stats first
      const [tokenStatsResult, savingsStatsResult] = await Promise.all([
        statsService.getAllTokenStats(),
        statsService.getAllTokenSavingsStats()
      ]);
      
      setTokenStats(tokenStatsResult);
      
      // Convert savings stats array to record for easier lookup
      const savingsRecord: Record<string, TokenSavingsStats> = {};
      savingsStatsResult.forEach(([tokenId, stats]) => {
        savingsRecord[tokenId] = stats;
      });
      setTokenSavingsStats(savingsRecord);
      
      setLoadingTokens(false);
      
      // Fetch other stats in parallel
      const [uniqueUsersResult, uniqueTradersResult, globalStatsResult] = await Promise.all([
        statsService.getUniqueUserCount(),
        statsService.getUniqueTraderCount(),
        statsService.getGlobalStats(),
      ]);

      setUniqueUsers(BigInt(uniqueUsersResult));
      setUniqueTraders(BigInt(uniqueTradersResult));
      setLoadingUsers(false);

      setGlobalStats(globalStatsResult);
      setLoadingGlobal(false);

      // Initialize loading state for all tokens
      const initialLoadingState: Record<string, boolean> = {};
      tokenStatsResult.forEach(([tokenId]) => {
        initialLoadingState[tokenId] = true;
      });
      setLoadingUSDPrices(initialLoadingState);
      
      // Fetch prices for tokens progressively
      for (const [tokenId] of tokenStatsResult) {
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

    } catch (err) {
      console.error('Failed to fetch statistics:', err);
      setError('Failed to fetch statistics');
      setLoadingTokens(false);
      setLoadingUsers(false);
      setLoadingGlobal(false);
    }
  };

  const loadTokenMetadata = async () => {
    const metadataPromises = tokenStats.map(async ([tokenId]) => {
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
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (tokenStats.length > 0) {
      loadTokenMetadata();
    }
  }, [tokenStats]);

  const formatAmount = (amount: bigint | number): string => {
    if (typeof amount === 'bigint') {
      return Number(amount).toLocaleString();
    }
    return amount.toLocaleString();
  };

  const calculateUSDValueNumber = (amount_e8s: bigint, tokenId: string): number => {
    const price = tokenUSDPrices[tokenId];
    if (!price) return 0;
    
    const metadata = tokenMetadata[tokenId];
    if (!metadata) return 0;
    
    const decimals = metadata.decimals ?? 8;
    const baseUnitMultiplier = BigInt(10) ** BigInt(decimals);
    const amountInWholeUnits = Number(amount_e8s) / Number(baseUnitMultiplier);
    return amountInWholeUnits * price;
  };

  const calculateUSDValue = (amount_e8s: bigint, tokenId: string): string => {
    const value = calculateUSDValueNumber(amount_e8s, tokenId);
    if (value === 0) return '-';
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // If clicking the same column, toggle direction
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // If clicking a new column, set it with default direction
      setSortColumn(column);
      setSortDirection('desc'); // Always default to descending for any column
    }
  };

  const getSortedTokenStats = () => {
    return [...tokenStats].sort(([tokenIdA, statsA], [tokenIdB, statsB]) => {
      const metadataA = tokenMetadata[tokenIdA];
      const metadataB = tokenMetadata[tokenIdB];
      
      let comparison = 0;
      switch (sortColumn) {
        case 'token':
          const symbolA = metadataA?.symbol || 'Unknown';
          const symbolB = metadataB?.symbol || 'Unknown';
          comparison = symbolA.localeCompare(symbolB);
          break;
        case 'swaps':
          comparison = Number(statsA.total_swaps - statsB.total_swaps);
          break;
        case 'volume':
          const valueA = calculateUSDValueNumber(statsA.volume_e8s, tokenIdA);
          const valueB = calculateUSDValueNumber(statsB.volume_e8s, tokenIdB);
          comparison = valueA - valueB;
          break;
        case 'savings':
          const savingsA = tokenSavingsStats[tokenIdA];
          const savingsB = tokenSavingsStats[tokenIdB];
          const totalSavingsA = savingsA ? 
            Number(savingsA.icpswap_savings_e8s + savingsA.kong_savings_e8s + savingsA.split_savings_e8s) : 0;
          const totalSavingsB = savingsB ? 
            Number(savingsB.icpswap_savings_e8s + savingsB.kong_savings_e8s + savingsB.split_savings_e8s) : 0;
          comparison = totalSavingsA - totalSavingsB;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  };

  const sortedTokenStats = getSortedTokenStats();

  const LoadingSpinner = () => (
    <div className="loading-spinner">
      <FiLoader />
    </div>
  );

  if (loadingTokens && loadingUsers && loadingGlobal) {
    return <LoadingSpinner />;
  }
  
  if (error) {
    return <div className="error-message">{error}</div>;
  }

  // Calculate total USD volume only from loaded prices
  const totalUSDVolume = sortedTokenStats.reduce((sum, [tokenId, stats]) => {
    const price = tokenUSDPrices[tokenId];
    if (price === undefined || loadingUSDPrices[tokenId]) return sum;
    return sum + calculateUSDValueNumber(stats.volume_e8s, tokenId);
  }, 0);

  const formatUSDValue = (value: number): string => {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="statistics-container">
      {/* Token Stats */}
      <section className="statistics-section">
        <h2>Trading Statistics</h2>
        {!loadingTokens && (
          <div className="total-volume">
            <span className="total-volume-label">Total Volume</span>
            <span className="total-volume-value">
              {Object.values(loadingUSDPrices).some(loading => loading) ? (
                <span className="loading">
                  {formatUSDValue(totalUSDVolume)}
                  <FiLoader className="spinner" />
                </span>
              ) : (
                formatUSDValue(totalUSDVolume)
              )}
            </span>
          </div>
        )}
        {!loadingTokens && (
          <div className="total-volume">
            <span className="total-volume-label">Total Savings</span>
            <span className="total-volume-value">
              {(() => {
                const totalUSDSavings = sortedTokenStats.reduce((sum, [tokenId, _]) => {
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

                if (Object.values(loadingUSDPrices).some(loading => loading)) {
                  return (
                    <span className="loading">
                      {formatUSDValue(totalUSDSavings)}
                      <FiLoader className="spinner" />
                    </span>
                  );
                }
                
                return formatUSDValue(totalUSDSavings);
              })()}
            </span>
          </div>
        )}
        <div className="token-statistics-table">
          {loadingTokens ? (
            <LoadingSpinner />
          ) : (
            <table>
              <thead>
                <tr>
                  <th onClick={() => handleSort('token')}>
                    Token
                    {sortColumn === 'token' && (
                      <span className="sort-icon">
                        {sortDirection === 'asc' ? <FiChevronUp /> : <FiChevronDown />}
                      </span>
                    )}
                  </th>
                  <th onClick={() => handleSort('swaps')}>
                    Total Swaps
                    {sortColumn === 'swaps' && (
                      <span className="sort-icon">
                        {sortDirection === 'asc' ? <FiChevronUp /> : <FiChevronDown />}
                      </span>
                    )}
                  </th>
                  <th onClick={() => handleSort('volume')}>
                    Total Volume
                    {sortColumn === 'volume' && (
                      <span className="sort-icon">
                        {sortDirection === 'asc' ? <FiChevronUp /> : <FiChevronDown />}
                      </span>
                    )}
                  </th>
                  <th onClick={() => handleSort('savings')}>
                    Total Savings
                    {sortColumn === 'savings' && (
                      <span className="sort-icon">
                        {sortDirection === 'asc' ? <FiChevronUp /> : <FiChevronDown />}
                      </span>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedTokenStats.map(([tokenId, stats]) => {
                  const metadata = tokenMetadata[tokenId];
                  const formattedTokenAmount = metadata ? formatTokenAmount(stats.volume_e8s, tokenId) : formatAmount(stats.volume_e8s);
                  const savingsStats = tokenSavingsStats[tokenId];
                  const totalSavings = savingsStats ? 
                    savingsStats.icpswap_savings_e8s + savingsStats.kong_savings_e8s + savingsStats.split_savings_e8s : 
                    0n;
                  const formattedSavingsAmount = metadata ? formatTokenAmount(totalSavings, tokenId) : formatAmount(totalSavings);
                  const isLoadingUSD = loadingUSDPrices[tokenId];
                  const usdValue = tokenUSDPrices[tokenId] !== undefined 
                    ? calculateUSDValue(stats.volume_e8s, tokenId)
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
                      <td>{formatAmount(stats.total_swaps)}</td>
                      <td>
                        {formattedTokenAmount}
                        {isLoadingUSD ? (
                          <span className="usd-value">
                            <FiLoader className="spinner" />
                          </span>
                        ) : usdValue !== '-' && (
                          <span className="usd-value"> • {usdValue}</span>
                        )}
                      </td>
                      <td>
                        {formattedSavingsAmount}
                        {isLoadingUSD ? (
                          <span className="usd-value">
                            <FiLoader className="spinner" />
                          </span>
                        ) : usdSavings !== '-' && (
                          <span className="usd-value"> • {usdSavings}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* User Activity Overview */}
      <section className="statistics-section">
        <h2>User Activity</h2>
        <div className="statistics-grid">
          {loadingUsers ? (
            <LoadingSpinner />
          ) : (
            <>
              <div className="statistics-card">
                <h3>Unique Users</h3>
                <p>{formatAmount(uniqueUsers)}</p>
                <span className="statistics-description">Total unique logged-in users</span>
              </div>
              <div className="statistics-card">
                <h3>Active Traders</h3>
                <p>{formatAmount(uniqueTraders)}</p>
                <span className="statistics-description">Users who have made trades</span>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Global statistics */}
      <section className="statistics-section">
        <h2>Trading Activity</h2>
        {loadingGlobal ? (
          <LoadingSpinner />
        ) : (
          globalStats && (
            <div className="statistics-grid">
              <div className="statistics-card">
                <h3>Total Swaps</h3>
                <p>{formatAmount(globalStats.total_swaps)}</p>
                <span className="statistics-description">All-time completed swaps</span>
              </div>
              <div className="statistics-card">
                <h3>Split Swaps</h3>
                <p>{formatAmount(globalStats.split_swaps)}</p>
                <span className="statistics-description">Multi-DEX swaps</span>
              </div>
              <div className="statistics-card">
                <h3>Direct ICPSwap Swaps</h3>
                <p>{formatAmount(globalStats.icpswap_swaps)}</p>
                <span className="statistics-description">Direct swaps via ICPSwap</span>
              </div>
              <div className="statistics-card">
                <h3>Direct Kong Swaps</h3>
                <p>{formatAmount(globalStats.kong_swaps)}</p>
                <span className="statistics-description">Direct swaps via Kong</span>
              </div>
            </div>
          )
        )}
      </section>

      <button 
        onClick={fetchStats} 
        className="refresh-button"
      >
        Refresh Statistics
      </button>
    </div>
  );
} 