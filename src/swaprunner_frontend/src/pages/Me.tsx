import React, { useState, useEffect } from 'react';
import { FiUser, FiLogIn, FiChevronDown, FiChevronUp, FiSettings, FiBarChart2, FiLoader } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { usePool } from '../contexts/PoolContext';
import { statsService, UserTokenStats } from '../services/stats';
import { tokenService } from '../services/token';
import { TokenMetadata } from '../types/token';
import { formatTokenAmount } from '../utils/format';
import '../styles/Me.css';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      if (!isAuthenticated || !principal) return;
      
      try {
        setLoading(true);
        const stats = await statsService.getMyTokenStats();
        setUserTokenStats(stats);

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
                      <th>Token</th>
                      <th>Total Swaps</th>
                      <th>Total Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userTokenStats.map(([tokenId, stats]) => {
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
                          <td>{metadata ? formatTokenAmount(totalVolume, tokenId) : formatAmount(totalVolume)}</td>
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