import { Principal } from '@dfinity/principal';
import { backendService } from './backend';
import { Actor, HttpAgent } from '@dfinity/agent';
import { idlFactory } from '../../../declarations/swaprunner_backend/swaprunner_backend.did.js';
import { authService } from './auth';

export interface GlobalStats {
  total_swaps: bigint;
  icpswap_swaps: bigint;
  kong_swaps: bigint;
  split_swaps: bigint;
  total_sends: bigint;
  total_deposits: bigint;
  total_withdrawals: bigint;
}

export interface TokenStats {
  total_swaps: bigint;
  icpswap_swaps: bigint;
  kong_swaps: bigint;
  split_swaps: bigint;
  volume_e8s: bigint;
  total_sends: bigint;
  sends_volume_e8s: bigint;
  total_deposits: bigint;
  deposits_volume_e8s: bigint;
  total_withdrawals: bigint;
  withdrawals_volume_e8s: bigint;
}

export interface UserStats {
  total_swaps: bigint;
  icpswap_swaps: bigint;
  kong_swaps: bigint;
  split_swaps: bigint;
  total_sends: bigint;
  total_deposits: bigint;
  total_withdrawals: bigint;
}

export interface UserStatsWithId extends UserStats {
  principal: string;
}

export interface UserTokenStats {
  swaps_as_input_icpswap: bigint;
  swaps_as_input_kong: bigint;
  swaps_as_input_split: bigint;
  input_volume_e8s_icpswap: bigint;
  input_volume_e8s_kong: bigint;
  input_volume_e8s_split: bigint;
  swaps_as_output_icpswap: bigint;
  swaps_as_output_kong: bigint;
  swaps_as_output_split: bigint;
  output_volume_e8s_icpswap: bigint;
  output_volume_e8s_kong: bigint;
  output_volume_e8s_split: bigint;
  total_sends: bigint;
  total_deposits: bigint;
  total_withdrawals: bigint;
}

export class StatsService {
  private queryActor: any = null;

  private async getQueryActor() {
    if (this.queryActor) return this.queryActor;

    console.log('Initializing query actor for stats service');
    const agent = new HttpAgent({
      host: process.env.DFX_NETWORK === 'ic' ? 'https://ic0.app' : 'http://localhost:4943',
    });

    if (process.env.DFX_NETWORK !== 'ic') {
      console.log('Local development detected, fetching root key');
      await agent.fetchRootKey();
    }

    this.queryActor = Actor.createActor(idlFactory, {
      agent,
      canisterId: process.env.CANISTER_ID_SWAPRUNNER_BACKEND!,
    });
    console.log('Query actor initialized with canister ID:', process.env.CANISTER_ID_SWAPRUNNER_BACKEND);

    return this.queryActor;
  }

  // Record completed ICPSwap swap (needs auth)
  async recordICPSwapSwap(
    user: Principal,
    token_in: string,
    amount_in_e8s: string,
    token_out: string,
    amount_out_e8s: string,
    savings_out_e8s: string,
    pool_id: Principal,
  ): Promise<void> {
    console.log('Recording ICPSwap swap:', {
      user: user.toString(),
      token_in,
      amount_in_e8s,
      token_out,
      amount_out_e8s,
      savings_out_e8s,
      pool_id: pool_id.toString(),
    });

    try {
      const actor = await backendService.getActor();
      await actor.record_icpswap_swap(
        user,
        token_in,
        BigInt(amount_in_e8s),
        token_out,
        BigInt(amount_out_e8s),
        BigInt(savings_out_e8s),
        pool_id,
      );
      console.log('Successfully recorded ICPSwap swap');
    } catch (error) {
      console.error('Failed to record ICPSwap swap:', error);
      // Fire and forget - no error handling per spec
    }
  }

  // Record completed Kong swap (needs auth)
  async recordKongSwap(
    user: Principal,
    token_in: string,
    amount_in_e8s: string,
    token_out: string,
    amount_out_e8s: string,
    savings_out_e8s: string,
  ): Promise<void> {
    console.log('Recording Kong swap:', {
      user: user.toString(),
      token_in,
      amount_in_e8s,
      token_out,
      amount_out_e8s,
      savings_out_e8s,
    });

    try {
      const actor = await backendService.getActor();
      await actor.record_kong_swap(
        user,
        token_in,
        BigInt(amount_in_e8s),
        token_out,
        BigInt(amount_out_e8s),
        BigInt(savings_out_e8s),
      );
      console.log('Successfully recorded Kong swap');
    } catch (error) {
      console.error('Failed to record Kong swap:', error);
      // Fire and forget - no error handling per spec
    }
  }

  // Record completed split swap (needs auth)
  async recordSplitSwap(
    user: Principal,
    token_in: string,
    icpswap_amount_in_e8s: string,
    kong_amount_in_e8s: string,
    token_out: string,
    icpswap_amount_out_e8s: string,
    kong_amount_out_e8s: string,
    savings_out_e8s: string,
    icpswap_pool_id: Principal,
  ): Promise<void> {
    console.log('Recording split swap:', {
      user: user.toString(),
      token_in,
      icpswap_amount_in_e8s,
      kong_amount_in_e8s,
      token_out,
      icpswap_amount_out_e8s,
      kong_amount_out_e8s,
      savings_out_e8s,
      icpswap_pool_id: icpswap_pool_id.toString(),
    });

    try {
      const actor = await backendService.getActor();
      await actor.record_split_swap(
        user,
        token_in,
        BigInt(icpswap_amount_in_e8s),
        BigInt(kong_amount_in_e8s),
        token_out,
        BigInt(icpswap_amount_out_e8s),
        BigInt(kong_amount_out_e8s),
        BigInt(savings_out_e8s),
        icpswap_pool_id,
      );
      console.log('Successfully recorded split swap');
    } catch (error) {
      console.error('Failed to record split swap:', error);
      // Fire and forget - no error handling per spec
    }
  }

  // Record completed send (needs auth)
  async recordSend(
    user: Principal,
    token: string,
    amount_e8s: string,
  ): Promise<void> {
    console.log('Recording send:', {
      user: user.toString(),
      token,
      amount_e8s,
    });

    try {
      const actor = await backendService.getActor();
      await actor.record_send(
        user,
        token,
        BigInt(amount_e8s),
      );
      console.log('Successfully recorded send');
    } catch (error) {
      console.error('Failed to record send:', error);
      // Fire and forget - no error handling per spec
    }
  }

  // Record completed deposit (needs auth)
  async recordDeposit(
    user: Principal,
    token: string,
    amount_e8s: string,
    pool_id: Principal,
  ): Promise<void> {
    console.log('Recording deposit:', {
      user: user.toString(),
      token,
      amount_e8s,
      pool_id: pool_id.toString(),
    });

    try {
      const actor = await backendService.getActor();
      await actor.record_deposit(
        user,
        token,
        BigInt(amount_e8s),
        pool_id,
      );
      console.log('Successfully recorded deposit');
    } catch (error) {
      console.error('Failed to record deposit:', error);
      // Fire and forget - no error handling per spec
    }
  }

  // Record completed withdrawal (needs auth)
  async recordWithdrawal(
    user: Principal,
    token: string,
    amount_e8s: string,
    pool_id: Principal,
  ): Promise<void> {
    console.log('Recording withdrawal:', {
      user: user.toString(),
      token,
      amount_e8s,
      pool_id: pool_id.toString(),
    });

    try {
      const actor = await backendService.getActor();
      await actor.record_withdrawal(
        user,
        token,
        BigInt(amount_e8s),
        pool_id,
      );
      console.log('Successfully recorded withdrawal');
    } catch (error) {
      console.error('Failed to record withdrawal:', error);
      // Fire and forget - no error handling per spec
    }
  }

  // Record completed transfer (needs auth)
  async recordTransfer(
    user: Principal,
    token: string,
    amount_e8s: string,
    pool_id: Principal,
  ): Promise<void> {
    console.log('Recording transfer:', {
      user: user.toString(),
      token,
      amount_e8s,
      pool_id: pool_id.toString(),
    });

    try {
      const actor = await backendService.getActor();
      await actor.record_transfer(
        user,
        token,
        BigInt(amount_e8s),
        pool_id,
      );
      console.log('Successfully recorded transfer');
    } catch (error) {
      console.error('Failed to record transfer:', error);
      // Fire and forget - no error handling per spec
    }
  }

  // Query methods (all public)
  async getGlobalStats(): Promise<GlobalStats> {
    console.log('Getting global stats...');
    const actor = await backendService.getActor();
    const stats = await actor.get_global_stats();
    console.log('Global stats:', stats);
    return stats;
  }

  async getTokenStats(token_id: string): Promise<TokenStats | undefined> {
    console.log('Fetching stats for token:', token_id);
    const actor = await this.getQueryActor();
    const result = await actor.get_token_stats(token_id);
    if (result.length > 0) {
      const stats = result[0];
      console.log('Received token stats:', {
        token_id,
        total_swaps: stats.total_swaps.toString(),
        icpswap_swaps: stats.icpswap_swaps.toString(),
        kong_swaps: stats.kong_swaps.toString(),
        split_swaps: stats.split_swaps.toString(),
        volume_e8s: stats.volume_e8s.toString(),
        total_sends: stats.total_sends.toString(),
        sends_volume_e8s: stats.sends_volume_e8s.toString(),
        total_deposits: stats.total_deposits.toString(),
        deposits_volume_e8s: stats.deposits_volume_e8s.toString(),
        total_withdrawals: stats.total_withdrawals.toString(),
        withdrawals_volume_e8s: stats.withdrawals_volume_e8s.toString(),
      });
      return stats;
    }
    console.log('No stats found for token:', token_id);
    return undefined;
  }

  async getUserStats(principal: string): Promise<UserStats> {
    console.log('Getting user stats for principal:', principal);
    const actor = await backendService.getActor();
    const stats = await actor.get_user_stats(principal);
    console.log('User stats:', stats);
    return stats;
  }

  async getAllTokenStats(): Promise<[string, TokenStats][]> {
    console.log('Getting all token stats...');
    const actor = await backendService.getActor();
    const stats = await actor.get_all_token_stats();
    console.log('All token stats:', stats);
    return stats;
  }

  async getMyTokenStats(): Promise<[string, UserTokenStats][]> {
    console.log('Getting user-token stats...');
    const actor = await backendService.getActor();
    const stats = await actor.get_my_token_stats();
    console.log('User-token stats:', stats);
    return stats;
  }

  async getAllUserStats(): Promise<[string, UserStats][]> {
    console.log('Getting all user stats...');
    const actor = await backendService.getActor();
    const stats = await actor.get_all_user_stats();
    console.log('All user stats:', stats);
    return stats;
  }

  async getAllUserLogins(): Promise<[string, bigint][]> {
    console.log('Getting all user logins...');
    const actor = await backendService.getActor();
    const logins = await actor.get_all_user_logins();
    console.log('All user logins:', logins);
    return logins;
  }

  async getUniqueUserCount(): Promise<bigint> {
    console.log('Getting unique user count...');
    const actor = await backendService.getActor();
    const count = await actor.get_unique_user_count();
    console.log('Unique user count:', count);
    return count;
  }

  async getUniqueTraderCount(): Promise<bigint> {
    console.log('Getting unique trader count...');
    const actor = await backendService.getActor();
    const count = await actor.get_unique_trader_count();
    console.log('Unique trader count:', count);
    return count;
  }
}

export const statsService = new StatsService(); 