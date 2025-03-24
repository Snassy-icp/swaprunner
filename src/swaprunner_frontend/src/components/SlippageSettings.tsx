import React, { useState } from 'react';
import { FiX, FiInfo } from 'react-icons/fi';
import '../styles/SlippageSettings.css';

interface SlippageSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  slippage: number;
  onSlippageChange: (value: number) => void;
}

export const SlippageSettings: React.FC<SlippageSettingsProps> = ({
  isOpen,
  onClose,
  slippage,
  onSlippageChange,
}) => {
  const [customValue, setCustomValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCustomValueChange = (value: string) => {
    setCustomValue(value);
    const numValue = parseFloat(value);
    
    if (value === '') {
      setError(null);
      return;
    }

    if (isNaN(numValue)) {
      setError('Please enter a valid number');
      return;
    }

    if (numValue > 5) {
      setError('Your transaction may be frontrun');
    } else {
      setError(null);
    }

    onSlippageChange(numValue);
  };

  const handlePresetClick = (value: number) => {
    setCustomValue('');
    onSlippageChange(value);
  };

  return (
    <div className="slippage-settings-overlay">
      <div className="slippage-settings-panel">
        <div className="slippage-header">
          <h3>
            Slippage Tolerance
            <button className="info-button" title="Your transaction will revert if the price changes unfavorably by more than this percentage.">
              <FiInfo />
            </button>
          </h3>
          <button className="modal-close-button" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <div className="slippage-content">
          <div className="preset-buttons">
            <button
              className={slippage === 0 ? 'active' : ''}
              onClick={() => handlePresetClick(0)}
            >
              0%
            </button>
            <button
              className={slippage === 0.1 ? 'active' : ''}
              onClick={() => handlePresetClick(0.1)}
            >
              0.1%
            </button>
            <button
              className={slippage === 0.5 ? 'active' : ''}
              onClick={() => handlePresetClick(0.5)}
            >
              0.5%
            </button>
            <button
              className={slippage === 5 ? 'active' : ''}
              onClick={() => handlePresetClick(5)}
            >
              5%
            </button>
          </div>
          <div className="custom-input-container">
            <input
              type="text"
              value={customValue}
              onChange={(e) => handleCustomValueChange(e.target.value)}
              placeholder="Custom"
            />
            <span className="percent-sign">%</span>
          </div>
          {error && <div className="error-message">{error}</div>}
        </div>
      </div>
    </div>
  );
}; 