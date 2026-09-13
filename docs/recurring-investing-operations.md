# Recurring stock and basket investing

The investment service builds a single atomic transaction containing a permitted funding-token collection and Jupiter swaps delivering stock tokens to the investor. A single stock is a one-asset, 100% allocation. Baskets freeze their output mints and weights when the user approves the plan; editing a curated basket does not silently change existing plans.

No custom Kite program or prefunded investor vault is introduced. The official Solana Subscriptions program enforces the funding permission. The executor is trusted: it can use its allowance without stock delivery if it constructs a different transaction. The UI explicitly discloses that boundary. Atomic rollback protects transactions built by this service, not arbitrary behavior by a compromised delegate. Onchain enforcement of investment delivery remains a separate execution-guard project.

## User-selected schedules

- Daily, weekly and monthly, with an interval from 1–12: for example every two weeks or every three months.
- Starts at a selected UTC date/time, at least two minutes in the future. UTC is explicit in both apps; this release does not implement local-time/DST schedules.
- Calendar months retain the original day, clamping to month end without drift: January 31 → February 28 → March 31 in a non-leap year.
- A finite number of installments, with the complete authorization ending within one year of review.
- An installment may execute during its six-hour window. Missed windows are skipped, not accumulated into later purchases. The interface records missed windows when reconciling a confirmed plan.

Subscriptions uses fixed-length periods. The plan uses the minimum spacing between its scheduled installments for the onchain cap, and an exact final expiry. For calendar months, the buyer's earliest permitted collection can differ from the service's calendar date. The review separately displays scheduled investment count, fixed-period withdrawal cap, maximum possible collections and total authorized funding exposure. Amounts are denominated in the selected funding token, not an implied fixed USD budget.

## Persistence and execution

An unsigned preview does not occupy persistent plan capacity. The server binds a hash of the complete plan into its transaction authorization. The owner signs the setup transaction; the execute endpoint verifies the signature and plan hash, durably saves the approved draft, then broadcasts. The draft becomes active only after its onchain delegation matches the saved owner, executor, token, amount, period, start and expiry.

The worker operates with its own executor key. No investor private key enters the API. Both worker and API save signed intent before submission. Investment authorizations are scoped to one plan and occurrence; the generic execution endpoint rejects them. Repeated record requests reconcile the same signature. To recover a crash after saving intent but before RPC submission, the API may rebroadcast the identical signed bytes while the original authorization and block-height limits remain valid. It never replaces the transaction or signs a new purchase. Older records without the original authorization metadata remain reconciliation-only. An expired review that was never submitted can be discarded; an ambiguous broadcast stays pending until its outcome is established. A blocked plan does not block other plans.

Receipts use confirmed onchain token balance changes and fees, not simulated amounts. A confirmed signature is not reported as a successful investment until transaction metadata and delivered stock balances are verified; unavailable metadata keeps the receipt pending. Failed transactions retain a failure receipt; a later scheduled occurrence can still run. Revocation requires the owner's signature and ends the grant after confirmation. Stopping a worker or rolling back code does not revoke onchain permission.

Plan terms and receipts are publicly readable by wallet address, as disclosed during setup. No private profile information is stored. This release does not claim private or encrypted schedule metadata.

## Runtime configuration

Run the API on persistent infrastructure. The file store requires an absolute private directory with mode 0700 and atomic filesystem operations; every API process serving these plans must share that volume. Ephemeral Vercel storage is explicitly rejected. A database-backed store is a later deployment option, not implemented here.

API environment:

```text
SOLANA_RPC_URL=<production HTTPS Solana mainnet RPC>
JUPITER_API_KEY=<server-only provider key>
KITE_TRADE_SECRET=<server-only authorization secret>
KITE_INVESTING_EXECUTOR=<executor public Solana address>
KITE_INVESTING_STATE_DIR=<absolute private persistent directory>
KITE_RECURRING_EXECUTOR_SECRET=<distinct server/worker credential of at least 32 characters>
```

Worker environment:

```text
KITE_WEB_API_URL=<stable HTTPS API origin>
KITE_RECURRING_EXECUTOR_SECRET=<same executor API credential>
KITE_BUYER_KEYPAIR_PATH=<absolute path to private executor key file, mode 0600>
KITE_RECURRING_WORKER_STATE_DIR=<private persistent worker directory, mode 0700>
```

Build the SDK and start the worker under a supervised service with graceful termination and persistent storage:

```sh
pnpm build:sdk
node scripts/run-recurring-investments.cjs --watch
```

The worker polls through authenticated `/api/investing/executor` requests. Recent reachability is recorded with a three-minute heartbeat expiry. Missing heartbeat, incomplete configuration, inactive V1 or unsupported wallet signing disables new plan approval. A heartbeat demonstrates recent reachability, not guaranteed future execution. The executor needs SOL for fees and account creation; fee economics must be included in deployment planning.

Server leases are not blindly stolen. After a server crash, reconcile any pending signatures and ensure the old process has stopped before an operator removes a stale plan lock. Never clear pending intent merely because a request timed out. Back up the ledger and monitor `issues` in executor responses, rejected preparations, failed receipts and worker heartbeat.

## API contract

| Endpoint                            | Purpose                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `GET /api/investing/config`         | Configuration, executor public address and current availability               |
| `POST /api/investing/plans`         | Validate/freeze a basket or stock plan and return an unsigned V1 setup review |
| `POST /api/transaction/execute`     | Verify an owner-signed setup, persist its bound plan and broadcast            |
| `GET /api/investing/plans?wallet=…` | Read/reconcile wallet plans and receipts                                      |
| `GET /api/investing/executor`       | Authenticated heartbeat and bounded, independent due-work scan                |
| `POST /api/investing/executor`      | Authenticated prepare, record, reconcile or expired-review discard            |
| `POST /api/recurring/revoke`        | Build owner-signed revocation; requires V1 wallet capability                  |

Keep API-origin allowlists and the HTTPS reverse proxy configuration aligned with Expo web and mobile. Native apps use the same stable HTTPS API; development tunnels are separate from durable worker deployment.

## Verification and remaining release gates

Automated tests cover real instruction composition with isolated RPC fixtures, integer allocations, exact funding debits, output ownership/minimums, unsupported token extensions, price-impact limits, calendar boundaries, signed-plan persistence, idempotency, crash recovery and per-plan isolation. Jupiter instructions are decoded using a bounded parser and pinned program-owned mainnet IDL, with encoded amounts, slippage, fees and settlement accounts matched to the review. See the [schema provenance and refresh procedure](../packages/sdk/src/jupiter-idl/README.md). These tests do not establish funded mainnet execution.

Before enabling actual schedules, verify mainnet V1 activation and the exact wallet signing method, current routes and account limits, provider capacity, executor funding, persistent storage, and owner-controlled funded end-to-end runs. Demonstrate both a single stock and a multi-stock basket, an intentionally failed leg, restart recovery and confirmed revocation. No owner funds, executor key or hosted worker were provisioned by the implementation work.

The current route builder rejects transfer-hook, non-transferable or paused mints, fee-bearing funding tokens, unsupported account setup and transactions exceeding V1/account limits. Native SOL requires a separate supported funding design. Catalog visibility does not guarantee an executable route.
