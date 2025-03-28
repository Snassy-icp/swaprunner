import React, { useState, useEffect } from 'react';
import { FiX } from 'react-icons/fi';
import { backendService } from '../services/backend';
import { SubaccountType, validateSubaccountValue, convertToBytes, formatBytes, formatHex, formatPrincipal } from '../utils/subaccounts';
import '../styles/AddSubaccountModal.css';
import { Principal } from '@dfinity/principal';

interface AddSubaccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokenId: string;
  onSuccess: () => void;
}

export const AddSubaccountModal: React.FC<AddSubaccountModalProps> = ({
  isOpen,
  onClose,
  tokenId,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<SubaccountType>('hex');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resolvedSubaccount, setResolvedSubaccount] = useState<number[] | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setValue('');
      setError(null);
      setIsSubmitting(false);
      setResolvedSubaccount(null);
    }
  }, [isOpen]);

  useEffect(() => {
    try {
      const validationError = validateSubaccountValue(type, value);
      if (!validationError && value) {
        const bytes = convertToBytes(type, value);
        setResolvedSubaccount(bytes);
        setError(null);
      } else {
        setResolvedSubaccount(null);
        setError(validationError);
      }
    } catch (err) {
      setResolvedSubaccount(null);
      setError('Invalid input format');
    }
  }, [type, value]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvedSubaccount || !name.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await backendService.add_named_subaccount({
        token_id: Principal.fromText(tokenId),
        name: name.trim(),
        subaccount: resolvedSubaccount,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add subaccount');
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="add-subaccount-modal">
        <div className="add-subaccount-header">
          <h2>Add Named Subaccount</h2>
          <button className="modal-close-button" onClick={onClose}>
            <FiX size={24} />
          </button>
        </div>

        <div className="add-subaccount-content">
          <form className="add-subaccount-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="subaccount-name">Name</label>
              <input
                id="subaccount-name"
                type="text"
                className="subaccount-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter a name for this subaccount"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="subaccount-type">Type</label>
              <select
                id="subaccount-type"
                className="subaccount-type-select"
                value={type}
                onChange={(e) => setType(e.target.value as SubaccountType)}
              >
                <option value="hex">Hex String</option>
                <option value="bytes">Byte Array</option>
                <option value="principal">Principal ID</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="subaccount-value">Value</label>
              <input
                id="subaccount-value"
                type="text"
                className="subaccount-value-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={
                  type === 'hex'
                    ? '64 character hex string (e.g., 0000...)'
                    : type === 'bytes'
                    ? '32 comma-separated bytes (e.g., 0, 0, ...)'
                    : 'Principal ID'
                }
                required
              />
            </div>

            {resolvedSubaccount && (
              <div className="subaccount-preview">
                <label>Preview</label>
                <code>Hex: {formatHex(resolvedSubaccount)}</code>
                <code>Bytes: {formatBytes(resolvedSubaccount)}</code>
                <code>Principal: {formatPrincipal(resolvedSubaccount)}</code>
              </div>
            )}

            {error && <div className="add-subaccount-error">{error}</div>}

            <button
              type="submit"
              className="add-subaccount-submit"
              disabled={!resolvedSubaccount || !name.trim() || isSubmitting}
            >
              {isSubmitting ? 'Adding...' : 'Add Subaccount'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}; 