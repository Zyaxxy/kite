# Mainnet basket execution

New spot swaps and basket purchases negotiate Solana V1 or V0 from the selected wallet’s advertised signing capabilities and the configured mainnet RPC. V1 is preferred only after its feature account is verified active on that RPC. Otherwise a wallet advertising V0 uses the compatible V0 path. Privy embedded wallets currently advertise V0 only; wallet names do not establish V1 support. Mainnet RPC configuration comes only from `SOLANA_RPC_URL`, and preparation, execution and receipt checks independently verify the mainnet genesis hash. Devnet recurring endpoints use their separate connection utility and never submit to Jito.

## Transaction selection

- Every basket first attempts one complete transaction, with zero Jito tip and normal RPC preflight. Selection depends on serialized bytes and runtime accounts, not the number of assets.
- V1 inlines static accounts, uses no lookup tables, and must fit **4,096 serialized bytes and 64 runtime accounts**. Compute, loaded-account-data and priority-fee limits are explicit message configuration.
- V0 must fit **1,232 serialized bytes and 64 runtime accounts**, including all loaded lookup-table indexes. Verified Jupiter ALTs may compress bytes but never raise account capacity.
- Only a typed account/byte capacity failure can select a bundle. Eligible orders partition into **two to five** ordered transactions of the same negotiated version. Invalid instructions, unexpected signers and failed settlement simulation fail the order; they do not trigger a new route or partition.
- Custom basket requests support **two to twelve assets**. Neither that range nor V1 availability guarantees a live route will fit. Complete swap legs stay intact; an indivisible oversized leg or a basket requiring more than five transactions is rejected.

Jupiter Swap V2 builds each leg for its exact integer funding allocation. The server validates route amounts, slippage, minimum output, signer, input account, destination ATA and setup instructions. Routes cannot add token approvals or redirect settlement. Published creator basket IDs resolve to immutable server allocations; client overrides are rejected.

Each chunk contains complete swap legs, including idempotent ATA setup, so it does not depend on outputs from a previous chunk. On V0 only, Jupiter-referenced lookup-table addresses are loaded and their actual mainnet owner, active state and address contents are verified before compilation. V1 preparation never fetches or accepts ALTs. Chunk selection searches valid contiguous partitions rather than splitting an already serialized transaction.

Every chunk is simulated before review. The simulation checks each recipient ATA's minimum output, exact SPL funding debit, and the aggregate SOL budget for fees, rent and tip. These independent preflights are not a stateful simulation of all chunks; shared pool state may change between legs. Jito evaluates accepted signed bundles before attempting inclusion. Mainnet V1 feature activation alone does not establish the Block Engine’s V1 transport support. Funded V1 bundle submission has not been verified by these local checks, and a fresh quote can still be rejected, fail to land or expire.

## Tip and wallet approval

The server reads official tip accounts with `getTipAccounts`, verifies them against the published set, and reads Jito's observed tip floor. The policy uses the 50th-percentile EMA, falling back to a 10,000-lamport bid if the floor feed is unavailable. This fallback is a fee policy, not fabricated market data.

`JITO_MAX_TIP_LAMPORTS` optionally caps the bid; default and absolute maximum are 100,000 lamports. The minimum is 1,000. A high floor is capped rather than increasing the user's authorization. The final chunk contains the tip after its swaps. There is no standalone tip transaction, and the tip account must remain a static account outside ALTs. Review surfaces the selected version, execution route, tip and number of transactions before the wallet signs. Wallet-standard and Android MWA batch APIs receive the complete reviewed set in order. Privy may require sequential approvals; the product must not promise one prompt for every wallet.

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

TypeScript `node:test` tests cover single-first selection and up to five chunks, both account and byte limits, V1 without ALTs, V0 ALT verification, tip placement/caps, message/amount/order/signature/version binding, read-only recovery, cluster rejection and incomplete/mixed receipt handling. Existing single-swap settlement tests cover source debit and minimum output checks. These tests use deterministic fixtures and do not spend funds. Funded Jito V1 execution and physical Android wallet signing remain separate, unverified deployment checks. Mainnet spot tests do not establish devnet recurring readiness.

References: [Jito low-latency transaction API, tips and skipped-block guidance](https://docs.jito.wtf/lowlatencytxnsend/), [Jupiter Swap V2 build instructions and lookup tables](https://developers.jup.ag/docs/swap/build).
