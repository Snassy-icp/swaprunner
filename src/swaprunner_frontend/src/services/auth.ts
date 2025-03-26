import { AuthClient } from '@dfinity/auth-client';
import { Principal } from '@dfinity/principal';
import { Identity } from '@dfinity/agent';
import { backendService } from './backend';

// Simple event emitter for auth state changes
const authStateListeners: Set<() => void> = new Set();

class AuthService {
  private authClient: AuthClient | null = null;
  private principal: Principal | null = null;
  private initializationPromise: Promise<boolean> | null = null;
  private isInitializing = false;
  private readonly INIT_TIMEOUT = 10000; // 10 seconds timeout

  private async waitWithTimeout(promise: Promise<any>, timeoutMs: number): Promise<any> {
    let timeoutHandle: NodeJS.Timeout;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error('Operation timed out'));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutHandle!);
      return result;
    } catch (error) {
      clearTimeout(timeoutHandle!);
      throw error;
    }
  }

  async init(forceNew = false): Promise<boolean> {
    try {
      // If forcing new, clear existing state
      if (forceNew) {
        console.log('[AuthService] Force new requested, clearing state');
        this.authClient = null;
        this.principal = null;
        this.initializationPromise = null;
        this.isInitializing = false;
      }

      // If already initializing, wait for current initialization
      if (this.isInitializing) {
        console.log('[AuthService] Already initializing, waiting...');
        if (this.initializationPromise) {
          try {
            return await this.waitWithTimeout(this.initializationPromise, this.INIT_TIMEOUT);
          } catch (error) {
            console.error('[AuthService] Initialization timeout, starting fresh');
            this.isInitializing = false;
            this.initializationPromise = null;
          }
        }
      }

      // Start new initialization
      console.log('[AuthService] Starting new initialization');
      this.isInitializing = true;
      this.initializationPromise = this._init();

      try {
        const result = await this.waitWithTimeout(this.initializationPromise, this.INIT_TIMEOUT);
        return result;
      } finally {
        this.isInitializing = false;
        this.initializationPromise = null;
      }
    } catch (error) {
      console.error('[AuthService] Initialization failed:', error);
      this.isInitializing = false;
      this.initializationPromise = null;
      this.authClient = null;
      this.principal = null;
      return false;
    }
  }

  private async _init(): Promise<boolean> {
    try {
      console.log('[AuthService] Creating new auth client');
      this.authClient = await AuthClient.create({
        idleOptions: {
          idleTimeout: 7 * 24 * 60 * 60 * 1000,
          disableDefaultIdleCallback: true
        }
      });
      console.log('[AuthService] Auth client created successfully');

      const isAuthenticated = await this.authClient.isAuthenticated();
      console.log('[AuthService] isAuthenticated:', isAuthenticated);
      
      if (isAuthenticated) {
        this.principal = await this.authClient.getIdentity().getPrincipal();
        this.notifyAuthStateChange();
      }
      
      return isAuthenticated;
    } catch (error) {
      console.error('[AuthService] Init failed:', error);
      this.authClient = null;
      this.principal = null;
      throw error;
    }
  }

  async login(): Promise<boolean> {
    try {
      console.log('[AuthService] Starting login process');
      
      // Force new initialization for login
      console.log('[AuthService] Initializing new auth client for login');
      const initialized = await this.init(true);
      console.log('[AuthService] Auth client initialization result:', initialized);

      if (!this.authClient) {
        throw new Error('Failed to initialize auth client');
      }

      return new Promise((resolve) => {
        console.log('[AuthService] Opening login window...');
        const identityProvider = process.env.DFX_NETWORK === 'ic' 
          ? 'https://identity.ic0.app/#authorize'
          : `http://localhost:4943?canisterId=rdmx6-jaaaa-aaaaa-aaadq-cai#authorize`;
        
        console.log('[AuthService] Using identity provider:', identityProvider);
        
        this.authClient?.login({
          identityProvider,
          maxTimeToLive: BigInt(7 * 24 * 60 * 60 * 1000 * 1000 * 1000), // 7 days in nanoseconds
          onSuccess: async () => {
            try {
              console.log('[AuthService] Login window succeeded');
              const identity = this.authClient?.getIdentity();
              this.principal = identity ? await identity.getPrincipal() : null;
              console.log('[AuthService] Got principal:', this.principal?.toString());
              this.notifyAuthStateChange();
              
              if (this.principal) {
                try {
                  const actor = await backendService.getActor();
                  await actor.record_login(this.principal);
                  console.log('[AuthService] Successfully recorded login');
                } catch (error) {
                  console.error('[AuthService] Failed to record login:', error);
                }
              }
              resolve(true);
            } catch (error) {
              console.error('[AuthService] Login success handler failed:', error);
              resolve(false);
            }
          },
          onError: (error) => {
            console.error('[AuthService] Login window error:', error);
            resolve(false);
          }
        });
      });
    } catch (error) {
      console.error('[AuthService] Login process failed:', error);
      return false;
    }
  }

  async logout() {
    if (this.authClient) {
      await this.authClient.logout();
      this.principal = null;
      this.notifyAuthStateChange();
    }
  }

  getPrincipal(): Principal | null {
    return this.principal;
  }

  getIdentity(): Identity | null {
    return this.authClient?.getIdentity() || null;
  }

  isAuthenticated(): boolean {
    return this.principal !== null;
  }

  async isAdmin(): Promise<boolean> {
    try {
      const actor = await backendService.getActor();
      return await actor.is_admin();
    } catch (error) {
      console.error('[AuthService] Error checking admin status:', error);
      return false;
    }
  }

  onAuthStateChange(listener: () => void): () => void {
    authStateListeners.add(listener);
    return () => authStateListeners.delete(listener);
  }

  private notifyAuthStateChange() {
    authStateListeners.forEach(listener => listener());
  }
}

// Singleton instance
export const authService = new AuthService(); 