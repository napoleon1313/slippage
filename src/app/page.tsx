"use client";

import { useState, useCallback } from "react";
import {
  EXCHANGES,
  ASSETS,
  NOTIONAL_SIZES,
  type Side,
  type ExchangeConfig,
} from "@/lib/exchanges";
import {
  calculateSlippage,
  calculateAvgSlippage,
  type OrderBook,
  type SlippageResult,
} from "@/lib/slippage";

// ─── Types ─────────────────────────────────────────────────────

interface SnapshotEntry {
  exchange: string;
  asset: string;
  notional: number;
  side: Side;
  slippageBps: number | null;
  feeBps: number;
  totalCostBps: number | null;
  midPrice: number | null;
  avgFillPrice: number | null;
  fullyFilled: boolean;
  error?: string;
}

interface Snapshot {
  id: string;
  timestamp: Date;
  entries: SnapshotEntry[];
}

type Method = "slippage" | "allin";

// Custom asset added via the "+" button
interface CustomAsset {
  id: string;
  displayName: string;
  // Map exchange id → symbol string (or market_id string for Lighter, or null if N/A)
  symbols: Record<string, string | null>;
}

// ─── Helpers ───────────────────────────────────────────────────

function formatBps(val: number | null | undefined): string {
  if (val === null || val === undefined) return "--";
  return val.toFixed(2);
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${n / 1_000_000}M`;
  if (n >= 1_000) return `$${n / 1_000}K`;
  return `$${n}`;
}

// Merge ASSETS + customAssets into a single list
function buildAllAssets(customAssets: CustomAsset[]) {
  const base = ASSETS.map((a) => ({
    id: a.id,
    displayName: a.displayName,
    isCustom: false,
    symbols: {} as Record<string, string | null>,
  }));
  const custom = customAssets.map((a) => ({
    id: a.id,
    displayName: a.displayName,
    isCustom: true,
    symbols: a.symbols,
  }));
  return [...base, ...custom];
}

// ─── Main Component ────────────────────────────────────────────

export default function Dashboard() {
  const [side, setSide] = useState<Side>("avg");
  const [method, setMethod] = useState<Method>("slippage");
  const [loading, setLoading] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [currentData, setCurrentData] = useState<
    Record<string, Record<string, OrderBook>>
  >({}); // exchange -> asset -> OrderBook
  const [results, setResults] = useState<
    Record<string, Record<string, Record<number, Record<Side, SlippageResult | null>>>>
  >({}); // exchange -> asset -> notional -> side -> result
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [enabledExchanges, setEnabledExchanges] = useState<string[]>(
    EXCHANGES.map((e) => e.id)
  );
  const [enabledAssets, setEnabledAssets] = useState<string[]>(
    ASSETS.map((a) => a.id)
  );

  // ─── Custom assets ─────────────────────────────────────────
  const [customAssets, setCustomAssets] = useState<CustomAsset[]>([]);
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [newAssetId, setNewAssetId] = useState("");
  const [newAssetDisplay, setNewAssetDisplay] = useState("");
  const [newAssetSymbols, setNewAssetSymbols] = useState<Record<string, string>>({});

  const allAssets = buildAllAssets(customAssets);

  const addCustomAsset = useCallback(() => {
    const id = newAssetId.trim().toUpperCase();
    if (!id || !newAssetDisplay.trim()) return;
    if (allAssets.some((a) => a.id === id)) {
      alert(`Asset "${id}" already exists.`);
      return;
    }
    const asset: CustomAsset = {
      id,
      displayName: newAssetDisplay.trim(),
      symbols: Object.fromEntries(
        EXCHANGES.map((ex) => [ex.id, newAssetSymbols[ex.id]?.trim() || null])
      ),
    };
    setCustomAssets((prev) => [...prev, asset]);
    setEnabledAssets((prev) => [...prev, id]);
    setNewAssetId("");
    setNewAssetDisplay("");
    setNewAssetSymbols({});
    setShowAddAsset(false);
  }, [newAssetId, newAssetDisplay, newAssetSymbols, allAssets]);

  const removeCustomAsset = useCallback((id: string) => {
    setCustomAssets((prev) => prev.filter((a) => a.id !== id));
    setEnabledAssets((prev) => prev.filter((a) => a !== id));
  }, []);

  // ─── Fee overrides ─────────────────────────────────────────
  // Global per-exchange override
  const [feeOverrides, setFeeOverrides] = useState<Record<string, number>>({});
  // HIP-3: per-asset Hyperliquid fee overrides
  const [hip3Overrides, setHip3Overrides] = useState<Record<string, number>>({});

  const getFeeBps = useCallback(
    (exchangeId: string, assetId?: string) => {
      // HIP-3 per-asset override (Hyperliquid only)
      if (exchangeId === "hyperliquid" && assetId && hip3Overrides[assetId] !== undefined) {
        return hip3Overrides[assetId];
      }
      // Global per-exchange override
      if (feeOverrides[exchangeId] !== undefined) return feeOverrides[exchangeId];
      // Default
      return EXCHANGES.find((e) => e.id === exchangeId)?.takerFeeBps ?? 0;
    },
    [feeOverrides, hip3Overrides]
  );

  // ─── Fetch all order books ─────────────────────────────────

  const fetchAllBooks = useCallback(async () => {
    setLoading(true);
    setErrors({});

    const newBooks: Record<string, Record<string, OrderBook>> = {};
    const newErrors: Record<string, string> = {};

    const fetchPromises: Promise<void>[] = [];

    const activeAssets = allAssets.filter((a) => enabledAssets.includes(a.id));

    for (const exchange of EXCHANGES.filter((e) =>
      enabledExchanges.includes(e.id)
    )) {
      for (const asset of activeAssets) {
        // Determine symbol: built-in assets use EXCHANGES config; custom assets use their symbols map
        let symbol: string | null = null;
        if (asset.isCustom) {
          symbol = asset.symbols[exchange.id] ?? null;
        } else {
          symbol = exchange.symbols[asset.id] ?? null;
        }

        if (!symbol) continue; // Not available on this exchange

        // Build URL with optional symbol override (for custom assets)
        const isCustom = asset.isCustom;
        const url = isCustom
          ? `/api/orderbook?exchange=${exchange.id}&asset=${asset.id}&symbol=${encodeURIComponent(symbol)}`
          : `/api/orderbook?exchange=${exchange.id}&asset=${asset.id}`;

        const p = fetch(url)
          .then((res) => res.json())
          .then((data) => {
            if (data.error && (!data.bids || data.bids.length === 0)) {
              newErrors[`${exchange.id}-${asset.id}`] = data.error;
              return;
            }
            if (!newBooks[exchange.id]) newBooks[exchange.id] = {};
            newBooks[exchange.id][asset.id] = {
              bids: data.bids || [],
              asks: data.asks || [],
              timestamp: data.timestamp,
              exchange: exchange.id,
              asset: asset.id,
            };
          })
          .catch((err) => {
            newErrors[`${exchange.id}-${asset.id}`] = String(err);
          });

        fetchPromises.push(p);
      }
    }

    await Promise.all(fetchPromises);
    setCurrentData(newBooks);
    setErrors(newErrors);

    // Calculate slippage for all combinations
    const newResults: typeof results = {};

    for (const exchange of EXCHANGES.filter((e) =>
      enabledExchanges.includes(e.id)
    )) {
      newResults[exchange.id] = {};

      for (const asset of activeAssets) {
        newResults[exchange.id][asset.id] = {};
        const feeBps = getFeeBps(exchange.id, asset.id);
        const book = newBooks[exchange.id]?.[asset.id];

        for (const notional of NOTIONAL_SIZES) {
          newResults[exchange.id][asset.id][notional] = {
            buy: book ? calculateSlippage(book, notional, "buy", feeBps) : null,
            sell: book ? calculateSlippage(book, notional, "sell", feeBps) : null,
            avg: null,
          };

          const buyRes = newResults[exchange.id][asset.id][notional].buy;
          const sellRes = newResults[exchange.id][asset.id][notional].sell;
          newResults[exchange.id][asset.id][notional].avg =
            calculateAvgSlippage(buyRes, sellRes);
        }
      }
    }

    setResults(newResults);
    setLastFetchTime(new Date());
    setLoading(false);
  }, [enabledExchanges, enabledAssets, allAssets, getFeeBps]);

  // ─── Save snapshot (audit trail) ───────────────────────────

  const saveSnapshot = useCallback(() => {
    const entries: SnapshotEntry[] = [];

    for (const exchange of EXCHANGES.filter((e) =>
      enabledExchanges.includes(e.id)
    )) {
      for (const asset of allAssets.filter((a) => enabledAssets.includes(a.id))) {
        for (const notional of NOTIONAL_SIZES) {
          for (const s of ["buy", "sell", "avg"] as Side[]) {
            const r = results[exchange.id]?.[asset.id]?.[notional]?.[s];
            entries.push({
              exchange: exchange.id,
              asset: asset.id,
              notional,
              side: s,
              slippageBps: r?.slippageBps ?? null,
              feeBps: getFeeBps(exchange.id, asset.id),
              totalCostBps: r?.totalCostBps ?? null,
              midPrice: r?.midPrice ?? null,
              avgFillPrice: r?.avgFillPrice ?? null,
              fullyFilled: r?.fullyFilled ?? false,
              error: errors[`${exchange.id}-${asset.id}`],
            });
          }
        }
      }
    }

    const snap: Snapshot = {
      id: `snap-${Date.now()}`,
      timestamp: new Date(),
      entries,
    };

    setSnapshots((prev) => [snap, ...prev]);
  }, [results, errors, enabledExchanges, enabledAssets, allAssets, getFeeBps]);

  // ─── Export snapshot as CSV ────────────────────────────────

  const exportCsv = useCallback(
    (snap: Snapshot) => {
      const header =
        "timestamp,exchange,asset,notional,side,slippage_bps,fee_bps,total_cost_bps,mid_price,avg_fill_price,fully_filled,error\n";
      const rows = snap.entries
        .map(
          (e) =>
            `${snap.timestamp.toISOString()},${e.exchange},${e.asset},${e.notional},${e.side},${e.slippageBps ?? ""},${e.feeBps},${e.totalCostBps ?? ""},${e.midPrice ?? ""},${e.avgFillPrice ?? ""},${e.fullyFilled},${e.error ?? ""}`
        )
        .join("\n");

      const blob = new Blob([header + rows], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `slippage-snapshot-${snap.timestamp.toISOString().slice(0, 19)}.csv`;
      a.click();
    },
    []
  );

  // ─── Get cell value ────────────────────────────────────────

  const getCellValue = useCallback(
    (exchangeId: string, assetId: string, notional: number): string => {
      const r = results[exchangeId]?.[assetId]?.[notional]?.[side];
      if (!r) return "--";
      if (method === "allin") return formatBps(r.totalCostBps);
      return formatBps(r.slippageBps);
    },
    [results, side, method]
  );

  // Find best (lowest) value for highlighting
  const getBestExchange = useCallback(
    (assetId: string, notional: number): string | null => {
      let bestId: string | null = null;
      let bestVal = Infinity;

      for (const exchange of EXCHANGES.filter((e) =>
        enabledExchanges.includes(e.id)
      )) {
        const r = results[exchange.id]?.[assetId]?.[notional]?.[side];
        if (!r) continue;
        const val = method === "allin" ? r.totalCostBps : r.slippageBps;
        if (val !== null && val < bestVal) {
          bestVal = val;
          bestId = exchange.id;
        }
      }

      return bestId;
    },
    [results, side, method, enabledExchanges]
  );

  // ─── Render ────────────────────────────────────────────────

  const activeExchanges = EXCHANGES.filter((e) => enabledExchanges.includes(e.id));
  const dexExchanges = activeExchanges.filter((e) => e.type === "dex");
  const cexExchanges = activeExchanges.filter((e) => e.type === "cex");

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--bg-primary)" }}>
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--text-secondary)" }}>
          KPMG Crypto CoE — Execution Cost Research
        </p>
        <h1 className="text-2xl font-bold">Perp Exchange Slippage Dashboard</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Live order book slippage comparison across perpetual exchanges. Data
          from exchange APIs via simulated market order fills.
        </p>
      </div>

      {/* Controls */}
      <div
        className="rounded-lg p-4 mb-4 flex flex-wrap gap-6 items-start"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        {/* Side toggle */}
        <div>
          <label className="text-xs uppercase tracking-wider block mb-2" style={{ color: "var(--text-secondary)" }}>
            Side
          </label>
          <div className="flex gap-1">
            {(["buy", "sell", "avg"] as Side[]).map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className="px-3 py-1.5 rounded text-sm font-medium transition-colors"
                style={{
                  background: side === s ? "#2563eb" : "var(--bg-secondary)",
                  color: side === s ? "#fff" : "var(--text-secondary)",
                }}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Method toggle */}
        <div>
          <label className="text-xs uppercase tracking-wider block mb-2" style={{ color: "var(--text-secondary)" }}>
            Method
          </label>
          <div className="flex gap-1">
            <button
              onClick={() => setMethod("slippage")}
              className="px-3 py-1.5 rounded text-sm font-medium transition-colors"
              style={{
                background: method === "slippage" ? "#2563eb" : "var(--bg-secondary)",
                color: method === "slippage" ? "#fff" : "var(--text-secondary)",
              }}
            >
              BPs from Mid
            </button>
            <button
              onClick={() => setMethod("allin")}
              className="px-3 py-1.5 rounded text-sm font-medium transition-colors"
              style={{
                background: method === "allin" ? "#2563eb" : "var(--bg-secondary)",
                color: method === "allin" ? "#fff" : "var(--text-secondary)",
              }}
            >
              All-in Cost
            </button>
          </div>
        </div>

        {/* Exchange toggles */}
        <div>
          <label className="text-xs uppercase tracking-wider block mb-2" style={{ color: "var(--text-secondary)" }}>
            Exchanges
          </label>
          <div className="flex flex-wrap gap-1">
            {EXCHANGES.map((ex) => {
              const active = enabledExchanges.includes(ex.id);
              return (
                <button
                  key={ex.id}
                  onClick={() =>
                    setEnabledExchanges((prev) =>
                      active ? prev.filter((id) => id !== ex.id) : [...prev, ex.id]
                    )
                  }
                  className="px-2 py-1 rounded text-xs font-medium transition-colors"
                  style={{
                    background: active ? ex.color + "22" : "var(--bg-secondary)",
                    color: active ? ex.color : "var(--text-secondary)",
                    border: `1px solid ${active ? ex.color + "55" : "var(--border)"}`,
                  }}
                >
                  {ex.name}
                  <span className="ml-1 text-[10px] opacity-60">{ex.type.toUpperCase()}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Fetch button */}
        <div className="ml-auto flex gap-2 items-end">
          <button
            onClick={fetchAllBooks}
            disabled={loading}
            className="px-5 py-2 rounded font-medium text-sm transition-colors"
            style={{
              background: loading ? "var(--border)" : "#2563eb",
              color: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Fetching..." : "Fetch Order Books"}
          </button>
          {lastFetchTime && (
            <button
              onClick={saveSnapshot}
              className="px-4 py-2 rounded font-medium text-sm"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                color: "var(--accent-green)",
              }}
            >
              Save Snapshot
            </button>
          )}
        </div>
      </div>

      {/* Fee Inputs Row */}
      <div
        className="rounded-lg p-4 mb-4"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        {/* Global fee overrides */}
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wider block mb-2" style={{ color: "var(--text-secondary)" }}>
            Fee Inputs (BPS) — Global Override
          </label>
          <div className="flex flex-wrap gap-3">
            {EXCHANGES.filter((e) => enabledExchanges.includes(e.id)).map((ex) => (
              <div key={ex.id} className="flex items-center gap-1">
                <span
                  className="text-xs px-2 py-1 rounded font-medium"
                  style={{ background: ex.color + "22", color: ex.color }}
                >
                  {ex.name}
                </span>
                <input
                  type="number"
                  step="0.1"
                  className="w-16 px-2 py-1 rounded text-sm"
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                  value={feeOverrides[ex.id] ?? ex.takerFeeBps}
                  onChange={(e) =>
                    setFeeOverrides((prev) => ({
                      ...prev,
                      [ex.id]: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </div>

        {/* HIP-3 Growth Markets — Hyperliquid per-asset fee overrides */}
        {enabledExchanges.includes("hyperliquid") && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs uppercase tracking-wider" style={{ color: "var(--accent-green)" }}>
                HIP-3 Growth Markets — Hyperliquid Per-Asset Fee (BPS)
              </label>
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#4ade8022", color: "#4ade80", border: "1px solid #4ade8044" }}>
                Hyperliquid only
              </span>
            </div>
            <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
              Override the taker fee per asset for HIP-3 incentivised markets. Leave unchanged to use the global Hyperliquid fee above.
            </p>
            <div className="flex flex-wrap gap-3">
              {allAssets.filter((a) => enabledAssets.includes(a.id)).map((asset) => {
                const hlExchange = EXCHANGES.find((e) => e.id === "hyperliquid");
                const defaultFee = feeOverrides["hyperliquid"] ?? hlExchange?.takerFeeBps ?? 4.5;
                return (
                  <div key={asset.id} className="flex items-center gap-1">
                    <span className="text-xs px-2 py-1 rounded font-medium" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                      {asset.displayName}
                    </span>
                    <input
                      type="number"
                      step="0.1"
                      className="w-16 px-2 py-1 rounded text-sm"
                      style={{
                        background: "var(--bg-secondary)",
                        border: hip3Overrides[asset.id] !== undefined
                          ? "1px solid #4ade8088"
                          : "1px solid var(--border)",
                        color: "var(--text-primary)",
                      }}
                      value={hip3Overrides[asset.id] ?? defaultFee}
                      onChange={(e) =>
                        setHip3Overrides((prev) => ({
                          ...prev,
                          [asset.id]: parseFloat(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Timestamp */}
      {lastFetchTime && (
        <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
          Data: order book snapshots from {lastFetchTime.toLocaleDateString()},{" "}
          {lastFetchTime.toLocaleTimeString()} local time
        </p>
      )}

      {/* Results Table */}
      {lastFetchTime && (
        <div
          className="rounded-lg overflow-hidden mb-8"
          style={{ border: "1px solid var(--border)" }}
        >
          <table className="w-full">
            <thead>
              <tr style={{ background: "var(--bg-card)" }}>
                <th className="text-left p-3 text-sm font-semibold" style={{ minWidth: 160 }}>
                  Asset
                </th>
                {NOTIONAL_SIZES.map((n) => (
                  <th key={n} className="text-center p-3 text-sm font-semibold" style={{ minWidth: 180 }}>
                    {formatUsd(n)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allAssets.filter((a) => enabledAssets.includes(a.id)).map((asset) => (
                <tr
                  key={asset.id}
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{asset.displayName}</span>
                      {asset.isCustom && (
                        <button
                          onClick={() => removeCustomAsset(asset.id)}
                          className="text-xs px-1 rounded"
                          style={{ color: "var(--accent-red)", border: "1px solid var(--border)" }}
                          title="Remove custom asset"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </td>
                  {NOTIONAL_SIZES.map((notional) => {
                    const bestEx = getBestExchange(asset.id, notional);
                    return (
                      <td key={notional} className="p-3">
                        <div className="space-y-1">
                          {/* DEX group */}
                          {dexExchanges.length > 0 && (
                            <>
                              <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-secondary)" }}>
                                DEX
                              </div>
                              {dexExchanges.map((ex) => {
                                const val = getCellValue(ex.id, asset.id, notional);
                                const isBest = ex.id === bestEx && val !== "--";
                                const hasError = errors[`${ex.id}-${asset.id}`];
                                return (
                                  <div
                                    key={ex.id}
                                    className="flex items-center justify-between px-2 py-1 rounded text-sm"
                                    style={{
                                      background: isBest ? ex.color + "18" : "transparent",
                                    }}
                                  >
                                    <span className="font-medium text-xs" style={{ color: ex.color }}>
                                      {ex.name}{isBest && " 🏆"}
                                    </span>
                                    <span
                                      className="font-mono"
                                      style={{
                                        color: val === "--" ? "var(--text-secondary)" : "var(--text-primary)",
                                      }}
                                      title={hasError || undefined}
                                    >
                                      {val === "--" ? "--" : `${val} bps`}
                                    </span>
                                  </div>
                                );
                              })}
                            </>
                          )}

                          {/* CEX group */}
                          {cexExchanges.length > 0 && (
                            <>
                              <div
                                className="text-[10px] uppercase tracking-wider mt-1.5 mb-0.5 pt-1.5"
                                style={{
                                  color: "var(--text-secondary)",
                                  borderTop: dexExchanges.length > 0 ? "1px solid var(--border)" : "none",
                                }}
                              >
                                CEX
                              </div>
                              {cexExchanges.map((ex) => {
                                const val = getCellValue(ex.id, asset.id, notional);
                                const isBest = ex.id === bestEx && val !== "--";
                                const hasError = errors[`${ex.id}-${asset.id}`];
                                return (
                                  <div
                                    key={ex.id}
                                    className="flex items-center justify-between px-2 py-1 rounded text-sm"
                                    style={{
                                      background: isBest ? ex.color + "18" : "transparent",
                                    }}
                                  >
                                    <span className="font-medium text-xs" style={{ color: ex.color }}>
                                      {ex.name}{isBest && " 🏆"}
                                    </span>
                                    <span
                                      className="font-mono"
                                      style={{
                                        color: val === "--" ? "var(--text-secondary)" : "var(--text-primary)",
                                      }}
                                      title={hasError || undefined}
                                    >
                                      {val === "--" ? "--" : `${val} bps`}
                                    </span>
                                  </div>
                                );
                              })}
                            </>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Add custom asset row */}
              {!showAddAsset ? (
                <tr style={{ borderTop: "1px solid var(--border)" }}>
                  <td colSpan={NOTIONAL_SIZES.length + 1} className="p-2">
                    <button
                      onClick={() => setShowAddAsset(true)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors w-full"
                      style={{
                        background: "transparent",
                        color: "var(--accent-blue)",
                        border: "1px dashed var(--border)",
                      }}
                    >
                      <span className="text-lg leading-none">+</span>
                      <span>Add asset</span>
                    </button>
                  </td>
                </tr>
              ) : (
                <tr style={{ borderTop: "1px solid var(--border)" }}>
                  <td colSpan={NOTIONAL_SIZES.length + 1} className="p-3">
                    <div
                      className="rounded-lg p-3"
                      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                    >
                      <p className="text-xs font-bold mb-3" style={{ color: "var(--text-primary)" }}>
                        Add Custom Asset
                      </p>
                      <div className="flex flex-wrap gap-3 mb-3">
                        <div>
                          <label className="text-xs block mb-1" style={{ color: "var(--text-secondary)" }}>Asset ID (e.g. SOL)</label>
                          <input
                            type="text"
                            className="px-2 py-1 rounded text-sm w-24"
                            style={{
                              background: "var(--bg-primary)",
                              border: "1px solid var(--border)",
                              color: "var(--text-primary)",
                            }}
                            value={newAssetId}
                            onChange={(e) => setNewAssetId(e.target.value.toUpperCase())}
                            placeholder="SOL"
                          />
                        </div>
                        <div>
                          <label className="text-xs block mb-1" style={{ color: "var(--text-secondary)" }}>Display Name</label>
                          <input
                            type="text"
                            className="px-2 py-1 rounded text-sm w-36"
                            style={{
                              background: "var(--bg-primary)",
                              border: "1px solid var(--border)",
                              color: "var(--text-primary)",
                            }}
                            value={newAssetDisplay}
                            onChange={(e) => setNewAssetDisplay(e.target.value)}
                            placeholder="SOL/USD"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3 mb-3">
                        {EXCHANGES.map((ex) => (
                          <div key={ex.id}>
                            <label className="text-xs block mb-1" style={{ color: ex.color }}>
                              {ex.name} symbol
                              {ex.id === "lighter" && (
                                <span className="ml-1 text-[10px]" style={{ color: "var(--text-secondary)" }}>(market_id)</span>
                              )}
                            </label>
                            <input
                              type="text"
                              className="px-2 py-1 rounded text-sm w-32"
                              style={{
                                background: "var(--bg-primary)",
                                border: "1px solid var(--border)",
                                color: "var(--text-primary)",
                              }}
                              value={newAssetSymbols[ex.id] || ""}
                              onChange={(e) =>
                                setNewAssetSymbols((prev) => ({
                                  ...prev,
                                  [ex.id]: e.target.value,
                                }))
                              }
                              placeholder={
                                ex.id === "lighter" ? "market_id" :
                                ex.id === "aster" ? "e.g. SOLUSDT" :
                                ex.id === "hyperliquid" ? "e.g. SOL" :
                                "e.g. SOL-PERP-INTX"
                              }
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={addCustomAsset}
                          className="px-3 py-1.5 rounded text-sm font-medium"
                          style={{ background: "#2563eb", color: "#fff" }}
                        >
                          Add Asset
                        </button>
                        <button
                          onClick={() => {
                            setShowAddAsset(false);
                            setNewAssetId("");
                            setNewAssetDisplay("");
                            setNewAssetSymbols({});
                          }}
                          className="px-3 py-1.5 rounded text-sm font-medium"
                          style={{
                            background: "var(--bg-primary)",
                            border: "1px solid var(--border)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Audit Trail / Snapshots */}
      {snapshots.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold mb-3">Audit Trail — Saved Snapshots</h2>
          <div className="space-y-2">
            {snapshots.map((snap) => (
              <div
                key={snap.id}
                className="flex items-center justify-between p-3 rounded-lg"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                }}
              >
                <div>
                  <span className="text-sm font-medium">
                    {snap.timestamp.toLocaleDateString()}{" "}
                    {snap.timestamp.toLocaleTimeString()}
                  </span>
                  <span className="text-xs ml-3" style={{ color: "var(--text-secondary)" }}>
                    {snap.entries.filter((e) => e.side === "avg").length} data points
                  </span>
                </div>
                <button
                  onClick={() => exportCsv(snap)}
                  className="px-3 py-1 rounded text-sm font-medium"
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border)",
                    color: "var(--accent-blue)",
                  }}
                >
                  Export CSV
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Methodology note */}
      <div
        className="rounded-lg p-4 text-sm"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          color: "var(--text-secondary)",
        }}
      >
        <h3 className="font-bold mb-2" style={{ color: "var(--text-primary)" }}>
          Methodology
        </h3>
        <p className="mb-2">
          <strong>BPs from Mid:</strong> Measures pure market-impact slippage against each
          venue&apos;s own mid price (best bid + best ask) / 2. The simulated
          market order walks the L2 order book level-by-level until the target
          notional is filled. Does not include trading fees.
        </p>
        <p className="mb-2">
          <strong>All-in Cost:</strong> Slippage + taker fee (configurable above).
          Shows the total round-trip execution cost as seen by a taker.
          Useful for cross-venue comparison including fee differences.
        </p>
        <p className="mb-2">
          <strong>Data source:</strong> Live L2 order book snapshots fetched simultaneously
          via each exchange&apos;s public REST API — Lighter (zkLighter mainnet),
          Aster DEX (fapi.asterdex.com), Hyperliquid, and Coinbase Advanced Trade.
          Snapshots are taken at the same moment for comparability.
        </p>
        <p className="mb-2">
          <strong>Asset availability:</strong> Gold (XAU) and Oil (WTI/CL) are available
          on Lighter, Aster, and Hyperliquid only. Coinbase perps currently list BTC and ETH only.
        </p>
        <p>
          <strong>HIP-3 Growth Markets:</strong> Hyperliquid&apos;s HIP-3 programme incentivises
          liquidity in newer markets with modified fee structures. Use the HIP-3 fee inputs above
          to model different fee scenarios per asset on Hyperliquid.
        </p>
      </div>

      {/* Footer */}
      <div className="mt-6 text-xs text-center" style={{ color: "var(--text-secondary)" }}>
        KPMG Canada — Crypto Centre of Excellence — Execution Cost Research |
        Built March 2026
      </div>
    </div>
  );
}
