import { Actor, HttpAgent } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { authService } from './auth';
import { idlFactory } from '../../../declarations/swaprunner_backend/swaprunner_backend.did.js';
import { backendService } from './backend';

export interface SuspendedStatus {
  temporary: boolean;
  reason: string;
}

class AdminService {
  private agent: HttpAgent | null = null;
  private actor: any = null;

  private async getActor() {
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

  async isAdmin(): Promise<boolean> {
    try {
      const actor = await this.getActor();
      return await actor.is_admin();
    } catch (error) {
      console.error('Error checking admin status:', error);
      throw error;
    }
  }

  async getAdmins(): Promise<Principal[]> {
    try {
      const actor = await this.getActor();
      return await actor.get_admins();
    } catch (error) {
      console.error('Error getting admin list:', error);
      throw error;
    }
  }

  async addAdmin(principal: Principal): Promise<void> {
    try {
      const actor = await this.getActor();
      await actor.add_admin(principal);
    } catch (error) {
      console.error('Error adding admin:', error);
      throw error;
    }
  }

  async removeAdmin(principal: Principal): Promise<void> {
    try {
      const actor = await this.getActor();
      await actor.remove_admin(principal);
    } catch (error) {
      console.error('Error removing admin:', error);
      throw error;
    }
  }

  async initAdmin(): Promise<void> {
    const actor = await this.getActor();
    const result = await actor.init_admin();
    if ('err' in result) throw new Error(result.err);
  }

  async clearLogoCache(): Promise<void> {
    const actor = await this.getActor();
    const result = await actor.clear_logo_cache();
    if ('err' in result) {
      throw new Error(result.err);
    }
  }

  async setTokenLogo(canisterId: string, logo: string): Promise<void> {
    try {
      const actor = await backendService.getActor();
      const result = await actor.set_token_logo(Principal.fromText(canisterId), logo);
      if ('err' in result) {
        throw new Error(result.err);
      }
    } catch (error) {
      console.error('Error setting token logo:', error);
      throw error;
    }
  }

  async refreshTokenLogo(canisterId: string): Promise<{hasLogo: boolean; logoUrl: string | null}> {
    try {
      const actor = await backendService.getActor();
      const result = await actor.refresh_token_logo(Principal.fromText(canisterId));
      if ('err' in result) {
        throw new Error(result.err);
      }
      return {
        hasLogo: result.ok.hasLogo,
        logoUrl: result.ok.logoUrl[0] || null
      };
    } catch (error) {
      console.error('Error refreshing token logo:', error);
      throw error;
    }
  }

  async getTokenLogo(canisterId: string): Promise<string | null> {
    try {
      const actor = await backendService.getActor();
      const result = await actor.get_token_logo(Principal.fromText(canisterId));
      
      // Handle Candid optional type (comes as array)
      if (!result || !Array.isArray(result) || result.length === 0) {
        return null;
      }
      
      return result[0] || null;
    } catch (error) {
      console.error('Error getting token logo:', error);
      throw error;
    }
  }

  async setPanicMode(enabled: boolean): Promise<void> {
    try {
      const actor = await backendService.getActor();
      const result = await actor.set_panic_mode(enabled);
      if ('err' in result) {
        throw new Error(result.err);
      }
    } catch (error) {
      console.error('Error setting panic mode:', error);
      throw error;
    }
  }

  async updatePSA(text: string): Promise<void> {
    try {
      const actor = await backendService.getActor();
      const result = await actor.set_psa_message(text);
      if ('err' in result) {
        throw new Error(result.err);
      }
    } catch (error) {
      console.error('Error updating PSA:', error);
      throw error;
    }
  }

  async suspendPrincipal(principal: Principal, status: SuspendedStatus): Promise<void> {
    try {
      const actor = await backendService.getActor();
      console.log("suspendPrincipal", principal, status);
      const backend_status = status.temporary ? { Temporary: status.reason } : { Permanent: status.reason };
      console.log("backend_status", backend_status);
      const result = await actor.suspend_principal(principal, backend_status);
      if ('err' in result) {
        throw new Error(result.err);
      }
    } catch (error) {
      console.error('Error suspending principal:', error);
      throw error;
    }
  }

  async removeSuspension(principal: Principal): Promise<void> {
    try {
      const actor = await backendService.getActor();
      const result = await actor.unsuspend_principal(principal);
      if ('err' in result) {
        throw new Error(result.err);
      }
    } catch (error) {
      console.error('Error removing suspension:', error);
      throw error;
    }
  }

  async getSuspendedPrincipals(): Promise<Map<string, SuspendedStatus>> {
    try {
      const actor = await backendService.getActor();
      const result = await actor.get_all_suspended_principals();
      return new Map(result.map(([principal, status]: [Principal, SuspendedStatus]) => [principal.toString(), status]));
    } catch (error) {
      console.error('Error getting suspended principals:', error);
      throw error;
    }
  }
}

export const adminService = new AdminService(); 