import React, { useState } from 'react';
import { FiX, FiHeart } from 'react-icons/fi';
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

  if (!isOpen) return null;

  const handleDonate = async (amount_e8s: number) => {
    if (!isAuthenticated) {
      login();
      return;
    }

    try {
      setError(null);
      
      // Get current ICP price
      const icpPrice = await priceService.getICPUSDPrice();
      if (!icpPrice) {
        throw new Error('Failed to fetch ICP price');
      }

      // Calculate USD value
      const icpAmount = amount_e8s / 100_000_000; // Convert from e8s to ICP
      const usdValue = icpAmount * icpPrice;

      const actor = await backendService.getActor();
      await actor.record_donation({
        token_ledger_id: ICP_LEDGER_ID,
        amount_e8s,
        usd_value: usdValue,
      });
      onClose();
    } catch (error) {
      console.error('Failed to record donation:', error);
      setError('Failed to process donation. Please try again.');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3><FiHeart /> Support SwapRunner</h3>
          <button className="close-button" onClick={onClose}>
            <FiX />
          </button>
        </div>
        <div className="modal-body">
          <p>Help us keep SwapRunner running smoothly by making a donation. Your support helps maintain and improve the platform.</p>
          
          <div className="donation-buttons">
            <button onClick={() => handleDonate(10_000_000)} className="donate-button">
              0.1 ICP
            </button>
            <button onClick={() => handleDonate(100_000_000)} className="donate-button">
              1 ICP
            </button>
            <button onClick={() => handleDonate(200_000_000)} className="donate-button">
              2 ICP
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