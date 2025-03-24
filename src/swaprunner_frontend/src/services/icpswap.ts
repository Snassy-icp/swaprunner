import { Actor, HttpAgent } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { idlFactory } from '../../../external/icp_swap/icp_swap.did.js';
import { TokenMetadata } from '../types/token';
import { icpSwapFactoryService } from './icpswap_factory';

// Types for ICPSwap responses
interface PoolMetadata {
  fee: bigint;
  sqrtPriceX96: bigint;
  tick: number;
  token0: { address: string; standard: string };
  token1: { address: string; standard: string };
  liquidity: bigint;
  poolId: string;
}

interface SwapQuote {
  amountOut: bigint;
  priceImpact: number;
  fee: bigint;
}

export class ICPSwapService {
  private agent: HttpAgent;
  private poolActors: Map<string, any> = new Map();
  private lastTokenIn: string = '';  // Track the input token for price calculation

  constructor() {
    this.agent = new HttpAgent({
      host: process.env.DFX_NETWORK === 'ic' ? 'https://ic0.app' : 'http://localhost:4943',
    });

    if (process.env.DFX_NETWORK !== 'ic') {
      this.agent.fetchRootKey();
    }
  }

  private async getPoolActor(params: {
    tokenA: string;
    tokenB: string;
    fee: bigint;
  }): Promise<any> {
    const key = `${params.tokenA}-${params.tokenB}-${params.fee}`;
    
    if (this.poolActors.has(key)) {
      return this.poolActors.get(key);
    }

    // Convert token addresses to Token objects
    const tokenA = { address: params.tokenA, standard: 'ICRC1' };
    const tokenB = { address: params.tokenB, standard: 'ICRC1' };

    // Get tokens in correct order
    const [token0, token1] = icpSwapFactoryService.sortTokens(tokenA, tokenB);

    // Get pool data from factory
    const poolData = await icpSwapFactoryService.getPool({
      token0,
      token1,
      fee: params.fee,
    });

    // Create actor for this pool
    const actor = Actor.createActor(idlFactory, {
      agent: this.agent,
      canisterId: poolData.canisterId,
    });

    // Cache the actor
    this.poolActors.set(key, actor);
    return actor;
  }

  async getPoolMetadata(params: {
    tokenA: string;
    tokenB: string;
    fee: bigint;
  }): Promise<PoolMetadata> {
    try {
      const actor = await this.getPoolActor(params);
      const response = await actor.metadata();
      if ('err' in response) {
        throw new Error(response.err.message || 'Failed to fetch pool metadata');
      }
      
      // Store the input token for price calculation
      this.lastTokenIn = params.tokenA;
      
      // Get the pool data to include the poolId
      const poolData = await icpSwapFactoryService.getPool({
        token0: { address: params.tokenA, standard: 'ICRC1' },
        token1: { address: params.tokenB, standard: 'ICRC1' },
        fee: params.fee,
      });

      // Combine the metadata with the poolId
      return {
        ...response.ok,
        poolId: poolData.canisterId,
      };
    } catch (error) {
      console.error('Error fetching pool metadata:', error);
      throw error;
    }
  }

  async getQuote(params: {
    amountIn: bigint;
    tokenIn: string;
    tokenOut: string;
    fee: bigint;
  }): Promise<SwapQuote> {
    try {
      const actor = await this.getPoolActor({
        tokenA: params.tokenIn,
        tokenB: params.tokenOut,
        fee: params.fee,
      });

      // Get pool metadata to determine token order
      const metadata = await this.getPoolMetadata({
        tokenA: params.tokenIn,
        tokenB: params.tokenOut,
        fee: params.fee,
      });

      const zeroForOne = params.tokenIn === metadata.token0.address;

      const quoteArgs = {
        amountIn: params.amountIn.toString(),
        amountOutMinimum: '0', // We're just getting a quote, not executing
        zeroForOne,
      };

      const response = await actor.quote(quoteArgs);
      if ('err' in response) {
        throw new Error(response.err.message || 'Failed to fetch quote');
      }

      const amountOut = BigInt(response.ok);

      // Calculate price impact using spot price
      const spotPrice = this.calculatePrice(metadata);
      const expectedAmountOut = (Number(params.amountIn) * spotPrice);
      const actualAmountOut = Number(amountOut);
      const priceImpact = ((expectedAmountOut - actualAmountOut) / expectedAmountOut) * 100;

      return {
        amountOut,
        priceImpact,
        fee: metadata.fee,
      };
    } catch (error) {
      console.error('Error fetching quote:', error);
      throw error;
    }
  }

  calculatePrice(metadata: PoolMetadata): number {
    // Price calculation from sqrtPriceX96
    const Q96 = BigInt(2) ** BigInt(96);
    const sqrtPrice = Number(metadata.sqrtPriceX96) / Number(Q96);
    let price = sqrtPrice * sqrtPrice;
    
    // If token0 is not the input token, we need to invert the price
    const isToken0Input = metadata.token0.address === this.lastTokenIn;
    price = isToken0Input ? price : 1 / price;

    // Adjust for token decimals (assuming both tokens use 8 decimals for now)
    // In a full implementation, we would fetch decimals from the token metadata
    const DECIMALS = 8;
    const decimalAdjustment = 10 ** (isToken0Input ? 0 : 0); // Adjust if tokens have different decimals
    return price * decimalAdjustment;
  }
}

// Export singleton instance
export const icpSwapService = new ICPSwapService(); 