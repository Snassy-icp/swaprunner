import React from 'react';
import { FiUser, FiLogIn } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';

export const Me: React.FC = () => {
  const { isAuthenticated, principal, login } = useAuth();

  if (!isAuthenticated || !principal) {
    return (
      <div className="me-page">
        <div className="swap-box">
          <div className="wallet-empty-state">
            <FiUser className="empty-icon" />
            <h3>Welcome to Your Profile</h3>
            <p>Please login to view your profile</p>
            <button className="login-button" onClick={login}>
              <FiLogIn className="icon" />
              Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="me-page">
      <div className="swap-box">
        <div className="me-content">
          <h2>Your Profile</h2>
          <div className="principal-display">
            <label>Your Principal ID:</label>
            <div className="principal-value">{principal}</div>
          </div>
        </div>
      </div>
    </div>
  );
}; 