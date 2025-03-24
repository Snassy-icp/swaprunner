import { Actor, HttpAgent } from '@dfinity/agent';
import { idlFactory, canisterId } from '../../../external/icp_swap_factory';

interface Token {
  address: string;
  standard: string;
}

interface PoolData {
  canisterId: string;
  fee: bigint;
  key: string;
  tickSpacing: number;
  token0: Token;
  token1: Token;
}

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
      canisterId,
    });
  }

  async getPool(params: {
    token0: Token;
    token1: Token;
    fee: bigint;
  }): Promise<PoolData> {
    try {
      const response = await this.actor.getPool({
        token0: params.token0,
        token1: params.token1,
        fee: params.fee,
      });

      if ('err' in response) {
        throw new Error(response.err.message || 'Failed to fetch pool');
      }

      return response.ok;
    } catch (error) {
      console.error('Error fetching pool:', error);
      throw error;
    }
  }

  // Helper to ensure token0 and token1 are in the correct order
  sortTokens(tokenA: Token, tokenB: Token): [Token, Token] {
    // Sort by address to match ICPSwap's ordering
    return tokenA.address.toLowerCase() < tokenB.address.toLowerCase() 
      ? [tokenA, tokenB] 
      : [tokenB, tokenA];
  }
}

// Export singleton instance
export const icpSwapFactoryService = new ICPSwapFactoryService(); 