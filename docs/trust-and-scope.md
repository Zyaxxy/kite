# Trust, safety, and current scope

## Custody and signing

Kite does not take custody of user funds or store user private keys. Actual trades are signed by the user's wallet. Server authorization binds a quote to the wallet, exact transaction message, expiry, and request details before broadcast. Signed transaction bytes are not persisted by the client.

## Data quality

Kite distinguishes issuer-listed identity, token market price, and underlying reference price. It displays source, timing, and coverage where available. Missing quotes, unavailable research, stale observations, and provider outages remain explicit. Paper mode uses only a recent positive observed price and never fabricates historical fills.

## Transaction boundaries

Actual orders are subject to issuer status, token-program compatibility, mint precision, route liquidity, slippage, simulation, wallet capabilities, Solana activation, transaction size, account limits, fees, and confirmation uncertainty. A successful simulation is not a promise of a future fill. Unknown post-submission outcomes require the user to check wallet activity before retrying.

## Recurring-plan boundary

Recurring investing uses finite, bounded permissions through the official Solana Subscriptions program. The investment service is buyer-controlled and trusted to compose the approved collection with stock delivery. The permission itself cannot guarantee stock delivery or best execution. Users should review the terms, understand the buyer address, and revoke permissions they no longer want active.

## Current product scope

- Paper accounts and history are device-local; they do not sync between web and mobile.
- Paper returns exclude real fees, slippage, liquidity effects, and corporate-action effects.
- Actual basket execution is conditional on all legs fitting current routing and transaction constraints.
- Some issuer products may be paused, reference-only, unpriced, or unavailable in a user's jurisdiction.
- Native Android wallet signing uses Solana Mobile Wallet Adapter; unsupported signing methods do not bypass V1 requirements.
- The recurring worker, persistent storage, executor funding, and funded end-to-end production verification must be configured by the operator before enabling unattended schedules.

Kite's documentation describes product behavior, not an offer, recommendation, or guarantee of investment performance.
