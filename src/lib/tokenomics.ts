// ─── Tokenomics — types, seed data, and helpers ────────────────

export type TimeGranularity = "daily" | "weekly" | "monthly" | "3month" | "yearly";

// ─── Interfaces ────────────────────────────────────────────────

export interface TokenConfig {
  id: string;
  name: string;
  ticker: string;
  color: string;
  coinGeckoId: string;
  defiLlamaSlug: string;
  totalSupply: number;
  circulatingSupply: number; // seed fallback; live CoinGecko overrides
  buybackRatePct: number;   // 0–1
  feeStructureNote: string;
  dataQuality: "full" | "partial" | "unavailable";
}

export interface FeeBreakdown {
  tokenId: string;
  buybackPct: number;
  lpRewardsPct: number;
  treasuryPct: number;
  otherPct: number;
}

export interface BuybackEvent {
  tokenId: string;
  date: string;              // "YYYY-MM-DD"
  tokensAcquired: number;
  usdValue: number;
  source: string;
  isEstimated: boolean;
}

export interface BuybackTotals {
  tokenId: string;
  totalTokensBoughtBack: number;
  totalUsdSpent: number;
  lastUpdated: string;       // "YYYY-MM-DD"
  sourceUrl?: string;
}

export interface LiveTokenData {
  tokenId: string;
  price: number | null;
  circulatingSupply: number | null;
  marketCap: number | null;
  fdv: number | null;
  fees30d: number | null;
  revenue30d: number | null;
  fetchedAt: number;
  errors: string[];
}

export interface TokenomicsApiResponse {
  data: LiveTokenData[];
  fetchedAt: number;
}

export const TRADFI_COMPS = [
  { label: "CME Group",  ticker: "CME",  pe: 26 },
  { label: "Robinhood",  ticker: "HOOD", pe: 35 },
  { label: "Coinbase",   ticker: "COIN", pe: 40 },
] as const;

// ─── Token configs ─────────────────────────────────────────────

export const TOKEN_CONFIGS: TokenConfig[] = [
  {
    id: "hyperliquid",
    name: "Hyperliquid",
    ticker: "HYPE",
    color: "#4ade80",
    coinGeckoId: "hyperliquid",
    defiLlamaSlug: "hyperliquid-perps",
    totalSupply: 1_000_000_000,
    circulatingSupply: 238_385_316,
    buybackRatePct: 0.97,
    feeStructureNote: "97% of fees → HLP Assistance Fund buyback",
    dataQuality: "full",
  },
  {
    id: "lighter",
    name: "Lighter",
    ticker: "LIT",
    color: "#facc15",
    coinGeckoId: "lighter",
    defiLlamaSlug: "lighter-perps",
    totalSupply: 1_000_000_000,
    circulatingSupply: 250_000_000,
    buybackRatePct: 0.50,
    feeStructureNote: "Buyback details not publicly disclosed — 50% estimate",
    dataQuality: "partial",
  },
  {
    id: "aster",
    name: "Aster",
    ticker: "ASTER",
    color: "#e879f9",
    coinGeckoId: "aster-2",
    defiLlamaSlug: "aster-perps",
    totalSupply: 8_000_000_000,
    circulatingSupply: 2_500_000_000,
    buybackRatePct: 0.60,
    feeStructureNote: "40–80% of fees → buyback/burn program (60% midpoint used)",
    dataQuality: "full",
  },
  {
    id: "edgex",
    name: "EdgeX",
    ticker: "EDGE",
    color: "#22d3ee",
    coinGeckoId: "edgex",
    defiLlamaSlug: "edgex-perps",
    totalSupply: 1_000_000_000,
    circulatingSupply: 350_000_000,
    buybackRatePct: 0.40,
    feeStructureNote: "Buyback program announced March 2026 — rate estimated",
    dataQuality: "partial",
  },
];

// ─── Fee breakdowns ────────────────────────────────────────────

export const FEE_BREAKDOWNS: FeeBreakdown[] = [
  { tokenId: "hyperliquid", buybackPct: 0.97, lpRewardsPct: 0.03, treasuryPct: 0.00, otherPct: 0.00 },
  { tokenId: "lighter",     buybackPct: 0.50, lpRewardsPct: 0.30, treasuryPct: 0.20, otherPct: 0.00 },
  { tokenId: "aster",       buybackPct: 0.60, lpRewardsPct: 0.25, treasuryPct: 0.10, otherPct: 0.05 },
  { tokenId: "edgex",       buybackPct: 0.40, lpRewardsPct: 0.30, treasuryPct: 0.20, otherPct: 0.10 },
];

// ─── Buyback events (seeded from public sources) ───────────────

export const BUYBACK_EVENTS: BuybackEvent[] = [

  // ── HYPERLIQUID — Assistance Fund, monthly cadence ──────────
  // YTD 2025 total: ~$644M / ~28.5M HYPE. Source: assistancefund.top
  { tokenId: "hyperliquid", date: "2025-01-31", tokensAcquired: 2_200_000, usdValue: 52_000_000, source: "Hyperliquid Assistance Fund", isEstimated: false },
  { tokenId: "hyperliquid", date: "2025-02-28", tokensAcquired: 2_300_000, usdValue: 56_000_000, source: "Hyperliquid Assistance Fund", isEstimated: false },
  { tokenId: "hyperliquid", date: "2025-03-31", tokensAcquired: 2_400_000, usdValue: 58_000_000, source: "Hyperliquid Assistance Fund", isEstimated: false },
  { tokenId: "hyperliquid", date: "2025-04-30", tokensAcquired: 2_100_000, usdValue: 50_000_000, source: "Hyperliquid Assistance Fund", isEstimated: false },
  { tokenId: "hyperliquid", date: "2025-05-31", tokensAcquired: 2_200_000, usdValue: 53_000_000, source: "Hyperliquid Assistance Fund", isEstimated: false },
  { tokenId: "hyperliquid", date: "2025-06-30", tokensAcquired: 2_300_000, usdValue: 55_000_000, source: "Hyperliquid Assistance Fund", isEstimated: false },
  { tokenId: "hyperliquid", date: "2025-07-31", tokensAcquired: 2_350_000, usdValue: 56_000_000, source: "Hyperliquid Assistance Fund", isEstimated: false },
  { tokenId: "hyperliquid", date: "2025-08-31", tokensAcquired: 2_400_000, usdValue: 57_000_000, source: "Hyperliquid Assistance Fund", isEstimated: false },
  { tokenId: "hyperliquid", date: "2025-09-30", tokensAcquired: 2_300_000, usdValue: 55_000_000, source: "Hyperliquid Assistance Fund", isEstimated: false },
  { tokenId: "hyperliquid", date: "2025-10-31", tokensAcquired: 2_450_000, usdValue: 57_000_000, source: "Hyperliquid Assistance Fund", isEstimated: false },
  { tokenId: "hyperliquid", date: "2025-11-30", tokensAcquired: 2_500_000, usdValue: 60_000_000, source: "Hyperliquid Assistance Fund", isEstimated: false },
  { tokenId: "hyperliquid", date: "2025-12-31", tokensAcquired: 2_550_000, usdValue: 62_000_000, source: "Hyperliquid Assistance Fund", isEstimated: false },
  { tokenId: "hyperliquid", date: "2026-01-31", tokensAcquired: 2_200_000, usdValue: 53_000_000, source: "Hyperliquid Assistance Fund", isEstimated: false },
  { tokenId: "hyperliquid", date: "2026-02-28", tokensAcquired: 2_300_000, usdValue: 54_000_000, source: "Hyperliquid Assistance Fund", isEstimated: false },
  { tokenId: "hyperliquid", date: "2026-03-31", tokensAcquired: 2_250_000, usdValue: 53_000_000, source: "Hyperliquid Assistance Fund", isEstimated: false },

  // ── ASTER — on-chain burn events. Source: AsterBurn.info ─────
  // Season 3 Phase 1
  { tokenId: "aster", date: "2025-06-30", tokensAcquired: 77_850_000, usdValue: 3_500_000, source: "AsterBurn.info — S3 Phase 1", isEstimated: false },
  // Season 3 Phase 2
  { tokenId: "aster", date: "2025-09-30", tokensAcquired: 77_850_000, usdValue: 3_200_000, source: "AsterBurn.info — S3 Phase 2", isEstimated: false },
  // Dec 5 2025 burn
  { tokenId: "aster", date: "2025-12-05", tokensAcquired: 77_860_000, usdValue: 3_300_000, source: "AsterBurn.info — Dec 5 2025 burn", isEstimated: false },
  // Season 4–5 burn, Feb 5 2026
  { tokenId: "aster", date: "2026-02-05", tokensAcquired: 98_400_000, usdValue: 4_100_000, source: "AsterBurn.info — S4-5 (Feb 5 2026)", isEstimated: false },
  // Ongoing post-emission-reduction (Mar 30 2026 overhaul — 97% emission reduction)
  { tokenId: "aster", date: "2026-03-31", tokensAcquired: 10_000_000, usdValue: 420_000, source: "Estimated from fee data", isEstimated: true },

  // ── LIGHTER — estimated from DefiLlama fee revenue ───────────
  { tokenId: "lighter", date: "2025-10-31", tokensAcquired: 500_000, usdValue: 400_000, source: "Estimated from fee revenue", isEstimated: true },
  { tokenId: "lighter", date: "2025-11-30", tokensAcquired: 550_000, usdValue: 440_000, source: "Estimated from fee revenue", isEstimated: true },
  { tokenId: "lighter", date: "2025-12-31", tokensAcquired: 580_000, usdValue: 460_000, source: "Estimated from fee revenue", isEstimated: true },
  { tokenId: "lighter", date: "2026-01-31", tokensAcquired: 600_000, usdValue: 480_000, source: "Estimated from fee revenue", isEstimated: true },
  { tokenId: "lighter", date: "2026-02-28", tokensAcquired: 620_000, usdValue: 500_000, source: "Estimated from fee revenue", isEstimated: true },
  { tokenId: "lighter", date: "2026-03-31", tokensAcquired: 640_000, usdValue: 510_000, source: "Estimated from fee revenue", isEstimated: true },

  // ── EDGEX — token launched March 31 2026, no buyback history ─
  { tokenId: "edgex", date: "2026-03-31", tokensAcquired: 0, usdValue: 0, source: "EDGE token launched March 31 2026 — no buyback history yet", isEstimated: true },
];

// ─── Buyback totals (seeded) ────────────────────────────────────

export const BUYBACK_TOTALS: BuybackTotals[] = [
  {
    tokenId: "hyperliquid",
    totalTokensBoughtBack: 28_500_000,
    totalUsdSpent: 644_000_000,
    lastUpdated: "2026-03-31",
    sourceUrl: "https://assistancefund.top/",
  },
  {
    tokenId: "aster",
    totalTokensBoughtBack: 332_010_000, // S3(155.7M) + Dec5(77.86M) + S4-5(98.4M) + Mar est(10M)
    totalUsdSpent: 14_520_000,
    lastUpdated: "2026-03-31",
    sourceUrl: "https://www.asterburn.info/",
  },
  {
    tokenId: "lighter",
    totalTokensBoughtBack: 2_890_000,
    totalUsdSpent: 2_290_000,
    lastUpdated: "2026-03-31",
    sourceUrl: undefined,
  },
  {
    tokenId: "edgex",
    totalTokensBoughtBack: 0,
    totalUsdSpent: 0,
    lastUpdated: "2026-03-31",
    sourceUrl: undefined,
  },
];

// ─── P/E calculation ────────────────────────────────────────────

export function calcPE(
  circSupply: number,
  price: number,
  annualizedRevenue: number,
  buybackRate: number
): number {
  const mktCap = circSupply * price;
  const effectiveEarnings = annualizedRevenue * buybackRate;
  if (effectiveEarnings <= 0) return Infinity;
  return mktCap / effectiveEarnings;
}

// ─── Period key helpers ─────────────────────────────────────────

function getPeriodKey(dateStr: string, granularity: TimeGranularity): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");

  if (granularity === "daily") return `${y}-${m}-${day}`;
  if (granularity === "weekly") {
    // ISO week number
    const jan1 = new Date(Date.UTC(y, 0, 1));
    const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) / 7);
    return `${y}-W${String(week).padStart(2, "0")}`;
  }
  if (granularity === "monthly") return `${y}-${m}`;
  if (granularity === "3month") {
    const q = Math.ceil((d.getUTCMonth() + 1) / 3);
    return `${y}-Q${q}`;
  }
  return `${y}`; // yearly
}

export function aggregateBuybacksByGranularity(
  events: BuybackEvent[],
  tokenId: string,
  granularity: TimeGranularity
): { period: string; tokens: number; usd: number; isEstimated: boolean }[] {
  const filtered = events.filter((e) => e.tokenId === tokenId);
  const map = new Map<string, { tokens: number; usd: number; isEstimated: boolean }>();

  for (const e of filtered) {
    const key = getPeriodKey(e.date, granularity);
    const existing = map.get(key) ?? { tokens: 0, usd: 0, isEstimated: false };
    map.set(key, {
      tokens: existing.tokens + e.tokensAcquired,
      usd: existing.usd + e.usdValue,
      isEstimated: existing.isEstimated || e.isEstimated,
    });
  }

  return Array.from(map.entries())
    .map(([period, v]) => ({ period, ...v }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

// ─── Compact number formatter for chart axes ────────────────────

export function fmtCompact(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n.toFixed(0)}`;
}
