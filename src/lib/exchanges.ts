// Exchange configuration: endpoints, symbols, and fee structures

export interface ExchangeConfig {
  id: string;
  name: string;
  type: "dex" | "cex";
  color: string;
  // Taker fee in bps
  takerFeeBps: number;
  // Asset symbol mapping — null means not available
  symbols: Record<string, string | null>;
  // Whether this exchange uses an order book (vs oracle-based)
  hasOrderBook: boolean;
}

export const EXCHANGES: ExchangeConfig[] = [
  {
    id: "lighter",
    name: "Lighter",
    type: "dex",
    color: "#facc15",
    takerFeeBps: 0, // Zero fee for standard accounts
    symbols: {
      BTC: "1",    // market_id=1
      ETH: "0",    // market_id=0
      XAU: "92",   // market_id=92 (Gold, confirmed ~$4,511)
      WTI: "145",  // market_id=145 (WTI crude, confirmed ~$102)
      XAG: null,   // Not available on Lighter
    },
    hasOrderBook: true,
  },
  {
    id: "aster",
    name: "Aster",
    type: "dex",
    color: "#e879f9",
    takerFeeBps: 3.5, // Standard taker fee
    symbols: {
      BTC: "BTCUSDT",
      ETH: "ETHUSDT",
      XAU: "XAUUSDT", // Gold, confirmed live
      WTI: "CLUSDT",  // WTI crude light, confirmed live (~$102)
      XAG: "XAGUSDT", // Silver, confirmed live
    },
    hasOrderBook: true,
  },
  {
    id: "hyperliquid",
    name: "Hyperliquid",
    type: "dex",
    color: "#4ade80",
    takerFeeBps: 4.5,
    symbols: {
      BTC: "BTC",
      ETH: "ETH",
      XAU: "xyz:GOLD", // Gold — RWA market, xyz: prefix required
      WTI: "xyz:CL",   // WTI crude light — RWA market, xyz: prefix required
      XAG: null,       // Not available on Hyperliquid
    },
    hasOrderBook: true,
  },
  {
    id: "coinbase",
    name: "Coinbase",
    type: "cex",
    color: "#0052ff",
    takerFeeBps: 3, // Promotional rate
    symbols: {
      BTC: "BTC-PERP-INTX",
      ETH: "ETH-PERP-INTX",
      XAU: null, // Not available on Coinbase perps
      WTI: null, // Not available on Coinbase perps
      XAG: null, // Not available on Coinbase perps
    },
    hasOrderBook: true,
  },
  {
    id: "binance",
    name: "Binance",
    type: "cex",
    color: "#f0b90b",
    takerFeeBps: 5.0, // Standard futures taker fee (0.05%)
    symbols: {
      BTC: "BTCUSDT",
      ETH: "ETHUSDT",
      XAU: "XAUUSDT", // Gold confirmed live on Binance futures
      WTI: null,       // Not available on Binance futures
      XAG: "XAGUSDT", // Silver confirmed live on Binance futures
    },
    hasOrderBook: true,
  },
  {
    id: "edgex",
    name: "EdgeX",
    type: "dex",
    color: "#22d3ee", // cyan-400
    takerFeeBps: 3.8, // Standard taker fee (0.038%)
    symbols: {
      BTC: "10000001",
      ETH: "10000002",
      XAU: "10000234", // XAUTUSD (Gold)
      WTI: "10000283", // CLUSD (Crude Oil)
      XAG: "10000278", // SILVERUSD
    },
    hasOrderBook: true,
  },
];

export const ASSETS = [
  { id: "BTC", name: "BTC", displayName: "BTC/USD" },
  { id: "ETH", name: "ETH", displayName: "ETH/USD" },
  { id: "XAU", name: "GOLD", displayName: "GOLD/USD" },
  { id: "WTI", name: "OIL (WTI)", displayName: "OIL/USD (WTI)" },
  { id: "XAG", name: "SILVER", displayName: "SILVER/USD" },
];

export const NOTIONAL_SIZES = [10_000, 100_000, 1_000_000, 10_000_000];

export type Side = "buy" | "sell" | "avg";
