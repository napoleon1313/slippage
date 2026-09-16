// ─── /api/buybacks — daily buyback series per protocol ──────────
//
// Primary feed for all four tokens: DefiLlama dailyHoldersRevenue. Each adapter
// measures fees routed to token buybacks (Hyperliquid: 99% of fees → Assistance
// Fund; Lighter: treasury LIT buys; Aster: TWAP buys by the public buyback
// wallet; edgeX: buyback allocation). This gives one consistent USD series.
//
// Hyperliquid overlay: the Assistance Fund's own fills from the Hyperliquid API
// (public, no key). Adds exact token counts and fill counts per day. Two limits:
// each call returns at most 2,000 fills (we page in 3-day windows with
// aggregateByTime and split any window that hits the cap), and the endpoint only
// serves the 10,000 most recent fills, which is roughly the last three weeks of
// fund activity. Older HYPE days fall back to USD ÷ daily close.
//
// Token counts for the other three: USD ÷ CoinGecko daily close (derived).
//
// ?days=30|90|180|365|all   (default 90)
// Cache: 1 hour.

import { NextRequest } from "next/server";
import type { BuybacksApiResponse, DailyBuyback, TokenBuybackData } from "@/lib/tokenomics";
import { TOKEN_CONFIGS } from "@/lib/tokenomics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY = 86_400_000;
const TIMEOUT = 9_000;
const HL_ASSISTANCE_FUND = "0xfefefefefefefefefefefefefefefefefefefefe";
const HL_FILL_CAP = 2000;
const HL_WINDOW = 3 * DAY;
const HL_CONCURRENCY = 4;
const HL_FILL_LOOKBACK = 25 * DAY; // the API keeps ~10,000 fills ≈ 3 weeks

function toDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function finish(
  tokenId: string,
  daily: DailyBuyback[],
  source: string,
  quality: TokenBuybackData["quality"],
  tokensDerivedFromPrice: boolean,
  error?: string,
): TokenBuybackData {
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date));
  return { tokenId, daily: sorted, source, quality, tokensDerivedFromPrice, fetchedAt: Date.now(), error };
}

// ─── DefiLlama holders revenue ──────────────────────────────────

async function fetchHoldersRevenue(slug: string, fallback: string | undefined, cutoffMs: number): Promise<{ daily: Map<string, number>; slugUsed: string }> {
  const attempt = async (s: string) => {
    const res = await fetch(`https://api.llama.fi/summary/fees/${s}?dataType=dailyHoldersRevenue`, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) throw new Error(`DefiLlama ${s} ${res.status}`);
    const j = (await res.json()) as { totalDataChart?: [number, number][] };
    const daily = new Map<string, number>();
    for (const [ts, v] of j.totalDataChart ?? []) {
      if (ts * 1000 >= cutoffMs && v > 0) daily.set(toDate(ts * 1000), v);
    }
    return { daily, slugUsed: s };
  };
  try {
    return await attempt(slug);
  } catch (e) {
    if (fallback) return attempt(fallback);
    throw e;
  }
}

// ─── CoinGecko daily prices (for token-count derivation) ────────

// Module-level last-good cache: a CoinGecko 429 degrades to yesterday's price
// history instead of dropping token counts entirely.
const priceCache = new Map<string, { at: number; prices: Map<string, number> }>();

async function fetchDailyPrices(coinGeckoId: string, days: number): Promise<Map<string, number> | null> {
  // Free tier returns daily granularity for >90 days automatically; cap at 365.
  const d = Math.min(365, Math.max(2, days));
  const url = `https://api.coingecko.com/api/v3/coins/${coinGeckoId}/market_chart?vs_currency=usd&days=${d}${d <= 90 ? "&interval=daily" : ""}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
      if (res.status === 429 && attempt === 0) { await new Promise((r) => setTimeout(r, 1500)); continue; }
      if (!res.ok) break;
      const j = (await res.json()) as { prices?: [number, number][] };
      const map = new Map<string, number>();
      for (const [ms, p] of j.prices ?? []) map.set(toDate(ms), p);
      if (map.size) { priceCache.set(coinGeckoId, { at: Date.now(), prices: map }); return map; }
      break;
    } catch {
      break;
    }
  }
  return priceCache.get(coinGeckoId)?.prices ?? null;
}

// ─── Hyperliquid fills ──────────────────────────────────────────

interface HLFill { coin: string; px: string; sz: string; side: string; time: number; tid: number; dir?: string }

async function hlWindow(startTime: number, endTime: number): Promise<HLFill[]> {
  const res = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "userFillsByTime", user: HL_ASSISTANCE_FUND, startTime, endTime, aggregateByTime: true }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`HL ${res.status}`);
  const j = await res.json();
  return Array.isArray(j) ? (j as HLFill[]) : [];
}

/** Fetch a window; if it hits the cap, split it in half and recurse. */
async function hlWindowComplete(start: number, end: number, depth = 0): Promise<{ fills: HLFill[]; truncated: boolean }> {
  const fills = await hlWindow(start, end);
  if (fills.length < HL_FILL_CAP || end - start < 3_600_000 || depth > 6) {
    return { fills, truncated: fills.length >= HL_FILL_CAP };
  }
  const mid = Math.floor((start + end) / 2);
  const [a, b] = await Promise.all([hlWindowComplete(start, mid, depth + 1), hlWindowComplete(mid, end, depth + 1)]);
  return { fills: [...a.fills, ...b.fills], truncated: a.truncated || b.truncated };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

async function fetchHyperliquidFills(cutoffMs: number, now: number): Promise<{ byDay: Map<string, { tokens: number; usd: number; tx: number }>; windows: number; fills: number; truncated: boolean; error?: string }> {
  const windows: [number, number][] = [];
  for (let t = cutoffMs; t < now; t += HL_WINDOW) windows.push([t, Math.min(t + HL_WINDOW, now)]);
  try {
    const results = await mapLimit(windows, HL_CONCURRENCY, ([s, e]) => hlWindowComplete(s, e).catch(() => ({ fills: [] as HLFill[], truncated: false })));
    const seen = new Set<number>();
    const byDay = new Map<string, { tokens: number; usd: number; tx: number }>();
    let count = 0;
    let truncated = false;
    for (const r of results) {
      truncated ||= r.truncated;
      for (const f of r.fills) {
        if (seen.has(f.tid)) continue;
        seen.add(f.tid);
        if (!(f.side === "B" || f.dir === "Buy")) continue;
        const sz = parseFloat(f.sz), px = parseFloat(f.px);
        if (!isFinite(sz) || !isFinite(px)) continue;
        count++;
        const d = toDate(f.time);
        const cur = byDay.get(d) ?? { tokens: 0, usd: 0, tx: 0 };
        byDay.set(d, { tokens: cur.tokens + sz, usd: cur.usd + sz * px, tx: cur.tx + 1 });
      }
    }
    return { byDay, windows: windows.length, fills: count, truncated };
  } catch (e) {
    return { byDay: new Map(), windows: windows.length, fills: 0, truncated: false, error: String(e) };
  }
}

// ─── Per-token assembly ─────────────────────────────────────────

async function buildToken(cfgId: string, days: number, now: number): Promise<TokenBuybackData> {
  const cfg = TOKEN_CONFIGS.find((c) => c.id === cfgId)!;
  const cutoffMs = now - days * DAY;

  let llamaDaily: Map<string, number>;
  let slugUsed: string;
  try {
    ({ daily: llamaDaily, slugUsed } = await fetchHoldersRevenue(cfg.defiLlamaSlug, cfg.defiLlamaFallbackSlug, cutoffMs));
  } catch (e) {
    return finish(cfg.id, [], `DefiLlama holders revenue failed: ${String(e)}`, "estimated", false, String(e));
  }

  if (cfg.id === "hyperliquid") {
    // Fills give exact tokens + tx per day for the recent window; DefiLlama gives
    // the USD spine; daily close fills in token counts for older days.
    const fillCutoff = Math.max(cutoffMs, now - HL_FILL_LOOKBACK);
    const [fills, prices] = await Promise.all([fetchHyperliquidFills(fillCutoff, now), fetchDailyPrices(cfg.coinGeckoId, days)]);
    const fillDates = [...fills.byDay.keys()].sort();
    const earliestFill = fillDates[0] ?? null;
    const dates = new Set<string>([...llamaDaily.keys(), ...fills.byDay.keys()]);
    const daily: DailyBuyback[] = [...dates].map((date) => {
      const f = fills.byDay.get(date);
      const usd = llamaDaily.get(date) ?? f?.usd ?? 0;
      const p = prices?.get(date);
      const tokens = f && f.tokens > 0 ? f.tokens : p ? usd / p : 0;
      return { date, usd, tokens, txCount: f?.tx ?? 0 };
    });
    const note = fills.error
      ? `fills unavailable (${fills.error})`
      : `${fills.fills.toLocaleString()} buy fills since ${earliestFill ?? "n/a"}${fills.truncated ? ", some windows truncated" : ""}`;
    return finish(
      cfg.id,
      daily,
      `USD: DefiLlama ${slugUsed} holders revenue (99% of fees → Assistance Fund). Tokens/tx: Hyperliquid API userFillsByTime for 0xfefe…fefe — ${note} (the API keeps only the 10,000 most recent fills). Earlier days: USD ÷ CoinGecko daily close.`,
      fills.fills > 0 ? "onchain" : "tracked",
      true,
      fills.error,
    );
  }

  const prices = await fetchDailyPrices(cfg.coinGeckoId, days);
  const daily: DailyBuyback[] = [...llamaDaily.entries()].map(([date, usd]) => {
    const p = prices?.get(date);
    return { date, usd, tokens: p ? usd / p : 0, txCount: 0 };
  });

  const sourceByToken: Record<string, string> = {
    lighter: "DefiLlama lighter holders revenue — treasury LIT buybacks measured by the adapter",
    aster: "DefiLlama aster holders revenue — ASTERUSDT buy fills by the public buyback wallet 0xa0ed…1b60 on Aster Chain (burns before Feb 2 2026)",
    edgex: "DefiLlama edgex holders revenue — EDGE buyback allocation (v1 + v2)",
  };
  return finish(
    cfg.id,
    daily,
    `${sourceByToken[cfg.id] ?? `DefiLlama ${slugUsed} holders revenue`}. Token counts = USD ÷ CoinGecko daily close${prices ? "" : " (price history unavailable, tokens omitted)"}.`,
    "tracked",
    true,
  );
}

// ─── Handler ────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("days") ?? "90";
  const days = raw === "all" ? 730 : Math.min(730, Math.max(7, parseInt(raw) || 90));
  const now = Date.now();

  const data = await Promise.all(TOKEN_CONFIGS.map((c) => buildToken(c.id, days, now)));

  return Response.json(
    { data, days, fetchedAt: now } satisfies BuybacksApiResponse,
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
