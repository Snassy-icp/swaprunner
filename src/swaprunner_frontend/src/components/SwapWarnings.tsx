import React from 'react';
import { SwapWarning } from '../utils/swapWarnings';
import '../styles/SwapWarnings.css';

interface SwapWarningsProps {
  warnings: SwapWarning[];
}

export const SwapWarnings: React.FC<SwapWarningsProps> = ({ warnings }) => {
  if (warnings.length === 0) return null;

  return (
    <div className="swap-warnings">
      {warnings.map((warning, index) => (
        <div key={index} className={`warning-item ${warning.type}`}>
          <div className="warning-icon">⚠️</div>
          <div className="warning-message">{warning.message}</div>
        </div>
      ))}
    </div>
  );
}; 