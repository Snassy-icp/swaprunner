import { Principal } from '@dfinity/principal';

/**
 * Represents a step in a swap operation, whether it's a regular swap, Kong swap, or split swap.
 * Used to track and display the progress of swap operations.
 */
export interface SwapStep {
  /** The title/name of this step */
  title: string;
  /** Detailed description of what this step does */
  description: string;
  /** Current status of the step */
  status: 'pending' | 'loading' | 'complete' | 'error' | 'skipped';
  /** Error message if status is 'error' */
  error?: string;
  /** Optional message explaining any optimizations made during this step */
  optimizationMessage?: string;
  /** Detailed information about the step's execution */
  details?: {
    /** Amount being processed in this step (in e8s) */
    amount?: string;
    /** Expected output amount (in e8s) */
    amountOut?: string;
    /** Symbol of the input token */
    tokenSymbol?: string;
    /** Symbol of the output token */
    tokenOutSymbol?: string;
    /** Destination address/principal */
    destination?: string | Principal;
    /** Canister ID involved in this step */
    canisterId?: string | Principal;
    /** Transaction ID for tracking (used for ICPSwap transactions) */
    transactionId?: string;
    /** Transaction ID for Kong transactions (separate from ICPSwap transactionId) */
    kongTransactionId?: string;
    /** Price impact of this step (as a decimal, e.g., 0.05 for 5%) */
    priceImpact?: number;
    /** Reason for any optimizations made */
    optimizationReason?: string;
    /** Amount that was deposited (for ICPSwap operations) */
    depositedAmount?: string;
    /** Spender for ICRC2 approval */
    spender?: Principal | string;
  };
} 