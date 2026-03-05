# ICPSwap Canister Lookup for Token Pairs - Implementation Guide

## Core Architecture

The ICPSwap lookup system uses a Factory Pattern with these key components:

- Factory Canister: 4mmnk-kiaaa-aaaag-qbllq-cai - Central registry for all pools
- Pool Canisters: Individual canisters for each token pair/fee combination  
- Token Standardization: All tokens are treated as { address: string, standard: 'ICRC1' }

## Factory Service Implementation

```typescript
export class ICPSwapFactoryService {
  private agent: HttpAgent;
  private actor: any;

  constructor() {
    this.agent = new HttpAgent({
      host: process.env.DFX_NETWORK === 'ic' ? 'https://ic0.app' : 'http://localhost:4943',
    });

    if (process.env.DFX_NETWORK !== 'ic') {
      this.agent.fetchRootKey();
    }

    this.actor = Actor.createActor(idlFactory, {
      agent: this.agent,
      canisterId: '4mmnk-kiaaa-aaaag-qbllq-cai', // Factory canister
    });
  }

  async getPool(params: {
    token0: Token;
    token1: Token;
    fee: bigint;
  }): Promise<PoolData> {
    const response = await this.actor.getPool({
      token0: params.token0,
      token1: params.token1,
      fee: params.fee,
    });

    if ('err' in response) {
      throw new Error(response.err.message || 'Failed to fetch pool');
    }

    return response.ok;
  }

  // Critical: Token ordering must match ICPSwap's canonical order
  sortTokens(tokenA: Token, tokenB: Token): [Token, Token] {
    return tokenA.address.toLowerCase() < tokenB.address.toLowerCase() 
      ? [tokenA, tokenB] 
      : [tokenB, tokenA];
  }
}
```

## Key Data Structures

```typescript
interface Token {
  address: string;    // Canister ID
  standard: string;   // Usually 'ICRC1'
}

interface PoolData {
  canisterId: string;  // The pool's canister ID
  token0: Token;       // Lower address token (canonical order)
  token1: Token;       // Higher address token (canonical order)
  fee: bigint;         // Fee tier (3000 = 0.3%)
  tickSpacing: number; // Price tick spacing
}

// Factory call structure
interface GetPoolArgs {
  token0: Token;
  token1: Token;
  fee: bigint;
}
```

## Lookup Flow

```typescript
async function lookupPool(tokenA: string, tokenB: string): Promise<string> {
  // Step 1: Create token objects
  const tokenObjA: Token = { address: tokenA, standard: 'ICRC1' };
  const tokenObjB: Token = { address: tokenB, standard: 'ICRC1' };

  // Step 2: Sort tokens (CRITICAL - must match ICPSwap's order)
  const [token0, token1] = factoryService.sortTokens(tokenObjA, tokenObjB);

  // Step 3: Call factory with standard fee tier
  const poolData = await factoryService.getPool({
    token0,
    token1,
    fee: BigInt(3000), // 0.3% fee tier (most common)
  });

  // Step 4: Return the pool canister ID
  return poolData.canisterId;
}
```

## Usage Example from SwapRunner

```typescript
// In SwapInterface.tsx - Token pair initialization
useEffect(() => {
  if (fromToken && toToken) {
    icpSwapFactoryService.getPool({
      token0: { address: fromToken, standard: 'ICRC1' },
      token1: { address: toToken, standard: 'ICRC1' },
      fee: BigInt(3000), // DEFAULT_FEE
    })
    .then(poolData => {
      setPoolId(poolData.canisterId);
      setToken0Address(poolData.token0.address);
      setToken1Address(poolData.token1.address);
    });
  }
}, [fromToken, toToken]);
```

## Critical Implementation Details

### Token Ordering
- MUST sort tokens by address (lexicographically, lowercase)
- ICPSwap enforces canonical ordering: token0.address < token1.address
- Wrong order = pool not found

### Fee Tiers
- Standard fee: BigInt(3000) = 0.3%
- Other common tiers: 500 (0.05%), 10000 (1%)
- Fee is part of the pool identifier

### Caching Strategy
```typescript
// Pool actors are cached by key
private poolActors = new Map<string, any>();

private async getPoolActor(tokenA: string, tokenB: string, fee: bigint): Promise<any> {
  const key = `${tokenA}-${tokenB}-${fee}`;
  
  if (this.poolActors.has(key)) {
    return this.poolActors.get(key);
  }

  // Get pool data and create actor
  const poolData = await this.getPool(/* ... */);
  const actor = Actor.createActor(poolIdlFactory, {
    agent: this.agent,
    canisterId: poolData.canisterId,
  });

  this.poolActors.set(key, actor);
  return actor;
}
```

## Factory Candid Interface

The factory exposes these key methods:
```candid
type GetPoolArgs = record {
  fee: nat;
  token0: Token;
  token1: Token;
};

service : {
  getPool: (GetPoolArgs) -> (Result_8) query;
  getPools: () -> (Result_4) query;
  // ... other methods
}
```

## Error Handling

```typescript
try {
  const poolData = await factoryService.getPool(params);
  return poolData.canisterId;
} catch (error) {
  if (error.message.includes('Pool not found')) {
    // Try different fee tiers or handle no liquidity
    throw new Error(`No pool exists for ${tokenA}/${tokenB}`);
  }
  throw error;
}
```

## Implementation Checklist

✅ Factory canister connection: 4mmnk-kiaaa-aaaag-qbllq-cai  
✅ Token sorting: Lexicographic by address (lowercase)  
✅ Fee tier: Default BigInt(3000) for 0.3%  
✅ Caching: Pool actors and metadata  
✅ Error handling: Pool not found scenarios  
✅ Token standards: Normalize to 'ICRC1'  

This approach gives you a robust, production-ready system for discovering ICPSwap pool canisters for any token pair, exactly as implemented in SwapRunner.

## How SwapRunner Uses This

1. **Token Pair Selection**: When user selects fromToken/toToken, immediately call getPool() to find the pool canister
2. **Price Fetching**: Use the pool canister ID to get current price via getPoolMetadata()
3. **Quote Generation**: Call the pool canister directly for swap quotes
4. **Execution**: Use the pool canister for actual swap execution

The factory lookup is the foundation that enables all other ICPSwap operations by providing the correct pool canister ID for any token pair.

