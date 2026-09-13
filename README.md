# Kite

A self-custody interface for tokenized equities on Solana, with a paper-trading demo and optional wallet-approved mainnet trading.

## Applications

- `apps/web`: Next.js 15.5 — landing, discovery, full markets, thematic baskets, asset details, portfolio, watchlist, activity, recurring paper plans and account settings.
- `apps/mobile`: Expo / React Native — the same forest-and-lime visual system, shared market data and paper trading. Supported Android builds sign through MWA; iOS and Expo web offer the configured Privy web flow.
- `packages/sdk`: typed issuer discovery, research, quotes, shared API transport/state, paper accounting, wallet execution and guarded protocol utilities.
- Official Solana Subscriptions handles recurring payment permissions; no custom Anchor workspace is required.

The previous static brokerage UI, fabricated market insights, fake holdings and devnet minting endpoints have been retired. The full live issuer catalogs are queried; a missing price is shown as unavailable. No charts, sentiment or news are manufactured.

## Run locally

Use the documented Node 24.12.0 toolchain and the pinned pnpm 10.31.0 lockfile.

```sh
pnpm install
pnpm build:sdk
pnpm dev:web
```

Open `http://localhost:3000`. To run mobile, configure `apps/mobile/.env.local` from its `.env.example`, then run `pnpm dev:mobile`. A physical device must use your computer's LAN address or an HTTPS deployment for `EXPO_PUBLIC_API_BASE_URL`; its own localhost cannot reach your computer.

## Configuration

Copy `apps/web/.env.example` to `apps/web/.env.local`. Market discovery can work with the public issuer APIs and Jupiter's available public endpoint. Configure `JUPITER_API_KEY` for the supported authenticated Jupiter service and actual swap routes. Configure Privy, the mainnet RPC and an independent `KITE_TRADE_SECRET` of at least 32 characters for actual trading. Secrets remain on the web server; only public app IDs and public RPC configuration belong in `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` variables.

See [deployment and rollback verification](docs/deployment-readiness.md), [mainnet data](docs/mainnet-data.md), [trading setup](docs/mainnet-trading.md), and [mobile setup](apps/mobile/README.md) for endpoints, environment variables and limitations.

## Demo flow

1. Open Kite and explore the issuer-listed mainnet assets or a curated basket.
2. Stay in **Paper trading**. Each device starts with $10,000 of clearly labeled virtual USD and no holdings or orders.
3. Review and confirm a paper buy. The shared SDK records an order, adjusts virtual cash and creates a holding at a freshly observed reference price.
4. Inspect portfolio and activity, save a watchlist, or set a recurring paper plan.
5. Paper plans run due installments only while the app is open and fresh prices are available. Missed intervals are not backfilled. They are not unattended mainnet mandates.
6. Switch to **Actual trading**, sign in with Privy or connect a Solana wallet, request a Jupiter quote and approve it in the wallet. Purchases require a wallet signature. Recurring withdrawals require prior owner authorization and a signature from the approved buyer.

Paper orders simulate reference-price execution only; they exclude fees, slippage and corporate-action/scaled-token effects. Their results are not an execution forecast. Web and mobile paper histories are device-local and do not sync. Some PreStocks and xStocks products may be paused or reference-only; the issuer status disables new trades.

## Mainnet architecture

There is no Kite vault in the active product. Thematic baskets are allocations across individual issuer tokens. Paper basket orders validate every component before committing the next ledger state. Actual baskets use one wallet-approved atomic transaction when their routes fit the supported network and wallet limits. Actual recurring token payments use bounded buyer delegation through the official Subscriptions program. Payment delegation does not enforce stock delivery.

`GET /api/markets` discovers and prices tokens. `GET /api/portfolio` reads wallet balances. `POST /api/trade/order` obtains a validated unsigned Jupiter transaction. `POST /api/trade/execute` requires the exact quoted transaction and a valid wallet signature. `POST /api/buy-basket` prepares a complete atomic basket. `/api/recurring` creates and lists payment permissions, with revoke and buyer-collection routes. `/api/transaction/execute` verifies and broadcasts composed wallet-signed transactions. Only the retired `/api/faucet` returns HTTP 410. See [recurring payment setup](docs/mainnet-recurring-payments.md).

## Checks

```sh
pnpm build:sdk
node --test packages/sdk/test/*.test.cjs
pnpm build:web
```

Additional transaction validation tests are in `apps/web/tests`. Native export checks and setup are described in the mobile README.

## Design reference

The requested “Unified UI Design System - Kite project ss” / Stitch source was not included in this checkout. The implemented forest, lime, geometric Kite identity is a provisional shared system; exact Stitch matching requires its link or export. Design tokens live in `apps/web/app/globals.css` and `apps/mobile/src/theme.ts`.
