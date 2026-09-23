# Kite

A self-custody neo-brokerage interface for tokenized equities on Solana, featuring a zero-risk paper-trading sandbox and non-custodial wallet-approved mainnet trading.

---

## Applications & Packages

- **`apps/web`**: Next.js 15.5 App Router dApp.
  - Discovery dashboard, full markets catalog with 5-tab filtering (`All assets`, `xStocks`, `Backpack`, `PreStocks`, `Saved`), and an interactive Backpack Securities educational dialog.
  - Audited liquid thematic baskets and a custom 2–4 asset programmable basket builder with drift rebalancing.
  - 5-tab institutional stock research suite (OHLCV chart scrubber, technical indicators, fundamental statements, Google News RSS, and corporate events).
  - Real-time Market Pulse breadth indicator and volume/gainer/loser leaderboards.
  - Paper portfolio, live on-chain SPL/Token-2022 wallet portfolio, activity ledger with CSV export, and bookmarkable watchlist.
  - Devnet recurring investment setup (SIP / DCA) with an integrated devnet test faucet (`/api/faucet`).
- **`apps/mobile`**: Expo / React Native mobile dApp.
  - Cohesive forest-and-lime design system across iOS, Android, and Expo web.
  - Android non-custodial signing via Mobile Wallet Adapter (`@solana-mobile/mobile-wallet-adapter-protocol`).
  - iOS and Expo web authentication via Privy web flow.
  - Shared `@kite/sdk` market data, research cache, paper trading, and devnet recurring configuration.
- **`packages/sdk`**: Shared TypeScript SDK (`@kite/sdk`).
  - Multi-issuer catalog discovery (`xStocks`, `PreStocks`, `Backpack Securities`).
  - Pyth Network on-chain oracle readers and off-chain Hermes Server-Sent Events (SSE) streaming with freshness and confidence guards.
  - Meteora DLMM pool metrics, dynamic fees, TVL, and APR.
  - Jupiter Swap V2 integration with strict V1 transaction composition and inline accounts.
  - Basket allocation engine using BigInt Hare-Niemeyer (Largest Remainder Method) for zero dust leakage.
  - Verified basket roundtrip liquidity audit engine (`packages/sdk/src/basket/liquidity-audit.ts`).
  - Programmable custom basket validator (`packages/sdk/src/basket/custom.ts`) and drift rebalancer (`packages/sdk/src/rebalance.ts`).
  - Device-local paper trading accounting with cost-basis and realized PnL tracking.
  - Solana Subscriptions codecs and devnet `kite_guard` client bindings.
- **`packages/anchor`**: Smart contract workspace for `kite_guard` (program ID: `8Fm9HENPAFnyo6L8cHJFx62HHsZ6ez6CPUDuzgKAzrjs`).
  - On-chain execution guard deployed on Solana devnet for delegated recurring investments via official Solana Subscriptions.
  - Enforces schedule constraints, nonces, weight conservation (10,000 bps), and direct owner ATA settlement.
  - See [Audits & Code Truth](#audits--code-truth) for verified devnet contract state and integration findings.

---

## Run Locally

Requires **Node.js 24.12.0** and pinned **pnpm 10.31.0**.

```sh
# 1. Install dependencies across workspaces
pnpm install

# 2. Build the shared SDK (required before web or mobile)
pnpm build:sdk

# 3. Start the Next.js web application (http://localhost:3000)
pnpm dev:web
```

To run the mobile app:
```sh
# Configure apps/mobile/.env.local from apps/mobile/.env.example
pnpm dev:mobile
```
> [!NOTE]
> When testing on a physical mobile device, configure `EXPO_PUBLIC_API_BASE_URL` with your development machine's LAN IP address (e.g. `http://192.168.1.50:3000`) or an HTTPS deployment URL; `localhost` on a physical device refers to the device itself.

---

## Configuration & Environment Variables

Copy `apps/web/.env.example` to `apps/web/.env.local`:

| Variable | Scope | Purpose |
|---|---|---|
| `JUPITER_API_KEY` | Server | Authenticated Jupiter Swap V2 build & quote routing |
| `KITE_TRADE_SECRET` | Server | Secret (min 32 chars) for HMAC signing and verifying composed trade orders |
| `SOLANA_RPC_URL` | Server | Mainnet Solana RPC endpoint for account reads and transaction broadcasts |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Client | Public mainnet RPC for wallet adapter connections |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Client | Privy App ID for embedded wallet and social login |
| `SOLANA_DEVNET_RPC_URL` | Server | Dedicated devnet RPC for recurring investment tests |
| `KITE_FAUCET_SECRET_KEY` | Server | 64-byte keypair for the active devnet test faucet (`/api/faucet`) |
| `EXPO_PUBLIC_API_BASE_URL` | Mobile | Base URL pointing to the web API server |

> [!IMPORTANT]
> All trading secrets and private keys remain strictly on the web server. Only public application IDs and RPC URLs are exposed via `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*` variables.

---

## Demo & User Flow

1. **Explore Discovery & Markets**: Browse live tokenized equities across xStocks, PreStocks, and Backpack Securities. Toggle between `All assets`, `xStocks`, `Backpack`, `PreStocks`, and `Saved` watchlist.
2. **Paper Trading Sandbox ($10,000 Virtual USD)**:
   - Starts with $10,000 of device-local virtual cash and zero seeded holdings.
   - Execute paper buys, sells, and direct stock-to-stock swaps at live observed market prices.
   - Allocate into curated or custom thematic baskets with complete multi-asset accounting.
   - Configure paper recurring plans (daily, weekly, bi-weekly, monthly) that execute due installments in-browser while the application is open. Missed intervals are never backfilled.
3. **Institutional Stock Research**:
   - Inspect any asset for 1-year OHLCV charts with interactive SVG scrubbing (Yahoo Finance).
   - Review technical indicators: 20/50/200-day SMAs, Wilder RSI-14, 20-day average volume, and trend badges.
   - Inspect annual and quarterly income statements, balance sheets, cash flows, and margins.
   - Read real-time stock-specific news from Google News RSS and corporate actions (dividends, splits, SEC filings).
4. **Non-Custodial Mainnet Trading**:
   - Switch to **Actual Trading** via the header toggle.
   - Connect a Solana wallet (Phantom, Solflare) or sign in with Privy embedded wallets.
   - Prepare validated V1 single-token swaps or atomic multi-leg basket purchases via Jupiter.
   - Review exact token debits, minimum output floors, and priority fees before approving in your wallet.
   - Output tokens settle directly into your wallet's Associated Token Accounts (ATAs). Kite holds zero user funds in any vault.
5. **Devnet Recurring Investments (SIP / DCA)**:
   - Connect your wallet on devnet and claim 500 test KUSD and 0.1 devnet SOL from the integrated test faucet (`/api/faucet`).
   - Create a delegated recurring plan via official Solana Subscriptions and the `kite_guard` Anchor program.
   - Review, execute, or revoke plan delegations at any time.

---

## Architecture & Code Truth

### 1. No Kite Vault & Atomic V1 Composition
There is no custodial vault or pooled intermediary in Kite. Output equities settle directly into the user's wallet ATAs.
- All swaps and basket purchases are composed as **Solana Versioned (V1) transactions** without Address Lookup Tables (ALTs), using inline account keys.
- Input amounts are partitioned using the **Hare-Niemeyer (Largest Remainder) Method** in BigInt math, guaranteeing zero dust leakage across exactly 10,000 basis points.
- Before broadcast, the backend server simulates the composed transaction, validates account ownership, checks token program IDs (SPL Token and Token-2022), and verifies that input debits and output minimums match the quoted parameters.

### 2. Audited Basket Liquidity & The 64-Account Boundary
A comprehensive mainnet liquidity and atomic composition audit was conducted on 16 September 2026 (`docs/basket-liquidity-audit.md`):
- **The 64-Account Constraint**: In Solana V1 transactions without ALTs, transactions are strictly capped at 64 accounts and 4,096 bytes. While all 7 constituents of `SOL-MAG7` have liquid on-chain pools, bundling all 7 swap routes into a single atomic transaction requires **68 accounts**, exceeding the Solana runtime limit.
- **Reviewed Liquid Mainnet Baskets**: The published mainnet catalog provides verified, liquid baskets tested at <200 bps roundtrip loss and <64 accounts:
  - **Digital Leaders (`SOL-DIGITAL` / `sol-digital-leaders`)**: AAPL, MSFT, NVDA (3 legs, 51 accounts, 24 bps roundtrip loss).
  - **AI Platforms (`SOL-AI3` / `sol-ai-focused`)**: NVDA, GOOGL, AMZN (3 legs, 52 accounts, 42 bps roundtrip loss).
  - **Everyday Essentials (`SOL-LIFE3` / `sol-everyday-focused`)**: AAPL, AMZN, KO (3 legs, 56 accounts, 80 bps roundtrip loss).
  - **A Wider Lens (`SOL-CORE` / `sol-core`)**: SPY, QQQ, GLD (3 legs, 59 accounts, 20 bps roundtrip loss).
- **Other Audited Tiers**: The SDK audit engine (`packages/sdk/src/basket/liquidity-audit.ts`) records verified liquidity for `SOL-CHIPS` (52 accounts, 67 bps), `SOL-DEF` (40 accounts, 52 bps), `SOL-PRE` (50 accounts, 83 bps), and `SOL-PREDICT` (48 accounts, 131 bps). `SOL-MAG7` is flagged as `isAtomicExecutable: false` (tier `review`) with `SOL-DIGITAL` recommended as its executable alternative.
- **Canonical SDK Definitions**: The original 12 basket definitions are preserved in the SDK for devnet recurring test plans and existing paper-trading allocations.
- **Custom / Programmable Baskets**: Users can build custom baskets with **2 to 4 assets** summing to 10,000 basis points (`packages/sdk/src/basket/custom.ts`). This range guarantees atomic single-transaction execution within the 64-account boundary. Drift rebalancing proposals are computed via `packages/sdk/src/rebalance.ts`.

### 3. Backpack Securities Integration
- Ingests the 1,165+ securities catalog from Backpack Exchange (`https://api.backpack.exchange/api/v1/securities`).
- **Strict Distinction**:
  - **Tradable on Solana**: Verified on-chain SPL/Token-2022 mints mapped to Backpack assets with both deposits and withdrawals enabled (e.g., 49 verified assets). These can be quoted and swapped self-custody on Kite.
  - **Discovery-Only**: Listings that trade exclusively on Backpack's centralized exchange or have ambiguous on-chain mappings. These are visible for discovery but strictly rejected by the trade API and transaction builder to prevent execution failure.
  - **Holding Model Clarification**: Traditional brokerage holdings on Backpack are governed by UCC Article 8, while tokenized holdings represent claims on an SPV. Automated DRIP and corporate action adjustments are Backpack exchange features, not guarantees provided by Kite.

### 4. Recurring Investing Protocol & Devnet Guard State
- **Mainnet Recurring is Disabled**: Automated recurring trading is not active on Solana mainnet.
- **Devnet Test Environment**: Implemented using the official Solana Subscriptions program (`De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44`) and the Anchor program `kite_guard` (`8Fm9HENPAFnyo6L8cHJFx62HHsZ6ez6CPUDuzgKAzrjs`).
- Test funding uses KUSD (`jaViZzZ2ezVSKXZvyQnrmasSyBWVU5n8VMx4ZuAovjM`), and output assets are 40 mock token mints (`BjHgk...`) under a derived `mock_mint_authority` PDA (`GCT4iZ7...`).
- The devnet contract audit (`docs/devnet-contract-audit.md`) identifies integration findings (F1–F9) regarding plan PDA seeds, Subscriptions account layout offsets, and staging account balance assertions. As a result, devnet recurring execution is fail-closed and not verified end-to-end for production swaps.
- **Active Devnet Faucet**: `/api/faucet` is live and dispenses 500 test KUSD and 0.1 devnet SOL to connect wallets for devnet plan testing.

---

## Active Web API Surface (`apps/web/app/api/`)

| Route | Method | Description |
|---|---|---|
| `/api/markets` | GET | Discover catalogs (xStocks, PreStocks, Backpack), price tokens via Jupiter (tokens-v2, price-v3), resolve baskets, and attach Pyth reference feeds |
| `/api/portfolio` | GET | Read wallet token balances across SPL Token, Token-2022, and native SOL |
| `/api/trade/order` | POST | Prepare and validate a single-token V1 swap order via Jupiter Swap V2 build API |
| `/api/trade/execute` | POST | Verify HMAC order authorization and broadcast a signed trade via Jupiter execute |
| `/api/buy-basket` | POST | Prepare an atomic multi-leg V1 basket transaction (curated or 2–4 asset custom allocations) |
| `/api/transaction/execute` | POST | Verify HMAC authorization and broadcast composed owner-signed transactions via Solana RPC |
| `/api/recurring` | GET, POST | List active devnet recurring plans (GET) or prepare plan creation transaction (POST) |
| `/api/recurring/config` | GET | Fetch devnet recurring status, funding token details, and tradable test assets |
| `/api/recurring/collect` | POST | Prepare an unsigned devnet recurring collection installment transaction |
| `/api/recurring/revoke` | POST | Prepare a transaction to close a devnet Guard plan and reclaim account rent |
| `/api/recurring/execute` | POST | Verify HMAC authorization and broadcast a signed devnet recurring transaction |
| `/api/research` | GET | Fetch 5-tab stock research (OHLCV bars, technical indicators, financial statements, news, events) |
| `/api/news` | GET | Google News RSS proxy for market-wide or stock-specific headlines |
| `/api/tokens` | GET | Search tokens across base swap assets, Jupiter discovery, and issuer catalogs |
| `/api/faucet` | GET, POST | Active devnet test faucet: check status (GET) or claim 500 test KUSD and 0.1 devnet SOL (POST) |
| `/api/health` | GET | Service health and upstream dependency check |

*(Note: The legacy `/api/investing` route has been retired and replaced by the `/api/recurring/*` suite).*

---

## Verification & Testing Commands

All checks must be run using the pinned **pnpm 10.31.0** and **Node.js 24.12.0** toolchain:

```sh
# 1. Build shared SDK
pnpm build:sdk

# 2. Run SDK unit and integration tests (168 tests)
node --test packages/sdk/test/*.test.cjs

# 3. Run Web application integration tests (80 tests)
node --test apps/web/tests/*.test.*

# 4. Audit devnet on-chain accounts and mint authorities (read-only RPC check)
node scripts/audit-devnet-recurring.mjs

# 5. Build Next.js web application for production
pnpm build:web
```

> [!NOTE]
> The smart contract source in `packages/anchor/programs/kite_guard` defines the devnet program `8Fm9HENPAFnyo6L8cHJFx62HHsZ6ez6CPUDuzgKAzrjs`. The Anchor runtime test suite in `packages/anchor/tests/runtime.test.cjs` targets the legacy CPMM/Raydium plan layout (`planV2`), so running `pnpm test:anchor` requires updating runtime fixtures to match the current mock-mint ABI as documented in `docs/devnet-contract-audit.md`.

---

## Design System

Kite uses a custom forest-and-lime aesthetic:
- **Palette**: Deep forest green background (`#0a1a0f` / `#101311`), electric lime accent (`#d4f933` / `#D5F478`), dark borders (`#1b3322` / `#30392F`), and crisp off-white typography (`#f4f6ef`).
- **Typography & Numerals**: Monospace tabular numbers (`font-variant-numeric: tabular-nums`) for prices, returns, quantities, and financial statements.
- **Iconography**: Clean geometric symbols (Lucide React) with zero emoji in product interfaces.
- **Design Tokens**: Standardized in `apps/web/app/globals.css` and `apps/mobile/src/theme.tsx`.
