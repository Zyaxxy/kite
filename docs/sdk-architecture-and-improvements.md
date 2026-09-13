# Kite SDK: Non-Custodial Architecture, Platform Interactions & SIMD-Aligned Roadmap

## Executive Summary

The Kite TypeScript SDK (`@kite/sdk`) is the shared core of the Kite neo-brokerage ecosystem on Solana. It serves as the single source of truth for market models, numerical precision, financial validation, paper trading simulation, price oracles, and transaction assembly.

Kite is architected as a **purely non-custodial** neo-brokerage. This design intentionally avoids custodial vaults and synthetic index tokens:
1. **Zero-Custody Systematic Investment Plans (SIPs)**: Recurring investments leverage **Buyer-Side Delegation (Solana Subscriptions)** via SPL Token allowance. Funds remain in the user's wallet until the exact second of execution, and purchased tokenized equities land directly in the user's personal token accounts.
2. **Atomic 1-Click Multi-Leg Basket Swaps**: Thematic stock baskets (e.g., `SOL-MAG7`, `SOL-AI`) are executed in a single atomic transaction powered by **SIMD-0296 (4,096-byte transaction payloads)** and **SIMD-0385 (Transaction V1 format)**, completely removing the complexity, latency, and rent overhead of Address Lookup Tables (ALTs).

---

## 1. System Architecture & Interaction Model

```
+-----------------------------------------------------------------------------------------+
|                                    @kite/sdk CORE                                       |
+-------------------------------------------------------------+---------------------------+
|  - Precision Math & Validation (toTokenAmount, fromToken)   |  - SIMD-0296 / SIMD-0385  |
|  - Market Catalogs (xStocks, PreStocks) & Jupiter Parsers   |    Atomic Multi-Leg Swap  |
|  - Non-Custodial Delegation & SIP Crank Builders            |  - Pyth Hermes & Meteora  |
|  - Paper Trading Engine & Simulation State                  |  - Isomorphic KiteClient  |
+------------------------------+------------------------------+-------------+-------------+
                               |                                            |
         +---------------------+---------------------+                      |
         | Shared SDK Models & Logic                 |                      |
         v                                           v                      |
+------------------------------------+  +---------------------------------+ |
|        WEB APP (apps/web)          |  |     MOBILE APP (apps/mobile)    | |
| +--------------------------------+ |  | +-----------------------------+ | |
| | Server API Routes (Node.js)    | |  | | Client Core (Expo / RN)     | | |
| | - /api/markets  (catalog/cache)| |  | | - KiteProvider.tsx          | | |
| | - /api/trade/order (routing)   | |  | |   (AsyncStorage paper sync) | | |
| | - /api/trade/execute (broadcast| |  | | - BasketsScreen & SipScreen | | |
| | - /api/research (AI sentiment) | |  | |   (Direct SDK paper calls)  | | |
| | - /api/portfolio (SPL parser)  | |  | | - research-cache.ts         | | |
| +----------------+---------------+ |  | +--------------+--------------+ | |
|                  ^                 |  +----------------+----------------+ |
|                  |                 |                   |                  |
|                  | HTTP + ETag 304 |                   | HTTP (via web)   |
|                  +-----------------+-------------------+                  |
|                                    |                                      |
| +--------------------------------+ |  +-------------------------------+   |
| | Browser Client (React)         | |  | Mobile Wallet Adapter (MWA)   |   |
| | - State.tsx (localStorage)     | |  | - mobile-wallet.ts            |   |
| | - ActualTradePanel.tsx         | |  |   (Solana Saga / Seeker /     |   |
| | - Privy / Solana Wallet Adapter| |  |    Phantom / Solflare MWA)    |   |
| +----------------+---------------+ |  +----------------+--------------+   |
+------------------|-----------------+-------------------|------------------+
                   |                                     |
                   | 1-Click Atomic Basket Swaps         | Native MWA Signing
                   v                                     v
+-----------------------------------------------------------------------------------------+
|                               SOLANA MAINNET-BETA NETWORK                               |
|                                                                                         |
|  [User Wallet: 100% Custody of USDC & Equities]                                         |
|    │                                                                                    |
|    ├── 1. Atomic Multi-Leg Swap (V1 Tx / 4KB MTU) -> Purchases 7 stocks in 1 slot       |
|    │                                                                                    |
|    └── 2. SPL Token Delegation -> Crank pulls due amount -> Deposits AAPLx, NVDAx, etc. |
|                                                                                         |
|  * NO custodial vault contracts | NO synthetic index tokens | NO redemption queues *    |
+-----------------------------------------------------------------------------------------+
```

<details>
<summary>Mermaid Format</summary>

```mermaid
graph TD
    subgraph Core Packages
        SDK[kite-sdk: Math, Delegation, Atomic Swaps, Oracles]
    end

    subgraph Web Backend
        OrderRoute[/api/trade/order]
        ExecRoute[/api/trade/execute]
        MarketRoute[/api/markets]
        ResearchRoute[/api/research]
    end

    subgraph Web Client
        WebState[State.tsx: Paper State]
        WebTrade[ActualTradePanel.tsx: Wallet Sign]
    end

    subgraph Mobile App
        MobileState[KiteProvider.tsx: AsyncStorage]
        MobileScreens[Screens: Baskets and SIP]
        MobileConfig[config.ts: ETag Client]
        MobileWallet[mobile-wallet.ts: MWA]
    end

    subgraph Solana Network
        UserWallet[User Wallet: Non-Custodial USDC]
        AtomicSwap[SIMD-0296/0385 Atomic Multi-Leg Basket Swap]
        DelegatedSip[Solana Subscriptions: SPL Token Delegation]
        StockHoldings[Direct Stock ATAs: AAPLx, NVDAx, TSLAx]
    end

    SDK --> OrderRoute
    SDK --> WebState
    SDK --> MobileState
    SDK --> MobileScreens

    MobileConfig -->|HTTP ETag 304| MarketRoute
    MobileConfig -->|HTTP GET| ResearchRoute

    WebTrade -->|Sign Atomic Basket Tx| AtomicSwap
    MobileWallet -.->|Sign Atomic Basket Tx| AtomicSwap
    ExecRoute -->|Broadcast Tx| Solana Network

    UserWallet -->|Delegates Allowance| DelegatedSip
    AtomicSwap -->|Delivers Shares| StockHoldings
    DelegatedSip -->|Executes Swaps| StockHoldings
```

</details>

---

## 2. Current App Interactions Through the SDK

### A. Monorepo Configuration
- Both `apps/web` and `apps/mobile` declare `@kite/sdk` as an internal workspace dependency:
  ```json
  "@kite/sdk": "workspace:*"
  ```
- Build orchestration is handled via Turborepo (`pnpm build:sdk` builds the SDK TypeScript declaration maps and distribution bundle).

---

### B. Web App (`apps/web`)

#### 1. Server-Side Routes (Next.js Node.js Runtime)
The Web backend acts as a secure routing and validation proxy:
- **Trade Construction (`/api/trade/order`)**:
  - Uses `MAINNET_USDC_MINT` and `BASE_SWAP_TOKENS` from the SDK.
  - Verifies issuer catalog availability using `hasCompleteIssuerCatalogs`.
  - Converts decimal human inputs to raw token integers without floating-point rounding errors using `toTokenAmount`.
  - Strictly models orders using `MainnetTradeOrder`, `SwapToken`, and `TradeSide`.
- **Trade Execution (`/api/trade/execute`)**:
  - Uses `classifyTradeExecution` and `MainnetTradeResult` to safely parse transaction outcomes, preventing network transport drops from being misclassified as on-chain failures.
- **On-chain Portfolio Parsing (`/api/portfolio`)**:
  - Normalizes user token balances into standardized `MainnetPortfolio` and `MainnetHolding` structures.
- **Search & Discovery (`/api/tokens`)**:
  - Uses `parseJupiterSwapTokens` to validate indexed SPL tokens.

#### 2. Client-Side Browser UI
- **Paper Trading Engine (`components/kite/State.tsx`)**:
  - Imports `createPaperAccount`, `executePaperOrder`, `executePaperSwap`, `valuePaperAccount`, `executePaperBasket`, `createPaperPlan`, `togglePaperPlan`, and `runDuePaperPlans`.
  - Persists state into browser `localStorage`.
  - Automatically executes scheduled paper SIP cycles while the user keeps the dApp tab active.
- **Actual Trading Component (`components/trading/ActualTradePanel.tsx`)**:
  - Validates quote expiration and active wallet matching with `canApproveTrade`.
  - Formats token amounts for display via `fromTokenAmount`.
  - Signs transactions using `@solana/wallet-adapter-react` or `@privy-io/react-auth`, then passes the signed serialized payload to `/api/trade/execute`.
- **Research Client (`components/kite/StockResearch.tsx`)**:
  - Leverages `createResearchClient` for in-memory LRU caching and flight deduplication of AI equity fundamentals.

---

### C. Mobile App (`apps/mobile`)

#### 1. Direct In-App SDK Execution
- **State Management (`src/state/KiteProvider.tsx`)**:
  - Runs the SDK paper engine (`createPaperAccount`, `parsePaperAccount`, `runDuePaperPlans`) inside React Native.
  - Listens to app lifecycle state (`AppState === 'active'`) to automatically evaluate due SIP cycles upon device unlock.
  - Persists accounts and watchlists asynchronously via `@react-native-async-storage/async-storage`.
- **Screen Implementations**:
  - `BasketsScreen.tsx`: Calls `executePaperBasket` to instantly calculate and execute multi-asset basket allocations against live prices.
  - `AssetScreen.tsx`: Calls `executePaperOrder` for instant single-stock paper fills.
  - `SipScreen.tsx`: Uses `createPaperPlan` and `togglePaperPlan` for recurring virtual DCA strategies.
  - `src/lib/research-cache.ts`: Wraps `createResearchClient` for mobile-native cache management.

#### 2. Client-to-Server Bridge (Security & Optimization)
- **Zero API Key Leakage**: Mobile devices connect to the web server's endpoints rather than shipping private Jupiter or third-party keys in mobile app bundles.
- **Conditional HTTP Caching (`src/lib/config.ts`)**:
  - Uses `apiGetConditional` with HTTP `ETag` / `304 Not Modified` headers.
  - Skips JSON decoding and memory allocation if market data is unchanged, saving cellular data and battery life.
- **Mobile Wallet Adapter (`src/lib/mobile-wallet.ts`)**:
  - Connects to Solana Mobile Wallet Adapter (MWA) for non-custodial authorization on Solana Saga, Seeker, and Android Phantom/Solflare.

---

## 3. High-Impact SDK Improvements

### Improvement 1: Non-Custodial Recurring SIPs via Buyer-Side Delegation (Solana Subscriptions)
* **Architectural Rationale:**
  - Traditional custodial vaults (e.g. pooling user funds, minting synthetic `KITE-MAG7` tokens, requiring custom redeem programs) introduce immense smart contract risk and regulatory classification as an unregistered collective fund.
  - **The Solana Way:** SPL Token delegation allows the user to grant an allowance (e.g. max $50/week) directly from their own USDC ATA to an automated execution crank.
  - The user **never deposits funds into an escrow**. USDC remains in their wallet until the exact second an installment executes.
  - The purchased tokenized equities (`AAPLx`, `NVDAx`, `MSFTx`) land **directly in the user's personal wallet**.
  - The user retains total sovereignty: they can revoke or modify the allowance at any time directly in Phantom, Solflare, or Kite with zero lockup.
* **SDK Module (`packages/sdk/src/subscriptions/`)**:
  ```ts
  // delegation.ts
  export function createSipDelegationInstruction(params: {
    owner: PublicKey;
    delegate: PublicKey;
    maxAllowanceUsdc: bigint;
  }): TransactionInstruction;

  export function getDelegatedAllowance(params: {
    connection: Connection;
    owner: PublicKey;
    delegate: PublicKey;
  }): Promise<bigint>;

  // crank.ts
  export function buildSipExecutionTransaction(params: {
    buyer: PublicKey;
    executor: PublicKey;
    targetBasket: MarketBasket;
    installmentAmountUsdc: bigint;
  }): Promise<Transaction>;
  ```
* **Impact:** 100% non-custodial, regulatory-compliant recurring investment with zero custodial liabilities.

---

### Improvement 2: Atomic 1-Click Multi-Leg Basket Swaps via SIMD-0296 & SIMD-0385
* **The Problem with Legacy Solana Transactions:**
  - A 7-stock basket swap (`SOL-MAG7`) touches 35 to 50 accounts across AMM pools.
  - Legacy transactions were capped at **1,232 bytes** (IPv6 MTU limit).
  - Developers previously had to use **Address Lookup Tables (ALTs)** in `v0` transactions. ALTs required creating an on-chain table account, paying rent, and waiting a 1-slot warmup delay before they could be used, severely degrading UX.
* **The SIMD Upgrades:**
  1. **[SIMD-0296: Larger Transaction Size](https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0296-larger-transactions.md)**:
     - With Solana's migration to QUIC, the transaction MTU is expanded from 1,232 bytes to **4,096 bytes (~4KB)**.
  2. **[SIMD-0385: Transaction V1 Format](https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0385-transaction-v1.md)**:
     - **No ALTs Required:** Explicitly designed to support large payloads natively without Address Lookup Tables.
     - **Native Compute Budget:** Encodes priority fee and compute unit limits directly into a 32-bit `TransactionConfigMask` header, saving instruction payload bytes.
* **Kite's Implementation (`packages/sdk/src/basket/atomic-swap.ts`)**:
  - The SDK fetches swap routes for each basket asset in parallel.
  - Assembles all swap instructions into a single **V1 transaction (4,096 bytes)** without creating or managing ALTs.
  - **Protocol Atomicity:** In a single Solana slot, either all 7 stock allocations succeed at the specified weights, or the entire transaction reverts. The buyer is never left with partial fills or orphaned token splits.
* **Impact:** True 1-click thematic basket investing with a single wallet confirmation.

---

### Improvement 3: Isomorphic Typed API Client (`KiteClient`)
* **Current State:** Web and mobile components write manual `fetch` calls, duplicating headers, signal timeouts, and response parsing.
* **Proposed Addition (`packages/sdk/src/client/kite-client.ts`)**:
  ```ts
  export class KiteClient {
    constructor(config: { baseUrl?: string; fetcher?: typeof fetch });
    getMarkets(etag?: string): Promise<{ snapshot: MarketSnapshot; notModified: boolean; etag: string | null }>;
    requestTradeOrder(req: TradeOrderRequest): Promise<MainnetTradeOrder>;
    executeTrade(signedTx: string, auth: string): Promise<MainnetTradeResult>;
    getResearch(mint: string): Promise<StockResearch>;
    getPortfolio(wallet: string): Promise<MainnetPortfolio>;
  }
  ```
* **Impact:** Standardizes networking, error recovery, and types across Web, Mobile, backend workers, and automated DCA bots.

---

### Improvement 4: Shared Headless State & React Hooks (`@kite/sdk/react`)
* **Current State:** `apps/web/components/kite/State.tsx` and `apps/mobile/src/state/KiteProvider.tsx` duplicate state management logic (polling intervals, watchlist synchronization, and local paper accounts).
* **Proposed Addition:**
  - Define a platform-agnostic `StorageAdapter`:
  ```ts
  export interface StorageAdapter {
    getItem(key: string): Promise<string | null> | string | null;
    setItem(key: string, value: string): Promise<void> | void;
  }
  ```
  - Export a shared hook or state store:
  ```ts
  export function useKiteCore({ storage, client }: { storage: StorageAdapter; client: KiteClient }): KiteCoreState;
  ```
  - Web provides `localStorage`, Mobile provides `AsyncStorage`.
* **Impact:** Eliminates ~500 lines of duplicated state code and guarantees identical mathematical behavior and plan execution across platforms.

---

### Improvement 5: Native Mobile Wallet Adapter (MWA) Execution Pipeline
* **Current State:** Mobile authorizes wallets with MWA via `connectMobileWallet()`, but real trade execution is redirected to web (`openActual`).
* **Proposed Addition:**
  - Provide an end-to-end MWA transaction signer in the SDK:
  ```ts
  export async function signAndExecuteMobileOrder(
    order: MainnetTradeOrder,
    client: KiteClient
  ): Promise<MainnetTradeResult>;
  ```
  - Directly triggers `transact()` -> `wallet.signTransactions()` -> `/api/trade/execute`.
* **Impact:** Full native Solana Mobile trading experience on Saga, Seeker, and Android devices without web redirects.

---

### Improvement 6: Pyth Real-Time Price Streaming (Hermes WebSockets / SSE)
* **Current State:** `pyth-oracle.ts` polls REST or on-chain accounts, introducing latency or hitting rate limits.
* **Proposed Addition:**
  - Add WebSocket / Server-Sent Events subscription support to Pyth Hermes:
  ```ts
  export function subscribePythPriceFeeds(
    feedIds: string[],
    onPrice: (price: PythPriceData) => void,
    onError?: (err: Error) => void
  ): () => void;
  ```
* **Impact:** Live flashing ticker prices and sub-second chart updates on both Web and Mobile.

---

### Improvement 7: Portfolio Analytics & Basket Rebalancing Engine
* **Current State:** Portfolio views only calculate basic market value and unrealized PnL.
* **Proposed Addition:**
  - **Basket Drift & Rebalancing Calculator:** Computes exact delta buy/sell swaps required to return drifted holdings to target weights.
  - **Performance Metrics:** Time-Weighted Return (TWR), Money-Weighted Return (MWR / IRR), and benchmark correlation (vs. SPY and SOL).
* **Impact:** Empowers users to maintain targeted thematic exposure as individual stock prices fluctuate.

---

### Improvement 8: Pre-flight Simulation & Slippage Guard
* **Current State:** Transactions fail on-chain if market prices or liquidity shift between quote construction and wallet confirmation.
* **Proposed Addition:**
  - In `trading.ts`, add `simulateTradeOrder(connection, order, userPubkey)` before presenting the wallet prompt.
* **Impact:** Eliminates failed transaction fees and protects user experience against sudden price shifts.

---

## 4. Implementation Matrix

| Improvement | Target Module | Target Platform | Priority |
| :--- | :--- | :--- | :--- |
| **Non-Custodial SIP Delegation** | `packages/sdk/src/subscriptions/` | Web & Mobile | **High** |
| **SIMD-0296/0385 Atomic Multi-Leg Swap** | `packages/sdk/src/basket/atomic-swap.ts` | Web & Mobile | **High** |
| **Native MWA & Privy Execution Pipeline**| `packages/sdk/src/mobile-signer.ts` | Mobile | **High** |
| **Isomorphic `KiteClient`** | `packages/sdk/src/client/kite-client.ts`| Web, Mobile, Scripts | **Medium** |
| **Shared React Hooks (`@kite/sdk/react`)** | `packages/sdk/src/react/` | Web & Mobile | **Medium** |
| **Pyth WebSocket Streaming** | `packages/sdk/src/pyth-streaming.ts`| Web & Mobile | **Medium** |
| **Vercel Edge CDN Caching Headers** | `apps/web/app/api/markets/` | Web & Mobile | **Medium** |
| **Basket Rebalancing Engine** | `packages/sdk/src/rebalance.ts` | Web & Mobile | **Low** |
| **Pre-flight Simulation** | `packages/sdk/src/simulation.ts` | Web & Mobile | **Low** |

---

## 5. Vercel Deployment Architecture & APK Interaction

When deployed to Vercel, the Next.js App Router (`apps/web`) acts as the serverless backend, security gateway, and caching layer for the Android APK (`apps/mobile`):

```
+-----------------------------------------------------------------------------------------+
|                                    ANDROID APK CLIENT                                   |
| - React Native / Expo running on Android (Saga, Seeker, Pixel, Samsung, etc.)           |
| - Communicates with Vercel Web API via HTTPS (JSON + ETag 304 Caching)                  |
+--------------------------------------------+--------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
|                               VERCEL GLOBAL EDGE NETWORK                                |
| - Static Asset & API Response Caching                                                   |
| - Serves /api/markets from Edge CDN (s-maxage=60) with sub-25ms global response times   |
| - Zero serverless invocation cost on CDN cache hits                                     |
+--------------------------------------------+--------------------------------------------+
                                             | (On Cache Miss or Dynamic Trade Orders)
                                             v
+-----------------------------------------------------------------------------------------+
|                               VERCEL SERVERLESS FUNCTIONS                               |
| - Runtime: Node.js (with node:crypto for Ed25519 signature verification)                 |
| - /api/trade/order: Routes multi-leg swap quotes via server-side Jupiter API key         |
| - /api/trade/execute: Verifies cryptographic taker signatures and submits to mempool    |
| - /api/research: Cached AI stock sentiment and financial fundamentals                   |
+--------------------------------------------+--------------------------------------------+
                                             |
                       +---------------------+---------------------+
                       |                                           |
                       v                                           v
+------------------------------------+       +------------------------------------+
|       JUPITER & DEX PROTOCOLS      |       |      SOLANA MAINNET-BETA RPC       |
| - Atomic Route Discovery           |       | - Direct Mempool Broadcasting      |
| - Swap Transaction Construction    |       | - Account & Mint Balance Queries   |
+------------------------------------+       +------------------------------------+
```

### Critical Vercel Deployment Requirements:
1. **API Base URL Configuration**:
   - In `apps/mobile`, `API_BASE_URL` is read from `process.env.EXPO_PUBLIC_API_BASE_URL`.
   - In EAS build profiles (`eas.json`) or release environment files:
     ```bash
     EXPO_PUBLIC_API_BASE_URL=https://kite.finance # Production Custom Domain
     ```
2. **Vercel Deployment Protection (SSO / Password)**:
   - By default, Vercel enables **Deployment Protection** on preview deployments (`*.vercel.app`).
   - If an APK calls a preview URL with Deployment Protection enabled, Vercel returns an HTML login redirect (`401 / 307`), causing the mobile JSON parser to crash with `SyntaxError: Unexpected token '<'`.
   - **Requirement**: Use a production custom domain or disable Deployment Protection under *Project Settings -> Deployment Protection* for API routes.
3. **Serverless Execution Timeouts**:
   - Vercel serverless functions have a 15-second timeout on the Hobby tier (up to 60s on Pro).
   - In trade routes (`/api/trade/order` and `/api/trade/execute`), routes must declare `export const maxDuration = 60;` (Vercel Pro) or tune network fetch timeouts to 12s so clients receive a structured response rather than an unhandled `504 Gateway Timeout`.
4. **Edge CDN Caching for Catalogs**:
   - `/api/markets` must return `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.
   - This ensures thousands of distributed APK clients hit Vercel's Edge CDN instead of spawning individual cold lambdas that exhaust Jupiter/xStocks rate limits.

---

## 6. Native Mainnet Trading on the APK

Rather than kicking mobile users out to an external web browser via `Linking.openURL`, the APK executes trades natively:

```
[User on Mobile APK]
       │
       │ 1. Selects asset & taps "Buy" with real funds
       ▼
[POST /api/trade/order] (Calls Vercel API with { inputMint, outputMint, amount, taker })
       │
       │ 2. Returns serialized transaction + HMAC authorization token
       ▼
[On-Device Signature Prompt]
       │
       ├── Option A: Privy Embedded Wallet (Biometric / Face ID prompt inside app)
       └── Option B: Solana Mobile Wallet Adapter (1-tap approval in Phantom / Solflare / Seeker Seed Vault)
       │
       │ 3. Returns signed transaction
       ▼
[POST /api/trade/execute] (Vercel API verifies taker signature & broadcasts to Jupiter/RPC)
       │
       │ 4. Returns on-chain confirmation & signature
       ▼
[Native Success UI] (Updates holding balances and renders explorer link)
```

### Lifecycle Implementation in Mobile:
1. **Order Construction**: Mobile calls `/api/trade/order` with the user's connected public key.
2. **Cryptographic Signing**: The base64 transaction is passed to either:
   - `@privy-io/expo`: Embedded Solana wallet signs seamlessly using on-device biometric authentication (Face ID / Touch ID).
   - `@solana-mobile/mobile-wallet-adapter-protocol`: Invokes `transact(wallet => wallet.signTransactions([tx]))` for external mobile wallets.
3. **Execution & Confirmation**: The signed transaction is posted to `/api/trade/execute`. Mobile displays a native confirmation sheet and updates the portfolio.

---

## 7. Privy Mobile Integration (`@privy-io/expo`)

Privy provides native React Native support via the `@privy-io/expo` SDK, creating a unified identity layer between Web and Mobile:

### Key Advantages:
1. **Cross-Platform Wallet Parity**: If a user logs into Kite Web using Google/Twitter/Email, and later installs the Kite APK and logs in with the same social account, **they access the exact same Solana wallet address and funds**.
2. **Zero-Friction Web2 Onboarding**: Non-crypto users do not need to install Phantom or manage seed phrases. An embedded non-custodial Solana keypair is generated automatically upon first login.
3. **Secure Hardware Enclave Protection**: Private keys are protected using Shamir Secret Sharing split across device secure hardware (Android Keystore / iOS Secure Enclave) and Privy's isolated infrastructure.

### Mobile Configuration Blueprint:
1. **Install Dependencies**:
   ```bash
   pnpm --filter @kite/mobile add @privy-io/expo expo-crypto expo-secure-store expo-web-browser
   ```
2. **Define App Scheme in `apps/mobile/app.json`**:
   ```json
   {
     "expo": {
       "name": "Kite",
       "slug": "kite-solana-stocks",
       "scheme": "kite",
       "plugins": ["@privy-io/expo"]
     }
   }
   ```
3. **Initialize `PrivyProvider` in `apps/mobile/App.tsx`**:
   ```tsx
   import { PrivyProvider } from '@privy-io/expo';

   export default function App() {
     return (
       <PrivyProvider
         appId={process.env.EXPO_PUBLIC_PRIVY_APP_ID!}
         config={{
           embeddedWallets: {
             solana: { createOnLogin: 'all-users' }
           }
         }}
       >
         <KiteProvider>
           <KiteApp />
         </KiteProvider>
       </PrivyProvider>
     );
   }
   ```
4. **Hybrid Wallet Architecture**:
   - Users who prefer external self-custody connect via **Solana Mobile Wallet Adapter (MWA)**.
   - Users who prefer 1-tap social login use **Privy Embedded Wallets**.

---

## 8. Codebase Audit: Flaws, Vulnerabilities & Mitigations

A comprehensive audit of the current Kite codebase identified six critical flaws across deployment, mobile networking, and transaction safety:

### Flaw 1: Missing `app.json` URL Scheme Breaks Deep Linking & OAuth
* **Root Cause:** [`apps/mobile/app.json`](file:///home/utkarsh/Projects/kite/apps/mobile/app.json) does not define a custom `"scheme"`.
* **Impact:** Any browser-based authentication flow (Privy Google/Apple OAuth redirects, Solana Pay deep links, or wallet return callbacks) fails to return to the APK after authentication, freezing the app in the mobile browser.
* **Mitigation:** Add `"scheme": "kite"` to `apps/mobile/app.json`.

---

### Flaw 2: MWA `auth_token` Discarded in `mobile-wallet.ts`
* **Root Cause:** In [`apps/mobile/src/lib/mobile-wallet.ts`](file:///home/utkarsh/Projects/kite/apps/mobile/src/lib/mobile-wallet.ts#L21-L28), `connectMobileWallet()` calls `wallet.authorize()`, but discards `authResult.auth_token`.
* **Impact:** According to the Solana Mobile Wallet Adapter specification, future sessions should call `wallet.reauthorize({ auth_token })`. Because Kite discards the token, Phantom/Solflare forces the user through a redundant full-screen authorization prompt on **every single trade**, destroying mobile trading UX.
* **Mitigation:** Persist `auth_token` in `AsyncStorage` or `expo-secure-store`, and call `wallet.reauthorize()` on subsequent transactions.

---

### Flaw 3: Missing `next.config.mjs` and Monorepo Package Transpilation
* **Root Cause:** `apps/web` has no Next.js configuration file.
* **Impact:**
  1. Next.js 15 requires `transpilePackages: ['@kite/sdk']` to reliably bundle shared monorepo packages in serverless functions.
  2. Missing CORS headers cause cross-origin requests from web views or API clients to fail with `405 Method Not Allowed`.
* **Mitigation:** Create `apps/web/next.config.mjs` with `transpilePackages: ['@kite/sdk']` and standard CORS headers for `/api/:path*`.

---

### Flaw 4: Serverless In-Memory Cache Cold Starts on Vercel
* **Root Cause:** In [`packages/sdk/src/markets.ts`](file:///home/utkarsh/Projects/kite/packages/sdk/src/markets.ts#L82), issuer catalogs are cached in process memory (`let xstocksCache`).
* **Impact:** Vercel serverless functions are ephemeral. As traffic scales, new lambdas experience cold starts, wiping memory caches and triggering redundant upstream queries to xStocks and Jupiter that result in `429 Too Many Requests`.
* **Mitigation:** Add HTTP Edge Cache headers (`Cache-Control: public, s-maxage=60, stale-while-revalidate=300`) to `/api/markets` so Vercel's Edge CDN absorbs repeated reads globally.

---

### Flaw 5: Vercel 504 Timeout Treated as Outright Trade Failure on Mobile
* **Root Cause:** In [`apps/mobile/src/lib/config.ts`](file:///home/utkarsh/Projects/kite/apps/mobile/src/lib/config.ts#L10), any HTTP failure marks the operation as failed.
* **Impact:** If Vercel times out during network congestion while Jupiter has already broadcasted the transaction to the Solana mempool, the mobile app reports "Trade Failed". The user may panic and press "Buy" again, causing an **accidental duplicate trade**.
* **Mitigation:** Adopt the SDK's [`classifyTradeExecution`](file:///home/utkarsh/Projects/kite/packages/sdk/src/trading.ts#L134) on mobile. If a timeout occurs, report `status: "Unknown"` with instructions to verify wallet activity before re-submitting.

---

### Flaw 6: Session Storage Wiped During Mobile Browser App-Switching
* **Root Cause:** In [`ActualTradePanel.tsx`](file:///home/utkarsh/Projects/kite/apps/web/components/trading/ActualTradePanel.tsx#L41), the pending execution state is stored in `sessionStorage`.
* **Impact:** On mobile browsers (Safari / Chrome), switching to a wallet app to sign a transaction often causes the operating system to purge background tab `sessionStorage` under memory pressure. When the user returns, the pending trade state is lost.
* **Mitigation:** Store pending trade attempts in `localStorage` with a 2-minute timestamp expiration check.

