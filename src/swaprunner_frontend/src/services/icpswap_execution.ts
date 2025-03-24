import { Actor, HttpAgent } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { principalToSubAccount } from "@dfinity/utils";
import { idlFactory as poolIdlFactory } from '../../../external/icp_swap/icp_swap.did.js';
import { idlFactory as tokenIdlFactory } from '../../../external/icrc1_ledger/icrc1_ledger.did.js';
import { idlFactory as dip20IdlFactory } from '../../../external/dip20/dip20.did.js';
import { authService } from './auth';
import { tokenService } from './token';
import { formatTokenAmount, getCachedTokenMetadata } from '../utils/format';

export interface ICPSwapExecutionParams {
  poolId: string;
  fromToken: {
    amount_e8s: string;
    canisterId: string;
  };
  toToken: {
    minAmount_e8s: string;
    canisterId: string;
  };
  zeroForOne: boolean;
  slippageTolerance: number;
}

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

export interface TokenBalance {
  balance_e8s: bigint;
  error?: string;
}

export interface PoolBalance {
  balance0_e8s: bigint;
  balance1_e8s: bigint;
  error?: string;
}

export class ICPSwapExecutionService {
  private agent: HttpAgent | null = null;
  private poolActors: Map<string, any> = new Map();
  private tokenActors: Map<string, any> = new Map();

  private async getAgent(): Promise<HttpAgent> {
    if (this.agent) return this.agent;

    const identity = authService.getIdentity();
    if (!identity) {
      throw new Error('User not authenticated');
    }

    this.agent = new HttpAgent({
      host: process.env.DFX_NETWORK === 'ic' ? 'https://ic0.app' : 'http://localhost:4943',
      identity,
    });

    if (process.env.DFX_NETWORK !== 'ic') {
      await this.agent.fetchRootKey();
    }

    return this.agent;
  }

  private async getPoolActor(poolId: string): Promise<any> {
    if (this.poolActors.has(poolId)) {
      return this.poolActors.get(poolId);
    }

    //console.log('Creating new pool actor for poolId:', poolId);
    const agent = await this.getAgent();
    const actor = Actor.createActor(poolIdlFactory, {
      agent,
      canisterId: poolId,
    });
    //console.log('Pool actor created successfully');

    this.poolActors.set(poolId, actor);
    return actor;
  }

  private async getTokenActor(tokenId: string): Promise<any> {
    if (this.tokenActors.has(tokenId)) {
      return this.tokenActors.get(tokenId);
    }

    //console.log('Creating new token actor for tokenId:', tokenId);
    const agent = await this.getAgent();
    
    // Get token metadata to determine the standard
    const metadata = await tokenService.getMetadata(tokenId);
    const factory = metadata.standard.toLowerCase().includes('dip20') ? dip20IdlFactory : tokenIdlFactory;
    
    const actor = Actor.createActor(factory, {
      agent,
      canisterId: tokenId,
    });
    //console.log('Token actor created successfully');

    this.tokenActors.set(tokenId, actor);
    return actor;
  }

  // Reset actors when identity changes
  private resetActors() {
    this.agent = null;
    this.poolActors.clear();
    this.tokenActors.clear();
  }

  // Make checkAllowance public
  async checkAllowance(params: {
    tokenId: string;
    spender: Principal;
  }): Promise<bigint> {
    try {
      const tokenActor = await this.getTokenActor(params.tokenId);
      const userPrincipal = authService.getPrincipal();
      if (!userPrincipal) {
        console.log('Could not check allowance: User not authenticated');
        return BigInt(0);
      }

      // Get token metadata to determine standard
      const metadata = await tokenService.getMetadata(params.tokenId);
      const isDIP20 = metadata.standard.toLowerCase().includes('dip20');

      if (isDIP20) {
        // For DIP20, use allowance method
        const result = await tokenActor.allowance(userPrincipal, params.spender);
        return result.Ok || BigInt(0);
      } else {
        // For ICRC2, use icrc2_allowance
        const result = await tokenActor.icrc2_allowance({
          account: { owner: userPrincipal, subaccount: [] },
          spender: { owner: params.spender, subaccount: [] }
        });
        return result.allowance;
      }
    } catch (error: any) {
      console.error('Error checking allowance:', error);
      return BigInt(0);
    }
  }

  // Make approveToken public
  async approveToken(params: {
    tokenId: string;
    spender: Principal;
    amount: string;
  }): Promise<ExecutionResult> {
    try {
      // Get token metadata to fetch the fee and determine standard
      const metadata = await tokenService.getMetadata(params.tokenId);
      const fee = metadata.fee || BigInt(0);
      const isDIP20 = metadata.standard.toLowerCase().includes('dip20');
      
      // First check current allowance
      const currentAllowance = await this.checkAllowance({
        tokenId: params.tokenId,
        spender: params.spender
      });
      
      console.log('Current allowance:', currentAllowance.toString());
      const requiredAmount = BigInt(params.amount) + fee;  // Add fee to required amount
      console.log('Required amount (including fee):', requiredAmount.toString());
      
      // If we already have sufficient allowance, skip approval
      if (currentAllowance >= requiredAmount) {
        console.log('Sufficient allowance already exists');
        return { 
          success: true, 
          optimizationMessage: 'Using existing approval',
          details: {
            amount: params.amount,
            spender: params.spender
          }
        };
      }

      const tokenActor = await this.getTokenActor(params.tokenId);

      if (isDIP20) {
        // For DIP20, use approve method
        console.log('Calling DIP20 approve with:', {
          spender: params.spender.toString(),
          amount: requiredAmount.toString()
        });

        const result = await tokenActor.approve(params.spender, requiredAmount);
        console.log('DIP20 approval result:', result);

        if ('Ok' in result) {
          return { success: true, txId: result.Ok.toString() };
        } else {
          const errorStr = typeof result.Err === 'object' ? 
            JSON.stringify(result.Err) : 
            String(result.Err);
          console.error('DIP20 approval failed:', errorStr);
          return { success: false, error: `DIP20 approval failed: ${errorStr}` };
        }
      } else {
        // For ICRC2, use icrc2_approve
        console.log('Calling icrc2_approve with:', {
          amount: requiredAmount.toString(),
          spender: params.spender.toString(),
          expected_allowance: currentAllowance.toString()
        });

        const result = await tokenActor.icrc2_approve({
          amount: requiredAmount,  // Use amount that includes fee
          spender: { owner: params.spender, subaccount: [] },
          expected_allowance: [currentAllowance],
          expires_at: [], // No expiration
          fee: [],
          memo: [],
          from_subaccount: [],
          created_at_time: [],
        });

        console.log('ICRC2 approval result:', JSON.stringify(result, (_, v) => 
          typeof v === 'bigint' ? v.toString() : v
        ));

        if ('Ok' in result) {
          return { success: true, txId: result.Ok.toString() };
        } else {
          const errorStr = typeof result.Err === 'object' ? 
            JSON.stringify(result.Err, (_, v) => typeof v === 'bigint' ? v.toString() : v) : 
            String(result.Err);
          console.error('ICRC2 approval failed:', errorStr);
          return { success: false, error: `ICRC2 approval failed: ${errorStr}` };
        }
      }
    } catch (error: any) {
      console.error('Approval error:', error);
      return { 
        success: false, 
        error: error?.message || 'Unknown error during approval',
      };
    }
  }

  // Add depositFromPool method
  async depositFromPool(params: {
    poolId: string;
    tokenId: string;
    amount_e8s: string;
  }): Promise<ExecutionResult> {
    try {
      console.log('DepositFrom params:', params);
      const poolActor = await this.getPoolActor(params.poolId);
      
      // Get token metadata to fetch the fee
      const metadata = await tokenService.getMetadata(params.tokenId);
      const fee = metadata.fee;
      
      console.log('Token fee from metadata:', fee.toString());
      
      // Amount is already in e8s format, just convert to BigInt
      const amountE8 = BigInt(params.amount_e8s);
      console.log('Amount in e8s:', amountE8.toString());

      const result = await poolActor.depositFrom({
        token: params.tokenId,
        amount: amountE8,
        fee,
      });

      console.log('DepositFrom result:', JSON.stringify(result, (_, v) => 
        typeof v === 'bigint' ? v.toString() : v
      ));

      if ('ok' in result) {
        return { 
          success: true, 
          txId: result.ok.toString(),
          depositedAmount: BigInt(result.ok)
        };
      } else if ('err' in result) {
        const errorStr = typeof result.err === 'object' ? 
          JSON.stringify(result.err, (_, v) => typeof v === 'bigint' ? v.toString() : v) : 
          String(result.err);
        console.error('DepositFrom failed:', errorStr);
        return { success: false, error: errorStr };
      } else {
        console.error('Unexpected depositFrom result format:', result);
        return { success: false, error: 'Unexpected response format' };
      }
    } catch (error: any) {
      console.error('DepositFrom error:', error);
      return { success: false, error: error?.message || 'Unknown error during depositFrom' };
    }
  }

  // Make public
  async transferToPool(params: {
    tokenId: string;
    poolId: string;
    amount_e8s: string;
    subaccount: number[];
  }): Promise<ExecutionResult> {
    try {
      console.log('Transfer params:', params);
      const tokenActor = await this.getTokenActor(params.tokenId);
      
      // Get token metadata to validate fee and determine standard
      const metadata = await tokenService.getMetadata(params.tokenId);
      console.log('Token metadata:', metadata);
      
      // Ensure we have valid metadata with a fee
      if (!metadata.fee) {
        throw new Error('Invalid token metadata: fee not found. Please try again.');
      }
      
      // Amount is already in e8s format, just convert to BigInt
      const amountE8 = BigInt(params.amount_e8s);
      console.log('Amount in e8s:', amountE8.toString());
      
      // Debug poolId value
      console.log('Raw poolId:', params.poolId, 'Type:', typeof params.poolId);
      
      // Ensure poolId is a string
      const poolIdStr = typeof params.poolId === 'object' && params.poolId !== null 
        ? (params.poolId as { toString(): string }).toString() 
        : String(params.poolId);
      
      console.log('Converted poolId to string:', poolIdStr);
      
      // Sanitize poolId - remove any hidden characters
      const sanitizedPoolId = poolIdStr.trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
      console.log('Sanitized poolId:', sanitizedPoolId);
      
      // Convert poolId to Principal
      let poolPrincipal: Principal;
      try {
        poolPrincipal = Principal.fromText(sanitizedPoolId);
        console.log('Converted poolId to Principal:', poolPrincipal.toString());
      } catch (error) {
        console.error('Failed to convert poolId to Principal:', error);
        throw new Error(`Invalid pool ID format: ${sanitizedPoolId} (original: ${params.poolId})`);
      }

      // Safely check if token is DIP20
      const isDIP20 = typeof metadata.standard === 'string' && metadata.standard.toLowerCase().includes('dip20');

      if (isDIP20) {
        // DIP20 not supported!
        throw new Error('DIP20 tokens are not currently supported');
      } else {
        // For ICRC1/ICRC2, use subaccount-based transfer
        const formattedSubaccount = params.subaccount.length > 0 ? [Uint8Array.from(params.subaccount)] : [];
        
        console.log('Executing ICRC1 transfer with:', {
          to: { owner: poolPrincipal, subaccount: formattedSubaccount },
          amount: amountE8.toString(),
          fee: metadata.fee.toString(),
          subaccount: formattedSubaccount,
        });

        const result = await tokenActor.icrc1_transfer({
          to: { owner: poolPrincipal, subaccount: formattedSubaccount },
          amount: amountE8,
          fee: [metadata.fee],
          memo: [],
          from_subaccount: [],
          created_at_time: [],
        });

        console.log('ICRC1 transfer result:', result);

        if ('Ok' in result) {
          return { success: true, txId: result.Ok.toString() };
        } else {
          const errorStr = typeof result.Err === 'object' ? 
            JSON.stringify(result.Err, (_, v) => typeof v === 'bigint' ? v.toString() : v) : 
            String(result.Err);
          console.error('ICRC1 transfer failed:', errorStr);
          return { success: false, error: errorStr };
        }
      }
    } catch (error: any) {
      console.error('Transfer error:', error);
      return { success: false, error: error?.message || 'Unknown error during transfer' };
    }
  }

  // Rename and make public
  async depositTokenToPool(params: {
    poolId: string;
    tokenId: string;
    amount_e8s: string;
    source?: 'wallet' | 'undeposited';  // Add source parameter
  }): Promise<ExecutionResult> {
    try {
      console.log('Deposit params:', params);
      const poolActor = await this.getPoolActor(params.poolId);
      
      // Get token metadata to determine standard and fee
      const metadata = await tokenService.getMetadata(params.tokenId);
      const standard = (metadata.standard || '').toLowerCase();
      const isICRC2orDIP20 = standard.includes('icrc2') || standard.includes('dip20');
      
      // Amount is already in e8s format, just convert to BigInt
      const amountE8 = BigInt(params.amount_e8s);

      // Only use depositFrom for ICRC2/DIP20 tokens when depositing from wallet
      // Always use regular deposit for undeposited balance
      if (isICRC2orDIP20 && params.source === 'wallet') {
        const result = await poolActor.depositFrom({
          token: params.tokenId,
          amount: amountE8,
          fee: metadata.fee || BigInt(0), // Use the token's fee from metadata
        });

        if ('ok' in result) {
          return { 
            success: true, 
            txId: result.ok.toString(),
            depositedAmount: BigInt(result.ok)
          };
        } else {
          const errorStr = typeof result.err === 'object' ? 
            JSON.stringify(result.err) : 
            String(result.err);
          return { success: false, error: `DepositFrom failed: ${errorStr}` };
        }
      } 
      // For ICRC1 or undeposited balance, use regular deposit
      else {
        const result = await poolActor.deposit({
          token: params.tokenId,
          amount: amountE8,
          fee: metadata.fee || BigInt(0),
        });

        if ('ok' in result) {
          return { 
            success: true, 
            txId: result.ok.toString(),
            depositedAmount: BigInt(result.ok)
          };
        } else {
          const errorStr = typeof result.err === 'object' ? 
            JSON.stringify(result.err) : 
            String(result.err);
          return { success: false, error: `Deposit failed: ${errorStr}` };
        }
      }
    } catch (error: any) {
      console.error('Deposit error:', error);
      return { success: false, error: error?.message || 'Unknown error during deposit' };
    }
  }

  private async executeSwap(params: ICPSwapExecutionParams): Promise<ExecutionResult> {
    try {
      console.log('Swap params:', params);
      const poolActor = await this.getPoolActor(params.poolId);
      
      // Convert string amounts to BigInt
      const amountInE8 = BigInt(params.fromToken.amount_e8s);
      const minAmountOutE8 = BigInt(params.toToken.minAmount_e8s);
      
      console.log('Executing swap with:', {
        amountIn: amountInE8.toString(),
        amountOutMinimum: minAmountOutE8.toString(),
        zeroForOne: params.zeroForOne,
      });

      // Convert BigInt values to strings for the Candid interface
      const swapArgs = {
        amountIn: amountInE8.toString(),  // Convert to string
        amountOutMinimum: minAmountOutE8.toString(),  // Convert to string
        zeroForOne: params.zeroForOne,
      };

      const result = await poolActor.swap(swapArgs);

      console.log('Swap result:', result);

      if ('ok' in result) {
        return { 
          success: true, 
          txId: result.ok.toString(),
          outputAmount: BigInt(result.ok),
          depositedAmount: amountInE8  // Include the actual amount being swapped
        };
      } else if ('err' in result) {
        const errorStr = typeof result.err === 'object' ? 
          JSON.stringify(result.err, (_, v) => typeof v === 'bigint' ? v.toString() : v) : 
          String(result.err);
        console.error('Swap failed:', errorStr);
        return { success: false, error: errorStr };
      } else {
        console.error('Unexpected swap result format:', result);
        return { success: false, error: 'Unexpected response format' };
      }
    } catch (error: any) {
      console.error('Swap error:', error);
      return { success: false, error: error?.message || 'Unknown error during swap' };
    }
  }

  // Make public
  async withdrawFromPool(params: {
    poolId: string;
    tokenId: string;
    amount_e8s: string;
  }): Promise<ExecutionResult> {
    try {
      console.log('Withdraw params:', params);
      const poolActor = await this.getPoolActor(params.poolId);
      
      // Get token metadata to fetch the fee using our centralized service
      const metadata = await tokenService.getMetadata(params.tokenId);
      const fee = metadata.fee;
      
      console.log('Token fee from metadata:', fee.toString());
      
      // Amount is already in e8s format, just convert to BigInt
      const amountE8 = BigInt(params.amount_e8s);
      console.log('Amount in e8s:', amountE8.toString());

      const result = await poolActor.withdraw({
        token: params.tokenId,
        amount: amountE8,
        fee,  // Use the token's fee from centralized metadata service
      });

      console.log('Withdraw result:', result);

      if ('ok' in result) {
        return { success: true };
      } else if ('err' in result) {
        const errorStr = typeof result.err === 'object' ? 
          JSON.stringify(result.err, (_, v) => typeof v === 'bigint' ? v.toString() : v) : 
          String(result.err);
        console.error('Withdrawal failed:', errorStr);
        return { success: false, error: errorStr };
      } else {
        console.error('Unexpected withdraw result format:', result);
        return { success: false, error: 'Unexpected response format' };
      }
    } catch (error: any) {
      console.error('Withdraw error:', error);
      return { success: false, error: error?.message || 'Unknown error during withdrawal' };
    }
  }

  async executeICPSwap(
    icpswapNeeds: {
      fromDeposited: bigint;
      fromUndeposited: bigint;
      fromWallet: bigint;
    },
    params: ICPSwapExecutionParams,
    stepCallback?: (result: ExecutionResult) => Promise<void>,
    skipWithdraw: boolean = false,

  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    let depositResult: ExecutionResult | undefined;

    try {
      const userPrincipal = authService.getPrincipal();
      if (!userPrincipal) {
        throw new Error('User not authenticated');
      }

      // Set first step to loading immediately
      const prepareStepResult: ExecutionResult = {
        success: true,
        step: 'transfer',
        status: 'loading',
        details: {
          amount: formatTokenAmount(BigInt(params.fromToken.amount_e8s), params.fromToken.canisterId),
          canisterId: params.fromToken.canisterId,
          tokenSymbol: getTokenSymbol(params.fromToken.canisterId),
          tokenOutSymbol: getTokenSymbol(params.toToken.canisterId),
        }
      };
      results.push(prepareStepResult);
      if (stepCallback) await stepCallback(prepareStepResult);

      // Get token metadata to check if it supports ICRC2 or is DIP20
      const metadata = await tokenService.getMetadata(params.fromToken.canisterId);
      const supportsICRC2 = metadata.standard.toLowerCase().includes('icrc2');
      const isDIP20 = metadata.standard.toLowerCase().includes('dip20');
      const useApprovalFlow = supportsICRC2 || isDIP20;

      let amount_e8s = BigInt(params.fromToken.amount_e8s);
      
      let actualSwapAmount = amount_e8s;

      // Case 1: We have enough in the pool already
      if (icpswapNeeds.fromDeposited >= amount_e8s && icpswapNeeds.fromWallet === BigInt(0) && icpswapNeeds.fromUndeposited === BigInt(0)) {
        const transferResult: ExecutionResult = {
          success: true,
          step: 'transfer',
          status: 'skipped' as const,
          optimizationMessage: 'Using existing pool balance',
          details: {
            amount: formatTokenAmount(amount_e8s, params.fromToken.canisterId),
            canisterId: params.fromToken.canisterId,
            tokenSymbol: getTokenSymbol(params.fromToken.canisterId),
            tokenOutSymbol: getTokenSymbol(params.toToken.canisterId),
            optimizationReason: 'Sufficient balance already in pool',
          }
        };
        results.push(transferResult);
        if (stepCallback) await stepCallback(transferResult);

        const depositResult: ExecutionResult = {
          success: true,
          step: 'deposit',
          status: 'skipped' as const,
          optimizationMessage: 'Using existing pool balance',
          depositedAmount: amount_e8s,
          details: {
            amount: formatTokenAmount(amount_e8s, params.fromToken.canisterId),
            canisterId: params.fromToken.canisterId,
            tokenSymbol: getTokenSymbol(params.fromToken.canisterId),
            tokenOutSymbol: getTokenSymbol(params.toToken.canisterId),
            optimizationReason: 'Sufficient balance already in pool',
            depositedAmount: formatTokenAmount(amount_e8s, params.fromToken.canisterId),
          }
        };
        results.push(depositResult);
        if (stepCallback) await stepCallback(depositResult);
      }
      // Case 2: Need to transfer and deposit
      else {
        if (useApprovalFlow) {          
          // ICRC2/DIP20 Flow: approve + depositFrom

          let takeFromWallet = icpswapNeeds.fromWallet;

          // Deposit undeposited balance if needed
          if (icpswapNeeds.fromUndeposited > 0n) {
            const poolActor = await this.getPoolActor(params.poolId);
            console.log('Depositing undeposited balance:', icpswapNeeds.fromUndeposited.toString());
            const depositResult = await poolActor.deposit({
              token: params.fromToken.canisterId,
              amount: icpswapNeeds.fromUndeposited,
              fee: metadata.fee,
            });
            console.log('Deposit result:', depositResult);

            const depositStepResult: ExecutionResult = {
              success: 'ok' in depositResult,
              error: 'err' in depositResult ? String(depositResult.err) : undefined,
              step: 'deposit',
              status: 'ok' in depositResult ? 'complete' as const : 'error' as const,
              details: {
                amount: formatTokenAmount(icpswapNeeds.fromUndeposited, params.fromToken.canisterId),
                canisterId: params.fromToken.canisterId,
                tokenSymbol: getTokenSymbol(params.fromToken.canisterId),
              }
            };

            results.push(depositStepResult);
            if (stepCallback) await stepCallback(depositStepResult);
            if (!depositStepResult.success) return results;
          }
          
          if (takeFromWallet > BigInt(0)) {
            const poolPrincipal = typeof params.poolId === 'string' ? Principal.fromText(params.poolId) : params.poolId;
            const approveResult = await this.approveToken({
              tokenId: params.fromToken.canisterId,
              spender: poolPrincipal,
              amount: (takeFromWallet + metadata.fee).toString(),
            });
            const approveStepResult: ExecutionResult = {
              ...approveResult,
              step: 'approve',
              status: approveResult.success ? 'complete' as const : 'error' as const,
              details: {
                amount: formatTokenAmount(takeFromWallet, params.fromToken.canisterId),
                canisterId: params.fromToken.canisterId,
                tokenSymbol: getTokenSymbol(params.fromToken.canisterId),
                spender: poolPrincipal,
              }
            };
            results.push(approveStepResult);
            if (stepCallback) await stepCallback(approveStepResult);
            if (!approveResult.success) return results;  

            // Call depositFrom on the pool
            const poolActor = await this.getPoolActor(params.poolId);
            console.log('Calling depositFrom with:', {
              token: params.fromToken.canisterId,
              amount: takeFromWallet.toString(),
              fee: metadata.fee?.toString()
            });
            const depositFromResult = await poolActor.depositFrom({
              token: params.fromToken.canisterId,
              amount: takeFromWallet,
              fee: metadata.fee,
            });

            console.log('depositFrom result:', JSON.stringify(depositFromResult, (_, v) => 
              typeof v === 'bigint' ? v.toString() : v
            ));

            const depositStepResult: ExecutionResult = {
              success: 'ok' in depositFromResult,
              error: 'err' in depositFromResult ? 
                (typeof depositFromResult.err === 'object' ? 
                  JSON.stringify(depositFromResult.err, (_, v) => typeof v === 'bigint' ? v.toString() : v) : 
                  String(depositFromResult.err)
                ) : undefined,
              step: 'deposit',
              status: 'ok' in depositFromResult ? 'complete' as const : 'error' as const,
              depositedAmount: 'ok' in depositFromResult ? BigInt(depositFromResult.ok) : undefined,
              details: {
                amount: formatTokenAmount(takeFromWallet, params.fromToken.canisterId),
                canisterId: params.poolId,
                tokenSymbol: getTokenSymbol(params.fromToken.canisterId),
                depositedAmount: 'ok' in depositFromResult ? formatTokenAmount(BigInt(depositFromResult.ok), params.fromToken.canisterId) : undefined,
              }
            };
            results.push(depositStepResult);
            if (stepCallback) await stepCallback(depositStepResult);
            if (!depositStepResult.success) return results;

            depositResult = depositStepResult;
          } else {
            // No wallet deposit needed, create a skipped deposit step
            const skippedDepositResult: ExecutionResult = {
              success: true,
              step: 'deposit',
              status: 'skipped' as const,
              optimizationMessage: 'Using existing pool balance',
              details: {
                amount: formatTokenAmount(amount_e8s, params.fromToken.canisterId),
                canisterId: params.poolId,
                tokenSymbol: getTokenSymbol(params.fromToken.canisterId)
              }
            };
            results.push(skippedDepositResult);
            if (stepCallback) await stepCallback(skippedDepositResult);
            depositResult = { success: true };
          }
        } else {
          // ICRC1 Flow: transfer + deposit
          // Convert Principal to subaccount bytes
          const subaccountBytes = principalToSubAccount(userPrincipal);

          // Step 1: Transfer tokens to pool subaccount
          if (icpswapNeeds.fromWallet > BigInt(0)) {
            const transferResult = await this.transferToPool({
              tokenId: params.fromToken.canisterId,
              poolId: params.poolId.toString(),
              amount_e8s: icpswapNeeds.fromWallet.toString(),
              subaccount: Array.from(subaccountBytes),
            });
            const transferStepResult: ExecutionResult = { 
              ...transferResult, 
              step: 'transfer',
              status: transferResult.success ? 'complete' as const : 'error' as const,
              details: {
                amount: formatTokenAmount(icpswapNeeds.fromWallet, params.fromToken.canisterId),
                canisterId: params.fromToken.canisterId,
                tokenSymbol: getTokenSymbol(params.fromToken.canisterId),
                tokenOutSymbol: getTokenSymbol(params.toToken.canisterId),
                transactionId: transferResult.txId
              }
            };
            results.push(transferStepResult);
            if (stepCallback) await stepCallback(transferStepResult);
            if (!transferResult.success) return results;  
          } else {
            // No transfer needed, create a skipped transfer step
            const transferStepResult: ExecutionResult = {
              success: true,
              step: 'transfer',
              status: 'skipped' as const,
              optimizationMessage: 'Using existing pool balance',
              details: {
                amount: formatTokenAmount(icpswapNeeds.fromWallet, params.fromToken.canisterId),
                canisterId: params.fromToken.canisterId,
                tokenSymbol: getTokenSymbol(params.fromToken.canisterId),
                tokenOutSymbol: getTokenSymbol(params.toToken.canisterId),
                optimizationReason: 'No transfer needed'
              }
            };
            results.push(transferStepResult);
            if (stepCallback) await stepCallback(transferStepResult);
          }

          const toDeposit = icpswapNeeds.fromWallet + icpswapNeeds.fromUndeposited;
          if (toDeposit > BigInt(0)) {
            // Step 2: Deposit
            depositResult = await this.depositTokenToPool({
              poolId: params.poolId,
              tokenId: params.fromToken.canisterId,
              amount_e8s: toDeposit.toString(),
              source: 'undeposited'
            });
            const depositStepResult: ExecutionResult = {
              success: depositResult.success,
              error: depositResult.error,
              depositedAmount: depositResult.depositedAmount,
              step: 'deposit',
              status: depositResult.success ? 'complete' as const : 'error' as const,
              details: {
                amount: formatTokenAmount(toDeposit, params.fromToken.canisterId),
                canisterId: params.poolId,
                tokenSymbol: getTokenSymbol(params.fromToken.canisterId),
                depositedAmount: depositResult.depositedAmount ? formatTokenAmount(depositResult.depositedAmount, params.fromToken.canisterId) : undefined,
              }
            };
            results.push(depositStepResult);
            if (stepCallback) await stepCallback(depositStepResult);
            if (!depositResult.success) return results;

            actualSwapAmount = depositResult.depositedAmount! + icpswapNeeds.fromDeposited
          } else {
            // No deposit needed, create a skipped deposit step
            // Note, this shouldn't happpen as we should have entered our first condition of fromDeposited being sufficient (skipping both first two steps). Nevertheless.
            const depositStepResult: ExecutionResult = {
              success: true,
              step: 'deposit',
              status: 'skipped' as const,
              optimizationMessage: 'Using existing pool balance',
              depositedAmount: icpswapNeeds.fromDeposited,
              details: {
                amount: formatTokenAmount(icpswapNeeds.fromDeposited, params.fromToken.canisterId),
                canisterId: params.poolId,
                tokenSymbol: getTokenSymbol(params.fromToken.canisterId),
                optimizationReason: 'Sufficient balance already in pool',
                depositedAmount: formatTokenAmount(icpswapNeeds.fromDeposited, params.fromToken.canisterId),
              }
            };
            results.push(depositStepResult);
            if (stepCallback) await stepCallback(depositStepResult);

            actualSwapAmount = icpswapNeeds.fromDeposited;
          }
        }
      }
      
      // Use the original minimum amount out since the quote was for the full amount
      const minAmountOut = BigInt(params.toToken.minAmount_e8s);

      const swapResult = await this.executeSwap({
        ...params,
        fromToken: {
          ...params.fromToken,
          amount_e8s: actualSwapAmount.toString()
        },
        toToken: {
          ...params.toToken,
          minAmount_e8s: minAmountOut.toString()
        }
      });
      const swapStepResult: ExecutionResult = { 
        success: swapResult.success,
        error: swapResult.error,
        outputAmount: swapResult.outputAmount,
        step: 'swap',
        status: swapResult.success ? 'complete' as const : 'error' as const,
        details: {
          amount: formatTokenAmount(actualSwapAmount, params.fromToken.canisterId),
          amountOut: swapResult.outputAmount ? formatTokenAmount(swapResult.outputAmount, params.toToken.canisterId) : undefined,
          canisterId: params.poolId,
          tokenSymbol: `${getTokenSymbol(params.fromToken.canisterId)}`,
          tokenOutSymbol: `${getTokenSymbol(params.toToken.canisterId)}`,
        }
      };
      results.push(swapStepResult);
      if (stepCallback) await stepCallback(swapStepResult);

      // Step 4: Withdraw tokens using actual output amount from swap (unless skipWithdraw is true)
      if (!skipWithdraw) {
        const withdrawResult = await this.withdrawFromPool({
          poolId: params.poolId,
          tokenId: params.toToken.canisterId,
          amount_e8s: swapResult.outputAmount!.toString(),
        });
        const withdrawStepResult: ExecutionResult = { 
          success: withdrawResult.success,
          error: withdrawResult.error,
          step: 'withdraw',
          status: withdrawResult.success ? 'complete' as const : 'error' as const,
          details: {
            amountOut: formatTokenAmount(swapResult.outputAmount!, params.toToken.canisterId),
            canisterId: params.toToken.canisterId,
            tokenSymbol: getTokenSymbol(params.toToken.canisterId),
            tokenOutSymbol: getTokenSymbol(params.toToken.canisterId),
          }
        };
        results.push(withdrawStepResult);
        if (stepCallback) await stepCallback(withdrawStepResult);
      } else {
        // Add a skipped withdraw step to the results
        const skippedWithdrawResult: ExecutionResult = {
          success: true,
          step: 'withdraw',
          status: 'skipped' as const,
          optimizationMessage: 'Keeping tokens in pool as requested',
          details: {
            amountOut: formatTokenAmount(swapResult.outputAmount!, params.toToken.canisterId),
            canisterId: params.toToken.canisterId,
            tokenSymbol: getTokenSymbol(params.toToken.canisterId),
            tokenOutSymbol: getTokenSymbol(params.toToken.canisterId),
          }
        };
        results.push(skippedWithdrawResult);
        if (stepCallback) await stepCallback(skippedWithdrawResult);
      }

      return results;
    } catch (error: any) {
      console.error('ICPSwap execution error:', error);
      const errorResult: ExecutionResult = { 
        success: false, 
        error: error?.message || 'Unknown error during swap execution', 
        step: 'unknown',
        status: 'error' as const,
      };
      if (stepCallback) await stepCallback(errorResult);
      return [errorResult];
    }
  }

  async getBalance(tokenId: string): Promise<TokenBalance> {
    try {
      const userPrincipal = authService.getPrincipal();
      if (!userPrincipal) {
        return { balance_e8s: BigInt(0), error: 'User not authenticated' };
      }

      const actor = await this.getTokenActor(tokenId);
      const metadata = await tokenService.getMetadata(tokenId);

      if (metadata.standard.toLowerCase().includes('dip20')) {
        // For DIP20, use balanceOf
        const balance = await actor.balanceOf(userPrincipal);
        return { balance_e8s: balance };
      } else {
        // For ICRC1, use existing method
        const balance = await actor.icrc1_balance_of({
          owner: userPrincipal,
          subaccount: [],
        });
        return { balance_e8s: balance };
      }
    } catch (error: any) {
      return { balance_e8s: BigInt(0), error: error?.message || 'Failed to fetch balance' };
    }
  }

  // Get undeposited balance in the pool's subaccount
  async getUndepositedPoolBalance(params: {
    poolId: string | Principal;
    tokenId: string;
  }): Promise<TokenBalance> {
    try {
      const userPrincipal = authService.getPrincipal();

      if (!userPrincipal) {
        return { balance_e8s: BigInt(0), error: 'User not authenticated' };
      }

      // Handle poolId whether it's a string or Principal object
      let poolPrincipal: Principal;
      if (typeof params.poolId === 'string') {
        try {
          poolPrincipal = Principal.fromText(params.poolId);
        } catch (error) {
          console.error('Invalid pool ID format:', params.poolId);
          return { 
            balance_e8s: BigInt(0), 
            error: 'Invalid pool ID format' 
          };
        }
      } else {
        poolPrincipal = params.poolId;
      }

      // Get token actor and check balance
      const tokenActor = await this.getTokenActor(params.tokenId);
      const metadata = await tokenService.getMetadata(params.tokenId);

      if (metadata.standard.toLowerCase().includes('dip20')) {
        // For DIP20, check balance directly
        console.log('Checking DIP20 balance for:', poolPrincipal.toString());
        const balance = await tokenActor.balanceOf(poolPrincipal);
        console.log('DIP20 balance result:', balance.toString());
        return { balance_e8s: balance };
      } else {
        // Get the user's subaccount for this pool
        const subaccount = principalToSubAccount(userPrincipal);

        const balance = await tokenActor.icrc1_balance_of({
          owner: poolPrincipal,
          subaccount: [subaccount],
        });

        return { balance_e8s: balance };
      }
    } catch (error: any) {
      console.error('Error fetching undeposited balance:', error);
      return { 
        balance_e8s: BigInt(0), 
        error: error?.message || 'Failed to fetch undeposited balance' 
      };
    }
  }

  // Get deposited balance in the pool
  async getDepositedPoolBalance(params: {
    poolId: string;
  }): Promise<PoolBalance> {
    try {
      const userPrincipal = authService.getPrincipal();
      //console.log('Getting deposited balance for:', {
      //  userPrincipal: userPrincipal?.toString(),
      //  poolId: params.poolId
      //});

      if (!userPrincipal) {
        return { 
          balance0_e8s: BigInt(0), 
          balance1_e8s: BigInt(0), 
          error: 'User not authenticated' 
        };
      }

      // Get pool actor and check balance
      const poolActor = await this.getPoolActor(params.poolId);
      console.log('Got pool actor, calling getUserUnusedBalance...');
      const result = await poolActor.getUserUnusedBalance(userPrincipal);
      console.log('Deposited balance result:', result);

      if ('err' in result) {
        return { 
          balance0_e8s: BigInt(0), 
          balance1_e8s: BigInt(0), 
          error: typeof result.err === 'object' ? JSON.stringify(result.err) : String(result.err)
        };
      }

      return {
        balance0_e8s: BigInt(result.ok.balance0),
        balance1_e8s: BigInt(result.ok.balance1)
      };
    } catch (error: any) {
      console.error('Error fetching deposited balance:', error);
      return { 
        balance0_e8s: BigInt(0), 
        balance1_e8s: BigInt(0), 
        error: error?.message || 'Failed to fetch deposited balance'
      };
    }
  }
}

// Helper function to get token symbol
const getTokenSymbol = (canisterId: string): string => {
  try {
    const metadata = getCachedTokenMetadata(canisterId);
    return metadata?.symbol || 'Token';
  } catch {
    return 'Token';
  }
}; 