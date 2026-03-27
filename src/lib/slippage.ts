// Slippage calculation engine
// Given an order book (bids/asks), calculate the slippage for a market order of a given notional size

export interface OrderBookLevel {
  price: number;
  size: number; // in base asset units
}

export interface OrderBook {
  bids: OrderBookLevel[]; // sorted desc (best bid first)
  asks: OrderBookLevel[]; // sorted asc (best ask first)
  timestamp: number;
  exchange: string;
  asset: string;
}

export interface SlippageResult {
  midPrice: number;
  avgFillPrice: number;
  slippageBps: number; // from mid price, excluding fees
  feeBps: number;
  totalCostBps: number; // slippage + fees
  notional: number;
  side: "buy" | "sell";
  filledNotional: number; // how much was actually fillable
  fullyFilled: boolean;
}

/**
 * Calculate the average fill price for a market order walking the book.
 *
 * For a BUY: we walk the asks (ascending). We buy `size` units at each level.
 * For a SELL: we walk the bids (descending). We sell `size` units at each level.
 *
 * We want to fill a given NOTIONAL (USD) amount, not a base-asset amount.
 */
export function calculateSlippage(
  book: OrderBook,
  notionalUsd: number,
  side: "buy" | "sell",
  takerFeeBps: number
): SlippageResult | null {
  if (book.bids.length === 0 || book.asks.length === 0) return null;

  const bestBid = book.bids[0].price;
  const bestAsk = book.asks[0].price;
  const midPrice = (bestBid + bestAsk) / 2;

  const levels = side === "buy" ? book.asks : book.bids;

  let remainingNotional = notionalUsd;
  let totalBaseUnits = 0;
  let totalCost = 0;

  for (const level of levels) {
    if (remainingNotional <= 0) break;

    const levelNotional = level.price * level.size;
    const fillNotional = Math.min(remainingNotional, levelNotional);
    const fillBase = fillNotional / level.price;

    totalBaseUnits += fillBase;
    totalCost += fillNotional;
    remainingNotional -= fillNotional;
  }

  if (totalBaseUnits === 0) return null;

  const avgFillPrice = totalCost / totalBaseUnits;
  const filledNotional = totalCost;
  const fullyFilled = remainingNotional <= 0.01; // essentially zero

  // Slippage from mid price in bps
  let slippageBps: number;
  if (side === "buy") {
    slippageBps = ((avgFillPrice - midPrice) / midPrice) * 10000;
  } else {
    slippageBps = ((midPrice - avgFillPrice) / midPrice) * 10000;
  }

  // Ensure slippage is non-negative (it should be, but floating point)
  slippageBps = Math.max(0, slippageBps);

  return {
    midPrice,
    avgFillPrice,
    slippageBps: Math.round(slippageBps * 100) / 100,
    feeBps: takerFeeBps,
    totalCostBps: Math.round((slippageBps + takerFeeBps) * 100) / 100,
    notional: notionalUsd,
    side,
    filledNotional,
    fullyFilled,
  };
}

/**
 * Calculate average of buy and sell slippage
 */
export function calculateAvgSlippage(
  buyResult: SlippageResult | null,
  sellResult: SlippageResult | null
): SlippageResult | null {
  if (!buyResult && !sellResult) return null;
  if (!buyResult) return sellResult;
  if (!sellResult) return buyResult;

  return {
    midPrice: (buyResult.midPrice + sellResult.midPrice) / 2,
    avgFillPrice: (buyResult.avgFillPrice + sellResult.avgFillPrice) / 2,
    slippageBps:
      Math.round(
        ((buyResult.slippageBps + sellResult.slippageBps) / 2) * 100
      ) / 100,
    feeBps: buyResult.feeBps,
    totalCostBps:
      Math.round(
        ((buyResult.totalCostBps + sellResult.totalCostBps) / 2) * 100
      ) / 100,
    notional: buyResult.notional,
    side: "buy", // placeholder
    filledNotional:
      (buyResult.filledNotional + sellResult.filledNotional) / 2,
    fullyFilled: buyResult.fullyFilled && sellResult.fullyFilled,
  };
}
