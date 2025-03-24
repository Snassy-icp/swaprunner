import { useEffect, useState } from 'react';
import { statsService, GlobalStats, TokenStats, UserStats } from '../services/stats';
import { authService } from '../services/auth';
import { adminService } from '../services/admin';
import { tokenService } from '../services/token';
import { TokenMetadata } from '../types/token';
import { formatTokenAmount } from '../utils/format';
import '../styles/Stats.css';

export function Stats() {
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [tokenStats, setTokenStats] = useState<[string, TokenStats][]>([]);
  const [userStats, setUserStats] = useState<[string, UserStats][]>([]);
  const [userLogins, setUserLogins] = useState<[string, bigint][]>([]);
  const [uniqueUsers, setUniqueUsers] = useState<bigint>(0n);
  const [uniqueTraders, setUniqueTraders] = useState<bigint>(0n);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, TokenMetadata>>({});

  const fetchStats = async () => {
    console.log('Stats page: Starting to fetch statistics');
    try {
      setLoading(true);
      setError(null);

      try {
        console.log('Stats page: Fetching all stats in parallel');
        const [
          globalStatsResult, 
          tokenStatsResult, 
          userStatsResult,
          userLoginsResult,
          uniqueUsersResult,
          uniqueTradersResult
        ] = await Promise.all([
          statsService.getGlobalStats(),
          statsService.getAllTokenStats(),
          statsService.getAllUserStats(),
          statsService.getAllUserLogins(),
          statsService.getUniqueUserCount(),
          statsService.getUniqueTraderCount(),
        ]);

        console.log('Stats page: Successfully fetched all stats');
        console.log('Stats page: Setting state with fetched data');
        setGlobalStats(globalStatsResult);
        setTokenStats(tokenStatsResult);
        setUserStats(userStatsResult);
        setUserLogins(userLoginsResult);
        setUniqueUsers(uniqueUsersResult);
        setUniqueTraders(uniqueTradersResult);
      } catch (err) {
        console.error('Stats page: Failed to fetch stats:', err);
        setError('Failed to fetch statistics');
      }
    } finally {
      console.log('Stats page: Finished fetching stats, setting loading to false');
      setLoading(false);
    }
  };

  const loadTokenMetadata = async () => {
    console.log('Loading metadata for tokens:', tokenStats.map(([id]) => id));
    const metadataPromises = tokenStats.map(async ([tokenId]) => {
      try {
        console.log('Fetching metadata for token:', tokenId);
        const metadata = await tokenService.getMetadataWithLogo(tokenId);
        console.log('Received metadata for token:', tokenId, metadata);
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
    const init = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const adminStatus = await adminService.isAdmin();
        setIsAdmin(adminStatus);
        
        if (adminStatus) {
          await fetchStats();
        } else {
          setError('You do not have admin access.');
        }
      } catch (err) {
        console.error('Error initializing stats page:', err);
        setError(err instanceof Error ? err.message : 'Failed to load stats data');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  useEffect(() => {
    console.log('TokenStats changed, length:', tokenStats.length);
    if (tokenStats.length > 0) {
      loadTokenMetadata();
    }
  }, [tokenStats]);

  const formatAmount = (amount: bigint): string => {
    return Number(amount).toLocaleString();
  };

  if (loading) {
    console.log('Stats page: Rendering loading state');
    return <div>Loading statistics...</div>;
  }
  
  if (error) {
    console.log('Stats page: Rendering error state:', error);
    return <div className="error-message">{error}</div>;
  }

  if (!isAdmin) {
    return <div className="error-message">You do not have admin access.</div>;
  }

  console.log('Stats page: Rendering statistics');
  return (
    <div className="stats-container">
      <h1>Swaprunner.com Statistics</h1>

      {/* User Activity Overview */}
      <section>
        <h2>User Activity</h2>
        <div className="stats-grid">
          <div>
            <h3>Unique Users</h3>
            <p>{formatAmount(uniqueUsers)}</p>
            <span className="stat-description">Total unique logged-in users</span>
          </div>
          <div>
            <h3>Unique Traders</h3>
            <p>{formatAmount(uniqueTraders)}</p>
            <span className="stat-description">Users who have made trades</span>
          </div>
        </div>
      </section>

      {/* Global Stats */}
      <section>
        <h2>Global Statistics</h2>
        {globalStats && (
          <div className="stats-grid">
            <div>
              <h3>Total Swaps</h3>
              <p>{formatAmount(globalStats.total_swaps)}</p>
            </div>
            <div>
              <h3>ICPSwap Swaps</h3>
              <p>{formatAmount(globalStats.icpswap_swaps)}</p>
            </div>
            <div>
              <h3>Kong Swaps</h3>
              <p>{formatAmount(globalStats.kong_swaps)}</p>
            </div>
            <div>
              <h3>Split Swaps</h3>
              <p>{formatAmount(globalStats.split_swaps)}</p>
            </div>
            <div>
              <h3>Total Sends</h3>
              <p>{formatAmount(globalStats.total_sends)}</p>
            </div>
            <div>
              <h3>Total Deposits</h3>
              <p>{formatAmount(globalStats.total_deposits)}</p>
            </div>
            <div>
              <h3>Total Withdrawals</h3>
              <p>{formatAmount(globalStats.total_withdrawals)}</p>
            </div>
          </div>
        )}
      </section>

      {/* Token Stats */}
      <section>
        <h2>Token Statistics</h2>
        {(console.log('Current token metadata:', tokenMetadata), null)}
        <table>
          <thead>
            <tr>
              <th>Token</th>
              <th>Total Swaps</th>
              <th>ICPSwap Swaps</th>
              <th>Kong Swaps</th>
              <th>Split Swaps</th>
              <th>Total Sends</th>
              <th>Sends Volume</th>
              <th>Total Deposits</th>
              <th>Deposits Volume</th>
              <th>Total Withdrawals</th>
              <th>Withdrawals Volume</th>
              <th>Total Volume</th>
            </tr>
          </thead>
          <tbody>
            {tokenStats.map(([tokenId, stats]) => {
              const metadata = tokenMetadata[tokenId];
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
                      <span className="token-id">{tokenId}</span>
                    </div>
                  </td>
                  <td>{formatAmount(stats.total_swaps)}</td>
                  <td>{formatAmount(stats.icpswap_swaps)}</td>
                  <td>{formatAmount(stats.kong_swaps)}</td>
                  <td>{formatAmount(stats.split_swaps)}</td>
                  <td>{formatAmount(stats.total_sends)}</td>
                  <td>
                    {metadata ? (
                      formatTokenAmount(stats.sends_volume_e8s, tokenId)
                    ) : (
                      formatAmount(stats.sends_volume_e8s)
                    )}
                  </td>
                  <td>{formatAmount(stats.total_deposits)}</td>
                  <td>
                    {metadata ? (
                      formatTokenAmount(stats.deposits_volume_e8s, tokenId)
                    ) : (
                      formatAmount(stats.deposits_volume_e8s)
                    )}
                  </td>
                  <td>{formatAmount(stats.total_withdrawals)}</td>
                  <td>
                    {metadata ? (
                      formatTokenAmount(stats.withdrawals_volume_e8s, tokenId)
                    ) : (
                      formatAmount(stats.withdrawals_volume_e8s)
                    )}
                  </td>
                  <td>
                    {metadata ? (
                      formatTokenAmount(stats.volume_e8s, tokenId)
                    ) : (
                      formatAmount(stats.volume_e8s)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* User Stats */}
      <section>
        <h2>User Statistics</h2>
        <table>
          <thead>
            <tr>
              <th>User Principal</th>
              <th>Total Swaps</th>
              <th>ICPSwap Swaps</th>
              <th>Kong Swaps</th>
              <th>Split Swaps</th>
              <th>Total Sends</th>
              <th>Total Deposits</th>
              <th>Total Withdrawals</th>
            </tr>
          </thead>
          <tbody>
            {userStats.map(([principal, stats]) => (
              <tr key={principal}>
                <td>{principal}</td>
                <td>{formatAmount(stats.total_swaps)}</td>
                <td>{formatAmount(stats.icpswap_swaps)}</td>
                <td>{formatAmount(stats.kong_swaps)}</td>
                <td>{formatAmount(stats.split_swaps)}</td>
                <td>{formatAmount(stats.total_sends)}</td>
                <td>{formatAmount(stats.total_deposits)}</td>
                <td>{formatAmount(stats.total_withdrawals)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* User Login Stats */}
      <section>
        <h2>User Login Statistics</h2>
        <table>
          <thead>
            <tr>
              <th>User Principal</th>
              <th>Login Count</th>
            </tr>
          </thead>
          <tbody>
            {userLogins.map(([principal, count]) => (
              <tr key={principal}>
                <td>{principal}</td>
                <td>{formatAmount(count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <button 
        onClick={() => {
          console.log('Stats page: Manual refresh requested');
          fetchStats();
        }} 
        className="refresh-button"
      >
        Refresh Statistics
      </button>
    </div>
  );
} 