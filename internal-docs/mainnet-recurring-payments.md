# Mainnet recurring payments

This page documents the **advanced payment-only** interface. The main Plans screen now supports stock/basket investing with selectable calendar schedules; see [recurring investing operations](recurring-investing-operations.md). All new actual transactions are V1-only and require verified network and signing-wallet support.

Kite uses the official deployed [Solana Subscriptions program](https://solana.com/docs/payments/subscriptions/recurring-delegation), not a Kite vault or a newly deployed contract. The TypeScript client builds instructions for the shared onchain program; TypeScript itself does not replace onchain enforcement.

## Owner flow

Switch to Actual trading and expand advanced payment permissions. Select a funded token, enter the buyer's Solana signing address, an amount per period, cadence and number of periods. Read the buyer-withdrawal consent, review the exact terms, then approve once in a V1-capable wallet. Android checks the wallet's advertised signing capability. Privy sign-in remains available, but login alone does not establish V1 signing support.

The first permission for a mint initializes the Subscription Authority and approves that program PDA as the token delegate. The program then enforces the specific recurring record's limits. No tokens are deposited into a vault. An existing unrelated SPL delegate is never overwritten. A previously disabled authority is never silently reapproved.

Kite creates finite grants of at most one year. The first period starts when the transaction lands; expiry is fixed during review, so a delayed signature cannot extend it. Unspent period allowance does not accumulate. Multiple permissions can cumulatively withdraw more than one permission's limit. The buyer can choose a destination through the underlying program; Kite's collection implementation uses the buyer's own token account.

The buyer is trusted to fulfill any offchain purchase agreement. The permission does not bind stock selection, delivered quantity, minimum stock output or best execution. The UI does not present it as guaranteed recurring stock investment. If automatic stock delivery is needed, the buyer must operate that integration separately or use a program that enforces two-sided settlement.

Use Revoke on a permission to close it and return rent to its stored payer. The buyer cannot make future collections from that record after confirmed revocation. A competing collection can land before revocation. The per-mint authority remains for other grants; wallet-level SPL revocation can disable all its withdrawals, and Kite will refuse to restore it implicitly.

## API

All responses are uncached. Writes are covered by the existing bounded-body, origin and rate policies and the development API tunnel allowlist.

| Endpoint                        | Behavior                                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/recurring?wallet=…`   | Read official recurring records owned by this wallet                                                                        |
| `POST /api/recurring`           | Prepare creation with `taker`, `buyer`, `mint`, decimal-string `amount`, `periodSeconds`, `periods`                         |
| `POST /api/recurring/revoke`    | Prepare owner revocation with `taker`, `delegation`                                                                         |
| `POST /api/recurring/collect`   | Prepare a collection for the approved buyer with `taker`, `delegation`; returns the remaining amount for the current period |
| `POST /api/transaction/execute` | Verify and submit the unchanged wallet-signed transaction and its server authorization                                      |

Preparing an order does not authorize spending. Setup/revocation require the owner signature; collection requires the buyer signature. Program ownership, mainnet genesis, token identity, live authority and simulation are checked. Transfer-hook tokens and native SOL are not supported by this collector. Token-2022 transfer fees can reduce what the buyer receives.

## Run the buyer service

Build the SDK first. Configure these variables only in the buyer service's secret store/process environment:

- `SOLANA_RPC_URL`: dedicated HTTPS mainnet RPC.
- `KITE_BUYER_KEYPAIR_PATH`: absolute path to the approved buyer's Solana JSON keypair, with owner-only filesystem access. Never use an owner's wallet key.
- `KITE_COLLECTION_STATE_DIR`: persistent private directory for intent records and process locks. Defaults to ignored `.kite-collections`.

```sh
pnpm build:sdk
# Collect the available current-period allowance once.
pnpm collect:recurring <DELEGATION_ADDRESS>
# Or keep checking every 60 seconds on buyer-controlled infrastructure.
pnpm collect:recurring <DELEGATION_ADDRESS> --watch
```

The buyer needs SOL for fees and any destination account rent. The service verifies mainnet, the official program and that its signer matches the grant's buyer. It creates the buyer's ATA if needed, simulates, signs and submits the collection. It saves a durable signature/period intent before broadcast. Unknown outcomes halt collection until reconciled against mainnet; they are not retried with a new transaction automatically. Confirmed periods are not deliberately collected twice, and the program independently enforces the allowance.

Run only one instance per permission with a shared persistent state directory. A crash can leave its exclusive `.lock`; investigate the saved signature and ensure no process still owns the job before removing that lock. Do not delete a pending ledger to make the job retry. If the provider is unavailable or confirmation remains unknown, keep the job stopped and resolve the signature first.

Kite does not provision a hosted keeper, generate a buyer key, deploy an additional contract or move funds as part of installation. The runner becomes active only when an operator configures and starts it for an owner-authorized permission.
