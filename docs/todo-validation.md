# TODO implementation validation — 16 September 2026

The changes are on `codex/todo-release-readiness`, with upstream `6dc2d2e` merged after preserving the local theme/navigation work. The original pnpm 11 lockfile changes were backed up in a named stash; dependencies were restored using the repository's frozen pnpm 10.31.0 lockfile. No remote branch was pushed and no cloud or on-chain deployment was made.

## Completed work

- [Contract audit](devnet-contract-audit.md): public program/mint checks, execution blockers and owner-run commands. Rust execution logic was not changed.
- [Backpack integration](backpack-integration-audit.md): verified issuer mappings, a separate complete discovery catalog, web/mobile availability, and an accessible benefits explainer with qualified source claims.
- Fixed intermittent xStocks catalog loss on cold starts: the paginated catalog gets a bounded 20-second deadline while other metadata retains eight seconds. Caller cancellation still wins. A fresh Node 24 read returned all 877 xStocks; three deterministic deadline regressions pass.
- [Basket liquidity audit](basket-liquidity-audit.md): original definitions screened at two amounts; four explicitly named mainnet compositions retained. Existing paper/devnet allocations remain intact.
- [Mobile UI and verification](../apps/mobile/MOBILE_UI_VALIDATION.md): four destinations, both themes, devnet-only web signing handoff, and removal of legacy mainnet recurring UI.
- Web landing page follows the supplied `image.png` hierarchy: editorial hero/product preview, research, allocation, ownership, and a final discovery action. Prices and allocation figures use real data; unavailable states contain no fabricated charts or numbers.
- `/sip` has an explicit devnet/paper choice, persistent network context, schedule controls, total limit preview, preparation reasons/retry and existing pending-submission recovery. It does not claim that plan management or revocation controls have been implemented.
- [Global style ownership](../apps/web/styles/README.md): one entry point with ordered responsibility files and colocated modules. Removed obsolete overview, marquee, modal and legacy mobile investing code. Inter/Manrope are self-hosted with licenses, so the existing Content Security Policy permits the requested fonts.
- [Free hosting/APK plan](free-deployment-plan.md) and current environment templates; no unnecessary pool mapping, keeper key, or unused Privy secret.

## Automated checks

- Shared SDK compilation: passed.
- Web and mobile TypeScript: passed.
- SDK, web API/policy, and mobile regression tests: **250 passed**, zero failures, under Node 24.12.0.
- Next.js production build on Node **24.12.0**: passed, including type checks and static generation.
- Mobile web export: passed, 490 modules.
- Android JavaScript/Hermes production export: passed, 897 modules.
- `git diff --check`: passed.

Commands from the repository root, with the pinned runtime/package manager available:

```sh
pnpm build:sdk
node --test packages/sdk/test/*.test.cjs apps/web/tests/*.test.mjs apps/mobile/tests/*.test.cjs
node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p apps/mobile/tsconfig.json --noEmit
pnpm build:web
```

Run a production build after stopping the development process: both use `.next`, so concurrent runs can overwrite each other's manifests. A first overlapping run was discarded; the clean, sequential production build passed.

## Browser verification

- Landing and SIP inspected in light/dark modes and at desktop and 390-pixel phone width.
- Fixed a phone header overflow introduced by moving the mode switch into the header. Landing, SIP, and Discover now fit a 390-pixel viewport without horizontal document overflow.
- SIP schedule/amount changes update the total preview; real unavailable devnet configuration displays its reason and disables approval. Paper practice remains separate.
- Backpack search returns matching securities and distinguishes the available SpaceX token market from discovery-only securities. Dialog initial focus, Escape dismissal, and focus return to the trigger were checked.
- Theme preference persists across reloads; self-hosted Manrope loads successfully under the current policy.
- Final production cold start returned 877 xStocks and 1,165 Backpack listings. After the observed-price refresh, all four reviewed baskets reported complete, available allocations; unpriced catalog assets remained unavailable. No browser console errors were recorded on the final production preview.
- Production `/api/health` returns `ok`; `/api/recurring/config` identifies `devnet` and `testTokensOnly: true`.
- The environment lacks `KITE_RECURRING_AUTH_SECRET`, so its real config is blocked. This is displayed rather than bypassed or populated with a pretend wallet secret.

## Remaining owner and infrastructure work

1. Review the four high contract blockers and approve a separate fix. Correct authorities and passing mocked tests are not an end-to-end execution proof.
2. Install/provide the Rust/Solana/Anchor runtime fixtures to run the official Subscriptions integration. No installment was signed, minted, collected, swapped, or submitted here.
3. Set hosting secrets and public origins, confirm the selected free plan's eligibility, then deploy following the hosting plan. Cron collection remains later work.
4. Build and inspect an actual APK on a physical device. An Android JS export is not a signed APK or wallet integration test.
5. Requote before every real order. Liquidity and catalog observations are timestamped; no sampled result guarantees a later fill.
