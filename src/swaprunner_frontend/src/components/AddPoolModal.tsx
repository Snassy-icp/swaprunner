import React, { useState, useEffect } from 'react';
import { FiX } from 'react-icons/fi';
import { TokenSelect } from './TokenSelect';
import { backendService } from '../services/backend';
import { usePool } from '../contexts/PoolContext';
import { icpSwapFactoryService } from '../services/icpswap_factory';
import '../styles/AddPoolModal.css';

interface AddPoolModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddPoolModal: React.FC<AddPoolModalProps> = ({ isOpen, onClose }) => {
  const [token0, setToken0] = useState<string>('');
  const [token1, setToken1] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refreshPools } = usePool();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setToken0('');
      setToken1('');
      setError(null);
    }
  }, [isOpen]);

  const handleAddPool = async () => {
    if (!token0 || !token1) {
      setError('Please select both tokens');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Get the pool from ICPSwap Factory
      const poolData = await icpSwapFactoryService.getPool({
        token0: { address: token0, standard: 'ICRC1' },
        token1: { address: token1, standard: 'ICRC1' },
        fee: BigInt(3000) // Default 0.3% fee
      });

      // Add the pool to the user's list
      const actor = await backendService.getActor();
      const addResult = await actor.add_pool(poolData.canisterId);
      
      if ('err' in addResult) {
        setError(addResult.err);
        return;
      }

      // Refresh the pools list
      await refreshPools();
      onClose();
    } catch (error: any) {
      console.error('Error adding pool:', error);
      setError(error?.message || 'Failed to add pool. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content add-pool-modal">
        <div className="modal-header">
          <h2>Add Pool</h2>
          <button className="modal-close-button" onClick={onClose}>
            <FiX />
          </button>
        </div>
        <div className="modal-body">
          <div className="token-selects">
            <div className="token-select-container">
              <label>Token 1</label>
              <TokenSelect
                value={token0}
                onChange={setToken0}
                label="Select token"
                isLoading={false}
                mode="swap"
                hideBalance={true}
              />
            </div>
            <div className="token-select-container">
              <label>Token 2</label>
              <TokenSelect
                value={token1}
                onChange={setToken1}
                label="Select token"
                isLoading={false}
                mode="swap"
                hideBalance={true}
              />
            </div>
          </div>
          {error && <div className="error-message">{error}</div>}
        </div>
        <div className="modal-footer">
          <button 
            className="primary-button" 
            onClick={handleAddPool}
            disabled={isLoading || !token0 || !token1}
          >
            {isLoading ? 'Adding...' : 'Add Pool'}
          </button>
        </div>
      </div>
    </div>
  );
}; 