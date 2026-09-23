# Kite Product Description

Kite is a self-custody neo-brokerage interface for tokenized equities on Solana. Users discover thematic and custom stock baskets, practice allocations in a virtual paper-trading sandbox, conduct deep institutional stock research, and execute wallet-approved mainnet trades directly on-chain — all without a Kite custodial vault or synthetic intermediary.

---

## 1. Trading Modes

- **Paper Trading Sandbox**:
  - Starts with **$10,000 of virtual USD** and zero seeded holdings or simulated history.
  - Simulates single-stock buys, sells, and direct stock-to-stock swaps at live reference prices.
  - Simulates multi-asset thematic and custom basket allocations using exact BigInt math.
  - Stored completely device-local; persists across page reloads.
  - In-browser recurring paper plans with configurable frequency (daily, weekly, bi-weekly, monthly) that execute due installments only while the application is open. Missed intervals are never backfilled.
  - Paper results do not include network fees, slippage, or corporate action scaling, and are never presented as an execution forecast.
- **Actual Trading (Mainnet)**:
  - Non-custodial trading via connected Solana wallets (Phantom, Solflare) or Privy embedded wallets.
  - Quotes and executes through Jupiter Swap V2 build API.
  - Composed strictly as **Solana Versioned (V1) transactions** with inline accounts and **no Address Lookup Tables (ALTs)**.
  - Subject to Solana runtime limits: maximum **64 accounts** and **4,096 serialized bytes**.
  - Direct wallet custody: output equities settle into the user's Associated Token Accounts (ATAs). Kite holds zero user funds.
- **Mobile Experience**:
  - Built with Expo and React Native (`apps/mobile`).
  - Android non-custodial signing via Solana Mobile Wallet Adapter (MWA).
  - iOS and Expo web flows authenticated through Privy web flow.
  - Shared `@kite/sdk` for market feeds, research cache, paper accounting, and devnet recurring configuration.
- **Mode Toggle**:
  - Persistent header switch allowing instant switching between Paper and Actual trading.
  - Deep links to specific assets or baskets respect user mode preference.

---

## 2. Market Data & Oracles

- **Multi-Issuer Catalogs**:
  - **xStocks** (`https://api.xstocks.fi`): Token-2022 and classic SPL tokens representing public US equities and ETFs.
  - **PreStocks** (`https://prestocks.com`): Tokenized private pre-IPO company exposure. Paused, converted, or withdrawn listings are flagged and blocked from new trading.
  - **Backpack Securities** (`https://api.backpack.exchange/api/v1/securities`): 1,165+ discovery catalog. Distinguishes verified on-chain tradable tokens from off-chain exchange listings.
- **Pricing & Routing**:
  - **Jupiter DEX**: Real-time token market prices via tokens-v2 and price-v3 endpoints. Atomic swap routing via Jupiter Swap V2 build API.
- **Real-Time Oracles**:
  - **Pyth Network**: On-chain price account feeds (`@pythnetwork/pyth-solana-receiver`) for underlying share price references. Off-chain real-time streaming via Pyth Hermes Server-Sent Events (`https://hermes.pyth.network`) with configurable age and confidence ratio bounds.
- **Liquidity & Pool Metrics**:
  - **Meteora DLMM** (`https://dlmm.datapi.meteora.ag`): Real-time swap prices, pool TVL, dynamic fee rates, APR, and volume history across Meteora Dynamic Liquidity Market Maker pools.
- **Stock Research Suite**:
  - **Yahoo Finance**: 1-year daily OHLCV historical candlestick bars, quarterly and annual financial statements, and company metadata.
  - **Wikipedia API**: Descriptive company overviews and background profiles.
  - **Google News RSS**: Real-time market-wide and stock-specific news headlines.
  - **Solscan**: Direct links to on-chain mint accounts and transaction signatures.
- **Fail-Closed Principle**:
  - Missing token prices remain displayed as "unavailable" rather than defaulting to zero or synthetic estimates.
  - Halted, paused, or unverified issuer assets block order creation.
  - No manufactured charts, financial statements, news, returns, fills, or customer sentiment scores.

---

## 3. Thematic Baskets & Liquidity Realities

### 3.1 Allocation Model & Atomic Execution
Baskets in Kite are **curated allocation definitions into individual underlying assets**, not Kite-issued synthetic basket tokens or pooled index mints.
- **Atomic V1 Transaction**: Buying a basket triggers a single wallet-approved V1 transaction bundling individual swap legs. If any swap leg fails, the entire transaction reverts.
- **Zero Dust Leakage**: Input capital is distributed using the **Hare-Niemeyer (Largest Remainder) Method** in BigInt arithmetic, conserving 100% of basis points (10,000 bps).
- **Direct ATA Delivery**: All acquired equities settle directly into the user's Associated Token Accounts.

### 3.2 The On-Chain Liquidity Audit & 64-Account Boundary
On 16 September 2026, an exhaustive on-chain liquidity and atomic composition audit was conducted using unsigned Jupiter Swap V2 builds (`docs/basket-liquidity-audit.md`):
- **The 64-Account Constraint**: In Solana V1 transactions without ALTs, transactions are strictly limited to 64 accounts and 4,096 bytes. While all 7 constituents of `SOL-MAG7` have active individual DEX pools, bundling 7 multi-hop swap routes into a single transaction requires **68 accounts**, exceeding the Solana runtime limit.
- **Reviewed Liquid Mainnet Baskets**: The mainnet catalog publishes four verified, liquid baskets engineered to execute atomically under 64 accounts and at <200 bps tested roundtrip loss:

| Basket | ID | Ticker | Category | Constituents | Tested Accounts | Roundtrip Loss |
|---|---|---|---|---|:---:|:---:|
| **Digital Leaders** | `sol-digital-leaders` | `SOL-DIGITAL` | Technology | AAPL, MSFT, NVDA | 51 | 0.24% (24 bps) |
| **AI Platforms** | `sol-ai-focused` | `SOL-AI3` | Technology | NVDA, GOOGL, AMZN | 52 | 0.42% (42 bps) |
| **Everyday Essentials** | `sol-everyday-focused` | `SOL-LIFE3` | Consumer | AAPL, AMZN, KO | 56 | 0.80% (80 bps) |
| **A Wider Lens** | `sol-core` | `SOL-CORE` | Diversified | SPY, QQQ, GLD | 59 | 0.20% (20 bps) |

- **Additional Audited Tiers in SDK**:
  - `SOL-CHIPS` (NVDA, AMD, AVGO): Verified Liquid, 52 accounts, 0.67% loss.
  - `SOL-DEF` (PLTR, ANDURIL): Verified Liquid, 40 accounts, 0.52% loss.
  - `SOL-PRE` (OPENAI, ANTHROPIC, ANDURIL): Verified Liquid, 50 accounts, 0.83% loss.
  - `SOL-PREDICT` (POLYMARKET, KALSHI, ANDURIL): Moderate Liquidity, 48 accounts, 1.31% loss.
  - `SOL-MAG7`: Audited as `isAtomicExecutable: false` (tier `review`, 68 accounts). In the UI, `SOL-DIGITAL` is recommended as its liquid, executable alternative.
- **Canonical SDK Definitions**: The original 12 basket definitions (`SOL-MAG7`, `SOL-AI`, `SOL-CHIPS`, `SOL-CLOUD`, `SOL-LIFE`, `SOL-HEALTH`, `SOL-FIN`, `SOL-DEF`, `SOL-ENERGY`, `SOL-BUILD`, `SOL-CORE`, `SOL-PRE`) remain preserved in the SDK for devnet test plans and existing paper-trading allocations.
- **Custom / Programmable Baskets**:
  - Users can construct programmable baskets containing **between 2 and 4 assets** (`packages/sdk/src/basket/custom.ts`).
  - Restricting custom baskets to 2–4 legs guarantees atomic single-transaction execution within the 64-account boundary.
  - Allocations must sum to exactly 10,000 basis points.
  - Drift monitoring and rebalancing calculations are computed via `packages/sdk/src/rebalance.ts`.

---

## 4. Recurring Investing (SIP / DCA)

### 4.1 Paper Recurring Plans
- Configurable cadence: daily, weekly, bi-weekly, or monthly.
- Runs due installments in-browser while the app is active.
- Calendar-month investing clamps to month-end dates (e.g. 31st clamps to 28th/30th).
- Missed intervals are never backfilled. Device-local storage.

### 4.2 Devnet Recurring Protocol (Solana Subscriptions + Kite Guard)
- **Mainnet Recurring is Disabled**: Automated recurring trading is not active on Solana mainnet.
- **Official Solana Subscriptions**: Delegated spending authority via the official Subscriptions program (`De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44`).
- **Kite Guard Smart Contract**:
  - Program ID: `8Fm9HENPAFnyo6L8cHJFx62HHsZ6ez6CPUDuzgKAzrjs` on Solana devnet.
  - Instructions: `create_plan`, `execute_swap`, `close_plan`.
  - Invariants: Enforces fixed period seconds, maximum 365 periods, 10,000 bps weight sum, and output delivery directly to the owner's ATA.
  - Test Tokens Only: Funding uses KUSD (`jaViZzZ2ezVSKXZvyQnrmasSyBWVU5n8VMx4ZuAovjM`), and output assets are 40 mock token mints (`BjHgk...`) under a derived `mock_mint_authority` PDA (`GCT4iZ7...`).
- **Devnet Test Faucet**:
  - Accessible directly in the UI and via `/api/faucet`.
  - Distributes 500 test KUSD and 0.1 devnet SOL to connect wallets for devnet plan testing.
- **Audit Findings (docs/devnet-contract-audit.md)**:
  - Documents findings F1–F9: plan PDA seed mismatch between SDK (`b"plan"`) and Rust (`b"plan_v2"`), Subscriptions account layout offset differences, and staging balance assertions.
  - Devnet execution is strictly fail-closed and retained as an Anchor integration demonstration.

---

## 5. Backpack Securities Integration

Backpack Securities exposes an extensive catalog of US equities and ETFs:
- **API Discovery Universe**: 1,165+ securities ingested via `https://api.backpack.exchange/api/v1/securities`.
- **Trading & Availability Tiers**:
  1. **Tradable on Solana**: Verified on-chain SPL/Token-2022 mints mapped to Backpack assets with both deposits and withdrawals enabled (e.g. 49 verified assets). These can be quoted and swapped self-custody on Kite.
  2. **Discovery-Only**: Listings that trade exclusively on Backpack's centralized exchange or have ambiguous on-chain mappings. These are visible for discovery but strictly rejected by the trade API and transaction builder to prevent execution failure.
- **Legal & Custodial Model**:
  - Traditional brokerage holdings on Backpack are governed by UCC Article 8, while tokenized holdings represent claims on an SPV.
  - Automated dividend reinvestment (DRIP) and proportional corporate action reconciliation are features of Backpack's exchange platform, not guarantees provided by Kite.
- **User Interface**:
  - Dedicated `Backpack` filter tab in Market discovery.
  - Informational banner with an interactive `BackpackBenefitsDialog` detailing self-custody vs. centralized exchange routing.

---

## 6. Stock Research Suite (5-Tab Panel)

1. **Overview**:
   - 1-year daily OHLCV historical candlestick chart (Yahoo Finance).
   - Interactive SVG scrubber with date, price, and volume crosshairs.
   - Period selectors: 1M, 3M, 6M, 1Y.
   - Day range and 52-week range visualization bars.
   - Descriptive company overview synthesized from Wikipedia and verified issuer metadata.
2. **Technicals**:
   - Simple Moving Averages: SMA-20, SMA-50, and SMA-200.
   - Wilder's Relative Strength Index (RSI-14).
   - 20-day average trading volume.
   - Trend badge indicating position relative to 50-day moving average (Bullish / Neutral / Bearish).
3. **Fundamentals**:
   - Annual and quarterly financial statements.
   - Core metrics: Revenue, Gross Profit, Operating Income, Net Income, Operating Cash Flow, Free Cash Flow, Diluted EPS, Operating Margin, and Profit Margin.
   - Historical revenue and earnings bar chart.
4. **News**:
   - Real-time stock-specific news feed sourced via Google News RSS proxy with source attribution and publication timestamps.
5. **Events**:
   - Upcoming and historical dividend distributions, stock split ratios, and SEC regulatory filings.

---

## 7. Market Pulse (Breadth & Sentiment)

- **Market Breadth Bar**: Real-time advancing, declining, and unchanged asset counts derived from observed 24h price movements across verified catalog assets.
- **24h Aggregate Volume**: Total trading volume across all issuer-listed tokens.
- **Leaderboards**:
  - Most Traded (by 24h USD volume).
  - Top Gainers (by 24h percentage return).
  - Top Losers (by 24h percentage return).
- **Anti-Manipulation Safeguards**: Excludes illiquid assets (<$1,000 24h volume) or depegged assets (>15% divergence) from leaderboards.

---

## 8. Portfolio, Activity & Watchlist

- **Paper Portfolio**:
  - Virtual cash balance, holdings valuation, total return percentage, and total profit/loss.
  - Positions breakdown with asset, quantity, average cost basis, current value, and unrealized return.
- **Actual Portfolio**:
  - Reads live on-chain token accounts across SPL Token and Token-2022 programs.
  - Displays token balances, current USD valuations, and direct Solscan explorer links.
- **Activity Log**:
  - Chronological transaction ledger recording order timestamp, side (buy, sell, swap), quantity, price, and total USD value.
  - CSV export functionality.
- **Watchlist**:
  - Bookmarkable assets with live pricing and quick trade access.

---

## 9. Pages, Navigation & Architecture

### Page Routes (`apps/web/app/`)
- `/`: Landing page (value proposition, live basket marquee, walkthrough).
- `/landing`: Dedicated landing page.
- `/app`: Discover dashboard (Market Pulse, top movers, account summary, headlines).
- `/markets`: Full markets catalog with 5 filter tabs (`All assets`, `xStocks`, `Backpack`, `PreStocks`, `Saved`).
- `/baskets`: Curated thematic baskets and custom basket navigation.
- `/basket/[id]`: Basket detail (holdings breakdown, allocation bars, liquidity audit tier, atomic buy panel).
- `/stock/[symbol]`: Asset details and 5-tab research suite.
- `/portfolio`: Holdings, balances, and PnL breakdown.
- `/sip`: Recurring investment setup (paper plans and devnet Subscriptions).
- `/orders`: Order activity audit log with CSV export.
- `/watchlist`: Saved assets.
- `/settings`: Authentication, wallet connection, mode toggle, and cache controls.
- `/terms` & `/privacy`: Terms of service and privacy policy.

### Navigation Models
- **Web**: Persistent left sidebar with collapsible command palette (`Cmd+K`).
- **Mobile**: Native bottom tab navigation (Home, Explore, Baskets, Portfolio, Recurring, Settings).

---

## 10. Design System

- **Visual Theme**: Forest-and-lime color scheme.
  - Background: Deep forest green (`#0a1a0f` / `#101311`).
  - Accent: Electric lime (`#d4f933` / `#D5F478`).
  - Borders: Dark organic green (`#1b3322` / `#30392F`).
  - Typography: Off-white (`#f4f6ef`) with tabular numerals (`font-variant-numeric: tabular-nums`).
- **Iconography**: Clean geometric SVG icons (Lucide React) with no emojis in UI.
- **Tokens**: Centralized in `apps/web/app/globals.css` and `apps/mobile/src/theme.tsx`.
