import React, { createContext, useContext, useState, useEffect } from 'react';
import { tokenService } from '../services/token';

interface LogoLoadingProgress {
  isLoading: boolean;
  totalTokens: number;
  processedTokens: number;
  cachedTokens: number;
  skippedTokens: number;
  progress: number;
}

interface LogoLoadingContextType {
  progress: LogoLoadingProgress;
}

const LogoLoadingContext = createContext<LogoLoadingContextType | undefined>(undefined);

export const useLogoLoading = () => {
  const context = useContext(LogoLoadingContext);
  if (!context) {
    throw new Error('useLogoLoading must be used within a LogoLoadingProvider');
  }
  return context;
};

export const LogoLoadingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [progress, setProgress] = useState<LogoLoadingProgress>({
    isLoading: false,
    totalTokens: 0,
    processedTokens: 0,
    cachedTokens: 0,
    skippedTokens: 0,
    progress: 0
  });

  // Subscribe to logo loading progress
  useEffect(() => {
    const handleProgress = (data: LogoLoadingProgress) => {
      setProgress(data);
    };

    // Add progress handler to TokenService
    tokenService.onLogoLoadingProgress(handleProgress);

    return () => {
      // Remove progress handler when component unmounts
      tokenService.offLogoLoadingProgress(handleProgress);
    };
  }, []);

  return (
    <LogoLoadingContext.Provider value={{ progress }}>
      {children}
    </LogoLoadingContext.Provider>
  );
}; 