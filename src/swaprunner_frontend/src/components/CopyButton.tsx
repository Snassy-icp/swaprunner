import React from 'react';
import { FiCopy, FiCheck } from 'react-icons/fi';

interface CopyButtonProps {
  text: string;
  className?: string;
}

export const CopyButton: React.FC<CopyButtonProps> = ({ text, className = '' }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button 
      onClick={handleCopy}
      className={`copy-button ${className}`}
      title="Copy to clipboard"
    >
      {copied ? <FiCheck /> : <FiCopy />}
    </button>
  );
}; 