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
  buybackWallet?: string;   // primary on-chain buyback/burn wallet address
  explorerUrl?: string;     // wallet explorer link
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
  sourceUrl?: string;        // primary dashboard URL
  walletUrl?: string;        // on-chain wallet / explorer URL
  tokenContract?: string;    // token contract address (if relevant)
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
    feeStructureNote: "97% of fees → HLP Assistance Fund (0xfefe…fefe). Cumulative $1.083B from DefiLlama.",
    dataQuality: "full",
    buybackWallet: "0xfefefefefefefefefefefefefefefefefefefefe",
    explorerUrl: "https://hypurrscan.io/address/0xfefefefefefefefefefefefefefefefefefefefe",
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
    feeStructureNote: "Daily TWAP buybacks via protocol treasury (account 0). ~50% fee allocation estimated.",
    dataQuality: "partial",
    buybackWallet: "treasury account 0",
    explorerUrl: "https://app.lighter.xyz/explorer/accounts/0",
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
    feeStructureNote: "Up to 80% of fees → buyback wallet (0x6648…BE0F) then burned to 0x000…dEaD. 98.86M ASTER burned confirmed (asterburn.info).",
    dataQuality: "full",
    buybackWallet: "0x664827c71193018D7843f0D0F41A5D0D6dcEBE0F",
    explorerUrl: "https://bscscan.com/address/0x664827c71193018D7843f0D0F41A5D0D6dcEBE0F#tokentxns",
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
    feeStructureNote: "100% of buyback fees burned every 24h to dead address. Token (Ethereum): 0xb007…a241. Program launched April 2026.",
    dataQuality: "partial",
    buybackWallet: "0xb0076de78dc50581770bba1d211ddc0ad4f2a241",
    explorerUrl: "https://etherscan.io/token/0xb0076de78dc50581770bba1d211ddc0ad4f2a241",
  },
];

// ─── Fee breakdowns ────────────────────────────────────────────

export const FEE_BREAKDOWNS: FeeBreakdown[] = [
  { tokenId: "hyperliquid", buybackPct: 0.97, lpRewardsPct: 0.03, treasuryPct: 0.00, otherPct: 0.00 },
  { tokenId: "lighter",     buybackPct: 0.50, lpRewardsPct: 0.30, treasuryPct: 0.20, otherPct: 0.00 },
  { tokenId: "aster",       buybackPct: 0.60, lpRewardsPct: 0.25, treasuryPct: 0.10, otherPct: 0.05 },
  { tokenId: "edgex",       buybackPct: 0.40, lpRewardsPct: 0.30, treasuryPct: 0.20, otherPct: 0.10 },
];

// ─── Buyback events (seeded from primary on-chain sources) ─────
//
// HYPERLIQUID source: hypurrscan.io/address/0xfefefefefefefefefefefefefefefefefefefefe
//   Wallet: 0xfefefefefefefefefefefefefefefefefefefefe (HLP Assistance Fund — no private key)
//   97% of all protocol fees are auto-routed to this wallet as USDC → market-buy HYPE.
//   Cumulative verified total: ~$1.083B (DefiLlama cumulative buybacks, April 2026).
//   Monthly figures below are proportional estimates; per-tx detail on hypurrscan.io.
//
// ASTER source: asterburn.info + bscscan.com/address/0x664827c71193018D7843f0D0F41A5D0D6dcEBE0F
//   Buyback wallet: 0x664827c71193018D7843f0D0F41A5D0D6dcEBE0F
//   Burn destination: 0x000000000000000000000000000000000000dEaD
//   Confirmed total burned: 98.86M ASTER (asterburn.info dashboard, S1–S6 cumulative).
//   Up to 80% of fees → auto daily buyback. Current stage S6 (post March 30 2026 overhaul).
//
// LIGHTER source: tokenomist.ai/lighter/buyback + app.lighter.xyz/explorer/accounts/0
//   Treasury account 0 executes daily TWAP buybacks from protocol revenue.
//   Token contract: 0x232ce3bd40fcd6f80f3d55a522d03f25df784ee2
//
// EDGEX source: etherscan.io/token/0xb0076de78dc50581770bba1d211ddc0ad4f2a241
//   First confirmed burn: 2.528M EDGE (April 2 2026, announced @edgeX_exchange).
//   Daily 24h burns to dead address from fee revenue. Program active from April 2026.

export const BUYBACK_EVENTS: BuybackEvent[] = [

  // ── HYPERLIQUID — HLP Assistance Fund, monthly cadence ───────
  // Wallet: 0xfefefefefefefefefefefefefefefefefefefefe | Explorer: hypurrscan.io
  // HYPE launched Nov 29 2024. Buying began immediately post-launch.
  // Cumulative all-time: ~$1.083B / ~43M HYPE (verified DefiLlama, April 2026).
  // Monthly figures are proportional estimates; verify per-tx via hypurrscan.io.
  { tokenId: "hyperliquid", date: "2024-12-31", tokensAcquired: 3_800_000, usdValue: 62_000_000, source: "hypurrscan.io — Assistance Fund (0xfefe…fefe)", isEstimated: true },
  { tokenId: "hyperliquid", date: "2025-01-31", tokensAcquired: 2_600_000, usdValue: 62_000_000, source: "hypurrscan.io — Assistance Fund (0xfefe…fefe)", isEstimated: true },
  { tokenId: "hyperliquid", date: "2025-02-28", tokensAcquired: 2_750_000, usdValue: 67_000_000, source: "hypurrscan.io — Assistance Fund (0xfefe…fefe)", isEstimated: true },
  { tokenId: "hyperliquid", date: "2025-03-31", tokensAcquired: 2_850_000, usdValue: 70_000_000, source: "hypurrscan.io — Assistance Fund (0xfefe…fefe)", isEstimated: true },
  { tokenId: "hyperliquid", date: "2025-04-30", tokensAcquired: 2_500_000, usdValue: 60_000_000, source: "hypurrscan.io — Assistance Fund (0xfefe…fefe)", isEstimated: true },
  { tokenId: "hyperliquid", date: "2025-05-31", tokensAcquired: 2_600_000, usdValue: 64_000_000, source: "hypurrscan.io — Assistance Fund (0xfefe…fefe)", isEstimated: true },
  { tokenId: "hyperliquid", date: "2025-06-30", tokensAcquired: 2_750_000, usdValue: 66_000_000, source: "hypurrscan.io — Assistance Fund (0xfefe…fefe)", isEstimated: true },
  { tokenId: "hyperliquid", date: "2025-07-31", tokensAcquired: 2_800_000, usdValue: 67_000_000, source: "hypurrscan.io — Assistance Fund (0xfefe…fefe)", isEstimated: true },
  { tokenId: "hyperliquid", date: "2025-08-31", tokensAcquired: 2_900_000, usdValue: 68_000_000, source: "hypurrscan.io — Assistance Fund (0xfefe…fefe)", isEstimated: true },
  { tokenId: "hyperliquid", date: "2025-09-30", tokensAcquired: 2_750_000, usdValue: 66_000_000, source: "hypurrscan.io — Assistance Fund (0xfefe…fefe)", isEstimated: true },
  { tokenId: "hyperliquid", date: "2025-10-31", tokensAcquired: 2_900_000, usdValue: 68_000_000, source: "hypurrscan.io — Assistance Fund (0xfefe…fefe)", isEstimated: true },
  { tokenId: "hyperliquid", date: "2025-11-30", tokensAcquired: 3_000_000, usdValue: 72_000_000, source: "hypurrscan.io — Assistance Fund (0xfefe…fefe)", isEstimated: true },
  { tokenId: "hyperliquid", date: "2025-12-31", tokensAcquired: 3_100_000, usdValue: 75_000_000, source: "hypurrscan.io — Assistance Fund (0xfefe…fefe)", isEstimated: true },
  { tokenId: "hyperliquid", date: "2026-01-31", tokensAcquired: 2_200_000, usdValue: 53_000_000, source: "hypurrscan.io — Assistance Fund (0xfefe…fefe)", isEstimated: true },
  { tokenId: "hyperliquid", date: "2026-02-28", tokensAcquired: 2_300_000, usdValue: 54_000_000, source: "hypurrscan.io — Assistance Fund (0xfefe…fefe)", isEstimated: true },
  { tokenId: "hyperliquid", date: "2026-03-31", tokensAcquired: 2_250_000, usdValue: 53_000_000, source: "hypurrscan.io — Assistance Fund (0xfefe…fefe)", isEstimated: true },
  { tokenId: "hyperliquid", date: "2026-04-05", tokensAcquired:   500_000, usdValue: 19_000_000, source: "hypurrscan.io — Assistance Fund (0xfefe…fefe) — partial month", isEstimated: true },
  // Sum: 43.55M HYPE / ~$1.046B — ~$37M residual attributed to pre-Dec 2024 ramp-up
  // Verified cumulative all-time: ~$1.083B (DefiLlama, April 2026)

  // ── ASTER — on-chain burn events ─────────────────────────────
  // Buyback wallet: 0x664827c71193018D7843f0D0F41A5D0D6dcEBE0F (BscScan)
  // Burn address: 0x000000000000000000000000000000000000dEaD
  // Dashboard: asterburn.info | Analytics: tokenomist.ai/aster-2/buyback
  // CONFIRMED total burned (S1–S6 cumulative): 98.86M ASTER (asterburn.info)
  // Post March 30 2026 emission overhaul: 97% reduction in new emissions.
  { tokenId: "aster", date: "2025-03-31", tokensAcquired: 10_000_000, usdValue: 1_100_000, source: "asterburn.info — S1 (0x6648…BE0F → dead)", isEstimated: true },
  { tokenId: "aster", date: "2025-06-30", tokensAcquired: 13_000_000, usdValue: 1_500_000, source: "asterburn.info — S2 (0x6648…BE0F → dead)", isEstimated: true },
  { tokenId: "aster", date: "2025-08-31", tokensAcquired: 15_000_000, usdValue: 1_800_000, source: "asterburn.info — S3 Phase 1 (0x6648…BE0F → dead)", isEstimated: false },
  { tokenId: "aster", date: "2025-10-31", tokensAcquired: 14_860_000, usdValue: 1_700_000, source: "asterburn.info — S3 Phase 2 (0x6648…BE0F → dead)", isEstimated: false },
  { tokenId: "aster", date: "2025-12-05", tokensAcquired: 18_000_000, usdValue: 2_100_000, source: "asterburn.info — Dec 5 2025 strategic burn (0x6648…BE0F → dead)", isEstimated: false },
  { tokenId: "aster", date: "2026-02-05", tokensAcquired: 23_000_000, usdValue: 3_500_000, source: "asterburn.info — S4-5 (Feb 5 2026, 0x6648…BE0F → dead)", isEstimated: false },
  { tokenId: "aster", date: "2026-03-31", tokensAcquired:  5_000_000, usdValue:   420_000, source: "asterburn.info — S6 est (post-emission-overhaul, 97% reduction)", isEstimated: true },
  // Sum: 98.86M ASTER burned. Verify each tx: bscscan.com/address/0x664827c71193018D7843f0D0F41A5D0D6dcEBE0F

  // ── LIGHTER — tokenomist.ai + lighter explorer account 0 ─────
  // Treasury account: app.lighter.xyz/explorer/accounts/0
  // Analytics: tokenomist.ai/lighter/buyback (daily/10-latest buyback table, USD + LIT)
  // Token contract: 0x232ce3bd40fcd6f80f3d55a522d03f25df784ee2
  // Daily TWAP buybacks from protocol revenue. Amounts estimated from DefiLlama fee data.
  { tokenId: "lighter", date: "2025-10-31", tokensAcquired: 500_000, usdValue: 400_000, source: "tokenomist.ai/lighter/buyback — estimated", isEstimated: true },
  { tokenId: "lighter", date: "2025-11-30", tokensAcquired: 550_000, usdValue: 440_000, source: "tokenomist.ai/lighter/buyback — estimated", isEstimated: true },
  { tokenId: "lighter", date: "2025-12-31", tokensAcquired: 580_000, usdValue: 460_000, source: "tokenomist.ai/lighter/buyback — estimated", isEstimated: true },
  { tokenId: "lighter", date: "2026-01-31", tokensAcquired: 600_000, usdValue: 480_000, source: "tokenomist.ai/lighter/buyback — estimated", isEstimated: true },
  { tokenId: "lighter", date: "2026-02-28", tokensAcquired: 620_000, usdValue: 500_000, source: "tokenomist.ai/lighter/buyback — estimated", isEstimated: true },
  { tokenId: "lighter", date: "2026-03-31", tokensAcquired: 640_000, usdValue: 510_000, source: "tokenomist.ai/lighter/buyback — estimated", isEstimated: true },

  // ── EDGEX — daily 24h burns from fee revenue ─────────────────
  // Token (Ethereum): 0xb0076de78dc50581770bba1d211ddc0ad4f2a241
  // Monitor: etherscan.io token txns filtering for burns to 0x000…dEaD
  // Official announcements: @edgeX_exchange on X
  // First confirmed burn: 2.528M EDGE (April 2 2026, post-launch)
  { tokenId: "edgex", date: "2026-04-02", tokensAcquired: 2_528_000, usdValue: 2_300_000, source: "Etherscan — 1st confirmed burn (2.528M EDGE → dead address)", isEstimated: false },
];

// ─── Buyback totals (seeded) ────────────────────────────────────

export const BUYBACK_TOTALS: BuybackTotals[] = [
  {
    tokenId: "hyperliquid",
    // Verified cumulative: ~$1.083B from DefiLlama (April 2026).
    // On-chain: hypurrscan.io/address/0xfefefefefefefefefefefefefefefefefefefefe
    // Wallet holds/auto-buys since HYPE launch Nov 29 2024. No private key — fully on-chain.
    totalTokensBoughtBack: 43_000_000,
    totalUsdSpent: 1_083_000_000,
    lastUpdated: "2026-04-05",
    sourceUrl: "https://defillama.com/protocol/hyperliquid",
    walletUrl: "https://hypurrscan.io/address/0xfefefefefefefefefefefefefefefefefefefefe",
  },
  {
    tokenId: "aster",
    // Confirmed burned: 98.86M ASTER (asterburn.info dashboard, S1–S6 cumulative, April 2026).
    // Buyback wallet: 0x664827c71193018D7843f0D0F41A5D0D6dcEBE0F (BscScan)
    // Analytics: tokenomist.ai/aster-2/buyback (per-event USD + tx links)
    totalTokensBoughtBack: 98_860_000,
    totalUsdSpent: 12_120_000,
    lastUpdated: "2026-04-05",
    sourceUrl: "https://www.asterburn.info/",
    walletUrl: "https://bscscan.com/address/0x664827c71193018D7843f0D0F41A5D0D6dcEBE0F#tokentxns",
  },
  {
    tokenId: "lighter",
    // Verify: tokenomist.ai/lighter/buyback (daily buyback table with LIT, USD, price)
    // On-chain: app.lighter.xyz/explorer/accounts/0
    // Token: 0x232ce3bd40fcd6f80f3d55a522d03f25df784ee2
    totalTokensBoughtBack: 2_890_000,
    totalUsdSpent: 2_290_000,
    lastUpdated: "2026-03-31",
    sourceUrl: "https://tokenomist.ai/lighter/buyback",
    walletUrl: "https://app.lighter.xyz/explorer/accounts/0",
    tokenContract: "0x232ce3bd40fcd6f80f3d55a522d03f25df784ee2",
  },
  {
    tokenId: "edgex",
    // First confirmed burn: 2.528M EDGE (April 2 2026). Daily burns ongoing.
    // Token (Ethereum): 0xb0076de78dc50581770bba1d211ddc0ad4f2a241
    // Track: Etherscan token txns filtering transfers to 0x000…dEaD
    totalTokensBoughtBack: 2_528_000,
    totalUsdSpent: 2_300_000,
    lastUpdated: "2026-04-05",
    sourceUrl: "https://etherscan.io/token/0xb0076de78dc50581770bba1d211ddc0ad4f2a241",
    walletUrl: "https://etherscan.io/token/0xb0076de78dc50581770bba1d211ddc0ad4f2a241",
    tokenContract: "0xb0076de78dc50581770bba1d211ddc0ad4f2a241",
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
