import React, { useState } from 'react';
import { FiUser, FiLogIn, FiChevronDown, FiChevronUp, FiSettings, FiBarChart2 } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import '../styles/Me.css';

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ 
  title, 
  icon, 
  children,
  defaultExpanded = true 
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="collapsible-section">
      <div 
        className="section-header" 
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="section-title">
          {icon}
          <h2>{title}</h2>
        </div>
        {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
      </div>
      {isExpanded && (
        <div className="section-content">
          {children}
        </div>
      )}
    </div>
  );
};

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
        <CollapsibleSection title="Profile" icon={<FiUser />}>
          <div className="principal-display">
            <label>Your Principal ID:</label>
            <div className="principal-value">{principal}</div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Settings" icon={<FiSettings />} defaultExpanded={false}>
          <div className="settings-display">
            <p className="placeholder-text">Settings coming soon...</p>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Statistics" icon={<FiBarChart2 />} defaultExpanded={false}>
          <div className="statistics-display">
            <p className="placeholder-text">Personal statistics coming soon...</p>
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
}; 