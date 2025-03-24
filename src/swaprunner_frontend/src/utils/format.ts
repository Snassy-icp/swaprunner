import { tokenService } from '../services/token';
import { WhitelistTokenMetadata } from '../services/token';

export const METADATA_CACHE_KEY = 'swaprunner_token_metadata_cache';
const METADATA_TIMESTAMP_KEY = 'swaprunner_token_metadata_timestamp';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

interface StoredTokenMetadata {
  name: string | null;
  symbol: string | null;
  decimals: number;  // Required field, no null
  fee: string | null;  // Store bigint as string
  hasLogo: boolean;  // Required field
  standard: string;  // Required field
  timestamp: number;
}

interface TokenMetadataCache {
  tokens: Record<string, StoredTokenMetadata>;
  timestamp: number;
}

/**
 * Cache token metadata in localStorage for sync access
 * Throws if metadata is invalid or missing required fields
 */
export async function cacheTokenMetadata(canisterId: string): Promise<void> {
  if (!canisterId) throw new Error('No canisterId provided');
  
  // Get token metadata first to ensure we have it before modifying cache
  const metadata = await tokenService.getMetadata(canisterId);
  if (!metadata) throw new Error(`No metadata found for token ${canisterId}`);
  
  // Get existing cache or create new one
  let cache: TokenMetadataCache;
  try {
    const cacheStr = localStorage.getItem(METADATA_CACHE_KEY);
    cache = cacheStr ? JSON.parse(cacheStr) : { tokens: {}, timestamp: Date.now() };
  } catch (e) {
    throw new Error(`Invalid cache format: ${e}`);
  }
  
  // Ensure the tokens object exists
  cache.tokens = cache.tokens || {};
  
  // Unwrap array values from Motoko optionals and validate required fields
  // Handle potentially nested arrays like [["ICP"]] -> "ICP"
  const unwrapArray = <T>(value: T | T[] | T[][]): T | null => {
    if (Array.isArray(value)) {
      if (value.length === 0) return null;
      const first = value[0];
      return Array.isArray(first) ? unwrapArray(first) : first;
    }
    return value;
  };

  const name = unwrapArray(metadata.name);
  const symbol = unwrapArray(metadata.symbol);
  const decimals = Number(unwrapArray(metadata.decimals));
  const fee = unwrapArray(metadata.fee);
  
  if (decimals === undefined || decimals === null || isNaN(decimals)) {
    throw new Error(`Invalid decimals for token ${canisterId}`);
  }
  
  if (fee === undefined || fee === null) {
    throw new Error(`Invalid fee for token ${canisterId}`);
  }

  cache.tokens[canisterId] = {
    name: name || 'Unknown Token',
    symbol: symbol || 'UNKNOWN',
    decimals: decimals,
    fee: fee?.toString() || null,
    hasLogo: metadata.hasLogo || false,
    standard: metadata.standard || 'ICRC1',
    timestamp: Date.now()
  };
  
  cache.timestamp = Date.now();
  localStorage.setItem(METADATA_CACHE_KEY, JSON.stringify(cache));
}

/**
 * Get cached token metadata synchronously
 * Throws if not found in cache or if cache is stale
 */
export function getCachedTokenMetadata(canisterId: string): WhitelistTokenMetadata {
  try {
    const cacheStr = localStorage.getItem(METADATA_CACHE_KEY);
    if (!cacheStr) {
      throw new Error(`No metadata cache found for token ${canisterId}`);
    }
    
    const cache: TokenMetadataCache = JSON.parse(cacheStr);
    const metadata = cache.tokens[canisterId];
    
    if (!metadata) {
      throw new Error(`Stale or missing metadata for token ${canisterId}`);
    }
    
    return {
      name: metadata.name || 'Unknown Token',
      symbol: metadata.symbol || 'UNKNOWN',
      decimals: metadata.decimals,
      fee: metadata.fee ? BigInt(metadata.fee) : null,
      hasLogo: Boolean(metadata.hasLogo),
      standard: metadata.standard || 'ICRC1'
    };
  } catch (error) {
    console.error('Error getting cached token metadata:', error);
    throw error;
  }
}

/**
 * Clear the token metadata cache
 */
export function clearTokenMetadataCache(): void {
  localStorage.removeItem(METADATA_CACHE_KEY);
}

/**
 * Format a token amount using the token's metadata for decimals
 * Throws if metadata is not in cache
 */
export function formatTokenAmount(amount_e8s: bigint | null, canisterId: string): string {
  if (!amount_e8s) return '0.0';
  
  const metadata = getCachedTokenMetadata(canisterId);
  const decimals = metadata.decimals;

  // Convert to string
  const str = amount_e8s.toString();
  
  // If string is shorter than decimals, pad with zeros on the left
  const fullStr = str.padStart(decimals, '0');
  
  // Split into integer and decimal parts
  const integerPart = fullStr.slice(0, -decimals) || '0';
  const decimalPart = fullStr.slice(-decimals).replace(/0+$/, '');
  
  return decimalPart ? `${integerPart}.${decimalPart}` : integerPart;
}

/**
 * Parse a decimal string into base units using token metadata
 * Throws if metadata is not in cache
 */
export function parseTokenAmount(input: string, canisterId: string): bigint {
  const metadata = getCachedTokenMetadata(canisterId);
  const decimals = metadata.decimals;

  const [integerPart, fractionPart = ''] = input.split('.');
  const paddedDecimal = fractionPart.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(integerPart + paddedDecimal);
}