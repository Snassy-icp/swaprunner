import React, { useState, useEffect } from 'react';
import { FiUser, FiLogIn, FiChevronDown, FiChevronUp, FiSettings, FiBarChart2, FiLoader, FiArrowUp, FiArrowDown } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { usePool } from '../contexts/PoolContext';
import { statsService, UserTokenStats } from '../services/stats';
import { tokenService } from '../services/token';
import { TokenMetadata } from '../types/token';
import { formatTokenAmount } from '../utils/format';
import { priceService } from '../services/price';
import '../styles/Me.css';

type SortField = 'token' | 'swaps' | 'volume';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ 
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
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, TokenMetadata>>({});
  const [tokenUSDPrices, setTokenUSDPrices] = useState<Record<string, number>>({});
  const [loadingUSDPrices, setLoadingUSDPrices] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: 'volume', direction: 'desc' });

  useEffect(() => {
    const fetchStats = async () => {
      if (!isAuthenticated || !principal) return;
      
      try {
        setLoading(true);
        const stats = await statsService.getMyTokenStats();
        setUserTokenStats(stats);

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
      }
    };

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
          const volumeA = BigInt(statsA.input_volume_e8s_icpswap) + 
                         BigInt(statsA.input_volume_e8s_kong) + 
                         BigInt(statsA.input_volume_e8s_split) +
                         BigInt(statsA.output_volume_e8s_icpswap) + 
                         BigInt(statsA.output_volume_e8s_kong) + 
                         BigInt(statsA.output_volume_e8s_split);
          const volumeB = BigInt(statsB.input_volume_e8s_icpswap) + 
                         BigInt(statsB.input_volume_e8s_kong) + 
                         BigInt(statsB.input_volume_e8s_split) +
                         BigInt(statsB.output_volume_e8s_icpswap) + 
                         BigInt(statsB.output_volume_e8s_kong) + 
                         BigInt(statsB.output_volume_e8s_split);
          return multiplier * (volumeA > volumeB ? 1 : volumeA < volumeB ? -1 : 0);

        default:
          return 0;
      }
    });
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

  return (
    <div className="me-page">
      <div className="swap-box">
        <CollapsibleSection title="Profile" icon={<FiUser />}>
          <div className="principal-display">
            <label>Your Principal ID:</label>
            <div className="principal-value">{principal}</div>
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

        <CollapsibleSection title="Statistics" icon={<FiBarChart2 />} defaultExpanded={false}>
          <div className="statistics-display">
            {loading ? (
              <LoadingSpinner />
            ) : userTokenStats.length > 0 ? (
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
                                        BigInt(stats.input_volume_e8s_split) +
                                        BigInt(stats.output_volume_e8s_icpswap) + 
                                        BigInt(stats.output_volume_e8s_kong) + 
                                        BigInt(stats.output_volume_e8s_split);
                      const isLoadingUSD = loadingUSDPrices[tokenId];
                      const usdValue = tokenUSDPrices[tokenId] !== undefined 
                        ? calculateUSDValue(totalVolume, tokenId)
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
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="no-stats">
                No trading activity found.
              </div>
            )}
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
}; 