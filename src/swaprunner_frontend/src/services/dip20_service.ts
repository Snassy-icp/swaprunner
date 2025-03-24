import { Principal } from '@dfinity/principal';
import { Actor, HttpAgent } from '@dfinity/agent';
import { idlFactory } from '../../../external/dip20/dip20.did.js';
import { authService } from './auth';
import { tokenService } from './token';
import { ExecutionResult } from '../types/execution';

interface DIP20Actor {
  transfer: (to: Principal, value: bigint) => Promise<{ Ok: bigint } | { Err: any }>;
  balanceOf: (who: Principal) => Promise<bigint>;
  allowance: (owner: Principal, spender: Principal) => Promise<bigint>;
  approve: (spender: Principal, value: bigint) => Promise<{ Ok: bigint } | { Err: any }>;
}

export class DIP20Service {
  private agent: HttpAgent | null = null;

  private async getAgent(): Promise<HttpAgent> {
    if (this.agent) return this.agent;

    const identity = authService.getIdentity();
    if (!identity) {
      throw new Error('User not authenticated');
    }

    this.agent = new HttpAgent({
      host: process.env.DFX_NETWORK === 'ic' ? 'https://ic0.app' : 'http://localhost:4943',
      identity,
    });

    if (process.env.DFX_NETWORK !== 'ic') {
      await this.agent.fetchRootKey();
    }

    return this.agent;
  }

  private async getActor(canisterId: string): Promise<DIP20Actor> {
    const agent = await this.getAgent();
    return Actor.createActor<DIP20Actor>(idlFactory, {
      agent,
      canisterId: Principal.fromText(canisterId),
    });
  }

  async transfer(params: {
    tokenId: string;
    to: string;
    amount_e8s: string;
  }): Promise<ExecutionResult> {
    try {
      console.log('DIP20 Transfer params:', params);
      const tokenActor = await this.getActor(params.tokenId);
      
      // Amount is already in e8s format, just convert to BigInt
      const amountE8 = BigInt(params.amount_e8s);
      console.log('Amount in e8s:', amountE8.toString());

      // Convert recipient to Principal
      let recipientPrincipal: Principal;
      try {
        recipientPrincipal = Principal.fromText(params.to);
        console.log('Converted recipient to Principal:', recipientPrincipal.toString());
      } catch (error) {
        console.error('Failed to convert recipient to Principal:', error);
        throw new Error(`Invalid recipient format: ${params.to}`);
      }
      
      console.log('Executing DIP20 transfer with:', {
        to: recipientPrincipal.toString(),
        amount: amountE8.toString(),
      });

      const result = await tokenActor.transfer(recipientPrincipal, amountE8);
      console.log('DIP20 Transfer result:', result);

      if ('Ok' in result) {
        return { success: true, txId: result.Ok.toString() };
      } else {
        const errorStr = typeof result.Err === 'object' ? 
          JSON.stringify(result.Err) : 
          String(result.Err);
        console.error('DIP20 Transfer failed:', errorStr);
        return { success: false, error: errorStr };
      }
    } catch (error: any) {
      console.error('DIP20 Transfer error:', error);
      return { success: false, error: error?.message || 'Unknown error during transfer' };
    }
  }

  async getBalance(tokenId: string): Promise<{ balance_e8s: bigint; error?: string }> {
    try {
      const userPrincipal = authService.getPrincipal();
      if (!userPrincipal) {
        return { balance_e8s: BigInt(0), error: 'User not authenticated' };
      }

      const actor = await this.getActor(tokenId);
      const balance = await actor.balanceOf(userPrincipal);
      return { balance_e8s: balance };
    } catch (error: any) {
      return { balance_e8s: BigInt(0), error: error?.message || 'Failed to fetch balance' };
    }
  }
}

export const dip20Service = new DIP20Service(); 