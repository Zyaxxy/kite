# Protocol security review — 13 September 2026

Scope: the Anchor prototype and new shared protocol helpers. This is an implementation review with recorded checks, not an independent audit, a deployment approval, or a legal-compliance statement. The program remains separate from the app's mainnet single-token Jupiter trading.

## Corrected findings

| Severity | Evidence in the prior source | Resolution |
| --- | --- | --- |
| Critical if deployed | `deposit_basket` accepted a numeric input, collected no input tokens, and minted the same number of receipt units. | Removed the synthetic receipt/deposit interface entirely. No basket token is minted by the replacement. |
| High if deployed | `redeem_basket` burned receipts without transferring any underlying asset. | Removed the redemption interface; current holdings are direct wallet assets. |
| High | `execute_sip` only incremented a counter and emitted a success log, despite never executing a transfer. | Replaced with an atomic, bounded counterparty settlement that checks token deltas. Failed transfers roll back both plan state and transfers. |
| High | The roadmap represented V1/4KB transactions as an available mainnet dependency and plain token allowance as compliant automated DCA. | Corrected the roadmap; v0/1232-byte assembly fails on capacity limits. Delegated settlement is an undeployed prototype, with no legal or best-execution guarantee. |
| Medium | The direct Rust dependency `solana-program >=1.18` resolved a second incompatible generation alongside Anchor's 1.18 types. | Removed the redundant dependency and use Anchor's re-export; pruned orphaned lockfile dependencies. |
| Medium | Anchor defaulted to devnet and a different developer's absolute wallet path. | Localnet default and a standard configurable wallet path; no mainnet program registration. |

## Replacement program controls

- **Authorization:** typed owner signer on creation/cancellation; typed executor signer on settlement. The program has no admin spending key.
- **Account identity:** canonical plan PDA binds the owner's public key and plan ID. All token accounts pin addresses, mints and owners. Typed SPL accounts reject foreign token programs. Buyer and executor must differ, and input and output mints must differ, preventing transfer-to-self aliasing.
- **Allowance:** checked `installment × max_cycles`, never unlimited. Creation refuses an existing delegate. Every execution rechecks live plan delegation and remaining allowance. Cancellation only revokes this plan's delegate, preserving an unrelated allowance the owner may have substituted.
- **Timing:** positive intervals of at least 60 seconds, fixed expiry, finite cycle cap. An overdue installment schedules the next one from its actual execution time; a crank cannot collect missed cycles in a burst. Timestamp and cycle arithmetic is checked.
- **Settlement:** the executor supplies at least the owner-signed minimum output. The exact input installment and minimum received output are checked against reloaded balances. Both legs and state updates are inside one transaction.
- **CPI authority:** PDA signatures are provided only to the fixed legacy SPL Token program. No arbitrary target programs, token hooks or remaining-account route forwarding exist.
- **Replay:** cancelled/completed plan IDs retain account state. A cancelled plan cannot be reinitialized through the same PDA. State rent is retained; there is no account-close path.
- **Price limits:** the owner signs a fixed minimum and expiry. No invented oracle value or executor-provided market-price claim is trusted. This is a limit-settlement primitive; its floor can become economically stale and is not best execution.

## SDK controls

`simulation.ts` refuses mismatched takers, missing required signers and unsupported transaction size. It observes the original blockhash and does not modify a sponsored transaction. A missing/erroring RPC yields `unavailable`, not success. A successful preflight can still be invalidated by later state changes.

`basket/atomic-swap.ts` uses exact integer allocation, enforces a single explicit compute budget, rejects additional signers and enforces v0 byte/account capacity before returning a transaction. It accepts trusted route instructions; it does not audit arbitrary instruction economics or assert that every seven-stock basket can fit.

The Pyth SSE helper validates feed IDs, endpoint transport, message size, timestamp ordering, staleness and confidence. It reports status `unknown` rather than pretending an update proves a market is open. Rebalance results are value-allocation proposals; they are not token quotes or fabricated performance history.

## Evidence

- TypeScript SDK compilation passed.
- Seven protocol SDK suites passed, including a 998-amount allocation conservation loop; capacity, signer and compute-budget rejection; finite allowance/overflow/discriminator checks; rebalance conservation; failed/unavailable preflight; SSE stale, unrequested, future, duplicate and wide-confidence ticks.
- `cargo test` with Rust 1.85.1 compiled the program and passed all five host tests (four schedule/allowance/overflow tests plus the program ID test). Existing Anchor 0.30 macro `unexpected_cfgs` warnings are toolchain diagnostics, not proof of a tested SBF artifact.
- SBF compilation passed with official platform-tools v1.57 (Rust 1.95), targeting `sbpf-solana-solana`. The build reported no stack-frame errors. The stripped local artifact is 241 KiB; SHA-256 `c34663b009a7ebc78dae09ad47577e47f483bfe9749fc6930b75a90f2e7ff80a`. No generated artifact or test key is committed.
- All five integration cases passed on an isolated Agave 2.1.21 local validator in 33.9 seconds. They exercised real legacy-SPL transfers, exact two-sided settlement, interval gating, underpayment, wrong recipient, counterparty insolvency rollback, unauthorized cancellation and direct SPL revocation. The suite refuses non-local hosts and additionally refuses the mainnet genesis hash. It uses local fixture mints and a separately generated temporary test wallet.
- The root agent separately reviewed signer, PDA, alias, amount, schedule and revocation controls without finding another concrete issue. This second code read is not an external security audit.

## Deployment gates still open

1. Forked-mainnet issuer-account and composed-route compatibility tests; host and local-validator evidence above does not establish compatibility with every issuer account or route.
2. Token-2022 extension review before adding those accounts. The current program deliberately rejects them; regular app swaps remain independent.
3. A reviewed live-pricing and Jupiter route adapter, real crank operations, monitoring and revocation UX before claiming actual automated SIPs.
4. Independent program review, adversarial/fuzz testing, and an explicit deployment/upgrade-authority policy before any mainnet activation.
5. Real wallet confirmation and app-switch lifecycle tests on supported mobile devices. No user's funds were spent during this review.

Official sources: [SPL Token delegation](https://solana.com/docs/tokens/basics/approve-delegate), [Solana transaction limits](https://solana.com/docs/core/transactions), [V1 activation and client support](https://solana.com/upgrades/larger-transaction-sizes). The upgrade page was checked on 13 September 2026 and listed V1 mainnet activation as pending, expected at epoch 1035 on 15 September.
