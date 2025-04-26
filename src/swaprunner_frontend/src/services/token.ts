import { Principal } from '@dfinity/principal';
import { Actor, HttpAgent } from '@dfinity/agent';
import { idlFactory } from '../../../declarations/swaprunner_backend/swaprunner_backend.did.js';
import { idlFactory as icrc1IdlFactory } from '../../../external/icrc1_ledger/icrc1_ledger.did.js';
import { MetadataResponse, TokenMetadata } from '../types/token';
import { authService } from './auth';
import { getCachedTokenMetadata, cacheTokenMetadata, clearTokenMetadataCache } from '../utils/format';
import { openDB, IDBPDatabase } from 'idb';
import type { TokenMetadata as ImportedTokenMetadata } from '../types/token';

export interface WhitelistTokenMetadata {
    name: string | null;
    symbol: string | null;
    decimals: number;
    fee: bigint | null;
    hasLogo: boolean;
    standard: string;
}

export interface ImportProgress {
    last_processed: string | null;
    total_tokens: number;
    processed_count: number;
    imported_count: number;
    skipped_count: number;
    failed_count: number;
    is_running: boolean;
}

// Add new interface for logo update progress
export interface LogoUpdateProgress {
    total_tokens: number;
    processed_count: number;
    updated_count: number;
    skipped_count: number;
    failed_count: number;
    is_running: boolean;
    last_processed: string | null;
}

// Update the interface
export interface PaginatedLogosResponse {
  items: [Principal, string | null][]; // Only Principal and logo URL
  total: number;
  start_index: number;
}

// Rename our interface to avoid conflict
export interface FormattedTokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
  fee: bigint;
  hasLogo: boolean;
  standard: string;
}

export interface MetadataRefreshProgress {
    total_tokens: number;
    processed_count: number;
    updated_count: number;
    skipped_count: number;
    failed_count: number;
    is_running: boolean;
    last_processed: string | null;
}

interface LogoLoadingProgress {
  isLoading: boolean;
  totalTokens: number;
  processedTokens: number;
  cachedTokens: number;
  skippedTokens: number;
  progress: number;
}

type LogoLoadingProgressHandler = (progress: LogoLoadingProgress) => void;

const DB_NAME = 'SwaprunnerTokenCache';
const DB_VERSION = 6;  // Increment version for schema update after removing LOGO_LOADING_STORE
const LOGO_STORE = 'tokenLogo';
const WHITELIST_STORE = 'tokenWhitelist';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds
const LOGO_CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days for logos

interface CachedLogo {
  canisterId: string;
  logo: string | null;  // null indicates a failed attempt
  timestamp: number;
}

interface WhitelistCache {
  tokens: [string, WhitelistTokenMetadata][];
  timestamp: number;
}

// Add TokenDB interface
interface TokenDB {
  [LOGO_STORE]: string;
  [WHITELIST_STORE]: any;
}

const isValidLogo = (logo: string | undefined | null | any[]): boolean => {
  // Handle Motoko Optional type (array with one element)

  if (logo != null) {
    return true;
  }

  return false;

};

export class TokenService {
  private static instance: TokenService | null = null;
  private static instanceCount = 0;

  private agent: HttpAgent | null = null;
  private backendActor: any = null;
  private db: IDBPDatabase<TokenDB> | null = null;
  private dbInitPromise: Promise<void>;
  private tokenActors = new Map<string, any>();
  private lastLogoRequest: number = 0;
  private lastLogoPageLoadTime: number = 0;
  private readonly LOGO_REQUEST_DELAY = 500; // 500ms between logo requests
  private readonly LOGO_PAGE_LOAD_INTERVAL = 30 * 24 * 60 * 60 * 1000; // 30 days
  private isInitializing = false;
  private initializationError: Error | null = null;
  private logoLoadingProgressHandlers: Set<LogoLoadingProgressHandler> = new Set();
  private logosLoaded: boolean = false;

  private constructor() {
    TokenService.instanceCount++;
    console.log(`[TokenService] Creating instance #${TokenService.instanceCount}`);
    // Initialize the database immediately and store the promise
    this.dbInitPromise = this.initDB();
  }

  public static getInstance(): TokenService {
    if (!TokenService.instance) {
      console.log('[TokenService] Creating singleton instance');
      TokenService.instance = new TokenService();
    }
    return TokenService.instance;
  }

  private async initDB(): Promise<void> {
    if (this.isInitializing) {
      console.log('[TokenService] Database initialization already in progress, waiting...');
      // Wait for existing initialization to complete
      while (this.isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (this.initializationError) {
        throw this.initializationError;
      }
      return;
    }

    this.isInitializing = true;
    this.initializationError = null;
    const self = this;

    try {
      console.log('[TokenService] Starting database initialization...');
      
      // Wait for auth to be initialized first
      console.log('[TokenService] Waiting for authentication...');
      await authService.init();
      console.log('[TokenService] Authentication completed');

      // Check if IndexedDB is available
      if (!window.indexedDB) {
        throw new Error('IndexedDB is not available in this browser');
      }
      console.log('[TokenService] IndexedDB is available');

      // Only delete the database if we need to upgrade
      console.log('[TokenService] Checking existing databases...');
      const existingDB = await window.indexedDB.databases();
      console.log('[TokenService] Existing databases:', existingDB);
      const currentDB = existingDB.find(db => db.name === DB_NAME);
      
      // If database exists but is wrong version, delete it
      if (currentDB && currentDB.version && currentDB.version < DB_VERSION) {
        console.log(`[TokenService] Deleting old database version ${currentDB.version} to upgrade to ${DB_VERSION}`);
        
        // First, try to close any existing connections
        if (this.db) {
          console.log('[TokenService] Closing existing database connection');
          this.db.close();
          this.db = null;
        }

        // Helper function to open database with new version first
        const openWithNewVersion = (dbName: string): Promise<IDBDatabase> => {
          return new Promise((resolve, reject) => {
            console.log(`[TokenService] Attempting to open ${dbName} with new version ${DB_VERSION}`);
            const openRequest = window.indexedDB.open(dbName, DB_VERSION);
            
            openRequest.onupgradeneeded = (event: any) => {
              console.log(`[TokenService] Upgrade needed for ${dbName} from version ${event.oldVersion} to ${DB_VERSION}`);
              const db = event.target.result;
              // Don't create stores - we're going to delete this anyway
              db.onversionchange = () => {
                db.close();
              };
            };
            
            openRequest.onsuccess = (event: any) => {
              const db = event.target.result;
              console.log(`[TokenService] Successfully opened ${dbName} with version ${db.version}`);
              resolve(db);
            };
            
            openRequest.onerror = (event: any) => {
              const error = event.target?.error;
              console.error(`[TokenService] Error opening ${dbName}:`, error);
              reject(error);
            };
          });
        };

        // Helper function to delete a single database with proper error handling
        const deleteDatabase = (dbName: string): Promise<void> => {
          return new Promise((resolve, reject) => {
            console.log(`[TokenService] Attempting to delete database: ${dbName}`);
            
            let timeoutId: NodeJS.Timeout;
            let isResolved = false;

            // Create the delete request
            const deleteRequest = window.indexedDB.deleteDatabase(dbName);
            
            const cleanup = () => {
              if (timeoutId) {
                clearTimeout(timeoutId);
              }
            };

            // Add timeout to the deletion request
            timeoutId = setTimeout(() => {
              if (!isResolved) {
                console.warn(`[TokenService] Database deletion timed out for ${dbName}`);
                cleanup();
                reject(new Error(`Database deletion timed out for ${dbName}`));
              }
            }, 10000); // 10 second timeout
            
            deleteRequest.onerror = (event: any) => {
              if (isResolved) return;
              isResolved = true;
              cleanup();
              
              const error = event.target?.error;
              const errorDetails = {
                name: error?.name || 'Unknown',
                message: error?.message || 'No error message',
                code: error?.code || 'No error code'
              };
              console.error(`[TokenService] Error deleting database ${dbName}:`, errorDetails);
              reject(new Error(`Failed to delete database: ${errorDetails.message}`));
            };
            
            deleteRequest.onsuccess = () => {
              if (isResolved) return;
              isResolved = true;
              cleanup();
              console.log(`[TokenService] Successfully deleted database: ${dbName}`);
              resolve();
            };
            
            deleteRequest.onblocked = async () => {
              console.warn(`[TokenService] Database ${dbName} deletion blocked - attempting to unblock...`);
              
              try {
                // Try to close any other connections
                const tempRequest = window.indexedDB.open(dbName);
                
                tempRequest.onsuccess = (event: any) => {
                  const tempDB = event.target.result;
                  const version = tempDB.version;
                  console.log(`[TokenService] Successfully opened blocked database ${dbName} (version ${version})`);
                  
                  // Close the temporary connection
                  tempDB.close();
                  console.log(`[TokenService] Closed temporary connection to ${dbName}`);
                  
                  // Wait a bit then retry the deletion
                  setTimeout(() => {
                    if (isResolved) return;
                    
                    console.log(`[TokenService] Retrying deletion of ${dbName} after unblocking`);
                    const retryRequest = window.indexedDB.deleteDatabase(dbName);
                    
                    retryRequest.onsuccess = () => {
                      if (isResolved) return;
                      isResolved = true;
                      cleanup();
                      console.log(`[TokenService] Successfully deleted ${dbName} after unblocking`);
                      resolve();
                    };
                    
                    retryRequest.onerror = (retryEvent: any) => {
                      if (isResolved) return;
                      isResolved = true;
                      cleanup();
                      const retryError = retryEvent.target?.error;
                      console.error(`[TokenService] Failed to delete ${dbName} after unblocking:`, retryError);
                      reject(new Error(`Failed to delete database after unblocking: ${retryError?.message || 'Unknown error'}`));
                    };
                  }, 2000);
                };
                
                tempRequest.onerror = (openError: any) => {
                  if (isResolved) return;
                  isResolved = true;
                  cleanup();
                  console.error(`[TokenService] Could not open blocked database ${dbName}:`, openError);
                  reject(new Error(`Could not open blocked database: ${openError?.target?.error?.message || 'Unknown error'}`));
                };
              } catch (e: unknown) {
                if (isResolved) return;
                isResolved = true;
                cleanup();
                console.error(`[TokenService] Failed to unblock ${dbName}:`, e);
                reject(new Error(`Failed to unblock database: ${e instanceof Error ? e.message : 'Unknown error'}`));
              }
            };
          });
        };

        try {
          // For version upgrade, we only need to delete our specific database
          console.log('[TokenService] Attempting version upgrade deletion...');
          let attempts = 0;
          const maxAttempts = 3;
          
          while (attempts < maxAttempts) {
            try {
              // First open with new version
              const db = await openWithNewVersion(DB_NAME);
              db.close();
              
              // Then delete
              await deleteDatabase(DB_NAME);
              break; // Success - exit retry loop
            } catch (error) {
              attempts++;
              console.error(`[TokenService] Deletion attempt ${attempts} failed:`, error);
              if (attempts === maxAttempts) {
                throw error; // Rethrow if all attempts failed
              }
              console.log(`[TokenService] Retry ${attempts} for database version upgrade`);
              // Increase delay between attempts
              await new Promise(resolve => setTimeout(resolve, 3000 * attempts));
            }
          }

          console.log('[TokenService] Database deleted successfully for version upgrade');
          
          // Add a longer delay after successful deletion
          await new Promise(resolve => setTimeout(resolve, 5000));
          console.log('[TokenService] Version upgrade deletion cleanup complete');
        } catch (error) {
          console.error('[TokenService] Error during version upgrade deletion:', error);
          throw error;
        }
      }

      // Open database with error handling and timeout
      console.log('[TokenService] Opening database...');
      this.db = await Promise.race([
        new Promise<IDBPDatabase<TokenDB>>((resolve, reject) => {
          console.log('[TokenService] Creating openDB request...');
          
          let openAttempts = 0;
          const maxAttempts = 3;
          
          const attemptOpen = () => {
            openAttempts++;
            console.log(`[TokenService] Attempt ${openAttempts} to open database`);
            
            const openRequest = openDB<TokenDB>(DB_NAME, DB_VERSION, {
              upgrade(db, oldVersion, newVersion, transaction, event) {
                console.log(`[TokenService] Upgrading database from ${oldVersion} to ${newVersion}`);
                
                // Create stores if they don't exist
                if (!db.objectStoreNames.contains(LOGO_STORE)) {
                  console.log('[TokenService] Creating LOGO_STORE');
                  db.createObjectStore(LOGO_STORE);
                }
                if (!db.objectStoreNames.contains(WHITELIST_STORE)) {
                  console.log('[TokenService] Creating WHITELIST_STORE');
                  db.createObjectStore(WHITELIST_STORE);
                }
                console.log('[TokenService] Upgrade complete');
              },
              blocked(currentVersion, blockedVersion, event) {
                console.warn('[TokenService] Database upgrade blocked:', { currentVersion, blockedVersion });
                // Force reload if blocked
                if (window.confirm('Database upgrade is blocked. Click OK to reload the page and try again.')) {
                  window.location.href = window.location.href;
                }
              },
              blocking(currentVersion, blockedVersion, event) {
                console.warn('[TokenService] Database is blocking:', { currentVersion, blockedVersion });
                // Close our connection to let the other tab upgrade
                if (self.db) {
                  self.db.close();
                }
              },
              terminated() {
                console.error('[TokenService] Database connection was terminated');
                reject(new Error('Database connection terminated'));
              }
            });
            
            openRequest
              .then(resolve)
              .catch(error => {
                console.error(`[TokenService] Error opening database (attempt ${openAttempts}):`, error);
                if (openAttempts < maxAttempts) {
                  console.log('[TokenService] Retrying database open...');
                  setTimeout(attemptOpen, 1000);
                } else {
                  reject(error);
                }
              });
          };
          
          attemptOpen();
        }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Database open timed out after 10 seconds')), 10000)
        )
      ]).catch(error => {
        console.error('[TokenService] Critical database error:', error);
        // Force reload on timeout or critical error
        if (window.confirm('Failed to initialize database. Click OK to reload the page and try again.')) {
          window.location.href = window.location.href;
        }
        throw error;
      });

      console.log('[TokenService] Database initialized successfully');
    } catch (error) {
      console.error('[TokenService] Failed to initialize TokenDB:', error);
      console.log('[TokenService] Browser info:', {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        vendor: navigator.vendor
      });
      this.initializationError = error as Error;
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  // Helper method to ensure DB is initialized
  private async ensureDB(): Promise<IDBPDatabase<TokenDB>> {
    try {
      // Add timeout for database initialization (increased to 30 seconds)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Database initialization timed out after 30 seconds')), 30000);
      });

      // Wait for initialization with timeout
      await Promise.race([this.dbInitPromise, timeoutPromise]);

      if (!this.db) {
        console.log('[TokenService] Database not initialized, attempting to reinitialize...');
        // Try to initialize again if it failed
        await this.initDB();
      }

      if (!this.db) {
        throw new Error('Database failed to initialize after retry');
      }

      return this.db;
    } catch (error) {
      console.error('[TokenService] Error ensuring database:', error);
      throw error; // Don't proceed without database - it's critical
    }
  }

  public async getMetadata(canisterId: string): Promise<FormattedTokenMetadata> {
    try {
      // Try to get from localStorage first
      const cachedMetadata = getCachedTokenMetadata(canisterId);
      if (cachedMetadata) {
        return {
          name: cachedMetadata.name || 'Unknown Token',
          symbol: cachedMetadata.symbol || 'UNKNOWN',
          decimals: cachedMetadata.decimals,
          fee: cachedMetadata.fee || BigInt(0),
          hasLogo: Boolean(cachedMetadata.hasLogo),
          standard: cachedMetadata.standard
        };
      }

      // If not in cache, throw error
      throw new Error(`No metadata found in cache for token ${canisterId}. All metadata must be loaded at startup.`);
    } catch (error) {
      console.error('Error getting token metadata:', error);
      throw error;
    }
  }

  public async clearCache(type?: 'logo' | 'all'): Promise<void> {
    console.log(`[TokenService] Clearing cache, type: ${type || 'all'}`);
    
    try {
      const db = await this.ensureDB();

      if (type === 'logo' || type === 'all') {
        const transaction = db.transaction(LOGO_STORE, 'readwrite');
        await transaction.objectStore(LOGO_STORE).clear();
        console.log('Logo cache cleared');
      }

      if (type === 'all') {
        clearTokenMetadataCache();
        console.log('Token metadata cache cleared');
      }
    } catch (error) {
      console.error('Error clearing cache:', error);
      throw error;
    }
  }

  public async getCachedLogo(canisterId: string): Promise<string | null> {
    try {
      const db = await this.ensureDB();
      const tx = db.transaction(LOGO_STORE, 'readonly');
      const store = tx.objectStore(LOGO_STORE);
      const cached = await store.get(canisterId);
      
      if (cached !== undefined) {
        return cached;
      }
      
      console.log(`[TokenService] No cached logo found for ${canisterId}`);
      return null;
    } catch (error) {
      console.error('Error getting cached logo:', error);
      return null;
    }
  }

  private async cacheLogo(canisterId: string, logo: string | null): Promise<void> {
    try {
      const db = await this.ensureDB();
      const tx = db.transaction(LOGO_STORE, 'readwrite');
      const store = tx.objectStore(LOGO_STORE);
      
      if (logo === null) {
        console.log(`[TokenService] Caching null logo for ${canisterId} (failed attempt)`);
      } else {
        console.log(`[TokenService] Caching logo for ${canisterId}`);
      }
      
      await store.put(logo, canisterId);
      await tx.done;
    } catch (error) {
      console.error('Error caching logo:', error);
      throw error;
    }
  }

  private async getBackendActor() {
    if (this.backendActor) return this.backendActor;

    const agent = await this.getAgent();
    this.backendActor = Actor.createActor(idlFactory, {
      agent,
      canisterId: process.env.CANISTER_ID_SWAPRUNNER_BACKEND!,
    });

    return this.backendActor;
  }

  private async getTokenActor(canisterId: string): Promise<any> {
    if (this.tokenActors.has(canisterId)) {
      return this.tokenActors.get(canisterId)!;
    }

    try {
      const agent = await this.getAgent();
      const actor = Actor.createActor(icrc1IdlFactory, {
        agent,
        canisterId,
      });

      this.tokenActors.set(canisterId, actor);
      return actor;
    } catch (error) {
      console.error('Error creating token actor:', error);
      throw error;
    }
  }

  async getMetadataWithLogo(canisterId: string): Promise<TokenMetadata> {
    try {
      // First try to get metadata from cache
      const metadata = await this.getMetadata(canisterId);
      const logo = await this.getTokenLogo(canisterId);
      return {
        ...metadata,
        logo: metadata.symbol === 'ICP' ? '/icp_symbol.svg' : (logo || '/generic_token.svg')
      };
    } catch (error) {
      console.error('Error getting metadata with logo:', error);
      
      // If metadata is not in cache, try to fetch it from backend
      try {
        const actor = await this.getBackendActor();
        const tokenMetadata = await actor.get_token_metadata(Principal.fromText(canisterId));
        
        if (!tokenMetadata) {
          throw new Error(`No metadata found for token ${canisterId}`);
        }

        // Process metadata
        const processedMetadata = {
          name: tokenMetadata.name?.[0] ?? 'Unknown Token',
          symbol: tokenMetadata.symbol?.[0] ?? 'UNKNOWN',
          decimals: tokenMetadata.decimals?.[0] ? Number(tokenMetadata.decimals[0]) : 8,
          fee: tokenMetadata.fee?.[0] ?? BigInt(0),
          hasLogo: Boolean(tokenMetadata.hasLogo),
          standard: tokenMetadata.standard || 'ICRC1'
        };

        // Cache the metadata
        await cacheTokenMetadata(canisterId);

        // Get logo and return complete metadata
        const logo = await this.getTokenLogo(canisterId);
        return {
          ...processedMetadata,
          logo: processedMetadata.symbol === 'ICP' ? '/icp_symbol.svg' : (logo || '/generic_token.svg')
        };
      } catch (backendError: any) {
        console.error('Error fetching metadata from backend:', backendError);
        throw new Error(`Failed to get metadata for token ${canisterId}: ${backendError?.message || 'Unknown error'}`);
      }
    }
  }

  private parseMetadataWithoutLogo(response: MetadataResponse): TokenMetadata {
    const metadata: Partial<TokenMetadata> = {
      name: undefined,
      symbol: undefined,
      decimals: undefined,
      fee: undefined,
      hasLogo: false,
      standard: "ICRC1"
    };
    let hasLogo = false;

    for (const [key, value] of response) {
      switch (key) {
        case 'icrc1:name':
          if ('Text' in value) metadata.name = value.Text;
          break;
        case 'icrc1:symbol':
          if ('Text' in value) metadata.symbol = value.Text;
          break;
        case 'icrc1:decimals':
          if ('Nat' in value) metadata.decimals = Number(value.Nat);
          break;
        case 'icrc1:fee':
          if ('Nat' in value) metadata.fee = value.Nat;
          break;
        case 'icrc1:logo':
          if ('Text' in value) {
            const logoUrl = value.Text;
            hasLogo = isValidLogo(logoUrl);
          }
          break;
      }
    }

    // Log all metadata fields before returning
    console.log('Parsed metadata:', {
      ...metadata,
      fee: metadata.fee?.toString()  // Convert BigInt to string for logging
    });

    // Return with defaults for undefined values
    return {
      name: metadata.name || 'Unknown Token',
      symbol: metadata.symbol || 'UNKNOWN',
      decimals: metadata.decimals ?? 8,
      fee: metadata.fee || BigInt(0),
      hasLogo,
      standard: "ICRC1"
    };
  }

  private async getAgent() {
    if (this.agent) return this.agent;

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

    return this.agent;
  }

  async addToken(canisterId: Principal, metadata: WhitelistTokenMetadata, logo?: string): Promise<void> {
    try {
        const actor = await this.getBackendActor();
        const result = await actor.add_token({
            canisterId,
            metadata: {
                name: metadata.name === null ? [] : [metadata.name],
                symbol: metadata.symbol === null ? [] : [metadata.symbol],
                fee: metadata.fee === null ? [] : [metadata.fee],
                decimals: metadata.decimals === null ? [] : [metadata.decimals],
                hasLogo: metadata.hasLogo,
                standard: metadata.standard,
            },
            logo: logo ? [logo] : [],
        });
        if ('err' in result) throw new Error(result.err);
    } catch (error) {
        console.error('Error adding token:', error);
        throw error;
    }
  }

  async removeToken(canisterId: Principal): Promise<void> {
    try {
        const actor = await this.getBackendActor();
        const result = await actor.remove_token(canisterId);
        if ('err' in result) throw new Error(result.err);
    } catch (error) {
        console.error('Error removing token:', error);
        throw error;
    }
  }

  async getTokenLogo(canisterId: string): Promise<string | null> {
    try {
      if (canisterId === 'ryjl3-tyaaa-aaaaa-aaaba-cai') {
        return '/icp_symbol.svg';
      }

      if (!this.logosLoaded) {
        return 'https://wqfao-piaaa-aaaag-qj5ba-cai.raw.icp0.io/' + canisterId;
      }

      const cachedLogo = await this.getCachedLogo(canisterId);
      if (cachedLogo !== null) {
        return cachedLogo || '/generic_token.svg';
      }

      const logo = await this._fetchTokenLogo(canisterId);
      await this.cacheLogo(canisterId, logo);
      return logo || '/generic_token.svg';
    } catch (error) {
      console.error('Error getting token logo:', error);
      return '/generic_token.svg';
    }
  }

  private async _fetchTokenLogo(canisterId: string): Promise<string | null> {
    try {
      const actor = await this.getBackendActor();
      const result = await actor.get_token_logo(Principal.fromText(canisterId));
      
      console.log(`[TokenService][_fetchTokenLogo] Raw result for ${canisterId}:`, {
        resultType: typeof result,
        isArray: Array.isArray(result),
        length: Array.isArray(result) ? result.length : null,
        value: result
      });
      
      if (!result || !Array.isArray(result) || result.length === 0) {
        console.log(`[TokenService][_fetchTokenLogo] No logo found for ${canisterId}`);
        return null;
      }
      
      const logo = result[0];
      console.log(`[TokenService][_fetchTokenLogo] Logo value for ${canisterId}:`, {
        logoType: typeof logo,
        logoValue: logo,
        isValid: isValidLogo(logo)
      });
      
      if (!isValidLogo(logo)) {
        console.log(`[TokenService][_fetchTokenLogo] Invalid logo format for ${canisterId}:`, logo);
        return null;
      }
      
      return logo;
    } catch (error) {
      console.error(`[TokenService][_fetchTokenLogo] Error getting token logo for ${canisterId}:`, error);
      return null;
    }
  }

  async getWhitelistedTokens(): Promise<[Principal, WhitelistTokenMetadata][]> {
    try {
      console.log('Getting whitelisted tokens...');
      const actor = await this.getBackendActor();
      console.log('Got backend actor, calling get_whitelisted_tokens...');
      const tokens = await actor.get_whitelisted_tokens();
      console.log('Received whitelisted tokens from backend:', tokens);
      return tokens;
    } catch (error) {
      console.error('Error getting whitelisted tokens:', error);
      throw error;
    }
  }

  private isWhitelistCacheStale(cache: WhitelistCache): boolean {
    const age = Date.now() - cache.timestamp;
    const isStale = age > 5 * 60 * 1000; // 5 minutes
    console.log(`[${new Date().toISOString()}] isWhitelistCacheStale: Cache age=${age}ms, isStale=${isStale}`);
    return isStale;
  }

  async getAllTokens(): Promise<[Principal, WhitelistTokenMetadata][]> {
    console.log(`[${new Date().toISOString()}] getAllTokens: Starting...`);
    
    try {
      console.log(`[${new Date().toISOString()}] getAllTokens: Ensuring DB is initialized...`);
      await this.ensureDB();
      
      console.log(`[${new Date().toISOString()}] getAllTokens: Checking whitelist cache`);
      let cache = null;
      try {
        cache = await this.getWhitelistCache();
      } catch (cacheError) {
        console.error(`[${new Date().toISOString()}] getAllTokens: Error reading cache:`, cacheError);
        // Continue without cache
      }

      if (cache) {
        const isStale = this.isWhitelistCacheStale(cache);
        console.log(`[${new Date().toISOString()}] getAllTokens: Cache found, timestamp=${new Date(cache.timestamp).toISOString()}, isStale=${isStale}`);
        if (!isStale) {
          console.log(`[${new Date().toISOString()}] getAllTokens: Using cached whitelist with ${cache.tokens.length} tokens`);
          return cache.tokens.map(([id, metadata]) => [Principal.fromText(id), metadata]);
        }
      }

      console.log(`[${new Date().toISOString()}] getAllTokens: Getting backend actor...`);
      const actor = await this.getBackendActor();
      
      console.log(`[${new Date().toISOString()}] getAllTokens: Fetching fresh whitelist from backend...`);
      const tokens = await actor.get_all_tokens();
      console.log(`[${new Date().toISOString()}] getAllTokens: Received ${tokens.length} tokens from backend`);
      
      // Process tokens to unwrap Motoko optionals
      console.log(`[${new Date().toISOString()}] getAllTokens: Processing tokens...`);
      const processedTokens = tokens.map(([principal, metadata]: [Principal, any]) => [
        principal,
        {
          name: metadata.name?.[0] ?? null,
          symbol: metadata.symbol?.[0] ?? null,
          decimals: metadata.decimals?.[0] ? Number(metadata.decimals[0]) : 8,
          fee: metadata.fee?.[0] ?? null,
          hasLogo: Boolean(metadata.hasLogo),
          standard: metadata.standard || 'ICRC1'
        }
      ]);
      
      // Update cache with processed tokens
      console.log(`[${new Date().toISOString()}] getAllTokens: Updating cache with ${processedTokens.length} tokens...`);
      try {
        await this.updateWhitelistCache(processedTokens.map(([p, m]: [Principal, WhitelistTokenMetadata]) => [p.toString(), m]));
        console.log(`[${new Date().toISOString()}] getAllTokens: Cache updated successfully`);
      } catch (cacheError) {
        console.error(`[${new Date().toISOString()}] getAllTokens: Error updating cache:`, cacheError);
        // Continue without cache update
      }
      
      console.log(`[${new Date().toISOString()}] getAllTokens: Returning ${processedTokens.length} tokens`);
      return processedTokens;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] getAllTokens: Critical error:`, error);
      throw error;
    }
  }

  private async getWhitelistCache(): Promise<WhitelistCache | null> {
    console.log(`[${new Date().toISOString()}] getWhitelistCache: Starting...`);
    
    try {
      console.log(`[${new Date().toISOString()}] getWhitelistCache: Getting DB...`);
      const db = await this.ensureDB();
      
      console.log(`[${new Date().toISOString()}] getWhitelistCache: Creating transaction...`);
      const tx = db.transaction(WHITELIST_STORE, 'readonly');
      const store = tx.objectStore(WHITELIST_STORE);
      
      console.log(`[${new Date().toISOString()}] getWhitelistCache: Getting 'current' from store...`);
      const result = await store.get('current');
      
      if (!result) {
        console.log(`[${new Date().toISOString()}] getWhitelistCache: No cache entry found`);
        return null;
      }
      
      console.log(`[${new Date().toISOString()}] getWhitelistCache: Found cache with ${result.tokens?.length || 0} tokens`);
      return result as WhitelistCache;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] getWhitelistCache: Error:`, error);
      throw error;
    }
  }

  private async updateWhitelistCache(tokens: [string, WhitelistTokenMetadata][]): Promise<void> {
    console.log(`[${new Date().toISOString()}] updateWhitelistCache: Starting with ${tokens.length} tokens...`);
    
    try {
      console.log(`[${new Date().toISOString()}] updateWhitelistCache: Getting DB...`);
      const db = await this.ensureDB();
      
      console.log(`[${new Date().toISOString()}] updateWhitelistCache: Creating transaction...`);
      const tx = db.transaction(WHITELIST_STORE, 'readwrite');
      const store = tx.objectStore(WHITELIST_STORE);
      
      const cache: WhitelistCache = {
        tokens,
        timestamp: Date.now()
      };
      
      console.log(`[${new Date().toISOString()}] updateWhitelistCache: Putting cache in store...`);
      await store.put(cache, 'current');
      
      console.log(`[${new Date().toISOString()}] updateWhitelistCache: Waiting for transaction to complete...`);
      await tx.done;
      
      console.log(`[${new Date().toISOString()}] updateWhitelistCache: Cache updated successfully`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] updateWhitelistCache: Error:`, error);
      throw error;
    }
  }

  async syncWhitelist(): Promise<void> {
    try {
      const tokens = await this.getAllTokens();
      
      // Cache each token's metadata in localStorage
      for (const [canisterId, metadata] of tokens) {
        if (metadata) {
          await cacheTokenMetadata(canisterId.toString());
        }
      }
      
      // Update whitelist cache
      await this.updateWhitelistCache(tokens.map(([principal, metadata]) => [
        principal.toString(),
        metadata
      ]));
    } catch (error) {
      console.error('Error syncing whitelist:', error);
      throw error;
    }
  }

  private isMetadataStale(metadata: WhitelistTokenMetadata & { timestamp: number }): boolean {
    return Date.now() - metadata.timestamp > CACHE_DURATION;
  }

  // Force refresh the whitelist and all metadata
  public async refreshTokenCache(): Promise<void> {
    if (!this.db) return;

    try {
      const tx = this.db.transaction([LOGO_STORE], 'readwrite');
      await tx.objectStore(LOGO_STORE).clear();
      await tx.done;
      clearTokenMetadataCache();
    } catch (error) {
      console.error('Error refreshing token cache:', error);
      throw error;
    }
  }

  async getPopularTokens(n: number = 4): Promise<[Principal, WhitelistTokenMetadata][]> {
    try {
      const actor = await this.getBackendActor();
      console.log('Calling get_popular_tokens...');
      const result = await actor.get_popular_tokens(n);
      console.log('Raw result from backend:', result);
      const mapped = result.map(([principal, metadata]: [Principal, any]) => [
        principal,
        {
          name: metadata.name?.[0] ?? null,
          symbol: metadata.symbol?.[0] ?? null,
          decimals: metadata.decimals?.[0] ? Number(metadata.decimals[0]) : 8,
          fee: metadata.fee?.[0] ?? null,
          hasLogo: Boolean(metadata.hasLogo),
          standard: metadata.standard || 'ICRC1'
        }
      ]);
      console.log('Mapped popular tokens:', mapped);
      return mapped;
    } catch (error) {
      console.error('Error getting popular tokens:', error);
      throw error;
    }
  }

  async startICPSwapImport(batchSize: number): Promise<void> {
    try {
        const actor = await this.getBackendActor();
        const result = await actor.start_icpswap_import(batchSize);
        if ('err' in result) throw new Error(result.err);
    } catch (error) {
        console.error('Error starting ICPSwap import:', error);
        throw error;
    }
  }

  async stopICPSwapImport(): Promise<void> {
    try {
        const actor = await this.getBackendActor();
        const result = await actor.stop_icpswap_import();
        if ('err' in result) throw new Error(result.err);
    } catch (error) {
        console.error('Error stopping import:', error);
        throw error;
    }
  }

  async copyICPSwapTokens(): Promise<string> {
    try {
        const actor = await this.getBackendActor();
        const result = await actor.copy_icpswap_trusted_tokens();
        if ('err' in result) throw new Error(result.err);
        return result.ok;
    } catch (error) {
        console.error('Error copying ICPSwap tokens:', error);
        throw error;
    }
  }

  // Update the updateICPSwapTokenLogos method
  async updateICPSwapTokenLogos(batchSize: number = 10): Promise<string> {
    try {
        const actor = await this.getBackendActor();
        const result = await actor.update_icpswap_token_logos(batchSize);
        if ('err' in result) throw new Error(result.err);
        return result.ok;
    } catch (error) {
        console.error('Error updating ICPSwap token logos:', error);
        throw error;
    }
  }

  // Add method to get logo update progress
  async getLogoUpdateProgress(): Promise<LogoUpdateProgress> {
    try {
        const actor = await this.getBackendActor();
        const progress = await actor.get_logo_update_progress();
        return {
            total_tokens: Number(progress.total_tokens),
            processed_count: Number(progress.processed_count),
            updated_count: Number(progress.updated_count),
            skipped_count: Number(progress.skipped_count),
            failed_count: Number(progress.failed_count),
            is_running: progress.is_running,
            last_processed: progress.last_processed ? progress.last_processed.toString() : null
        };
    } catch (error) {
        console.error('Error getting logo update progress:', error);
        throw error;
    }
  }

  // Add method to stop logo update
  async stopLogoUpdate(): Promise<void> {
    try {
        const actor = await this.getBackendActor();
        const result = await actor.stop_logo_update();
        if ('err' in result) throw new Error(result.err);
    } catch (error) {
        console.error('Error stopping logo update:', error);
        throw error;
    }
  }

  async getImportProgress(): Promise<ImportProgress> {
    try {
      const actor = await this.getBackendActor();
      const result = await actor.get_import_progress();
      return {
        last_processed: result.last_processed[0] || null,
        total_tokens: Number(result.total_tokens),
        processed_count: Number(result.processed_count),
        imported_count: Number(result.imported_count),
        skipped_count: Number(result.skipped_count),
        failed_count: Number(result.failed_count),
        is_running: result.is_running
      };
    } catch (error) {
      console.error('Error getting import progress:', error);
      throw error;
    }
  }

  async clearWhitelist(): Promise<void> {
    try {
      const actor = await this.getBackendActor();
      const result = await actor.clear_whitelist();
      if ('err' in result) throw new Error(result.err);
    } catch (error) {
      console.error('Error clearing whitelist:', error);
      throw error;
    }
  }

  async getCustomTokens(): Promise<[Principal, WhitelistTokenMetadata][]> {
    try {
      const actor = await this.getBackendActor();
      const tokens = await actor.get_custom_tokens();
      return tokens.map(([principal, metadata]: [Principal, any]) => [
        principal,
        {
          name: metadata.name?.[0] ?? null,
          symbol: metadata.symbol?.[0] ?? null,
          decimals: metadata.decimals?.[0] ? Number(metadata.decimals[0]) : 8,
          fee: metadata.fee?.[0] ?? null,
          hasLogo: Boolean(metadata.hasLogo),
          standard: metadata.standard || 'ICRC1'
        }
      ]);
    } catch (error) {
      console.error('Error getting custom tokens:', error);
      return [];
    }
  }

  async getPaginatedLogos(start_index: number = 0): Promise<PaginatedLogosResponse> {
    try {
      console.log(`[TokenService][getPaginatedLogos] Requesting logos from index ${start_index}`);
      const actor = await this.getBackendActor();
      const result = await actor.get_paginated_logos(BigInt(start_index));
      console.log(`[TokenService][getPaginatedLogos] Raw response:`, result);
      
      // Convert the response to the frontend format
      const response = {
        items: result.items.map(([principal, logo]: [Principal, string | null]) => [
          principal,
          logo
        ]),
        total: Number(result.total),
        start_index: Number(result.start_index)
      };
      
      console.log(`[TokenService][getPaginatedLogos] Processed response: ${response.items.length} items, total: ${response.total}`);
      return response;
    } catch (error) {
      console.error('[TokenService][getPaginatedLogos] Error:', error);
      throw error;
    }
  }

  // Add methods for progress event handling
  onLogoLoadingProgress(handler: LogoLoadingProgressHandler) {
    this.logoLoadingProgressHandlers.add(handler);
  }

  offLogoLoadingProgress(handler: LogoLoadingProgressHandler) {
    this.logoLoadingProgressHandlers.delete(handler);
  }

  private emitLogoLoadingProgress(progress: LogoLoadingProgress) {
    this.logoLoadingProgressHandlers.forEach(handler => handler(progress));
  }

  async loadLogosInBackground(): Promise<void> {
    let processedPrincipals = new Set<string>();
    let duplicateCount = 0;

    this.logosLoaded = false;

    // Check if we've loaded logos recently by getting the persisted time from IndexedDB
    const lastLoadTime = await this.getLastLogoLoadTime();
    if (lastLoadTime > 0 && Date.now() - lastLoadTime < this.LOGO_PAGE_LOAD_INTERVAL) {
      console.log('[TokenService][loadLogosInBackground] Skipping, last load was recent:', new Date(lastLoadTime));
      this.logosLoaded = true;
      return;
    }

    console.log('[TokenService][loadLogosInBackground] Starting background logo loading');
    this.emitLogoLoadingProgress({
      isLoading: true,
      totalTokens: 0,
      processedTokens: 0,
      cachedTokens: 0,
      skippedTokens: 0,
      progress: 0
    });

    try {
      let totalProcessed = 0;
      let totalCached = 0;
      let totalSkipped = 0;
      let startTime = Date.now();
      let currentIndex = 0;

      // Get current number of cached logos from local IndexedDB
      const initialCachedCount = await this.getLocalCachedLogoCount();
      console.log(`[TokenService][loadLogosInBackground] Starting with ${initialCachedCount} locally cached logos`);

      while (true) {
        const pageStartTime = Date.now();
        console.log(`[TokenService][loadLogosInBackground] Fetching logos from index ${currentIndex}...`);
        const result = await this.getPaginatedLogos(currentIndex);
        
        console.log(`[TokenService][loadLogosInBackground] Processing ${result.items.length} items from total of ${result.total}`);
        
        // If we got no items or reached the end, stop
        if (result.items.length === 0 || currentIndex >= result.total) {
          console.log(`[TokenService][loadLogosInBackground] Reached end of items (${totalProcessed}/${result.total}), stopping`);
          break;
        }
        
        // Process logos in this batch
        for (const [principal, logo] of result.items) {
          const principalStr = principal.toString();
          
          // Add duplicate detection
          if (processedPrincipals.has(principalStr)) {
            console.log(`[TokenService][loadLogosInBackground] DUPLICATE PRINCIPAL DETECTED: ${principalStr}`);
            duplicateCount++;
            continue; // Skip processing duplicates
          }
          processedPrincipals.add(principalStr);
          
          totalProcessed++;
          
          if (logo) {
            const isValid = isValidLogo(logo);
            
            if (isValid) {
              await this.cacheLogo(principalStr, logo);
              totalCached++;
            } else {
              console.log(`[TokenService][loadLogosInBackground] Invalid logo format for ${principalStr}`);
              await this.cacheLogo(principalStr, null);
              totalSkipped++;
            }
          } else {
            console.log(`[TokenService][loadLogosInBackground] No logo data for ${principalStr}`);
            await this.cacheLogo(principalStr, null);
            totalSkipped++;
          }

          // Emit progress after each logo is processed
          this.emitLogoLoadingProgress({
            isLoading: true,
            totalTokens: result.total,
            processedTokens: totalProcessed,
            cachedTokens: totalCached,
            skippedTokens: totalSkipped,
            progress: (totalProcessed / result.total) * 100
          });
        }

        // Move to next batch
        currentIndex += result.items.length;
        const progress = ((totalProcessed / result.total) * 100).toFixed(1);
        console.log(`[TokenService][loadLogosInBackground] Progress: ${progress}% (${totalProcessed}/${result.total}, ${totalCached} cached, ${totalSkipped} skipped)`);
        
        // Add a small delay between batches to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      this.logosLoaded = true;

      const totalTime = (Date.now() - startTime) / 1000;
      console.log(`[TokenService][loadLogosInBackground] Complete in ${totalTime.toFixed(1)}s`);

      // Get final count from local IndexedDB
      const finalCachedCount = await this.getLocalCachedLogoCount();
      console.log(`[TokenService][loadLogosInBackground] Final stats:
        - Started with: ${initialCachedCount} locally cached logos
        - Total processed: ${totalProcessed}
        - Unique principals: ${processedPrincipals.size}
        - Duplicate principals: ${duplicateCount}
        - Total cached: ${totalCached}
        - Total skipped: ${totalSkipped}
        - New logos cached: ${finalCachedCount - initialCachedCount}
        - Total cached logos: ${finalCachedCount}
        - Time per token: ${(totalTime / totalProcessed).toFixed(2)}s
        - Cache success rate: ${((totalCached / totalProcessed) * 100).toFixed(1)}%`);
      
      // Update last load time in IndexedDB after successful completion
      await this.setLastLogoLoadTime(Date.now());

      // Emit final progress
      this.emitLogoLoadingProgress({
        isLoading: false,
        totalTokens: totalProcessed,
        processedTokens: totalProcessed,
        cachedTokens: totalCached,
        skippedTokens: totalSkipped,
        progress: 100
      });
    } catch (error) {
      console.error('[TokenService][loadLogosInBackground] Error:', error);
      // Emit error state
      this.emitLogoLoadingProgress({
        isLoading: false,
        totalTokens: 0,
        processedTokens: 0,
        cachedTokens: 0,
        skippedTokens: 0,
        progress: 0
      });
      throw error;
    }
  }

  // Get the number of logos cached in the backend
  async getCachedLogoCount(): Promise<number> {
    try {
      const actor = await this.getBackendActor();
      return Number(await actor.get_cached_logo_count());
    } catch (error) {
      console.error('[TokenService] Error getting cached logo count:', error);
      throw error;
    }
  }

  async clearICPSwapTokens(): Promise<void> {
    const actor = await this.getBackendActor();
    const result = await actor.clear_icpswap_tokens();
    if ('err' in result) {
      throw new Error(result.err);
    }
  }

  private async getLastLogoLoadTime(): Promise<number> {
    try {
      const db = await this.ensureDB();
      const tx = db.transaction(LOGO_STORE, 'readonly');
      const store = tx.objectStore(LOGO_STORE);
      const result = await store.get('lastLogoLoadTime');
      return typeof result === 'number' ? result : 0;
    } catch (error) {
      console.error('Error getting last logo load time:', error);
      return 0;
    }
  }

  private async setLastLogoLoadTime(time: number): Promise<void> {
    try {
      const db = await this.ensureDB();
      const tx = db.transaction(LOGO_STORE, 'readwrite');
      const store = tx.objectStore(LOGO_STORE);
      await store.put(time, 'lastLogoLoadTime');
      await tx.done;
    } catch (error) {
      console.error('Error setting last logo load time:', error);
      throw error;
    }
  }

  // Add method to count local cached logos
  private async getLocalCachedLogoCount(): Promise<number> {
    try {
      const db = await this.ensureDB();
      const tx = db.transaction(LOGO_STORE, 'readonly');
      const store = tx.objectStore(LOGO_STORE);
      return await store.count();
    } catch (error) {
      console.error('Error getting cached logo count:', error);
      return 0;
    }
  }

  private async getTokenBalance(canisterId: string, accountId: string): Promise<bigint> {
    if (!this.db) return BigInt(0);

    try {
      const actor = await this.getTokenActor(canisterId);
      const metadata = await this.getMetadata(canisterId);

      if (metadata.standard.toLowerCase().includes('dip20')) {
        // For DIP20, use balanceOf
        const balance = await actor.balanceOf(Principal.fromText(accountId));
        return balance;
      } else {
        // For ICRC1, use icrc1_balance_of
        const balance = await actor.icrc1_balance_of({ owner: Principal.fromText(accountId), subaccount: [] });
        return balance;
      }
    } catch (error) {
      console.error('Error getting token balance:', error);
      return BigInt(0);
    }
  }

  async refreshTokenMetadata(canisterId: string): Promise<WhitelistTokenMetadata> {
    try {
      const actor = await this.getBackendActor();
      const result = await actor.refresh_token_metadata(Principal.fromText(canisterId));
      
      if ('ok' in result) {
        return result.ok;
      } else {
        throw new Error(result.err);
      }
    } catch (error) {
      console.error('Error refreshing token metadata:', error);
      throw error;
    }
  }

  async getTokenMetadata(canisterId: string): Promise<any> {
    try {
      const actor = await this.getBackendActor();
      const result = await actor.get_token_metadata(Principal.fromText(canisterId));
      if (!result) {
        throw new Error(`No metadata found for token ${canisterId}`);
      }
      return result;
    } catch (error) {
      console.error('Error getting token metadata:', error);
      throw error;
    }
  }

  async startMetadataRefresh(batchSize: number): Promise<void> {
    try {
      const backend = await this.getBackendActor();
      const result = await backend.start_metadata_refresh(batchSize);
      if ('err' in result) {
        throw new Error(result.err);
      }
    } catch (error) {
      console.error('Error starting metadata refresh:', error);
      throw error;
    }
  }

  async resumeMetadataRefresh(batchSize: number): Promise<void> {
    try {
      const backend = await this.getBackendActor();
      const result = await backend.resume_metadata_refresh(batchSize);
      if ('err' in result) {
        throw new Error(result.err);
      }
    } catch (error) {
      console.error('Error resuming metadata refresh:', error);
      throw error;
    }
  }

  async stopMetadataRefresh(): Promise<void> {
    try {
      const backend = await this.getBackendActor();
      const result = await backend.stop_metadata_refresh();
      if ('err' in result) {
        throw new Error(result.err);
      }
    } catch (error) {
      console.error('Error stopping metadata refresh:', error);
      throw error;
    }
  }

  async getMetadataRefreshProgress(): Promise<MetadataRefreshProgress> {
    try {
      const actor = await this.getBackendActor();
      const progress = await actor.get_metadata_refresh_progress();
      return {
        total_tokens: Number(progress.total_tokens),
        processed_count: Number(progress.processed_count),
        updated_count: Number(progress.updated_count),
        skipped_count: Number(progress.skipped_count),
        failed_count: Number(progress.failed_count),
        is_running: progress.is_running,
        last_processed: progress.last_processed ? progress.last_processed.toString() : null
      };
    } catch (error) {
      console.error('Error getting metadata refresh progress:', error);
      throw error;
    }
  }

  async getAllCustomTokens(): Promise<[Principal, WhitelistTokenMetadata][]> {
    try {
      const actor = await this.getBackendActor();
      const tokens = await actor.get_all_custom_tokens();
      return tokens.map(([principal, metadata]: [Principal, any]) => [
        principal,
        {
          name: metadata.name?.[0] ?? null,
          symbol: metadata.symbol?.[0] ?? null,
          decimals: metadata.decimals?.[0] ? Number(metadata.decimals[0]) : 8,
          fee: metadata.fee?.[0] ?? null,
          hasLogo: Boolean(metadata.hasLogo),
          standard: metadata.standard || 'ICRC1'
        }
      ]);
    } catch (error) {
      console.error('Error getting all custom tokens:', error);
      return [];
    }
  }
}

// Export singleton instance
export const tokenService = TokenService.getInstance(); 