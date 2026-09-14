# AGENTS.md

## Project: Kite (Non-Custodial Neo-Brokerage on Solana)

Kite is a self-custody interface for tokenized equities on Solana. It offers 12 curated thematic stock baskets (e.g. `SOL-MAG7`, `SOL-AI`, `SOL-CHIPS`), automated non-custodial recurring investing (SIP / DCA) via Solana Subscriptions and the on-chain `kite_guard` Anchor program, deep stock research (1-year charts, technicals, fundamentals, news, corporate actions), and real-time market breadth and sentiment — all without holding user funds in any vault.

Both a paper-trading sandbox ($10,000 virtual USD) and wallet-approved mainnet trading are supported. Web and mobile share a single SDK.

Target: Solana Foundation $100,000 Tokenized Stocks Hackathon (Deadline: Friday, 18 September, 4:00pm ET).

---

## Workspace Architecture

```
kite/
  ├── apps/
  │   ├── web/                     # Next.js 15.5 App Router dApp (Privy + Wallet Adapter, Tailwind CSS)
  │   └── mobile/                  # React Native / Expo dApp (MWA on Android, Privy web flow on iOS)
  ├── packages/
  │   ├── sdk/                     # Shared TypeScript SDK (@kite/sdk) — markets, baskets, paper, research, trading, recurring
  │   └── anchor/                  # Solana smart contract: kite_guard (on-chain execution guard for recurring investments)
  ├── docs/                        # Architecture docs, protocol security, deployment readiness, trading setup
  ├── package.json                 # Monorepo workspaces root (pnpm 10.31.0)
  └── turbo.json                   # Build orchestrator (Turborepo)
```

---

## Environment & Tooling

- **Node.js**: v24.12.0, **pnpm**: 10.31.0 (pinned lockfile)
- **Web**: Next.js 15.5, Tailwind CSS, `@solana/wallet-adapter-react`, Privy for email/social sign-in
- **Mobile**: Expo / React Native, `@solana-mobile/mobile-wallet-adapter-protocol` (Android MWA), Privy web flow (iOS/Expo web)
- **Smart Contract**: Anchor framework (`packages/anchor`), program `kite_guard` deployed on devnet (`Fg6PaFpoGXkYidMpWEEe9nM3q7x5JqFHvXy6n3sNof9S`)
- **Transaction Format**: Solana V1 transactions composed via Jupiter Swap V2 build API. No ALTs for new transactions.

---

## Key Commands

```bash
# Build shared SDK (required before web/mobile)
pnpm build:sdk

# Run web dApp locally (http://localhost:3000)
pnpm dev:web

# Run mobile app locally
pnpm dev:mobile

# Build web for production
pnpm build:web

# Build Anchor smart contract
pnpm build:anchor

# Run Anchor tests
pnpm test:anchor

# Run SDK tests
node --test packages/sdk/test/*.test.cjs
```

---

## Core Product Features

### 1. Dual Trading Modes
- **Paper Trading**: Every device starts with $10,000 virtual USD. Simulates buys, sells, basket orders, stock-to-stock swaps, and recurring plans at live reference prices. Device-local, never backfills missed intervals. Not a forecast.
- **Actual Trading**: Non-custodial mainnet via connected Solana wallets (Phantom, Solflare) or Privy embedded wallets. Quotes and executes V1 transactions through Jupiter.

### 2. Thematic Stock Baskets (12 curated)
Baskets are **allocation definitions, not synthetic tokens**. Buying a basket delivers individual tokenized equities directly to the user's wallet via a single atomic V1 transaction. Equal-weight allocation using the Largest Remainder Method (Hare-Niemeyer) in BigInt arithmetic — zero dust leakage. If any constituent is missing or unpriced, the basket is marked unavailable.

| Basket | Ticker | Category | Constituents |
|---|---|---|---|
| The Magnificent Seven | `SOL-MAG7` | Technology | AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA |
| Intelligence Layer | `SOL-AI` | Technology | NVDA, MSFT, GOOGL, AMZN, ORCL |
| The Silicon Stack | `SOL-CHIPS` | Technology | NVDA, AMD, AVGO, TSM, ASML |
| Work in the Cloud | `SOL-CLOUD` | Technology | MSFT, CRM, ORCL, NOW |
| Everyday Economy | `SOL-LIFE` | Consumer | AAPL, AMZN, MCD, SBUX, KO |
| Health, Ahead | `SOL-HEALTH` | Healthcare | LLY, JNJ, ABBV, UNH, MRK |
| Money in Motion | `SOL-FIN` | Finance | JPM, GS, V, MA |
| Strategic Systems | `SOL-DEF` | Industrials | LMT, RTX, NOC, PLTR |
| Energy Backbone | `SOL-ENERGY` | Energy | XOM, CVX, COP |
| Built to Move | `SOL-BUILD` | Industrials | CAT, DE, GE, HON |
| A Wider Lens | `SOL-CORE` | Diversified | SPY, QQQ, GLD |
| Private Frontiers | `SOL-PRE` | Private | Dynamic PreStocks catalog |

### 3. Recurring Investing (SIP / DCA)
- **Paper**: Local plans with configurable cadence (daily/weekly/bi-weekly/monthly). Runs due installments only while the app is open.
- **Mainnet — Solana Subscriptions**: Bounded delegation via the official program (`De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44`). Parameters: funding token, max per period, period seconds, number of periods, UTC expiration. Funds never leave the wallet until an installment executes. Revocable anytime.
- **Mainnet — Kite Guard** (devnet): On-chain Anchor program enforcing plan parameters (cadence, weights summing to 10,000 bps, max 20 assets). Permissionless cranker execution. Owner can close plan and reclaim rent at any time.

### 4. Stock Research Suite (5-tab panel)
- **Overview**: 1-year daily OHLCV chart (Yahoo Finance), interactive SVG scrubber, period selectors (1M/3M/6M/1Y), day and 52-week range bars, company profile (Wikipedia + Yahoo Finance).
- **Technicals**: SMA 20/50/200, RSI-14, 20-day average volume, trend badge.
- **Fundamentals**: Annual/quarterly — revenue, gross profit, operating income, net income, cash flows, EPS, margins. Historical revenue bar chart.
- **News**: Real-time stock-specific Google News RSS feed.
- **Events**: Dividends, splits, SEC filings.

### 5. Market Pulse (Real-Time Breadth & Sentiment)
Real advancing/declining/unchanged asset counts with a visual breadth bar. 24h trading volume. Top mover leaderboards (volume, gainers, losers). No fabricated sentiment scores.

### 6. Portfolio, Activity & Watchlist
Holdings breakdown with cost basis and unrealized PnL. Order activity log. CSV export. Bookmarkable watchlist with live pricing.

---

## Issuer & Market Data Sources

- **xStocks** (`https://api.xstocks.fi`): Public US equities and ETFs as Token-2022/SPL tokens on Solana mainnet.
- **PreStocks** (`https://prestocks.com`): Pre-IPO private company exposure. Paused/withdrawn listings are flagged.
- **Jupiter**: Token market prices (tokens-v2, price-v3 APIs), swap routing (Swap V2 build API).
- **Yahoo Finance**: OHLCV historical bars, fundamental timeseries, company metadata.
- **Wikipedia API**: Company profile descriptions.
- **Google News RSS**: Market and stock-specific headlines.
- **Pyth Network**: Real-time equity oracle feeds (reference price comparison).
- **Solscan**: On-chain explorer links for mints and transactions.

No charts, sentiment, or news are manufactured. Missing prices fail closed as "unavailable."

---

## API Surface (`apps/web/app/api/`)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/markets` | GET | Discover and price all issuer-listed tokens |
| `/api/portfolio` | GET | Read wallet token balances |
| `/api/trade/order` | POST | Prepare a validated V1 swap via Jupiter |
| `/api/trade/execute` | POST | Verify signature and broadcast a quoted transaction |
| `/api/buy-basket` | POST | Prepare an atomic multi-leg basket transaction |
| `/api/investing` | POST | Plan setup, receipts, and authenticated executor protocol |
| `/api/recurring` | POST | Manage Subscriptions delegations (create, revoke, collect) |
| `/api/transaction/execute` | POST | Verify and broadcast composed owner-signed transactions |
| `/api/news` | GET | Google News RSS proxy (market or stock-specific) |
| `/api/research` | GET | Company profile, charts, technicals, fundamentals, events |

Secrets remain on the web server; only public app IDs and RPC config are in `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` variables.

---

## Code Guidelines & Standards

### TypeScript / Frontend (`apps/web`, `apps/mobile`, `packages/sdk`)
- Write modular, strictly-typed TypeScript without `any` where possible.
- Shared business logic, types, and oracle helpers MUST live in `packages/sdk` so both web and mobile share a single source of truth.
- Web uses `@solana/wallet-adapter-react` and dynamic imports for wallet modal components to prevent SSR hydration mismatches.
- Mobile uses `@solana-mobile/mobile-wallet-adapter-protocol` for non-custodial signing with Phantom, Solflare, or Seed Vault on Solana Saga / Seeker.
- No fabricated data — missing values render as "unavailable" rather than synthetic fallbacks.

### Anchor / Smart Contract (`packages/anchor`)
- Program: `kite_guard` — Rust/Anchor, deployed on devnet.
- PDA pattern: `[b"plan", owner_pubkey, funding_mint_pubkey]`.
- Instructions: `create_plan`, `execute_swap` (permissionless cranker), `close_plan` (owner-only, reclaims rent).
- Invariants: weights must sum to exactly 10,000 bps, max 20 assets, minimum cadence 60s (devnet) / 86,400s (production).

---

## Primitives & Protocols
- **Jupiter:** Atomic multi-leg swaps using the Swap V2 build API. Token prices via tokens-v2 and price-v3.
- **Solana Subscriptions:** Official deployed program (`De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44`) bounds recurring buyer delegation. A buyer-controlled keeper composes collection and delivery atomically. The permission itself cannot prevent an authorized buyer from collecting without delivery using a different transaction — this trust boundary is disclosed.
- **Kite Guard:** On-chain Anchor program (`Fg6PaFpoGXkYidMpWEEe9nM3q7x5JqFHvXy6n3sNof9S`) enforcing delivery parameters on devnet. Replaces off-chain trust boundaries with immutable smart contract invariants.
- **Pyth Network:** Real-time equity oracle feeds for underlying share price references (`@pythnetwork/pyth-solana-receiver`).
- **SPL Token / Token-2022:** Direct wallet holdings. No synthetic basket mint or Kite vault. Reject unsupported extensions rather than bypassing their checks.
- **Privy:** Email/social sign-in with embedded Solana wallet creation. Secrets server-side only.

---

## Key Design Principles
- **No Kite Vault**: Tokens go directly to the user's wallet. No counterparty risk.
- **No Fabricated Data**: All market data, charts, sentiment, and news are sourced from verifiable external providers.
- **Fail-Closed**: Missing prices, unresolved issuers, or halted assets block trading rather than allowing degraded execution.
- **Self-Custody by Design**: Wallet-approved transactions only. Users can revoke delegations and reclaim rent at any time.

---

## Reference Documentation
- [Kite Guard Protocol](docs/kite-guard-protocol.md) — Smart contract architecture
- [V2 Architecture & Roadmap](docs/v2-roadmap-and-architecture.md) — Composable brokerage milestones
- [Mainnet Data](docs/mainnet-data.md) — Issuer endpoints and data pipeline
- [Mainnet Trading](docs/mainnet-trading.md) — Trading setup, environment variables, limitations
- [Deployment Readiness](docs/deployment-readiness.md) — Deployment and rollback verification
- [Stock Research](docs/stock-research.md) — Research suite architecture
- [Wallet Swaps](docs/wallet-swaps.md) — Swap execution details
- [Protocol Security](docs/protocol-security.md) — Security model
