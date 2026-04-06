"use client";

import { useEffect, useState, useMemo } from "react";
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, Legend,
} from "recharts";
import {
  TOKEN_CONFIGS, FEE_BREAKDOWNS, BUYBACK_EVENTS, BUYBACK_TOTALS, TRADFI_COMPS,
  calcPE, aggregateBuybacksByGranularity, fmtCompact, fmtTokens,
  type LiveTokenData, type TimeGranularity, type TokenomicsApiResponse,
} from "@/lib/tokenomics";
import type { TokenBuybackData, BuybacksApiResponse } from "@/app/api/buybacks/route";

// ─── Helpers ───────────────────────────────────────────────────

function fmt$(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return fmtCompact(n);
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function fmtPE(pe: number | null): string {
  if (pe === null || !isFinite(pe) || isNaN(pe)) return "N/A";
  return `${pe.toFixed(1)}x`;
}

function Skeleton({ w = "80px" }: { w?: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: w,
        height: "14px",
        borderRadius: "4px",
        background: "var(--border)",
        animation: "pulse 1.5s ease-in-out infinite",
        verticalAlign: "middle",
      }}
    />
  );
}

const TOOLTIP_STYLE = {
  contentStyle: {
    background: "#111827",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "6px",
    fontSize: "12px",
    color: "#fff",
  },
  labelStyle: { color: "#e5e7eb", fontWeight: 600, marginBottom: "4px" },
  itemStyle: { color: "#fff" },
  cursor: { fill: "rgba(255,255,255,0.04)" },
};

const CHART_AXIS = { fill: "var(--text-secondary)", fontSize: 11 };
const CHART_GRID = { strokeDasharray: "3 3", stroke: "var(--border)" };

// ─── Pill toggle ───────────────────────────────────────────────

function PillGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            padding: "3px 10px",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: value === o.value ? 600 : 400,
            background: value === o.value ? "#2563eb" : "var(--bg-secondary)",
            color: value === o.value ? "#fff" : "var(--text-secondary)",
            border: `1px solid ${value === o.value ? "#2563eb" : "var(--border)"}`,
            cursor: "pointer",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Section header ────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        {title}
      </h2>
      {subtitle && (
        <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────

export default function TokenomicsPage() {
  const [liveData, setLiveData] = useState<LiveTokenData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [buybackMetric, setBuybackMetric] = useState<"usd" | "tokens" | "pct_circ" | "pct_fdv">("usd");
  const [buybackGranularity, setBuybackGranularity] = useState<TimeGranularity>("monthly");
  const [supplyBasis, setSupplyBasis] = useState<"circ" | "fdv">("circ");
  const [showCumulative, setShowCumulative] = useState(false);

  // Live on-chain buyback data
  const [liveBuybacks, setLiveBuybacks] = useState<TokenBuybackData[] | null>(null);
  const [liveBuybacksLoading, setLiveBuybacksLoading] = useState(true);
  const [liveDaysStr, setLiveDaysStr] = useState<"30" | "60" | "90">("90");
  const liveDays = parseInt(liveDaysStr) as 30 | 60 | 90;
  const [liveMetric, setLiveMetric] = useState<"usd" | "tokens">("usd");
  const [liveShowCumulative, setLiveShowCumulative] = useState(true);

  useEffect(() => {
    fetch("/api/tokenomics")
      .then((r) => r.json())
      .then((d: TokenomicsApiResponse) => setLiveData(d.data))
      .catch(() => setLiveData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setLiveBuybacksLoading(true);
    fetch(`/api/buybacks?days=${liveDays}`)
      .then((r) => r.json())
      .then((d: BuybacksApiResponse) => setLiveBuybacks(d.data))
      .catch(() => setLiveBuybacks(null))
      .finally(() => setLiveBuybacksLoading(false));
  }, [liveDays]);

  // Merge seed + live
  const records = useMemo(() =>
    TOKEN_CONFIGS.map((cfg) => ({
      cfg,
      live: liveData?.find((d) => d.tokenId === cfg.id) ?? null,
      totals: BUYBACK_TOTALS.find((t) => t.tokenId === cfg.id)!,
      breakdown: FEE_BREAKDOWNS.find((f) => f.tokenId === cfg.id)!,
    })),
  [liveData]);

  // Derived values with live-or-seed fallback
  const getCirc = (id: string) => {
    const r = records.find((r) => r.cfg.id === id)!;
    return r.live?.circulatingSupply ?? r.cfg.circulatingSupply;
  };
  const getPrice = (id: string) => {
    const r = records.find((r) => r.cfg.id === id)!;
    return r.live?.price ?? null;
  };
  const getMktCap = (id: string) => {
    const r = records.find((r) => r.cfg.id === id)!;
    return r.live?.marketCap ?? null;
  };
  const getFDV = (id: string) => {
    const r = records.find((r) => r.cfg.id === id)!;
    return r.live?.fdv ?? null;
  };
  const getFees30d = (id: string) => {
    const r = records.find((r) => r.cfg.id === id)!;
    return r.live?.fees30d ?? null;
  };
  const getAnnualizedRevenue = (id: string) => {
    const fees = getFees30d(id);
    return fees !== null ? fees * (365 / 30) : null;
  };

  // P/E for each DEX
  const peData = useMemo(() =>
    records.map(({ cfg }) => {
      const circ = getCirc(cfg.id);
      const price = getPrice(cfg.id);
      const annRev = getAnnualizedRevenue(cfg.id);
      if (!price || !annRev) return { id: cfg.id, name: cfg.name, color: cfg.color, pe: null };
      const pe = calcPE(circ, price, annRev, cfg.buybackRatePct);
      return { id: cfg.id, name: cfg.name, color: cfg.color, pe: isFinite(pe) ? pe : null };
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [records]);

  // Buyback history chart data — merge all DEXes into period-keyed rows
  const buybackChartData = useMemo(() => {
    const allPeriods = new Set<string>();
    const byToken: Record<string, Map<string, { tokens: number; usd: number; isEstimated: boolean }>> = {};

    for (const cfg of TOKEN_CONFIGS) {
      const agg = aggregateBuybacksByGranularity(BUYBACK_EVENTS, cfg.id, buybackGranularity);
      byToken[cfg.id] = new Map(agg.map((a) => [a.period, a]));
      agg.forEach((a) => allPeriods.add(a.period));
    }

    const cumUsd: Record<string, number> = {};

    return Array.from(allPeriods)
      .sort()
      .map((period) => {
        const row: Record<string, number | string | boolean> = { period };
        for (const cfg of TOKEN_CONFIGS) {
          const entry = byToken[cfg.id]?.get(period);
          const tokens = entry?.tokens ?? 0;
          const usd = entry?.usd ?? 0;
          const circ = getCirc(cfg.id);
          const fdvTokens = getFDV(cfg.id)
            ? getFDV(cfg.id)! / (getPrice(cfg.id) ?? 1)
            : cfg.totalSupply;

          if (buybackMetric === "usd") {
            row[cfg.id] = usd;
          } else if (buybackMetric === "tokens") {
            row[cfg.id] = tokens;
          } else if (buybackMetric === "pct_circ") {
            row[cfg.id] = circ > 0 ? parseFloat(((tokens / circ) * 100).toFixed(6)) : 0;
          } else {
            row[cfg.id] = fdvTokens > 0 ? parseFloat(((tokens / fdvTokens) * 100).toFixed(6)) : 0;
          }

          row[`${cfg.id}_est`] = entry?.isEstimated ?? false;
          cumUsd[cfg.id] = (cumUsd[cfg.id] ?? 0) + usd;
          row[`${cfg.id}_cum`] = cumUsd[cfg.id];
        }
        return row;
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buybackGranularity, buybackMetric, records]);

  // Live on-chain chart data — daily rows merged across all tokens
  const liveBuybackChartData = useMemo(() => {
    if (!liveBuybacks) return [];
    const allDates = new Set<string>();
    const byToken: Record<string, Map<string, { tokens: number; usd: number; txCount: number }>> = {};

    for (const td of liveBuybacks) {
      byToken[td.tokenId] = new Map(td.daily.map((d) => [d.date, d]));
      td.daily.forEach((d) => allDates.add(d.date));
    }

    const cumUsd: Record<string, number> = {};
    const cumTokens: Record<string, number> = {};

    return Array.from(allDates)
      .sort()
      .map((date) => {
        const row: Record<string, number | string> = { date };
        for (const cfg of TOKEN_CONFIGS) {
          const entry = byToken[cfg.id]?.get(date);
          const usd = entry?.usd ?? 0;
          const tokens = entry?.tokens ?? 0;
          row[cfg.id] = liveMetric === "usd" ? usd : tokens;
          row[`${cfg.id}_tx`] = entry?.txCount ?? 0;
          cumUsd[cfg.id] = (cumUsd[cfg.id] ?? 0) + usd;
          cumTokens[cfg.id] = (cumTokens[cfg.id] ?? 0) + tokens;
          row[`${cfg.id}_cum`] = liveMetric === "usd" ? cumUsd[cfg.id] : cumTokens[cfg.id];
        }
        return row;
      });
  }, [liveBuybacks, liveMetric]);

  // Summary stats for the live section header
  const liveSummary = useMemo(() => {
    if (!liveBuybacks) return null;
    return liveBuybacks.map((td) => {
      const totalUsd = td.daily.reduce((s, d) => s + d.usd, 0);
      const totalTokens = td.daily.reduce((s, d) => s + d.tokens, 0);
      const totalTx = td.daily.reduce((s, d) => s + d.txCount, 0);
      return { tokenId: td.tokenId, totalUsd, totalTokens, totalTx, isLive: td.isLive, source: td.source };
    });
  }, [liveBuybacks]);

  // % of supply bought back
  const supplyPctData = useMemo(() =>
    records.map(({ cfg, totals }) => {
      const basis = supplyBasis === "circ"
        ? (getCirc(cfg.id))
        : (getFDV(cfg.id) ? getFDV(cfg.id)! / (getPrice(cfg.id) ?? 1) : cfg.totalSupply);
      const pct = basis > 0 ? (totals.totalTokensBoughtBack / basis) * 100 : 0;
      return { name: cfg.ticker, pct: parseFloat(pct.toFixed(4)), color: cfg.color, id: cfg.id };
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [records, supplyBasis]);

  // Fee comparison data
  const feeCompData = useMemo(() =>
    records.map(({ cfg }) => ({
      name: cfg.ticker,
      fees30d: getFees30d(cfg.id) ?? 0,
      color: cfg.color,
    })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [records]);

  // Fee distribution stacked data
  const feeDistData = useMemo(() =>
    records.map(({ cfg, breakdown }) => ({
      name: cfg.ticker,
      Buyback: parseFloat((breakdown.buybackPct * 100).toFixed(0)),
      "LP Rewards": parseFloat((breakdown.lpRewardsPct * 100).toFixed(0)),
      Treasury: parseFloat((breakdown.treasuryPct * 100).toFixed(0)),
      Other: parseFloat((breakdown.otherPct * 100).toFixed(0)),
      color: cfg.color,
    })),
  [records]);

  const card = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    padding: "16px",
  };

  const section = {
    ...card,
    marginBottom: "24px",
  };

  const labelStyle = {
    fontSize: "11px",
    color: "var(--text-secondary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    marginBottom: "2px",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        padding: "24px",
        maxWidth: "1400px",
        margin: "0 auto",
      }}
    >
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      {/* Page header */}
      <div style={{ marginBottom: "28px" }}>
        <p style={{ fontSize: "11px", color: "var(--text-secondary)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "6px" }}>
          CRYPTO COE — TOKENOMICS RESEARCH
        </p>
        <h1 style={{ fontSize: "28px", fontWeight: 800, margin: 0 }}>
          Perp DEX Tokenomics Comparison
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "8px" }}>
          Market cap, FDV, fee revenue, buyback programs, and P/E ratios for Hyperliquid, Lighter, Aster, and EdgeX.
          Live prices and fees from CoinGecko & DefiLlama. Buyback history seeded from public on-chain data.
        </p>
      </div>

      {/* ── SECTION A: Header metrics cards ───────────────────── */}
      <div style={{ ...section }}>
        <SectionHeader title="Protocol Overview" subtitle="Live market data + seeded buyback totals" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
          {records.map(({ cfg, live, totals }) => {
            const price = live?.price;
            const mktCap = live?.marketCap;
            const fdv = live?.fdv;
            const fees30d = live?.fees30d;
            const annRev = fees30d != null ? fees30d * (365 / 30) : null;
            const isPartial = cfg.dataQuality === "partial";

            return (
              <div key={cfg.id} style={{ ...card, borderLeft: `3px solid ${cfg.color}` }}>
                {/* Name + badge */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "16px", fontWeight: 700 }}>{cfg.name}</span>
                    <span style={{
                      fontSize: "11px", fontWeight: 600, padding: "2px 7px", borderRadius: "999px",
                      background: cfg.color + "22", color: cfg.color,
                    }}>
                      {cfg.ticker}
                    </span>
                  </div>
                  {isPartial ? (
                    <span style={{ fontSize: "10px", color: "#f59e0b", padding: "2px 6px", borderRadius: "4px", background: "#f59e0b18" }}>
                      ~ Estimated
                    </span>
                  ) : (
                    <span style={{ fontSize: "10px", color: "#4ade80", padding: "2px 6px", borderRadius: "4px", background: "#4ade8018" }}>
                      Full data
                    </span>
                  )}
                </div>

                {/* Price / Mkt Cap / FDV */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "12px" }}>
                  {[
                    { label: "Price", value: price != null ? `$${price.toFixed(2)}` : null },
                    { label: "Circ. Mkt Cap", value: fmt$(mktCap) },
                    { label: "FDV", value: fmt$(fdv) },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={labelStyle}>{label}</div>
                      <div style={{ fontSize: "14px", fontWeight: 600 }}>
                        {loading ? <Skeleton /> : (value === "—" || value === null ? "—" : value)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Fees / Revenue */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px", paddingTop: "10px", borderTop: "1px solid var(--border)" }}>
                  {[
                    { label: "30d Fees", value: fmt$(fees30d) },
                    { label: "Annualized Rev.", value: fmt$(annRev) },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={labelStyle}>{label}</div>
                      <div style={{ fontSize: "14px", fontWeight: 600 }}>
                        {loading ? <Skeleton /> : value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Buyback stats (seeded) */}
                <div style={{ paddingTop: "10px", borderTop: "1px solid var(--border)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "6px" }}>
                    <div>
                      <div style={labelStyle}>Buyback Rate</div>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: cfg.color }}>
                        {fmtPct(cfg.buybackRatePct)}
                      </div>
                    </div>
                    <div>
                      <div style={labelStyle}>Total USD Spent</div>
                      <div style={{ fontSize: "14px", fontWeight: 600 }}>
                        {totals.totalUsdSpent > 0 ? fmtCompact(totals.totalUsdSpent) : "—"}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div style={labelStyle}>Total Tokens Bought Back</div>
                    <div style={{ fontSize: "13px", fontWeight: 600 }}>
                      {totals.totalTokensBoughtBack > 0
                        ? `${fmtTokens(totals.totalTokensBoughtBack)} ${cfg.ticker}`
                        : "—"}
                    </div>
                  </div>
                  <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--text-secondary)", fontStyle: "italic" }}>
                    {cfg.feeStructureNote}
                  </div>
                  <div style={{ display: "flex", gap: "12px", marginTop: "6px", flexWrap: "wrap" }}>
                    {totals.sourceUrl && (
                      <a
                        href={totals.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: "10px", color: "#60a5fa" }}
                      >
                        Dashboard ↗
                      </a>
                    )}
                    {totals.walletUrl && totals.walletUrl !== totals.sourceUrl && (
                      <a
                        href={totals.walletUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: "10px", color: "#34d399" }}
                      >
                        On-chain ↗
                      </a>
                    )}
                    {cfg.explorerUrl && (
                      <a
                        href={cfg.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: "10px", color: "#a78bfa" }}
                      >
                        Wallet ↗
                      </a>
                    )}
                  </div>
                  {cfg.buybackWallet && (
                    <div style={{ fontSize: "9px", color: "var(--text-secondary)", marginTop: "4px", fontFamily: "monospace", letterSpacing: "-0.02em", wordBreak: "break-all" as const }}>
                      {cfg.buybackWallet}
                    </div>
                  )}
                  <div style={{ fontSize: "10px", color: "var(--text-secondary)", marginTop: "4px" }}>
                    Updated {totals.lastUpdated}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── SECTION B: P/E Comparison ──────────────────────────── */}
      <div style={{ ...section }}>
        <SectionHeader
          title="P/E Ratio Comparison"
          subtitle="P/E = Market Cap ÷ (Annualized Revenue × Buyback Rate). Formula via Arthur Hayes '$HYPE Man' (March 2026)."
        />

        {/* Table */}
        <div style={{ overflowX: "auto", marginBottom: "24px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ color: "var(--text-secondary)", fontSize: "11px", textTransform: "uppercase" }}>
                {["Protocol", "Mkt Cap", "Ann. Revenue", "Buyback Rate", "Eff. Earnings", "P/E", "vs CME (26x)", "vs HOOD (35x)", "vs COIN (40x)"].map((h) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid var(--border)", fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map(({ cfg }) => {
                const mktCap = getMktCap(cfg.id);
                const annRev = getAnnualizedRevenue(cfg.id);
                const effEarnings = annRev != null ? annRev * cfg.buybackRatePct : null;
                const circ = getCirc(cfg.id);
                const price = getPrice(cfg.id);
                const pe = (price && annRev) ? calcPE(circ, price, annRev, cfg.buybackRatePct) : null;
                const peFinite = pe !== null && isFinite(pe) ? pe : null;

                return (
                  <tr key={cfg.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
                        <span style={{ fontWeight: 600 }}>{cfg.name}</span>
                        <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{cfg.ticker}</span>
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>{loading ? <Skeleton /> : fmt$(mktCap)}</td>
                    <td style={{ padding: "10px 12px" }}>{loading ? <Skeleton /> : fmt$(annRev)}</td>
                    <td style={{ padding: "10px 12px", color: cfg.color, fontWeight: 600 }}>{fmtPct(cfg.buybackRatePct)}</td>
                    <td style={{ padding: "10px 12px" }}>{loading ? <Skeleton /> : fmt$(effEarnings)}</td>
                    <td style={{ padding: "10px 12px", fontWeight: 700, fontSize: "15px", color: peFinite !== null ? (peFinite < 26 ? "#4ade80" : peFinite < 40 ? "#facc15" : "#f87171") : "var(--text-secondary)" }}>
                      {loading ? <Skeleton /> : fmtPE(pe)}
                    </td>
                    {[26, 35, 40].map((comp) => {
                      const diff = peFinite !== null ? ((peFinite - comp) / comp * 100) : null;
                      return (
                        <td key={comp} style={{ padding: "10px 12px", fontSize: "12px", color: diff !== null ? (diff < 0 ? "#4ade80" : "#f87171") : "var(--text-secondary)" }}>
                          {loading ? <Skeleton w="50px" /> : (diff !== null ? `${diff > 0 ? "+" : ""}${diff.toFixed(0)}%` : "—")}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {/* TradFi comps as reference rows */}
              {TRADFI_COMPS.map((comp) => (
                <tr key={comp.ticker} style={{ borderBottom: "1px solid var(--border)", opacity: 0.5 }}>
                  <td style={{ padding: "10px 12px", color: "var(--text-secondary)", fontStyle: "italic" }}>
                    {comp.label} ({comp.ticker})
                  </td>
                  <td colSpan={4} style={{ padding: "10px 12px", fontSize: "11px", color: "var(--text-secondary)" }}>TradFi reference comp</td>
                  <td style={{ padding: "10px 12px", fontWeight: 600, color: "var(--text-secondary)" }}>{comp.pe}x</td>
                  <td colSpan={3} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* P/E Bar chart */}
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={peData.filter((d) => d.pe !== null)} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis dataKey="name" tick={CHART_AXIS} />
            <YAxis tick={CHART_AXIS} tickFormatter={(v) => `${v}x`} />
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(v) => [`${(v as number).toFixed(1)}x`, "P/E"]}
            />
            {TRADFI_COMPS.map((comp) => (
              <ReferenceLine
                key={comp.ticker}
                y={comp.pe}
                stroke="#9ca3af"
                strokeDasharray="5 4"
                label={{ value: `${comp.ticker} ${comp.pe}x`, fill: "#9ca3af", fontSize: 10, position: "insideTopRight" }}
              />
            ))}
            <Bar dataKey="pe" name="P/E Ratio" radius={[4, 4, 0, 0]}>
              {peData.filter((d) => d.pe !== null).map((d) => (
                <Cell key={d.id} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── SECTION B2: Live On-Chain Buybacks ────────────────── */}
      <div style={{ ...section }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
              Live On-Chain Buybacks
            </h2>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
              Daily buyback activity pulled directly from on-chain sources. HYPE: HL API (public). Lighter/Aster: DefiLlama fees proxy. EdgeX: Etherscan burns.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
            <PillGroup
              options={[{ label: "USD Value", value: "usd" }, { label: "Token Count", value: "tokens" }]}
              value={liveMetric}
              onChange={setLiveMetric}
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <PillGroup
                options={[{ label: "30d", value: "30" }, { label: "60d", value: "60" }, { label: "90d", value: "90" }]}
                value={liveDaysStr}
                onChange={setLiveDaysStr}
              />
              <button
                onClick={() => setLiveShowCumulative((v) => !v)}
                style={{
                  padding: "3px 10px", borderRadius: "999px", fontSize: "12px",
                  fontWeight: liveShowCumulative ? 600 : 400,
                  background: liveShowCumulative ? "#7c3aed" : "var(--bg-secondary)",
                  color: liveShowCumulative ? "#fff" : "var(--text-secondary)",
                  border: `1px solid ${liveShowCumulative ? "#7c3aed" : "var(--border)"}`,
                  cursor: "pointer",
                }}
              >
                Cumulative
              </button>
            </div>
          </div>
        </div>

        {/* Summary stat row */}
        {liveSummary && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", marginBottom: "16px" }}>
            {liveSummary.map((s) => {
              const cfg = TOKEN_CONFIGS.find((c) => c.id === s.tokenId)!;
              const lb = liveBuybacks?.find((b) => b.tokenId === s.tokenId);
              return (
                <div key={s.tokenId} style={{ background: "var(--bg-secondary)", borderRadius: "6px", padding: "10px 12px", borderLeft: `3px solid ${cfg.color}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                    <span style={{ fontWeight: 700, fontSize: "13px" }}>{cfg.ticker}</span>
                    <span style={{
                      fontSize: "9px", padding: "1px 5px", borderRadius: "999px", fontWeight: 600,
                      background: s.isLive ? "#4ade8022" : "#f59e0b22",
                      color: s.isLive ? "#4ade80" : "#f59e0b",
                    }}>
                      {s.isLive ? "🔴 LIVE" : "~ EST"}
                    </span>
                  </div>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
                    {s.totalUsd > 0 ? fmtCompact(s.totalUsd) : (s.totalTokens > 0 ? fmtTokens(s.totalTokens) + " " + cfg.ticker : "—")}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
                    {liveDays}d buybacks
                    {s.totalTx > 0 && ` · ${s.totalTx.toLocaleString()} txs`}
                  </div>
                  {lb?.error && (
                    <div style={{ fontSize: "9px", color: "#f87171", marginTop: "3px", wordBreak: "break-all" as const }}>
                      {lb.error.slice(0, 80)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Chart */}
        {liveBuybacksLoading ? (
          <div style={{ height: "340px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: "13px" }}>
            Fetching on-chain data…
          </div>
        ) : liveBuybackChartData.length === 0 ? (
          <div style={{ height: "200px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: "13px" }}>
            No data returned. Check API availability.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={liveBuybackChartData} margin={{ top: 10, right: liveShowCumulative ? 64 : 20, left: 10, bottom: 5 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="date" tick={{ ...CHART_AXIS, fontSize: 10 }} angle={-25} textAnchor="end" height={44} />
              <YAxis yAxisId="left" tick={CHART_AXIS} tickFormatter={liveMetric === "usd" ? fmtCompact : (v) => fmtTokens(v as number)} />
              {liveShowCumulative && (
                <YAxis yAxisId="right" orientation="right" tick={CHART_AXIS} tickFormatter={liveMetric === "usd" ? fmtCompact : (v) => fmtTokens(v as number)} />
              )}
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(value, name) => {
                  const n = name as string;
                  const isCum = n.endsWith("_cum");
                  const id = isCum ? n.replace("_cum", "") : n;
                  const ticker = TOKEN_CONFIGS.find((c) => c.id === id)?.ticker ?? id;
                  const fmt = liveMetric === "usd" ? fmtCompact(value as number) : fmtTokens(value as number);
                  return [fmt, isCum ? `${ticker} Cumul.` : ticker];
                }}
              />
              <Legend
                formatter={(v) => {
                  const s = v as string;
                  const isCum = s.endsWith("_cum");
                  const id = isCum ? s.replace("_cum", "") : s;
                  const ticker = TOKEN_CONFIGS.find((c) => c.id === id)?.ticker ?? id;
                  return isCum ? `${ticker} (cum.)` : ticker;
                }}
                wrapperStyle={{ fontSize: "11px" }}
              />
              {TOKEN_CONFIGS.map((cfg) => (
                <Bar yAxisId="left" key={cfg.id} dataKey={cfg.id} name={cfg.id} fill={cfg.color} radius={[2, 2, 0, 0]} fillOpacity={0.85} stackId="daily" />
              ))}
              {liveShowCumulative && TOKEN_CONFIGS.map((cfg) => (
                <Line
                  yAxisId="right"
                  key={`${cfg.id}_cum`}
                  dataKey={`${cfg.id}_cum`}
                  name={`${cfg.id}_cum`}
                  stroke={cfg.color}
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="4 2"
                  connectNulls
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {/* Per-source legend */}
        {liveBuybacks && (
          <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {liveBuybacks.map((td) => {
              const cfg = TOKEN_CONFIGS.find((c) => c.id === td.tokenId)!;
              return (
                <div key={td.tokenId} style={{ fontSize: "10px", color: "var(--text-secondary)", display: "flex", gap: "6px", alignItems: "flex-start" }}>
                  <span style={{ color: cfg.color, fontWeight: 700, flexShrink: 0 }}>{cfg.ticker}:</span>
                  <span style={{ color: td.isLive ? "#4ade80" : "#f59e0b" }}>{td.isLive ? "🔴" : "~"}</span>
                  <span>{td.source}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SECTION C: Buyback History ─────────────────────────── */}
      <div style={{ ...section }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
          <SectionHeader title="Buyback History" subtitle="Seeded from public on-chain data. Estimated values shown at 50% opacity." />
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
            <PillGroup
              options={[
                { label: "USD Value", value: "usd" },
                { label: "Token Count", value: "tokens" },
                { label: "% Circ Supply", value: "pct_circ" },
                { label: "% FDV Supply", value: "pct_fdv" },
              ]}
              value={buybackMetric}
              onChange={setBuybackMetric}
            />
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <PillGroup
                options={[
                  { label: "Daily", value: "daily" },
                  { label: "Weekly", value: "weekly" },
                  { label: "Monthly", value: "monthly" },
                  { label: "3-Month", value: "3month" },
                  { label: "Yearly", value: "yearly" },
                ]}
                value={buybackGranularity}
                onChange={setBuybackGranularity}
              />
              <button
                onClick={() => setShowCumulative((v) => !v)}
                style={{
                  padding: "3px 10px",
                  borderRadius: "999px",
                  fontSize: "12px",
                  fontWeight: showCumulative ? 600 : 400,
                  background: showCumulative ? "#7c3aed" : "var(--bg-secondary)",
                  color: showCumulative ? "#fff" : "var(--text-secondary)",
                  border: `1px solid ${showCumulative ? "#7c3aed" : "var(--border)"}`,
                  cursor: "pointer",
                  whiteSpace: "nowrap" as const,
                }}
              >
                + Cumulative
              </button>
            </div>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={buybackChartData} margin={{ top: 10, right: showCumulative ? 60 : 20, left: 10, bottom: 5 }}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis dataKey="period" tick={CHART_AXIS} angle={-20} textAnchor="end" height={40} />
            <YAxis
              yAxisId="left"
              tick={CHART_AXIS}
              tickFormatter={
                buybackMetric === "usd" ? fmtCompact
                : buybackMetric === "tokens" ? (v) => fmtTokens(v as number)
                : (v) => `${v}%`
              }
            />
            {showCumulative && (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={CHART_AXIS}
                tickFormatter={fmtCompact}
                label={{ value: "Cumulative USD", angle: 90, position: "insideRight", fill: "#9ca3af", fontSize: 10, dx: 14 }}
              />
            )}
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(value, name) => {
                const nameStr = name as string;
                if (nameStr.endsWith("_cum")) {
                  const id = nameStr.replace("_cum", "");
                  const ticker = TOKEN_CONFIGS.find((c) => c.id === id)?.ticker ?? id;
                  return [fmtCompact(value as number), `${ticker} Cumulative`];
                }
                const ticker = TOKEN_CONFIGS.find((c) => c.id === nameStr)?.ticker ?? nameStr;
                if (buybackMetric === "usd") return [fmtCompact(value as number), ticker];
                if (buybackMetric === "tokens") return [fmtTokens(value as number), ticker];
                return [`${(value as number).toFixed(4)}%`, ticker];
              }}
            />
            <Legend
              formatter={(value) => {
                const v = value as string;
                if (v.endsWith("_cum")) {
                  const id = v.replace("_cum", "");
                  return `${TOKEN_CONFIGS.find((c) => c.id === id)?.ticker ?? id} (cum.)`;
                }
                return TOKEN_CONFIGS.find((c) => c.id === v)?.ticker ?? v;
              }}
              wrapperStyle={{ fontSize: "12px" }}
            />
            {TOKEN_CONFIGS.map((cfg) => (
              <Bar yAxisId="left" key={cfg.id} dataKey={cfg.id} name={cfg.id} fill={cfg.color} radius={[3, 3, 0, 0]} fillOpacity={0.85} />
            ))}
            {showCumulative && TOKEN_CONFIGS.map((cfg) => (
              <Line
                yAxisId="right"
                key={`${cfg.id}_cum`}
                dataKey={`${cfg.id}_cum`}
                name={`${cfg.id}_cum`}
                stroke={cfg.color}
                strokeWidth={2}
                dot={false}
                strokeDasharray="4 2"
                strokeOpacity={0.9}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>

        {/* Source legend */}
        <div style={{ marginTop: "12px", display: "flex", flexWrap: "wrap", gap: "16px" }}>
          {TOKEN_CONFIGS.map((cfg) => {
            const events = BUYBACK_EVENTS.filter((e) => e.tokenId === cfg.id);
            const sources = [...new Set(events.map((e) => e.source))];
            return (
              <div key={cfg.id} style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                <span style={{ color: cfg.color, fontWeight: 600 }}>{cfg.ticker}:</span>{" "}
                {sources.slice(0, 2).join(" · ")}
                {cfg.dataQuality === "partial" && <span style={{ color: "#f59e0b" }}> (estimated)</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── SECTION D: Buyback % of Supply ─────────────────────── */}
      <div style={{ ...section }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
          <SectionHeader
            title="Buyback as % of Supply"
            subtitle="Total tokens bought back ÷ circulating supply (or FDV token equivalent)."
          />
          <PillGroup
            options={[{ label: "Circulating Supply", value: "circ" }, { label: "FDV", value: "fdv" }]}
            value={supplyBasis}
            onChange={setSupplyBasis}
          />
        </div>

        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={supplyPctData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis dataKey="name" tick={CHART_AXIS} />
            <YAxis tick={CHART_AXIS} tickFormatter={(v) => `${v}%`} />
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(v, _name, item) => {
                const cfg = TOKEN_CONFIGS.find((c) => c.id === (item as { payload?: { id?: string } })?.payload?.id);
                return [`${(v as number).toFixed(4)}%`, `${cfg?.ticker ?? ""} bought back`];
              }}
            />
            <Bar dataKey="pct" name="% Bought Back" radius={[4, 4, 0, 0]}>
              {supplyPctData.map((d) => (
                <Cell key={d.id} fill={d.color} fillOpacity={TOKEN_CONFIGS.find((c) => c.id === d.id)?.dataQuality === "partial" ? 0.55 : 0.9} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        <p style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "10px" }}>
          Basis: {supplyBasis === "circ" ? "Circulating supply (live from CoinGecko, seed fallback)" : "FDV token equivalent (FDV ÷ current price)"}.
          Faded bars = estimated buyback data. Seed data as of 2026-03-31.
        </p>
      </div>

      {/* ── SECTION E: Revenue & Fees ───────────────────────────── */}
      <div style={{ ...section }}>
        <SectionHeader title="Revenue & Fee Distribution" subtitle="Live 30-day fees from DefiLlama. Fee distribution from protocol documentation." />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          {/* 30d Fees bar chart */}
          <div>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px", fontWeight: 600 }}>
              30-Day Fees (Live)
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={feeCompData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis dataKey="name" tick={CHART_AXIS} />
                <YAxis tick={CHART_AXIS} tickFormatter={fmtCompact} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [fmtCompact(v as number), "30d Fees"]} />
                <Bar dataKey="fees30d" name="30d Fees" radius={[4, 4, 0, 0]}>
                  {feeCompData.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {loading && (
              <p style={{ fontSize: "11px", color: "var(--text-secondary)", textAlign: "center", marginTop: "4px" }}>
                Loading live data...
              </p>
            )}
          </div>

          {/* Fee distribution stacked */}
          <div>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px", fontWeight: 600 }}>
              Fee Distribution (% of Total Fees)
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={feeDistData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis dataKey="name" tick={CHART_AXIS} />
                <YAxis tick={CHART_AXIS} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [`${v}%`, name]} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar dataKey="Buyback" stackId="a" fill="#4ade80" radius={[0, 0, 0, 0]} />
                <Bar dataKey="LP Rewards" stackId="a" fill="#60a5fa" />
                <Bar dataKey="Treasury" stackId="a" fill="#9ca3af" />
                <Bar dataKey="Other" stackId="a" fill="#374151" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Footer / Methodology ────────────────────────────────── */}
      <div
        style={{
          ...card,
          marginBottom: "32px",
          fontSize: "12px",
          color: "var(--text-secondary)",
          lineHeight: "1.7",
        }}
      >
        <h3 style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: "10px", fontSize: "14px" }}>
          Methodology & Data Sources
        </h3>
        <p style={{ marginBottom: "6px" }}>
          <strong>P/E Formula:</strong> P/E = (Circulating Supply × Price) ÷ (30-day Annualized Revenue × Buyback Rate).
          Annualized Revenue = 30d Fees × (365/30). Framework from Arthur Hayes &quot;$HYPE Man&quot; (March 9, 2026).
          TradFi comps: CME Group (~26x), Robinhood (~35x), Coinbase (~40x).
        </p>
        <p style={{ marginBottom: "6px" }}>
          <strong>Live data:</strong> Prices, market cap, and FDV from CoinGecko (IDs: hyperliquid, lighter, aster-2, edgex).
          30-day fees from DefiLlama (slugs: hyperliquid-perps, lighter-perps, aster-perps, edgex-perps). Refreshed every 5 minutes.
        </p>
        <p style={{ marginBottom: "6px" }}>
          <strong>Buyback history — primary on-chain sources:</strong>{" "}
          Hyperliquid: wallet <code style={{ fontSize: "10px", background: "#1f2937", padding: "1px 4px", borderRadius: "3px" }}>0xfefe…fefe</code> — hypurrscan.io.
          Cumulative $1.083B verified via DefiLlama (April 2026). Monthly figures are proportional estimates; verify per-tx on hypurrscan.
          Aster: buyback wallet <code style={{ fontSize: "10px", background: "#1f2937", padding: "1px 4px", borderRadius: "3px" }}>0x6648…BE0F</code> on BSC → burns to dead address.
          Total confirmed burned: 98.86M ASTER (asterburn.info S1–S6). Analytics: tokenomist.ai/aster-2/buyback.
          Lighter: treasury account 0 (app.lighter.xyz/explorer/accounts/0) — daily TWAP. Analytics: tokenomist.ai/lighter/buyback.
          EdgeX: first confirmed burn 2.528M EDGE (April 2 2026). Token: <code style={{ fontSize: "10px", background: "#1f2937", padding: "1px 4px", borderRadius: "3px" }}>0xb007…a241</code> on Ethereum. Daily 24h burns ongoing.
        </p>
        <p>
          <strong>Caveats:</strong> Hyperliquid and Aster monthly breakdown figures are proportional estimates — exact daily amounts on-chain via hypurrscan.io / BscScan.
          Lighter buyback rate (50%) is estimated — not publicly disclosed. EdgeX buyback rate (40%) is estimated.
          Aster emission overhaul (March 30 2026) reduced monthly emissions by 97%; S6 figures are small.
          All seed data as of 2026-04-05. DYOR. Not investment advice.
        </p>
      </div>

      <div style={{ textAlign: "center", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "24px" }}>
        Crypto Centre of Excellence — Tokenomics Research | Built April 2026
      </div>
    </div>
  );
}
