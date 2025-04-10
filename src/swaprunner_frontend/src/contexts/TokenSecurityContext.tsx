import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Principal } from '@dfinity/principal';
import { backendService } from '../services/backend';
import { SuspendedStatus } from '../services/admin';

interface SuspendedToken {
  status: 'Temporary' | 'Permanent';
  reason: string;
}

export interface TokenSecurityContextType {
  suspendedTokens: Map<string, SuspendedToken>;
  isTokenSuspended: (tokenId: string) => boolean;
  getTokenSuspensionDetails: (tokenId: string) => SuspendedToken | null;
  refreshSuspendedTokens: () => Promise<void>;
  isLoading: boolean;
  getSuspensionDetails: (canisterId: string) => { reason: string } | null;
}

const TokenSecurityContext = createContext<TokenSecurityContextType | undefined>(undefined);

export const useTokenSecurity = () => {
  const context = useContext(TokenSecurityContext);
  if (!context) {
    throw new Error('useTokenSecurity must be used within a TokenSecurityProvider');
  }
  return context;
};

export const TokenSecurityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [suspendedTokens, setSuspendedTokens] = useState<Map<string, SuspendedToken>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  const loadSuspendedTokens = async () => {
    try {
      const actor = await backendService.getActor();
      const suspendedList = await actor.get_all_suspended_principals();
      
      const newSuspendedTokens = new Map<string, SuspendedToken>();
      
      suspendedList.forEach(([principal, status]: [Principal, SuspendedStatus]) => {
        const tokenId = principal.toString();
        if ('Temporary' in status) {
          newSuspendedTokens.set(tokenId, {
            status: 'Temporary',
            reason: status.Temporary as string
          }); 
        } else if ('Permanent' in status) {
          newSuspendedTokens.set(tokenId, {
            status: 'Permanent',
            reason: status.Permanent as string
          });
        }
      });
      
      setSuspendedTokens(newSuspendedTokens);
    } catch (error) {
      console.error('Error loading suspended tokens:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshSuspendedTokens = async () => {
    setIsLoading(true);
    await loadSuspendedTokens();
  };

  useEffect(() => {
    loadSuspendedTokens();

    // Refresh the list every 5 minutes
    const interval = setInterval(loadSuspendedTokens, 300000);
    return () => clearInterval(interval);
  }, []);

  const isTokenSuspended = (tokenId: string): boolean => {
    return suspendedTokens.has(tokenId);
  };

  const getTokenSuspensionDetails = (tokenId: string): SuspendedToken | null => {
    return suspendedTokens.get(tokenId) || null;
  };

  const getSuspensionDetails = useCallback((canisterId: string) => {
    const status = suspendedTokens.get(canisterId);
    if (!status) return null;
    return { reason: status.reason };
  }, [suspendedTokens]);

  return (
    <TokenSecurityContext.Provider value={{
      suspendedTokens,
      isTokenSuspended,
      getTokenSuspensionDetails,
      refreshSuspendedTokens,
      isLoading,
      getSuspensionDetails
    }}>
      {children}
    </TokenSecurityContext.Provider>
  );
}; 