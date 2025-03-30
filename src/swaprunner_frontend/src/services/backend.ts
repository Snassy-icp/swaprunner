import { Actor, HttpAgent } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { authService } from './auth';
import { idlFactory } from '../../../declarations/swaprunner_backend/swaprunner_backend.did.js';

type Result<T, E> = { ok: T } | { err: E };

interface TokenMetadata {
  name: string | null | undefined;
  symbol: string | null | undefined;
  fee: bigint | null | undefined;
  decimals: number | null | undefined;
  hasLogo: boolean;
  standard: string;
}

interface NamedSubaccount {
  name: string;
  subaccount: number[];
  created_at: bigint;
}

interface UserTokenSubaccounts {
  token_id: Principal;
  subaccounts: NamedSubaccount[];
}

type RegisterTokenResponse = {
  metadata: TokenMetadata;
  logo?: string;
};

class BackendService {
  private agent: HttpAgent | null = null;
  private actor: any = null;

  async getActor() {
    if (this.actor) return this.actor;

    // Wait for auth to be initialized
    await authService.init();
    
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

    this.actor = Actor.createActor(idlFactory, {
      agent: this.agent,
      canisterId: process.env.CANISTER_ID_SWAPRUNNER_BACKEND!,
    });

    return this.actor;
  }

  // Reset actor when identity changes
  resetActor() {
    this.agent = null;
    this.actor = null;
  }

  async register_custom_token(canisterId: Principal) {
    const actor = await this.getActor();
    return await actor.register_custom_token(canisterId) as Result<RegisterTokenResponse, string>;
  }

  async get_custom_tokens(): Promise<string[]> {
    const actor = await this.getActor();
    const result = await actor.get_custom_tokens();
    // Extract just the canister IDs from the tuples
    return result.map(([principal, _metadata]: [Principal, any]) => principal.toString());
  }

  async remove_custom_token(tokenId: string): Promise<boolean> {
    const actor = await this.getActor();
    return await actor.remove_custom_token(Principal.fromText(tokenId));
  }

  // Wallet token methods
  async get_wallet_tokens(): Promise<string[]> {
    const actor = await this.getActor();
    return await actor.get_wallet_tokens();
  }

  async add_wallet_token(tokenId: string): Promise<boolean> {
    const actor = await this.getActor();
    return await actor.add_wallet_token(tokenId);
  }

  async remove_wallet_token(tokenId: string): Promise<boolean> {
    const actor = await this.getActor();
    return await actor.remove_wallet_token(tokenId);
  }

  async add_named_subaccount(args: {
    token_id: Principal;
    name: string;
    subaccount: number[];
  }): Promise<void> {
    const actor = await this.getActor();
    await actor.add_named_subaccount(args);
  }

  async get_named_subaccounts(tokenId: string): Promise<NamedSubaccount[]> {
    const actor = await this.getActor();
    const result = await actor.get_named_subaccounts(Principal.fromText(tokenId));
    if ('ok' in result) {
      return result.ok;
    } else {
      throw new Error(result.err);
    }
  }

  async get_all_named_subaccounts(): Promise<UserTokenSubaccounts[]> {
    const actor = await this.getActor();
    const result = await actor.get_all_named_subaccounts();
    if ('ok' in result) {
      return result.ok;
    } else {
      throw new Error(result.err);
    }
  }
}

export const backendService = new BackendService(); 