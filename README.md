# Market — Research-First Trading Platform

A single-user platform for Indian-market (NSE/BSE) equity research, backtesting,
and paper trading, with a safely-gated, read-only Zerodha integration.

**Live order placement does not exist in this codebase.** The broker
integration only reads holdings/positions/margins. Paper trading is the
default and only tradeable mode.

## Structure

- `backend/` — Node.js + Express + better-sqlite3 API server
- `website/` — Next.js dashboard

## Setup

```bash
cp .env.example .env   # fill in your Zerodha credentials (optional — the app runs without them)

cd backend && npm install
cd ../website && npm install
```

The root `.env` is read by the backend only (Node doesn't look at parent
directories). The website defaults to `http://localhost:4000` for the API
with no config needed; to point it elsewhere, create `website/.env.local`
with `NEXT_PUBLIC_API_URL=http://your-host:4000`.

## Running

```bash
# Terminal 1
cd backend && npm start        # API on :4000, seeds industries/templates on boot

# Terminal 2
cd website && npm run dev     # dashboard on :3000
```

## Safety design

- `paper` is the default broker mode. Live modes (`live_readonly`,
  `live_confirm`, `live_auto`) can't even be selected in the UI unless
  `LIVE_TRADING_UNLOCKED=true` is set in `.env` — and even then, no live
  order-placement code exists yet, so selecting a live mode only unlocks
  read-only account data.
- Every order (paper included) flows through one choke point
  (`backend/src/broker/gateway.js`) → risk engine → mode gate, and every
  attempt is logged to `order_log` with pass/fail reasons, visible on the
  Risk page.
- A kill switch halts all order creation instantly, paper included.
- The logger redacts any field whose key looks like a secret
  (`api_key`, `secret`, `token`, `password`, `totp`) before it's ever
  written to console, disk, or an API response.

## Data

`backend/data/market.db` (SQLite, gitignored) holds everything: stocks,
industries, research notes, prompt templates, candles, strategies,
backtests, paper account/orders/positions, and the risk/order-log audit
trail.

Daily candles come from CSV import or Yahoo Finance (free, `.NS`/`.BO`
suffix) by default. A Kite historical-data adapter exists behind the same
interface but requires Zerodha's paid Historical Data API add-on.
