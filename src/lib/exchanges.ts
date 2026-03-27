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
    id: "hyperliquid",
    name: "Hyperliquid",
    type: "dex",
    color: "#4ade80",
    takerFeeBps: 4.5,
    symbols: {
      BTC: "BTC",
      ETH: "ETH",
      XAU: "@4", // Gold on HL uses index 4 — we'll resolve via meta
      WTI: "@8", // Oil — resolve via meta
      XAG: "@5", // Silver — resolve via meta
    },
    hasOrderBook: true,
  },
  {
    id: "lighter",
    name: "Lighter",
    type: "dex",
    color: "#facc15",
    takerFeeBps: 0, // Zero fee for standard accounts
    symbols: {
      BTC: "BTCUSDC",
      ETH: "ETHUSDC",
      XAU: null, // Need to verify availability
      WTI: null,
      XAG: null,
    },
    hasOrderBook: true,
  },
  {
    id: "binance",
    name: "Binance",
    type: "cex",
    color: "#f0b90b",
    takerFeeBps: 4.5,
    symbols: {
      BTC: "BTCUSDT",
      ETH: "ETHUSDT",
      XAU: null, // Binance doesn't have commodity perps
      WTI: null,
      XAG: null,
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
      XAU: null, // Need to verify
      WTI: null,
      XAG: null,
    },
    hasOrderBook: true,
  },
  {
    id: "ostium",
    name: "Ostium",
    type: "dex",
    color: "#a78bfa",
    takerFeeBps: 10, // ~0.10% for crypto
    symbols: {
      BTC: "BTC/USD",
      ETH: "ETH/USD",
      XAU: "XAU/USD",
      WTI: "WTI/USD",
      XAG: "XAG/USD",
    },
    hasOrderBook: false, // Oracle-based
  },
];

export const ASSETS = [
  { id: "BTC", name: "BTC", displayName: "BTC/USD" },
  { id: "ETH", name: "ETH", displayName: "ETH/USD" },
  { id: "XAU", name: "GOLD/XAU", displayName: "GOLD/XAU" },
  { id: "WTI", name: "CL/WTI", displayName: "CL/WTI" },
  { id: "XAG", name: "SILVER/XAG", displayName: "SILVER/XAG" },
];

export const NOTIONAL_SIZES = [10_000, 100_000, 1_000_000, 10_000_000];

export type Side = "buy" | "sell" | "avg";
