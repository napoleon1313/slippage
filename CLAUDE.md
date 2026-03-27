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

A Next.js App Router dashboard that fetches live L2 order books from 5 perpetual exchanges and calculates slippage/execution cost at multiple notional sizes.

### Data flow

1. **`src/app/page.tsx`** — Single client component (~600 lines). Drives all UI state: enabled exchanges/assets, side (buy/sell/avg), measurement mode (slippage vs. all-in), fee overrides, snapshot audit trail, CSV export.
2. **`src/app/api/orderbook/route.ts`** — Two endpoints:
   - `GET` — fetch one exchange+asset order book
   - `POST` — fetch all enabled combinations in parallel
   Each exchange has a bespoke fetcher function that normalizes responses to the shared `OrderBook` interface.
3. **`src/lib/slippage.ts`** — Pure calculation logic. `calculateSlippage()` walks order book levels to simulate a market order fill; returns mid price, avg fill price, slippage in bps, fee bps, total cost bps, and fill completeness.
4. **`src/lib/exchanges.ts`** — Static config: 5 exchanges, 5 assets (BTC, ETH, XAU/Gold, WTI/Oil, XAG/Silver), 4 notional sizes ($10K–$10M), default taker fees per exchange.

### Key data structures

```typescript
// Normalized order book returned by the API route
interface OrderBook { bids/asks: {price, size}[]; timestamp; exchange; asset }

// Output of slippage.ts
interface SlippageResult { midPrice; avgFillPrice; slippageBps; feeBps; totalCostBps; notional; side; filledNotional; fullyFilled }

// Audit snapshot saved in page.tsx state
interface Snapshot { id; timestamp; entries: SnapshotEntry[] }
```

### Exchanges

| Exchange | Type | Notes |
|---|---|---|
| Hyperliquid | DEX | Default 4.5 bps fee |
| Lighter | DEX | 0 bps fee, BTC/ETH only |
| Binance | CEX | 4.5 bps fee, BTC/ETH only |
| Coinbase | CEX | 3.0 bps fee, BTC/ETH only |
| Ostium | DEX | 10 bps fee, oracle-based — no real order book, uses synthetic depth |

### Styling

Tailwind CSS v4 with a dark theme defined via CSS custom properties in `src/app/globals.css`.
