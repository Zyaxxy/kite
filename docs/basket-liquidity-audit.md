# Basket liquidity and atomic composition audit

Reviewed **16 September 2026** using mainnet reads and unsigned Jupiter Swap V2 builds. No swaps were signed or submitted. No tokens were minted, wallets funded, programs deployed, or RFQs accepted.

## Published catalog

The mainnet catalog now offers four explicit, equal-weight definitions:

| Basket | ID | Constituents |
|---|---|---|
| Digital Leaders — SOL-DIGITAL | `sol-digital-leaders` | AAPL, MSFT, NVDA |
| AI Platforms — SOL-AI3 | `sol-ai-focused` | NVDA, GOOGL, AMZN |
| Everyday Essentials — SOL-LIFE3 | `sol-everyday-focused` | AAPL, AMZN, KO |
| A Wider Lens — SOL-CORE | `sol-core` | SPY, QQQ, GLD |

The smaller baskets have **new IDs and names**. MAG7 was not silently converted into three stocks. The SDK retains the original twelve definitions for devnet plans and existing paper-plan allocations. Existing paper plans resolve their original basket against current observed prices; a missing or unpriced member still blocks the entire paper installment. Mainnet order preparation resolves only the published, reviewed definitions.

## Method and evidence

For each original basket, the script allocates **100 and 1,000 USDC** across its constituents using the production largest-remainder allocator. Each exact allocation requests an unsigned buy build, then an unsigned reverse build for that buy's quoted output. The acceptance threshold is at most **200 bps (2%) quoted roundtrip loss**, measured in exact raw USDC units. This is a conservative screening rule, not a return forecast or a guarantee about realized fills. A missing quote is not a price of zero.

Requests use **100 bps slippage** and **32 maximum accounts per route**, matching current order construction. The script checks mainnet genesis and SPL mint owners through read-only RPC, derives the public fixture owner's ATAs, deduplicates setup instructions, and composes an **unsigned V1 message with no ALTs**. Composition must fit **64 accounts and 4,096 bytes**. The final retained-basket pass also runs the production Jupiter instruction decoder against the quoted input, minimum output, signer, source, destination, and token programs. See [Jupiter's build API](https://developers.jup.ag/docs/api-reference/swap/v2/build).

Evidence files:

- [All original basket probes](audits/basket-liquidity-2026-09-16.json): input amounts, exact mints, timestamps, AMM labels/addresses, outputs, quote errors and composition results.
- [Reviewed basket probes](audits/basket-liquidity-reviewed-2026-09-16.json): final instruction-validation and composition checks. Its Everyday Essentials samples encountered provider quota errors.
- [Targeted Everyday Essentials retry](audits/basket-liquidity-retry-2026-09-16.json): repeats only the affected basket after the shared provider quota cleared.
- [Explicit candidate definitions](audits/basket-candidates-2026-09-16.json): the exact selections used for the reviewed pass.

Provider errors are retained in the reports. HTTP 429/timeouts are **inconclusive**, not evidence that a token has no pool. They never justify substituting a fabricated price or silently skipping a leg.

## Why the original proposal changed

| Original basket | Observed reason to remove the original from new mainnet orders |
|---|---|
| SOL-MAG7 | All seven legs quoted both ways, but combined messages exceeded 64 accounts at both sample sizes. Liquid legs alone do not prove atomic executability. |
| SOL-AI | ORCL quoted roundtrip loss about 2.08–2.97%; replaced with an explicitly named three-stock allocation. |
| SOL-CHIPS | TSM and ASML had routes but excessive quoted roundtrip loss; AMD/AVGO also exceeded the threshold at the larger size. The proposal's “no pools” explanation was not supported. |
| SOL-CLOUD | CRM/NOW builds unavailable; ORCL exceeded the screening threshold. |
| SOL-LIFE | SBUX failed to produce a build at the larger size. AAPL/AMZN/KO were retained in a smaller allocation. MCD and KO were not assumed to have zero liquidity. |
| SOL-HEALTH | JNJ/ABBV/MRK builds unavailable; LLY and larger UNH probe exceeded the threshold. |
| SOL-FIN | MA builds unavailable; JPM/GS/V quotes exceeded the threshold. |
| SOL-DEF | LMT/RTX/NOC builds unavailable for the issuer mints tested. |
| SOL-ENERGY | COP builds unavailable; larger XOM/CVX probes exceeded the threshold. |
| SOL-BUILD | CAT/DE/GE/HON builds unavailable. |
| SOL-CORE | Both sizes passed; retained unchanged. |
| SOL-PRE | FIGUREAI quoted roundtrip loss about 4.69–4.91%; the dynamic full-catalog basket was removed from new mainnet orders. Individual listings remain visible. |

These statements describe the tested issuer mints and request sizes at their recorded timestamps. “Build unavailable” is not a claim that a security never has liquidity on any venue.

## Reproduce without a trade

Use the repository's pinned pnpm version and the server environment. The API key is read from `JUPITER_API_KEY`; it is never printed or written to a report. The script accepts only read-only RPC methods and public GET/build requests.

```sh
pnpm build:sdk
node --env-file=apps/web/.env scripts/audit-basket-liquidity.cjs

KITE_LIQUIDITY_AUDIT_SELECTION=docs/audits/basket-candidates-2026-09-16.json \
KITE_LIQUIDITY_AUDIT_OUTPUT=docs/audits/basket-liquidity-reviewed-2026-09-16.json \
node --env-file=apps/web/.env scripts/audit-basket-liquidity.cjs

# Retry an inconclusive basket only:
KITE_LIQUIDITY_AUDIT_IDS=sol-everyday-focused \
KITE_LIQUIDITY_AUDIT_SELECTION=docs/audits/basket-candidates-2026-09-16.json \
KITE_LIQUIDITY_AUDIT_OUTPUT=docs/audits/basket-liquidity-retry-2026-09-16.json \
node --env-file=apps/web/.env scripts/audit-basket-liquidity.cjs
```

The audit uses a public fixture address, no private key and no actual funds. It does **not** establish funded simulation success, transaction inclusion, V1 activation on the deployment's cluster, or the user's wallet support. The live order builder must still verify those prerequisites, resolve mint precision/extensions, get fresh routes, validate every instruction, simulate the whole transaction and confirm all outputs settle to the owner's ATAs. Any failed leg aborts the complete order. Allocated raw input sums to the full input amount; this is an allocation invariant, not a promise that provider fees are zero.

## Regression coverage

`basket-liquidity.test.cjs` tests exact raw-unit threshold boundaries, invalid/missing outputs, the reviewed definitions, unchanged canonical allocations, and failure instead of partial baskets or issuer substitution. `paper.test.cjs` verifies old seven-stock paper plans still execute all seven original constituents. Market-cache tests ensure refreshes keep the reviewed catalog. Existing Jupiter instruction, V1 limits, settlement, slippage, and input-debit tests remain applicable.
