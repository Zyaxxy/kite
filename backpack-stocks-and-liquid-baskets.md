# Backpack Tokenized Stocks & Liquid Baskets Architecture

## Executive Summary

This specification defines two critical upgrades to Kite's neo-brokerage interface on Solana:
1. **Backpack Tokenized Stocks Integration**:
   - Adding **Backpack Securities** as a dedicated third issuer catalog tab alongside `xStocks` and `PreStocks`.
   - Ingesting the **full universe of 1,148+ US securities** from Backpack's live discovery API (`GET /api/v1/securities`).
   - Adding an interactive **"Benefits of Backpack Stocks" Dialog & Banner** educating users on:
     - **24/7 Continuous Trading**: Exchange-broker RFQ during NYSE/NASDAQ hours + spot order-book trading (`rwaMarketType = STOCK`) during nights, weekends, and holidays.
     - **Automated Dividend Reinvestment (DRIP)**: Cash dividends automatically reinvested into additional tokenized shares directly on Solana.
     - **Proportional Corporate Actions**: Dynamic token-balance adjustments for stock splits and mergers.
     - **New York UCC Article 8 Entitlement & Two-Way Mint/Redeem**: Traditional legal securities custody backing the tokenized claim.
2. **Pruning Illiquid Baskets & Preserving Non-Custodial Atomic Execution**:
   - Auditing Kite's 12 thematic baskets against live Jupiter DEX on-chain liquidity.
   - Removing illiquid baskets whose constituents lack active Solana DEX pools (`SOL-CHIPS`, `SOL-CLOUD`, `SOL-LIFE`, `SOL-HEALTH`, `SOL-FIN`, `SOL-DEF`, `SOL-ENERGY`, `SOL-BUILD`).
   - Retaining verified, liquid thematic baskets:
     - **`SOL-MAG7`** (The Magnificent Seven: AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA)
     - **`SOL-CORE`** (A Wider Lens: SPY, QQQ, GLD)
   - Ensuring 100% of remaining stock baskets execute through Kite's signature **single atomic V1 transaction via Jupiter Swap API**, guaranteeing **zero dust leakage (Hare-Niemeyer BigInt math) and zero Kite vault custody**.

---

## 1. Backpack Securities Architecture

### 1.1 Full Universe Ingestion (`GET /api/v1/securities`)
Backpack Securities exposes 1,148+ US equities and ETFs. Kite ingests this catalog dynamically:
- **API Endpoint**: `https://api.backpack.exchange/api/v1/securities`
- **Asset Schema**:
  ```ts
  interface BackpackSecurity {
    asset: string;       // e.g. "AAPL.US", "NVDA.US"
    name: string;        // e.g. "Apple Inc."
    cusip: string;       // CUSIP identifier
    sessions: Array<{
      name: "US_EQUITIES_PRE_MARKET" | "US_EQUITIES_REGULAR" | "US_EQUITIES_POST_MARKET" | "US_EQUITIES_OVERNIGHT";
      minQuantity: string;
      maxQuantity: string;
      stepSize: string;
    }>;
  }
  ```
- **Mapped `MarketAsset` in Kite**:
  - `mint`: Unique deterministic identifier or Solana SPL mint if deployed.
  - `symbol`: e.g. `AAPL.US`, `NVDA.US`.
  - `underlyingSymbol`: `AAPL`, `NVDA`.
  - `issuer`: `"backpack"`.
  - `kind`: `"equity"` or `"etf"`.
  - `tradingHalted`: `false` (updated based on session rules).

### 1.2 The Core Benefits of Backpack Stocks
1. **24/7 Off-Hours & Weekend Trading**:
   - *Regular Session (9:30 AM - 4:00 PM EST)*: Trades execute via Exchange-Broker RFQ (`<SECURITY>_USDC_RFQ`) with tight spreads.
   - *Overnight & Weekends*: Listed stocks with spot order books (`rwaMarketType = STOCK`, e.g. `MU.US_USDC`, `SPCX.US_USDC`) continue trading seamlessly 24/7.
2. **Automated On-Chain DRIP (Dividend Reinvestment)**:
   - Cash dividends are not withheld in brokerage cash balances; they are automatically reinvested into additional tokenized shares, incrementing user on-chain balances.
3. **Proportional Corporate Actions Reconciliation**:
   - Stock splits (e.g. 4-for-1 or 10-for-1) and mergers automatically adjust token balances to preserve exact economic parity without manual claims.
4. **NY UCC Article 8 Legal Protection**:
   - Backed by traditional DTC-cleared securities held under New York commercial law, with open two-way conversion (Mint & Redeem) between Solana self-custody wallets and traditional brokerages.

---

## 2. Liquid Basket Selection & Atomic Execution Guarantee

### 2.1 The Problem with Illiquid Baskets
In Kite's fail-closed architecture, every basket order must be **atomic and complete**:
```ts
if (!basket || basket.missingSymbols.length || basket.assets.some(a => a.asset.tradingHalted)) {
  throw new Error("The complete, tradable issuer basket is unavailable. No partial basket will be purchased.");
}
```
If a constituent (e.g. `NOW` in `SOL-CLOUD` or `ABBV` in `SOL-HEALTH`) lacks a Jupiter DEX swap route, the entire transaction reverts:
```
No executable route for NOW. Try a different funding token or amount.
```
Leaving broken or un-routable baskets in the catalog creates severe UX frustration.

### 2.2 Audited Basket Retention Matrix

| Basket | Ticker | Category | Constituents | Status | Rationale |
|---|---|---|---|:---:|---|
| **The Magnificent Seven** | `SOL-MAG7` | Technology | AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA | **ACTIVE (Liquid)** | All 7 mega-caps have active Raydium/Orca pools with deep USDC liquidity. |
| **A Wider Lens** | `SOL-CORE` | Diversified | SPY, QQQ, GLD | **ACTIVE (Liquid)** | Major US index and gold ETFs with deep on-chain liquidity. |
| The Silicon Stack | `SOL-CHIPS` | Technology | NVDA, AMD, AVGO, TSM, ASML | *PRUNED* | `ASML` and `AVGO` lack liquid Solana DEX AMM pools. |
| Work in the Cloud | `SOL-CLOUD` | Technology | MSFT, CRM, ORCL, NOW | *PRUNED* | `NOW` and `CRM` lack executable on-chain swap routes. |
| Everyday Economy | `SOL-LIFE` | Consumer | AAPL, AMZN, MCD, SBUX, KO | *PRUNED* | `MCD`, `SBUX`, `KO` have zero Solana DEX liquidity. |
| Health, Ahead | `SOL-HEALTH` | Healthcare | LLY, JNJ, ABBV, UNH, MRK | *PRUNED* | `LLY`, `ABBV`, `UNH`, `MRK` have zero Solana DEX liquidity. |
| Money in Motion | `SOL-FIN` | Finance | JPM, GS, V, MA | *PRUNED* | `GS`, `MA`, `V` lack on-chain pools. |
| Strategic Systems | `SOL-DEF` | Industrials | LMT, RTX, NOC, PLTR | *PRUNED* | `LMT`, `RTX`, `NOC` lack executable on-chain routes. |
| Energy Backbone | `SOL-ENERGY` | Energy | XOM, CVX, COP | *PRUNED* | `COP` and `CVX` lack on-chain pools. |
| Built to Move | `SOL-BUILD` | Industrials | CAT, DE, GE, HON | *PRUNED* | `CAT`, `DE`, `HON` lack on-chain pools. |

### 2.3 Non-Custodial Atomic Invariants
For all active baskets (`SOL-MAG7`, `SOL-CORE`):
1. **Single Atomic V1 Transaction**: All swap legs are bundled into a single versioned transaction via Jupiter Swap V2 build API.
2. **Zero Dust Leakage**: Input USDC is partitioned using the **Hare-Niemeyer (Largest Remainder) Method** in BigInt arithmetic, conserving 100% of basis points (10,000 bps).
3. **Direct Wallet Custody**: All output equity tokens settle directly to the user's Associated Token Accounts (ATAs). Kite holds zero user funds in any vault.

---

## 3. UI/UX Specifications

### 3.1 Catalog Navigation Tabs
In `apps/web/components/kite/MarketUI.tsx`:
```
[ All assets ] [ xStocks ] [ Backpack ] [ PreStocks ] [ Saved ]
```
- Selecting `Backpack` displays the full searchable catalog of 1,148+ Backpack tokenized equities.
- When `Backpack` is selected, an informational banner appears:
  *"Backpack Tokenized Stocks: 24/7 continuous trading & automated dividend reinvestment (DRIP)."*
  with a clickable **"Learn how it works"** button opening `BackpackBenefitsDialog`.

### 3.2 Benefits of Backpack Stocks Dialog
A modal dialog presenting:
1. **24/7 Continuous Trading** (Daytime RFQ + Night/Weekend Order Books).
2. **Automated On-Chain DRIP** (Cash dividends reinvested into token shares).
3. **Proportional Corporate Actions** (Automatic balance adjustment for splits).
4. **NY UCC Article 8 Entitlement** (Legal custody & 2-way mint/redeem).
