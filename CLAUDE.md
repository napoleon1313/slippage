# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Production build
npm run start    # Start production server
```

No test or lint scripts are configured.

## Architecture

A Next.js App Router dashboard that fetches live L2 order books from 4 perpetual exchanges and calculates slippage/execution cost at multiple notional sizes.

### Data flow

1. **`src/app/page.tsx`** — Single client component (~700 lines). Drives all UI state: enabled exchanges/assets, side (buy/sell/avg), measurement mode (slippage vs. all-in), global fee overrides, HIP-3 per-asset fee overrides, custom asset management, snapshot audit trail, CSV export.
2. **`src/app/api/orderbook/route.ts`** — Two endpoints:
   - `GET` — fetch one exchange+asset order book. Supports `?symbol=` override for custom assets.
   - `POST` — fetch all enabled combinations in parallel.
   Each exchange has a bespoke fetcher function that normalizes responses to the shared `OrderBook` interface.
3. **`src/lib/slippage.ts`** — Pure calculation logic. `calculateSlippage()` walks order book levels to simulate a market order fill; returns mid price, avg fill price, slippage in bps, fee bps, total cost bps, and fill completeness.
4. **`src/lib/exchanges.ts`** — Static config: 4 exchanges, 4 assets (BTC, ETH, XAU/Gold, WTI/Oil), 4 notional sizes ($10K–$10M), default taker fees per exchange.

### Key data structures

```typescript
// Normalized order book returned by the API route
interface OrderBook { bids/asks: {price, size}[]; timestamp; exchange; asset }

// Output of slippage.ts
interface SlippageResult { midPrice; avgFillPrice; slippageBps; feeBps; totalCostBps; notional; side; filledNotional; fullyFilled }

// Audit snapshot saved in page.tsx state
interface Snapshot { id; timestamp; entries: SnapshotEntry[] }

// Custom asset added via the "+" button in the table
interface CustomAsset { id; displayName; symbols: Record<exchangeId, symbol|null> }
```

### Exchanges

| Exchange | Type | Fee (bps) | Assets | API |
|---|---|---|---|---|
| Lighter | DEX | 0 | BTC (id=1), ETH (id=0), Gold (id=92), Oil/WTI (id=145) | `mainnet.zklighter.elliot.ai/api/v1/orderBookOrders?market_id=N` |
| Aster | DEX | 3.5 | BTC (BTCUSDT), ETH (ETHUSDT), Gold (XAUUSDT), Oil (CLUSDT) | `fapi.asterdex.com/fapi/v1/depth` — Binance-compatible |
| Hyperliquid | DEX | 4.5 | BTC, ETH, GOLD, OIL | `api.hyperliquid.xyz/info` POST l2Book |
| Coinbase | CEX | 3.0 | BTC (BTC-PERP-INTX), ETH (ETH-PERP-INTX) only | `api.coinbase.com/api/v3/brokerage/market/product_book` |

**Note:** Lighter uses integer market IDs, not symbol strings. Gold=92, WTI=145 confirmed from live API (prices ~$4,511 and ~$102 respectively). CLUSDT is Aster's symbol for WTI crude light.

### Adding a Custom Asset ("+")

The dashboard supports adding assets beyond the built-in 4. Click "+" in the table to open the form:
- Provide an asset ID (e.g. SOL), display name (e.g. SOL/USD)
- For each exchange, enter the symbol (or market_id integer for Lighter). Leave blank = not available.
- Custom assets use `?symbol=` query param override when fetching from the API.

### HIP-3 Growth Markets

Hyperliquid's HIP-3 programme incentivises liquidity in newer/smaller markets with reduced fees. The "HIP-3 Growth Markets" section in the fee panel lets you set a per-asset taker fee override for Hyperliquid only. Priority: HIP-3 per-asset override > global exchange override > default fee.

### Styling

Tailwind CSS v4 with a dark theme defined via CSS custom properties in `src/app/globals.css`.
Exchange colors: Lighter=#facc15, Aster=#e879f9, Hyperliquid=#4ade80, Coinbase=#0052ff.
