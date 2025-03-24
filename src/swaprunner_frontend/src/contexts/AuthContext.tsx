import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/auth';

interface AuthContextType {
  isAuthenticated: boolean;
  principal: string | null;
  login: () => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [principal, setPrincipal] = useState<string | null>(null);

  useEffect(() => {
    // Check authentication status on mount
    const checkAuth = async () => {
      const authenticated = await authService.init();
      setIsAuthenticated(authenticated);
      if (authenticated) {
        const p = authService.getPrincipal();
        setPrincipal(p ? p.toString() : null);
      }
    };
    checkAuth();

    // Listen for auth state changes
    const unsubscribe = authService.onAuthStateChange(() => {
      const authenticated = authService.isAuthenticated();
      setIsAuthenticated(authenticated);
      if (authenticated) {
        const p = authService.getPrincipal();
        setPrincipal(p ? p.toString() : null);
      } else {
        setPrincipal(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    try {
      await authService.init(true);
      const success = await authService.login();
      if (success) {
        setIsAuthenticated(true);
        const p = authService.getPrincipal();
        setPrincipal(p ? p.toString() : null);
      }
      return success;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  };

  const logout = async () => {
    await authService.logout();
    setIsAuthenticated(false);
    setPrincipal(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, principal, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}; 