import React from 'react';
import { FiExternalLink, FiLogIn } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';

export const Transactions: React.FC = () => {
  const { isAuthenticated, principal, login } = useAuth();

  const openICPSwapTransactions = () => {
    if (principal) {
      window.open(`https://app.icpswap.com/info-tools/swap-transactions?principal=${principal}`, '_blank');
    }
  };

  const openKongTransactions = () => {
    if (principal) {
      window.open(`https://www.kongswap.io/wallets/${principal}/swaps`, '_blank');
    }
  };

  if (!isAuthenticated || !principal) {
    return (
      <div className="transactions-page">
        <div className="swap-box">
          <div className="wallet-empty-state">
            <FiLogIn className="empty-icon" />
            <h3>Login Required</h3>
            <p>Please login with Internet Identity to view your transactions</p>
            <button className="login-button" onClick={login}>
              <FiLogIn className="icon" />
              Login with Internet Identity
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="transactions-page">
      <div className="swap-box">
        <div className="transactions-buttons">
          <button className="dex-button icpswap" onClick={openICPSwapTransactions}>
            <span className="dex-name">ICPSwap</span>
            <span className="button-description">View ICPSwap Transactions</span>
            <FiExternalLink className="external-link-icon" />
          </button>
          <button className="dex-button kong" onClick={openKongTransactions}>
            <span className="dex-name">Kong</span>
            <span className="button-description">View Kong Transactions</span>
            <FiExternalLink className="external-link-icon" />
          </button>
        </div>
      </div>
    </div>
  );
}; 