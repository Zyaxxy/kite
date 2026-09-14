# Kite SDK and mainnet execution

Updated 13 September 2026.

`packages/sdk` owns exact token math, issuer data, research normalization, paper state, the shared HTTP client, atomic transaction composition and official Subscriptions instruction builders. Web and Android use the same API contracts. Private Jupiter credentials, HMAC authorization and RPC submission remain in the Next.js server. Buyer signing keys belong only on buyer-controlled infrastructure.

## One approval for a complete basket

The actual basket screens now call `POST /api/buy-basket`. The server resolves the complete issuer basket, verifies tradability and onchain mint precision, allocates integer funding units using largest remainders, and fetches Jupiter Swap V2 `/build` routes through a bounded, paced queue with a limited rate-limit retry. Any supported funding token may be used. An allocation already held in the input token is retained instead of swapped to itself.

Each route must match the pair, allocated amount and chosen slippage. The server accepts the Jupiter swap program, restricts setup to owned ATAs and bounded SOL wrapping, and composes one V1 transaction with inline addresses. It simulates the complete purchase and checks minimum output delivery into the user's token accounts and the input-token debit. It does not concatenate independently signed `/order` transactions.

The wallet reviews and signs once. `POST /api/transaction/execute` verifies the server HMAC, identical message, expiry and payer's Ed25519 signature before RPC broadcast. Confirmation uncertainty persists across reloads and is never treated as permission to place another order automatically. Atomic failure rolls back all asset changes; network fees can still apply.

## V1 creation and historical transaction reading

All new actual transactions use V1; the unused V0 builder has been removed. Kit 8 builds messages with explicit compute-unit, loaded-account-data and total-lamport priority-fee limits. V1 permits up to 4,096 bytes and still has a 64-account limit. No ALTs are used or fetched. Historical V0 transactions remain readable for receipts and pending-outcome recovery.

Creation is enabled only when the mainnet feature account is owned by the Feature program, has an activation slot at or before the observed slot, and the selected wallet signing method explicitly advertises V1. The server checks activation again before broadcasting. Android checks MWA capabilities afresh before signing. Privy sign-in remains available, but unsupported embedded signers do not bypass the V1 requirement; a compatible external wallet can be connected while signed in.

Solana's official page currently schedules mainnet activation for epoch 1035, approximately **15 September 2026, 01:20 UTC**. The date is not used as a capability switch. [Official activation and client requirements](https://solana.com/upgrades/larger-transaction-sizes).

An oversized or unsupported route fails as a complete basket. There is no partial-fill fallback and no guarantee that every seven-stock routing combination fits. Liquidity, account count, simulation, wallet support and network activation remain live constraints.

## Recurring payments without a Kite contract

Kite integrates `@solana/subscriptions` with the existing mainnet program:

`De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44`

Creation initializes the user's per-mint Subscription Authority when needed and creates a bounded recurring delegation in one wallet-signed transaction. Limits specify the token, buyer, amount per period, period length and hard expiry. Funds stay in the owner's token account. No Kite vault, synthetic basket token, custom program ID or Anchor deployment is required.

The shared authority receives the SPL delegate allowance; the program's recurring records enforce each buyer's period limit and expiry. Kite refuses to replace an unrelated delegate or silently restore a disabled authority. Existing records are listed from mainnet and can be revoked through the UI. Revocation cannot reverse a completed collection.

**This is a payment permission, not an enforced stock-delivery contract.** The authorized buyer can withdraw within the grant without providing stocks. The consent screen says this explicitly. Multiple grants have additive spending limits. Native SOL and transfer-hook tokens are rejected by this integration. Standard SPL and supported Token-2022 accounts use their actual mint program and precision; extension compatibility must pass simulation.

The SDK pins Kit 7 and its sysvars generation for the official Subscriptions SDK peer range, and aliases Kit 8 for V1 serialization. These are deliberate compatibility boundaries.

## Buyer-side collection

The primary Plans flow now uses the [recurring investment service](kite-guard-protocol.md): shared daily/weekly/calendar-monthly schedules, immutable basket/stock plans, signed setup persistence, atomic collection plus stock swaps, durable worker recovery, actual receipts and owner revocation. New approvals require executor configuration and a recent heartbeat. This service is implemented but still requires operating infrastructure and funded end-to-end verification. The paragraphs below describe the retained advanced payment-only collector.

The owner signs setup and revocation. The approved buyer signs each collection; RPC or TypeScript alone cannot schedule a token transfer without that signature. The checked-in buyer runner can run once or as a periodic service. It derives collection instructions locally from the onchain permission, pays network fees from the buyer's wallet, and transfers into that buyer's own ATA.

See [mainnet recurring payments](kite-guard-protocol.md) for operational configuration, APIs, restart behavior and revocation. No buyer key was supplied or provisioned by this change, and no real collection was executed during implementation. Automated stock purchasing/delivery after collection is the buyer service's responsibility and is not claimed as implemented by this payment integration.

## Retired implementation

The custom `packages/anchor` prototype, its instruction builders, tests and root build commands have been removed. Git history preserves them for rollback. They are not dependencies of any mainnet path.

Paper trading remains a clearly labeled device-local simulation using observed prices. It does not call these execution APIs or create token delegations.
