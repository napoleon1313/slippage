// ─── Tokenomics — types, config, milestones, and pure helpers ───
//
// Data philosophy (Sep 2026 rewrite):
//   • Every USD number on the page is live. DefiLlama "holders revenue" is the
//     unified buyback feed for all four protocols (it is what each adapter
//     measures as fees routed to token buybacks / burns).
//   • Hyperliquid gets a second, fully on-chain feed: the Assistance Fund
//     wallet's spot balance (tokens held = tokens bought) and its fills.
//   • Hand-typed figures survive only as MILESTONES (dated, sourced events) and
//     REPORTED_TOTALS (documented fallbacks shown next to live values).

export type TimeGranularity = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

// ─── Interfaces ────────────────────────────────────────────────

export interface TokenConfig {
  id: string;
  name: string;
  ticker: string;
  color: string;
  coinGeckoId: string;
  /** DefiLlama parent slug (fees + revenue + holders revenue). */
  defiLlamaSlug: string;
  /** Optional child slug when the parent lacks a dataType (e.g. Aster revenue). */
  defiLlamaFallbackSlug?: string;
  totalSupply: number;
  circulatingSupply: number;        // seed fallback; live CoinGecko overrides
  /** Documented policy share of fees routed to buybacks (0–1). null = undisclosed. */
  policyBuybackRate: number | null;
  policyNote: string;
  buybackWallet?: string;
  explorerUrl?: string;
  docsUrl?: string;
}

export interface LiveTokenData {
  tokenId: string;
  price: number | null;
  priceChange24h: number | null;
  priceChange7d: number | null;
  priceChange30d: number | null;
  ath: number | null;
  athDate: string | null;
  athChangePct: number | null;
  volume24h: number | null;
  marketCapRank: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  marketCap: number | null;
  fdv: number | null;
  fees7d: number | null;
  fees30d: number | null;
  revenue30d: number | null;
  /** DefiLlama holders revenue = fees routed to buybacks. */
  buyback7d: number | null;
  buyback30d: number | null;
  buybackAllTime: number | null;
  buybackTrackedSince: string | null;
  /** Last 90 daily fee points for sparklines: [dateISO, usd]. */
  feesDaily: [string, number][];
  /** Hyperliquid only: Assistance Fund spot balance + cost basis, on-chain. */
  onChainTokensHeld: number | null;
  onChainCostBasisUsd: number | null;
  fetchedAt: number;
  errors: string[];
}

export interface TokenomicsApiResponse {
  data: LiveTokenData[];
  fetchedAt: number;
}

export interface DailyBuyback {
  date: string;    // YYYY-MM-DD UTC
  usd: number;
  tokens: number;  // 0 when not derivable
  txCount: number; // 0 when aggregated / not on-chain
}

export interface TokenBuybackData {
  tokenId: string;
  daily: DailyBuyback[];
  source: string;
  /** "onchain" = per-tx wallet data, "tracked" = DefiLlama adapter, "estimated" = proxy. */
  quality: "onchain" | "tracked" | "estimated";
  tokensDerivedFromPrice: boolean;
  fetchedAt: number;
  error?: string;
}

export interface BuybacksApiResponse {
  data: TokenBuybackData[];
  days: number;
  fetchedAt: number;
}

export interface Milestone {
  tokenId: string;
  date: string;          // YYYY-MM-DD
  title: string;
  detail: string;
  kind: "burn" | "policy" | "launch" | "governance" | "market";
  tokens?: number;
  usd?: number;
  sourceLabel: string;
  sourceUrl?: string;
  confidence: "verified" | "reported";
}

export interface ReportedTotal {
  tokenId: string;
  tokensRemoved: number | null;
  tokensRemovedLabel: string;
  usdSpent: number | null;
  usdSpentLabel: string;
  asOf: string;
  sourceUrl?: string;
}

export interface AnalystNote {
  date: string;
  tokenId: string | "market";
  text: string;
  sourceLabel: string;
  sourceUrl: string;
}

export const TRADFI_COMPS = [
  { label: "CME Group", ticker: "CME",  pe: 26 },
  { label: "Robinhood", ticker: "HOOD", pe: 35 },
  { label: "Coinbase",  ticker: "COIN", pe: 40 },
] as const;

// ─── Token configs ─────────────────────────────────────────────

export const TOKEN_CONFIGS: TokenConfig[] = [
  {
    id: "hyperliquid",
    name: "Hyperliquid",
    ticker: "HYPE",
    color: "#4ade80",
    coinGeckoId: "hyperliquid",
    defiLlamaSlug: "hyperliquid",
    totalSupply: 1_000_000_000,
    circulatingSupply: 222_445_714,
    policyBuybackRate: 0.99,
    policyNote:
      "99% of net perps fees (after builder codes) flow to the Assistance Fund, which market-buys HYPE on the spot book. A Dec 24 2024 validator vote treats fund holdings as burned. Roughly 1% goes to HLP.",
    buybackWallet: "0xfefefefefefefefefefefefefefefefefefefefe",
    explorerUrl: "https://hypurrscan.io/address/0xfefefefefefefefefefefefefefefefefefefefe",
    docsUrl: "https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/hype",
  },
  {
    id: "lighter",
    name: "Lighter",
    ticker: "LIT",
    color: "#facc15",
    coinGeckoId: "lighter",
    defiLlamaSlug: "lighter",
    defiLlamaFallbackSlug: "lighter-perps",
    totalSupply: 1_000_000_000,
    circulatingSupply: 250_000_000,
    policyBuybackRate: null,
    policyNote:
      "Daily 24h TWAP buybacks from the protocol treasury (account 0) since Jan 2026. The June 2026 overhaul routes bought tokens to burns. The fee share is not published; the live effective rate below is DefiLlama holders revenue ÷ fees.",
    buybackWallet: "Lighter treasury account 0",
    explorerUrl: "https://app.lighter.xyz/explorer/accounts/0",
    docsUrl: "https://tokenomist.ai/lighter/buyback",
  },
  {
    id: "aster",
    name: "Aster",
    ticker: "ASTER",
    color: "#e879f9",
    coinGeckoId: "aster-2",
    defiLlamaSlug: "aster",
    defiLlamaFallbackSlug: "aster-perps",
    totalSupply: 7_922_139_508,
    circulatingSupply: 2_704_071_066,
    policyBuybackRate: 0.99,
    policyNote:
      "Since Jun 17 2026: 99% of daily platform fees buy ASTER by TWAP on Aster Chain and go to veASTER stakers. An equal amount is burned from reserves (team allocation first). Supply target 8B → 3B. Before that: stage-based buy-and-burn (S1–S6).",
    buybackWallet: "0xa0edBaBcb48034e368de286b49F9603C7AfA1b60",
    explorerUrl: "https://www.asterburn.info/",
    docsUrl: "https://docs.asterdex.com/",
  },
  {
    id: "edgex",
    name: "edgeX",
    ticker: "EDGE",
    color: "#22d3ee",
    coinGeckoId: "edgex",
    defiLlamaSlug: "edgex",
    totalSupply: 1_000_000_000,
    circulatingSupply: 350_000_000,
    policyBuybackRate: null,
    policyNote:
      "Fee-funded buybacks with a 24h burn cadence since Apr 2 2026. The share of fees is not published. V2 launched Jun 2 2026 and DefiLlama now tracks v1 + v2 under the parent slug.",
    buybackWallet: "0xb0076de78dc50581770bba1d211ddc0ad4f2a241",
    explorerUrl: "https://etherscan.io/token/0xb0076de78dc50581770bba1d211ddc0ad4f2a241",
    docsUrl: "https://pro.edgex.exchange/en-US/tokenomics",
  },
];

// ─── Documented totals (fallback / context next to live values) ─

export const REPORTED_TOTALS: ReportedTotal[] = [
  {
    tokenId: "hyperliquid",
    tokensRemoved: null,
    tokensRemovedLabel: "Live from the fund's spot balance",
    usdSpent: null,
    usdSpentLabel: "Live from the fund's cost basis",
    asOf: "live",
  },
  {
    tokenId: "lighter",
    tokensRemoved: 15_638_702,
    tokensRemovedLabel: "Burned Jul 10 2026 (Q1–Q2 buybacks). Aug 2026 added ~927.8K LIT.",
    usdSpent: 39_000_000,
    usdSpentLabel: "≈$39M at the Jul 10 burn price ($2.54)",
    asOf: "2026-09-04",
    sourceUrl: "https://finance.yahoo.com/markets/crypto/articles/lighter-prepares-burn-15-5-210237423.html",
  },
  {
    tokenId: "aster",
    tokensRemoved: 188_867_110,
    tokensRemovedLabel: "Cumulative burn across all programs (official Aug 10 2026 update)",
    usdSpent: 211_000_000,
    usdSpentLabel: "S1–S6 reported spend through Mar 2026; DefiLlama tracks daily since Jan 20 2026",
    asOf: "2026-08-10",
    sourceUrl: "https://x.com/Aster_DEX/status/2086807491170717917",
  },
  {
    tokenId: "edgex",
    tokensRemoved: 48_200_000,
    tokensRemovedLabel: "≈4.82% of total supply repurchased (reported, unaudited)",
    usdSpent: null,
    usdSpentLabel: "Live from DefiLlama",
    asOf: "2026-09-15",
    sourceUrl: "https://coinmarketcap.com/cmc-ai/edgex/latest-updates/",
  },
];

// ─── Milestones (dated, sourced events) ────────────────────────

export const MILESTONES: Milestone[] = [
  // Hyperliquid
  { tokenId: "hyperliquid", date: "2024-11-29", kind: "launch", title: "HYPE genesis", detail: "Token launches. The Assistance Fund starts buying HYPE with protocol fees the same week.", sourceLabel: "Hyperliquid docs", sourceUrl: "https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/hype", confidence: "verified" },
  { tokenId: "hyperliquid", date: "2024-12-24", kind: "governance", title: "Fund holdings treated as burned", detail: "Stake-weighted validator vote recognizes all Assistance Fund HYPE (then ~37M, ~$920M) as permanently removed from supply.", tokens: 37_000_000, usd: 920_000_000, sourceLabel: "The Defiant, Dec 16 2024", sourceUrl: "https://thedefiant.io/news/tokens/hyperliquid-proposes-burning-13-percent-of-circulating-token-supply", confidence: "verified" },
  { tokenId: "hyperliquid", date: "2025-10-01", kind: "policy", title: "HIP-3 permissionless perps", detail: "Anyone staking 500K HYPE can deploy perp markets. Fees from HIP-3 markets also route to the fund.", sourceLabel: "Hyperliquid docs", sourceUrl: "https://hyperliquid.gitbook.io/hyperliquid-docs/", confidence: "verified" },
  { tokenId: "hyperliquid", date: "2026-02-01", kind: "policy", title: "HIP-4 prediction markets", detail: "On-chain prediction markets added to HyperCore.", sourceLabel: "CoinMarketCap", sourceUrl: "https://coinmarketcap.com/cmc-ai/hyperliquid/latest-updates/", confidence: "reported" },
  { tokenId: "hyperliquid", date: "2026-09-06", kind: "market", title: "All-time high $89.60", detail: "HYPE prints a new high. A 433,419 HYPE contributor unlock lands the same day.", sourceLabel: "CoinGecko", sourceUrl: "https://www.coingecko.com/en/coins/hyperliquid", confidence: "verified" },

  // Lighter
  { tokenId: "lighter", date: "2026-01-06", kind: "launch", title: "Buybacks begin", detail: "Treasury account 0 starts daily TWAP purchases. About 180K LIT (~$550K) bought in the first days.", tokens: 180_000, usd: 550_000, sourceLabel: "DL News, Jan 6 2026", sourceUrl: "https://www.dlnews.com/", confidence: "reported" },
  { tokenId: "lighter", date: "2026-06-15", kind: "policy", title: "Buybacks become burns", detail: "June tokenomics overhaul: repurchased LIT is burned instead of held in treasury.", sourceLabel: "Yahoo Finance, Jul 10 2026", sourceUrl: "https://finance.yahoo.com/markets/crypto/articles/lighter-prepares-burn-15-5-210237423.html", confidence: "verified" },
  { tokenId: "lighter", date: "2026-07-10", kind: "burn", title: "15,638,702 LIT burned", detail: "First revenue-funded supply cut. About 6.3% of circulating supply, ~$39M at $2.54. Offset by ~7.5M LIT/yr staking emissions.", tokens: 15_638_702, usd: 39_000_000, sourceLabel: "Yahoo Finance, Jul 10 2026", sourceUrl: "https://finance.yahoo.com/markets/crypto/articles/lighter-prepares-burn-15-5-210237423.html", confidence: "verified" },
  { tokenId: "lighter", date: "2026-08-31", kind: "market", title: "August: $39.5B volume, ~927.8K LIT bought", detail: "Open interest above $1B. Robinhood Wallet perps supply ~17% of daily volume.", tokens: 927_800, sourceLabel: "CoinMarketCap, Sep 4 2026", sourceUrl: "https://coinmarketcap.com/top-stories/6a9a51627b76555961509f91/", confidence: "reported" },

  // Aster
  { tokenId: "aster", date: "2025-12-05", kind: "burn", title: "S3 burn: 77,860,328 ASTER", detail: "Half of the 155.7M S3 buyback burned to the dead address (tx 0xfda509…). The other half locked for airdrops.", tokens: 77_860_328, usd: 89_800_000, sourceLabel: "asterburn.info / BscScan", sourceUrl: "https://www.asterburn.info/", confidence: "verified" },
  { tokenId: "aster", date: "2026-02-04", kind: "policy", title: "Stage 6: up to 80% of fees", detail: "40% of daily fees auto-buy ASTER each day; the rest is discretionary.", sourceLabel: "Aster on X, Feb 4 2026", sourceUrl: "https://x.com/Aster_DEX/status/2018625536218820735", confidence: "verified" },
  { tokenId: "aster", date: "2026-02-05", kind: "burn", title: "S4+S5 burn: 98,400,345 ASTER", detail: "100% of stage 4 and 5 buybacks burned at 13:00 UTC.", tokens: 98_400_345, usd: 22_000_000, sourceLabel: "asterburn.info", sourceUrl: "https://www.asterburn.info/", confidence: "verified" },
  { tokenId: "aster", date: "2026-06-17", kind: "policy", title: "99% of fees → buybacks, matching reserve burn", detail: "Bought ASTER goes to veASTER stakers by lock weight. An equal amount burns from reserves (team first). Supply target 8B → 3B. Price +12% on the day.", sourceLabel: "KuCoin / Aster, Jun 17 2026", sourceUrl: "https://www.kucoin.com/news/flash/aster-announces-198-buyback-and-burn-update-aster-token-rises-12", confidence: "verified" },
  { tokenId: "aster", date: "2026-08-10", kind: "burn", title: "Cumulative burn reaches 188.87M ASTER", detail: "Jul 27–Aug 10: 2,851,653 ASTER bought for stakers and 2,851,653 burned from team allocation. 11.09M burned since Jun 17.", tokens: 188_867_110, sourceLabel: "Aster on X, Aug 10 2026", sourceUrl: "https://x.com/Aster_DEX/status/2086807491170717917", confidence: "verified" },

  // edgeX
  { tokenId: "edgex", date: "2026-03-31", kind: "launch", title: "EDGE TGE", detail: "140M EDGE (14%) locked one year in an audited vesting wallet.", sourceLabel: "edgeX tokenomics", sourceUrl: "https://pro.edgex.exchange/en-US/tokenomics", confidence: "verified" },
  { tokenId: "edgex", date: "2026-04-02", kind: "burn", title: "First burn: 2,528,370 EDGE", detail: "Buyback and burn starts. Burns repeat every 24 hours from fee revenue.", tokens: 2_528_370, usd: 380_000, sourceLabel: "PANews / Etherscan", sourceUrl: "https://www.panewslab.com/en/articles/019d535b-9dc3-7318-bd40-539ee5a8e045", confidence: "verified" },
  { tokenId: "edgex", date: "2026-06-02", kind: "launch", title: "edgeX V2", detail: "New matching architecture, 40+ pairs including US stocks and commodities. V2 API (Jun 17) requires a 1,000 EDGE stake.", sourceLabel: "CoinMarketCap", sourceUrl: "https://coinmarketcap.com/cmc-ai/edgex/latest-updates/", confidence: "reported" },
  { tokenId: "edgex", date: "2027-03-31", kind: "policy", title: "Ecosystem vesting begins", detail: "15% ecosystem and community allocation starts unlocking. Watch for supply pressure.", sourceLabel: "CoinMarketCap", sourceUrl: "https://coinmarketcap.com/cmc-ai/edgex/latest-updates/", confidence: "reported" },
];

// ─── Analyst notes (hand-written, dated; refresh weekly) ───────
// Keep these short and factual. Every note names its source.

export const ANALYST_NOTES_UPDATED = "2026-09-15";

export const ANALYST_NOTES: AnalystNote[] = [
  { date: "2026-09-15", tokenId: "market", text: "Perp DEXs are now a four-way race. Hyperliquid executed about 44% of on-chain perp volume in May and still leads on liquidity and users. Aster and Lighter trade the next-highest volumes; some of that is incentive-driven.", sourceLabel: "21Shares / DL News", sourceUrl: "https://www.21shares.com/en-eu/insights/the-perpetual-dex-wars-hyperliquid-aster-and-lighter-in-focus" },
  { date: "2026-09-15", tokenId: "hyperliquid", text: "The Assistance Fund holds 47.2M HYPE at a $1.30B cost basis, read directly from its spot balance. Daily buys run $1.3M to $2.1M. HYPE set an ATH of $89.60 on Sep 6 and has pulled back about 14% since.", sourceLabel: "Hyperliquid API / CoinGecko", sourceUrl: "https://hypurrscan.io/address/0xfefefefefefefefefefefefefefefefefefefefe" },
  { date: "2026-09-15", tokenId: "hyperliquid", text: "Fee flow is the thing to watch, not price. Q3 2025 buybacks were $317M, Q4 $255M, Q1 2026 $192M. The current 30-day pace is about $60M. Lower fees per dollar of market cap means a higher P/E even at flat price.", sourceLabel: "DefiLlama", sourceUrl: "https://defillama.com/protocol/hyperliquid" },
  { date: "2026-09-15", tokenId: "lighter", text: "Lighter burned 15.6M LIT (6.3% of float) on Jul 10 and now burns what it buys. August volume was $39.5B with open interest above $1B. Robinhood Wallet perps route about 17% of daily flow. LIT is up ~78% over 30 days but down ~16% this week.", sourceLabel: "CoinMarketCap, Sep 4 2026", sourceUrl: "https://coinmarketcap.com/top-stories/6a9a51627b76555961509f91/" },
  { date: "2026-09-15", tokenId: "aster", text: "Aster's June 17 change is the biggest policy shift in the group. 99% of fees now buy ASTER for stakers and reserves burn a matching amount, so each fee dollar removes roughly twice the tokens. Bought tokens are not burned; they pay stakers. Treat 'buyback' and 'burn' as separate numbers here.", sourceLabel: "KuCoin / Aster", sourceUrl: "https://www.kucoin.com/news/flash/aster-announces-198-buyback-and-burn-update-aster-token-rises-12" },
  { date: "2026-09-15", tokenId: "aster", text: "The old BSC buyback wallet (0x6648…BE0F) is retired. Buys now execute from 0xa0ed…1b60 on Aster Chain. BscScan's free API also shut down, so this page uses DefiLlama's adapter, which reads that wallet's fills.", sourceLabel: "DefiLlama methodology", sourceUrl: "https://github.com/DefiLlama/dimension-adapters/blob/master/fees/aster-spot" },
  { date: "2026-09-15", tokenId: "edgex", text: "edgeX V2 (Jun 2) moved most fees to a new adapter. The previous version of this page read only the deprecated v1 feed and understated edgeX fees about 10x. Buybacks are tracked at $46.8M all-time, but the 30-day share of fees going to buybacks is only ~13%, the lowest in the group.", sourceLabel: "DefiLlama", sourceUrl: "https://defillama.com/protocol/edgex" },
  { date: "2026-09-15", tokenId: "edgex", text: "Open interest is about $0.6B against Hyperliquid's $14.7B. EDGE sits near $0.60 with analysts flagging $0.555 as support. The 15% ecosystem allocation starts vesting Mar 31 2027.", sourceLabel: "CoinMarketCap", sourceUrl: "https://coinmarketcap.com/cmc-ai/edgex/latest-updates/" },
];

// ─── Valuation helpers ─────────────────────────────────────────

/** P/E on buyback earnings: market cap ÷ annualized holders revenue. */
export function calcPE(marketCap: number, annualizedBuybacks: number): number {
  if (annualizedBuybacks <= 0) return Infinity;
  return marketCap / annualizedBuybacks;
}

export function annualize30d(v: number | null): number | null {
  return v === null ? null : v * (365 / 30);
}

/** Buyback yield = annualized buybacks ÷ market cap (the inverse of P/E). */
export function calcBuybackYield(marketCap: number | null, annualizedBuybacks: number | null): number | null {
  if (!marketCap || annualizedBuybacks === null) return null;
  return annualizedBuybacks / marketCap;
}

/** Effective rate = buybacks ÷ fees over the same window. */
export function calcEffectiveRate(buyback30d: number | null, fees30d: number | null): number | null {
  if (buyback30d === null || !fees30d) return null;
  return Math.min(1, buyback30d / fees30d);
}

// ─── Period helpers ─────────────────────────────────────────────

export function periodKey(dateStr: string, g: TimeGranularity): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  if (g === "daily") return dateStr;
  if (g === "weekly") {
    // ISO-8601 week, Monday start.
    const t = new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const yStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const wk = Math.ceil(((t.getTime() - yStart.getTime()) / 86_400_000 + 1) / 7);
    return `${t.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
  }
  if (g === "monthly") return `${y}-${m}`;
  if (g === "quarterly") return `${y}-Q${Math.ceil((d.getUTCMonth() + 1) / 3)}`;
  return `${y}`;
}

export function aggregateDaily(
  daily: DailyBuyback[],
  g: TimeGranularity,
): { period: string; usd: number; tokens: number; txCount: number; days: number }[] {
  const map = new Map<string, { usd: number; tokens: number; txCount: number; days: number }>();
  for (const d of daily) {
    const k = periodKey(d.date, g);
    const cur = map.get(k) ?? { usd: 0, tokens: 0, txCount: 0, days: 0 };
    map.set(k, { usd: cur.usd + d.usd, tokens: cur.tokens + d.tokens, txCount: cur.txCount + d.txCount, days: cur.days + 1 });
  }
  return [...map.entries()].map(([period, v]) => ({ period, ...v })).sort((a, b) => a.period.localeCompare(b.period));
}

export function sumWindow(daily: DailyBuyback[], days: number, field: "usd" | "tokens" = "usd"): number {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  return daily.filter((d) => d.date >= cutoff).reduce((s, d) => s + d[field], 0);
}

// ─── Formatters ────────────────────────────────────────────────

export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
}

export function fmtPrice(p: number): string {
  if (p >= 100) return `$${p.toFixed(1)}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  return `$${p.toFixed(4)}`;
}

export function fmtPct(n: number, digits = 1, signed = false): string {
  const s = signed && n > 0 ? "+" : "";
  return `${s}${n.toFixed(digits)}%`;
}

// ─── Auto-commentary ───────────────────────────────────────────
// Deterministic sentences computed from live numbers, so the commentary
// is never older than the data. Tone: short, plain, no adjectives.

export interface TokenSnapshot {
  id: string;
  name: string;
  ticker: string;
  price: number | null;
  ch7d: number | null;
  ch30d: number | null;
  athChangePct: number | null;
  marketCap: number | null;
  fdv: number | null;
  fees30d: number | null;
  buyback7d: number | null;
  buyback30d: number | null;
  pe: number | null;
  buybackYield: number | null;
  effectiveRate: number | null;
}

export interface Insight {
  tokenId: string | "market";
  tone: "up" | "down" | "flat" | "note";
  text: string;
}

export function generateInsights(rows: TokenSnapshot[]): Insight[] {
  const out: Insight[] = [];
  const withPE = rows.filter((r) => r.pe !== null && isFinite(r.pe!));
  const totalBB30 = rows.reduce((s, r) => s + (r.buyback30d ?? 0), 0);
  const totalFees30 = rows.reduce((s, r) => s + (r.fees30d ?? 0), 0);

  if (totalBB30 > 0) {
    const leader = [...rows].sort((a, b) => (b.buyback30d ?? 0) - (a.buyback30d ?? 0))[0];
    const share = ((leader.buyback30d ?? 0) / totalBB30) * 100;
    out.push({
      tokenId: "market",
      tone: "note",
      text: `The four protocols bought back ${fmtCompact(totalBB30)} of their own tokens in the last 30 days on ${fmtCompact(totalFees30)} of fees. ${leader.ticker} accounts for ${share.toFixed(0)}% of that.`,
    });
  }

  if (withPE.length >= 2) {
    const sorted = [...withPE].sort((a, b) => a.pe! - b.pe!);
    const cheap = sorted[0];
    const rich = sorted[sorted.length - 1];
    out.push({
      tokenId: "market",
      tone: "note",
      text: `${cheap.ticker} is the cheapest on buyback earnings at ${cheap.pe!.toFixed(1)}x. ${rich.ticker} is the most expensive at ${rich.pe!.toFixed(1)}x. CME trades near 26x and Coinbase near 40x.`,
    });
  }

  for (const r of rows) {
    // Pace: 7-day daily average vs 30-day daily average.
    if (r.buyback7d !== null && r.buyback30d !== null && r.buyback30d > 0) {
      const pace = (r.buyback7d / 7) / (r.buyback30d / 30) - 1;
      const pct = Math.abs(pace * 100);
      if (pct >= 15) {
        out.push({
          tokenId: r.id,
          tone: pace > 0 ? "up" : "down",
          text: `${r.ticker} buybacks are ${pace > 0 ? "running" : "trailing"} the 30-day pace by ${pct.toFixed(0)}%. Last 7 days: ${fmtCompact(r.buyback7d)}, about ${fmtCompact(r.buyback7d / 7)} per day.`,
        });
      } else {
        out.push({
          tokenId: r.id,
          tone: "flat",
          text: `${r.ticker} buybacks are steady at about ${fmtCompact(r.buyback30d / 30)} per day.`,
        });
      }
    }

    // Price vs buybacks divergence.
    if (r.ch7d !== null && r.buyback7d !== null && r.buyback30d !== null && r.buyback30d > 0) {
      const pace = (r.buyback7d / 7) / (r.buyback30d / 30) - 1;
      if (r.ch7d >= 10 && pace <= -0.1) {
        out.push({ tokenId: r.id, tone: "note", text: `${r.ticker} price is up ${r.ch7d.toFixed(0)}% this week while buyback pace slowed. Price is running ahead of fee flow.` });
      } else if (r.ch7d <= -10 && pace >= 0.1) {
        out.push({ tokenId: r.id, tone: "note", text: `${r.ticker} price fell ${Math.abs(r.ch7d).toFixed(0)}% this week while buybacks accelerated. Each fee dollar now removes more tokens.` });
      }
    }

    // Yield and effective rate.
    if (r.buybackYield !== null && r.effectiveRate !== null) {
      out.push({
        tokenId: r.id,
        tone: "note",
        text: `${r.ticker} returns ${(r.buybackYield * 100).toFixed(1)}% of market cap per year through buybacks. ${(r.effectiveRate * 100).toFixed(0)}% of 30-day fees went to buybacks.`,
      });
    }

    // ATH proximity.
    if (r.athChangePct !== null && r.athChangePct > -15) {
      out.push({ tokenId: r.id, tone: "up", text: `${r.ticker} is within ${Math.abs(r.athChangePct).toFixed(0)}% of its all-time high.` });
    }
  }

  return out;
}
