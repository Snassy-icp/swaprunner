import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { TokenActionModal } from './TokenActionModal';
import { ICPSwapExecutionService } from '../services/icpswap_execution';
import { useTokens } from '../contexts/TokenContext';
import { cacheTokenMetadata } from '../utils/format';
import { principalToSubAccount } from "@dfinity/utils";
import { authService } from '../services/auth';
import { Principal } from '@dfinity/principal';
import { statsService } from '../services/stats';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokenId: string;
  tokenSymbol: string;
  poolId: string | Principal;
  onSuccess?: () => void;
  source?: 'undeposited' | 'wallet';
  isToken0: boolean;  // Make this required
  refreshBalances: () => Promise<void>;
}

export const DepositModal: React.FC<DepositModalProps> = ({
  isOpen,
  onClose,
  tokenId,
  tokenSymbol,
  poolId,
  onSuccess,
  source = 'wallet',  // Default to wallet for backward compatibility
  isToken0,
  refreshBalances
}) => {
  const [maxAmount_e8s, setMaxAmount_e8s] = useState<bigint>(BigInt(0));
  const [fee_e8s, setFee_e8s] = useState<bigint>(BigInt(10000)); // Default fee
  const [isMetadataLoaded, setIsMetadataLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsApproval, setNeedsApproval] = useState<boolean>(false);
  const { tokens, isLoadingMetadata } = useTokens();
  
  // Memoize the execution service
  const executionService = useMemo(() => new ICPSwapExecutionService(), []);

  // Memoize the loadBalanceAndFee function
  const loadBalanceAndFee = useCallback(async () => {
    if (isLoadingMetadata) {
      return;
    }

    try {
      // Cache token metadata first
      await cacheTokenMetadata(tokenId);
      
      // Get token metadata for fee
      const token = tokens.find(t => t.canisterId === tokenId);
      if (token?.metadata) {
        // Check if token is DIP20 and source is undeposited
        if (token.metadata.standard.toLowerCase().includes('dip20') && source === 'undeposited') {
          setError('DIP20 tokens cannot be deposited from undeposited balance. Please use the wallet deposit flow.');
          setIsMetadataLoaded(true);
          return;
        }

        setFee_e8s(token.metadata.fee);


        setIsMetadataLoaded(true);
      } else {
        console.error('Token metadata not found for:', tokenId);
        return;
      }

      // Get balance based on source
      if (source === 'undeposited') {
        const balance = await executionService.getUndepositedPoolBalance({
          poolId,
          tokenId
        });
        if (!balance.error) {
          setMaxAmount_e8s(balance.balance_e8s);
        }
      } else {
        // Get wallet balance for 'wallet' source
        const balance = await executionService.getBalance(tokenId);
        if (!balance.error) {
          setMaxAmount_e8s(balance.balance_e8s);

          if (token?.metadata) {
            // Check if we need approval for ICRC2 or DIP20 tokens
            const standard = token.metadata.standard.toLowerCase();
            if (standard.includes('icrc2') || standard.includes('dip20')) {
              const poolPrincipal = typeof poolId === 'string' ? Principal.fromText(poolId) : poolId;
              const currentAllowance = await executionService.checkAllowance({
                tokenId,
                spender: poolPrincipal
              });
              // We need approval if there's no allowance or if it's less than max balance + fee
              setNeedsApproval(currentAllowance < balance.balance_e8s);
            }            
          }
        }
      }
    } catch (error) {
      console.error('Error loading balance and fee:', error);
    }
  }, [tokenId, poolId, tokens, executionService, isLoadingMetadata, source]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    if (isOpen) {
      // Reset error state when modal opens
      setError(null);
      // Add a small delay to prevent rapid re-fetching
      timeoutId = setTimeout(() => {
        loadBalanceAndFee();
      }, 500);
    } else {
      setIsMetadataLoaded(false);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isOpen, loadBalanceAndFee]);

  const handleDeposit = async (amount_e8s: bigint) => {
    console.log('handleDeposit called with amount:', amount_e8s.toString());
    
    if (error) {
      console.error('Deposit error:', error);
      throw new Error(error);
    }

    // Get token metadata to check standard
    const token = tokens.find(t => t.canisterId === tokenId);
    if (!token?.metadata) {
      console.error('Token metadata not found');
      throw new Error('Token metadata not found');
    }

    const standard = (token.metadata.standard || '').toLowerCase();
    const supportsICRC2 = standard.includes('icrc2');
    const isDIP20 = standard.includes('dip20');
    const useApprovalFlow = supportsICRC2 || isDIP20;

    let depositResult;

    // Only do transfer if source is 'wallet'
    if (source === 'wallet') {
      if (useApprovalFlow) {
        // For ICRC2/DIP20, use approve + depositFrom flow
        console.log('Using approval flow for ICRC2/DIP20 token');
        // Convert poolId to Principal if it's a string
        const poolPrincipal = typeof poolId === 'string' ? Principal.fromText(poolId) : poolId;
        
        const approveResult = await executionService.approveToken({
          tokenId,
          spender: poolPrincipal,
          amount: amount_e8s.toString(),
        });

        if (!approveResult.success) {
          console.error('Approval failed:', approveResult.error);
          throw new Error(approveResult.error || 'Token approval failed');
        }

        // Call depositFrom on the pool
        depositResult = await executionService.depositFromPool({
          poolId: poolPrincipal.toString(),
          tokenId,
          amount_e8s: amount_e8s.toString(),
        });

        if (!depositResult.success) {
          console.error('DepositFrom failed:', depositResult.error);
          throw new Error(depositResult.error || 'DepositFrom failed');
        }
      } else {
        // For ICRC1, use existing transfer + deposit flow
        const userPrincipal = authService.getPrincipal();
        if (!userPrincipal) {
          throw new Error('User not authenticated');
        }
        const subaccount = Array.from(principalToSubAccount(userPrincipal));

        // First, transfer to pool subaccount
        const transferResult = await executionService.transferToPool({
          poolId: poolId.toString(),
          tokenId,
          amount_e8s: amount_e8s.toString(),
          subaccount,
        });

        if (!transferResult.success) {
          throw new Error(transferResult.error || 'Transfer to pool failed');
        }

        // Then deposit the amount
        depositResult = await executionService.depositTokenToPool({
          poolId: poolId.toString(),
          tokenId,
          amount_e8s: amount_e8s.toString(),
          source: 'undeposited',
        });

        if (!depositResult.success) {
          throw new Error(depositResult.error || 'Deposit failed');
        }
      }
    } else {
      // For undeposited balance, just deposit
      depositResult = await executionService.depositTokenToPool({
        poolId: poolId.toString(),
        tokenId,
        amount_e8s: amount_e8s.toString(),
        source: source || 'wallet',  // Pass the source parameter
      });

      if (!depositResult.success) {
        throw new Error(depositResult.error || 'Deposit failed');
      }
    }

    // Record statistics after successful deposit
    try {
      const principal = authService.getPrincipal();
      if (principal) {
        /*await*/ statsService.recordDeposit(
          principal,
          tokenId,
          amount_e8s.toString(),
          typeof poolId === 'string' ? Principal.fromText(poolId) : poolId
        );
      }
    } catch (error) {
      console.error('Failed to record deposit stats:', error);
      // Fire and forget - no error handling per spec
    }

    // Refresh balances after successful deposit
    await refreshBalances();

    if (onSuccess) {
      onSuccess();
    }
  };

  // Only render the TokenActionModal when metadata is loaded
  if (!isMetadataLoaded) {
    return null;
  }

  return (
    <TokenActionModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleDeposit}
      tokenId={tokenId}
      tokenSymbol={tokenSymbol}
      maxAmount_e8s={maxAmount_e8s}
      fee_e8s={fee_e8s}
      title="Deposit to Pool"
      action="Deposit"
      balanceLabel={source === 'undeposited' ? "Undeposited Balance" : "Available Balance"}
      subtractFees={source === 'wallet' ? (needsApproval ? fee_e8s * 2n : fee_e8s) : 0n}
      error={error}
    />
  );
}; 