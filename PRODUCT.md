# Kite product contract

Kite is a self-custody interface for tokenized equities on Solana. Users discover thematic stock baskets, practice allocations with virtual funds, conduct in-depth stock research, set up automated recurring investments, and trade from their own Solana wallets — all without a Kite vault or custodial intermediary.

## Trading modes

- **Paper**: $10,000 starting virtual USD. No seeded holdings or history. Reference-price buys, sells, stock-to-stock swaps, basket allocations, watchlist, activity log with CSV export, and recurring paper plans — all stored locally per device. Missed intervals are never backfilled.
- **Actual**: Non-custodial mainnet trading via connected Solana wallets (Phantom, Solflare) or Privy embedded wallets. Jupiter Swap V2 quotes and V1 wallet-approved transactions. Assets are held directly by the wallet.
- **Mobile**: Expo / React Native. Android signs through MWA (Solana Mobile Wallet Adapter). iOS and Expo web use the configured Privy web flow.
- **Mode toggle**: A persistent header switch lets users flip between Paper and Actual at any time.

## Data

Issuer-confirmed Solana mint catalogs from xStocks (`api.xstocks.fi`) and PreStocks (`prestocks.com`). Jupiter token-market metadata and price observations (tokens-v2, price-v3). Pyth oracle feeds for underlying share price references. Yahoo Finance for OHLCV historical bars, fundamental timeseries, and company metadata. Wikipedia API for company descriptions. Google News RSS for market and stock-specific headlines. Solscan for on-chain explorer links.

Unknown data remains unavailable. Paused and reference-only products stay visible with trading blocked. No fabricated charts, financial statements, news, sentiment, returns, fills, or customer metrics.

## Thematic baskets (12 curated)

Baskets are curated allocation definitions into individual assets — not Kite-issued basket tokens and not synthetic mints. Buying a basket delivers individual tokenized equities directly to the user's wallet via a single atomic V1 transaction. Equal-weight allocation uses the Largest Remainder Method (Hare-Niemeyer) in BigInt arithmetic — zero dust leakage. If any constituent is missing or unpriced, the basket is marked unavailable and trading is blocked.

| Basket | Ticker | Category | Constituents |
|---|---|---|---|
| The Magnificent Seven | SOL-MAG7 | Technology | AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA |
| Intelligence Layer | SOL-AI | Technology | NVDA, MSFT, GOOGL, AMZN, ORCL |
| The Silicon Stack | SOL-CHIPS | Technology | NVDA, AMD, AVGO, TSM, ASML |
| Work in the Cloud | SOL-CLOUD | Technology | MSFT, CRM, ORCL, NOW |
| Everyday Economy | SOL-LIFE | Consumer | AAPL, AMZN, MCD, SBUX, KO |
| Health, Ahead | SOL-HEALTH | Healthcare | LLY, JNJ, ABBV, UNH, MRK |
| Money in Motion | SOL-FIN | Finance | JPM, GS, V, MA |
| Strategic Systems | SOL-DEF | Industrials | LMT, RTX, NOC, PLTR |
| Energy Backbone | SOL-ENERGY | Energy | XOM, CVX, COP |
| Built to Move | SOL-BUILD | Industrials | CAT, DE, GE, HON |
| A Wider Lens | SOL-CORE | Diversified | SPY, QQQ, GLD |
| Private Frontiers | SOL-PRE | Private | Dynamic PreStocks catalog |

## Recurring investing (SIP / DCA)

- **Paper plans**: Configurable cadence (daily, weekly, bi-weekly, monthly). Run due installments only while the app is open. Never backfill missed intervals. Device-local.
- **Mainnet — Solana Subscriptions**: Bounded delegation via the official program (`De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44`). Parameters: funding token, max per period, period seconds, number of periods, UTC expiration. Funds never leave the wallet until an installment executes. Revocable anytime. The permission itself cannot prevent an authorized buyer from collecting without delivery using a different transaction — this trust boundary is disclosed during approval.
- **Mainnet — Kite Guard** (devnet): On-chain Anchor program (`Fg6PaFpoGXkYidMpWEEe9nM3q7x5JqFHvXy6n3sNof9S`) enforcing plan parameters. Cadence, weights summing to 10,000 bps, max 20 assets. Permissionless cranker execution. Owner can close plan and reclaim rent at any time.

## Stock research (5-tab panel)

- **Overview**: 1-year daily OHLCV chart (Yahoo Finance), interactive SVG scrubber, period selectors (1M/3M/6M/1Y), day and 52-week range bars, company profile description (Wikipedia + Yahoo Finance).
- **Technicals**: SMA 20/50/200, RSI-14, 20-day average volume, trend badge (above/below/at 50-day average).
- **Fundamentals**: Annual and quarterly — revenue, gross profit, operating income, net income, operating cash flow, free cash flow, diluted EPS, operating margin, profit margin. Historical revenue bar chart.
- **News**: Real-time stock-specific Google News RSS feed with source attribution.
- **Events**: Dividends, splits, SEC filings.

## Market Pulse

Real advancing/declining/unchanged asset counts derived from observed 24h price changes — not manufactured sentiment. Visual breadth bar (green/gray/red segments). 24h aggregate trading volume. Top mover leaderboards: most traded (volume), top gainers, top losers.

## Portfolio, activity and watchlist

- **Paper portfolio**: Balance card, available cash, holdings value, total return %, total PnL. Holdings table with quantity, cost basis, current value, and return.
- **Actual portfolio**: Live on-chain SPL / Token-2022 wallet token balances with Solscan explorer links.
- **Activity**: Order audit log with timestamps, side, quantity, price, total. CSV export.
- **Watchlist**: Bookmarkable assets with live pricing.

## Pages and navigation

Landing (hero, basket marquee, 3-step walkthrough) / Discover dashboard (featured baskets, Market Pulse, asset table, paper account card, headlines) / Markets directory (full catalog, search, filters) / Baskets catalog (category filters, basket cards) / Basket detail (composition, allocation bars, paper/actual buy) / Stock detail (price, issuer, research panel, paper buy/sell, paper swap, actual trade panel) / Portfolio / Recurring plans / Watchlist / Activity and orders / Settings (auth, wallet, mode toggle, reset).

Web uses a left sidebar with command palette. Mobile uses bottom navigation.

## Design

Use the shared forest/lime Kite system with geometric symbols and no emoji. Forest green background (`#0a1a0f`), electric lime accent (`#d4f933`), clean borders, monospace tabular numerals. Provide consistent web and mobile navigation, forms, review screens, error states and empty states. Design tokens live in `apps/web/app/globals.css` and `apps/mobile/src/theme.ts`.
