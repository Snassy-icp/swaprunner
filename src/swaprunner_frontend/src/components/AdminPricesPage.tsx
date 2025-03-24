import React, { useState, useEffect } from 'react';
import { priceService } from '../services/price';
import { authService } from '../services/auth';
import { adminService } from '../services/admin';
import '../styles/AdminPricesPage.css';

interface PoolTestResult {
  tokenId: string;
  pool?: {
    canisterId: string;
    token0Address: string;
    token1Address: string;
    token0Symbol: string;
    token1Symbol: string;
  };
  error?: string;
  timestamp: number;
}

interface PriceTestResult {
  tokenId: string;
  icpPrice?: number;
  usdPrice?: number;
  error?: string;
  timestamp: number;
  fromCache: boolean;
}

export const AdminPricesPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenId, setTokenId] = useState('');
  const [icpPrice, setIcpPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [poolTestResults, setPoolTestResults] = useState<PoolTestResult[]>([]);
  const [priceTestResults, setPriceTestResults] = useState<PriceTestResult[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [priceTestLoading, setPriceTestLoading] = useState(false);
  const [priceTokenId, setPriceTokenId] = useState('');

  useEffect(() => {
    const init = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const adminStatus = await adminService.isAdmin();
        setIsAdmin(adminStatus);
      } catch (err) {
        console.error('Error initializing admin prices page:', err);
        setError(err instanceof Error ? err.message : 'Failed to load admin data');
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, []);

  const handleGetICPPrice = async () => {
    try {
      setPriceLoading(true);
      setPriceError(null);
      const price = await priceService.getICPUSDPrice();
      setIcpPrice(price);
    } catch (err) {
      setPriceError(err instanceof Error ? err.message : 'Failed to fetch ICP price');
      console.error('Failed to get ICP price:', err);
    } finally {
      setPriceLoading(false);
    }
  };

  const handleTestPool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenId.trim()) return;

    try {
      setPoolLoading(true);
      setError(null);
      
      const pool = await priceService.getICPPool(tokenId.trim());
      
      setPoolTestResults(prev => [{
        tokenId: tokenId.trim(),
        pool: {
          canisterId: pool.canisterId.toString(),
          token0Address: pool.token0.address.toString(),
          token1Address: pool.token1.address.toString(),
          token0Symbol: pool.token0.address.toString() === tokenId.trim() ? 'TOKEN' : 'ICP',
          token1Symbol: pool.token1.address.toString() === tokenId.trim() ? 'TOKEN' : 'ICP',
        },
        timestamp: Date.now()
      }, ...prev]);
      
      setTokenId('');
    } catch (err) {
      setPoolTestResults(prev => [{
        tokenId: tokenId.trim(),
        error: err instanceof Error ? err.message : 'Failed to fetch pool',
        timestamp: Date.now()
      }, ...prev]);
      console.error('Failed to test pool:', err);
    } finally {
      setPoolLoading(false);
    }
  };

  const handleTestTokenPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!priceTokenId.trim()) return;

    try {
      setPriceTestLoading(true);
      setError(null);

      const startTime = Date.now();
      const [icpPrice, usdPrice] = await Promise.all([
        priceService.getTokenICPPrice(priceTokenId.trim()),
        priceService.getTokenUSDPrice(priceTokenId.trim())
      ]);
      const endTime = Date.now();
      const fromCache = endTime - startTime < 100; // Assume cached if response is very fast
      
      setPriceTestResults(prev => [{
        tokenId: priceTokenId.trim(),
        icpPrice,
        usdPrice,
        timestamp: Date.now(),
        fromCache
      }, ...prev]);
      
      setPriceTokenId('');
    } catch (err) {
      setPriceTestResults(prev => [{
        tokenId: priceTokenId.trim(),
        error: err instanceof Error ? err.message : 'Failed to fetch price',
        timestamp: Date.now(),
        fromCache: false
      }, ...prev]);
      console.error('Failed to test price:', err);
    } finally {
      setPriceTestLoading(false);
    }
  };

  const handleClearCaches = () => {
    priceService.clearAllCaches();
    setPoolTestResults([]);
    setPriceTestResults([]);
  };

  if (isLoading) {
    return (
      <div className="admin-prices-page">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="admin-prices-page">
        <div className="error-message">You do not have admin access.</div>
      </div>
    );
  }

  return (
    <div className="admin-prices-page">
      <h1>Price Testing</h1>

      <div className="actions-section">
        <button 
          onClick={handleClearCaches}
          className="clear-cache-button"
        >
          Clear All Caches
        </button>
      </div>

      <div className="test-section">
        <h2>ICP/USDC Price Test</h2>
        <div className="price-display">
          {icpPrice !== null && (
            <div>Current ICP Price: ${icpPrice.toFixed(2)}</div>
          )}
          {priceError && (
            <div className="error-message">{priceError}</div>
          )}
          <button 
            onClick={handleGetICPPrice}
            disabled={priceLoading}
            className="test-button"
          >
            {priceLoading ? 'Loading...' : 'Get ICP Price'}
          </button>
        </div>
      </div>

      <div className="test-section">
        <h2>Token/ICP Price Test</h2>
        <form onSubmit={handleTestTokenPrice} className="pool-test-form">
          <input
            type="text"
            value={priceTokenId}
            onChange={(e) => setPriceTokenId(e.target.value)}
            placeholder="Enter token canister ID"
            className="token-input"
            disabled={priceTestLoading}
          />
          <button 
            type="submit" 
            className="test-button"
            disabled={priceTestLoading || !priceTokenId.trim()}
          >
            {priceTestLoading ? 'Loading...' : 'Test Price'}
          </button>
        </form>

        <div className="test-results">
          <h3>Price Test Results</h3>
          {priceTestResults.length === 0 ? (
            <div className="no-results">No tests run yet</div>
          ) : (
            <div className="results-list">
              {priceTestResults.map((result) => (
                <div key={`${result.tokenId}-${result.timestamp}`} className="result-item">
                  <div className="result-header">
                    <span className="token-id">{result.tokenId}</span>
                    <span className="timestamp">
                      {new Date(result.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  {result.error ? (
                    <div className="error-message">{result.error}</div>
                  ) : (
                    <div className="price-info">
                      <div className="prices">
                        <div>ICP Price: {result.icpPrice?.toFixed(8)} ICP</div>
                        <div>USD Price: ${result.usdPrice?.toFixed(2)}</div>
                      </div>
                      <div className={`cache-status ${result.fromCache ? 'cached' : 'fresh'}`}>
                        {result.fromCache ? '(Cached)' : '(Fresh)'}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="test-section">
        <h2>ICP Pool Test</h2>
        <form onSubmit={handleTestPool} className="pool-test-form">
          <input
            type="text"
            value={tokenId}
            onChange={(e) => setTokenId(e.target.value)}
            placeholder="Enter token canister ID"
            className="token-input"
            disabled={poolLoading}
          />
          <button 
            type="submit" 
            className="test-button"
            disabled={poolLoading || !tokenId.trim()}
          >
            {poolLoading ? 'Loading...' : 'Test Pool'}
          </button>
        </form>

        <div className="test-results">
          <h3>Pool Test Results</h3>
          {poolTestResults.length === 0 ? (
            <div className="no-results">No tests run yet</div>
          ) : (
            <div className="results-list">
              {poolTestResults.map((result) => (
                <div key={`${result.tokenId}-${result.timestamp}`} className="result-item">
                  <div className="result-header">
                    <span className="token-id">{result.tokenId}</span>
                    <span className="timestamp">
                      {new Date(result.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  {result.error ? (
                    <div className="error-message">{result.error}</div>
                  ) : (
                    <div className="pool-info">
                      <div>Pool ID: {result.pool?.canisterId}</div>
                      <div>Token0: {result.pool?.token0Address} ({result.pool?.token0Symbol})</div>
                      <div>Token1: {result.pool?.token1Address} ({result.pool?.token1Symbol})</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 