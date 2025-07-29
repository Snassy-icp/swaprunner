import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { TokenActionModal } from './TokenActionModal';
import { authService } from '../services/auth';
import { backendService } from '../services/backend';
import { useTokens } from '../contexts/TokenContext';
import { cacheTokenMetadata } from '../utils/format';
import { Principal } from '@dfinity/principal';
import { Actor, HttpAgent } from '@dfinity/agent';
import { idlFactory as sgldtIdlFactory } from '../../../external/sgldt/sgldt.did.js';
import { idlFactory as icrc1IdlFactory } from '../../../external/icrc1_ledger/icrc1_ledger.did.js';

const GLDT_CANISTER_ID = '6c7su-kiaaa-aaaar-qaira-cai';
const SGLDT_CANISTER_ID = 'i2s4q-syaaa-aaaan-qz4sq-cai';

// Type definitions for the actor responses
interface ICRC1Actor {
  icrc1_balance_of: (arg: { owner: Principal; subaccount: [] | [number[]] }) => Promise<bigint>;
  icrc2_allowance: (arg: { account: { owner: Principal; subaccount: [] | [number[]] }; spender: { owner: Principal; subaccount: [] | [number[]] } }) => Promise<{ allowance: bigint; expires_at: [] | [bigint] }>;
  icrc2_approve: (arg: any) => Promise<{ Ok: bigint } | { Err: any }>;
}

interface SGLDTActor {
  icrc1_balance_of: (arg: { owner: Principal; subaccount: [] | [number[]] }) => Promise<bigint>;
  deposit: (subaccount: [] | [number[]], amount: bigint) => Promise<{ ok: [bigint, bigint] } | { err: string }>;
  withdraw: (subaccount: [] | [number[]], amount: bigint) => Promise<{ ok: [bigint, bigint] } | { err: string }>;
}

interface WrapUnwrapModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'wrap' | 'unwrap';
  tokenId: string;
  tokenSymbol: string;
  onSuccess?: () => void;
  refreshBalances: () => Promise<void>;
}

export const WrapUnwrapModal: React.FC<WrapUnwrapModalProps> = ({
  isOpen,
  onClose,
  mode,
  tokenId,
  tokenSymbol,
  onSuccess,
  refreshBalances
}) => {
  const [maxAmount_e8s, setMaxAmount_e8s] = useState<bigint>(BigInt(0));
  const [gldtFee_e8s, setGldtFee_e8s] = useState<bigint>(BigInt(10000000)); // Default 0.1 GLDT
  const [isMetadataLoaded, setIsMetadataLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { tokens, isLoadingMetadata } = useTokens();

  // Create HttpAgent
  const createAgent = useCallback(async (): Promise<HttpAgent> => {
    const identity = await authService.getIdentity();
    if (!identity) {
      throw new Error('User not authenticated');
    }

    const agent = new HttpAgent({
      host: process.env.DFX_NETWORK === 'ic' ? 'https://ic0.app' : 'http://localhost:4943',
      identity,
    });

    if (process.env.DFX_NETWORK !== 'ic') {
      await agent.fetchRootKey();
    }

    return agent;
  }, []);

  // Memoize actors
  const sgldtActor = useMemo(async (): Promise<SGLDTActor | null> => {
    try {
      const agent = await createAgent();
      return Actor.createActor(sgldtIdlFactory, {
        agent,
        canisterId: SGLDT_CANISTER_ID,
      }) as SGLDTActor;
    } catch (error) {
      console.error('Error creating sGLDT actor:', error);
      return null;
    }
  }, [createAgent]);

  const gldtActor = useMemo(async (): Promise<ICRC1Actor | null> => {
    try {
      const agent = await createAgent();
      return Actor.createActor(icrc1IdlFactory, {
        agent,
        canisterId: GLDT_CANISTER_ID,
      }) as ICRC1Actor;
    } catch (error) {
      console.error('Error creating GLDT actor:', error);
      return null;
    }
  }, [createAgent]);

  // Load balance and fee information
  const loadBalanceAndFee = useCallback(async () => {
    if (isLoadingMetadata) {
      return;
    }

    try {
      // Cache token metadata first
      await cacheTokenMetadata(GLDT_CANISTER_ID);
      
      // Get GLDT token metadata for fee
      const gldtToken = tokens.find(t => t.canisterId === GLDT_CANISTER_ID);
      if (gldtToken?.metadata) {
        setGldtFee_e8s(gldtToken.metadata.fee);
      }

      // Get balance based on mode
      const principal = await authService.getPrincipal();
      if (!principal) return;

      const account = { owner: principal, subaccount: [] as [] | [number[]] };

      if (mode === 'wrap') {
        // Get GLDT balance for wrapping
        const actor = await gldtActor;
        if (actor) {
          const balance = await actor.icrc1_balance_of(account);
          setMaxAmount_e8s(balance);
        }
      } else {
        // Get sGLDT balance for unwrapping
        const actor = await sgldtActor;
        if (actor) {
          const balance = await actor.icrc1_balance_of(account);
          setMaxAmount_e8s(balance);
        }
      }

      setIsMetadataLoaded(true);
    } catch (error) {
      console.error('Error loading balance and fee:', error);
      setError('Failed to load token information');
    }
  }, [tokens, isLoadingMetadata, mode, gldtActor, sgldtActor]);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsMetadataLoaded(false);
      loadBalanceAndFee();
    }
  }, [isOpen, loadBalanceAndFee]);

  const handleWrap = async (amount_e8s: bigint) => {
    const gldtActorInstance = await gldtActor;
    const sgldtActorInstance = await sgldtActor;
    
    if (!gldtActorInstance || !sgldtActorInstance) {
      throw new Error('Actors not initialized');
    }

    const principal = await authService.getPrincipal();
    if (!principal) {
      throw new Error('Not authenticated');
    }

    // Amount to approve and deposit (amount - 1 GLDT fee)
    const approveAmount = amount_e8s - gldtFee_e8s;
    const sgldtPrincipal = Principal.fromText(SGLDT_CANISTER_ID);

    // Check current allowance
    const allowanceArgs = {
      account: { owner: principal, subaccount: [] as [] | [number[]] },
      spender: { owner: sgldtPrincipal, subaccount: [] as [] | [number[]] }
    };
    
    const currentAllowance = await gldtActorInstance.icrc2_allowance(allowanceArgs);
    
    // Approve if needed
    if (currentAllowance.allowance < approveAmount) {
      const approveArgs = {
        amount: approveAmount,
        spender: { owner: sgldtPrincipal, subaccount: [] as [] | [number[]] },
        fee: [] as [] | [bigint],
        memo: [] as [] | [number[]],
        from_subaccount: [] as [] | [number[]],
        created_at_time: [] as [] | [bigint],
        expected_allowance: [] as [] | [bigint],
        expires_at: [] as [] | [bigint]
      };

      const approveResult = await gldtActorInstance.icrc2_approve(approveArgs);
      if ('Err' in approveResult) {
        throw new Error(`Approval failed: ${Object.keys(approveResult.Err)[0]}`);
      }
    }

    // Call deposit on sGLDT canister
    const depositResult = await sgldtActorInstance.deposit([], approveAmount);
    if ('err' in depositResult) {
      throw new Error(`Deposit failed: ${depositResult.err}`);
    }

    // Add sGLDT token to wallet if not already present
    try {
      await backendService.add_wallet_token(SGLDT_CANISTER_ID);
    } catch (error) {
      console.warn('Failed to add sGLDT token to wallet:', error);
    }

    // Refresh balances
    await refreshBalances();
    
    if (onSuccess) onSuccess();
  };

  const handleUnwrap = async (amount_e8s: bigint) => {
    const sgldtActorInstance = await sgldtActor;
    if (!sgldtActorInstance) {
      throw new Error('sGLDT actor not initialized');
    }

    // Call withdraw on sGLDT canister
    const withdrawResult = await sgldtActorInstance.withdraw([], amount_e8s);
    if ('err' in withdrawResult) {
      throw new Error(`Withdraw failed: ${withdrawResult.err}`);
    }

    // Add GLDT token to wallet if not already present
    try {
      await backendService.add_wallet_token(GLDT_CANISTER_ID);
    } catch (error) {
      console.warn('Failed to add GLDT token to wallet:', error);
    }

    // Refresh balances
    await refreshBalances();
    
    if (onSuccess) onSuccess();
  };

  const handleConfirm = async (amount_e8s: bigint) => {
    if (mode === 'wrap') {
      await handleWrap(amount_e8s);
    } else {
      await handleUnwrap(amount_e8s);
    }
  };

  const getResultingAmount = (inputAmount_e8s: bigint): string => {
    if (mode === 'wrap') {
      // Wrap: input amount - 2 GLDT fees = resulting sGLDT
      const resultAmount = inputAmount_e8s - (gldtFee_e8s * 2n);
      return resultAmount > 0n ? (Number(resultAmount) / 100000000).toFixed(8) : '0.00000000';
    } else {
      // Unwrap: input amount results in (input - 3 GLDT fees) GLDT
      const resultAmount = inputAmount_e8s - (gldtFee_e8s * 3n);
      return resultAmount > 0n ? (Number(resultAmount) / 100000000).toFixed(8) : '0.00000000';
    }
  };

  const getTitle = () => {
    return mode === 'wrap' ? 'Wrap GLDT to sGLDT' : 'Unwrap sGLDT to GLDT';
  };

  const getBalanceLabel = () => {
    return mode === 'wrap' ? 'Max GLDT Available:' : 'Max sGLDT Available:';
  };

  const getActionText = () => {
    return mode === 'wrap' ? 'Wrap' : 'Unwrap';
  };

  if (!isMetadataLoaded) {
    return null;
  }

  return (
    <TokenActionModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      tokenId={tokenId}
      tokenSymbol={tokenSymbol}
      maxAmount_e8s={maxAmount_e8s}
      fee_e8s={mode === 'wrap' ? gldtFee_e8s : BigInt(0)}
      title={getTitle()}
      action={getActionText()}
      balanceLabel={getBalanceLabel()}
      subtractFees={mode === 'wrap' ? gldtFee_e8s : BigInt(0)}
      error={error}
    />
  );
};