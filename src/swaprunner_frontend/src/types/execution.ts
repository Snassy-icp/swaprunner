import { Principal } from '@dfinity/principal';

/**
 * Generic execution result interface used across different token standards
 * (ICRC1, ICRC2, DIP20) for consistent response handling
 */
export interface ExecutionResult {
  success: boolean;
  error?: string;
  txId?: string;
  outputAmount?: bigint;
  depositedAmount?: bigint;
  priceImpact?: number;
  step?: 'approve' | 'transfer' | 'deposit' | 'swap' | 'withdraw' | 'unknown';
  status?: 'pending' | 'loading' | 'complete' | 'error' | 'skipped';
  optimizationMessage?: string;
  details?: {
    amount?: string;
    amountOut?: string;
    tokenSymbol?: string;
    tokenOutSymbol?: string;
    destination?: string | Principal;
    canisterId?: string;
    transactionId?: string;
    priceImpact?: number;
    optimizationReason?: string;
    depositedAmount?: string;
    spender?: Principal | string;
  };
} 