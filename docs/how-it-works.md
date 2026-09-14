# How Kite works

## 1. Discover

Kite builds its market catalog from public issuer data for Solana deployments, then enriches those assets with available Jupiter token metadata and market observations. Issuer identity and halt status remain the source of truth for what can be shown as an issuer asset. A catalog entry without a current quote is shown as unavailable, not assigned a made-up price.

## 2. Research

The asset view separates the token market from the underlying company. Depending on coverage, it can show company description, classifications, daily price history, technical indicators, reported financials, corporate events, and linked news. Provider URLs, retrieval times, and coverage warnings are retained so users can see what each observation means.

## 3. Choose a mode

**Paper trading** is a local simulation with clearly labeled virtual USD. It uses a recent observed price, checks buying power and holdings, and applies basket orders atomically to the device-local ledger. Paper fills do not predict fees, slippage, liquidity, or future returns.

**Actual trading** uses a connected Solana wallet. The server validates the token pair, issuer status, mint precision, amount, slippage, and route, then builds and simulates a Jupiter Swap V2 transaction. The wallet reviews and signs the transaction; the server verifies the unchanged message and wallet signature before broadcast.

## 4. Invest in a basket

A basket is an allocation recipe across individual issuer tokens. Kite resolves current issuer mints, validates that every required component is available, calculates exact integer token amounts, and composes the supported legs into one atomic transaction. If a leg cannot be safely quoted or fit within network and wallet limits, the basket is rejected as a whole rather than partially filled.

## 5. Invest on a schedule

Users can select a stock or basket, funding token, amount, cadence, UTC start time, interval, and finite installment count. The official Solana Subscriptions program bounds the spending permission. A separately configured buyer-controlled service can collect an installment and compose the collection with owner-directed stock swaps, recording delivery receipts.

The permission is intentionally disclosed as a trust boundary: the official program limits withdrawals, but the permission alone cannot force an authorized buyer to deliver stocks. Users can revoke the permission onchain.

## Architecture at a glance

```text
Web / mobile app
        │ shared typed SDK and API contracts
        ▼
Kite web API ── issuer catalogs + Jupiter market data
        │
        ├── Jupiter Swap V2 route/build
        ├── Solana RPC validation and simulation
        └── official Solana Subscriptions instructions
        │
        ▼
User wallet signs ──► Solana mainnet token accounts and transactions
```

No user private key is sent to Kite. No active Kite vault or custom Anchor program is required by the current product path.
