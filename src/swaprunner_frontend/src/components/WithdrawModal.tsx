import React, { useState, useEffect } from 'react';
import { TokenActionModal } from './TokenActionModal';
import { ICPSwapExecutionService } from '../services/icpswap_execution';
import { useTokens } from '../contexts/TokenContext';
import { authService } from '../services/auth';
import { Principal } from '@dfinity/principal';
import { statsService } from '../services/stats';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokenId: string;
  tokenSymbol: string;
  poolId: string;
  source: 'undeposited' | 'deposited' | 'pool' | 'wallet';
  onSuccess?: () => void;
  isToken0: boolean;
  refreshBalances: () => Promise<void>;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({
  isOpen,
  onClose,
  tokenId,
  tokenSymbol,
  poolId,
  source,
  onSuccess,
  isToken0,
  refreshBalances
}) => {
  const [maxAmount_e8s, setMaxAmount_e8s] = useState<bigint>(BigInt(0));
  const [depositedBalance_e8s, setDepositedBalance_e8s] = useState<bigint>(BigInt(0));
  const [undepositedBalance_e8s, setUndepositedBalance_e8s] = useState<bigint>(BigInt(0));
  const [fee_e8s, setFee_e8s] = useState<bigint>(BigInt(10000)); // Default fee
  const [isDIP20, setIsDIP20] = useState<boolean>(false);
  const { tokens } = useTokens();
  const executionService = new ICPSwapExecutionService();

  useEffect(() => {
    const loadBalanceAndFee = async () => {
      // Get token metadata for fee
      const token = tokens.find(t => t.canisterId === tokenId);
      if (!token?.metadata) return;

      setFee_e8s(token.metadata.fee);
      
      // Check if token is DIP20
      const isDIP20Token = token.metadata.standard.toLowerCase().includes('dip20');
      setIsDIP20(isDIP20Token);

      // Get balances based on source
      if (source === 'undeposited') {
        const balance = await executionService.getUndepositedPoolBalance({
          poolId,
          tokenId,
        });
        if (!balance.error) {
          setMaxAmount_e8s(balance.balance_e8s);
          setUndepositedBalance_e8s(balance.balance_e8s);
        }
      } else if (source === 'deposited') {
        const balance = await executionService.getDepositedPoolBalance({
          poolId,
        });
        const depositedBalance = isToken0 ? balance.balance0_e8s : balance.balance1_e8s;
        setMaxAmount_e8s(depositedBalance);
        setDepositedBalance_e8s(depositedBalance);
      } else if (source === 'pool') {
        // For header withdraw (total pool balance), get both balances
        const [deposited, undeposited] = await Promise.all([
          executionService.getDepositedPoolBalance({ poolId }),
          executionService.getUndepositedPoolBalance({ poolId, tokenId })
        ]);
        
        const depositedBalance = isToken0 ? deposited.balance0_e8s : deposited.balance1_e8s;
        const undepositedBalance = undeposited.error ? BigInt(0) : undeposited.balance_e8s;
        
        setDepositedBalance_e8s(depositedBalance);
        setUndepositedBalance_e8s(undepositedBalance);

        // For DIP20 tokens, only use deposited balance
        if (isDIP20Token) {
          setMaxAmount_e8s(depositedBalance);
        } else {
          // For non-DIP20 tokens, calculate max amount including undeposited balance
          if (undepositedBalance > BigInt(0)) {
            const neededFromUndeposited = undepositedBalance > fee_e8s ? undepositedBalance - fee_e8s : BigInt(0);
            setMaxAmount_e8s(depositedBalance + neededFromUndeposited);
          } else {
            setMaxAmount_e8s(depositedBalance);
          }
        }
      }
    };

    if (isOpen) {
      loadBalanceAndFee();
    }
  }, [isOpen, tokenId, poolId, source, tokens, executionService, isToken0]);

  const handleWithdraw = async (amount_e8s: bigint) => {
    // For DIP20 tokens, skip the transfer step and only allow withdrawing deposited balance
    if (isDIP20) {
      if (amount_e8s > depositedBalance_e8s) {
        throw new Error('Amount exceeds deposited balance');
      }

      const result = await executionService.withdrawFromPool({
        poolId,
        tokenId,
        amount_e8s: amount_e8s.toString(),
      });

      if (!result.success) {
        throw new Error(result.error || 'Withdrawal failed');
      }

      // Record withdrawal stats
      try {
        const principal = authService.getPrincipal();
        if (principal) {
          /*await*/ statsService.recordWithdrawal(
            principal,
            tokenId,
            amount_e8s.toString(),
            typeof poolId === 'string' ? Principal.fromText(poolId) : poolId
          );
        }
      } catch (error) {
        console.error('Failed to record withdrawal stats:', error);
        // Fire and forget - no error handling per spec
      }

      await refreshBalances();

      if (onSuccess) {
        onSuccess();
      }
      return;
    }

    // Original logic for non-DIP20 tokens
    if (source === 'undeposited') {
      // For undeposited balance, first deposit then withdraw
      // The actual deposited amount will be amount_e8s - fee_e8s
      const depositResult = await executionService.depositTokenToPool({
        poolId: poolId.toString(),
        tokenId,
        amount_e8s: amount_e8s.toString(),
        source: 'undeposited',
      });

      if (!depositResult.success) {
        throw new Error(depositResult.error || 'Deposit failed');
      }

      // Calculate the actual amount that was deposited (original amount minus fee)
      const actualDepositedAmount = amount_e8s - fee_e8s;

      // Now withdraw the actual deposited amount
      const result = await executionService.withdrawFromPool({
        poolId,
        tokenId,
        amount_e8s: actualDepositedAmount.toString(),
      });

      if (!result.success) {
        throw new Error(result.error || 'Withdrawal failed');
      }

      // Record withdrawal stats
      try {
        const principal = authService.getPrincipal();
        if (principal) {
          /*await*/ statsService.recordWithdrawal(
            principal,
            tokenId,
            actualDepositedAmount.toString(),
            typeof poolId === 'string' ? Principal.fromText(poolId) : poolId
          );
        }
      } catch (error) {
        console.error('Failed to record withdrawal stats:', error);
        // Fire and forget - no error handling per spec
      }
    } else if (source === 'pool' && amount_e8s > depositedBalance_e8s) {
      // If withdrawing more than deposited balance, deposit the required amount first
      const amountToDeposit = amount_e8s - depositedBalance_e8s;
      
      // We need to deposit the missing amount plus one fee to account for the deposit fee
      const amountToDepositWithFee = amountToDeposit + fee_e8s;
      
      if (amountToDepositWithFee > undepositedBalance_e8s) {
        throw new Error('Insufficient undeposited balance (including fee)');
      }

      const depositResult = await executionService.depositTokenToPool({
        poolId: poolId.toString(),
        tokenId,
        amount_e8s: amountToDepositWithFee.toString(),
        source: 'undeposited',
      });

      if (!depositResult.success) {
        throw new Error(depositResult.error || 'Deposit failed');
      }
    }

    // For all other cases, withdraw the requested amount
    if (source !== 'undeposited') {
      const result = await executionService.withdrawFromPool({
        poolId,
        tokenId,
        amount_e8s: amount_e8s.toString(),
      });

      if (!result.success) {
        throw new Error(result.error || 'Withdrawal failed');
      }

      // Record withdrawal stats
      try {
        const principal = authService.getPrincipal();
        if (principal) {
          /*await*/ statsService.recordWithdrawal(
            principal,
            tokenId,
            amount_e8s.toString(),
            typeof poolId === 'string' ? Principal.fromText(poolId) : poolId
          );
        }
      } catch (error) {
        console.error('Failed to record withdrawal stats:', error);
        // Fire and forget - no error handling per spec
      }
    }

    await refreshBalances();

    if (onSuccess) {
      onSuccess();
    }
  };

  return (
    <TokenActionModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleWithdraw}
      tokenId={tokenId}
      tokenSymbol={tokenSymbol}
      maxAmount_e8s={maxAmount_e8s}
      fee_e8s={fee_e8s}
      title={`Withdraw ${source === 'deposited' ? 'from Pool' : source === 'pool' ? 'from Pool' : source === 'wallet' ? 'from Wallet' : 'to Wallet'}`}
      action="Withdraw"
      balanceLabel={`${source === 'deposited' ? 'Deposited' : source === 'pool' ? 'Total Pool' : source === 'wallet' ? 'Wallet' : 'Undeposited'} Balance`}
      subtractFees={0n}
    />
  );
}; 