import { Actor, HttpAgent } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { idlFactory } from '../../../external/icp_swap/icp_swap.did.js';
import { idlFactory as factoryIdlFactory } from '../../../external/icp_swap_factory/icp_swap_factory.did.js';
import { getCachedTokenMetadata } from '../utils/format';

// Constants
const ICP_USDC_POOL_ID = 'mohjv-bqaaa-aaaag-qjyia-cai';
const ICP_DECIMALS = 8;
const USDC_DECIMALS = 6;
const ICP_CANISTER_ID = 'ryjl3-tyaaa-aaaaa-aaaba-cai';
const ICPSWAP_FACTORY_CANISTER = '4mmnk-kiaaa-aaaag-qbllq-cai';
const CACHE_TTL_MS = 60 * 1000; // 1 minute for ICP/USD price
const POOL_CACHE_KEY = 'icpswap_pools';
const TOKEN_PRICE_CACHE_KEY = 'icpswap_token_prices';
const TOKEN_PRICE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for token prices

interface Token {
  address: string;
  standard: string;
}

interface PoolData {
  canisterId: string;  // Always store as string internally
  fee: bigint;
  key: string;
  tickSpacing: number;
  token0: Token;
  token1: Token;
}

interface PriceCache {
  price: number;
  timestamp: number;
}

interface PoolCache {
  pool: PoolData;
  timestamp: number;
}

interface TokenPriceCache {
  [tokenId: string]: PriceCache;
}

interface PoolMetadataResponse {
  err?: { message: string };
  ok?: {
    token0: Token;
    token1: Token;
    sqrtPriceX96: bigint;
    liquidity: bigint;
  };
}

export class PriceService {
  private agent: HttpAgent;
  private poolActor: any;
  private factoryActor: any;
  private priceCache: PriceCache | null = null;
  private poolCache: Map<string, PoolCache> = new Map();
  private tokenPriceCache: TokenPriceCache = {};

  constructor() {
    this.agent = new HttpAgent({
      host: process.env.DFX_NETWORK === 'ic' ? 'https://ic0.app' : 'http://localhost:4943',
    });

    if (process.env.DFX_NETWORK !== 'ic') {
      this.agent.fetchRootKey();
    }

    // Create actor for ICP/USDC pool
    this.poolActor = Actor.createActor(idlFactory, {
      agent: this.agent,
      canisterId: ICP_USDC_POOL_ID,
    });

    // Create actor for ICPSwap factory
    this.factoryActor = Actor.createActor(factoryIdlFactory, {
      agent: this.agent,
      canisterId: ICPSWAP_FACTORY_CANISTER,
    });

    // Load cached data from localStorage
    this.loadPoolCache();
    this.loadTokenPriceCache();
  }

  private loadPoolCache(): void {
    try {
      const cachedPools = localStorage.getItem(POOL_CACHE_KEY);
      if (cachedPools) {
        const parsed = JSON.parse(cachedPools);
        Object.entries(parsed).forEach(([key, value]: [string, any]) => {
          this.poolCache.set(key, {
            pool: value.pool,
            timestamp: value.timestamp
          });
        });
      }
    } catch (error) {
      console.warn('Failed to load pool cache from localStorage:', error);
    }
  }

  private savePoolCache(): void {
    try {
      const cacheObject: { [key: string]: PoolCache } = {};
      this.poolCache.forEach((value, key) => {
        cacheObject[key] = value;
      });
      localStorage.setItem(POOL_CACHE_KEY, JSON.stringify(cacheObject, (_, value) => {
        if (typeof value === 'bigint') return value.toString();
        // Handle Principal objects by converting them to strings
        if (value && typeof value === 'object' && '__principal__' in value) {
          return value.toString();
        }
        return value;
      }));
    } catch (error) {
      console.warn('Failed to save pool cache to localStorage:', error);
    }
  }

  private loadTokenPriceCache(): void {
    try {
      const cachedPrices = localStorage.getItem(TOKEN_PRICE_CACHE_KEY);
      if (cachedPrices) {
        this.tokenPriceCache = JSON.parse(cachedPrices);
        
        // Clean up expired entries
        const now = Date.now();
        let hasExpired = false;
        
        Object.entries(this.tokenPriceCache).forEach(([tokenId, cache]) => {
          if (now - cache.timestamp > TOKEN_PRICE_CACHE_TTL_MS) {
            delete this.tokenPriceCache[tokenId];
            hasExpired = true;
          }
        });

        // If we removed any expired entries, update localStorage
        if (hasExpired) {
          this.saveTokenPriceCache();
        }
      }
    } catch (error) {
      console.warn('Failed to load token price cache from localStorage:', error);
      this.tokenPriceCache = {};
    }
  }

  private saveTokenPriceCache(): void {
    try {
      localStorage.setItem(TOKEN_PRICE_CACHE_KEY, JSON.stringify(this.tokenPriceCache));
    } catch (error) {
      console.warn('Failed to save token price cache to localStorage:', error);
    }
  }

  private validateAndNormalizePrincipal(principal: string | Principal): string {
    try {
      // If it's already a Principal, convert to string
      if (principal instanceof Principal) {
        return principal.toString();
      }
      // If it's a string, validate it by attempting to create a Principal
      const validatedPrincipal = Principal.fromText(String(principal));
      return validatedPrincipal.toString();
    } catch (error) {
      console.error('Invalid Principal:', principal, error);
      throw new Error(`Invalid Principal ID: ${principal}`);
    }
  }

  /**
   * Gets the ICPSwap pool for ICP/X pair where X is the specified token.
   * The pool data is cached indefinitely (until page refresh) and persisted in localStorage.
   * @param tokenCanisterId The canister ID of the token to pair with ICP
   * @returns The pool data for the ICP/token pair
   */
  async getICPPool(tokenCanisterId: string): Promise<PoolData> {
    // Generate cache key
    const cacheKey = `icp-${tokenCanisterId}`;

    // Check cache first
    const cached = this.poolCache.get(cacheKey);
    if (cached) {
      console.log('Returning cached pool data for:', cacheKey);
      return cached.pool;
    }

    try {
      console.log('Fetching pool data for ICP/', tokenCanisterId);

      // Create token objects, ensuring ICP is token0 if its address is lexicographically smaller
      const icpToken: Token = { address: ICP_CANISTER_ID, standard: 'ICRC1' };
      const otherToken: Token = { address: tokenCanisterId, standard: 'ICRC1' };

      // Sort tokens to match ICPSwap's ordering
      const [token0, token1] = icpToken.address.toLowerCase() < otherToken.address.toLowerCase()
        ? [icpToken, otherToken]
        : [otherToken, icpToken];

      // Get pool from factory
      const response = await this.factoryActor.getPool({
        token0,
        token1,
        fee: BigInt(3000), // Default 0.3% fee
      });

      if ('err' in response) {
        throw new Error(response.err.message || 'Failed to fetch pool data');
      }

      const poolData = response.ok;
      console.log('Found pool:', poolData);

      // Validate and normalize the canisterId
      const normalizedCanisterId = this.validateAndNormalizePrincipal(poolData.canisterId);

      // Create the normalized pool data
      const pool: PoolData = {
        ...poolData,
        canisterId: normalizedCanisterId
      };

      // Cache the result
      this.poolCache.set(cacheKey, {
        pool,
        timestamp: Date.now()
      });

      // Persist to localStorage
      this.savePoolCache();

      return pool;
    } catch (error) {
      console.error('Error fetching ICPSwap pool:', error);
      throw error;
    }
  }

  async getICPUSDPrice(): Promise<number> {
    // Check cache first
    if (this.priceCache) {
      const age = Date.now() - this.priceCache.timestamp;
      if (age < CACHE_TTL_MS) {
        return this.priceCache.price;
      }
    }

    try {
      const response = await this.poolActor.metadata();
      if ('err' in response) {
        console.error('Error in metadata response:', response.err);
        throw new Error(response.err.message || 'Failed to fetch pool metadata');
      }

      const metadata = response.ok;
      
      // Check if ICP is token0 or token1
      const isICPToken0 = metadata.token0.address === ICP_CANISTER_ID;
      
      // Calculate price from sqrtPriceX96
      const Q96 = BigInt(2) ** BigInt(96);

      const sqrtPrice = Number(metadata.sqrtPriceX96) / Number(Q96);

      let price = sqrtPrice * sqrtPrice;

      // If ICP is token1, we need to invert the price
      if (!isICPToken0) {
        price = 1 / price;
      }

      // Adjust for decimal differences between ICP (8) and USDC (6)
      // Since ICP has more decimals than USDC, we multiply by the difference
      // This is because 1 ICP (10^8 units) = X USDC (10^6 units)
      const decimalAdjustment = 10 ** (ICP_DECIMALS - USDC_DECIMALS);
      price = price * decimalAdjustment;

      // Update cache
      this.priceCache = {
        price,
        timestamp: Date.now()
      };

      return price;
    } catch (error) {
      console.error('Error fetching ICP/USD price:', error);
      throw error;
    }
  }

  /**
   * Gets the price of a token in terms of ICP
   * @param tokenCanisterId The canister ID of the token to get the price for
   * @returns The price of 1 token in ICP
   */
  async getTokenICPPrice(tokenCanisterId: string): Promise<number> {
    // If the token is ICP itself, return 1 (1 ICP = 1 ICP)
    if (tokenCanisterId === ICP_CANISTER_ID) {
      return 1;
    }

    // Check memory cache first
    const cached = this.tokenPriceCache[tokenCanisterId];
    if (cached && (Date.now() - cached.timestamp) < TOKEN_PRICE_CACHE_TTL_MS) {
      console.log('Returning cached token price for:', tokenCanisterId);
      return cached.price;
    }

    try {
      console.log('Fetching price for token:', tokenCanisterId);
      
      // Get the pool for this token/ICP pair
      const pool = await this.getICPPool(tokenCanisterId);
      
      // Create actor for this pool - canisterId is already validated and normalized
      const poolActor = Actor.createActor(idlFactory, {
        agent: this.agent,
        canisterId: pool.canisterId,
      });

      // Get pool metadata
      const response = await poolActor.metadata() as PoolMetadataResponse;
      if (!response.ok || response.err) {
        throw new Error(response.err?.message || 'Failed to fetch pool metadata');
      }

      const metadata = response.ok;
      console.log('Pool metadata:', {
        token0: metadata.token0,
        token1: metadata.token1,
        sqrtPriceX96: metadata.sqrtPriceX96.toString(),
        liquidity: metadata.liquidity.toString()
      });

      // Check if our token is token0 or token1
      const isTokenToken0 = metadata.token0.address === tokenCanisterId;
      console.log('Token position:', {
        isTokenToken0,
        token0Address: metadata.token0.address,
        token1Address: metadata.token1.address
      });

      // Calculate price from sqrtPriceX96
      const Q96 = BigInt(2) ** BigInt(96);
      const sqrtPrice = Number(metadata.sqrtPriceX96) / Number(Q96);
      let price = sqrtPrice * sqrtPrice;

      // If our token is token1, we need to invert the price
      if (!isTokenToken0) {
        price = 1 / price;
      }

      // Get token decimals from metadata cache
      const tokenMetadata = getCachedTokenMetadata(tokenCanisterId);
      const tokenDecimals = tokenMetadata?.decimals ?? 8; // Default to 8 if not found
      console.log('Token decimals from cache:', tokenDecimals);

      const decimalAdjustment = 10 ** (tokenDecimals - ICP_DECIMALS);
      price = price * decimalAdjustment;

      console.log('Final price calculation:', {
        rawPrice: price,
        tokenDecimals,
        ICP_DECIMALS,
        decimalAdjustment
      });

      // Cache the result in memory and localStorage
      this.tokenPriceCache[tokenCanisterId] = {
        price,
        timestamp: Date.now()
      };
      this.saveTokenPriceCache();

      return price;
    } catch (error) {
      console.error('Error fetching token price:', error);
      throw error;
    }
  }

  /**
   * Gets the price of a token in USD, using cached ICP/USD and token/ICP prices when available
   * @param tokenCanisterId The canister ID of the token to get the price for
   * @returns The price of 1 token in USD
   */
  async getTokenUSDPrice(tokenCanisterId: string): Promise<number> {
    try {
      // Get both prices in parallel since they use independent caches
      const [tokenICPPrice, icpUSDPrice] = await Promise.all([
        this.getTokenICPPrice(tokenCanisterId),
        this.getICPUSDPrice()
      ]);

      return tokenICPPrice * icpUSDPrice;

    } catch (error) {
      console.error('Error calculating token USD price:', error);
      throw error;
    }
  }

  // Helper method to clear all caches
  clearAllCaches(): void {
    console.log('Clearing all caches');
    this.priceCache = null;
    this.poolCache.clear();
    this.tokenPriceCache = {};
    localStorage.removeItem(POOL_CACHE_KEY);
    localStorage.removeItem(TOKEN_PRICE_CACHE_KEY);
  }
}

// Export singleton instance
export const priceService = new PriceService(); 