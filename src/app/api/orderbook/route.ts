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

async function fetchHyperliquid(asset: string): Promise<OrderBookResponse> {
  // First get meta to resolve HIP-3 symbols if needed
  let coin = asset;

  // Map our asset IDs to Hyperliquid coin names
  const hlMap: Record<string, string> = {
    BTC: "BTC",
    ETH: "ETH",
    XAU: "GOLD",
    WTI: "OIL",
    XAG: "SILVER",
  };

  coin = hlMap[asset] || asset;

  // Try fetching with the mapped name, fall back to checking all metas
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

// ─── BINANCE ───────────────────────────────────────────────────

async function fetchBinance(asset: string): Promise<OrderBookResponse> {
  const symbolMap: Record<string, string | null> = {
    BTC: "BTCUSDT",
    ETH: "ETHUSDT",
    XAU: null,
    WTI: null,
    XAG: null,
  };

  const symbol = symbolMap[asset];
  if (!symbol) {
    return {
      exchange: "binance",
      asset,
      bids: [],
      asks: [],
      timestamp: Date.now(),
      error: "Asset not available on Binance perps",
    };
  }

  try {
    const res = await fetch(
      `https://fapi.binance.com/fapi/v1/depth?symbol=${symbol}&limit=1000`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    const data = await res.json();

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

// ─── COINBASE ──────────────────────────────────────────────────

async function fetchCoinbase(asset: string): Promise<OrderBookResponse> {
  const symbolMap: Record<string, string | null> = {
    BTC: "BTC-PERP-INTX",
    ETH: "ETH-PERP-INTX",
    XAU: null,
    WTI: null,
    XAG: null,
  };

  const symbol = symbolMap[asset];
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
    // Coinbase Advanced Trade API - product book
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

async function fetchLighter(asset: string): Promise<OrderBookResponse> {
  // Lighter market IDs: ETH=0, BTC=1
  const marketIdMap: Record<string, number | null> = {
    BTC: 1,
    ETH: 0,
    XAU: null,
    WTI: null,
    XAG: null,
  };

  const marketId = marketIdMap[asset];
  if (marketId === null || marketId === undefined) {
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

// ─── OSTIUM ────────────────────────────────────────────────────

async function fetchOstium(asset: string): Promise<OrderBookResponse> {
  // Ostium is oracle-based — slippage = oracle bid/ask spread (not size-dependent).
  // We build a synthetic order book with a single massive level at the oracle bid/ask
  // so the slippage calculator reflects the true execution cost.
  const assetMap: Record<string, string> = {
    BTC: "BTCUSD",
    ETH: "ETHUSD",
    XAU: "XAUUSD",
    WTI: "CLUSD", // Ostium uses CL (crude light) for WTI
    XAG: "XAGUSD",
  };

  const ostiumAsset = assetMap[asset];
  if (!ostiumAsset) {
    return {
      exchange: "ostium",
      asset,
      bids: [],
      asks: [],
      timestamp: Date.now(),
      error: "Asset not available on Ostium",
    };
  }

  try {
    const res = await fetch(
      `https://metadata-backend.ostium.io/PricePublish/latest-price?asset=${ostiumAsset}`
    );
    const data = await res.json();

    if (!data.bid || !data.ask) {
      return {
        exchange: "ostium",
        asset,
        bids: [],
        asks: [],
        timestamp: Date.now(),
        error: "No price data from Ostium oracle",
      };
    }

    const bid = parseFloat(data.bid);
    const ask = parseFloat(data.ask);

    // Synthetic depth: $1B notional at oracle prices — slippage is spread-only, not size-dependent
    const largeSize = 1_000_000_000 / ask;

    return {
      exchange: "ostium",
      asset,
      bids: [{ price: bid, size: largeSize }],
      asks: [{ price: ask, size: largeSize }],
      timestamp: Date.now(),
    };
  } catch (e) {
    return {
      exchange: "ostium",
      asset,
      bids: [],
      asks: [],
      timestamp: Date.now(),
      error: String(e),
    };
  }
}

// ─── ROUTE HANDLER ─────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const exchange = searchParams.get("exchange");
  const asset = searchParams.get("asset");

  if (!exchange || !asset) {
    return NextResponse.json(
      { error: "Missing exchange or asset param" },
      { status: 400 }
    );
  }

  let result: OrderBookResponse;

  switch (exchange) {
    case "hyperliquid":
      result = await fetchHyperliquid(asset);
      break;
    case "binance":
      result = await fetchBinance(asset);
      break;
    case "coinbase":
      result = await fetchCoinbase(asset);
      break;
    case "lighter":
      result = await fetchLighter(asset);
      break;
    case "ostium":
      result = await fetchOstium(asset);
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
    binance: fetchBinance,
    coinbase: fetchCoinbase,
    lighter: fetchLighter,
    ostium: fetchOstium,
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
