# Implementation plan: capability-aware dual-route execution

Source: `origin/Dev` at `fae6813`. Work branch: `codex/plan-dual-route-upgrade`.

## Corrections before implementation

The goal is to use a single inline-account V1 transaction wherever it actually fits, and use Jito only when the complete order requires multiple transactions. The V1 path has no ALT dependency. V0 remains a compatibility path for wallets that do not support V1.

1. **Accounts and bytes both matter.** At most 64 accounts does not guarantee a transaction fits: instruction data, signatures, and configuration also consume bytes. Count all runtime accounts and compile the complete transaction. V1 is bounded to 4,096 serialized bytes; V0 to 1,232. Include fees, setup instructions, and any final tip in capacity checks.
2. **Select from actual routes, never asset counts.** Try one complete transaction without a Jito tip. Partition only a capacity failure into the smallest viable ordered bundle of two to five transactions. Do not turn validation, provider, slippage, or simulation failures into a different route. Ten assets do not inherently require four or five chunks.
3. **Capability is observed, not assigned.** Read `solana:signTransaction` or MWA signing capabilities for the selected wallet. The installed Privy React SDK 3.42.0 advertises legacy/V0; blindly changing it to `[0,1]` would be incorrect. Reflect the wallet's actual capability, including V1 if a compatible implementation advertises it later. Preserve V0 support.
4. **Cluster activation and infrastructure support are different.** A read-only check on 30 September 2026 confirmed mainnet genesis and the V1 feature activation at slot 447120000 (observed slot 451972127). Continue verifying activation per operation; this observation is not a deployment guarantee. Jito's documented API accepts base64 bundles of up to five transactions, but funded V1 submission has not been verified here.
5. **Use sufficient transport/storage limits.** Five 4,096-byte transactions require 27,320 base64 characters before authorization and JSON overhead. The proposed 25 KB request cap is too small. Apply an appropriately bounded bundle-specific cap to routes, middleware, tunnel, SDK and pending storage; do not raise unrelated API limits.
6. **Retain honest execution guarantees.** One transaction is atomic for its instructions, while fees may remain on failure. Jito skipped-block rebroadcast may produce partial bundle execution. Retain exact-message authorization, persisted signed-payload recovery and same-slot receipt checks. Do not claim one wallet modal for every provider.
7. **Show execution method only when known.** A basket's route depends on its current swap instructions, funding token, and wallet capabilities. Cards may explain that a single transaction or Jito bundle is selected during review; the reviewed order displays the actual route and tip.
8. **Preserve real data and network boundaries.** Mainnet spot trading stays separate from devnet recurring test tokens. New baskets are allocation definitions with live constituent availability checks. Portfolio caching is wallet/network scoped, short-lived, and visibly stale while refreshing; it never authorizes spending or invents prices/cost basis.

## Implementation

### Shared SDK

- [x] Add typed capacity errors and account counting, and remove asset-count routing heuristics.
- [x] Add V1 inline-account chunk composition with explicit compute/data/priority-fee configuration and no ALT reads.
- [x] Support single-first V0 compatibility composition with verified tables, and two-to-five transaction bundles for either version.
- [x] Expand private/creator basket bounds to 2–12 while preserving exact allocation and auto-balance behavior.
- [x] Validate bundle versions, serialized byte counts, account constraints, exact amount conservation, and complete ordered outputs.

### Server and transport

- [x] Negotiate observed wallet versions and verify mainnet genesis/V1 feature activation before preparing and broadcasting V1.
- [x] Attempt a single transaction first; use the smallest fitting partition on capacity failure only.
- [x] Skip ALT retrieval entirely on V1, preserve verified Jupiter-referenced tables for V0.
- [x] Bind version, ordered message hashes, signer, expiry, complete allocations and receipt attribution in bundle authorization.
- [x] Validate two-to-five signatures using the version-aware decoder. Check V0 runtime accounts including lookup indexes.
- [x] Preserve settlement simulations, total debit/fee/tip bounds, recovery status, and no individual fallback broadcasts.
- [x] Increase bundle-only body/recovery limits consistently; keep privileged collector routes outside development tunnels.

### Wallets and mobile

- [x] Derive Privy signing capability from its actual Wallet Standard feature instead of hard-coded support.
- [x] Sign all reviewed bundle transactions in one batch when the provider supports it; never use web3.js v1.x deserialization for a V1 transaction.
- [x] Preserve network/account/expiry guards around prompts and persist exact signed payloads before submission.
- [x] Pass the returned transaction version through Android MWA and support up to five mainnet bundle transactions.
- [x] Render actual reviewed route/version, zero single-route Jito tip, selected bundle tip and execution caveat on both clients.

### Product and design

- [x] Restore the previous landing-page layout with broader copy covering baskets, spot investing, research, portfolio and paper practice; distinguish devnet recurring accurately.
- [x] Retain the compact moving basket showcase, no pause button, no mainnet ticker and no emoji.
- [x] Add useful thematic baskets from real canonical issuer listings, with missing/unsupported/unpriced assets unavailable.
- [x] Improve the portfolio layout using relevant 21st.dev design references and Kite's forest/cream/lime system.
- [x] Add short-lived wallet-specific browser caching with immediate cached render, background refresh, clear timestamps/errors and reset on wallet change.
- [x] Preserve unknown imported cost basis; do not fabricate returns or performance charts.

## Verification

Use Node.js 24.12.0 and pnpm 10.31.0. Keep new tests in TypeScript/node:test; do not add `.mjs` tests or unrelated dependencies.

- [x] SDK build; web/mobile type checks.
- [x] Regression suites plus new tests for V1/V0 single/bundle routing, byte/account limits, final-tip capacity, rejected extra signers, and no-ALT V1 behavior.
- [x] Capability negotiation, signed-message/version/order tampering, two-to-five transaction payload limits, unknown-result recovery and caller wallet changes.
- [x] Portfolio cache isolation, expiry, corrupt storage, unavailable prices and post-trade refresh.
- [x] Production web build, Expo exports and desktop/phone-width browser flows.
- [x] Scan exported clients and staged changes for configured secrets.
- [x] Commit coherent changes on the feature branch and open a PR targeting Dev. Do not merge main/Dev, deploy contracts, fund wallets, or submit real trades as incidental tests.

## Evidence and rollout boundaries

- [Solana V1 activation, limits, wallet support and configuration](https://solana.com/upgrades/larger-transaction-sizes)
- [Jito bundles, tips, receipts and skipped-block limitations](https://docs.jito.wtf/lowlatencytxnsend/)
- [Privy transaction signing](https://docs.privy.io/wallets/using-wallets/solana/sign-a-transaction)
- Installed Privy `solana.mjs` and `useWallets-*.mjs` advertise `supportedTransactionVersions: ["legacy", 0]`.

Funded Jito V1 execution and physical Android signing remain unverified. Existing deployment and dependency-audit limitations remain tracked in the current documentation.

## Completed verification — 30 September 2026

- Source fetched from `origin/Dev` (`fae6813`); `origin/main` did not contain this plan. Work is on `codex/plan-dual-route-upgrade`, with [PR #11 targeting Dev](https://github.com/Zyaxxy/kite/pull/11). Nothing was merged or deployed.
- **364 tests passed under Node.js 24.12.0:** 164 legacy SDK, 69 legacy web, 115 TypeScript upgrade, 8 mobile configuration and 8 root/tunnel tests. Transaction, provider and wallet tests use deterministic fixtures; these totals do not establish funded execution.
- SDK compilation, web/mobile type checks, the Next.js production build, and Expo web/Android/iOS exports passed with the pinned dependencies. Next.js retains an upstream Privy/viem dynamic-import warning. The host default Node 26 was not used for the final verification; the exact Node 24.12.0 runtime and pnpm 10.31.0 were checked separately. A root `.nvmrc` now records the required runtime. No unrelated project dependencies were upgraded.
- **267 exported client artifacts** and the full branch diff were checked against **11 configured server-only values**, with no literal secret values found. This check is not a comprehensive dependency or infrastructure audit.
- Desktop and 390px browser checks covered the landing, moving basket showcase, baskets, builder validation, and paper/disconnected-wallet portfolios with no horizontal overflow. Existing browser data was preserved; no wallet was connected or funded.
- Expo web rendered Explore, Subscriptions, Portfolio and Activity without a white screen. The export had no `EXPO_PUBLIC_API_BASE_URL`, so it displayed the configuration limitation. A real device/API connection and native signing were not verified. The local tunnel test checked payload capacity and privileged-route exclusion using loopback fixtures only.
- A read-only request to the rebuilt market API returned current basket definitions with observed data and `partial` status; unavailable upstream data remains explicit.
- Browser verification caught cached allocation drift. Redis, disk and shared client hydration now resolve current SDK definitions while retaining price observations, timestamps and warnings. This also keeps paper targets and server order allocations consistent after release updates.
- Existing devnet instruments and mint provisioning were preserved. Themes missing test constituents remain unavailable; a new oversized legacy Guard fixture rejects at the 64-account boundary. No Guard deployment or incidental faucet request was performed.
- Wallet portfolio cache is display-only, scoped to wallet/mainnet/schema, expires after five minutes, and shows age/staleness during refresh. Explicit post-trade refresh starts a new request; cached holdings cannot authorize spending. Imported cost basis remains unknown.

Implementation commits separate the SDK, server/transport, web/Android signing, product design, final alignment polish, and documentation. Reverts must respect their SDK dependencies. The key plan corrections are observed wallet capabilities rather than forced Privy V1, byte and account checks rather than asset-count rules, and 32 KiB bundle transport rather than the insufficient proposed 25 KB cap.

Design hierarchy references: [21st.dev Financial Bento Grid](https://21st.dev/@uiable/components/block-bento-5) and [Wallet Card 2](https://21st.dev/@beratberkayg/components/wallet-card-2). Components were implemented locally in Kite's existing theme with no copied sample balances or extra packages.
