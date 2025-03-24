import { Actor, HttpAgent } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { idlFactory, canisterId } from '../../../external/kongswap';
import { tokenService } from './token';
import { authService } from './auth';
import { idlFactory as icrc1IdlFactory } from '../../../external/icrc1_ledger/icrc1_ledger.did.js';

interface KongSwapQuote {
  amountOut: bigint;
  priceImpact: number;
}

interface KongTx {
  receive_chain: string;
  pay_amount: bigint;
  receive_amount: bigint;
  pay_symbol: string;
  receive_symbol: string;
  receive_address: string;
  pool_symbol: string;
  pay_address: string;
  price: number;
  pay_chain: string;
  lp_fee: bigint;
  gas_fee: bigint;
}

interface KongPool {
  pool_id: number;
  symbol_0: string;
  symbol_1: string;
  price: number;
  lp_fee_bps: number;
  tvl: bigint;
}

interface KongPoolsResponse {
  pools: KongPool[];
  total_tvl: bigint;
  total_24h_volume: bigint;
  total_24h_lp_fee: bigint;
  total_24h_num_swaps: bigint;
}

interface SwapAmountsReply {
  pay_chain: string;
  pay_symbol: string;
  pay_address: string;
  pay_amount: bigint;
  receive_chain: string;
  receive_symbol: string;
  receive_address: string;
  receive_amount: bigint;
  price: number;
  mid_price: number;
  slippage: number;
}

interface SwapArgs {
  pay_token: string;
  pay_amount: bigint;
  pay_tx_id: [] | [{ BlockIndex: bigint }];  // Make it optional for ICRC2 tokens
  receive_token: string;
  receive_amount: [bigint];
  receive_address: [];
  max_slippage: [number];
  referred_by: [];
}

interface SwapReply {
  ts: bigint;
  request_id: bigint;
  status: string;
  tx_id: bigint;
  transfer_ids: any[];
  pay_chain: string;
  pay_symbol: string;
  pay_address: string;
  pay_amount: bigint;
  receive_chain: string;
  receive_symbol: string;
  receive_address: string;
  receive_amount: bigint;
  price: number;
  mid_price: number;
  slippage: number;
}

type ICRC1TransferError = {
  GenericError?: { message: string; error_code: bigint };
  BadFee?: { expected_fee: bigint };
  InsufficientFunds?: { balance: bigint };
  TooOld?: { allowed_window_nanos: bigint };
  CreatedInFuture?: { ledger_time: bigint };
  TemporarilyUnavailable?: string;
  Duplicate?: { duplicate_of: bigint };
};

type ICRC1TransferResult = { Ok: bigint } | { Err: ICRC1TransferError };

export interface ExecutionResult {
  success: boolean;
  error?: string;
  txId?: string;
}

export class KongSwapService {
  private agent: HttpAgent | null = null;
  private actor: any = null;
  private tokenActors: Map<string, any> = new Map();
  private symbolToCanisterCache: Map<string, string> = new Map();
  private canisterToSymbolCache: Map<string, string> = new Map();

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

  private async getActor(): Promise<any> {
    if (this.actor) return this.actor;

    const agent = await this.getAgent();
    this.actor = Actor.createActor(idlFactory, {
      agent,
      canisterId,
    });

    return this.actor;
  }

  private async getTokenActor(tokenId: string): Promise<any> {
    if (this.tokenActors.has(tokenId)) {
      return this.tokenActors.get(tokenId);
    }

    const agent = await this.getAgent();
    const actor = Actor.createActor(icrc1IdlFactory, {
      agent,
      canisterId: tokenId,
    });

    this.tokenActors.set(tokenId, actor);
    return actor;
  }

  // Reset actors when identity changes
  private resetActors() {
    this.agent = null;
    this.actor = null;
    this.tokenActors.clear();
    this.symbolToCanisterCache.clear();
    this.canisterToSymbolCache.clear();
  }

  private async getTokenSymbol(canisterId: string): Promise<string> {
    // Check cache first
    const cachedSymbol = this.canisterToSymbolCache.get(canisterId);
    if (cachedSymbol) return cachedSymbol;

    try {
      const metadata = await tokenService.getMetadata(canisterId);
      const symbol = metadata.symbol;
      // Cache both directions
      this.canisterToSymbolCache.set(canisterId, symbol);
      this.symbolToCanisterCache.set(symbol, canisterId);
      return symbol;
    } catch (error) {
      console.error(`Error getting token symbol for ${canisterId}:`, error);
      throw error;
    }
  }

  private async getCanisterIdBySymbol(symbol: string): Promise<string> {
    // Check cache first
    const cachedCanisterId = this.symbolToCanisterCache.get(symbol);
    if (cachedCanisterId) return cachedCanisterId;

    // If not in cache, we need to refresh our caches from all tokens
    const allTokens = await tokenService.getAllTokens();
    for (const [principal, metadata] of allTokens) {
      const canisterId = principal.toString();
      const tokenSymbol = metadata.symbol || 'UNKNOWN';
      this.canisterToSymbolCache.set(canisterId, tokenSymbol);
      this.symbolToCanisterCache.set(tokenSymbol, canisterId);
    }

    // Try cache again after refresh
    const foundCanisterId = this.symbolToCanisterCache.get(symbol);
    if (foundCanisterId) return foundCanisterId;

    throw new Error(`Token symbol ${symbol} not found in whitelist`);
  }

  async getPrice(params: {
    tokenA: string;
    tokenB: string;
  }): Promise<number> {
    try {
      const actor = await this.getActor();
      // Convert canister IDs to symbols
      const [symbolA, symbolB] = await Promise.all([
        this.getTokenSymbol(params.tokenA),
        this.getTokenSymbol(params.tokenB)
      ]);

      // Get a quote for 1e8 units (1 token) to determine the price
      const quoteResponse = await actor.swap_amounts(
        symbolA,
        BigInt('100000000'), // 1e8 units
        symbolB
      );

      if ('Err' in quoteResponse) {
        throw new Error(quoteResponse.Err || 'Failed to fetch price');
      }

      // Calculate price from the quote
      return Number(quoteResponse.Ok.receive_amount) / 1e8;
    } catch (error) {
      console.error('Error fetching Kong price:', error);
      throw error;
    }
  }

  async getQuote(params: {
    amountIn: bigint;
    tokenIn: string;
    tokenOut: string;
  }): Promise<KongSwapQuote> {
    try {
      const actor = await this.getActor();
      
      // Convert canister IDs to symbols
      const [symbolIn, symbolOut] = await Promise.all([
        this.getTokenSymbol(params.tokenIn),
        this.getTokenSymbol(params.tokenOut)
      ]);

      // Get quote directly from Kong, letting it handle routing
      const quoteResponse = await actor.swap_amounts(
        symbolIn,
        params.amountIn,
        symbolOut
      );

      console.log('Kong quote response:', quoteResponse);

      if ('Err' in quoteResponse) {
        console.log('Kong quote error:', quoteResponse.Err);
        return {
          amountOut: BigInt(0),
          priceImpact: 0
        };
      }

      // Check if we have a valid route by looking at the final receive_amount
      const finalAmount = quoteResponse.Ok.receive_amount;
      if (finalAmount === BigInt(0)) {
        console.log('Kong found no valid route (receive_amount is 0)');
        return {
          amountOut: BigInt(0),
          priceImpact: 0
        };
      }

      // Kong returns the amount as a nat (natural number)
      const amountOut = BigInt(finalAmount);
      
      // Kong's slippage value is already in percentage form
      // Note: For multi-hop trades, the slippage might be higher
      const priceImpact = Number(quoteResponse.Ok.slippage);

      return {
        amountOut,
        priceImpact,
      };
    } catch (error) {
      console.error('Error fetching Kong quote:', error);
      return {
        amountOut: BigInt(0),
        priceImpact: 0
      };
    }
  }

  async transferToKong(params: {
    tokenId: string;
    amount_e8s: string;
  }): Promise<ExecutionResult> {
    try {
      console.log('Transfer params:', params);
      const tokenActor = await this.getTokenActor(params.tokenId);
      
      // Get token metadata to validate fee and check standard
      const metadata = await tokenService.getMetadata(params.tokenId);
      console.log('Token metadata:', metadata);
      
      // Amount is already in e8s format, just convert to BigInt
      const amountE8 = BigInt(params.amount_e8s);
      console.log('Amount in e8s:', amountE8.toString());

      // Check if token supports ICRC2
      const isIcrc2 = metadata.standard === 'ICRC2';
      console.log('Token standard:', metadata.standard, 'ICRC2 supported:', isIcrc2);

      if (isIcrc2) {
        // For ICRC2 tokens, we approve Kong to spend tokens instead of transferring
        console.log('Using ICRC2 approve flow for Kong');
        
        // First check current allowance
        const allowanceResult = await tokenActor.icrc2_allowance({
          account: { owner: authService.getPrincipal(), subaccount: [] },
          spender: { owner: Principal.fromText(canisterId), subaccount: [] }
        });
        console.log('Current allowance:', allowanceResult);

        const requiredAmount = amountE8 + metadata.fee;  // Calculate required amount including fee
        console.log('Required amount (including fee):', requiredAmount.toString());

        // If allowance is insufficient, approve Kong
        if (!allowanceResult?.allowance || allowanceResult.allowance < requiredAmount) {
          console.log('Approving Kong to spend tokens');
          const approveResult = await tokenActor.icrc2_approve({
            spender: { owner: Principal.fromText(canisterId), subaccount: [] },
            amount: requiredAmount,  // Use amount that includes fee
            fee: [metadata.fee],
            memo: [],
            from_subaccount: [],
            created_at_time: [],
            expected_allowance: [allowanceResult?.allowance || BigInt(0)],
            expires_at: []  // Remove expiry time to make approval not expire
          });

          console.log('Approve result:', approveResult);

          if ('Err' in approveResult) {
            const errorStr = typeof approveResult.Err === 'object' ? 
              JSON.stringify(approveResult.Err, (_, v) => typeof v === 'bigint' ? v.toString() : v) : 
              String(approveResult.Err);
            console.error('Approval failed:', errorStr);
            return { success: false, error: `Approval failed: ${errorStr}` };
          }
        } else {
          console.log('Sufficient allowance exists, skipping approval');
        }

        // Return success with no txId since we're using approval flow
        return { success: true };
      } else {
        // For ICRC1 tokens, use the original transfer flow
        console.log('Using ICRC1 transfer flow for Kong');
        console.log('Executing transfer with:', {
          to: { owner: Principal.fromText(canisterId), subaccount: [] },
          amount: amountE8.toString(),
          fee: metadata.fee.toString(),
        });

        const result = await tokenActor.icrc1_transfer({
          to: { owner: Principal.fromText(canisterId), subaccount: [] },
          amount: amountE8,
          fee: [metadata.fee],
          memo: [],
          from_subaccount: [],
          created_at_time: [],
        }) as ICRC1TransferResult;

        console.log('Transfer result:', result);

        if ('Ok' in result) {
          return { success: true, txId: result.Ok.toString() };
        } else if ('Err' in result) {
          const errorStr = typeof result.Err === 'object' ? 
            JSON.stringify(result.Err, (_, v) => typeof v === 'bigint' ? v.toString() : v) : 
            String(result.Err);
          console.error('Transfer failed:', errorStr);
          return { success: false, error: errorStr };
        } else {
          return { success: false, error: 'Unknown error format in transfer result' };
        }
      }
    } catch (error: any) {
      console.error('Transfer error:', error);
      return { success: false, error: error?.message || 'Unknown error during transfer' };
    }
  }

  async executeKongSwap(params: {
    fromToken: {
      canisterId: string;
      amount_e8s: string;
      txId?: string;  // Optional for ICRC2 tokens
    };
    toToken: {
      canisterId: string;
      minAmount_e8s: string;
    };
    slippageTolerance: number;
  }): Promise<ExecutionResult> {
    try {
      console.log('Kong swap params:', params);

      // Get token metadata to check standard
      const metadata = await tokenService.getMetadata(params.fromToken.canisterId);
      console.log('Token metadata:', metadata);

      // Convert canister IDs to symbols
      const [symbolIn, symbolOut] = await Promise.all([
        this.getTokenSymbol(params.fromToken.canisterId),
        this.getTokenSymbol(params.toToken.canisterId)
      ]);

      // Use the exact slippage tolerance from the UI
      const swapArgs: SwapArgs = {
        pay_token: symbolIn,
        pay_amount: BigInt(params.fromToken.amount_e8s),
        pay_tx_id: metadata.standard === 'ICRC2' ? [] : [{ BlockIndex: BigInt(params.fromToken.txId!) }],
        receive_token: symbolOut,
        receive_amount: [BigInt(params.toToken.minAmount_e8s)],
        receive_address: [],  // Empty array means use caller's address
        max_slippage: [params.slippageTolerance],  // Use exact slippage from UI
        referred_by: [],  // No referral
      };

      console.log('Executing Kong swap with args:', JSON.stringify(swapArgs, (_, v) => typeof v === 'bigint' ? v.toString() : v));

      const actor = await this.getActor();
      console.log('Got Kong actor, attempting swap...');
      
      try {
        const result = await actor.swap(swapArgs);
        console.log('Kong swap raw result:', JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v));

        if ('Ok' in result) {
          console.log('Kong swap succeeded with tx_id:', result.Ok.tx_id.toString());
          return { 
            success: true, 
            txId: result.Ok.tx_id.toString() 
          };
        } else if ('Err' in result) {
          console.error('Kong swap failed with error:', result.Err);
          return { 
            success: false, 
            error: result.Err || 'Unknown error during swap' 
          };
        } else {
          console.error('Unexpected Kong swap result format:', JSON.stringify(result));
          return { 
            success: false, 
            error: 'Unexpected response format from Kong' 
          };
        }
      } catch (swapError: any) {
        console.error('Kong swap call failed:', swapError);
        throw swapError; // Re-throw to be caught by outer try-catch
      }
    } catch (error: any) {
      console.error('Kong swap error:', error);
      return { 
        success: false, 
        error: error?.message || 'Unknown error during Kong swap' 
      };
    }
  }
}

// Export singleton instance
export const kongSwapService = new KongSwapService(); 