import { NextRequest, NextResponse } from "next/server";

interface OrderBookLevel {
  price: number;
  size: number;
}

interface OrderBookResponse {
  exchange: string;
  asset: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
  error?: string;
}

// ─── HYPERLIQUID ───────────────────────────────────────────────

async function fetchHyperliquid(asset: string, symbolOverride?: string): Promise<OrderBookResponse> {
  // Map our asset IDs to Hyperliquid coin names
  const hlMap: Record<string, string> = {
    BTC: "BTC",
    ETH: "ETH",
    XAU: "xyz:GOLD", // RWA market prefix required
    WTI: "xyz:CL",  // WTI crude light, RWA market prefix required
  };

  const coin = symbolOverride || hlMap[asset] || asset;

  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "l2Book", coin }),
    });

    if (!res.ok) {
      // Try to find the asset in meta
      const metaRes = await fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "meta" }),
      });
      const meta = await metaRes.json();
      const found = meta.universe?.find(
        (m: { name: string }) =>
          m.name.toUpperCase().includes(asset) ||
          m.name.toUpperCase().includes(hlMap[asset] || "")
      );
      if (found) {
        const retryRes = await fetch("https://api.hyperliquid.xyz/info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "l2Book", coin: found.name }),
        });
        const data = await retryRes.json();
        return parseHyperliquidBook(data, asset);
      }
      return {
        exchange: "hyperliquid",
        asset,
        bids: [],
        asks: [],
        timestamp: Date.now(),
        error: "Asset not found",
      };
    }

    const data = await res.json();
    return parseHyperliquidBook(data, asset);
  } catch (e) {
    return {
      exchange: "hyperliquid",
      asset,
      bids: [],
      asks: [],
      timestamp: Date.now(),
      error: String(e),
    };
  }
}

function parseHyperliquidBook(
  data: { levels: [Array<{ px: string; sz: string; n: number }>, Array<{ px: string; sz: string; n: number }>] },
  asset: string
): OrderBookResponse {
  const bids: OrderBookLevel[] = (data.levels?.[0] || []).map(
    (l: { px: string; sz: string }) => ({
      price: parseFloat(l.px),
      size: parseFloat(l.sz),
    })
  );
  const asks: OrderBookLevel[] = (data.levels?.[1] || []).map(
    (l: { px: string; sz: string }) => ({
      price: parseFloat(l.px),
      size: parseFloat(l.sz),
    })
  );

  return {
    exchange: "hyperliquid",
    asset,
    bids,
    asks,
    timestamp: Date.now(),
  };
}

// ─── COINBASE ──────────────────────────────────────────────────

async function fetchCoinbase(asset: string, symbolOverride?: string): Promise<OrderBookResponse> {
  const symbolMap: Record<string, string | null> = {
    BTC: "BTC-PERP-INTX",
    ETH: "ETH-PERP-INTX",
    XAU: null, // Not available on Coinbase perps
    WTI: null, // Not available on Coinbase perps
  };

  const symbol = symbolOverride || symbolMap[asset];
  if (!symbol) {
    return {
      exchange: "coinbase",
      asset,
      bids: [],
      asks: [],
      timestamp: Date.now(),
      error: "Asset not available on Coinbase perps",
    };
  }

  try {
    const res = await fetch(
      `https://api.coinbase.com/api/v3/brokerage/market/product_book?product_id=${symbol}&limit=500`
    );
    const data = await res.json();

    const pricebook = data.pricebook;
    if (!pricebook) {
      return {
        exchange: "coinbase",
        asset,
        bids: [],
        asks: [],
        timestamp: Date.now(),
        error: "No pricebook data",
      };
    }

    const bids: OrderBookLevel[] = (pricebook.bids || []).map(
      (l: { price: string; size: string }) => ({
        price: parseFloat(l.price),
        size: parseFloat(l.size),
      })
    );
    const asks: OrderBookLevel[] = (pricebook.asks || []).map(
      (l: { price: string; size: string }) => ({
        price: parseFloat(l.price),
        size: parseFloat(l.size),
      })
    );

    return { exchange: "coinbase", asset, bids, asks, timestamp: Date.now() };
  } catch (e) {
    return {
      exchange: "coinbase",
      asset,
      bids: [],
      asks: [],
      timestamp: Date.now(),
      error: String(e),
    };
  }
}

// ─── LIGHTER ───────────────────────────────────────────────────
// Lighter uses integer market IDs. Our exchanges.ts stores them as strings.
// Known IDs: ETH=0, BTC=1, XAU(Gold)=92, WTI(Oil)=145

async function fetchLighter(asset: string, symbolOverride?: string): Promise<OrderBookResponse> {
  // Market IDs stored as strings in exchanges.ts symbols map
  const marketIdMap: Record<string, number | null> = {
    BTC: 1,
    ETH: 0,
    XAU: 92,  // Gold — confirmed ~$4,511
    WTI: 145, // WTI crude oil — confirmed ~$102
  };

  // symbolOverride contains the market_id as a string when used for custom assets
  const marketId = symbolOverride !== undefined
    ? parseInt(symbolOverride, 10)
    : marketIdMap[asset];

  if (marketId === null || marketId === undefined || isNaN(marketId)) {
    return {
      exchange: "lighter",
      asset,
      bids: [],
      asks: [],
      timestamp: Date.now(),
      error: "Asset not available on Lighter",
    };
  }

  try {
    const res = await fetch(
      `https://mainnet.zklighter.elliot.ai/api/v1/orderBookOrders?market_id=${marketId}&limit=250`
    );
    const data = await res.json();

    const bids: OrderBookLevel[] = (data.bids || []).map(
      (l: { price: string; remaining_base_amount: string }) => ({
        price: parseFloat(l.price),
        size: parseFloat(l.remaining_base_amount),
      })
    );
    const asks: OrderBookLevel[] = (data.asks || []).map(
      (l: { price: string; remaining_base_amount: string }) => ({
        price: parseFloat(l.price),
        size: parseFloat(l.remaining_base_amount),
      })
    );

    return { exchange: "lighter", asset, bids, asks, timestamp: Date.now() };
  } catch (e) {
    return {
      exchange: "lighter",
      asset,
      bids: [],
      asks: [],
      timestamp: Date.now(),
      error: String(e),
    };
  }
}

// ─── BINANCE ───────────────────────────────────────────────────

async function fetchBinance(asset: string, symbolOverride?: string): Promise<OrderBookResponse> {
  const symbolMap: Record<string, string | null> = {
    BTC: "BTCUSDT",
    ETH: "ETHUSDT",
    XAU: "XAUUSDT", // Gold confirmed live on Binance futures (~$4,487)
    WTI: null,       // Not available on Binance futures
  };

  const symbol = symbolOverride || symbolMap[asset];
  if (!symbol) {
    return {
      exchange: "binance",
      asset,
      bids: [],
      asks: [],
      timestamp: Date.now(),
      error: "Asset not available on Binance futures",
    };
  }

  try {
    const res = await fetch(
      `https://fapi.binance.com/fapi/v1/depth?symbol=${symbol}&limit=1000`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    const data = await res.json();

    if (data.code && data.msg) {
      return {
        exchange: "binance",
        asset,
        bids: [],
        asks: [],
        timestamp: Date.now(),
        error: `Binance error: ${data.msg}`,
      };
    }

    const bids: OrderBookLevel[] = (data.bids || []).map(
      (l: [string, string]) => ({
        price: parseFloat(l[0]),
        size: parseFloat(l[1]),
      })
    );
    const asks: OrderBookLevel[] = (data.asks || []).map(
      (l: [string, string]) => ({
        price: parseFloat(l[0]),
        size: parseFloat(l[1]),
      })
    );

    return { exchange: "binance", asset, bids, asks, timestamp: Date.now() };
  } catch (e) {
    return {
      exchange: "binance",
      asset,
      bids: [],
      asks: [],
      timestamp: Date.now(),
      error: String(e),
    };
  }
}

// ─── ASTER ─────────────────────────────────────────────────────
// Aster DEX uses a Binance-compatible REST API at fapi.asterdex.com
// Symbols: BTCUSDT, ETHUSDT, XAUUSDT (Gold), CLUSDT (WTI crude)

async function fetchAster(asset: string, symbolOverride?: string): Promise<OrderBookResponse> {
  const symbolMap: Record<string, string | null> = {
    BTC: "BTCUSDT",
    ETH: "ETHUSDT",
    XAU: "XAUUSDT", // Gold — confirmed live
    WTI: "CLUSDT",  // WTI crude light — confirmed live (~$102)
  };

  const symbol = symbolOverride || symbolMap[asset];
  if (!symbol) {
    return {
      exchange: "aster",
      asset,
      bids: [],
      asks: [],
      timestamp: Date.now(),
      error: "Asset not available on Aster",
    };
  }

  try {
    const res = await fetch(
      `https://fapi.asterdex.com/fapi/v1/depth?symbol=${symbol}&limit=1000`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    const data = await res.json();

    if (data.code && data.msg) {
      return {
        exchange: "aster",
        asset,
        bids: [],
        asks: [],
        timestamp: Date.now(),
        error: `Aster API error: ${data.msg}`,
      };
    }

    const bids: OrderBookLevel[] = (data.bids || []).map(
      (l: [string, string]) => ({
        price: parseFloat(l[0]),
        size: parseFloat(l[1]),
      })
    );
    const asks: OrderBookLevel[] = (data.asks || []).map(
      (l: [string, string]) => ({
        price: parseFloat(l[0]),
        size: parseFloat(l[1]),
      })
    );

    return { exchange: "aster", asset, bids, asks, timestamp: Date.now() };
  } catch (e) {
    return {
      exchange: "aster",
      asset,
      bids: [],
      asks: [],
      timestamp: Date.now(),
      error: String(e),
    };
  }
}

// ─── EDGEX ─────────────────────────────────────────────────────
// EdgeX uses numeric contractIds. Known: BTC=10000001, ETH=10000002,
// XAU(Gold)=10000234, WTI(CL)=10000283, XAG(Silver)=10000278

async function fetchEdgex(asset: string, symbolOverride?: string): Promise<OrderBookResponse> {
  const contractIdMap: Record<string, string | null> = {
    BTC: "10000001",
    ETH: "10000002",
    XAU: "10000234", // XAUTUSD (Gold)
    WTI: "10000283", // CLUSD (Crude Oil)
    XAG: "10000278", // SILVERUSD
  };

  const contractId = symbolOverride || contractIdMap[asset];
  if (!contractId) {
    return { exchange: "edgex", asset, bids: [], asks: [], timestamp: Date.now(), error: "Asset not available on EdgeX" };
  }

  try {
    const res = await fetch(
      `https://pro.edgex.exchange/api/v1/public/quote/getDepth?contractId=${contractId}&level=200`
    );
    const data = await res.json();

    const bids: OrderBookLevel[] = (data.bids || []).map(
      (l: { price: string; size: string }) => ({ price: parseFloat(l.price), size: parseFloat(l.size) })
    );
    const asks: OrderBookLevel[] = (data.asks || []).map(
      (l: { price: string; size: string }) => ({ price: parseFloat(l.price), size: parseFloat(l.size) })
    );

    return { exchange: "edgex", asset, bids, asks, timestamp: Date.now() };
  } catch (e) {
    return { exchange: "edgex", asset, bids: [], asks: [], timestamp: Date.now(), error: String(e) };
  }
}

// ─── ROUTE HANDLER ─────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const exchange = searchParams.get("exchange");
  const asset = searchParams.get("asset");
  // Optional symbol override for custom assets
  const symbolOverride = searchParams.get("symbol") ?? undefined;

  if (!exchange || !asset) {
    return NextResponse.json(
      { error: "Missing exchange or asset param" },
      { status: 400 }
    );
  }

  let result: OrderBookResponse;

  switch (exchange) {
    case "hyperliquid":
      result = await fetchHyperliquid(asset, symbolOverride);
      break;
    case "coinbase":
      result = await fetchCoinbase(asset, symbolOverride);
      break;
    case "lighter":
      result = await fetchLighter(asset, symbolOverride);
      break;
    case "aster":
      result = await fetchAster(asset, symbolOverride);
      break;
    case "binance":
      result = await fetchBinance(asset, symbolOverride);
      break;
    case "edgex":
      result = await fetchEdgex(asset, symbolOverride);
      break;
    default:
      return NextResponse.json(
        { error: `Unknown exchange: ${exchange}` },
        { status: 400 }
      );
  }

  return NextResponse.json(result);
}

// Fetch ALL exchanges for a given asset in parallel
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { asset, exchanges } = body as {
    asset: string;
    exchanges: string[];
  };

  if (!asset || !exchanges) {
    return NextResponse.json(
      { error: "Missing asset or exchanges" },
      { status: 400 }
    );
  }

  const fetchers: Record<string, (a: string) => Promise<OrderBookResponse>> = {
    hyperliquid: fetchHyperliquid,
    coinbase: fetchCoinbase,
    lighter: fetchLighter,
    aster: fetchAster,
    binance: fetchBinance,
    edgex: fetchEdgex,
  };

  const results = await Promise.all(
    exchanges.map((ex) => {
      const fetcher = fetchers[ex];
      if (!fetcher) {
        return Promise.resolve({
          exchange: ex,
          asset,
          bids: [],
          asks: [],
          timestamp: Date.now(),
          error: `Unknown exchange: ${ex}`,
        } as OrderBookResponse);
      }
      return fetcher(asset);
    })
  );

  return NextResponse.json({ asset, results, timestamp: Date.now() });
}
