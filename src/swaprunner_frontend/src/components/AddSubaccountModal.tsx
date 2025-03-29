import React, { useState, useEffect } from 'react';
import { FiX } from 'react-icons/fi';
import { backendService } from '../services/backend';
import { SubaccountType, validateSubaccountValue, convertToBytes, formatBytes, formatHex, formatPrincipal, formatText, formatNumber } from '../utils/subaccounts';
import '../styles/AddSubaccountModal.css';
import { Principal } from '@dfinity/principal';

type IndexType = 'number' | 'hex' | 'bytes';

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
  const [indexType, setIndexType] = useState<IndexType>('number');
  const [indexValue, setIndexValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resolvedSubaccount, setResolvedSubaccount] = useState<number[] | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setValue('');
      setIndexValue('');
      setError(null);
      setIsSubmitting(false);
      setResolvedSubaccount(null);
    }
  }, [isOpen]);

  const parseIndex = (type: IndexType, value: string): number[] | null => {
    try {
      if (!value.trim()) return [0, 0, 0];

      switch (type) {
        case 'number': {
          const num = parseInt(value);
          if (isNaN(num) || num < 0 || num > 16777215) { // 2^24 - 1
            throw new Error('Index must be between 0 and 16777215');
          }
          return [
            (num >> 16) & 0xFF,
            (num >> 8) & 0xFF,
            num & 0xFF
          ];
        }
        case 'hex': {
          const hex = value.replace(/^0x/, '').padStart(6, '0');
          if (!/^[0-9a-fA-F]{1,6}$/.test(hex)) {
            throw new Error('Invalid hex format');
          }
          return [
            parseInt(hex.slice(0, 2) || '00', 16),
            parseInt(hex.slice(2, 4) || '00', 16),
            parseInt(hex.slice(4, 6) || '00', 16)
          ];
        }
        case 'bytes': {
          const bytes = value.trim().replace(/,+$/, '').split(',').map(b => parseInt(b.trim()));
          if (bytes.length > 3 || bytes.some(b => isNaN(b) || b < 0 || b > 255)) {
            throw new Error('Invalid byte array');
          }
          return [...bytes, ...Array(3 - bytes.length).fill(0)];
        }
      }
    } catch (err) {
      return null;
    }
  };

  useEffect(() => {
    try {
      if (type === 'principal') {
        if (!value) {
          setResolvedSubaccount(null);
          setError(null);
          return;
        }

        // Validate principal
        const validationError = validateSubaccountValue(type, value);
        if (validationError) {
          setResolvedSubaccount(null);
          setError(validationError);
          return;
        }

        // Get principal bytes
        const principalBytes = convertToBytes(type, value).slice(0, 29);
        
        // Parse index if provided
        const indexBytes = parseIndex(indexType, indexValue);
        if (indexValue && !indexBytes) {
          setError('Invalid index format');
          return;
        }

        // Combine principal and index
        const fullBytes = new Uint8Array(32);
        fullBytes.set(principalBytes);
        if (indexBytes) {
          fullBytes.set(indexBytes, 29);
        }
        
        setResolvedSubaccount(Array.from(fullBytes));
        setError(null);
      } else {
        const validationError = validateSubaccountValue(type, value);
        if (!validationError && value) {
          const bytes = convertToBytes(type, value);
          setResolvedSubaccount(bytes);
          setError(null);
        } else {
          setResolvedSubaccount(null);
          setError(validationError);
        }
      }
    } catch (err) {
      setResolvedSubaccount(null);
      setError('Invalid input format');
    }
  }, [type, value, indexType, indexValue]);

  // Add helper function at the top level
  function arraysEqual(a: number[], b: number[]): boolean {
    return a.length === b.length && a.every((val, idx) => val === b[idx]);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvedSubaccount || !name.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // First check if a subaccount with this name or bytes already exists
      const existingSubaccounts = await backendService.get_named_subaccounts(tokenId);
      
      // Check for duplicate name
      if (existingSubaccounts.some(s => s.name.toLowerCase() === name.trim().toLowerCase())) {
        setError('A subaccount with this name already exists');
        setIsSubmitting(false);
        return;
      }

      // Check for duplicate subaccount bytes
      if (existingSubaccounts.some(s => arraysEqual(s.subaccount, resolvedSubaccount))) {
        setError('This subaccount already exists under a different name');
        setIsSubmitting(false);
        return;
      }

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
                onChange={(e) => {
                  setType(e.target.value as SubaccountType);
                  setValue('');
                  setIndexValue('');
                }}
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
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
                    ? 'Hex string (e.g., 0000...)'
                    : type === 'bytes'
                    ? 'Comma-separated bytes (e.g., 0, 0, ...)'
                    : type === 'text'
                    ? 'Enter text (max 32 characters)'
                    : type === 'number'
                    ? 'Enter a positive number'
                    : 'Enter Principal ID'
                }
                required
              />
            </div>

            {type === 'principal' && (
              <div className="form-group principal-index">
                <label>Index (Optional)</label>
                <div className="index-inputs">
                  <select
                    className="index-type-select"
                    value={indexType}
                    onChange={(e) => {
                      setIndexType(e.target.value as IndexType);
                      setIndexValue('');
                    }}
                  >
                    <option value="number">Number</option>
                    <option value="hex">Hex</option>
                    <option value="bytes">Bytes</option>
                  </select>
                  <input
                    type="text"
                    className="index-value-input"
                    value={indexValue}
                    onChange={(e) => setIndexValue(e.target.value)}
                    placeholder={
                      indexType === 'number'
                        ? '0-16777215'
                        : indexType === 'hex'
                        ? '0x000000'
                        : '0, 0, 0'
                    }
                  />
                </div>
              </div>
            )}

            {resolvedSubaccount && (
              <div className="subaccount-preview">
                <label>Preview</label>
                {formatText(resolvedSubaccount) && (
                  <code>Text: {formatText(resolvedSubaccount)}</code>
                )}
                {formatNumber(resolvedSubaccount) && (
                  <code>Number: {formatNumber(resolvedSubaccount)}</code>
                )}
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