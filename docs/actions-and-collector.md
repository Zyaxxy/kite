# Devnet Actions and recurring collector

Kite's recurring backend in this checkout uses **devnet test KUSD and test stock minting**. It does not buy mainnet stocks or implement recurring mainnet swaps. Mainnet spot swaps and Jito bundles use separate clients and remain separate from this flow.

## Shareable subscriptions

`GET /actions.json` maps `/basket/*` (plus the plural compatibility path `/baskets/*`) and `/api/actions/**` to the Actions API. `GET /api/actions/baskets/{id}` describes a curated or published creator basket. The POST action accepts `{ "account": "<owner wallet>" }` and the declared `amount`, `cadence`, and `periods` query parameters. It returns an unsigned serialized V0 transaction for the client to approve and broadcast on **devnet**.

- Cadences are daily, weekly, every two weeks, or a fixed 30-day interval. Total permission duration is at most one year. The metadata explicitly distinguishes the 30-day schedule from calendar-month billing.
- The same Guard and official Subscriptions instruction builder is used by the app, native mobile and Actions. Owner, funding authority generation, provisioned mint ownership/authority, exact allocation, signer count and devnet genesis are checked. A protocol-version simulation must pass before any transaction is returned.
- Creator IDs resolve immutable published records from the creator registry; request bodies cannot inject allocations, destinations, mints, instructions or delegates. A creator asset without a provisioned devnet test mint blocks the subscription.
- V0 messages have at most 64 accounts and 1,232 serialized bytes, with no lookup tables. Larger setups are rejected with a useful error. Setup is never split into independently signable delegation and guard transactions. Standard app requests can advertise V1 and use it only if activated on the selected devnet RPC.
- Actions are the only API namespace with wildcard CORS. Metadata, POST responses, errors and OPTIONS advertise the devnet CAIP-2 ID. No browser credentials or privileged executor token are used by Actions.
- Repeated identical POSTs reuse a short-lived cached reviewed plan. Creating an unsigned plan does not add a subscriber or award points. Confirmed application execution or the first confirmed collector pass records devnet-only activity.

Configure a canonical public HTTPS `KITE_SITE_URL` before sharing public links. A link can be opened in a compatible Blink client, for example `https://dial.to/?action=solana-action%3Ahttps%3A%2F%2Fkite.runs%2Fapi%2Factions%2Fbaskets%2F<id>`. X/Twitter unfurling also depends on the wallet/client's registry and devnet support. Register and inspect the deployed origin with Dialect; implementing an endpoint alone does not guarantee social-feed rendering.

## Authenticated collection

Both GET and POST `/api/recurring/collect` require `Authorization: Bearer <secret>`. Configure a server-only `KITE_RECURRING_EXECUTOR_SECRET` of at least 32 characters, or explicitly use `CRON_SECRET`. The HMAC transaction-review secret and faucet key are never accepted as HTTP authorization. Missing credentials fail before any RPC or signing work. A malformed POST never triggers a collection pass.

The keeper uses `BOT_KEYPAIR` (with the existing devnet faucet key fallback) as the transaction fee payer. It does not acquire owner token authority: Guard checks the exact period and collects through its plan PDA. Older provisioning may also have granted that key test-token mint authority; keep it server-only, audit the actual mint authorities, and migrate those test mints to the required Guard mint authority before expecting setup to succeed.

The scheduled GitHub workflow runs `scripts/bot.ts` as an authenticated HTTP trigger. Set repository secrets `KITE_WEB_URL` and `KITE_RECURRING_EXECUTOR_SECRET`; the signing key belongs only in the web deployment environment, not the workflow. The legacy local signing bot has been removed, so all automated execution shares the same lease and recovery journal.

Production requires Upstash Redis for:

1. A 120-second compare-and-delete lease across workers, longer than the route execution budget.
2. A journal of the exact signed installment written **before** submission. A timeout recovers the same signature and authorization. A replacement is possible only after definitive failure/expiry and another on-chain due-period check.
3. A cursor rotating through plan addresses. Each pass considers at most 32 accounts, starts no new plan after a 20-second processing window, and all RPC work shares a 40-second deadline.

Each plan runs in isolated exception handling. Underfunded or malformed plans do not prevent later wallets from being processed. `collected` counts only confirmed transactions; submitted/unknown outcomes are `pending`. Each multi-asset installment remains one Guard transaction, so one failed leg rolls back the entire debit. Jito's mainnet block engine is never used for devnet recurring.

The on-chain period check is the final duplicate-debit safeguard. In-memory leases are provided only for a single development process. Redis failure in production stops new collector work instead of silently removing concurrency protection.

Creator subscriber statistics are checked against confirmed plan, delegation, authority and funding token accounts in 100-plan batches, with at most two RPC workers. Shared storage and RPC requests share a 25-second deadline. The response uses only that verified snapshot, excludes expired/completed/revoked plans, and returns unavailable if any batch cannot be verified. There is no 100-subscription cutoff or partial fallback. Confirmed closes remove stored receipts; stats reads do not delete a delegation that an owner could later approve again. Devnet subscribers never earn mainnet creator points.

## Validation and rollout

TypeScript tests cover bearer authorization, isolation, leases, deadlines, exact-message recovery, real Ed25519 signatures, cluster separation, V0 negotiation, packet/account bounds, and Action request validation. No chain deployment, private-key broadcast, or funded transaction was performed as part of implementation.

Before rollout, configure the executor secret in the deployment and cron provider, inspect Actions at the public HTTPS origin, and verify the deployed Guard protocol with a funded devnet test wallet. Larger basket setup can exceed the V0 packet limit; wallets must advertise V1 explicitly to use the larger format. Recurring mainnet execution remains disabled.

References: [Solana Actions specification](https://solana.com/docs/tools/actions), [official Actions SDK](https://www.npmjs.com/package/@solana/actions), [Dialect registration](https://dial.to/register), [Blinks Inspector](https://www.blinks.xyz/).
