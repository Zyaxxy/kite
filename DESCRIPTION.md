# Kite: Non-Custodial Neo-Brokerage on Solana

Kite is a self-custody interface for tokenized equities on Solana. It brings the core wealth-building engine of traditional finance—**1-click thematic index baskets, custom programmable baskets, and automated recurring investing (SIP / DCA)**—directly on-chain with zero central vaults, zero synthetic wrappers, and instant sub-second settlement.

---

## The Problem

Over 90% of retail wealth in traditional finance is built through automated recurring contributions (401k / SIP) into diversified index baskets. Yet global retail investors face massive barriers:
- **TradFi Exclusion:** High minimums ($25k+), US SSN requirements, and multi-week wiring exclude billions worldwide.
- **Crypto Wealth Gap:** Users are stuck in emotional trading; building an equity portfolio on-chain requires multiple manual swaps with high slippage and persistent token dust.
- **Custodial Wrapper Risk:** Existing index tokens rely on synthetic wrappers or centralized vaults vulnerable to exploits.

---

## The Solution: Kite

### 1. 11 Curated Thematic Stock Baskets
Invest in curated baskets from $1 in a single atomic transaction. *(Note: A 7-asset MAG7 basket is excluded due to Solana's 64-account tx limit; `SOL-DIGITAL` serves as the liquid 3-asset mega-cap alternative for guaranteed atomic execution without ALTs).*
- `SOL-DIGITAL` (Tech Leaders: AAPL, MSFT, NVDA)
- `SOL-AI` (AI Infrastructure: NVDA, MSFT, GOOGL, AMZN, ORCL)
- `SOL-CHIPS` (Semiconductors: NVDA, AMD, AVGO, TSM, ASML)
- `SOL-CLOUD` (Enterprise Cloud: MSFT, CRM, ORCL, NOW)
- `SOL-LIFE` (Everyday Economy: AAPL, AMZN, MCD, SBUX, KO)
- `SOL-HEALTH` (Healthcare: LLY, JNJ, ABBV, UNH, MRK)
- `SOL-FIN` (Financial Rails: JPM, GS, V, MA)
- `SOL-DEF` (Defense: LMT, RTX, NOC, PLTR)
- `SOL-ENERGY` (Energy: XOM, CVX, COP)
- `SOL-BUILD` (Industrials: CAT, DE, GE, HON)
- `SOL-CORE` (Macro: SPY, QQQ, GLD)
- `SOL-PRE` (Pre-IPO: Dynamic PreStocks catalog)

### 2. Custom Basket Builder & Social Sharing
Investors can compose, share, and automate personal portfolios:
- **Build Custom Baskets:** Pick 2–4 verified equities/ETFs, safely adhering to Solana's 64-account limit for guaranteed single-tx atomic execution.
- **Hare-Niemeyer Zero-Dust Math:** Uses the **Hare-Niemeyer (Largest Remainder) algorithm in BigInt arithmetic** to allocate exact basis points (10,000 bps) with zero fractional dust leakage (equal-weight, market-cap, or custom bps).
- **Shareable Links:** Custom baskets encode into compact URL-safe share links (`encodeBasketShareCode`) with creator name and social handles (`@handle`). Anyone can view, paper trade, fork, or buy in 1 click.
- **Drift Monitoring & Rebalance:** Real-time drift tracking against target basis points with configurable rebalance thresholds.

### 3. Direct Wallet Delivery & Recurring Investing (SIP / DCA)
- **Direct Wallet Delivery:** Baskets are allocation definitions, not synthetic tokens. Underlying equities land directly in user ATAs with zero intermediate vaults or wrap fees.
- **Solana Subscriptions + Kite Guard:** Recurring plans delegate to a plan PDA via official Solana Subscriptions (`De1eg...`). Keepers execute swaps through Raydium CPMM directly to owner ATAs; transient balances must return to zero or the leg reverts.

### 4. Dual Trading Modes & 5-Tab Research Suite
- **$10k Paper Sandbox:** Simulates swaps, baskets, custom portfolios, and recurring plans at real prices.
- **Live Mainnet Trading:** Non-custodial trading via Phantom, Solflare, or Privy embedded wallets via Jupiter Swap V2.
- **5-Tab Research Suite:** 1-year OHLCV charts with SVG scrubbing, SMA 20/50/200, RSI-14, quarterly/annual fundamentals, live Google News RSS proxy, dividends, and filings.

---

## Hackathon Bounty Integrations

- **PreStocks ($10k Bounty):** Integrates the official PreStocks API (`https://prestocks.com/api/prestocks`) to power `SOL-PRE`, enabling 1-click exposure to tokenized pre-IPO private equities with strict compliance.
- **Pyth Market Data:** Real-time Pyth equity feeds power reference pricing and our **Fail-Closed Safety Invariant**—trades cleanly block if DEX quotes deviate from Pyth or an asset halts.

---

## Technical Architecture & Readiness

- **Shared SDK (`@kite/sdk`):** Monorepo TypeScript core with **176 automated passing tests** (+ 86 web integration tests; 260+ tests overall).
- **Smart Contract (`kite_guard`):** Deployed on Solana devnet (`8Fm9HENPAFnyo6L8cHJFx62HHsZ6ez6CPUDuzgKAzrjs`).
- **Cross-Platform:** Next.js 15 App Router web dApp + Expo React Native mobile client (Solana Mobile Wallet Adapter on Saga/Seeker).

---

## Links

- **Live Demo:** [https://kite.runs-on.dev](https://kite.runs-on.dev)
- **GitHub:** [https://github.com/Zyaxxy/kite](https://github.com/Zyaxxy/kite)