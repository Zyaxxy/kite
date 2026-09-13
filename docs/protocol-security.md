# Mainnet transaction integration review

Updated 13 September 2026. Scope: composed basket purchases and the official Solana Subscriptions integration. This is an implementation review, not an independent audit. The old custom Anchor prototype and its tests were removed; historical evidence for it remains in git history and is not evidence for this integration.

## Basket controls

- Full issuer catalog and non-halted, verified basket components are required. Token decimals come from initialized mainnet mint accounts, never ticker guesses.
- Integer allocations preserve the total budget. A retained input-token component still requires the full reviewed funding balance.
- Jupiter `/build` responses must match input/output mints, integer allocations, ExactIn mode and slippage. Nonzero platform fees and unrecognized extra instructions are rejected.
- Swap instructions target the known Jupiter swap program. Setup is limited to idempotent wallet-owned ATAs and bounded SOL wrapping into the user's own wrapped-SOL ATA. Cleanup returns wrapped SOL to that same wallet. Arbitrary delegates, token transfers and extra signers are rejected.
- Address lookup tables are resolved through mainnet RPC. A single explicit compute/priority budget is applied. V0 byte/account limits and V1 byte/account/native-config limits are enforced; there is no partial basket fallback.
- Exact assembled transactions must pass simulation. Destination token balances must increase by at least every quoted minimum, and the token funding debit cannot exceed the allocation. Live chain changes after simulation can still make a transaction fail.

## Authorization and broadcast

The server HMAC binds the exact message, taker, expiration and last valid block height. Execution verifies the original message digest and the payer's Ed25519 signature. The mainnet genesis is checked before submission. V1 additionally requires a live activated feature account and explicitly advertised wallet capabilities. Neither a future rollout date nor a successful unit test bypasses these conditions.

The server has no owner signing key. Preparation endpoints can return unsigned transactions to callers, but those callers cannot submit them for another wallet without that wallet's signature. Execution errors after a broadcast attempt are Unknown until a reliable onchain outcome is observed. Browser/native pending intent persists before submission. The web client derives the explorer signature before dispatch so a lost HTTP response does not hide its transaction ID.

The existing origin policy, streamed request-body limits and per-process request throttling cover the new endpoints. Public deployments still need gateway-level distributed quotas and reliable RPC capacity. The API tunnel exposes only the explicitly listed new routes.

## Recurring permission controls and limits

Kite uses the existing mainnet program `De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44`. Creation checks mint/program identity, the owner account, existing delegate and Subscription Authority identity. It refuses unrelated delegates and refuses to restore disabled authorities implicitly. Grants are finite, with one-year maximum duration in this interface. Revoke requires the owner; collection requires the grant's buyer. Both use the live official record and pass simulation.

The shared authority has an SPL delegate allowance. Per-buyer constraints live in the official program's recurring records. A permission does **not** enforce stock delivery, a minimum stock output, recipient identity or best execution. The buyer can collect within its allowance, and the UI requires explicit consent to this trust relationship. Multiple permissions have additive caps. The provided collector uses only the buyer's own destination ATA.

Native SOL and transfer-hook tokens are refused by this integration. Supported Token-2022 transfers retain program checks; transfer fees can reduce receipts. The upstream program remains a dependency with its own upgrade and security assumptions. No claim is made that installing its TypeScript SDK removes smart-contract risk.

The buyer runner constructs instructions locally from mainnet state, uses a separately configured buyer key, verifies genesis and identity, simulates, and durably records its signed intent before sending. Exclusive local locks and period records prevent deliberate duplicate collections by that instance. Unknown outcomes stop the runner. Operators must use persistent state and must not start multiple collectors with independent state for the same grant.

## Evidence and remaining verification

Focused SDK tests exercise V0/V1 capacity, signer constraints, signing/explorer identity, official recurring instruction construction, bounded terms, expiry and non-accumulating periods. Server tests exercise HMAC/signature/message/expiry checks and live-feature gating failures. These tests use ephemeral transaction fixtures and never submit them.

A read-only Jupiter probe returned a real AAPLx `/build` route. Program executable/feature-account observations and compilation are not evidence of a completed wallet purchase. No user funds were spent, no owner or buyer signature was collected, and no keeper was activated during implementation. Connected-wallet execution, each intended issuer/token extension, mobile app switching and the actual V1 activation must be checked in the deployment before claiming those combinations have been exercised.

Sources: [Jupiter build API](https://developers.jup.ag/docs/swap/build), [Solana V1 rollout](https://solana.com/upgrades/larger-transaction-sizes), [Solana recurring delegation](https://solana.com/docs/payments/subscriptions/recurring-delegation).

A live MAG7 encoding probe required 98 accounts with the observed Jupiter routes and was rejected by the 64-account ceiling. V1 increases byte capacity, not this account ceiling. Route availability and composition can change; this implementation does not claim every theme fits a single transaction.
