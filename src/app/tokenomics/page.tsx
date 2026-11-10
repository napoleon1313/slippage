"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ComposedChart, BarChart, LineChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, Legend,
} from "recharts";
import {
  TOKEN_CONFIGS, TRADFI_COMPS, MILESTONES, REPORTED_TOTALS, ANALYST_NOTES, ANALYST_NOTES_UPDATED,
  calcPE, calcBuybackYield, calcEffectiveRate, annualize30d, aggregateDaily, periodKey, sumWindow,
  fmtCompact, fmtTokens, fmtPrice, fmtPct, generateInsights,
  type LiveTokenData, type TimeGranularity, type TokenomicsApiResponse,
  type TokenBuybackData, type BuybacksApiResponse, type TokenSnapshot, type Insight,
} from "@/lib/tokenomics";

// ─── Constants ────────────────────────────────────────────────

const LIVE_REFRESH_MS = 5 * 60_000;     // /api/tokenomics
const BUYBACK_REFRESH_MS = 60 * 60_000; // /api/buybacks
const HISTORY_DAYS = 730;

const TOOLTIP_STYLE = {
  contentStyle: { background: "#111827", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", fontSize: "12px", color: "#fff" },
  labelStyle: { color: "#e5e7eb", fontWeight: 600, marginBottom: "4px" },
  itemStyle: { color: "#fff" },
  cursor: { fill: "rgba(255,255,255,0.04)" },
};
const CHART_AXIS = { fill: "var(--text-secondary)", fontSize: 11 };
const CHART_GRID = { strokeDasharray: "3 3", stroke: "var(--border)" };

const card = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "8px", padding: "16px" } as const;
const section = { ...card, marginBottom: "24px" } as const;
const labelStyle = { fontSize: "11px", color: "var(--text-secondary)", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: "2px" };
const subtle = { fontSize: "11px", color: "var(--text-secondary)" } as const;

// ─── Small helpers / atoms ────────────────────────────────────

function fmt$(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : fmtCompact(n);
}
function fmtPE(pe: number | null): string {
  return pe === null || !isFinite(pe) || isNaN(pe) ? "N/A" : `${pe.toFixed(1)}x`;
}
function tickerOf(id: string): string {
  return TOKEN_CONFIGS.find((c) => c.id === id)?.ticker ?? id;
}
function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}
function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Skeleton({ w = "80px" }: { w?: string }) {
  return <span style={{ display: "inline-block", width: w, height: "14px", borderRadius: "4px", background: "var(--border)", animation: "pulse 1.5s ease-in-out infinite", verticalAlign: "middle" }} />;
}

function ChangeBadge({ v, label }: { v: number | null; label: string }) {
  const color = v === null ? "var(--text-secondary)" : v > 0 ? "#4ade80" : v < 0 ? "#f87171" : "var(--text-secondary)";
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ ...subtle, fontSize: "10px" }}>{label}</div>
      <div style={{ fontSize: "13px", fontWeight: 600, color }}>{v === null ? "—" : fmtPct(v, 1, true)}</div>
    </div>
  );
}

function QualityBadge({ q }: { q: "onchain" | "tracked" | "estimated" }) {
  const map = {
    onchain: { label: "ON-CHAIN", color: "#4ade80" },
    tracked: { label: "TRACKED", color: "#60a5fa" },
    estimated: { label: "ESTIMATE", color: "#f59e0b" },
  }[q];
  return <span style={{ fontSize: "9px", padding: "1px 6px", borderRadius: "999px", fontWeight: 700, background: map.color + "22", color: map.color, letterSpacing: "0.05em" }}>{map.label}</span>;
}

function PillGroup<T extends string>({ options, value, onChange }: { options: { label: string; value: T }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: value === o.value ? 600 : 400,
          background: value === o.value ? "#2563eb" : "var(--bg-secondary)", color: value === o.value ? "#fff" : "var(--text-secondary)",
          border: `1px solid ${value === o.value ? "#2563eb" : "var(--border)"}`, cursor: "pointer",
        }}>{o.label}</button>
      ))}
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: on ? 600 : 400,
      background: on ? "#7c3aed" : "var(--bg-secondary)", color: on ? "#fff" : "var(--text-secondary)",
      border: `1px solid ${on ? "#7c3aed" : "var(--border)"}`, cursor: "pointer", whiteSpace: "nowrap",
    }}>{children}</button>
  );
}

function SectionHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
      <div>
        <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{title}</h2>
        {subtitle && <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px", maxWidth: "820px" }}>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

function Sparkline({ data, color }: { data: [string, number][]; color: string }) {
  const rows = data.map(([d, v]) => ({ d, v }));
  if (rows.length < 2) return null;
  return (
    <ResponsiveContainer width="100%" height={36}>
      <LineChart data={rows} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [fmtCompact(v as number), "Fees"]} labelFormatter={(l) => String(l)} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function TokenomicsPage() {
  // Live data + refresh bookkeeping
  const [live, setLive] = useState<LiveTokenData[] | null>(null);
  const [liveAt, setLiveAt] = useState<number | null>(null);
  const [liveErr, setLiveErr] = useState<string | null>(null);
  const [buybacks, setBuybacks] = useState<TokenBuybackData[] | null>(null);
  const [buybacksAt, setBuybacksAt] = useState<number | null>(null);
  const [buybacksLoading, setBuybacksLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const liveTimer = useRef<number | null>(null);

  // View state
  const [valuationBasis, setValuationBasis] = useState<"mcap" | "fdv">("mcap");
  const [liveWindow, setLiveWindow] = useState<"30" | "60" | "90" | "180">("90");
  const [liveMetric, setLiveMetric] = useState<"usd" | "tokens">("usd");
  const [liveCumulative, setLiveCumulative] = useState(true);
  const [histGranularity, setHistGranularity] = useState<TimeGranularity>("monthly");
  const [histMetric, setHistMetric] = useState<"usd" | "tokens" | "pct_circ">("usd");
  const [histCumulative, setHistCumulative] = useState(false);
  const [histMilestones, setHistMilestones] = useState(true);
  const [supplyBasis, setSupplyBasis] = useState<"circ" | "total">("circ");
  const [noteFilter, setNoteFilter] = useState<string>("all");
  const [timelineFilter, setTimelineFilter] = useState<string>("all");

  const fetchLive = useCallback(async () => {
    try {
      const r = await fetch("/api/tokenomics", { cache: "no-store" });
      const d: TokenomicsApiResponse = await r.json();
      // Keep the last non-null value per field so an upstream hiccup never blanks the page.
      setLive((prev) => d.data.map((row) => {
        const old = prev?.find((p) => p.tokenId === row.tokenId);
        if (!old) return row;
        const oldRec = old as unknown as Record<string, unknown>;
        const merged = { ...row } as unknown as Record<string, unknown>;
        for (const [k, v] of Object.entries(row)) {
          if (v === null && oldRec[k] !== null && k !== "errors") merged[k] = oldRec[k];
        }
        return merged as unknown as LiveTokenData;
      }));
      setLiveAt(Date.now());
      setLiveErr(null);
    } catch (e) {
      setLiveErr(String(e));
    }
  }, []);

  const fetchBuybacks = useCallback(async () => {
    setBuybacksLoading(true);
    try {
      const r = await fetch(`/api/buybacks?days=${HISTORY_DAYS}`, { cache: "no-store" });
      const d: BuybacksApiResponse = await r.json();
      setBuybacks(d.data);
      setBuybacksAt(Date.now());
    } catch {
      setBuybacks(null);
    } finally {
      setBuybacksLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLive();
    fetchBuybacks();
    const a = window.setInterval(fetchLive, LIVE_REFRESH_MS);
    const b = window.setInterval(fetchBuybacks, BUYBACK_REFRESH_MS);
    const c = window.setInterval(() => setNow(Date.now()), 1000);
    liveTimer.current = a;
    return () => { clearInterval(a); clearInterval(b); clearInterval(c); };
  }, [fetchLive, fetchBuybacks]);

  const loading = live === null && liveErr === null;

  // ── Derived per-token rows ─────────────────────────────────
  const rows = useMemo(() => TOKEN_CONFIGS.map((cfg) => {
    const l = live?.find((d) => d.tokenId === cfg.id) ?? null;
    const bb = buybacks?.find((b) => b.tokenId === cfg.id) ?? null;
    const reported = REPORTED_TOTALS.find((r) => r.tokenId === cfg.id)!;
    const circ = l?.circulatingSupply ?? cfg.circulatingSupply;
    const total = l?.totalSupply ?? cfg.totalSupply;
    const mcap = l?.marketCap ?? null;
    const fdv = l?.fdv ?? null;
    const valuation = valuationBasis === "mcap" ? mcap : fdv;
    const annBB = annualize30d(l?.buyback30d ?? null);
    const annFees = annualize30d(l?.fees30d ?? null);
    const pe = valuation !== null && annBB !== null ? calcPE(valuation, annBB) : null;
    const ps = valuation !== null && annFees ? valuation / annFees : null;
    const effRate = calcEffectiveRate(l?.buyback30d ?? null, l?.fees30d ?? null);
    const bbYield = calcBuybackYield(valuation, annBB);

    // Tokens removed: live where possible, else reported + tracked increments.
    let tokensRemoved: number | null = null;
    let tokensRemovedNote = "";
    if (cfg.id === "hyperliquid" && l?.onChainTokensHeld) {
      tokensRemoved = l.onChainTokensHeld;
      tokensRemovedNote = "Assistance Fund spot balance, on-chain";
    } else if (bb && bb.daily.some((d) => d.tokens > 0)) {
      const since = cfg.id === "lighter" ? "2026-09-30" : cfg.id === "aster" ? "2026-08-10" : "1970-01-01";
      const inc = bb.daily.filter((d) => d.date > since).reduce((s, d) => s + d.tokens, 0);
      const base = cfg.id === "edgex" ? 0 : (reported.tokensRemoved ?? 0);
      tokensRemoved = base + inc;
      tokensRemovedNote = cfg.id === "edgex"
        ? "Tracked buybacks ÷ daily price since Apr 2026"
        : `${reported.tokensRemovedLabel.split(".")[0]} + tracked buys since`;
    } else if (reported.tokensRemoved) {
      tokensRemoved = reported.tokensRemoved;
      tokensRemovedNote = reported.tokensRemovedLabel;
    }

    const usdAllTime = cfg.id === "hyperliquid" && l?.onChainCostBasisUsd ? l.onChainCostBasisUsd : (l?.buybackAllTime ?? null);
    const usdAllTimeNote = cfg.id === "hyperliquid" && l?.onChainCostBasisUsd
      ? "Fund cost basis, on-chain"
      : l?.buybackTrackedSince ? `DefiLlama, tracked since ${l.buybackTrackedSince}` : "";

    return { cfg, l, bb, reported, circ, total, mcap, fdv, valuation, annBB, annFees, pe, ps, effRate, bbYield, tokensRemoved, tokensRemovedNote, usdAllTime, usdAllTimeNote };
  }), [live, buybacks, valuationBasis]);

  // ── Insights ───────────────────────────────────────────────
  const insights: Insight[] = useMemo(() => {
    if (!live) return [];
    const snaps: TokenSnapshot[] = rows.map((r) => ({
      id: r.cfg.id, name: r.cfg.name, ticker: r.cfg.ticker,
      price: r.l?.price ?? null, ch7d: r.l?.priceChange7d ?? null, ch30d: r.l?.priceChange30d ?? null,
      athChangePct: r.l?.athChangePct ?? null, marketCap: r.mcap, fdv: r.fdv, fees30d: r.l?.fees30d ?? null,
      buyback7d: r.l?.buyback7d ?? null, buyback30d: r.l?.buyback30d ?? null,
      pe: r.pe !== null && isFinite(r.pe) ? r.pe : null, buybackYield: r.bbYield, effectiveRate: r.effRate,
    }));
    return generateInsights(snaps);
  }, [rows, live]);

  // ── Live window chart data ─────────────────────────────────
  const liveDays = parseInt(liveWindow);
  const liveChart = useMemo(() => {
    if (!buybacks) return [];
    const cutoff = new Date(Date.now() - liveDays * 86_400_000).toISOString().slice(0, 10);
    const dates = new Set<string>();
    const byTok: Record<string, Map<string, { usd: number; tokens: number; txCount: number }>> = {};
    for (const b of buybacks) {
      byTok[b.tokenId] = new Map(b.daily.filter((d) => d.date >= cutoff).map((d) => [d.date, d]));
      byTok[b.tokenId].forEach((_, k) => dates.add(k));
    }
    const cum: Record<string, number> = {};
    return [...dates].sort().map((date) => {
      const row: Record<string, number | string> = { date };
      for (const cfg of TOKEN_CONFIGS) {
        const e = byTok[cfg.id]?.get(date);
        const v = liveMetric === "usd" ? (e?.usd ?? 0) : (e?.tokens ?? 0);
        row[cfg.id] = v;
        row[`${cfg.id}_tx`] = e?.txCount ?? 0;
        cum[cfg.id] = (cum[cfg.id] ?? 0) + v;
        row[`${cfg.id}_cum`] = cum[cfg.id];
      }
      return row;
    });
  }, [buybacks, liveDays, liveMetric]);

  const liveSummary = useMemo(() => buybacks?.map((b) => ({
    tokenId: b.tokenId,
    usd: sumWindow(b.daily, liveDays, "usd"),
    tokens: sumWindow(b.daily, liveDays, "tokens"),
    tx: b.daily.filter((d) => d.date >= new Date(Date.now() - liveDays * 86_400_000).toISOString().slice(0, 10)).reduce((s, d) => s + d.txCount, 0),
    quality: b.quality,
    source: b.source,
    error: b.error,
    lastDate: b.daily.at(-1)?.date ?? null,
  })) ?? null, [buybacks, liveDays]);

  // ── History chart (full range, aggregated) ─────────────────
  const histChart = useMemo(() => {
    if (!buybacks) return [];
    const periods = new Set<string>();
    const byTok: Record<string, Map<string, { usd: number; tokens: number }>> = {};
    for (const b of buybacks) {
      const agg = aggregateDaily(b.daily, histGranularity);
      byTok[b.tokenId] = new Map(agg.map((a) => [a.period, a]));
      agg.forEach((a) => periods.add(a.period));
    }
    const cum: Record<string, number> = {};
    return [...periods].sort().map((period) => {
      const row: Record<string, number | string> = { period };
      for (const r of rows) {
        const e = byTok[r.cfg.id]?.get(period);
        const usd = e?.usd ?? 0, tokens = e?.tokens ?? 0;
        const v = histMetric === "usd" ? usd : histMetric === "tokens" ? tokens : (r.circ > 0 ? (tokens / r.circ) * 100 : 0);
        row[r.cfg.id] = histMetric === "pct_circ" ? parseFloat(v.toFixed(4)) : v;
        cum[r.cfg.id] = (cum[r.cfg.id] ?? 0) + usd;
        row[`${r.cfg.id}_cum`] = cum[r.cfg.id];
      }
      return row;
    });
  }, [buybacks, histGranularity, histMetric, rows]);

  const histMarkers = useMemo(() => {
    if (!histMilestones || histGranularity === "daily") return [];
    const keys = new Set(histChart.map((r) => r.period as string));
    return MILESTONES.filter((m) => m.kind === "burn" || m.kind === "policy")
      .map((m) => ({ ...m, key: periodKey(m.date, histGranularity) }))
      .filter((m) => keys.has(m.key));
  }, [histChart, histGranularity, histMilestones]);

  // ── Supply % ───────────────────────────────────────────────
  const supplyPct = rows.map((r) => {
    const basis = supplyBasis === "circ" ? r.circ : r.total;
    const pct = r.tokensRemoved !== null && basis > 0 ? (r.tokensRemoved / basis) * 100 : 0;
    return { id: r.cfg.id, name: r.cfg.ticker, pct: parseFloat(pct.toFixed(3)), color: r.cfg.color, tokens: r.tokensRemoved, note: r.tokensRemovedNote };
  });

  // ── Fee share ──────────────────────────────────────────────
  const feeShare = rows.map((r) => {
    const eff = r.effRate !== null ? Math.round(r.effRate * 100) : null;
    return { name: r.cfg.ticker, Buybacks: eff ?? 0, "Other / undisclosed": eff !== null ? 100 - eff : 0, policy: r.cfg.policyBuybackRate };
  });

  // ── CSV export ─────────────────────────────────────────────
  const exportCsv = () => {
    if (!buybacks) return;
    const lines = ["date,token,usd,tokens,tx_count,quality"];
    for (const b of buybacks) for (const d of b.daily) lines.push(`${d.date},${tickerOf(b.tokenId)},${d.usd.toFixed(2)},${d.tokens.toFixed(4)},${d.txCount},${b.quality}`);
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `perp-dex-buybacks-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const nextLiveIn = liveAt ? Math.max(0, liveAt + LIVE_REFRESH_MS - now) : 0;
  const errorCount = live?.reduce((s, d) => s + d.errors.length, 0) ?? 0;

  // ─────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)", color: "var(--text-primary)", padding: "24px", maxWidth: "1400px", margin: "0 auto" }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} } @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 800, margin: 0 }}>Perp DEX Tokenomics</h1>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "8px", maxWidth: "900px" }}>
            Hyperliquid, Lighter, Aster and edgeX. Prices from CoinGecko. Fees and buybacks from DefiLlama adapters and, for HYPE, the Assistance Fund wallet itself. Every dollar figure on this page is live.
          </p>
        </div>
        <div style={{ ...card, padding: "10px 14px", minWidth: "240px", fontSize: "11px", color: "var(--text-secondary)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: liveErr ? "#f87171" : "#4ade80", animation: "blink 2s infinite" }} />
            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{liveErr ? "Market feed error" : "Auto-refresh on"}</span>
          </div>
          <div>Market data: {liveAt ? `${timeAgo(liveAt)} · next in ${mmss(nextLiveIn)}` : "loading…"}</div>
          <div>Buyback series: {buybacksAt ? timeAgo(buybacksAt) : "loading…"} · hourly</div>
          {errorCount > 0 && <div style={{ color: "#f59e0b", marginTop: "2px" }}>{errorCount} upstream warning{errorCount > 1 ? "s" : ""} (see Methodology)</div>}
          <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
            <button onClick={() => { fetchLive(); fetchBuybacks(); }} style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)", cursor: "pointer" }}>Refresh now</button>
            <button onClick={exportCsv} disabled={!buybacks} style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)", cursor: buybacks ? "pointer" : "default", opacity: buybacks ? 1 : 0.5 }}>Export CSV</button>
          </div>
        </div>
      </div>

      {/* ── 1. Market Pulse ─────────────────────────────────── */}
      <div style={section}>
        <SectionHeader title="Market Pulse" subtitle="Price action, distance from the high, 24h volume and the 90-day daily fee trend." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
          {rows.map(({ cfg, l }) => (
            <div key={cfg.id} style={{ ...card, borderTop: `3px solid ${cfg.color}`, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
                  <span style={{ fontWeight: 700, fontSize: "15px" }}>{cfg.ticker}</span>
                  <span style={subtle}>{cfg.name}{l?.marketCapRank ? ` · #${l.marketCapRank}` : ""}</span>
                </div>
                <span style={{ fontSize: "20px", fontWeight: 700 }}>{loading ? <Skeleton w="70px" /> : l?.price != null ? fmtPrice(l.price) : "—"}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "4px", marginBottom: "8px" }}>
                <ChangeBadge v={l?.priceChange24h ?? null} label="24h" />
                <ChangeBadge v={l?.priceChange7d ?? null} label="7d" />
                <ChangeBadge v={l?.priceChange30d ?? null} label="30d" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "6px" }}>
                <div>
                  <div style={labelStyle}>From ATH</div>
                  <div style={{ fontSize: "13px", fontWeight: 600 }}>
                    {l?.athChangePct != null ? fmtPct(l.athChangePct, 1) : "—"}
                    {l?.ath != null && <span style={{ ...subtle, marginLeft: "6px" }}>{fmtPrice(l.ath)}{l.athDate ? ` · ${l.athDate.slice(0, 10)}` : ""}</span>}
                  </div>
                </div>
                <div>
                  <div style={labelStyle}>24h Volume</div>
                  <div style={{ fontSize: "13px", fontWeight: 600 }}>{fmt$(l?.volume24h)}</div>
                </div>
              </div>
              <div style={{ ...labelStyle, marginTop: "4px" }}>Daily fees · 90d {l?.fees7d != null && <span style={{ textTransform: "none", letterSpacing: 0 }}>· 7d {fmtCompact(l.fees7d)}</span>}</div>
              {l ? <Sparkline data={l.feesDaily} color={cfg.color} /> : <div style={{ height: "36px" }} />}
            </div>
          ))}
        </div>
      </div>

      {/* ── 2. Commentary ───────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: "24px", marginBottom: "24px" }}>
        <div style={card}>
          <SectionHeader title="What the numbers say" subtitle="Generated from the live figures on this page each time it refreshes. No hand editing." />
          {insights.length === 0 ? <div style={subtle}>Waiting for data…</div> : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
              {insights.map((i, idx) => {
                const cfg = TOKEN_CONFIGS.find((c) => c.id === i.tokenId);
                const dot = i.tone === "up" ? "#4ade80" : i.tone === "down" ? "#f87171" : i.tone === "flat" ? "#9ca3af" : "#60a5fa";
                return (
                  <li key={idx} style={{ display: "flex", gap: "10px", fontSize: "13px", lineHeight: 1.5 }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: dot, marginTop: "6px", flexShrink: 0 }} />
                    <span>
                      {cfg && <span style={{ color: cfg.color, fontWeight: 700, marginRight: "6px" }}>{cfg.ticker}</span>}
                      {!cfg && <span style={{ color: "#60a5fa", fontWeight: 700, marginRight: "6px" }}>GROUP</span>}
                      {i.text}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div style={card}>
          <SectionHeader
            title="Analyst notes"
            subtitle={`Hand-written context with sources. Updated ${ANALYST_NOTES_UPDATED}.`}
            right={<PillGroup options={[{ label: "All", value: "all" }, { label: "Market", value: "market" }, ...TOKEN_CONFIGS.map((c) => ({ label: c.ticker, value: c.id }))]} value={noteFilter} onChange={setNoteFilter} />}
          />
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
            {ANALYST_NOTES.filter((n) => noteFilter === "all" || n.tokenId === noteFilter).map((n, idx) => {
              const cfg = TOKEN_CONFIGS.find((c) => c.id === n.tokenId);
              return (
                <li key={idx} style={{ fontSize: "13px", lineHeight: 1.5, paddingLeft: "10px", borderLeft: `2px solid ${cfg?.color ?? "#60a5fa"}` }}>
                  <span style={{ color: cfg?.color ?? "#60a5fa", fontWeight: 700, marginRight: "6px" }}>{cfg?.ticker ?? "MARKET"}</span>
                  {n.text}
                  <a href={n.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ ...subtle, color: "#60a5fa", marginLeft: "6px", textDecoration: "none" }}>{n.sourceLabel} ↗</a>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* ── 3. Protocol Overview ────────────────────────────── */}
      <div style={section}>
        <SectionHeader title="Protocol Overview" subtitle="Valuation, fee flow and cumulative buybacks. Policy rate is what the protocol says it does. Effective rate is DefiLlama buybacks ÷ fees over the last 30 days." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px" }}>
          {rows.map(({ cfg, l, bb, reported, effRate, bbYield, tokensRemoved, tokensRemovedNote, usdAllTime, usdAllTimeNote }) => (
            <div key={cfg.id} style={{ ...card, borderLeft: `3px solid ${cfg.color}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "16px", fontWeight: 700 }}>{cfg.name}</span>
                  <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 7px", borderRadius: "999px", background: cfg.color + "22", color: cfg.color }}>{cfg.ticker}</span>
                </div>
                {bb && <QualityBadge q={bb.quality} />}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "10px" }}>
                {[
                  { label: "Circ. Mkt Cap", value: fmt$(l?.marketCap) },
                  { label: "FDV", value: fmt$(l?.fdv) },
                  { label: "Circ / Total", value: l?.circulatingSupply && l?.totalSupply ? `${((l.circulatingSupply / l.totalSupply) * 100).toFixed(0)}%` : "—" },
                ].map(({ label, value }) => (
                  <div key={label}><div style={labelStyle}>{label}</div><div style={{ fontSize: "14px", fontWeight: 600 }}>{loading ? <Skeleton /> : value}</div></div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", paddingTop: "10px", borderTop: "1px solid var(--border)", marginBottom: "10px" }}>
                {[
                  { label: "30d Fees", value: fmt$(l?.fees30d) },
                  { label: "30d Buybacks", value: fmt$(l?.buyback30d) },
                  { label: "Ann. Buybacks", value: fmt$(annualize30d(l?.buyback30d ?? null)) },
                ].map(({ label, value }) => (
                  <div key={label}><div style={labelStyle}>{label}</div><div style={{ fontSize: "14px", fontWeight: 600 }}>{loading ? <Skeleton /> : value}</div></div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", paddingTop: "10px", borderTop: "1px solid var(--border)", marginBottom: "10px" }}>
                <div><div style={labelStyle}>Policy Rate</div><div style={{ fontSize: "14px", fontWeight: 600, color: cfg.color }}>{cfg.policyBuybackRate !== null ? `${Math.round(cfg.policyBuybackRate * 100)}%` : "n/d"}</div></div>
                <div><div style={labelStyle}>Effective 30d</div><div style={{ fontSize: "14px", fontWeight: 600 }}>{loading ? <Skeleton w="40px" /> : effRate !== null ? `${Math.round(effRate * 100)}%` : "—"}</div></div>
                <div><div style={labelStyle}>Buyback Yield</div><div style={{ fontSize: "14px", fontWeight: 600 }}>{loading ? <Skeleton w="40px" /> : bbYield !== null ? `${(bbYield * 100).toFixed(1)}%` : "—"}</div></div>
              </div>

              <div style={{ paddingTop: "10px", borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <div>
                    <div style={labelStyle}>Total USD Bought</div>
                    <div style={{ fontSize: "14px", fontWeight: 600 }}>{loading ? <Skeleton /> : fmt$(usdAllTime)}</div>
                    <div style={{ ...subtle, fontSize: "10px" }}>{usdAllTimeNote}</div>
                    {reported.usdSpent && cfg.id !== "hyperliquid" && <div style={{ ...subtle, fontSize: "10px" }}>Reported: {fmtCompact(reported.usdSpent)} ({reported.usdSpentLabel})</div>}
                  </div>
                  <div>
                    <div style={labelStyle}>Tokens Removed</div>
                    <div style={{ fontSize: "14px", fontWeight: 600 }}>{tokensRemoved !== null ? `${fmtTokens(tokensRemoved)} ${cfg.ticker}` : "—"}</div>
                    <div style={{ ...subtle, fontSize: "10px" }}>{tokensRemovedNote}</div>
                  </div>
                </div>
                <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{cfg.policyNote}</div>
                <div style={{ display: "flex", gap: "12px", marginTop: "6px", flexWrap: "wrap" }}>
                  {cfg.explorerUrl && <a href={cfg.explorerUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "10px", color: "#34d399" }}>On-chain ↗</a>}
                  {cfg.docsUrl && <a href={cfg.docsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "10px", color: "#60a5fa" }}>Docs ↗</a>}
                  <a href={`https://defillama.com/protocol/${cfg.defiLlamaSlug}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "10px", color: "#a78bfa" }}>DefiLlama ↗</a>
                </div>
                {cfg.buybackWallet && <div style={{ fontSize: "9px", color: "var(--text-secondary)", marginTop: "4px", fontFamily: "monospace", wordBreak: "break-all" }}>{cfg.buybackWallet}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 4. Valuation ────────────────────────────────────── */}
      <div style={section}>
        <SectionHeader
          title="Valuation on Buyback Earnings"
          subtitle="P/E = valuation ÷ annualized buybacks (30-day DefiLlama holders revenue × 365/30). P/S uses total fees. Buyback yield is the inverse of P/E. TradFi comps for scale."
          right={<PillGroup options={[{ label: "Market Cap", value: "mcap" }, { label: "FDV", value: "fdv" }]} value={valuationBasis} onChange={setValuationBasis} />}
        />
        <div style={{ overflowX: "auto", marginBottom: "20px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ color: "var(--text-secondary)", fontSize: "11px", textTransform: "uppercase" }}>
                {["Protocol", valuationBasis === "mcap" ? "Mkt Cap" : "FDV", "Ann. Fees", "Ann. Buybacks", "Eff. Rate", "P/S", "P/E", "Yield", "vs CME 26x", "vs HOOD 35x", "vs COIN 40x"].map((h) => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid var(--border)", fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ cfg, valuation, annFees, annBB, effRate, pe, ps, bbYield }) => {
                const peF = pe !== null && isFinite(pe) ? pe : null;
                return (
                  <tr key={cfg.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: cfg.color }} />
                        <span style={{ fontWeight: 600 }}>{cfg.name}</span>
                        <span style={subtle}>{cfg.ticker}</span>
                      </span>
                    </td>
                    <td style={{ padding: "10px" }}>{loading ? <Skeleton /> : fmt$(valuation)}</td>
                    <td style={{ padding: "10px" }}>{loading ? <Skeleton /> : fmt$(annFees)}</td>
                    <td style={{ padding: "10px" }}>{loading ? <Skeleton /> : fmt$(annBB)}</td>
                    <td style={{ padding: "10px", color: cfg.color, fontWeight: 600 }}>{loading ? <Skeleton w="40px" /> : effRate !== null ? `${Math.round(effRate * 100)}%` : "—"}</td>
                    <td style={{ padding: "10px" }}>{loading ? <Skeleton w="40px" /> : fmtPE(ps)}</td>
                    <td style={{ padding: "10px", fontWeight: 700, fontSize: "15px", color: peF !== null ? (peF < 26 ? "#4ade80" : peF < 40 ? "#facc15" : "#f87171") : "var(--text-secondary)" }}>{loading ? <Skeleton /> : fmtPE(pe)}</td>
                    <td style={{ padding: "10px" }}>{loading ? <Skeleton w="40px" /> : bbYield !== null ? `${(bbYield * 100).toFixed(1)}%` : "—"}</td>
                    {[26, 35, 40].map((comp) => {
                      const diff = peF !== null ? ((peF - comp) / comp) * 100 : null;
                      return <td key={comp} style={{ padding: "10px", fontSize: "12px", color: diff !== null ? (diff < 0 ? "#4ade80" : "#f87171") : "var(--text-secondary)" }}>{loading ? <Skeleton w="50px" /> : diff !== null ? fmtPct(diff, 0, true) : "—"}</td>;
                    })}
                  </tr>
                );
              })}
              {TRADFI_COMPS.map((c) => (
                <tr key={c.ticker} style={{ borderBottom: "1px solid var(--border)", opacity: 0.55 }}>
                  <td style={{ padding: "10px", color: "var(--text-secondary)", fontStyle: "italic" }}>{c.label} ({c.ticker})</td>
                  <td colSpan={5} style={{ padding: "10px", fontSize: "11px", color: "var(--text-secondary)" }}>TradFi reference, trailing GAAP P/E</td>
                  <td style={{ padding: "10px", fontWeight: 600, color: "var(--text-secondary)" }}>{c.pe}x</td>
                  <td colSpan={4} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={rows.filter((r) => r.pe !== null && isFinite(r.pe)).map((r) => ({ name: r.cfg.ticker, pe: r.pe, color: r.cfg.color }))} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis dataKey="name" tick={CHART_AXIS} />
            <YAxis tick={CHART_AXIS} tickFormatter={(v) => `${v}x`} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${(v as number).toFixed(1)}x`, "P/E"]} />
            {TRADFI_COMPS.map((c) => <ReferenceLine key={c.ticker} y={c.pe} stroke="#9ca3af" strokeDasharray="5 4" label={{ value: `${c.ticker} ${c.pe}x`, fill: "#9ca3af", fontSize: 10, position: "insideTopRight" }} />)}
            <Bar dataKey="pe" name="P/E" radius={[4, 4, 0, 0]}>
              {rows.filter((r) => r.pe !== null && isFinite(r.pe)).map((r) => <Cell key={r.cfg.id} fill={r.cfg.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── 5. Live Buybacks ────────────────────────────────── */}
      <div style={section}>
        <SectionHeader
          title="Daily Buybacks"
          subtitle="One series per protocol from DefiLlama's buyback adapters. HYPE adds token and fill counts from the Assistance Fund's own trades. Token counts for the others are USD ÷ daily close."
          right={
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
              <PillGroup options={[{ label: "USD", value: "usd" }, { label: "Tokens", value: "tokens" }]} value={liveMetric} onChange={setLiveMetric} />
              <div style={{ display: "flex", gap: "8px" }}>
                <PillGroup options={[{ label: "30d", value: "30" }, { label: "60d", value: "60" }, { label: "90d", value: "90" }, { label: "180d", value: "180" }]} value={liveWindow} onChange={setLiveWindow} />
                <Toggle on={liveCumulative} onClick={() => setLiveCumulative((v) => !v)}>Cumulative</Toggle>
              </div>
            </div>
          }
        />

        {liveSummary && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", marginBottom: "16px" }}>
            {liveSummary.map((s) => {
              const cfg = TOKEN_CONFIGS.find((c) => c.id === s.tokenId)!;
              return (
                <div key={s.tokenId} style={{ background: "var(--bg-secondary)", borderRadius: "6px", padding: "10px 12px", borderLeft: `3px solid ${cfg.color}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                    <span style={{ fontWeight: 700, fontSize: "13px" }}>{cfg.ticker}</span>
                    <QualityBadge q={s.quality} />
                  </div>
                  <div style={{ fontSize: "15px", fontWeight: 700 }}>{liveMetric === "usd" ? fmtCompact(s.usd) : s.tokens > 0 ? `${fmtTokens(s.tokens)} ${cfg.ticker}` : "—"}</div>
                  <div style={{ ...subtle, marginTop: "2px" }}>
                    {liveDays}d · {fmtCompact(s.usd / liveDays)}/day{s.tx > 0 ? ` · ${s.tx.toLocaleString()} fills` : ""}{s.lastDate ? ` · to ${s.lastDate}` : ""}
                  </div>
                  {s.error && <div style={{ fontSize: "9px", color: "#f87171", marginTop: "3px", wordBreak: "break-all" }}>{s.error.slice(0, 90)}</div>}
                </div>
              );
            })}
          </div>
        )}

        {buybacksLoading && !buybacks ? (
          <div style={{ height: "340px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: "13px" }}>Fetching buyback series…</div>
        ) : liveChart.length === 0 ? (
          <div style={{ height: "200px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: "13px" }}>No data returned.</div>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={liveChart} margin={{ top: 10, right: liveCumulative ? 64 : 20, left: 10, bottom: 5 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="date" tick={{ ...CHART_AXIS, fontSize: 10 }} angle={-25} textAnchor="end" height={44} interval="preserveStartEnd" minTickGap={24} />
              <YAxis yAxisId="left" tick={CHART_AXIS} tickFormatter={liveMetric === "usd" ? fmtCompact : (v) => fmtTokens(v as number)} />
              {liveCumulative && <YAxis yAxisId="right" orientation="right" tick={CHART_AXIS} tickFormatter={liveMetric === "usd" ? fmtCompact : (v) => fmtTokens(v as number)} />}
              <Tooltip {...TOOLTIP_STYLE} formatter={(value, name) => {
                const n = String(name); const isCum = n.endsWith("_cum"); const id = isCum ? n.replace("_cum", "") : n;
                const f = liveMetric === "usd" ? fmtCompact(value as number) : fmtTokens(value as number);
                return [f, isCum ? `${tickerOf(id)} cumul.` : tickerOf(id)];
              }} />
              <Legend formatter={(v) => { const s = String(v); return s.endsWith("_cum") ? `${tickerOf(s.replace("_cum", ""))} (cum.)` : tickerOf(s); }} wrapperStyle={{ fontSize: "11px" }} />
              {TOKEN_CONFIGS.map((cfg) => <Bar yAxisId="left" key={cfg.id} dataKey={cfg.id} name={cfg.id} fill={cfg.color} radius={[2, 2, 0, 0]} fillOpacity={0.85} stackId="daily" isAnimationActive={false} />)}
              {liveCumulative && TOKEN_CONFIGS.map((cfg) => <Line yAxisId="right" key={`${cfg.id}_cum`} dataKey={`${cfg.id}_cum`} name={`${cfg.id}_cum`} stroke={cfg.color} strokeWidth={2} dot={false} strokeDasharray="4 2" isAnimationActive={false} />)}
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {buybacks && (
          <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {buybacks.map((b) => {
              const cfg = TOKEN_CONFIGS.find((c) => c.id === b.tokenId)!;
              return (
                <div key={b.tokenId} style={{ fontSize: "10px", color: "var(--text-secondary)", display: "flex", gap: "6px", alignItems: "flex-start" }}>
                  <span style={{ color: cfg.color, fontWeight: 700, flexShrink: 0 }}>{cfg.ticker}:</span>
                  <span>{b.source}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 6. History ──────────────────────────────────────── */}
      <div style={section}>
        <SectionHeader
          title="Buyback History"
          subtitle="Full tracked history, aggregated. HYPE goes back to Dec 2024. Markers show burn and policy events from the timeline below."
          right={
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
              <PillGroup options={[{ label: "USD", value: "usd" }, { label: "Tokens", value: "tokens" }, { label: "% Circ Supply", value: "pct_circ" }]} value={histMetric} onChange={setHistMetric} />
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <PillGroup options={[{ label: "Weekly", value: "weekly" }, { label: "Monthly", value: "monthly" }, { label: "Quarterly", value: "quarterly" }, { label: "Yearly", value: "yearly" }]} value={histGranularity} onChange={setHistGranularity} />
                <Toggle on={histCumulative} onClick={() => setHistCumulative((v) => !v)}>+ Cumulative USD</Toggle>
                <Toggle on={histMilestones} onClick={() => setHistMilestones((v) => !v)}>Markers</Toggle>
              </div>
            </div>
          }
        />
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={histChart} margin={{ top: 24, right: histCumulative ? 60 : 20, left: 10, bottom: 5 }}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis dataKey="period" tick={CHART_AXIS} angle={-20} textAnchor="end" height={40} interval="preserveStartEnd" minTickGap={16} />
            <YAxis yAxisId="left" tick={CHART_AXIS} tickFormatter={histMetric === "usd" ? fmtCompact : histMetric === "tokens" ? (v) => fmtTokens(v as number) : (v) => `${v}%`} />
            {histCumulative && <YAxis yAxisId="right" orientation="right" tick={CHART_AXIS} tickFormatter={fmtCompact} />}
            <Tooltip {...TOOLTIP_STYLE} formatter={(value, name) => {
              const n = String(name);
              if (n.endsWith("_cum")) return [fmtCompact(value as number), `${tickerOf(n.replace("_cum", ""))} cumulative`];
              if (histMetric === "usd") return [fmtCompact(value as number), tickerOf(n)];
              if (histMetric === "tokens") return [fmtTokens(value as number), tickerOf(n)];
              return [`${(value as number).toFixed(3)}%`, tickerOf(n)];
            }} />
            <Legend formatter={(v) => { const s = String(v); return s.endsWith("_cum") ? `${tickerOf(s.replace("_cum", ""))} (cum.)` : tickerOf(s); }} wrapperStyle={{ fontSize: "12px" }} />
            {histMarkers.map((m, i) => {
              const cfg = TOKEN_CONFIGS.find((c) => c.id === m.tokenId)!;
              return <ReferenceLine key={i} yAxisId="left" x={m.key} stroke={cfg.color} strokeDasharray="2 3" strokeOpacity={0.7} label={{ value: `${cfg.ticker}: ${m.title.split(":")[0]}`, fill: cfg.color, fontSize: 9, position: "top", angle: 0 }} />;
            })}
            {TOKEN_CONFIGS.map((cfg) => <Bar yAxisId="left" key={cfg.id} dataKey={cfg.id} name={cfg.id} fill={cfg.color} radius={[3, 3, 0, 0]} fillOpacity={0.85} isAnimationActive={false} />)}
            {histCumulative && TOKEN_CONFIGS.map((cfg) => <Line yAxisId="right" key={`${cfg.id}_cum`} dataKey={`${cfg.id}_cum`} name={`${cfg.id}_cum`} stroke={cfg.color} strokeWidth={2} dot={false} strokeDasharray="4 2" isAnimationActive={false} />)}
          </ComposedChart>
        </ResponsiveContainer>
        <p style={{ ...subtle, marginTop: "8px" }}>
          Token counts before the last 365 days are unavailable for LIT, ASTER and EDGE (CoinGecko free-tier price history). HYPE token counts cover the last 90 days of fills only. Use USD for long-range comparison.
        </p>
      </div>

      {/* ── 7. Timeline ─────────────────────────────────────── */}
      <div style={section}>
        <SectionHeader
          title="Buyback & Burn Timeline"
          subtitle="Dated events with sources. 'Verified' means an on-chain record or primary announcement. 'Reported' means secondary press."
          right={<PillGroup options={[{ label: "All", value: "all" }, ...TOKEN_CONFIGS.map((c) => ({ label: c.ticker, value: c.id }))]} value={timelineFilter} onChange={setTimelineFilter} />}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          {[...MILESTONES].filter((m) => timelineFilter === "all" || m.tokenId === timelineFilter).sort((a, b) => b.date.localeCompare(a.date)).map((m, i) => {
            const cfg = TOKEN_CONFIGS.find((c) => c.id === m.tokenId)!;
            const future = m.date > new Date().toISOString().slice(0, 10);
            const kindColor = { burn: "#f87171", policy: "#60a5fa", launch: "#a78bfa", governance: "#facc15", market: "#9ca3af" }[m.kind];
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "110px 16px 1fr", gap: "12px", padding: "10px 0", borderBottom: "1px solid var(--border)", opacity: future ? 0.6 : 1 }}>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "monospace", paddingTop: "2px" }}>{m.date}{future ? " ·" : ""}</div>
                <div style={{ display: "flex", justifyContent: "center", paddingTop: "5px" }}><span style={{ width: "10px", height: "10px", borderRadius: "50%", background: cfg.color, boxShadow: `0 0 0 3px ${cfg.color}22` }} /></div>
                <div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ color: cfg.color, fontWeight: 700, fontSize: "12px" }}>{cfg.ticker}</span>
                    <span style={{ fontWeight: 600, fontSize: "13px" }}>{m.title}</span>
                    <span style={{ fontSize: "9px", padding: "1px 6px", borderRadius: "999px", background: kindColor + "22", color: kindColor, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{m.kind}</span>
                    <span style={{ fontSize: "9px", color: m.confidence === "verified" ? "#4ade80" : "#f59e0b" }}>{m.confidence}</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px", lineHeight: 1.5 }}>
                    {m.detail}
                    {(m.tokens || m.usd) && <span style={{ marginLeft: "6px", color: "var(--text-primary)" }}>{m.tokens ? `${fmtTokens(m.tokens)} ${cfg.ticker}` : ""}{m.tokens && m.usd ? " · " : ""}{m.usd ? fmtCompact(m.usd) : ""}</span>}
                    {m.sourceUrl ? <a href={m.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: "6px", color: "#60a5fa", textDecoration: "none", fontSize: "11px" }}>{m.sourceLabel} ↗</a> : <span style={{ marginLeft: "6px", fontSize: "11px" }}>{m.sourceLabel}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 8. Supply % ─────────────────────────────────────── */}
      <div style={section}>
        <SectionHeader
          title="Tokens Removed as % of Supply"
          subtitle="HYPE is the fund's live balance. LIT is the two official burns plus tracked buys since Sep 30. ASTER is the Aug 10 official burn total plus tracked buys since (burns match buys 1:1). EDGE is tracked buybacks divided by daily price."
          right={<PillGroup options={[{ label: "Circulating", value: "circ" }, { label: "Total Supply", value: "total" }]} value={supplyBasis} onChange={setSupplyBasis} />}
        />
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "24px", alignItems: "start" }}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={supplyPct} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="name" tick={CHART_AXIS} />
              <YAxis tick={CHART_AXIS} tickFormatter={(v) => `${v}%`} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v, _n, item) => [`${(v as number).toFixed(2)}%`, `${(item as { payload?: { name?: string } })?.payload?.name ?? ""} removed`]} />
              <Bar dataKey="pct" name="% removed" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {supplyPct.map((d) => <Cell key={d.id} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {supplyPct.map((d) => (
              <div key={d.id} style={{ fontSize: "12px", paddingLeft: "8px", borderLeft: `2px solid ${d.color}` }}>
                <span style={{ color: d.color, fontWeight: 700 }}>{d.name}</span> {d.tokens !== null ? fmtTokens(d.tokens) : "—"} · {d.pct.toFixed(2)}%
                <div style={{ ...subtle, fontSize: "10px" }}>{d.note}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 9. Fees ─────────────────────────────────────────── */}
      <div style={section}>
        <SectionHeader title="Fees and Where They Go" subtitle="Left: 30-day fees, live. Right: share of those fees that DefiLlama measured as buybacks over the same window. Policy rates are shown for comparison." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "24px" }}>
          <div>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px", fontWeight: 600 }}>30-Day Fees</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={rows.map((r) => ({ name: r.cfg.ticker, fees: r.l?.fees30d ?? 0, buybacks: r.l?.buyback30d ?? 0, color: r.cfg.color }))} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis dataKey="name" tick={CHART_AXIS} />
                <YAxis tick={CHART_AXIS} tickFormatter={fmtCompact} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v, n) => [fmtCompact(v as number), n === "fees" ? "30d fees" : "30d buybacks"]} />
                <Legend wrapperStyle={{ fontSize: "11px" }} formatter={(v) => (v === "fees" ? "Fees" : "Buybacks")} />
                <Bar dataKey="fees" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {rows.map((r) => <Cell key={r.cfg.id} fill={r.cfg.color} fillOpacity={0.45} />)}
                </Bar>
                <Bar dataKey="buybacks" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {rows.map((r) => <Cell key={r.cfg.id} fill={r.cfg.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px", fontWeight: 600 }}>Effective Buyback Share of Fees (30d)</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={feeShare} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis dataKey="name" tick={CHART_AXIS} />
                <YAxis tick={CHART_AXIS} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v, n, item) => {
                  const p = (item as { payload?: { policy?: number | null } })?.payload?.policy;
                  return [`${v}%${n === "Buybacks" && p != null ? ` (policy ${Math.round(p * 100)}%)` : ""}`, String(n)];
                }} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar dataKey="Buybacks" stackId="a" fill="#4ade80" isAnimationActive={false} />
                <Bar dataKey="Other / undisclosed" stackId="a" fill="#374151" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Methodology ─────────────────────────────────────── */}
      <div style={{ ...card, marginBottom: "32px", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.7 }}>
        <h3 style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: "10px", fontSize: "14px" }}>Methodology and Data Sources</h3>
        <p style={{ marginBottom: "6px" }}>
          <strong>Buybacks.</strong> DefiLlama <em>holders revenue</em> per protocol. Hyperliquid: 99% of perps fees (ex builder codes) to the Assistance Fund. Lighter: LIT bought by the treasury. Aster: ASTERUSDT buy fills by the public buyback wallet on Aster Chain, burns before Feb 2 2026. edgeX: EDGE buyback allocation across v1 and v2. Parent slugs are used so spot and secondary deployments count.
        </p>
        <p style={{ marginBottom: "6px" }}>
          <strong>Hyperliquid on-chain.</strong> The fund's HYPE spot balance and cost basis come from <code style={{ fontSize: "10px", background: "#1f2937", padding: "1px 4px", borderRadius: "3px" }}>spotClearinghouseState</code>. Daily fill counts and token amounts come from <code style={{ fontSize: "10px", background: "#1f2937", padding: "1px 4px", borderRadius: "3px" }}>userFillsByTime</code>, paged in 3-day windows and split when a window hits the 2,000-fill cap.
        </p>
        <p style={{ marginBottom: "6px" }}>
          <strong>Valuation.</strong> P/E = market cap (or FDV) ÷ (30-day buybacks × 365/30). P/S uses total fees. Buyback yield = annualized buybacks ÷ valuation. Effective rate = 30-day buybacks ÷ 30-day fees, capped at 100%. TradFi P/Es are approximate trailing figures for scale only.
        </p>
        <p style={{ marginBottom: "6px" }}>
          <strong>Refresh.</strong> Market data every 5 minutes, buyback series hourly, both on the server and in this tab while it stays open. Analyst notes are hand-written and dated. The timeline and reported totals are static and cite their sources.
        </p>
        <p style={{ marginBottom: "6px" }}>
          <strong>Known gaps.</strong> Aster's parent slug has no DefiLlama revenue series, so holders revenue stands in. Aster "buybacks" since Jun 17 2026 go to stakers, and the matching reserve burn is not counted as revenue. Lighter and edgeX do not publish a fee share. Token counts for LIT, ASTER and EDGE are derived from daily prices, not from transfers.
        </p>
        {live && errorCount > 0 && (
          <p style={{ color: "#f59e0b" }}>
            <strong>Upstream warnings this refresh:</strong> {live.flatMap((d) => d.errors.map((e) => `${tickerOf(d.tokenId)}: ${e}`)).join(" · ")}
          </p>
        )}
        <p>Not investment advice.</p>
      </div>
    </div>
  );
}
