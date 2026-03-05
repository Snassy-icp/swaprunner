# Price Lookup and Caching Strategy - Implementation Guide

## Overview

SwapRunner implements a sophisticated multi-tier price lookup and caching system that provides:
- **ICP/USD prices** from the ICP/USDC pool
- **Token/ICP prices** from individual token/ICP pools  
- **Token/USD prices** by multiplying Token/ICP × ICP/USD
- **Multi-level caching** with different TTLs for optimal performance

## Core Architecture

### Constants and Configuration
```typescript
const ICP_USDC_POOL_ID = 'mohjv-bqaaa-aaaag-qjyia-cai';
const ICP_CANISTER_ID = 'ryjl3-tyaaa-aaaaa-aaaba-cai';
const ICPSWAP_FACTORY_CANISTER = '4mmnk-kiaaa-aaaag-qbllq-cai';

// Cache TTLs
const CACHE_TTL_MS = 60 * 1000; // 1 minute for ICP/USD price
const TOKEN_PRICE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for token prices

// Cache keys for localStorage persistence
const POOL_CACHE_KEY = 'icpswap_pools';
const TOKEN_PRICE_CACHE_KEY = 'icpswap_token_prices';
```

### Data Structures
```typescript
interface PriceCache {
  price: number;
  timestamp: number;
}

interface TokenPriceCache {
  [tokenId: string]: PriceCache;
}

interface PoolData {
  canisterId: string;
  token0: Token;
  token1: Token;
  fee: bigint;
  tickSpacing: number;
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
```

## Price Service Implementation

### Core Service Class
```typescript
export class PriceService {
  private agent: HttpAgent;
  private poolActor: any; // ICP/USDC pool actor
  private factoryActor: any; // ICPSwap factory actor
  private priceCache: PriceCache | null = null; // ICP/USD price cache
  private poolCache: Map<string, PoolCache> = new Map(); // Pool data cache
  private tokenPriceCache: TokenPriceCache = {}; // Token/ICP price cache

  constructor() {
    this.agent = new HttpAgent({
      host: process.env.DFX_NETWORK === 'ic' ? 'https://ic0.app' : 'http://localhost:4943',
    });

    if (process.env.DFX_NETWORK !== 'ic') {
      this.agent.fetchRootKey();
    }

    // Create actor for ICP/USDC pool (for USD price)
    this.poolActor = Actor.createActor(idlFactory, {
      agent: this.agent,
      canisterId: ICP_USDC_POOL_ID,
    });

    // Create actor for ICPSwap factory (for pool discovery)
    this.factoryActor = Actor.createActor(factoryIdlFactory, {
      agent: this.agent,
      canisterId: ICPSWAP_FACTORY_CANISTER,
    });

    // Load cached data from localStorage
    this.loadPoolCache();
    this.loadTokenPriceCache();
  }
}
```

### Cache Management
```typescript
// Load token price cache from localStorage
private loadTokenPriceCache(): void {
  try {
    const cachedPrices = localStorage.getItem(TOKEN_PRICE_CACHE_KEY);
    if (cachedPrices) {
      this.tokenPriceCache = JSON.parse(cachedPrices);
      
      // Clean expired entries
      const now = Date.now();
      Object.entries(this.tokenPriceCache).forEach(([tokenId, cache]) => {
        if (now - cache.timestamp > TOKEN_PRICE_CACHE_TTL_MS) {
          delete this.tokenPriceCache[tokenId];
        }
      });
      
      // Save cleaned cache back
      if (Object.keys(this.tokenPriceCache).length > 0) {
        this.saveTokenPriceCache();
      }
    }
  } catch (error) {
    console.warn('Failed to load token price cache from localStorage:', error);
    this.tokenPriceCache = {};
  }
}

// Save token price cache to localStorage
private saveTokenPriceCache(): void {
  try {
    localStorage.setItem(TOKEN_PRICE_CACHE_KEY, JSON.stringify(this.tokenPriceCache));
  } catch (error) {
    console.warn('Failed to save token price cache to localStorage:', error);
  }
}
```

## Price Calculation Methods

### 1. ICP/USD Price (Base Currency)
```typescript
async getICPUSDPrice(): Promise<number> {
  // Check memory cache first
  if (this.priceCache) {
    const age = Date.now() - this.priceCache.timestamp;
    if (age < CACHE_TTL_MS) {
      return this.priceCache.price;
    }
  }

  try {
    // Get pool metadata from ICP/USDC pool
    const response = await this.poolActor.metadata() as PoolMetadataResponse;
    if (!response.ok || response.err) {
      throw new Error(response.err?.message || 'Failed to fetch ICP/USD pool metadata');
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

    // Adjust for decimal differences (ICP=8, USDC=6)
    const decimalAdjustment = 10 ** (ICP_DECIMALS - USDC_DECIMALS);
    price = price * decimalAdjustment;

    // Cache the result
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
```

### 2. Token/ICP Price
```typescript
async getTokenICPPrice(tokenCanisterId: string): Promise<number> {
  // If the token is ICP itself, return 1
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
    // Get the pool for this token/ICP pair
    const pool = await this.getICPPool(tokenCanisterId);
    
    // Create actor for this pool
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

    // Check if our token is token0 or token1
    const isTokenToken0 = metadata.token0.address === tokenCanisterId;

    // Calculate price from sqrtPriceX96
    const Q96 = BigInt(2) ** BigInt(96);
    const sqrtPrice = Number(metadata.sqrtPriceX96) / Number(Q96);
    let price = sqrtPrice * sqrtPrice;

    // If our token is token1, we need to invert the price
    if (!isTokenToken0) {
      price = 1 / price;
    }

    // Adjust for decimal differences between token and ICP
    const tokenMetadata = getCachedTokenMetadata(tokenCanisterId);
    const tokenDecimals = tokenMetadata?.decimals || 8;
    const decimalAdjustment = 10 ** (tokenDecimals - ICP_DECIMALS);
    price = price * decimalAdjustment;

    // Cache the result
    this.tokenPriceCache[tokenCanisterId] = {
      price,
      timestamp: Date.now()
    };
    this.saveTokenPriceCache();

    return price;
  } catch (error) {
    console.error('Error fetching token ICP price:', error);
    throw error;
  }
}
```

### 3. Token/USD Price (Composite)
```typescript
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
```

## Pool Discovery for Token/ICP Pairs

```typescript
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
```

## Frontend Integration Patterns

### Token Balance with USD Value
```typescript
// In TokenSelect component
const fetchSelectedTokenBalance = async (tokenId: string) => {
  try {
    const [balanceResult, usdPrice] = await Promise.all([
      icpSwapExecutionService.getBalance(tokenId),
      priceService.getTokenUSDPrice(tokenId).catch(err => {
        console.warn('Failed to fetch USD price:', err);
        return null;
      })
    ]);      

    const formattedBalance = !balanceResult.error 
      ? formatTokenAmount(balanceResult.balance_e8s, tokenId)
      : undefined;

    const usdValue = formattedBalance !== undefined && usdPrice !== null 
      ? parseFloat(formattedBalance) * usdPrice
      : undefined;

    setBalances(prev => ({
      ...prev,
      [tokenId]: {
        balance: formattedBalance,
        error: balanceResult.error,
        isLoading: false,
        usdValue
      }
    }));
  } catch (err) {
    console.error('Error fetching balance:', err);
  }
};
```

### Progressive Price Loading
```typescript
// In Wallet component
const loadTokenUSDPrice = async (id: string, balance_e8s: bigint) => {
  try {
    const usdPrice = await priceService.getTokenUSDPrice(id);
    const balance = Number(formatTokenAmount(balance_e8s, id));
    const usdValue = balance * usdPrice;
    
    setTokens(prev => ({
      ...prev,
      [id]: { ...prev[id], usdPrice, isLoadingUSDPrice: false }
    }));
  } catch (error) {
    console.error(`Error loading USD price for ${id}:`, error);
    setTokens(prev => ({
      ...prev,
      [id]: { ...prev[id], usdPrice: null, isLoadingUSDPrice: false }
    }));
  }
};
```

## Mathematical Foundation

### sqrtPriceX96 to Price Conversion
The core price calculation uses Uniswap V3's sqrtPriceX96 format:

```typescript
// Convert sqrtPriceX96 to actual price
const Q96 = BigInt(2) ** BigInt(96);
const sqrtPrice = Number(metadata.sqrtPriceX96) / Number(Q96);
let price = sqrtPrice * sqrtPrice;

// Handle token ordering (price inversion if needed)
if (!isTokenToken0) {
  price = 1 / price;
}

// Adjust for decimal differences
const decimalAdjustment = 10 ** (tokenDecimals - baseTokenDecimals);
price = price * decimalAdjustment;
```

## Cache Strategy Summary

### Memory Caches
- **ICP/USD Price**: 1-minute TTL, single value
- **Token/ICP Prices**: 5-minute TTL, per-token
- **Pool Data**: Indefinite (until page refresh), per-token-pair

### localStorage Persistence
- **Pool Cache**: Survives page refreshes, cleaned on expiry
- **Token Price Cache**: Survives page refreshes, 5-minute TTL

### Cache Invalidation
```typescript
clearAllCaches(): void {
  this.priceCache = null;
  this.poolCache.clear();
  this.tokenPriceCache = {};
  localStorage.removeItem(POOL_CACHE_KEY);
  localStorage.removeItem(TOKEN_PRICE_CACHE_KEY);
}
```

## Implementation Checklist

✅ **ICP/USD base price** from dedicated ICP/USDC pool  
✅ **Token/ICP prices** via pool discovery and sqrtPriceX96 calculation  
✅ **Token/USD prices** via multiplication (Token/ICP × ICP/USD)  
✅ **Multi-tier caching** with appropriate TTLs  
✅ **localStorage persistence** for pool and price data  
✅ **Decimal adjustment** for different token standards  
✅ **Token ordering handling** (token0 vs token1)  
✅ **Progressive loading** in UI components  
✅ **Error handling** with graceful fallbacks  

This system provides fast, accurate, and cached price data for all tokens in both ICP and USD terms, exactly as implemented in SwapRunner.
