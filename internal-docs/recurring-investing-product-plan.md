# Recurring investing and product improvement plan

Planning date: 13 September 2026. This is the product roadmap and acceptance criteria, not funded execution evidence. Implementation of the V1, scheduling, executor and interface milestones is now described in [recurring investing operations](recurring-investing-operations.md); the broader performance, accessibility and release targets below remain evidence-dependent.

## Product and transaction decisions

Support one-time and user-scheduled recurring purchases of baskets and individual tokenized stocks. Users choose daily, weekly or monthly, including intervals such as every two weeks or every three months. A single stock uses the same allocation engine with one mint at 10,000 basis points. Funding comes from a supported token the investor already holds; unsupported token extensions must be detected explicitly. An amount denominated in the funding token is distinct from a fixed USD budget and must be labeled accordingly.

Honor the requested V1-only policy for newly built transactions. Reject unsupported network/wallet combinations with a useful explanation instead of silently falling back. Retain legacy/V0 decoding for historical receipts and reconciliation of existing pending transactions.

The official activation target is epoch 1035, September 15 at approximately 01:20 UTC. Treat this as a schedule, not evidence of activation. Check the live feature gate before enabling submission. Wallet capability is a separate prerequisite. [Official activation notice](https://solana.com/upgrades/larger-transaction-sizes).

V1 allows 4,096 bytes, uses inline addresses without ALTs, and still limits a transaction to 64 accounts. It therefore does not guarantee all catalog baskets can execute. The earlier 98-account route requires different routing, not merely a new serializer. Keep fresh simulation, size/account/compute checks, liquidity checks and issuer status checks. [V1 specification](https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0385-transaction-v1.md).

## Proposed no-custom-program MVP

Solana Subscriptions provides an expiring, revocable recurring spending permission with a per-period cap. It does not schedule execution or enforce investment composition. Use its TypeScript SDK for setup and collection, and operate a durable executor service. [Recurring delegation](https://solana.com/docs/payments/subscriptions/recurring-delegation).

1. User chooses basket or stock, funding token, amount, cadence, interval, UTC start time and installment count. Show total possible funding exposure, fees, destination wallet and operator trust disclosure. Calendar months retain the original day with month-end clamping; fixed onchain periods and any extra authorized collection capacity must be shown separately.
2. Save an authenticated, versioned plan: owner, delegation, funding mint, integer amount, output mints and weights, cadence, start/expiry, slippage and price-impact policy. Freeze composition per plan; do not silently alter existing plans when a curated basket changes.
3. User approves the onchain permission once. Store no owner private key. Subsequent runs use the executor's delegate signing authority and a separately budgeted fee payer if needed.
4. At the due period, the executor verifies the grant and current balances, quotes every output, and builds one atomic transaction: account setup → permitted collection into executor-controlled funding account → all swaps with outputs addressed to the investor's token accounts → any explicit residual return/cleanup.
5. Verify every output destination's owner and mint; reject unexpected authorities, instructions or unrelated spends. Use exact integer allocations and minimum outputs. Simulate the complete transaction, including previously nonexistent accounts, before signing. Never submit collection separately from the swaps.
6. On failure, the composed transaction rolls back collection and swaps together; the transaction fee can still be charged. On success, reconcile balances and persist the investment receipt.

Jupiter's build endpoint supplies composable instructions and a destination token account option. This makes the design plausible, but combining delegated collection with unfunded-before-collection swap inputs needs an integration proof. Do not describe the composition as verified until it passes representative simulations and owner-controlled funded testing. [Jupiter build API](https://developers.jup.ag/docs/api-reference/swap/build).

### Trust boundary

Atomicity protects the transaction we construct; it does not constrain what a compromised authorized executor could construct instead. A normal delegate could collect an allowance without including swaps. Backend validation, an isolated signer and spending limits reduce operational risk but do not make this cryptographically trustless.

No new Kite program or prefunded investor vault is required for this explicitly trusted-executor MVP. Existing onchain programs and transient executor token accounts are still involved.

For enforced investment delivery, evaluate a minimal execution guard: the Subscriptions delegatee is a guard-controlled PDA; the guard alone can authorize collection and validates the immutable plan, output owners/mints, permitted routes and output minimums. This requires new or suitable existing onchain enforcement, CPI compatibility validation and independent review. Anchor is an optional implementation framework, not the source of the security guarantee. Do not restore the old vault architecture simply to add a guard.

## Independently reviewable implementation milestones

| Commit scope                     | Deliverable                                                                                                                            | Acceptance gate                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1. V1 capability layer           | Shared Kit builder, explicit resource configuration, fee validation, runtime feature check and actual signing-method capability checks | V1 build/decode/read tests; unsupported Privy/MWA paths fail clearly; no V0 transaction creation fallback                 |
| 2. Plan model                    | Shared SDK types and integer allocation rules for stocks and baskets; authenticated persistence                                        | Decimal, rounding, ownership, frozen composition and period-boundary tests                                                |
| 3. Atomic recurring builder      | Collection plus one-stock swap, then basket swaps, to owner destinations                                                               | Successful simulation; forced failed leg reverts collection; reject wrong recipient, excess spending and excess resources |
| 4. Durable executor              | Due-job queue, signer isolation, per-delegation/period lock, persisted intent before broadcast                                         | Crash/restart, concurrent workers and ambiguous confirmation cannot cause uncontrolled repeat execution                   |
| 5. Plan lifecycle                | Setup, schedule status, receipts, expiry and confirmed onchain revocation                                                              | User sees next run, actual delivery and actionable failure state; insufficient funds do not cause catch-up bursts         |
| 6. Focused web/mobile UX         | Shared form and state, daily default, basket context through login                                                                     | Complete setup on phone without entering a buyer address; operator identity and trust remain disclosed                    |
| 7. Performance and accessibility | Small initial payloads, critical data first, keyboard/contrast fixes                                                                   | Measured budgets and task completion criteria below                                                                       |
| 8. Release verification          | Provider compatibility, funded owner-controlled tests and operating worker evidence                                                    | Demonstrate a recurring single stock and a supported basket; revoke and verify no subsequent collection                   |

Skipping a scheduler job is not security revocation. Pause must clearly distinguish a service pause from removal of onchain spending authority. For an unambiguous first release, use confirmed revocation to stop authorization; resuming requires a new approval. Define daily as an explicit 24-hour period with a displayed timezone/start; do not accidentally imply calendar-day/DST semantics.

Persist transaction identity before broadcast. Retry the same signed transaction while valid; reconcile uncertain outcomes before creating another. Subscriptions caps cumulative period spending, but a durable execution ledger is also needed to honor one scheduled purchase per plan. Define retry windows and skip missed periods by default; never accumulate surprise catch-up purchases.

## Raising product quality

These are target scores earned by observed results, not automatic score increases from shipping code.

| Dimension                | Current → target | Implementation and evidence required                                                                                                                                     |
| ------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Onboarding               | 6 → 8            | Basket-focused landing CTA; preserve intent through login; first-time users can reach an understandable review in under 60 seconds, excluding wallet setup               |
| Core experience          | 4 → 8            | Verify single-stock and multi-stock recurring delivery, clear budgets and termination; measure successful eligible runs and investigate every failure                    |
| Error handling           | 6 → 8            | Automatic pending reconciliation, preserved form inputs, quote refresh and specific balance/route/wallet messages; exercise rejection, expiry and network interruption   |
| Information architecture | 6 → 8            | Home emphasizes buying a basket and creating a recurring plan; setup precedes empty state on phones; receipts and upcoming runs are directly accessible                  |
| Visual polish            | 8 → 9            | Preserve current design system; precise asset labels, concise action text and consistent amounts, loading, success and failure states                                    |
| Performance              | 6 → 8            | Target mobile p75 LCP ≤2.5 seconds, INP ≤200 ms and CLS ≤0.1; cache-hit research API p95 <300 ms; measure quote readiness separately from research                       |
| Accessibility            | 6 → 8            | Verify WCAG AA contrast for the core journeys, visible focus, named controls, modal focus return, screen-reader status announcements, 200% zoom and reduced motion       |
| Feature completeness     | 4 → 8            | Operating scheduler, actual receipts, funded execution evidence, owner revocation and tested supported mobile wallets; unsupported platforms get a clear compatible path |

Proposed target average: 8.1/10. Instrument completion, abandonment, quote failures, schedule failures and confirmation latency without collecting wallet secrets. Do not invent analytics results or market prices.

Before the submission, prioritize milestones 1–6 and the verification required for any demonstrated claims. Treat broad basket coverage, wallet V1 support and guarded trustless settlement as evidence-dependent rather than assuming the activation date resolves them.
