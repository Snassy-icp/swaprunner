import React, { createContext, useContext, useState, useEffect } from 'react';
import { Principal } from '@dfinity/principal';
import { backendService } from '../services/backend';
import { tokenService } from '../services/token';
import { ICPSwapExecutionService } from '../services/icpswap_execution';
import { useAuth } from './AuthContext';

interface UserPool {
  canisterId: Principal;
  metadata: [Pool['metadata']] | [];
}

interface PoolBalances {
  token0: {
    deposited: bigint;
    undeposited: bigint;
    isLoading: boolean;
  };
  token1: {
    deposited: bigint;
    undeposited: bigint;
    isLoading: boolean;
  };
}

export interface Pool {
  canisterId: string;
  metadata: {
    fee: bigint;
    key: string;
    sqrtPriceX96: bigint;
    tick: number;
    token0: { address: string; standard: string };
    token1: { address: string; standard: string };
    maxLiquidityPerTick: bigint;
    nextPositionId: bigint;
  } | null;
  balances: PoolBalances | null;
  isLoading: boolean;
}

interface PoolContextType {
  pools: Pool[];
  isLoading: boolean;
  refreshPools: () => Promise<void>;
  refreshPoolBalances: (poolId: string) => Promise<void>;
  keepTokensInPool: boolean;
  setKeepTokensInPool: (value: boolean) => void;
}

const PoolContext = createContext<PoolContextType>({
  pools: [],
  isLoading: false,
  refreshPools: async () => {},
  refreshPoolBalances: async () => {},
  keepTokensInPool: false,
  setKeepTokensInPool: () => {},
});

export const usePool = () => useContext(PoolContext);

export const PoolProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pools, setPools] = useState<Pool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [keepTokensInPool, setKeepTokensInPool] = useState(() => {
    const saved = localStorage.getItem('skipWithdraw');
    return saved ? JSON.parse(saved) : false;
  });
  const { isAuthenticated } = useAuth();

  // Persist keepTokensInPool setting
  useEffect(() => {
    localStorage.setItem('skipWithdraw', JSON.stringify(keepTokensInPool));
  }, [keepTokensInPool]);

  const loadPoolBalances = async (pool: Pool) => {
    if (!pool.metadata) return null;

    const executionService = new ICPSwapExecutionService();
    const balances: PoolBalances = {
      token0: { deposited: BigInt(0), undeposited: BigInt(0), isLoading: true },
      token1: { deposited: BigInt(0), undeposited: BigInt(0), isLoading: true }
    };

    try {
      // Get deposited balances for both tokens
      const depositedBalances = await executionService.getDepositedPoolBalance({
        poolId: pool.canisterId
      });
      
      // Get undeposited balances for token0 and token1
      const [token0Undeposited, token1Undeposited] = await Promise.all([
        executionService.getUndepositedPoolBalance({
          poolId: pool.canisterId,
          tokenId: pool.metadata.token0.address
        }),
        executionService.getUndepositedPoolBalance({
          poolId: pool.canisterId,
          tokenId: pool.metadata.token1.address
        })
      ]);

      balances.token0 = {
        deposited: depositedBalances.balance0_e8s,
        undeposited: token0Undeposited.balance_e8s,
        isLoading: false
      };

      balances.token1 = {
        deposited: depositedBalances.balance1_e8s,
        undeposited: token1Undeposited.balance_e8s,
        isLoading: false
      };

      return balances;
    } catch (error) {
      console.error(`Error loading balances for pool ${pool.canisterId}:`, error);
      return null;
    }
  };

  const loadPools = async () => {
    if (!isAuthenticated) {
      setPools([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const actor = await backendService.getActor();
      const userPools = await actor.get_user_pools();

      // Initialize pools with loading state
      const initialPools = userPools.map(({ canisterId, metadata }: UserPool) => ({
        canisterId: canisterId.toString(),
        metadata: metadata[0] || null,
        balances: null,
        isLoading: false
      }));

      setPools(initialPools);

      // Load balances for each pool
      for (const pool of initialPools) {
        const balances = await loadPoolBalances(pool);
        setPools(current => 
          current.map(p => 
            p.canisterId === pool.canisterId 
              ? { ...p, balances } 
              : p
          )
        );
      }
    } catch (error) {
      console.error('Error loading pools:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load pools when auth state changes
  useEffect(() => {
    loadPools();
  }, [isAuthenticated]);

  const refreshPools = async () => {
    await loadPools();
  };

  const refreshPoolBalances = async (poolId: string) => {
    const pool = pools.find(p => p.canisterId === poolId);
    if (!pool) return;

    const balances = await loadPoolBalances(pool);
    setPools(current => 
      current.map(p => 
        p.canisterId === poolId 
          ? { ...p, balances } 
          : p
      )
    );
  };

  return (
    <PoolContext.Provider value={{ pools, isLoading, refreshPools, refreshPoolBalances, keepTokensInPool, setKeepTokensInPool }}>
      {children}
    </PoolContext.Provider>
  );
}; 