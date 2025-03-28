import { TokenMetadata } from '../types/token';

interface SwapWarningParams {
  fromToken: {
    canisterId: string;
    metadata?: TokenMetadata;
  };
  slippageTolerance: number;
  depositNeeds?: {
    fromDeposited: bigint;
    fromUndeposited: bigint;
    fromWallet: bigint;
    adjustedAmount: bigint;
    originalAmount: bigint;
  };
}

export interface SwapWarning {
  type: 'frontrun' | 'browserCrash';
  message: string;
}

export function checkIcpSwapWarnings(params: SwapWarningParams): SwapWarning[] {
  const warnings: SwapWarning[] = [];

  // Check for front-running risk when using undeposited funds with high slippage
  if (params.depositNeeds) {
    const usingUndepositedFunds = 
      (params.depositNeeds.fromUndeposited > 0n || params.depositNeeds.fromWallet > 0n);

    if (usingUndepositedFunds && params.slippageTolerance > 0.1) {
      warnings.push({
        type: 'frontrun',
        message: 'Warning: Using undeposited funds with slippage tolerance > 0.1% on ICPSwap increases risk of front-running.'
      });
    }
  }

  return warnings;
}

export function checkKongWarnings(params: SwapWarningParams): SwapWarning[] {
  const warnings: SwapWarning[] = [];

  // Check for ICRC1 token browser crash risk
  const isICRC1 = params.fromToken.metadata?.standard?.toLowerCase().includes('icrc1');

  if (isICRC1) {
    warnings.push({
      type: 'browserCrash',
      message: 'Warning: Using ICRC1 tokens with Kong swap carries a risk of fund loss if your browser crashes during the swap.'
    });
  }

  return warnings;
}

export function checkSplitSwapWarnings(params: SwapWarningParams): SwapWarning[] {
  // For split swaps, we check both conditions
  return [
    ...checkIcpSwapWarnings(params),
    ...checkKongWarnings(params)
  ];
} 