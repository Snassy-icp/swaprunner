import React, { useState, useEffect } from 'react';
import { TokenActionModal } from './TokenActionModal';
import { ICPSwapExecutionService } from '../services/icpswap_execution';
import { useTokens } from '../contexts/TokenContext';
import { principalToSubAccount } from "@dfinity/utils";
import { authService } from '../services/auth';
import { Principal } from '@dfinity/principal';
import { statsService } from '../services/stats';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokenId: string;
  tokenSymbol: string;
  poolId: string;
  onSuccess?: () => void;
  isToken0: boolean;
  refreshBalances: () => Promise<void>;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  isOpen,
  onClose,
  tokenId,
  tokenSymbol,
  poolId,
  onSuccess,
  isToken0,
  refreshBalances
}) => {
  const [maxAmount_e8s, setMaxAmount_e8s] = useState<bigint>(BigInt(0));
  const [fee_e8s, setFee_e8s] = useState<bigint>(BigInt(10000)); // Default fee
  const [error, setError] = useState<string | null>(null);
  const { tokens } = useTokens();
  const executionService = new ICPSwapExecutionService();

  useEffect(() => {
    const loadBalanceAndFee = async () => {
      // Get token metadata for fee
      const token = tokens.find(t => t.canisterId === tokenId);
      if (!token?.metadata) return;

      // Check if token is DIP20
      if (token.metadata.standard.toLowerCase().includes('dip20')) {
        setError('DIP20 tokens cannot be transferred to ICPSwap pools. Please use ICRC1 or ICRC2 tokens instead.');
        return;
      }

      setFee_e8s(token.metadata.fee);

      // Get user's balance
      const balance = await executionService.getBalance(tokenId);
      if (!balance.error) {
        setMaxAmount_e8s(balance.balance_e8s);
      }
    };

    if (isOpen) {
      loadBalanceAndFee();
    }
  }, [isOpen, tokenId, tokens, executionService]);

  const handleTransfer = async (amount_e8s: bigint) => {
    if (error) {
      throw new Error(error);
    }

    // Get user's principal and generate subaccount
    const userPrincipal = authService.getPrincipal();
    if (!userPrincipal) {
      throw new Error('User not authenticated');
    }
    const subaccount = Array.from(principalToSubAccount(userPrincipal));

    try {
      const result = await executionService.transferToPool({
        poolId: poolId.toString(),
        tokenId,
        amount_e8s: amount_e8s.toString(),
        subaccount,
      });

      if (!result.success) {
        throw new Error(result.error || 'Transfer failed');
      }

      // Record statistics after successful transfer
      try {
        /*await*/ statsService.recordTransfer(
          userPrincipal,
          tokenId,
          amount_e8s.toString(),
          typeof poolId === 'string' ? Principal.fromText(poolId) : poolId
        );
      } catch (error) {
        console.error('Failed to record transfer stats:', error);
        // Fire and forget - no error handling per spec
      }

      // Refresh balances after successful transfer
      await refreshBalances();

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      throw new Error('Invalid pool ID format: ' + error);
    }
  };

  return (
    <TokenActionModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleTransfer}
      tokenId={tokenId}
      tokenSymbol={tokenSymbol}
      maxAmount_e8s={maxAmount_e8s}
      fee_e8s={fee_e8s}
      title="Transfer to Pool"
      action="Transfer"
      balanceLabel="Available Balance"
      subtractFees={fee_e8s}
      error={error}
    />
  );
}; 