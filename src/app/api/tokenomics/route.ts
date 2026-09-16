// ─── /api/tokenomics — live market + fee + buyback summary ──────
//
// Sources
//   CoinGecko  : price, supply, market cap, FDV, 24h/7d/30d change, ATH, volume
//   DefiLlama  : fees (7d/30d + 90 daily points), revenue, holders revenue
//                (= fees routed to buybacks) with all-time total
//   Hyperliquid: Assistance Fund spot balance → tokens held + USD cost basis
//
// Cache: 5 minutes (ISR). Every upstream failure degrades to null + an error
// string rather than failing the whole response.

import { NextResponse } from "next/server";
import { TOKEN_CONFIGS } from "@/lib/tokenomics";
import type { LiveTokenData, TokenConfig } from "@/lib/tokenomics";

// Served dynamically so a bad upstream minute is not cached for 5 minutes.
// The CDN cache window below is 5 min on a clean response, 1 min with warnings.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TIMEOUT = 9_000;
const HL_ASSISTANCE_FUND = "0xfefefefefefefefefefefefefefefefefefefefe";

type LlamaSummary = {
  totalDataChart?: [number, number][];
  totalAllTime?: number;
  total7d?: number;
  total30d?: number;
};

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

// ─── CoinGecko ──────────────────────────────────────────────────
// One batched /coins/markets call for all tokens (1 request instead of 4) and a
// module-level last-good cache so a 429 degrades to slightly stale prices
// instead of blanks. The cache lives for the life of the serverless instance.

type CGMarket = {
  id: string;
  current_price?: number;
  price_change_percentage_24h_in_currency?: number;
  price_change_percentage_7d_in_currency?: number;
  price_change_percentage_30d_in_currency?: number;
  ath?: number;
  ath_date?: string;
  ath_change_percentage?: number;
  total_volume?: number;
  market_cap_rank?: number;
  circulating_supply?: number;
  total_supply?: number;
  market_cap?: number;
  fully_diluted_valuation?: number;
};

type CGSlice = {
  price: number | null; priceChange24h: number | null; priceChange7d: number | null; priceChange30d: number | null;
  ath: number | null; athDate: string | null; athChangePct: number | null; volume24h: number | null; marketCapRank: number | null;
  circulatingSupply: number | null; totalSupply: number | null; marketCap: number | null; fdv: number | null;
  stale?: boolean; error?: string;
};

const CG_EMPTY: CGSlice = {
  price: null, priceChange24h: null, priceChange7d: null, priceChange30d: null,
  ath: null, athDate: null, athChangePct: null, volume24h: null, marketCapRank: null,
  circulatingSupply: null, totalSupply: null, marketCap: null, fdv: null,
};

const cgLastGood = new Map<string, { at: number; data: CGSlice }>();

function toSlice(m: CGMarket): CGSlice {
  return {
    price: m.current_price ?? null,
    priceChange24h: m.price_change_percentage_24h_in_currency ?? null,
    priceChange7d: m.price_change_percentage_7d_in_currency ?? null,
    priceChange30d: m.price_change_percentage_30d_in_currency ?? null,
    ath: m.ath ?? null,
    athDate: m.ath_date ?? null,
    athChangePct: m.ath_change_percentage ?? null,
    volume24h: m.total_volume ?? null,
    marketCapRank: m.market_cap_rank ?? null,
    circulatingSupply: m.circulating_supply ?? null,
    totalSupply: m.total_supply ?? null,
    marketCap: m.market_cap ?? null,
    fdv: m.fully_diluted_valuation ?? null,
  };
}

async function fetchCoinGeckoBatch(ids: string[]): Promise<Map<string, CGSlice>> {
  const out = new Map<string, CGSlice>();
  let err: string | null = null;
  try {
    const rows = await getJson<CGMarket[]>(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.join(",")}&price_change_percentage=24h,7d,30d&precision=full`,
    );
    for (const m of rows) {
      const slice = toSlice(m);
      cgLastGood.set(m.id, { at: Date.now(), data: slice });
      out.set(m.id, slice);
    }
  } catch (e) {
    err = String(e);
  }
  for (const id of ids) {
    if (out.has(id)) continue;
    const cached = cgLastGood.get(id);
    if (cached) {
      out.set(id, { ...cached.data, stale: true, error: `CoinGecko ${err ?? "missing"}; showing cached prices from ${new Date(cached.at).toISOString().slice(11, 16)} UTC` });
    } else {
      out.set(id, { ...CG_EMPTY, error: `CoinGecko ${id}: ${err ?? "not in response"}` });
    }
  }
  return out;
}

// ─── DefiLlama ──────────────────────────────────────────────────

function sumLast(chart: [number, number][] | undefined, n: number): number | null {
  if (!Array.isArray(chart) || chart.length === 0) return null;
  return chart.slice(-n).reduce((s, [, v]) => s + (v || 0), 0);
}

async function llama(slug: string, dataType: string, fallbackSlug?: string): Promise<LlamaSummary | null> {
  const url = (s: string) => `https://api.llama.fi/summary/fees/${s}?dataType=${dataType}`;
  try {
    return await getJson<LlamaSummary>(url(slug));
  } catch {
    if (!fallbackSlug) return null;
    try {
      return await getJson<LlamaSummary>(url(fallbackSlug));
    } catch {
      return null;
    }
  }
}

async function fetchDefiLlama(cfg: TokenConfig) {
  const errors: string[] = [];
  const [fees, revenue, holders] = await Promise.all([
    llama(cfg.defiLlamaSlug, "dailyFees", cfg.defiLlamaFallbackSlug),
    llama(cfg.defiLlamaSlug, "dailyRevenue", cfg.defiLlamaFallbackSlug),
    llama(cfg.defiLlamaSlug, "dailyHoldersRevenue", cfg.defiLlamaFallbackSlug),
  ]);
  if (!fees) errors.push(`DefiLlama fees (${cfg.defiLlamaSlug}) unavailable`);
  if (!revenue) errors.push(`DefiLlama revenue (${cfg.defiLlamaSlug}) unavailable`);
  if (!holders) errors.push(`DefiLlama holders revenue (${cfg.defiLlamaSlug}) unavailable`);

  const feesChart = fees?.totalDataChart ?? [];
  const holdersChart = holders?.totalDataChart ?? [];
  const firstTracked = holdersChart.find(([, v]) => v > 0);

  return {
    fees7d: sumLast(feesChart, 7),
    fees30d: sumLast(feesChart, 30),
    // Aster's parent slug has no dailyRevenue; holders revenue is the closest measure.
    revenue30d: sumLast(revenue?.totalDataChart, 30) ?? sumLast(holdersChart, 30),
    buyback7d: sumLast(holdersChart, 7),
    buyback30d: sumLast(holdersChart, 30),
    buybackAllTime: holders?.totalAllTime ?? (holdersChart.length ? holdersChart.reduce((s, [, v]) => s + (v || 0), 0) : null),
    buybackTrackedSince: firstTracked ? new Date(firstTracked[0] * 1000).toISOString().slice(0, 10) : null,
    feesDaily: feesChart.slice(-90).map(([ts, v]) => [new Date(ts * 1000).toISOString().slice(0, 10), v || 0] as [string, number]),
    errors,
  };
}

// ─── Hyperliquid Assistance Fund balance ────────────────────────

async function fetchAssistanceFund(): Promise<{ tokens: number | null; costBasis: number | null; error?: string }> {
  try {
    const j = await getJson<{ balances?: { coin: string; total: string; entryNtl: string }[] }>(
      "https://api.hyperliquid.xyz/info",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "spotClearinghouseState", user: HL_ASSISTANCE_FUND }) },
    );
    const hype = j.balances?.find((b) => b.coin === "HYPE");
    if (!hype) throw new Error("HYPE balance missing");
    return { tokens: parseFloat(hype.total), costBasis: parseFloat(hype.entryNtl) };
  } catch (e) {
    return { tokens: null, costBasis: null, error: `Hyperliquid spotClearinghouseState: ${String(e)}` };
  }
}

// ─── Handler ────────────────────────────────────────────────────

export async function GET() {
  const fund = fetchAssistanceFund();
  const cgBatch = fetchCoinGeckoBatch(TOKEN_CONFIGS.map((c) => c.coinGeckoId));

  const results = await Promise.all(
    TOKEN_CONFIGS.map(async (cfg): Promise<LiveTokenData> => {
      const [cgMap, dl] = await Promise.all([cgBatch, fetchDefiLlama(cfg)]);
      const cg = cgMap.get(cfg.coinGeckoId) ?? CG_EMPTY;
      const errors: string[] = [...dl.errors];
      if (cg.error) errors.push(cg.error);

      let onChainTokensHeld: number | null = null;
      let onChainCostBasisUsd: number | null = null;
      if (cfg.id === "hyperliquid") {
        const f = await fund;
        onChainTokensHeld = f.tokens;
        onChainCostBasisUsd = f.costBasis;
        if (f.error) errors.push(f.error);
      }

      return {
        tokenId: cfg.id,
        price: cg.price,
        priceChange24h: cg.priceChange24h,
        priceChange7d: cg.priceChange7d,
        priceChange30d: cg.priceChange30d,
        ath: cg.ath,
        athDate: cg.athDate,
        athChangePct: cg.athChangePct,
        volume24h: cg.volume24h,
        marketCapRank: cg.marketCapRank,
        circulatingSupply: cg.circulatingSupply,
        totalSupply: cg.totalSupply,
        marketCap: cg.marketCap,
        fdv: cg.fdv,
        fees7d: dl.fees7d,
        fees30d: dl.fees30d,
        revenue30d: dl.revenue30d,
        buyback7d: dl.buyback7d,
        buyback30d: dl.buyback30d,
        buybackAllTime: dl.buybackAllTime,
        buybackTrackedSince: dl.buybackTrackedSince,
        feesDaily: dl.feesDaily,
        onChainTokensHeld,
        onChainCostBasisUsd,
        fetchedAt: Date.now(),
        errors,
      };
    }),
  );

  const hasWarnings = results.some((r) => r.errors.length > 0);
  return NextResponse.json(
    { data: results, fetchedAt: Date.now() },
    { headers: { "Cache-Control": hasWarnings ? "public, s-maxage=60, stale-while-revalidate=300" : "public, s-maxage=300, stale-while-revalidate=900" } },
  );
}
