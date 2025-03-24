import { useState, useCallback } from 'react';
import { Principal } from '@dfinity/principal';

interface SwapDetails {
  fromToken: {
    symbol: string;
    amount: string;
    canisterId: string;
  };
  toToken: {
    symbol: string;
    amount: string;
    canisterId: string;
  };
  dex: 'icpswap' | 'kong';
  slippageTolerance: number;
}

interface SwapStep {
  title: string;
  status: 'pending' | 'loading' | 'complete' | 'error' | 'skipped';
  details?: {
    amount?: string;
    canisterId?: string;
  };
  error?: string;
  optimizationMessage?: string;
}

export const useSwapExecution = (details: SwapDetails) => {
  const [steps, setSteps] = useState<SwapStep[]>(() => {
    const fromSymbol = details?.fromToken?.symbol || 'token';
    const toSymbol = details?.toToken?.symbol || 'token';
    const fromAmount = details?.fromToken?.amount || '0';
    const fromCanisterId = details?.fromToken?.canisterId || '';
    const toAmount = details?.toToken?.amount || '0';

    console.log('Creating steps with amounts:', { fromAmount, toAmount });

    const initialSteps: SwapStep[] = details?.dex === 'kong' ? [
      {
        title: `1. Transfer ${fromSymbol}`,
        status: 'pending' as const,
        details: {
          amount: fromAmount,
          canisterId: fromCanisterId,
        },
      },
      {
        title: `2. Execute Swap`,
        status: 'pending' as const,
      },
    ] : [
      {
        title: `1. Transfer ${fromSymbol} to pool`,
        status: 'pending' as const,
        details: {
          amount: fromAmount,
          canisterId: fromCanisterId,
        },
      },
      {
        title: `2. Deposit ${fromSymbol}`,
        status: 'pending' as const,
        details: {
          amount: fromAmount,
          canisterId: fromCanisterId,
        },
      },
      {
        title: `3. Swap ${fromSymbol} to ${toSymbol}`,
        status: 'pending' as const,
      },
      {
        title: `4. Withdraw ${toSymbol}`,
        status: 'pending' as const,
        details: {
          amount: toAmount,
        },
      },
    ];

    return initialSteps;
  });

  const updateStepStatus = useCallback((index: number, status: SwapStep['status'], error?: string) => {
    console.log('Updating step status:', { index, status, error });
    setSteps(currentSteps => {
      const newSteps = currentSteps.map((step, i) => 
        i === index 
          ? { ...step, status, error }
          : step
      );
      console.log('Updated steps:', newSteps);
      return newSteps;
    });
  }, []);

  const startNextStep = useCallback(() => {
    const nextStepIndex = steps.findIndex(step => step.status === 'pending');
    console.log('Starting next step:', { nextStepIndex, steps });
    if (nextStepIndex !== -1) {
      updateStepStatus(nextStepIndex, 'loading');
      return nextStepIndex;
    }
    return -1;
  }, [steps, updateStepStatus]);

  const completeStep = useCallback((index: number) => {
    console.log('Completing step:', index);
    updateStepStatus(index, 'complete');
  }, [updateStepStatus]);

  const failStep = useCallback((index: number, error: string) => {
    console.log('Failed step:', { index, error });
    updateStepStatus(index, 'error', error);
  }, [updateStepStatus]);

  const resetSteps = useCallback(() => {
    console.log('Resetting all steps');
    setSteps(currentSteps => 
      currentSteps.map(step => ({
        ...step,
        status: 'pending',
        error: undefined,
      }))
    );
  }, []);

  return {
    steps,
    updateStepStatus,
    startNextStep,
    completeStep,
    failStep,
    resetSteps,
  };
}; 