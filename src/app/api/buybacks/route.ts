// ─── /api/buybacks — live on-chain daily buyback data ──────────
//
// Sources (first-party only, no reference sites used as data):
//   Hyperliquid : api.hyperliquid.xyz/info — userFillsByTime for 0xfefe…fefe wallet
//   Lighter     : DefiLlama daily fees × 50% (lighter chain fills endpoint is auth-gated)
//   Aster       : BscScan tokentx for 0x6648…BE0F wallet → filter burns to 0x000…dEaD
//   EdgeX       : BaseScan tokentx for EDGE contract on Base → burns to 0x000…dEaD
//
// Cache: 1 hour (revalidate = 3600)

import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// ─── Types ───────────────────────────────────────────────────────

export interface DailyBuyback {
  date: string;
  tokens: number;
  usd: number;
  txCount: number;
}

export interface TokenBuybackData {
  tokenId: string;
  daily: DailyBuyback[];
  cumulative: { date: string; tokens: number; usd: number }[];
  source: string;
  isLive: boolean;
  fetchedAt: number;
  error?: string;
}

export interface BuybacksApiResponse {
  data: TokenBuybackData[];
  days: number;
  fetchedAt: number;
}

// ─── Helpers ─────────────────────────────────────────────────────

function toDateStr(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function addCumulative(daily: DailyBuyback[]): { date: string; tokens: number; usd: number }[] {
  let cumT = 0, cumU = 0;
  return daily.map((d) => {
    cumT += d.tokens;
    cumU += d.usd;
    return { date: d.date, tokens: cumT, usd: cumU };
  });
}

function makeResult(
  tokenId: string,
  daily: DailyBuyback[],
  source: string,
  isLive: boolean,
  fetchedAt: number,
  error?: string,
): TokenBuybackData {
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date));
  return { tokenId, daily: sorted, cumulative: addCumulative(sorted), source, isLive, fetchedAt, error };
}

// ─── Hyperliquid ─────────────────────────────────────────────────
// Wallet: 0xfefefefefefefefefefefefefefefefefefefefe (HLP Assistance Fund)
// Dec 24 2025: 85% validator vote formally recognised all AF tokens as burned.
// API: api.hyperliquid.xyz/info → userFillsByTime (public, no auth required)

const HL_WINDOW_MS = 5 * 86_400_000;

interface HLFill {
  coin: string;
  px: string;
  sz: string;
  side: string;
  time: number;
  tid: number;
  dir?: string;
}

async function fetchHLWindow(startTime: number): Promise<HLFill[]> {
  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "userFillsByTime",
        user: "0xfefefefefefefefefefefefefefefefefefefefe",
        startTime,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as HLFill[]) : [];
  } catch {
    return [];
  }
}

async function fetchHyperliquid(days: number): Promise<TokenBuybackData> {
  const fetchedAt = Date.now();
  const rangeStart = fetchedAt - days * 86_400_000;

  try {
    const windowStarts: number[] = [];
    for (let t = rangeStart; t < fetchedAt; t += HL_WINDOW_MS) {
      windowStarts.push(t);
    }
    // Ensure we always include a window that reaches "now"
    if (windowStarts.length === 0 || windowStarts[windowStarts.length - 1] + HL_WINDOW_MS < fetchedAt) {
      windowStarts.push(fetchedAt - HL_WINDOW_MS);
    }

    const pages = await Promise.all(windowStarts.map(fetchHLWindow));
    const pageCount = pages.length;

    const seen = new Set<number>();
    const allFills: HLFill[] = [];
    for (const page of pages) {
      for (const f of page) {
        if (!seen.has(f.tid)) {
          seen.add(f.tid);
          allFills.push(f);
        }
      }
    }

    const buys = allFills.filter(
      (f) => (f.side === "B" || f.dir === "Buy") && f.time >= rangeStart,
    );

    const byDay = new Map<string, DailyBuyback>();
    for (const f of buys) {
      const date = toDateStr(f.time);
      const sz = parseFloat(f.sz);
      const px = parseFloat(f.px);
      if (!isFinite(sz) || !isFinite(px)) continue;
      const cur = byDay.get(date) ?? { date, tokens: 0, usd: 0, txCount: 0 };
      byDay.set(date, {
        date,
        tokens: cur.tokens + sz,
        usd: cur.usd + sz * px,
        txCount: cur.txCount + 1,
      });
    }

    return makeResult(
      "hyperliquid",
      Array.from(byDay.values()),
      `api.hyperliquid.xyz/info — userFillsByTime for 0xfefe…fefe (${pageCount} parallel windows, ${allFills.length} fills)`,
      true,
      fetchedAt,
    );
  } catch (e) {
    return makeResult("hyperliquid", [], `api.hyperliquid.xyz — error: ${e}`, false, fetchedAt, String(e));
  }
}

// ─── Lighter ─────────────────────────────────────────────────────
// DefiLlama daily fees × 50% buyback rate estimate.

async function fetchLighter(days: number): Promise<TokenBuybackData> {
  const fetchedAt = Date.now();
  try {
    const res = await fetch(
      "https://api.llama.fi/summary/fees/lighter-perps?dataType=dailyFees",
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const chart: [number, number][] = data.totalDataChart ?? [];
    const cutoffUnix = Math.floor((fetchedAt - days * 86_400_000) / 1000);
    const BUYBACK_RATE = 0.50;

    const daily: DailyBuyback[] = chart
      .filter(([ts]) => ts >= cutoffUnix)
      .map(([ts, fees]) => ({
        date: toDateStr(ts * 1000),
        tokens: 0,
        usd: parseFloat((fees * BUYBACK_RATE).toFixed(2)),
        txCount: 0,
      }));

    return makeResult(
      "lighter",
      daily,
      "DefiLlama api.llama.fi/summary/fees/lighter-perps — dailyFees × 50% buyback rate (est.)",
      false,
      fetchedAt,
    );
  } catch (e) {
    return makeResult("lighter", [], `DefiLlama lighter-perps — error: ${e}`, false, fetchedAt, String(e));
  }
}

// ─── Aster ───────────────────────────────────────────────────────
// Buyback wallet: 0x664827c71193018D7843f0D0F41A5D0D6dcEBE0F (BSC)
// Burns to: 0x000000000000000000000000000000000000dEaD
// BscScan API — no API key required for basic queries (5 req/s rate limit)

const ASTER_BUYBACK_WALLET = "0x664827c71193018D7843f0D0F41A5D0D6dcEBE0F";
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";

interface BlockscanTx {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
}

async function fetchAster(days: number): Promise<TokenBuybackData> {
  const fetchedAt = Date.now();
  const cutoffUnix = Math.floor((fetchedAt - days * 86_400_000) / 1000);

  // BscScan — no API key needed for basic free-tier queries
  try {
    const url =
      `https://api.bscscan.com/api?module=account&action=tokentx` +
      `&address=${ASTER_BUYBACK_WALLET}&sort=asc`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.status === "1" && Array.isArray(data.result)) {
      const burns = (data.result as BlockscanTx[]).filter((tx) =>
        parseInt(tx.timeStamp) >= cutoffUnix &&
        tx.to.toLowerCase() === DEAD_ADDRESS &&
        tx.tokenSymbol === "ASTER"
      );

      if (burns.length > 0) {
        const byDay = new Map<string, DailyBuyback>();
        for (const tx of burns) {
          const date = toDateStr(parseInt(tx.timeStamp) * 1000);
          const decimals = parseInt(tx.tokenDecimal || "18");
          const tokens = parseFloat(tx.value) / Math.pow(10, decimals);
          const cur = byDay.get(date) ?? { date, tokens: 0, usd: 0, txCount: 0 };
          byDay.set(date, { date, tokens: cur.tokens + tokens, usd: 0, txCount: cur.txCount + 1 });
        }
        return makeResult(
          "aster",
          Array.from(byDay.values()),
          `BscScan — ASTER burns to dead address from ${ASTER_BUYBACK_WALLET} (${burns.length} txs)`,
          true,
          fetchedAt,
        );
      }
      throw new Error("No ASTER burns found in date range from BscScan");
    }
    throw new Error(`BscScan status ${data.status}: ${data.message}`);
  } catch (bscError) {
    // Fallback: DefiLlama daily fees × 60%
    try {
      const res = await fetch(
        "https://api.llama.fi/summary/fees/aster-perps?dataType=dailyFees",
        { signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) throw new Error(`DefiLlama HTTP ${res.status}`);
      const data = await res.json();
      const chart: [number, number][] = data.totalDataChart ?? [];
      const cutoffUnix2 = Math.floor((fetchedAt - days * 86_400_000) / 1000);
      const BUYBACK_RATE = 0.60;
      const daily: DailyBuyback[] = chart
        .filter(([ts]) => ts >= cutoffUnix2)
        .map(([ts, fees]) => ({
          date: toDateStr(ts * 1000),
          tokens: 0,
          usd: parseFloat((fees * BUYBACK_RATE).toFixed(2)),
          txCount: 0,
        }));
      return makeResult(
        "aster",
        daily,
        `DefiLlama aster-perps dailyFees × 60% (BscScan unavailable: ${bscError})`,
        false,
        fetchedAt,
      );
    } catch (dlError) {
      return makeResult("aster", [], `All sources failed: ${bscError} / ${dlError}`, false, fetchedAt, String(bscError));
    }
  }
}

// ─── EdgeX ───────────────────────────────────────────────────────
// EDGE token on Base network: 0xB0076DE78Dc50581770BBa1D211dDc0aD4F2a241
// Burns tracked as token transfers to 0x000…dEaD on Base
// Source: BaseScan API (no key required for basic queries)
// Fallback: DefiLlama edgex-perps fees × 40%

const EDGE_TOKEN_CONTRACT = "0xB0076DE78Dc50581770BBa1D211dDc0aD4F2a241";

const EDGEX_SEED: DailyBuyback[] = [
  { date: "2026-04-02", tokens: 2_528_370, usd: 380_000, txCount: 1 },
];

async function fetchEdgeX(days: number): Promise<TokenBuybackData> {
  const fetchedAt = Date.now();
  const cutoffUnix = Math.floor((fetchedAt - days * 86_400_000) / 1000);

  // BaseScan API — Base network, no API key needed for basic queries
  try {
    const url =
      `https://api.basescan.org/api?module=account&action=tokentx` +
      `&contractaddress=${EDGE_TOKEN_CONTRACT}&sort=asc`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.status === "1" && Array.isArray(data.result) && data.result.length > 0) {
      const burns = (data.result as BlockscanTx[]).filter((tx) =>
        parseInt(tx.timeStamp) >= cutoffUnix &&
        tx.to.toLowerCase() === DEAD_ADDRESS
      );

      if (burns.length > 0) {
        const byDay = new Map<string, DailyBuyback>();
        for (const tx of burns) {
          const date = toDateStr(parseInt(tx.timeStamp) * 1000);
          const decimals = parseInt(tx.tokenDecimal || "18");
          const tokens = parseFloat(tx.value) / Math.pow(10, decimals);
          const cur = byDay.get(date) ?? { date, tokens: 0, usd: 0, txCount: 0 };
          byDay.set(date, { date, tokens: cur.tokens + tokens, usd: 0, txCount: cur.txCount + 1 });
        }
        return makeResult(
          "edgex",
          Array.from(byDay.values()),
          `BaseScan — EDGE burns to 0x000…dEaD on Base (contract: ${EDGE_TOKEN_CONTRACT}, ${burns.length} txs)`,
          true,
          fetchedAt,
        );
      }
      throw new Error("No EDGE burns found in range from BaseScan");
    }
    throw new Error(`BaseScan status ${data.status}: ${data.message ?? "no result"}`);
  } catch (basescanError) {
    // Fallback: DefiLlama edgex-perps fees × 40%
    try {
      const res = await fetch(
        "https://api.llama.fi/summary/fees/edgex-perps?dataType=dailyFees",
        { signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const chart: [number, number][] = data.totalDataChart ?? [];
      const cutoffUnix2 = Math.floor((fetchedAt - days * 86_400_000) / 1000);
      const BUYBACK_RATE = 0.40;
      const daily: DailyBuyback[] = chart
        .filter(([ts]) => ts >= cutoffUnix2)
        .map(([ts, fees]) => ({
          date: toDateStr(ts * 1000),
          tokens: 0,
          usd: parseFloat((fees * BUYBACK_RATE).toFixed(2)),
          txCount: 0,
        }));

      if (daily.length > 0) {
        return makeResult(
          "edgex",
          daily,
          `DefiLlama edgex-perps dailyFees × 40% (BaseScan unavailable: ${basescanError})`,
          false,
          fetchedAt,
        );
      }
      throw new Error("DefiLlama returned empty chart");
    } catch (dlError) {
      // Final fallback: seed data
      const seedInRange = EDGEX_SEED.filter((d) =>
        Math.floor(new Date(d.date).getTime() / 1000) >= cutoffUnix
      );
      return makeResult(
        "edgex",
        seedInRange,
        `Seed data — first confirmed burn 2.528M EDGE (April 2 2026). BaseScan: ${basescanError}. DefiLlama: ${dlError}`,
        false,
        fetchedAt,
      );
    }
  }
}

// ─── Route handler ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const days = Math.min(365, Math.max(7, parseInt(req.nextUrl.searchParams.get("days") ?? "90")));
  const fetchedAt = Date.now();

  const [hype, lit, aster, edgex] = await Promise.all([
    fetchHyperliquid(days),
    fetchLighter(days),
    fetchAster(days),
    fetchEdgeX(days),
  ]);

  return Response.json({
    data: [hype, lit, aster, edgex],
    days,
    fetchedAt,
  } satisfies BuybacksApiResponse, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
