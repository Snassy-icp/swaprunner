import React, { useState } from 'react';
import { FiX, FiCoffee } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { backendService } from '../services/backend';
import { priceService } from '../services/price';
import '../styles/DonateModal.css';

interface DonateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ICP_LEDGER_ID = 'ryjl3-tyaaa-aaaaa-aaaba-cai';

export const DonateModal: React.FC<DonateModalProps> = ({ isOpen, onClose }) => {
  const { isAuthenticated, login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [selectedAmount, setSelectedAmount] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleAmountSelect = (amount: number) => {
    setSelectedAmount(amount);
    setError(null);
  };

  const handleDouble = () => {
    setSelectedAmount(prev => prev * 2);
    setError(null);
  };

  const handleDonate = async () => {
    if (!selectedAmount) {
      setError('Please select an amount first');
      return;
    }

    if (!isAuthenticated) {
      login();
      return;
    }

    try {
      setError(null);
      setLoading(true);
      
      // Get current ICP price
      const icpPrice = await priceService.getICPUSDPrice();
      if (!icpPrice) {
        throw new Error('Failed to fetch ICP price');
      }

      // Calculate USD value
      const icpAmount = selectedAmount / 100_000_000; // Convert from e8s to ICP
      const usdValue = icpAmount * icpPrice;

      const actor = await backendService.getActor();
      await actor.record_donation({
        token_ledger_id: ICP_LEDGER_ID,
        amount_e8s: selectedAmount,
        usd_value: usdValue,
      });
      onClose();
    } catch (error) {
      console.error('Failed to record donation:', error);
      setError('Failed to process donation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatICP = (amount_e8s: number) => {
    return `${amount_e8s / 100_000_000} ICP`;
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3><FiCoffee /> Support SwapRunner</h3>
          <button className="close-button" onClick={onClose}>
            <FiX />
          </button>
        </div>
        <div className="modal-body">
          <p>Help us keep SwapRunner running smoothly by making a donation. Your support helps maintain and improve the platform.</p>
          
          <div className="amount-selection">
            <div className="amount-buttons">
              <button 
                onClick={() => handleAmountSelect(10_000_000)} 
                className={`amount-button ${selectedAmount === 10_000_000 ? 'selected' : ''}`}
              >
                0.1 ICP
              </button>
              <button 
                onClick={() => handleAmountSelect(100_000_000)} 
                className={`amount-button ${selectedAmount === 100_000_000 ? 'selected' : ''}`}
              >
                1 ICP
              </button>
              <button 
                onClick={handleDouble} 
                className="amount-button"
                disabled={!selectedAmount}
              >
                2×
              </button>
            </div>

            {selectedAmount > 0 && (
              <div className="selected-amount">
                Selected amount: {formatICP(selectedAmount)}
              </div>
            )}
          </div>

          <div className="action-buttons">
            <button className="cancel-button" onClick={onClose}>
              Cancel
            </button>
            <button 
              className="donate-button" 
              onClick={handleDonate}
              disabled={loading || !selectedAmount}
            >
              {loading ? 'Processing...' : 'Donate'}
            </button>
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 