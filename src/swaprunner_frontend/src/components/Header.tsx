import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiPercent, FiRepeat, FiCreditCard, FiDroplet, FiList, FiBarChart2, FiUser, FiGift, FiHeart } from 'react-icons/fi';
import { AiFillHeart } from 'react-icons/ai';
import { isFeatureEnabled } from '../config/featureFlags';
import { SlippageSettings } from './SlippageSettings';
import { useSlippage } from '../contexts/SlippageContext';
import { useClaims } from '../contexts/ClaimContext';
import '../styles/Header.css';

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showSlippageSettings, setShowSlippageSettings] = useState(false);
  const { slippageTolerance, setSlippageTolerance } = useSlippage();
  const { availableClaims } = useClaims();

  const isSwapTab = location.pathname === '/';

  return (
    <header className="header">
      <div className="nav-tabs">
        <button 
          className={`tab ${isSwapTab ? 'active' : ''}`}
          onClick={() => navigate('/')}
          title="Swap tokens"
        >
          <FiRepeat />
          {isSwapTab && <span>Swap</span>}
        </button>
        <button 
          className={`tab ${location.pathname === '/wallet' ? 'active' : ''}`}
          onClick={() => navigate('/wallet')}
          title="View wallet balances"
        >
          <FiCreditCard />
          {location.pathname === '/wallet' && <span>Wallet</span>}
        </button>
        <button 
          className={`tab ${location.pathname === '/pools' ? 'active' : ''}`}
          onClick={() => navigate('/pools')}
          title="View liquidity pools"
        >
          <FiDroplet />
          {location.pathname === '/pools' && <span>Pools</span>}
        </button>
        <button 
          className={`tab ${location.pathname === '/me' ? 'active' : ''} ${availableClaims.length > 0 ? 'has-rewards' : ''}`}
          onClick={() => navigate('/me')}
        >
          {availableClaims.length > 0 && (
            <div className="rewards-tooltip">
              Congratulations!<br />
              You have unclaimed rewards
            </div>
          )}
          {availableClaims.length > 0 ? (
            <>
              <FiGift className="FiGift" />
              {location.pathname === '/me' && <span>Me</span>}
            </>
          ) : (
            <>
              <FiUser />
              {location.pathname === '/me' && <span>Me</span>}
            </>
          )}
        </button>
        <button 
          className={`tab ${location.pathname === '/statistics' ? 'active' : ''}`}
          onClick={() => navigate('/statistics')}
          title="View platform statistics"
        >
          <FiBarChart2 />
          {location.pathname === '/statistics' && <span>Statistics</span>}
        </button>
        <button 
          className={`tab ${location.pathname === '/sponsors' ? 'active' : ''}`}
          onClick={() => navigate('/sponsors')}
          title="View our sponsors"
        >
          {location.pathname === '/sponsors' ? (
            <AiFillHeart className="heart-icon-active" />
          ) : (
            <FiHeart />
          )}
          {location.pathname === '/sponsors' && <span>Sponsors</span>}
        </button>
      </div>
      {isSwapTab && (
        <div className="global-controls">
          <div style={{ position: 'relative' }}>
            <button
              className="control-button"
              onClick={() => setShowSlippageSettings(!showSlippageSettings)}
              title="Slippage Settings"
            >
              <span className="slippage-value">{slippageTolerance}%</span>
            </button>
            {showSlippageSettings && (
              <SlippageSettings
                isOpen={showSlippageSettings}
                onClose={() => setShowSlippageSettings(false)}
                slippage={slippageTolerance}
                onSlippageChange={setSlippageTolerance}
              />
            )}
          </div>
        </div>
      )}
    </header>
  );
}; 