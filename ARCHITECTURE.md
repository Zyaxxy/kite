# Kite Architecture & System Design

Kite is a non-custodial interface for tokenized equities on Solana. It enables discovering issuer-listed stocks, trading curated and custom thematic baskets, simulated paper trading, deep stock research, and automated recurring investing (SIP / DCA) without holding user funds in any custodian vault.

---

## 1. System Architecture

The following diagram maps the complete end-to-end data and transaction flow across the application clients, the shared TypeScript SDK, the Next.js API orchestration gateway, external market feeds, and the Solana on-chain layer.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               1. CLIENT APPLICATION TIER                               │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│         Web dApp (apps/web)               │           Mobile App (apps/mobile)         │
│  - Next.js 15.5 App Router & Tailwind CSS │  - React Native / Expo cross-platform dApp │
│  - Privy auth & embedded Solana wallet    │  - Android: Mobile Wallet Adapter (MWA)    │
│  - @solana/wallet-adapter-react           │  - iOS / Web: Privy embedded authentication│
└─────────────────────┬─────────────────────┴─────────────────────┬──────────────────────┘
                      │                                           │
                      └─────────────────────┬─────────────────────┘
                                            │ imports shared logic
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                         2. SHARED BUSINESS ENGINE (@kite/sdk)                          │
├──────────────────────┬──────────────────────┬───────────────────┬──────────────────────┤
│    Basket Engine     │    Paper Sandbox     │  Trading & Swap   │   Research Engine    │
│ - 11 curated themes  │ - $10k virtual USD   │ - Jupiter Swap V2 │ - 1Y daily OHLCV bars│
│ - BigInt Hare-       │ - Local ledger       │ - Strict V1 txs   │ - SMA 20/50/200, RSI │
│   Niemeyer allocator │ - Zero backfilling   │ - Slippage guards │ - Financials & events│
│ - 0% dust leakage    │ - Real spot prices   │ - No ALT overhead │ - Real-time RSS news │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                       3. KITE WEB API GATEWAY (apps/web/app/api)                       │
├──────────────────────────────┬─────────────────────────────┬───────────────────────────┤
│    Market & Intelligence     │      Trading & Baskets      │    Recurring & Guard      │
│ - /api/markets               │ - /api/trade/order          │ - /api/recurring          │
│   Token discovery & pricing  │   Validates & quotes Jup V2 │   Plan PDA configuration  │
│ - /api/research & /api/news  │ - /api/buy-basket           │ - /api/recurring/execute  │
│   Proxies Google & Yahoo data│   Multi-leg atomic packager │   Keeper bot trigger      │
│ - /api/portfolio             │ - /api/trade/execute        │ - /api/faucet             │
│   Live balance aggregator    │   Verifies & broadcasts tx  │   Devnet token funding    │
└───────────────┬─────────────────────────────┬─────────────────────────────┬────────────┘
                │                             │                             │
    Fetches reference data       Builds & simulates swaps         Delegates on-chain plans
                ▼                             ▼                             ▼
┌──────────────────────────────┐┌───────────────────────────┐┌───────────────────────────┐
│ 4. DATA PROVIDERS & ISSUERS  ││ 5. DEX ROUTING & LIQUIDITY││ 6. SOLANA ON-CHAIN LAYER  │
├──────────────────────────────┤├───────────────────────────┤├───────────────────────────┤
│ • xStocks: Token-2022 US eq. ││ • Jupiter Swap V2 API     ││ • User Self-Custody Wallet│
│ • PreStocks: Pre-IPO equities││   Routes across Solana DEX││   (Phantom, Solflare, etc)│
│ • Pyth: Real-time price feeds││ • Meteora DLMM            ││ • Solana Subscriptions    │
│ • Yahoo Finance: OHLCV bars  ││   Concentrated liquidity  ││   (Official Foundation)   │
│ • Google News: RSS feeds     ││ • Raydium CPMM (Devnet)   ││ • kite_guard (Anchor)     │
└──────────────────────────────┘└─────────────┬─────────────┘└─────────────┬─────────────┘
                                              │                           │
                                              │ Settles atomic V1 swaps   │ Direct ATA deposit
                                              └─────────────┬─────────────┘
                                                            ▼
                                        ┌───────────────────────────────────────┐
                                        │      USER TOKEN ACCOUNTS (ATAs)       │
                                        │   Direct SPL / Token-2022 Equities    │
                                        │   (NVDA, AAPL, MSFT, SPY, etc.)       │
                                        │                                       │
                                        │        ★ ZERO KITE VAULTS ★           │
                                        │   No pooled funds or wrapper tokens   │
                                        └───────────────────────────────────────┘
```

---

## 2. Order Execution & Atomic Thematic Basket Flow

Baskets on Kite (such as `SOL-AI` or `SOL-CHIPS`) are **allocation recipes, not synthetic tokens**. All constituent legs are bundled into a single atomic Solana V1 transaction that delivers individual tokenized equities directly to the investor's wallet.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│               ATOMIC THEMATIC BASKET EXECUTION FLOW (e.g., SOL-AI)                     │
└────────────────────────────────────────────────────────────────────────────────────────┘

  [1. USER ACTION]
         │
         ▼  Selects basket (e.g., SOL-AI) & specifies spend (e.g., $1,000 USDC)
  ┌──────────────┐
  │  Client UI   │ (Web or Mobile)
  └──────┬───────┘
         │
         ▼  Invokes local allocation calculator in @kite/sdk
  ┌──────────────┐
  │  Basket SDK  │ ──► Hare-Niemeyer Algorithm in BigInt arithmetic
  └──────┬───────┘     Computes integer token amounts with 0% dust leakage
         │
         ▼  POST /api/buy-basket (basketId, fundingMint, amounts)
  ┌──────────────┐
  │  Web API     │ ──► Queries Jupiter Swap V2 for optimal routes per constituent
  │  Gateway     │ ──► Composes all legs into a single atomic Solana V1 transaction
  └──────┬───────┘ ──► Preflight simulation (validates 64-account limit & slippage)
         │
         ▼  Returns unsigned Base64 serialized transaction
  ┌──────────────┐
  │  User Wallet │ (Phantom, Solflare, Privy Embedded, or MWA)
  └──────┬───────┘
         │
         ▼  User inspects exact constituent breakdown and signs with private key
  ┌──────────────┐
  │ Broadcast    │ ──► POST /api/trade/execute
  │ & Execution  │ ──► Server verifies transaction signature & broadcasts via RPC
  └──────┬───────┘
         │
         ▼  Solana Mainnet processes atomic transaction
  ┌──────────────────────────────────────────────────────────────────────────────────────┐
  │                           ATOMIC ON-CHAIN SETTLEMENT                                 │
  │  • Jupiter Swap V2 swaps USDC for individual tokenized equities (NVDA, MSFT, etc.)   │
  │  • Delivered DIRECTLY into user's Associated Token Accounts (ATAs)                   │
  │  • If ANY single leg fails, the ENTIRE transaction rolls back — zero partial fills   │
  └──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Non-Custodial Recurring Investing (SIP / DCA) Flow

Automated recurring investments are governed by the official **Solana Subscriptions program** and the [`kite_guard`](file:///home/utkarsh/Projects/kite/packages/anchor) Anchor contract. No investor funds are ever pooled or locked in a central custodian vault.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│          NON-CUSTODIAL RECURRING INVESTING FLOW (SOLANA SUBSCRIPTIONS + GUARD)         │
└────────────────────────────────────────────────────────────────────────────────────────┘

  PHASE 1: BOUNDED SETUP (ONE-TIME USER ACTION)
  ─────────────────────────────────────────────
  Investor Wallet ──► Approves bounded recurring delegation in official Solana Subscriptions
                       program (e.g., max 50 USDC/week, finite installments, max 1 year).
         │
         ▼
  Investor Wallet ──► Calls create_plan_v2 on Anchor program kite_guard
                       Initializes Plan PDA with immutable destination ATAs & fixed weights.
                       ★ NO USER FUNDS ARE STAGED OR HELD BY KITE ★

  PHASE 2: PERIODIC EXECUTION (TRIGGERED WHEN INSTALLMENT IS DUE)
  ───────────────────────────────────────────────────────────────
  Keeper / Collector ──► Invokes execute_swap_v2(period) on kite_guard
                         (Caller only pays network gas fee; has zero spending authority)
         │
         ▼
  kite_guard PDA    ──► Verifies interval is due and has not already been executed.
         │
         ▼
  CPI Delegation    ──► kite_guard signs CPI into Solana Subscriptions program to pull
                         the exact authorized installment amount from investor's wallet.
         │
         ▼
  Atomic Settlement ──► Swaps via Raydium CPMM / mints mock equity directly to owner ATAs.
         │
         ▼
  Zero-Balance Check──► Guard asserts transient Plan token balance returns to ZERO.
                         If any leg fails or tokens remain, transaction rolls back.

  PHASE 3: CLEAN EXIT & REVOCATION (ANYTIME BY USER)
  ──────────────────────────────────────────────────
  Investor Wallet ──► Calls close_plan_v2 to reclaim 100% of account rent.
  Investor Wallet ──► Revokes delegation directly on official Solana Subscriptions program.
```

---

## 4. Key Architectural Guarantees

| Invariant | Guarantee & Implementation Details | Code Reference |
|---|---|---|
| **Zero Custody / No Vaults** | Swaps deposit tokens directly into the user's personal wallet (`Associated Token Accounts`). Kite never holds user private keys or asset pools. | [`docs/how-it-works.md`](file:///home/utkarsh/Projects/kite/docs/how-it-works.md) |
| **Atomic Multi-Leg Baskets** | All legs of a thematic basket settle in a single Solana V1 transaction; if any leg fails, the entire transaction rolls back — zero partial fills. | [`packages/sdk/src/basket/`](file:///home/utkarsh/Projects/kite/packages/sdk/src/basket) |
| **Zero Dust Leakage** | Basket allocations use the Largest Remainder Method (*Hare-Niemeyer*) in pure `BigInt` integer arithmetic. | [`packages/sdk/src/basket/allocation.ts`](file:///home/utkarsh/Projects/kite/packages/sdk/src/basket) |
| **Fail-Closed Market Feeds** | Missing quotes or halted tokens render an asset or basket unavailable instead of using speculative or fabricated prices. | [`packages/sdk/src/markets.ts`](file:///home/utkarsh/Projects/kite/packages/sdk/src/markets.ts) |
| **Unified Core Logic** | Both the Next.js web application and the Expo mobile app import identical business logic, oracle price fetchers, and transaction builders from [`@kite/sdk`](file:///home/utkarsh/Projects/kite/packages/sdk). | [`packages/sdk/src/index.ts`](file:///home/utkarsh/Projects/kite/packages/sdk/src/index.ts) |
