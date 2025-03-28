import { Actor, HttpAgent } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { idlFactory as tokenIdlFactory } from '../../../external/icrc1_ledger/icrc1_ledger.did.js';
import { authService } from './auth';
import { tokenService } from './token';

export interface ExecutionResult {
  success: boolean;
  txId?: string;
  error?: string;
}

interface ICRC1Actor {
  icrc1_balance_of: (arg: { owner: Principal; subaccount: [] | [number[]] }) => Promise<bigint>;
  icrc1_transfer: (arg: {
    to: { owner: Principal; subaccount: [] | [number[]] };
    amount: bigint;
    fee: bigint[];
    memo: [];
    from_subaccount: [] | [number[]];
    created_at_time: [];
  }) => Promise<{ Ok: bigint } | { Err: any }>;
}

export class ICRC1Service {
  private agent: HttpAgent | null = null;

  private async getAgent(): Promise<HttpAgent> {
    if (!this.agent) {
      const identity = await authService.getIdentity();
      if (!identity) {
        throw new Error('No identity available');
      }
      this.agent = new HttpAgent({
        host: process.env.DFX_NETWORK === 'ic' ? 'https://ic0.app' : 'http://localhost:4943',
        identity,
      });

      if (process.env.DFX_NETWORK !== 'ic') {
        await this.agent.fetchRootKey();
      }
    }
    return this.agent;
  }

  private async getTokenActor(tokenId: string): Promise<ICRC1Actor> {
    const agent = await this.getAgent();
    return Actor.createActor(tokenIdlFactory, {
      agent,
      canisterId: tokenId,
    });
  }

  async getBalance(tokenId: string): Promise<{ balance_e8s: bigint }> {
    return this.getBalanceWithSubaccount(tokenId);
  }

  async getBalanceWithSubaccount(tokenId: string, subaccount?: number[]): Promise<{ balance_e8s: bigint }> {
    try {
      const tokenActor = await this.getTokenActor(tokenId);
      const userPrincipal = await authService.getPrincipal();
      if (!userPrincipal) {
        throw new Error('No principal available');
      }

      const parsedSubaccount: [] | [number[]] = subaccount ? [[...subaccount]] : [];
      
      const balance = await tokenActor.icrc1_balance_of({
        owner: userPrincipal,
        subaccount: parsedSubaccount
      });
      
      return { balance_e8s: balance };
    } catch (error: any) {
      console.error('Error getting balance:', error);
      throw new Error(error?.message || 'Failed to get balance');
    }
  }

  async transfer(params: {
    tokenId: string;
    to: string;
    amount_e8s: string;
    subaccount?: Uint8Array;
    from_subaccount?: number[];
  }): Promise<ExecutionResult> {
    try {
      console.log('Transfer params:', params);
      const tokenActor = await this.getTokenActor(params.tokenId);
      
      // Get token metadata to validate fee
      const metadata = await tokenService.getMetadata(params.tokenId);
      console.log('Token metadata:', metadata);
      
      // Amount is already in e8s format, just convert to BigInt
      const amountE8 = BigInt(params.amount_e8s);
      console.log('Amount in e8s:', amountE8.toString());
      console.log('To:', params.to);

      // Parse the principal from the to address
      const toPrincipal = Principal.fromText(params.to);
      
      // Convert subaccount to optional array of numbers if present
      const toSubaccount: [] | [number[]] = params.subaccount ? [[...params.subaccount]] : [];
      const fromSubaccount: [] | [number[]] = params.from_subaccount ? [[...params.from_subaccount]] : [];
      
      console.log('Executing transfer with:', {
        to: { 
          owner: toPrincipal, 
          subaccount: toSubaccount
        },
        amount: amountE8.toString(),
        fee: metadata.fee.toString(),
        from_subaccount: fromSubaccount,
      });

      const result = await tokenActor.icrc1_transfer({
        to: { 
          owner: toPrincipal,
          subaccount: toSubaccount
        },
        amount: amountE8,
        fee: [metadata.fee],
        memo: [],
        from_subaccount: fromSubaccount,
        created_at_time: [],
      });

      console.log('Transfer result:', result);

      if ('Ok' in result) {
        return { success: true, txId: result.Ok.toString() };
      } else {
        const errorStr = typeof result.Err === 'object' ? 
          JSON.stringify(result.Err, (_, v) => typeof v === 'bigint' ? v.toString() : v) : 
          String(result.Err);
        console.error('Transfer failed:', errorStr);
        return { success: false, error: errorStr };
      }
    } catch (error: any) {
      console.error('Transfer error:', error);
      return { success: false, error: error?.message || 'Unknown error during transfer' };
    }
  }
}

export const icrc1Service = new ICRC1Service(); 