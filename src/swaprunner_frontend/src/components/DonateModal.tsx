import React, { useState, useEffect } from 'react';
import { FiX, FiCoffee } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { backendService } from '../services/backend';
import { priceService } from '../services/price';
import { icrc1Service } from '../services/icrc1_service';
import '../styles/DonateModal.css';
import { Principal } from '@dfinity/principal';

interface DonateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ICP_LEDGER_ID = 'ryjl3-tyaaa-aaaaa-aaaba-cai';
const DEVELOPER_WALLET = 'z44up-tm4i5-mn2fi-arq5o-ko7et-mkaec-e6raf-qc6i4-hpjwv-ribyz-hae';

// Heart confetti colors
const HEART_COLORS = [
  '#ff6b6b', // Light red
  '#ff4757', // Strong red
  '#ff7f8c', // Pink red
  '#ff8fa3', // Light pink
  '#ff69b4', // Hot pink
];

const HeartConfetti: React.FC<{ show: boolean }> = ({ show }) => {
  const [hearts, setHearts] = useState<Array<{
    id: number;
    color: string;
    x: number;
    fallDuration: number;
    shakeDistance: number;
    delay: number;
  }>>([]);

  useEffect(() => {
    if (!show) {
      setHearts([]);
      return;
    }

    let batchCount = 0;
    const maxBatches = 15;
    const batchInterval = 300;
    const heartsPerBatch = 5;

    const createHeartBatch = (batchId: number) => {
      const pieces = Array.from({ length: heartsPerBatch }, (_, i) => ({
        id: batchId * heartsPerBatch + i,
        color: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)],
        x: Math.random() * 100,
        fallDuration: 2 + Math.random() * 2,
        shakeDistance: 15 + Math.random() * 30,
        delay: Math.random() * 0.5,
      }));

      setHearts(prev => [...prev, ...pieces]);
    };

    createHeartBatch(0);

    const intervalId = setInterval(() => {
      batchCount++;
      if (batchCount < maxBatches) {
        createHeartBatch(batchCount);
      } else {
        clearInterval(intervalId);
      }
    }, batchInterval);

    const cleanupTimer = setTimeout(() => {
      setHearts([]);
    }, (maxBatches * batchInterval) + 4000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(cleanupTimer);
    };
  }, [show]);

  if (!show) return null;

  return (
    <div className="confetti-container">
      {hearts.map((heart) => (
        <div
          key={heart.id}
          className="confetti heart"
          style={{
            left: `${heart.x}%`,
            '--fall-duration': `${heart.fallDuration}s`,
            '--shake-distance': `${heart.shakeDistance}px`,
            '--heart-color': heart.color,
            animationDelay: `${heart.delay}s`
          } as React.CSSProperties}
        >
          ❤
        </div>
      ))}
    </div>
  );
};

export const DonateModal: React.FC<DonateModalProps> = ({ isOpen, onClose }) => {
  const { isAuthenticated, login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [selectedAmount, setSelectedAmount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [showHearts, setShowHearts] = useState(false);

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

      /*
      // Transfer the donation to the SwapRunner developer wallet
      const transferResult = await icrc1Service.transfer({
        tokenId: ICP_LEDGER_ID,
        to: DEVELOPER_WALLET,
        amount_e8s: selectedAmount.toString(),
      });

      if (!transferResult.success) {
        throw new Error(transferResult.error || 'Transfer failed');
      }
      */
      // Record the donation
      // Get current ICP price
      const icpPrice = await priceService.getICPUSDPrice();
      if (!icpPrice) {
        throw new Error('Failed to fetch ICP price');
      }

      // Calculate USD value
      const icpAmount = selectedAmount / 100_000_000; // Convert from e8s to ICP
      const usdValue = icpAmount * icpPrice;

      const actor = await backendService.getActor();
      await actor.record_donation(
        selectedAmount,
        Principal.fromText(ICP_LEDGER_ID),
        usdValue,
        "123" //transferResult.txId
      );

      // Show heart confetti
      setShowHearts(true);
      
      // Close modal after a delay to show the hearts
      setTimeout(() => {
        setShowHearts(false);
        onClose();
      }, 2000);

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
      <HeartConfetti show={showHearts} />
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