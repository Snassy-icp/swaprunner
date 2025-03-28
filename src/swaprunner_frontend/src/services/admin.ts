import { Actor, HttpAgent } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { authService } from './auth';
import { idlFactory } from '../../../declarations/swaprunner_backend/swaprunner_backend.did.js';
import { backendService } from './backend';

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
}

export const adminService = new AdminService(); 