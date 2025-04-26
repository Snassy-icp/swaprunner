import React, { createContext, useContext, useState, useEffect } from 'react';
import { tokenService } from '../services/token';
import { TokenMetadata } from '../types/token';
import { WhitelistTokenMetadata } from '../services/token';
import { Principal } from '@dfinity/principal';
import { METADATA_CACHE_KEY } from '../utils/format';

interface TokenWithMetadata {
  canisterId: string;
  metadata?: TokenMetadata;
  balance?: string;
  error?: string;
  isLoading: boolean;
}

interface TokenContextType {
  tokens: TokenWithMetadata[];
  isLoadingMetadata: boolean;
  refreshMetadata: () => Promise<void>;
  setTokens: React.Dispatch<React.SetStateAction<TokenWithMetadata[]>>;
}

const TokenContext = createContext<TokenContextType | undefined>(undefined);

export const TokenProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tokens, setTokens] = useState<TokenWithMetadata[]>([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);

  // Sync whitelist and load metadata
  useEffect(() => {
    const syncWhitelistAndLoadMetadata = async () => {
      try {
        setIsLoadingMetadata(true);
        
        // Get all whitelisted tokens first
        const whitelistedTokens: [Principal, WhitelistTokenMetadata][] = await tokenService.getAllTokens();
        console.log('Whitelisted tokens:', whitelistedTokens);
        
        // Get custom tokens (will be empty for anonymous users)
        const customTokensWithMetadata: [Principal, WhitelistTokenMetadata][] = await tokenService.getCustomTokens();
        console.log('Custom tokens with metadata:', customTokensWithMetadata);
        
        // Create a map of custom tokens for quick lookup and to avoid duplicates
        const customTokenMap = new Map(
          customTokensWithMetadata.map(([principal, metadata]) => [principal.toString(), metadata])
        );
        
        // Combine tokens, ensuring custom tokens take precedence
        const allTokens = [
          ...customTokensWithMetadata, // Custom tokens first
          ...whitelistedTokens.filter(([principal]) => !customTokenMap.has(principal.toString())) // Then whitelisted tokens not in custom list
        ];
        
        // Cache all metadata in one go and wait for completion
        await Promise.all(allTokens.map(async ([principal, metadata]) => {
          if (!metadata) throw new Error(`No metadata found for token ${principal.toString()}`);
          const canisterId = principal.toString();
          
          // Store in localStorage cache
          const cache = localStorage.getItem(METADATA_CACHE_KEY);
          const metadataCache = cache ? JSON.parse(cache) : { tokens: {}, timestamp: Date.now() };
          
          metadataCache.tokens[canisterId] = {
            name: metadata.name || 'Unknown Token',
            symbol: metadata.symbol || 'UNKNOWN',
            decimals: metadata.decimals ?? 8,
            fee: metadata.fee?.toString() || null,
            hasLogo: metadata.hasLogo || false,
            standard: metadata.standard || 'ICRC1',
            timestamp: Date.now()
          };
          
          localStorage.setItem(METADATA_CACHE_KEY, JSON.stringify(metadataCache));
        }));
        
        // Initialize tokens state
        setTokens(allTokens.map(([principal, metadata]) => {
          if (!metadata) throw new Error(`No metadata found for token ${principal.toString()}`);
          return {
            canisterId: principal.toString(),
            metadata: {
              name: metadata.name || 'Unknown Token',
              symbol: metadata.symbol || 'UNKNOWN',
              decimals: metadata.decimals ?? 8,
              fee: metadata.fee || BigInt(0),
              hasLogo: metadata.hasLogo,
              standard: metadata.standard || 'ICRC1'
            },
            isLoading: false
          };
        }));

        // Start loading logos in the background - this is not critical for functionality
        tokenService.loadLogosInBackground().catch(error => {
          console.error('Error loading logos in background:', error);
        });

        setIsLoadingMetadata(false);
      } catch (error) {
        console.error('Error syncing tokens:', error);
        setIsLoadingMetadata(false);
        // Don't rethrow - we want to show UI with whatever metadata we have
      }
    };

    syncWhitelistAndLoadMetadata();
  }, []); // Only run on mount

  const refreshMetadata = async () => {
    try {
      setIsLoadingMetadata(true);
      
      // Clear caches and resync whitelist
      await tokenService.clearCache();
      await tokenService.syncWhitelist();
      
      // Get all tokens with fresh metadata
      const allTokens = await tokenService.getAllTokens();
      
      // Update tokens state with fresh metadata
      setTokens(allTokens.map(([principal, metadata]) => ({
        canisterId: principal.toString(),
        metadata: {
          name: metadata.name || 'Unknown Token',
          symbol: metadata.symbol || 'UNKNOWN',
          decimals: metadata.decimals ?? 8,
          fee: metadata.fee || BigInt(0),
          hasLogo: metadata.hasLogo,
          standard: metadata.standard || 'ICRC1'
        },
        isLoading: false
      })));
    } finally {
      setIsLoadingMetadata(false);
    }
  };

  return (
    <TokenContext.Provider value={{ tokens, isLoadingMetadata, refreshMetadata, setTokens }}>
      {children}
    </TokenContext.Provider>
  );
};

export const useTokens = () => {
  const context = useContext(TokenContext);
  if (context === undefined) {
    throw new Error('useTokens must be used within a TokenProvider');
  }
  return context;
}; 
 