# AGENTS.md

## Project

Kite is a self-custody interface for tokenized equities on Solana. Its primary users want simple basket purchases and configurable recurring investing. Preserve the hybrid network boundary: **live spot trading is mainnet; wallet recurring is a separate devnet test-token demonstration**. Paper mode starts with $10,000 virtual cash and no seeded holdings. Web and mobile share one SDK.

The project was built for the Solana tokenized stocks hackathon. Do not turn historical submission dates, liquidity audits or prior test totals into current deployment guarantees.

## Workspace and tooling

```text
apps/web/          Next.js App Router, Tailwind, Privy and Solana Wallet Adapter
apps/mobile/       Expo / React Native; native navigation and Android MWA
packages/sdk/      Shared @kite/sdk business logic, types and client transports
packages/anchor/   Devnet kite_guard Anchor program
docs/              Architecture, security, operations and verification
scripts/bot.ts     Authenticated collector trigger; contains no fee-payer key
```

Use the repository Node.js 24.12.0 / pnpm 10.31.0 toolchain and pinned lockfile. Build the SDK before web/mobile consumers. Do not upgrade unrelated dependencies while implementing a feature.

```sh
pnpm install --frozen-lockfile
pnpm build:sdk
pnpm dev:web
pnpm dev:mobile
pnpm typecheck
pnpm test:upgrade
pnpm build:web
pnpm --filter @kite/mobile test
pnpm --filter @kite/mobile exec expo export --platform web --platform android --platform ios
```

New tests use TypeScript and `node:test` through `tsx`; do not add new `.mjs` tests. Run existing suites separately with `node --test packages/sdk/test/*.test.cjs` and `node --test apps/web/tests/*.test.mjs`. Anchor build/runtime tests require their own toolchain; some historical fixtures target an older ABI. A successful local build is not a deployment or funded-transaction verification.

## Mainnet transaction model

- New Jupiter spot swaps and basket purchases negotiate **V1 or V0** using the actual wallet capabilities and the configured mainnet RPC. Prefer V1 only after verifying its feature activation; keep V0 for compatible wallets. Privy embedded signing currently advertises V0 only. Never infer capabilities from a wallet name or hard-code V1 support.
- V1 uses static accounts with **no ALTs**, **4,096 serialized bytes** and **64 runtime accounts**, with explicit compute/data/fee configuration. V0 must fit **1,232 serialized bytes and 64 runtime accounts**; resolve only Jupiter-referenced ALTs and verify their owner, active state and contents on mainnet. Client-provided tables are not trusted. Lookup tables do not expand runtime account capacity.
- Every basket attempts one complete transaction first, with no Jito tip. Route by actual byte/account limits, never asset count. Only typed capacity failures may trigger **two to five ordered transactions** of the negotiated version through Jito. Keep each swap leg intact; invalid instructions, signer errors and simulation failures must not be swallowed as capacity errors. Reject a route that cannot fit these bounds.
- Bundle preparation and execution use the shared SDK contract. Review all debits, minimum outputs, fees, transaction count and tip. Tip accounts are checked against the official Jito set; the tip is the final instruction of the last transaction, never a separate transfer transaction.
- Validate exact ordered signed messages against the server authorization. Persist the signed payload before submission. Recover lost responses through status checks; never silently fall back to sending bundle transactions individually or build a new order while prior execution is uncertain.
- Bundle acceptance is pending. Success requires every expected signature to have successful confirmed/finalized receipts in the same slot. Per-transaction simulation is not a stateful simulation of the entire bundle.
- Do not promise unconditional bundle atomicity: skipped/uncled block rebroadcast can result in independent execution. There is no mainnet cross-transaction Guard in this release.
- Mainnet preparation and execution independently verify the RPC genesis. Use server `SOLANA_RPC_URL`; browser-safe public RPC configuration is separate.

See [Jito basket execution](docs/jito-basket-execution.md) for the authoritative transaction flow and limitations.

## Baskets and creator publishing

Baskets are allocation definitions, not synthetic tokens. BigInt Largest Remainder allocation conserves the specified funding amount across weights totaling 10,000 basis points. Outputs settle to owner wallet accounts. Missing, halted, unpriced or unsupported constituents block preparation.

The curated catalog is defined in the SDK; do not hard-code an asset count or old liquidity result into product copy. `/basket/builder` accepts **2–12 assets** and preserves private drafts. This range does not guarantee every live route will fit execution limits.

Public creator publishing requires a multi-use code from server `CREATOR_INVITE_CODES`, wallet-signed review of the exact allocation, an expiring origin-bound challenge and a one-time challenge nonce. `CREATOR_AUTH_SECRET` signs the challenge. Redis stores immutable published versions and confirmed activity; publishing fails closed without durable storage.

Stats must come from confirmed, deduplicated receipts, exclude self-referrals and keep mainnet USDC units separate from devnet test units. The point formula is one point per complete $100 of mainnet USDC volume plus 100 per active mainnet subscriber. Mainnet recurring remains disabled; devnet subscribers earn no mainnet points. Never credit page views, quotes or unsigned Actions as investments.

## Recurring protocol and Actions

- Paper recurring is local and runs due installments only while the application is open. It does not backfill missed intervals.
- Wallet recurring uses `KITE_RECURRING_RPC_URL` and independently validates **devnet**. The current Guard collects test KUSD through official Solana Subscriptions and mints test stock outputs. Do not describe it as mainnet investing or a Raydium/AMM swap implementation.
- Program IDs: Guard `8Fm9HENPAFnyo6L8cHJFx62HHsZ6ez6CPUDuzgKAzrjs`; Subscriptions `De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44`. Deployment readiness must be checked against the actual on-chain program and mint authorities, not inferred from these addresses.
- Current Anchor entrypoints are `create_plan`, `execute_swap`, `close_plan`; plan seeds are `[b"plan_v2", owner, funding_mint, nonce_u64_le]`. Read current source and IDL before changing codecs. Schedule/allocation bounds, delegation authority, owner destinations and mint authority checks must remain enforced.
- Web, Android and Actions share recurring preparation. User cadence is daily, weekly, biweekly or fixed 30 days, bounded to a year. Do not label a fixed 30-day interval as calendar-month scheduling.
- Actions at `/api/actions/baskets/{id}` produce unsigned V0 devnet transactions with explicit network headers. Setup must fit one transaction; never split an atomic delegation setup to bypass limits. Normal app flows may advertise V1 only when supported and activated on the configured devnet RPC.
- `actions.json` maps basket links. Wildcard CORS is limited to public Actions routes and does not authorize privileged APIs. External social/client rendering depends on registry and network support.
- Both GET and POST `/api/recurring/collect` require `KITE_RECURRING_EXECUTOR_SECRET` (or `CRON_SECRET`) bearer authorization. Never reuse quote HMAC secrets or faucet keys as HTTP authorization.
- `BOT_KEYPAIR` is a server-only devnet fee payer, with the existing faucet keypair as fallback. The Guard PDA is the delegate; the scheduler wallet must never receive unrestricted owner delegation.
- Production collector execution requires Redis leases and signed-transaction journals, bounded scans/timeouts and per-plan error isolation. Preserve unknown-submission recovery and idempotency; count confirmed installments only.

See [Actions and collector operations](docs/actions-and-collector.md) before changing scheduling, delegation or keeper behavior. Do not put privileged collector routes in the mobile development tunnel allowlist.

## Native mobile behavior

The native app has a welcome entry and Explore, Subscriptions, Portfolio and Activity tabs. Android development/release builds use `@solana-mobile/mobile-wallet-adapter-protocol` for authorization and exact-message signing on the device. Batch basket signing happens in one MWA session before server submission, for up to five payloads of the wallet’s advertised transaction version. SecureStore authorizations are separated by network; restored capabilities must be rechecked.

iOS and Expo web currently support browsing and paper mode but **do not support native wallet signing**. Render that limitation honestly. Do not redirect wallet connection, trading or subscription management into the browser. Expo Go lacks the MWA native module. Native devnet plans are created and closed through the shared SDK recurring client; no keeper secret belongs in mobile code.

The physical phone needs a reachable `EXPO_PUBLIC_API_BASE_URL`; `localhost` points at the phone. Preserve Expo web compatibility and avoid importing native-only modules into its bundle. Read [mobile setup](apps/mobile/README.md) for emulator/device prerequisites and verification limits.

## Data and product standards

- Sources include xStocks, PreStocks, Backpack Securities, Jupiter, Yahoo Finance, Wikipedia, Google News RSS and Pyth reference feeds. Discovery-only listings must never be treated as verified tradable mints.
- Stock research covers overview, technicals, fundamentals, news and events where upstream data exists. Market breadth and leaderboards derive from observed data, not fabricated sentiment scores.
- Preserve unavailable and stale-data states. Never introduce fabricated prices, balances, charts, activity, news or creator stats as production fallbacks. Clearly label paper and devnet test-token data.
- Mainnet portfolio values come from wallet balances and available prices. Do not imply an imported wallet's full cost basis is known from balance reads. Activity shown on-device is not an exhaustive chain history.
- Preserve the existing forest/cream/lime design system, tabular financial numbers, accessible contrast and geometric icons. No emoji. The primary task should remain easy to find on mobile and web.

## Code and security guidelines

- Use strict, modular TypeScript. Shared business rules, transaction types and transports belong in `packages/sdk`; native exports must not pull Node-only server modules into Expo.
- Keep wallet modal/provider imports SSR-safe. Clean up subscriptions, fetches and timers, and prevent stale quote responses from replacing a changed user's review.
- Validate amount precision, funding balance, owner, network, supported transaction version, review expiry and exact signed payload before execution. Reject unsupported token extensions rather than bypassing checks.
- Keep private keys, HMAC secrets, provider API keys, creator invites and keeper authorization out of `NEXT_PUBLIC_*`, `EXPO_PUBLIC_*`, browser bundles and logs. Only public app identifiers and restricted public endpoints belong in client config.
- Use canonical HTTPS `KITE_SITE_URL` in deployment, explicit browser origins, and trust forwarded headers only behind a configured trusted proxy.
- No Kite custodial vault is used for mainnet spot purchases. This does not remove issuer, market, network or execution risk; do not claim “no counterparty risk” or guaranteed fills.
- Do not deploy contracts, fund wallets or submit real trades as an incidental test. Report which checks were static, mocked, read-only RPC or actual wallet/device execution. Local builds and RPC feature activation do not establish Jito V1 transport or funded execution; physical Android signing and funded Jito V1 bundles require explicit verification.

## Reference documentation

- [Production upgrade and verification](docs/production-upgrade.md)
- [Jito basket execution](docs/jito-basket-execution.md)
- [Actions and collector operations](docs/actions-and-collector.md)
- [Architecture and data flow](docs/how-it-works.md)
- [Trust and scope](docs/trust-and-scope.md)
- [Guard protocol](docs/kite-guard-protocol.md)
- [Dependency security](docs/dependency-security.md)
- [Mobile setup](apps/mobile/README.md)

Historical protocol/roadmap documents describe earlier implementations. Prefer the current source, generated types and upgrade operations documents when they disagree, and call out remaining deployment uncertainty explicitly.
