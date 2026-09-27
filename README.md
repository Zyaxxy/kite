# Kite

Kite is a self-custody interface for tokenized equities on Solana. Investors can explore thematic baskets, buy their constituent tokens into their own wallets, and configure recurring investments in a separate devnet demonstration. Web and native mobile share `@kite/sdk`.

Mainnet spot trading uses live issuer catalogs and Jupiter routes. Paper trading starts with $10,000 of device-local virtual cash. Automated wallet recurring remains **devnet only**; its KUSD and test stock tokens are not real investments.

## Applications and packages

- **`apps/web`** — Next.js App Router, Privy and Solana Wallet Adapter. Recurring-led discovery, markets, stock research, basket purchases, creator publishing, portfolio and activity.
- **`apps/mobile`** — Expo / React Native with a native welcome screen and Explore, Subscriptions, Portfolio and Activity navigation. Android uses Mobile Wallet Adapter for on-device signing, including basket bundles and devnet subscription management. iOS and Expo web support browsing and paper investing; native wallet signing is unavailable there. Trading and authentication do not redirect to the website.
- **`packages/sdk`** — Shared market data, research types, paper accounting, basket allocation, Jupiter composition, wallet policy, recurring transport and Subscriptions codecs. Native exports keep server-only dependencies out of the app.
- **`packages/anchor`** — The devnet `kite_guard` program for bounded recurring test-token collection and delivery through official Solana Subscriptions. This is separate from mainnet Jupiter trading.

## Run locally

Use the repository toolchain: Node.js 24.12.0 and pnpm 10.31.0. The package manager is pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
cp apps/web/.env.example apps/web/.env.local
pnpm build:sdk
pnpm dev:web
```

Populate the environment file with your own credentials before using authenticated services. Missing market data renders as unavailable; the app does not generate substitute prices, charts or news.

For mobile, copy `apps/mobile/.env.example` to `apps/mobile/.env.local`, then run `pnpm dev:mobile`. Set `EXPO_PUBLIC_API_BASE_URL` to the web API's reachable LAN address or HTTPS origin. A physical phone's `localhost` is the phone itself. `pnpm dev:api-tunnel` exposes the allowlisted development API; `pnpm dev:mobile:tunnel` serves the Expo development bundle. Use an Android development or release build for MWA; Expo Go does not contain its native module. See [mobile setup](apps/mobile/README.md) for build prerequisites and device validation.

## Configuration

The complete templates are [web `.env.example`](apps/web/.env.example) and [mobile `.env.example`](apps/mobile/.env.example).

| Variable                                                  | Scope                | Purpose                                                                        |
| --------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------ |
| `SOLANA_RPC_URL`                                          | Server               | Mainnet account reads, simulation and execution                                |
| `JUPITER_API_KEY`                                         | Server               | Jupiter market and swap APIs                                                   |
| `KITE_TRADE_SECRET`                                       | Server               | Stable, 32+ character order authorization secret                               |
| `JITO_AUTH_UUID`                                          | Server               | Optional authorization for the fixed official Jito endpoint                    |
| `JITO_MAX_TIP_LAMPORTS`                                   | Server               | Bundle tip ceiling; review includes the actual tip                             |
| `KITE_RECURRING_RPC_URL`                                  | Server               | Independently checked devnet RPC for recurring operations                      |
| `KITE_RECURRING_AUTH_SECRET`                              | Server               | Distinct, 32+ character recurring review authorization secret                  |
| `KITE_RECURRING_EXECUTOR_SECRET`                          | Server / scheduler   | 32+ character bearer secret for the collector; `CRON_SECRET` is an alternative |
| `BOT_KEYPAIR`                                             | Server only          | Devnet collector fee payer; never put this in a scheduler payload or client    |
| `KITE_FAUCET_SECRET_KEY`                                  | Server only          | Optional devnet faucet keypair and existing collector fee-payer fallback       |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`      | Server               | Durable creator records, production collector leases and execution journals    |
| `CREATOR_INVITE_CODES`                                    | Server               | Comma-separated, multi-use creator publishing codes                            |
| `CREATOR_AUTH_SECRET`                                     | Server               | 32+ character creator challenge authorization secret                           |
| `KITE_SITE_URL`                                           | Server               | Canonical public HTTPS origin for metadata and Actions                         |
| `KITE_ALLOWED_ORIGINS`                                    | Server               | Exact allowed browser API origins, including Expo web when used                |
| `NEXT_PUBLIC_SOLANA_RPC_URL`, `NEXT_PUBLIC_SOLANA_WS_URL` | Public web config    | Browser-safe mainnet endpoints                                                 |
| `NEXT_PUBLIC_PRIVY_APP_ID`                                | Public web config    | Privy application identifier; its app secret stays server-side                 |
| `EXPO_PUBLIC_API_BASE_URL`                                | Public mobile config | Reachable API origin                                                           |

Only deliberately public configuration belongs in `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*`. Keep provider secrets, private keys, creator codes and keeper credentials on the server. Native apps send no browser Origin header; browser requests use the configured origin allowlist. Do not expose the privileged collector through the development API tunnel.

## Investing and research

The catalog combines xStocks, PreStocks and Backpack Securities discovery. A listing is tradable only when its Solana mint and available route meet the server's checks. Exchange-only or ambiguous Backpack listings remain discovery-only; catalog membership does not prove liquidity.

Research includes available company profiles, historical OHLCV charts, technical indicators, financial statements, news and corporate events. Sources include Yahoo Finance, Wikipedia, Google News RSS and Pyth equity reference feeds. Market Pulse derives breadth and leaderboards from observed asset data. Missing or stale data is displayed explicitly.

Paper mode supports single assets, swaps, baskets and recurring plans without seeded holdings. Paper installments run while the application is open and do not backfill missed intervals. Paper cash, holdings and activity are device-local simulations.

## Mainnet purchases and Jito bundles

New single-stock swaps and basket orders use **Solana V0 transactions** composed from Jupiter Swap V2 instructions. The server verifies Jupiter-referenced Address Lookup Tables on mainnet; it does not accept arbitrary client-supplied tables. Each transaction must fit 1,232 serialized bytes and 64 runtime accounts. ALTs reduce serialized size, not the runtime account limit. The existing V1 encoder remains for compatibility with separately reviewed flows.

Basket definitions allocate funding in integer base units using the Largest Remainder Method, with weights totaling 10,000 basis points. They do not create a synthetic basket token. Output tokens go to the buyer's wallet accounts.

- Baskets with up to three assets use one transaction or return an actionable size/route error.
- Four-asset baskets attempt a single transaction first, then a bundle when needed.
- Larger baskets use two or three ordered V0 transactions through Jito, subject to actual route limits. The custom builder accepts 2–8 assets; that range is not a guarantee that every route will fit.

The review shows funding amounts, output floors, fees, transaction count and the final-transaction tip. Every transaction is simulated separately. One wallet signing session approves the complete ordered bundle; the app persists the signed payload before submission and recovers an uncertain response without rebuilding or individually broadcasting its transactions. An accepted bundle ID is pending, not proof of a purchase. Success requires successful confirmed or finalized receipts for every signature in the same slot.

**Bundle limitation:** Jito processes bundles together in a produced block, but transactions from skipped or uncled blocks may be rebroadcast independently. This implementation has no mainnet cross-transaction guard and cannot promise unconditional atomicity. Per-transaction simulations also do not model all state changes across a bundle. Historical liquidity audits are snapshots, not current execution guarantees. See [Jito basket execution](docs/jito-basket-execution.md).

## Creator baskets

`/basket/builder` creates private 2–8 asset allocations. Publishing requires a connected wallet, a configured multi-use invite code and a signed, expiring challenge tied to the exact allocation and site origin. The server consumes the challenge nonce once and stores immutable published versions in Redis. Private drafts remain available when publishing is unconfigured.

Creator statistics come from confirmed, deduplicated execution receipts; self-referrals are excluded. Mainnet USDC volume earns one point per complete $100, and the formula reserves 100 points per active mainnet subscriber. Mainnet recurring is disabled, so devnet subscriber and test-volume figures are shown separately and earn no mainnet points. Quotes, unsigned Actions and page views do not create investment activity.

## Devnet recurring and Actions

Users choose a stock or basket, installment amount, daily/weekly/biweekly/fixed 30-day cadence and a bounded number of installments. A reviewed wallet transaction creates a Guard plan and Solana Subscriptions delegation. The current devnet program collects test KUSD and mints test stock outputs; it does not execute real equity purchases or AMM swaps. Creation, collection and closing validate the configured devnet network and current contract accounts. Preparation fails closed if the deployed program or mint setup does not match.

The web app, Android app and `/api/actions/baskets/{id}` share the checked recurring preparation path. Actions return unsigned V0 devnet transactions and reject oversized setup instead of splitting the delegation. `actions.json` maps basket links to the Action endpoint. Rendering in external clients depends on their registry, protocol and devnet support; publishing the endpoint alone does not guarantee a social preview.

The collector's GET and POST endpoints require a bearer secret. `scripts/bot.ts` and the scheduled workflow trigger it; fee-payer keys remain server-side. Production uses shared Redis leases, bounded plan scans and a signed-transaction journal to recover unknown submissions without creating a second installment. A failed plan does not stop processing unrelated plans. The Guard PDA, not the scheduler wallet, is the Subscriptions delegate. See [Actions and collector operations](docs/actions-and-collector.md).

## API surface

| Route                                               | Method             | Purpose                                                         |
| --------------------------------------------------- | ------------------ | --------------------------------------------------------------- |
| `/api/markets`, `/api/tokens`                       | GET                | Issuer discovery, prices and funding-token search               |
| `/api/portfolio`                                    | GET                | Mainnet SOL, SPL Token and Token-2022 balances                  |
| `/api/trade/order`                                  | POST               | Prepare a validated V0 spot swap                                |
| `/api/transaction/execute`                          | POST               | Verify and submit a composed owner-signed single transaction    |
| `/api/trade/execute`                                | POST               | Compatibility execution path for existing trade-order contracts |
| `/api/buy-basket`                                   | POST               | Prepare a single transaction or reviewed basket bundle          |
| `/api/bundles/execute`, `/api/bundles/status`       | POST               | Submit a signed ordered bundle; check or recover its receipt    |
| `/api/creators/challenge`                           | POST               | Prepare the signed publishing challenge                         |
| `/api/creators/baskets`                             | GET, POST          | List and publish creator baskets                                |
| `/api/creators/baskets/{id}`, `/api/creators/stats` | GET                | Published allocations and confirmed creator activity            |
| `/api/recurring`                                    | GET, POST          | List devnet plans and prepare setup                             |
| `/api/recurring/config`                             | GET                | Devnet readiness and test asset configuration                   |
| `/api/recurring/revoke`, `/api/recurring/execute`   | POST               | Prepare closing; verify and submit signed devnet transactions   |
| `/api/recurring/collect`                            | GET, POST          | Authenticated, server-run devnet collector                      |
| `/api/actions/baskets/{id}`                         | GET, POST, OPTIONS | Devnet recurring Solana Action                                  |
| `/api/research`, `/api/news`                        | GET                | Stock research and news                                         |
| `/api/faucet`                                       | GET, POST          | Configured devnet test-funding availability and claims          |
| `/api/health`                                       | GET                | Service health                                                  |

## Verification

```sh
pnpm build:sdk
pnpm typecheck

# TypeScript upgrade tests use node:test with tsx.
pnpm test:upgrade

# Legacy suites run separately from the TypeScript files.
node --test packages/sdk/test/*.test.cjs
node --test apps/web/tests/*.test.mjs
pnpm --filter @kite/mobile test

pnpm build:web
pnpm --filter @kite/mobile exec expo export --platform web --platform android --platform ios

# Read-only devnet deployment inspection, using the configured devnet RPC.
node scripts/audit-devnet-recurring.mjs
```

`pnpm build:anchor` and `pnpm test:anchor` require the Solana/Anchor toolchain. Historical runtime fixtures and audit notes may describe earlier contract layouts; compare them with the current ABI before interpreting their results. Static checks and Expo exports do not replace funded execution or a physical Android wallet test. See [production upgrade verification and remaining deployment work](docs/production-upgrade.md).

## Design and further documentation

The web and mobile applications share Kite's forest, cream and lime palette, tabular financial numerals and geometric iconography without emoji. Web design tokens live in `apps/web/app/globals.css`; mobile tokens live in `apps/mobile/src/theme.tsx`.

- [Mainnet data](docs/mainnet-data.md) and [stock research](docs/stock-research.md)
- [Jito basket execution](docs/jito-basket-execution.md)
- [Actions and collector operations](docs/actions-and-collector.md)
- [Production upgrade](docs/production-upgrade.md)
- [Devnet contract audit](docs/devnet-contract-audit.md) and [deployment readiness](docs/deployment-readiness.md)
