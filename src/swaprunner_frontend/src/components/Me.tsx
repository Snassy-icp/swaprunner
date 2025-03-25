import React, { useState } from 'react';
import { FiChevronUp, FiChevronDown, FiUser, FiSettings, FiBarChart2 } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { usePool } from '../contexts/PoolContext';
import '../styles/Me.css';

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, icon, children }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="collapsible-section">
      <div className="section-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="section-title">
          {icon}
          <h2>{title}</h2>
        </div>
        {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
      </div>
      {isExpanded && <div className="section-content">{children}</div>}
    </div>
  );
};

const Me: React.FC = () => {
  const { isAuthenticated, principal } = useAuth();
  const { keepTokensInPool, setKeepTokensInPool } = usePool();

  if (!isAuthenticated) {
    return (
      <div className="me-page">
        <p className="placeholder-text">Please log in to view your profile.</p>
      </div>
    );
  }

  return (
    <div className="me-page">
      <CollapsibleSection title="Profile" icon={<FiUser />}>
        <div className="principal-display">
          <label>Your Principal ID</label>
          <div className="principal-value">{principal}</div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Settings" icon={<FiSettings />}>
        <div className="settings-display">
          <div className="setting-item">
            <div className="setting-info">
              <label>Keep tokens in ICPSwap pool</label>
              <p className="setting-description">
                When enabled, swapped tokens will remain in the ICPSwap pool for future trades
                instead of being withdrawn to your wallet.
              </p>
            </div>
            <div className="setting-control">
              <input
                type="checkbox"
                checked={keepTokensInPool}
                onChange={(e) => setKeepTokensInPool(e.target.checked)}
              />
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Statistics" icon={<FiBarChart2 />}>
        <div className="statistics-display">
          <p className="placeholder-text">Statistics coming soon...</p>
        </div>
      </CollapsibleSection>
    </div>
  );
};

export default Me; 