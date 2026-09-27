# Mainnet basket execution

New spot swaps and basket purchases use Solana v0 transactions. The existing V1 encoder remains available for compatibility with previously reviewed transactions; new spot orders do not require V1 activation. Mainnet RPC configuration comes only from `SOLANA_RPC_URL`, and preparation, execution and receipt checks independently verify the mainnet genesis hash. Devnet recurring endpoints use their separate connection utility and never submit to Jito.

## Transaction selection

- Up to three assets: one transaction, submitted with normal RPC preflight. If the complete order cannot fit, the quote fails; it does not split the purchase.
- Four assets: try one transaction, then the bundle path if it cannot fit.
- More than four assets: two or three transactions submitted together to Jito.
- Every transaction must fit both 1,232 serialized bytes and 64 runtime accounts. Address lookup tables compress bytes but do not raise the account limit. Custom basket requests support two to eight assets; actual capacity depends on the live routes.

Jupiter Swap V2 builds each leg for its exact integer funding allocation. The server validates route amounts, slippage, minimum output, signer, input account, destination ATA and setup instructions. Routes cannot add token approvals or redirect settlement. Published creator basket IDs resolve to immutable server allocations; client overrides are rejected.

Each chunk contains complete swap legs, including idempotent ATA setup, so it does not depend on outputs from a previous chunk. Only Jupiter-provided lookup-table addresses are loaded. Their actual mainnet owner, active state and address contents are verified before compilation. Chunk selection searches valid contiguous partitions rather than splitting an already serialized transaction.

Every chunk is simulated before review. The simulation checks each recipient ATA's minimum output, exact SPL funding debit, and the aggregate SOL budget for fees, rent and tip. These independent preflights are not a stateful simulation of all chunks; shared pool state may change between legs. Jito also evaluates the signed bundle before attempting inclusion. A fresh quote can still fail to land or expire.

## Tip and wallet approval

The server reads official tip accounts with `getTipAccounts`, verifies them against the published set, and reads Jito's observed tip floor. The policy uses the 50th-percentile EMA, falling back to a 10,000-lamport bid if the floor feed is unavailable. This fallback is a fee policy, not fabricated market data.

`JITO_MAX_TIP_LAMPORTS` optionally caps the bid; default and absolute maximum are 100,000 lamports. The minimum is 1,000. A high floor is capped rather than increasing the user's authorization. The final chunk contains the tip after its swaps. There is no standalone tip transaction, and the tip account must remain a static account outside ALTs. Review surfaces the selected tip and the number of transactions before the wallet signs.

`JITO_AUTH_UUID` is optional server-only authentication. Requests use the fixed official mainnet Block Engine host, never a client-supplied URL. Default public service quotas still apply.

## Submission and recovery

1. `POST /api/buy-basket` returns either an ordinary `BasketOrder` or `BasketBundleOrder` with `kind: "bundle"`.
2. The wallet signs all bundle messages in their reviewed order. The HMAC authorization binds every message hash, wallet, expiry, blockhash lifetime and server-resolved basket receipt metadata.
3. `POST /api/bundles/execute` verifies every owner signature and submits one `sendBundle` request. A bundle ID means **received**, not purchased. Its immediate result is `Pending`.
4. `POST /api/bundles/status` checks all signatures against mainnet. Only all successful, confirmed/finalized signatures in the same slot produce `Success`. Mixed, failed, expired or missing receipts remain unresolved where replay cannot be ruled out.
5. If the submission response is lost, the client performs only a read-only recovery request with the original quote authorization and signed transactions. Recovery remains available for 24 hours after quote expiry. Execution still rejects expired quotes. Save this recovery material before submitting, and preserve unresolved receipts across navigation.

The SDK methods are `executeBundle`, `getBundleStatus` and `recoverBundle`. There is no individual-transaction broadcast fallback after a bundle attempt. Creator volume uses exact server-authorized USDC input units and is recorded only after confirmation, with signature-based deduplication.

## Atomicity boundary

Jito processes a bundle together within its produced block. However, Jito documents that transactions from skipped/uncled blocks can be rebroadcast independently and land outside the original bundle. This implementation has per-leg spending and output limits, but no mainnet cross-transaction guard program. It therefore cannot promise unconditional all-or-nothing execution across reorg/rebroadcast scenarios. Both clients must display this caveat and require receipt reconciliation before a replacement purchase.

## Verification

TypeScript `node:test` tests cover two/three-chunk selection, both account and byte limits, tip placement/caps, ALT verification, message/amount/order/signature binding, read-only recovery, cluster rejection and incomplete/mixed receipt handling. Existing single-swap settlement tests cover source debit and minimum output checks. These tests use deterministic fixtures and do not spend funds. Live funded execution is a separate deployment verification step.

References: [Jito low-latency transaction API, tips and skipped-block guidance](https://docs.jito.wtf/lowlatencytxnsend/), [Jupiter Swap V2 build instructions and lookup tables](https://developers.jup.ag/docs/swap/build).
