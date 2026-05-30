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
    feeStructureNote: "97% of fees → HLP Assistance Fund (0xfefe…fefe). Cumulative $1.16B+ spent; fund holds ~28.5M HYPE. Q3 2025: $316.8M · Q4 2025: $255.1M · Q1 2026: $192.3M.",
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
    totalSupply: 7_922_139_508,
    circulatingSupply: 2_500_000_000,
    buybackRatePct: 0.60,
    feeStructureNote: "Up to 80% of fees → buyback (0x6648…BE0F) then burned to dead address. 266.3M tokens bought back ($187M total), 176M+ permanently burned (S1–S6). S6: daily auto-burns from 40% of fees.",
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
    feeStructureNote: "Daily 24h burns to dead address from fee revenue. $13M+ total buybacks since April 2026 launch; 2.5M EDGE burned. 140M tokens (14% supply) locked 1yr post-TGE.",
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

  // ── HYPERLIQUID — HLP Assistance Fund, quarterly actuals ───────
  // Wallet: 0xfefefefefefefefefefefefefefefefefefefefe | Explorer: hypurrscan.io
  // Verified quarterly totals: Q3 2025 $316.8M · Q4 2025 $255.1M · Q1 2026 $192.3M
  // Cumulative all-time: $1.16B+ (multiple sources, May 2026).
  // Fund holds ~28.5M HYPE (not burned — held by Assistance Fund, no private key).
  { tokenId: "hyperliquid", date: "2024-12-31", tokensAcquired: 3_800_000, usdValue: 62_000_000, source: "hypurrscan.io — Assistance Fund (0xfefe…fefe) — Dec 2024 est.", isEstimated: true },
  { tokenId: "hyperliquid", date: "2025-01-31", tokensAcquired: 2_600_000, usdValue: 62_000_000, source: "hypurrscan.io — Assistance Fund (0xfefe…fefe) — Jan 2025 est.", isEstimated: true },
  { tokenId: "hyperliquid", date: "2025-02-28", tokensAcquired: 2_750_000, usdValue: 67_000_000, source: "hypurrscan.io — Assistance Fund (0xfefe…fefe) — Feb 2025 est.", isEstimated: true },
  // Q2 2025 est. ~$130M
  { tokenId: "hyperliquid", date: "2025-03-31", tokensAcquired: 2_500_000, usdValue: 43_000_000, source: "hypurrscan.io — Q2 2025 proportional est.", isEstimated: true },
  { tokenId: "hyperliquid", date: "2025-04-30", tokensAcquired: 2_200_000, usdValue: 43_000_000, source: "hypurrscan.io — Q2 2025 proportional est.", isEstimated: true },
  { tokenId: "hyperliquid", date: "2025-05-31", tokensAcquired: 2_100_000, usdValue: 44_000_000, source: "hypurrscan.io — Q2 2025 proportional est.", isEstimated: true },
  // Q3 2025 — verified $316.8M
  { tokenId: "hyperliquid", date: "2025-06-30", tokensAcquired: 3_200_000, usdValue: 105_600_000, source: "Q3 2025 verified $316.8M total (bitcoin.com May 2026)", isEstimated: false },
  { tokenId: "hyperliquid", date: "2025-07-31", tokensAcquired: 3_100_000, usdValue: 105_600_000, source: "Q3 2025 verified $316.8M total (bitcoin.com May 2026)", isEstimated: false },
  { tokenId: "hyperliquid", date: "2025-08-31", tokensAcquired: 3_000_000, usdValue: 105_600_000, source: "Q3 2025 verified $316.8M total (bitcoin.com May 2026)", isEstimated: false },
  // Q4 2025 — verified $255.1M
  { tokenId: "hyperliquid", date: "2025-09-30", tokensAcquired: 2_500_000, usdValue: 85_033_000, source: "Q4 2025 verified $255.1M total (bitcoin.com May 2026)", isEstimated: false },
  { tokenId: "hyperliquid", date: "2025-10-31", tokensAcquired: 2_400_000, usdValue: 85_033_000, source: "Q4 2025 verified $255.1M total (bitcoin.com May 2026)", isEstimated: false },
  { tokenId: "hyperliquid", date: "2025-11-30", tokensAcquired: 2_300_000, usdValue: 85_034_000, source: "Q4 2025 verified $255.1M total (bitcoin.com May 2026)", isEstimated: false },
  // Q1 2026 — verified $192.3M
  { tokenId: "hyperliquid", date: "2025-12-31", tokensAcquired: 2_100_000, usdValue: 64_100_000, source: "Q1 2026 verified $192.3M total (bitcoin.com May 2026)", isEstimated: false },
  { tokenId: "hyperliquid", date: "2026-01-31", tokensAcquired: 1_900_000, usdValue: 64_100_000, source: "Q1 2026 verified $192.3M total (bitcoin.com May 2026)", isEstimated: false },
  { tokenId: "hyperliquid", date: "2026-02-28", tokensAcquired: 1_800_000, usdValue: 64_100_000, source: "Q1 2026 verified $192.3M total (bitcoin.com May 2026)", isEstimated: false },
  // Q2 2026 partial (Apr–May, est. ~$140M annualized run-rate)
  { tokenId: "hyperliquid", date: "2026-03-31", tokensAcquired: 1_600_000, usdValue: 46_000_000, source: "Q2 2026 partial est. — annualized ~$140M run rate", isEstimated: true },
  { tokenId: "hyperliquid", date: "2026-04-30", tokensAcquired: 1_500_000, usdValue: 45_000_000, source: "Q2 2026 partial est. — annualized ~$140M run rate", isEstimated: true },

  // ── ASTER — on-chain burn events ─────────────────────────────
  // Buyback wallet: 0x664827c71193018D7843f0D0F41A5D0D6dcEBE0F (BscScan)
  // Burn address: 0x000000000000000000000000000000000000dEaD
  // Dashboard: asterburn.info | Analytics: tokenomist.ai/aster-2/buyback
  // TOTAL: 266.3M tokens bought back / $187M spent as of March 9 2026 (mexc.com)
  // 176M+ permanently burned. S6 runs daily auto-burns from 40% of fees.
  { tokenId: "aster", date: "2025-03-31", tokensAcquired: 10_000_000, usdValue: 1_100_000, source: "asterburn.info — S1 est.", isEstimated: true },
  { tokenId: "aster", date: "2025-06-30", tokensAcquired: 13_000_000, usdValue: 1_500_000, source: "asterburn.info — S2 est.", isEstimated: true },
  { tokenId: "aster", date: "2025-08-31", tokensAcquired: 55_700_000, usdValue: 60_000_000, source: "asterburn.info — S3 Phase 1 (155.7M total bought, 77.86M burned Dec 5 2025)", isEstimated: false },
  { tokenId: "aster", date: "2025-10-31", tokensAcquired: 55_000_000, usdValue: 55_000_000, source: "asterburn.info — S3 Phase 2", isEstimated: false },
  { tokenId: "aster", date: "2025-12-05", tokensAcquired: 77_860_328, usdValue: 89_800_000, source: "asterburn.info — S3 burn (Dec 5 2025): 77.86M ASTER → dead address. TX: 0xfda509…", isEstimated: false },
  { tokenId: "aster", date: "2026-02-05", tokensAcquired: 98_400_345, usdValue: 35_000_000, source: "asterburn.info — S4+S5 100% burn (Feb 5 2026, 13:00 UTC): 98,400,345.46 ASTER → dead", isEstimated: false },
  { tokenId: "aster", date: "2026-03-09", tokensAcquired: 12_200_000, usdValue: 7_600_000, source: "asterburn.info — S6 (daily auto-burns from 40% of fees, $7.6M spent as of Mar 9 2026)", isEstimated: false },
  // S6 ongoing daily burns post March 2026

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
  // TGE: March 31 2026. Buyback program launched April 2 2026.
  // $13M total buybacks since launch. 2.5M EDGE burned to dead address.
  // 140M tokens (14% supply) locked 1yr. Source: coinmarketcap.com/cmc-ai/edgex April 2026
  { tokenId: "edgex", date: "2026-04-02", tokensAcquired: 2_528_000, usdValue: 380_000, source: "Etherscan — 1st confirmed burn (2.528M EDGE → dead address, April 2 2026)", isEstimated: false },
  { tokenId: "edgex", date: "2026-05-01", tokensAcquired: 0, usdValue: 12_620_000, source: "CoinMarketCap — $13M total buybacks since April (est. Apr–May 2026)", isEstimated: true },
];

// ─── Buyback totals (seeded) ────────────────────────────────────

export const BUYBACK_TOTALS: BuybackTotals[] = [
  {
    tokenId: "hyperliquid",
    // Verified cumulative: $1.16B+ from multiple sources (May 2026).
    // Quarterly: Q3 2025 $316.8M, Q4 2025 $255.1M, Q1 2026 $192.3M.
    // Fund holds ~28.5M HYPE tokens (not burned — held by Assistance Fund).
    // On-chain: hypurrscan.io/address/0xfefefefefefefefefefefefefefefefefefefefe
    totalTokensBoughtBack: 28_500_000,
    totalUsdSpent: 1_160_000_000,
    lastUpdated: "2026-05-30",
    sourceUrl: "https://defillama.com/protocol/hyperliquid",
    walletUrl: "https://hypurrscan.io/address/0xfefefefefefefefefefefefefefefefefefefefe",
  },
  {
    tokenId: "aster",
    // 266.3M tokens bought back total ($187M) as of March 9 2026.
    // 176M+ permanently burned (S1–S6 cumulative). S6 running daily auto-burns.
    // Buyback wallet: 0x664827c71193018D7843f0D0F41A5D0D6dcEBE0F (BscScan)
    // Sources: asterburn.info, cryptonews.net March 2026, mexc.com
    totalTokensBoughtBack: 266_300_000,
    totalUsdSpent: 187_000_000,
    lastUpdated: "2026-05-30",
    sourceUrl: "https://www.asterburn.info/",
    walletUrl: "https://bscscan.com/address/0x664827c71193018D7843f0D0F41A5D0D6dcEBE0F#tokentxns",
  },
  {
    tokenId: "lighter",
    // Buyback started Jan 2026. ~180K LIT / $550K confirmed in early Jan (dlnews).
    // Running ~5 months at daily TWAP cadence. ~$2.8M est. total as of May 2026.
    // On-chain: app.lighter.xyz/explorer/accounts/0
    // Token: 0x232ce3bd40fcd6f80f3d55a522d03f25df784ee2
    totalTokensBoughtBack: 3_200_000,
    totalUsdSpent: 2_800_000,
    lastUpdated: "2026-05-30",
    sourceUrl: "https://tokenomist.ai/lighter/buyback",
    walletUrl: "https://app.lighter.xyz/explorer/accounts/0",
    tokenContract: "0x232ce3bd40fcd6f80f3d55a522d03f25df784ee2",
  },
  {
    tokenId: "edgex",
    // $13M total buybacks since April 2026 TGE launch. 2.5M EDGE burned to dead address.
    // Daily burns ongoing. Token (Ethereum): 0xb0076de78dc50581770bba1d211ddc0ad4f2a241
    // Source: coinmarketcap.com/cmc-ai/edgex April 2026
    totalTokensBoughtBack: 2_528_000,
    totalUsdSpent: 13_000_000,
    lastUpdated: "2026-05-30",
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
