# Production upgrade and verification

The original Colosseum upgrade was implemented on `feature/colosseum-mobile-upgrade`. The subsequent `PLAN.md` implementation on `codex/plan-dual-route-upgrade` adds negotiated V1/V0 routing, larger bounded bundles and expanded basket definitions. Neither source change deploys the Anchor program. Mainnet spot purchases and devnet test-token recurring subscriptions remain separate products with separate RPC clients and genesis checks.

## Implemented scope

| Directive           | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Network isolation   | Dedicated mainnet and devnet utilities; preparation, simulation, broadcast and recovery verify the correct cluster. No browser-supplied RPC URLs.                                                                                                                                                                                                                                                                                                                                |
| Jito baskets        | Every mainnet order tries one transaction first. V1 requires actual wallet capability and verified mainnet activation, uses static accounts without ALTs, and fits 4,096 bytes/64 accounts. Compatible V0 uses 1,232 bytes/64 accounts and verified Jupiter ALTs. Only capacity failures select two to five transactions. Dynamic, capped tips attach to the final transaction. Both clients preserve unresolved signed receipts and never individually rebroadcast bundle legs. |
| Product positioning | Landing and discovery present basket purchases, stock research, portfolio ownership and configurable recurring investing with explicit paper/devnet distinctions. No fabricated prices, returns, plan activity or subscriber totals.                                                                                                                                                                                                                                             |
| Creator publishing  | Three-step allocation studio for two to twelve assets, subject to live route capacity; private device drafts; immutable public allocations behind multi-use ENV invitations plus wallet-signed, origin-bound, expiring approvals and one-use nonces. Public creator baskets resolve through a durable server registry.                                                                                                                                                           |
| Creator points      | Exact integer USDC receipt accounting, signature deduplication and exclusion of self-purchases. One point per $100 routed plus 100 per active mainnet subscriber. Mainnet recurring is disabled, so test subscribers never earn production points. Devnet counts are reconciled against current plan/delegation accounts.                                                                                                                                                        |
| Actions/Blinks      | Public Actions mapping, standard SDK metadata and unsigned devnet subscription transactions. Published creator allocations cannot be overridden by the caller.                                                                                                                                                                                                                                                                                                                   |
| Collector           | Mandatory bearer authorization; cross-instance lease, exact signed-message retry journal, rotating bounded batches, isolated per-plan failures and confirmed-only success counts. The scheduler carries no wallet signing key.                                                                                                                                                                                                                                                   |
| Native mobile       | Native welcome, native bottom tabs and stack, Explore, subscriptions, portfolio and activity. Android MWA handles explicit mainnet/devnet authorizations and batch signing. No browser handoff for native trading or recurring. Unsupported signing platforms show an explicit unavailable state.                                                                                                                                                                                |
| Cleanup             | Removed obsolete builder CSS/command component, native recurring parser, and standalone signing bot. Removed synthetic custom-basket liquidity audit claims. New and migrated tests use TypeScript with node:test and tsx.                                                                                                                                                                                                                                                       |

## Configuration

`apps/web/.env.example` is the deployable configuration checklist; actual `.env` files remain ignored. Local secret generation during an earlier implementation is not evidence that deployment values exist; configure and verify each deployment separately.

- `SOLANA_RPC_URL`: dedicated mainnet endpoint. `KITE_RECURRING_RPC_URL`: dedicated devnet endpoint. Keep browser RPC credentials origin-restricted and separate from privileged server keys.
- `CREATOR_INVITE_CODES`: comma-separated multi-use invitation codes. `CREATOR_AUTH_SECRET`: separate random secret, at least 32 characters. Empty configuration disables publishing while private drafts remain available.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`: required for durable creator records and production collector locks/journals. Store receipts permanently if maintaining lifetime creator points.
- `KITE_RECURRING_EXECUTOR_SECRET`: separate random bearer secret, at least 32 characters. Set the same value in the deployment and scheduled workflow. `CRON_SECRET` is an explicit alternative. HMAC review secrets and private keys are not endpoint credentials.
- `BOT_KEYPAIR`: optional dedicated devnet collector fee-payer; existing devnet faucet key is a compatibility fallback. Do not use a mainnet funding key.
- `JITO_AUTH_UUID`: optional; default is the public official endpoint. `JITO_MAX_TIP_LAMPORTS`: between 1,000 and 100,000, default 100,000.
- `KITE_SITE_URL`: public HTTPS origin for deployed Actions. `KITE_ALLOWED_ORIGINS`: exact Expo web browser origins. Android uses the configured API origin without an Origin header. Tunnels expose only the required client routes; the collector is excluded.

The GitHub workflow needs `KITE_WEB_URL` and `KITE_RECURRING_EXECUTOR_SECRET`. These settings are not automatically installed in a deployment or GitHub repository by this code change.

## Execution boundaries

Wallet capability negotiation remains honest: web Privy embedded signing advertises V0 only; compatible external wallets and Android MWA may advertise V1. No wallet-name detection or mainnet activation result alone enables V1 signing. A single transaction has no Jito tip. Bundle review discloses the actual transaction count, version and tip; wallet-standard/MWA batching does not guarantee one approval prompt in every wallet.

Jito bundles are processed together within their produced block. Jito documents an exception for skipped/uncled blocks: individual transactions can be rebroadcast outside the original bundle. There is no mainnet cross-transaction guard here, so the review UI discloses possible partial execution and blocks replacement purchases while receipts are unresolved. This is not an unconditional atomicity guarantee.

The current devnet Guard ABI collects test KUSD and mints test stocks; it does not buy mainnet equities or swap through an AMM. Setup verifies protocol simulation, mint ownership and mint authority. Larger devnet setup transactions may exceed v0's packet/account bounds; the app accepts V1 only when the wallet explicitly advertises it and the RPC supports it. The Blink path returns v0 only and rejects oversized setup rather than splitting delegation from its guard.

Creator volume reflects confirmed Kite purchases routed from USDC, not all wallet activity or USD estimates of other funding tokens. Attribution storage failures never turn a confirmed purchase into a retryable trade failure. A later receipt check can retry attribution; an external backfill/indexer is not included. Public discovery lists the newest 100 creator allocations; stable direct IDs still resolve older records. Each creator may publish at most 100 immutable versions.

iOS and Expo web can browse and use paper practice; native wallet signing is Android-only. A compatible Blink client and deployed-origin registration are needed for social-feed rendering. Endpoint implementation alone does not guarantee that X displays a Blink.

## Verification and remaining rollout work

Earlier upgrade verification included legacy and TypeScript suites, SDK/web/mobile type checks, a Next.js production build, Expo exports, client-secret scanning and responsive browser checks. Those historical results are not current deployment guarantees. Run the commands below for the revision being released and record current results with its commit. The dual-route tests cover V1 static-account composition, byte limits even below 64 accounts, five-chunk bounds, exact reviewed versions, incomplete receipts and capacity-only fallback. See [dependency security](dependency-security.md) for the prior audit scope; recheck advisories for the release rather than carrying forward historical totals.

Automated verification uses deterministic transaction/provider fixtures; it does not submit trades. Funded Jito V1 execution, physical Android MWA signing and a funded devnet installment remain unverified. RPC feature activation does not establish Block Engine V1 acceptance, while build/export checks cannot verify wallet prompts or actual settlement.

```sh
pnpm build:sdk
node --test packages/sdk/test/*.test.cjs
node --test apps/web/tests/*.test.mjs
node --test apps/mobile/tests/*.test.cjs
pnpm test:upgrade
pnpm typecheck
pnpm build:web
pnpm --filter @kite/mobile exec expo export --platform web --platform android --platform ios
npx solana-mobile@latest doctor
```

The doctor run recorded on 2026-09-27 found Node, package managers and host basics available, but JDK/JAVA_HOME, Android SDK, adb and an emulator missing; rerun it to establish the current host state. Native development builds and physical-device MWA signing remain unverified. Provision that toolchain and test on Android before distribution.

Before production rollout, configure the deployment variables, verify public Actions with a compatible devnet client, test a bounded devnet create/collect/revoke cycle, and verify mainnet quote/sign/receipt behavior with an explicitly approved funded test. No funded transaction, faucet request, smart-contract deployment or production rollout was performed during this implementation.

See [mainnet execution](jito-basket-execution.md), [Actions and collector](actions-and-collector.md), and [mobile setup](../apps/mobile/README.md) for protocol details and official references.
