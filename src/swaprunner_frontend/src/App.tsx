import React, { useEffect, useState, useRef } from 'react';
import { BrowserRouter as Router, useLocation, useNavigate } from 'react-router-dom';
import { TokenProvider } from './contexts/TokenContext';
import { SlippageProvider } from './contexts/SlippageContext';
import { LogoLoadingProvider } from './contexts/LogoLoadingContext';
import { AuthProvider } from './contexts/AuthContext';
import { PoolProvider } from './contexts/PoolContext';
import { AppRoutes } from './routes';
import { Header } from './components/Header';
import { analyticsService } from './services/analytics';
import { FiHelpCircle, FiRefreshCw, FiUser, FiLogIn, FiCheck, FiCopy, FiMenu, FiRepeat, FiCreditCard, FiList, FiDroplet, FiBarChart2 } from 'react-icons/fi';
import { isFeatureEnabled } from './config/featureFlags';
import { useAuth } from './contexts/AuthContext';
import './App.css';

// Initialize analytics with your measurement ID
const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
if (!measurementId) {
  console.warn('Google Analytics Measurement ID not found');
} else {
  analyticsService.init(measurementId);
}

// Route tracking component
const RouteTracker: React.FC = () => {
  const location = useLocation();
  
  useEffect(() => {
    analyticsService.pageView(location.pathname);
  }, [location]);
  
  return null;
};

// Fixed header component to handle state and navigation
const FixedHeader: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showHamburgerMenu, setShowHamburgerMenu] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [copied, setCopied] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated, principal, login, logout } = useAuth();

  useEffect(() => {
    // Close menus when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettingsMenu(false);
      }
      if (hamburgerRef.current && !hamburgerRef.current.contains(event.target as Node)) {
        setShowHamburgerMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClearCache = async () => {
    if (clearingCache) return;
    setClearingCache(true);
    try {
      localStorage.clear();
      window.location.reload();
    } catch (err) {
      console.error('Failed to clear cache:', err);
    } finally {
      setClearingCache(false);
    }
  };

  const copyPrincipal = async () => {
    if (!principal) return;
    try {
      await navigator.clipboard.writeText(principal);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy principal:', err);
    }
  };

  return (
    <div className="fixed-header">
      <div className="hamburger-menu" ref={hamburgerRef}>
        <button 
          className="hamburger-button"
          onClick={() => setShowHamburgerMenu(!showHamburgerMenu)}
        >
          <FiMenu />
        </button>
        {showHamburgerMenu && (
          <div className="hamburger-dropdown">
            <a 
              href="/"
              className={`hamburger-item ${location.pathname === '/' ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                navigate('/');
                setShowHamburgerMenu(false);
              }}
            >
              <FiRepeat />
              Swap
            </a>
            <a 
              href="/wallet"
              className={`hamburger-item ${location.pathname === '/wallet' ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                navigate('/wallet');
                setShowHamburgerMenu(false);
              }}
            >
              <FiCreditCard />
              Wallet
            </a>
            <a 
              href="/pools"
              className={`hamburger-item ${location.pathname === '/pools' ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                navigate('/pools');
                setShowHamburgerMenu(false);
              }}
            >
              <FiDroplet />
              Pools
            </a>
            <a 
              href="/transactions"
              className={`hamburger-item ${location.pathname === '/transactions' ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                navigate('/transactions');
                setShowHamburgerMenu(false);
              }}
            >
              <FiList />
              Transactions
            </a>
            <a 
              href="/me"
              className={`hamburger-item ${location.pathname === '/me' ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                navigate('/me');
                setShowHamburgerMenu(false);
              }}
            >
              <FiUser />
              Me
            </a>
            <a 
              href="/statistics"
              className={`hamburger-item ${location.pathname === '/statistics' ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                navigate('/statistics');
                setShowHamburgerMenu(false);
              }}
            >
              <FiBarChart2 />
              Statistics
            </a>
            <a 
              href="/help"
              className={`hamburger-item ${location.pathname === '/help' ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                navigate('/help');
                setShowHamburgerMenu(false);
              }}
            >
              <FiHelpCircle />
              Help
            </a>
            <button 
              className="hamburger-item"
              onClick={() => {
                handleClearCache();
                setShowHamburgerMenu(false);
              }}
            >
              <FiRefreshCw className={clearingCache ? 'icon-spin' : ''} />
              Clear Cache
            </button>
          </div>
        )}
      </div>
      <div className="logo">
        <span className="swap">Swap</span>
        <span className="runner">Runner</span>
      </div>
      <div className="global-controls">
        <button
          className="control-button"
          onClick={() => navigate('/help')}
          title="Help"
        >
          <FiHelpCircle />
        </button>
        {isFeatureEnabled('SHOW_REFRESH_CACHE') && (
          <button
            className="control-button"
            onClick={handleClearCache}
            disabled={clearingCache}
            title="Clear Cache"
          >
            <FiRefreshCw className={clearingCache ? 'icon-spin' : ''} />
          </button>
        )}
        <div className="settings-container" ref={settingsRef}>
          <button 
            className="control-button"
            onClick={() => {
              if (!isAuthenticated) {
                login();
              } else {
                setShowSettingsMenu(!showSettingsMenu);
              }
            }}
            title={isAuthenticated ? "Settings" : "Login"}
          >
            {isAuthenticated ? <FiUser /> : <FiLogIn />}
          </button>
          {showSettingsMenu && isAuthenticated && (
            <div className="settings-dropdown">
              <button className="settings-item" onClick={copyPrincipal}>
                <span className="principal-text">
                  {principal ? `${principal.slice(0, 6)}...${principal.slice(-4)}` : ''}
                </span>
                {copied ? <FiCheck className="copy-icon success" /> : <FiCopy className="copy-icon" />}
              </button>
              {isFeatureEnabled('SHOW_SETTINGS_MENU') && (
                <a href="#" className="settings-item">Settings</a>
              )}
              <button className="settings-item logout" onClick={logout}>
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <TokenProvider>
        <LogoLoadingProvider>
          <SlippageProvider>
            <PoolProvider>
              <Router>
                <RouteTracker />
                <FixedHeader />
                <div className="app">
                  <Header />
                  <main>
                    <AppRoutes />
                  </main>
                </div>
              </Router>
            </PoolProvider>
          </SlippageProvider>
        </LogoLoadingProvider>
      </TokenProvider>
    </AuthProvider>
  );
};

export default App;
