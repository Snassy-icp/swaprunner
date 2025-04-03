import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/auth';
import { userProfileService } from '../services/userProfile';

interface AuthContextType {
  isAuthenticated: boolean;
  principal: string | null;
  login: () => Promise<boolean>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isVerified: boolean;
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  const checkAdminStatus = async () => {
    if (isAuthenticated) {
      const adminStatus = await authService.isAdmin();
      setIsAdmin(adminStatus);
    } else {
      setIsAdmin(false);
    }
  };

  const checkVerificationStatus = async () => {
    const currentPrincipal = authService.getPrincipal();
    const authenticated = authService.isAuthenticated();
    if (authenticated && currentPrincipal) {
      const verificationStatus = await userProfileService.isVerified(currentPrincipal);
      setIsVerified(verificationStatus);
    } else {
      setIsVerified(false);
    }
  };

  useEffect(() => {
    // Check authentication status on mount
    const checkAuth = async () => {
      const authenticated = await authService.init();
      setIsAuthenticated(authenticated);
      if (authenticated) {
        const p = authService.getPrincipal();
        setPrincipal(p ? p.toString() : null);
        await checkAdminStatus();
        await checkVerificationStatus();
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
        checkAdminStatus();
        checkVerificationStatus();
      } else {
        setPrincipal(null);
        setIsAdmin(false);
        setIsVerified(false);
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
        await checkAdminStatus();
        await checkVerificationStatus();
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
    setIsAdmin(false);
    setIsVerified(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, principal, login, logout, isAdmin, isVerified }}>
      {children}
    </AuthContext.Provider>
  );
}; 