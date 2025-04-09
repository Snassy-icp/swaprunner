import React, { useState } from 'react';
import { FiX, FiLoader } from 'react-icons/fi';
import { Principal } from '@dfinity/principal';
import { backendService } from '../services/backend';
import { useTokens } from '../contexts/TokenContext';
import '../styles/AddCustomTokenModal.css';

interface TokenMetadata {
  name: string | null | undefined;
  symbol: string | null | undefined;
  fee: bigint | null | undefined;
  decimals: number | null | undefined;
  hasLogo: boolean;
  standard: string;
}

interface RegisterTokenResponse {
  metadata: TokenMetadata;
  logo: string | null;
}

interface AddCustomTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (tokenId: string, metadata: TokenMetadata, logo: string | null) => void;
}

export const AddCustomTokenModal: React.FC<AddCustomTokenModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [canisterId, setCanisterId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    console.log('[AddCustomTokenModal] Starting token registration process');
    setError(null);
    setIsLoading(true);
    console.log('[AddCustomTokenModal] Set loading state to true');

    try {
      // Validate Principal ID
      let principal;
      try {
        principal = Principal.fromText(canisterId);
        console.log('[AddCustomTokenModal] Successfully created Principal from canisterId:', canisterId);
      } catch {
        console.log('[AddCustomTokenModal] Failed to create Principal from canisterId:', canisterId);
        setError('Invalid canister ID format');
        setIsLoading(false);
        return;
      }

      // Register the custom token
      console.log('[AddCustomTokenModal] Calling register_custom_token with principal:', principal.toString());
      const result = await backendService.register_custom_token(principal);
      console.log('[AddCustomTokenModal] Register custom token result:', result);

      if ('err' in result) {
        console.log('[AddCustomTokenModal] Registration failed with error:', result.err);
        setError(result.err);
        setIsLoading(false);
        return;
      }
      
      console.log('[AddCustomTokenModal] Registration successful with response:', result.ok);
      setIsLoading(false);
      console.log('[AddCustomTokenModal] Set loading state to false');
      
      console.log('[AddCustomTokenModal] Calling onSuccess with canisterId and response:', canisterId, result.ok);
      onSuccess(canisterId, result.ok.metadata, result.ok.logo ?? null);
      console.log('[AddCustomTokenModal] onSuccess callback completed');
      return;

    } catch (err) {
      console.error('[AddCustomTokenModal] Unexpected error during registration:', err);
      setError(err instanceof Error ? err.message : 'Failed to register token');
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="add-custom-token-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add Custom Token</h3>
          <button 
            className="close-button"
            onClick={onClose}
            disabled={isLoading}
          >
            <FiX />
          </button>
        </div>
        <div className="modal-content">
          <input
            type="text"
            value={canisterId}
            onChange={(e) => setCanisterId(e.target.value)}
            placeholder="Enter ICRC-1 token canister ID"
            disabled={isLoading}
            className="token-input"
          />
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
          <button
            className="add-token-button"
            onClick={handleAdd}
            disabled={isLoading || !canisterId}
          >
            {isLoading ? (
              <>
                <FiLoader className="spinner" />
                Registering...
              </>
            ) : (
              'Add Token'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}; 