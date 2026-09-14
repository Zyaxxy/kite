# Kite Guard V2: devnet recurring stocks and baskets

This implementation awaits a separate deployment. The earlier `execute_swap` scaffold only updated counters; it did not collect or swap tokens. V2 collects through official Solana Subscriptions and swaps each basket allocation through official Raydium CPMM **devnet** in the same transaction. Legacy create/execute instructions reject; legacy owner-only close remains available for rent recovery.

Mainnet spot trading continues to use Jupiter. Wallet recurring investing uses the devnet backend. Paper recurring plans remain local simulations. No cron worker is included.

## Programs and accounts

| Role | Program |
| --- | --- |
| Kite Guard (Anchor 1.2) | `8Fm9HENPAFnyo6L8cHJFx62HHsZ6ez6CPUDuzgKAzrjs` |
| Solana Subscriptions 0.5 | `De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44` |
| Raydium CPMM devnet | `DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb` |

Raydium provides a deployed devnet CPMM program for provisioned test-token pools. Routing is pinned to that program. See its [official program registry](https://docs.raydium.io/reference/program-addresses), [CPMM accounts](https://docs.raydium.io/products/cpmm/accounts), and [swap instruction](https://github.com/raydium-io/raydium-cp-swap/blob/master/programs/cp-swap/src/instructions/swap_base_input.rs).

The API verifies devnet genesis (`EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`) during preparation and broadcast. It simulates `protocol_version()` and requires return value 2 before preparing transactions. The currently deployed scaffold cannot satisfy this check. The contract pins devnet program IDs; cluster verification also belongs in the API/client because programs cannot directly inspect the RPC's genesis hash.

Each plan has its own PDA: `["plan_v2", owner, funding_mint, nonce_u64_le]`. This PDA is the Subscriptions recurring delegation's sole delegatee. Only Guard can sign for it; a caller signs solely to pay transaction fees. No buyer, keeper, or swapper asset-spending key is configured.

Funding stays in the investor's ATA between installments. The plan's ATA stages funds within an atomic collection. Outputs go directly to the investor's canonical ATAs. Incidental tokens sent to the staging account are preserved and returned on cancellation.

PlanV2 accounts allocate 1,684 bytes and bind the owner, funding amount, exact schedule, delegation generation, nonce, and up to 20 unique output mints. Positive integer weights must total 10,000 bps. Each output stores an immutable approved pool and minimum output amount. The SDK also enforces V1 transaction size/account limits: the 20-asset protocol bound does not guarantee every possible basket fits. All 11 supported public baskets, including seven-stock MAG7, fit the SDK's V1 envelope.

## Lifecycle and invariants

1. **Review/create.** The API resolves a canonical stock or basket, verifies mint/pool accounts, and quotes reserves and fees. The owner reviews and signs one V1 transaction creating necessary ATAs, initializing Subscriptions authority when needed, creating the bounded delegation, and calling `create_plan_v2`. An existing disabled funding authority is never silently restored.
2. **Collect.** `execute_swap_v2` checks the on-chain clock, exact grant generation/terms, canonical accounts, approved pools, and execution index. It CPIs into Subscriptions, allocates funding with integer largest-remainder rounding, and CPIs into Raydium for every leg. It checks exact input debits and actual output balance deltas. Counters advance only after every leg succeeds. Failure rolls back collection, prior swaps, and counters. See the [official Subscriptions instruction](https://github.com/solana-foundation/subscriptions/blob/main/program/src/instructions/transfer_recurring_delegation.rs).
3. **Cancel.** Owner-signed `close_plan_v2` revokes the exact grant, refunds staging tokens, and closes the plan/staging ATA. An already-revoked delegation does not block cancellation. Delegation rent goes to its recorded payer; plan/staging rent goes to the owner. Other plans sharing the funding authority are unaffected.

Schedules allow 1–365 periods, at least 60 seconds per period, and total duration at most 365 days. Start must be within the next five minutes at creation; the API allows two minutes for review. Expiration equals start plus cadence times period count. Each schedule index executes at most once. Missed indexes are skipped with no catch-up withdrawals. Cancel/recreate to change terms.

**Minimum outputs remain fixed for the plan's lifetime.** The API uses a 1% tolerance on the creation quote. These are token-unit floors, not an oracle-relative guarantee for future dates. If a pool later cannot deliver a floor, that installment fails atomically. The owner must approve a new plan for different floors/routes. A collector cannot loosen them.

Only plain SPL Token accounts/mints are supported. Token-2022, freeze authorities, unsupported creator-fee configurations, wrong vaults/programs, and substituted destinations fail closed. This is a test-token implementation, not an audited production release. Guard, Subscriptions, and Raydium upgrade authorities remain part of the trust model.

## Catalog and provisioning

`packages/sdk/src/devnet-xstocks.ts` defines 40 valueless test stocks covering all 11 public baskets, plus six-decimal **KUSD (Kite Test USD)** funding. These are not issuer-backed xStocks or Circle USDC. Private-market `SOL-PRE` is excluded.

The old manifest contained placeholder/nonexistent addresses. It now explicitly starts `unprovisioned`, with no invented mint addresses. Catalog changes do not mint tokens or create liquidity.

Read-only inspection:

```bash
pnpm build:sdk
node scripts/create-devnet-xstocks.cjs --list
SOLANA_DEVNET_RPC_URL=https://api.devnet.solana.com node scripts/create-devnet-xstocks.cjs --dry-run
```

For a separately authorized provisioning run, `node scripts/create-devnet-xstocks.cjs /path/to/devnet-authority.json` creates/funds all supported mints. `--symbols KUSD,AAPL,MSFT` selects a subset. The script verifies devnet before loading the authority, preserves recorded addresses, resumes interrupted mint creation, and tops total supply up to one million whole units per mint. Its private git-ignored `.env.kite-devnet-xstocks-state.json` checkpoint preserves pending keypairs: do not publish it or remove it during an incomplete run. The public manifest records verified addresses. This script does not create pools or distribute user balances.

Provision/fund a Raydium devnet CPMM pool pairing KUSD with each enabled stock separately, and configure those verified addresses. Creation stays disabled until actual mints, liquidity, and the V2 contract are available.

## Backend configuration and API

```dotenv
KITE_RECURRING_RPC_URL=https://api.devnet.solana.com
KITE_RECURRING_AUTH_SECRET=<server-only-random-secret-at-least-32-characters>
KITE_RECURRING_POOLS={"<output-mint>":"<devnet-cpmm-pool>"}
```

The recurring RPC is independent of mainnet `SOLANA_RPC_URL`. The HMAC secret binds reviewed bytes; it cannot sign withdrawals. Obsolete recurring buyer/keeper key configuration is removed.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/recurring/config` | Explicit readiness, token/basket availability, missing setup reasons |
| `GET /api/recurring?wallet=…` | Decode the owner's devnet V2 plans |
| `POST /api/recurring` | Prepare stock/basket creation |
| `POST /api/recurring/collect` | Prepare a due installment for a fee payer |
| `POST /api/recurring/revoke` | Prepare owner-only cancellation |
| `POST /api/recurring/execute` | Verify the reviewed message/signature and broadcast to devnet |

POST requests require `schemaVersion: 1`. Owner preparation requires wallet V1 support; a collector must be able to sign the returned V1 transaction. Prepared transactions are simulated and authorized for 45 seconds using an exact message hash and block-height bound. Broadcast rechecks cluster, signature, and lifetime. A submitted signature is not reported as confirmed success. Collection routes, amounts, recipients, and minima come from the plan rather than caller input. A future cron worker can prepare, sign as fee payer, and submit this flow without an asset-spending key; no worker or schedule is created here.

## Verification

```bash
pnpm build:sdk
node --test packages/sdk/test/*.test.cjs
node --test apps/web/tests/recurring-devnet.test.mjs
cargo test --manifest-path packages/anchor/Cargo.toml -p kite_guard
node packages/anchor/scripts/sync-idl.cjs --check
pnpm build:web
```

The SDK IDL/type are generated from Rust Anchor macros. Tests cover allocation conservation, schedule/replay boundaries, malformed grants/routes, wire layouts, official Subscriptions PDA derivations, all public basket transaction sizes, catalog validation, resumable provisioning, and transaction authorization. Local runtime CPI fixtures in `packages/anchor` use pinned official Subscriptions/Raydium binaries and synthetic local pool accounts. Their compact V0 test envelope exercises CPI behavior; separate SDK tests verify the application’s V1 transaction construction and size limits. Tests do not deploy programs or submit network transactions.
