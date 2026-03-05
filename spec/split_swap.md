# Split Swap Algorithm

## Overview

A split swap divides a single token swap across two DEXes (ICPSwap and Kong) to get a better total output than using either DEX alone. This works because AMMs have increasing price impact the larger your trade is relative to pool liquidity -- by splitting the trade across two pools, you reduce price impact on each side.

The algorithm has two parts:
1. **Quote comparison** -- fetch quotes from ICPSwap 100%, Kong 100%, and the best split, then pick the winner.
2. **Ternary search** -- find the optimal split ratio (what % goes to Kong vs ICPSwap) by treating the combined output as a unimodal function of the distribution percentage.

## Assumptions

- You already have `icpswap.getQuote({ amountIn, tokenIn, tokenOut })` that returns `{ amountOut, priceImpact }`.
- You already have `kong.getQuote({ amountIn, tokenIn, tokenOut })` that returns `{ amountOut, priceImpact }`.
- All amounts are in the token's smallest unit (e.g. e8s for 8-decimal tokens).
- Funds are in the user's wallet (no subaccount/deposit juggling needed).

## Part 1: Getting a Quote for a Given Distribution

The `distribution` is an integer from 0 to 100 representing the **percentage that goes to Kong**. The remainder goes to ICPSwap.

```typescript
async function getQuoteForDistribution(
  totalAmount: bigint,    // total input amount in base units
  distribution: number,   // 0-100, percentage to Kong
  tokenIn: string,
  tokenOut: string
): Promise<{ totalOut: bigint; icpswapOut: bigint; kongOut: bigint }> {

  const kongAmount    = (totalAmount * BigInt(distribution)) / BigInt(100);
  const icpswapAmount = (totalAmount * BigInt(100 - distribution)) / BigInt(100);

  // Fetch both quotes in parallel
  const [icpswapResult, kongResult] = await Promise.all([
    icpswapAmount > 0n
      ? icpswap.getQuote({ amountIn: icpswapAmount, tokenIn, tokenOut })
      : { amountOut: 0n, priceImpact: 0 },
    kongAmount > 0n
      ? kong.getQuote({ amountIn: kongAmount, tokenIn, tokenOut })
      : { amountOut: 0n, priceImpact: 0 },
  ]);

  return {
    totalOut:   icpswapResult.amountOut + kongResult.amountOut,
    icpswapOut: icpswapResult.amountOut,
    kongOut:    kongResult.amountOut,
  };
}
```

Key points:
- `distribution = 0` means 100% ICPSwap.
- `distribution = 100` means 100% Kong.
- The two quotes are fetched in parallel for speed.
- The combined output is just the sum of both `amountOut` values.

## Part 2: Ternary Search for Optimal Split

We treat `f(distribution) = totalOutputAmount` as a **unimodal function** (one peak) over the range [0, 100]. This is a reasonable assumption because as you shift more volume to one DEX, its price impact rises while the other's falls -- creating a single optimal balance point.

A [ternary search](https://en.wikipedia.org/wiki/Ternary_search) efficiently finds the maximum of a unimodal function by repeatedly dividing the search range into thirds and eliminating the worst third.

### The Algorithm

```typescript
async function findBestSplitRatio(
  totalAmount: bigint,
  tokenIn: string,
  tokenOut: string
): Promise<{ bestDistribution: number; bestAmount: bigint }> {

  const PRECISION    = 1;   // stop when range is 1% wide
  const MAX_ITER     = 10;  // safety cap on iterations
  const points       = new Map<number, bigint>();  // cache tested points

  let left  = 0;
  let right = 100;
  let iteration = 0;

  // --- Step 1: Test the endpoints (0% and 100% Kong) ---
  const [q0, q100] = await Promise.all([
    getQuoteForDistribution(totalAmount, 0,   tokenIn, tokenOut),
    getQuoteForDistribution(totalAmount, 100, tokenIn, tokenOut),
  ]);
  points.set(0,   q0.totalOut);
  points.set(100, q100.totalOut);

  const zeroVal    = q0.totalOut;    // output at 100% ICPSwap
  const hundredVal = q100.totalOut;  // output at 100% Kong

  // --- Step 2: Ternary search loop ---
  while (right - left > PRECISION && iteration < MAX_ITER) {

    // Divide current range into thirds
    const m1 = left  + Math.floor((right - left) / 3);
    const m2 = right - Math.floor((right - left) / 3);

    // Fetch quotes for any points we haven't tested yet (parallel)
    const toTest = [m1, m2].filter(p => !points.has(p));
    if (toTest.length > 0) {
      const results = await Promise.all(
        toTest.map(p =>
          getQuoteForDistribution(totalAmount, p, tokenIn, tokenOut)
            .then(q => ({ point: p, amount: q.totalOut }))
        )
      );
      for (const { point, amount } of results) {
        points.set(point, amount);
      }
    }

    const leftVal  = points.get(m1)!;
    const rightVal = points.get(m2)!;

    // --- Step 3: Narrow the range ---
    if (leftVal < rightVal) {
      // Normal case: peak is to the right of m1
      // Edge-case guard: if the 0% endpoint beats both interior points,
      // the peak is actually near the left edge (fee-related distortion),
      // so shrink from the right instead.
      if (zeroVal > rightVal && zeroVal > hundredVal) {
        right = m2;
      } else {
        left = m1;
      }
    } else if (leftVal > rightVal) {
      // Normal case: peak is to the left of m2
      // Edge-case guard: if the 100% endpoint beats both interior points,
      // the peak is near the right edge, so shrink from the left instead.
      if (hundredVal > leftVal && hundredVal > zeroVal) {
        left = m1;
      } else {
        right = m2;
      }
    } else {
      // Equal values -- shrink from the right
      right = m2;
    }

    iteration++;
  }

  // --- Step 4: Pick the best from ALL tested points ---
  // Don't just take the midpoint of the final range -- scan every point
  // we cached during the search, because edge-case fee effects can make
  // an earlier tested point the actual winner.
  let bestDistribution = 0;
  let bestAmount       = 0n;
  for (const [dist, amount] of points) {
    if (amount > bestAmount) {
      bestAmount       = amount;
      bestDistribution = dist;
    }
  }

  return { bestDistribution, bestAmount };
}
```

### Why the edge-case guards?

Standard ternary search assumes a smooth unimodal curve. In practice, DEX swap fees create small discontinuities near the 0% and 100% endpoints. For example, when a DEX portion is tiny, its output might not cover the swap fee, making the endpoint (sending 100% to the other DEX) strictly better than any near-edge split. The guards detect when an endpoint value dominates and bias the search toward it instead of away from it.

### Complexity

- Each iteration makes at most 2 API calls (often fewer thanks to the cache).
- With `MAX_ITER = 10` and `PRECISION = 1`, the search typically converges in 6-8 iterations.
- Total API calls: 2 (endpoints) + ~12-16 (search) = roughly **14-18 quote calls**, all done 2-at-a-time in parallel, so **7-9 round trips**.

## Part 3: Choosing the Best Option

After you have all three quotes, pick the winner:

```typescript
function getBestQuote(
  icpswapFullAmount: bigint | null,  // output from 100% ICPSwap
  kongFullAmount: bigint | null,     // output from 100% Kong
  splitAmount: bigint | null         // output from best split ratio
): 'icpswap' | 'kong' | 'split' | null {

  // If only one DEX has a quote, use it
  if (icpswapFullAmount && !kongFullAmount) return 'icpswap';
  if (!icpswapFullAmount && kongFullAmount) return 'kong';

  if (icpswapFullAmount && kongFullAmount) {
    const bestSingleDex    = kongFullAmount > icpswapFullAmount ? 'kong' : 'icpswap';
    const bestSingleAmount = kongFullAmount > icpswapFullAmount ? kongFullAmount : icpswapFullAmount;

    // Split wins only if it strictly beats the best single-DEX quote
    if (splitAmount && splitAmount > bestSingleAmount) {
      return 'split';
    }
    return bestSingleDex;
  }

  return null;
}
```

## Full Flow Summary

1. User enters a swap (token pair + amount).
2. Fetch full quotes from ICPSwap and Kong in parallel (these are your `distribution=0` and `distribution=100` cases -- you get them for free as part of showing the user their options).
3. User clicks "Find Best Split" (or you run it automatically).
4. Run the ternary search to find the optimal Kong%. This produces the best split quote.
5. Compare all three options (ICPSwap 100%, Kong 100%, best split) and highlight the winner.
6. User confirms and you execute the chosen swap path.

## Notes for Implementation

- **The distribution is Kong%**: `distribution = 30` means 30% to Kong, 70% to ICPSwap. This is an arbitrary convention -- just be consistent.
- **Integer arithmetic**: Use integer division (`BigInt(distribution) / BigInt(100)`) to avoid floating point issues with token amounts. There will be up to 1 base-unit of dust from rounding; assign it to whichever DEX you prefer.
- **Parallel fetching matters**: The search makes many quote calls. Always fetch ICPSwap and Kong quotes in parallel within each `getQuoteForDistribution` call, and fetch the two test points per iteration in parallel too.
- **Cache aggressively**: The `points` map avoids re-fetching quotes for distributions you've already tested. As the ternary search narrows, previously-tested points often fall within the new range.
- **The split doesn't always win**: For small trades or when one DEX has vastly more liquidity, a single DEX will be better. The algorithm handles this naturally -- if 0% or 100% produces the best output, that's what gets selected.
- **Price impact for the split**: We report the worst (highest) price impact of the two legs, since that represents the user's worst-case slippage exposure.
