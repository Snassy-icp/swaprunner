import { useEffect, useState } from 'react';
import { authService } from '../services/auth';
import { FiCopy, FiCheck } from 'react-icons/fi';

export const LoginButton = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [principal, setPrincipal] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Check authentication status on mount
    authService.init().then((authenticated) => {
      setIsAuthenticated(authenticated);
      if (authenticated) {
        const p = authService.getPrincipal();
        setPrincipal(p ? p.toString() : null);
      }
    });
  }, []);

  const handleLogin = async () => {
    const success = await authService.login();
    if (success) {
      setIsAuthenticated(true);
      const p = authService.getPrincipal();
      setPrincipal(p ? p.toString() : null);
    }
  };

  const handleLogout = async () => {
    await authService.logout();
    setIsAuthenticated(false);
    setPrincipal(null);
  };

  const copyPrincipal = async () => {
    if (principal) {
      try {
        await navigator.clipboard.writeText(principal);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
      } catch (err) {
        console.error('Failed to copy principal:', err);
      }
    }
  };

  return (
    <div className="login-container">
      {isAuthenticated ? (
        <div className="auth-info">
          <button 
            className="principal-button" 
            onClick={copyPrincipal}
            title="Click to copy principal ID"
          >
            <span className="principal-text">
              {principal ? `${principal.slice(0, 6)}...${principal.slice(-4)}` : ''}
            </span>
            {copied ? (
              <FiCheck className="copy-icon success" />
            ) : (
              <FiCopy className="copy-icon" />
            )}
          </button>
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>
      ) : (
        <button onClick={handleLogin} className="login-button">
          Login with Internet Identity
        </button>
      )}
    </div>
  );
}; 