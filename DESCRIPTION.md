# Kite: Non-Custodial Neo-Brokerage on Solana

Kite brings traditional finance's core wealth engine—**automated recurring investing (SIP / DCA)** and **thematic index baskets**—to Solana with 100% self-custody, zero vaults, and instant settlement across **Web & Mobile (iOS / Android / Solana Saga & Seeker)**.

---

## The Problem

Over 90% of retail wealth in traditional finance is built through automated recurring contributions (401k / SIP) into index baskets. Yet Web3 lacks self-custody wealth rails:
- **No Non-Custodial Recurring:** Recurring DCA in crypto meant giving up custody to CEXs or doing repetitive high-slippage manual swaps.
- **TradFi Exclusion:** High minimums ($25k+) and US SSN rules exclude 4.5B people.
- **Custodial Wrapper Risk:** Existing index tokens rely on centralized vaults vulnerable to exploits.

---

## The Solution: Kite

### 1. Flagship Engine: Automated Recurring Investing (SIP / DCA)
Kite's core innovation is **100% Non-Custodial Recurring Investing** on Solana. Users dollar-cost average into individual stocks, curated baskets, or custom portfolios without locking funds in any vault:
- **Solana Subscriptions:** Users grant a revocable, budget-capped recurring delegation via official Solana Subscriptions (`De1eg...`) to a dedicated plan PDA.
- **Anchor Contract (`kite_guard`):** Deployed on devnet (`8Fm9...`). Keepers pay gas to trigger due installments with zero withdrawal or redirect authority.
- **Atomic Execution & Direct Delivery:** Guard pulls funds via Subscriptions CPI, allocates using **Hare-Niemeyer BigInt math**, and delivers tokenized equities directly to user ATAs.
- **Fail-Closed Safety:** Transient staging balances must return strictly to zero or the installment reverts.
- **Flexible Cadence & Clean Exit:** Daily, weekly, bi-weekly, or monthly intervals with month-end clamping (Feb 28/30). Cancel anytime; `close_plan` reclaims 100% of rent lamports.

### 2. Custom Basket Builder & Social Sharing
- **Build Custom Baskets:** Compose 2–4 verified equities/ETFs under Solana's 64-account limit for guaranteed single-tx atomic execution.
- **Hare-Niemeyer Zero-Dust Math:** Uses the **Hare-Niemeyer (Largest Remainder) algorithm in BigInt arithmetic** for exact 10,000 bps distribution with zero dust leakage (equal, market-cap, or custom bps).
- **Shareable Links:** Generates compact URL-safe links (`encodeBasketShareCode`) with creator name and social handles (`@handle`). Anyone can view, paper trade, fork, or execute with 1 click.
- **Drift Monitoring:** Tracks live drift against target weights with configurable rebalance thresholds.

### 3. 11 Curated Thematic Stock Baskets
Invest in curated baskets from $1 in a single atomic transaction. Baskets are **allocation definitions, not synthetic tokens**—equities settle directly in user ATAs with zero wrap fees.
- **11 Baskets:** `SOL-DIGITAL` (Tech), `SOL-AI` (AI), `SOL-CHIPS` (Semis), `SOL-CLOUD` (Cloud), `SOL-LIFE` (Consumer), `SOL-HEALTH` (Health), `SOL-FIN` (Finance), `SOL-DEF` (Defense), `SOL-ENERGY` (Energy), `SOL-BUILD` (Industrials), `SOL-CORE` (Macro ETFs), and `SOL-PRE` (Pre-IPO).

### 4. Cross-Platform: Web & Mobile Apps (In Active Development)
- **Web dApp:** Next.js 15 App Router dApp with responsive trading, research, and Privy social login.
- **Mobile App (In Active Development):** React Native / Expo dApp supporting **Solana Mobile Wallet Adapter (MWA)** for 1-tap signing with Phantom, Solflare, and Seed Vault on Android / Solana Saga & Seeker, plus Privy on iOS.

### 5. Dual Trading Modes & 5-Tab Stock Research
- **$10k Paper Sandbox:** Simulates recurring SIPs, swaps, and custom baskets at real prices.
- **Live Mainnet Trading:** Non-custodial trading via Phantom, Solflare, or Privy via Jupiter Swap V2.
- **5-Tab Research Suite:** 1-year OHLCV charts with SVG scrubbing, SMA/RSI technicals, fundamentals, Google News RSS proxy, and SEC filings.

---

## Hackathon Bounty Integrations
- **PreStocks ($10k Bounty):** Integrates PreStocks API (`https://prestocks.com/api/prestocks`) to power `SOL-PRE` for 1-click tokenized pre-IPO tech equities.
- **Pyth Market Data:** Pyth oracle feeds power reference pricing and our **Fail-Closed Safety Invariant**—trades cleanly block if DEX quotes deviate from Pyth.

---

## Technical Readiness & Links
- **Shared SDK (`@kite/sdk`):** Monorepo core with **176 automated passing tests** (+ 86 web integration tests; 260+ tests overall).
- **Smart Contract (`kite_guard`):** Anchor program on Solana devnet (`8Fm9HENPAFnyo6L8cHJFx62HHsZ6ez6CPUDuzgKAzrjs`).
- **Live Demo:** [https://kite.runs-on.dev](https://kite.runs-on.dev)
- **GitHub:** [https://github.com/Zyaxxy/kite](https://github.com/Zyaxxy/kite)