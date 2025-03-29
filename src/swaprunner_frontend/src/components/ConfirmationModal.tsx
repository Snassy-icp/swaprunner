import React from 'react';
import { FiX } from 'react-icons/fi';
import '../styles/ConfirmationModal.css';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDanger = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="confirmation-modal">
        <div className="confirmation-modal-header">
          <h2>{title}</h2>
          <button className="modal-close-button" onClick={onClose}>
            <FiX size={24} />
          </button>
        </div>

        <div className="confirmation-modal-content">
          <p>{message}</p>
        </div>

        <div className="confirmation-modal-actions">
          <button 
            className="confirmation-modal-cancel" 
            onClick={onClose}
          >
            {cancelText}
          </button>
          <button 
            className={`confirmation-modal-confirm ${isDanger ? 'danger' : ''}`}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}; 