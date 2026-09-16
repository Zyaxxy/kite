# TODO implementation plan — 16 September 2026

Source: `TODO.md` at upstream `6dc2d2e`. Work branch: `codex/todo-release-readiness`.

## Constraints

- Preserve the latest devnet subscription + mock-mint model. Audit contract findings in Markdown; do not rewrite contract execution logic.
- Query liquidity only. Do not sign, broadcast, mint, deploy a program, or change token authorities.
- Recurring wallet operations must use devnet. Mainnet discovery and owner-approved trading remain separate.
- Use verified issuer data. Exchange securities without a verified Solana mint are discovery-only, never pretend SPL tokens.
- Keep web/mobile business rules in the SDK and reuse the existing app component primitives.
- Commit completed work in separate, reviewable increments.

## Work sequence

1. [x] Preserve completed light/dark theme work and integrate latest upstream main. Back up incompatible pnpm 11 lockfile churn separately; retain the pinned pnpm 10 lockfile.
2. [x] Audit mock-mint contract, mint authorities, official Subscriptions integration, and recurring network isolation. Record findings and owner-run commands.
3. [x] Audit and implement Backpack discovery with truthful availability/benefits and a dedicated catalog UI on web/mobile.
4. [x] Run read-only Jupiter basket route checks; document amounts, timestamps and results; restrict live baskets using evidence without silently changing an existing basket allocation.
5. [x] Align mobile navigation, typography, panels and recurring screen with the web product.
6. [x] Redesign `/sip` around clear devnet setup, schedule, funding, delivery and pending-submission status; preserve execution behavior.
7. [x] Redesign landing page using `image.png` layout inspiration and real product data. Preserve Kite positioning and both themes.
8. [x] Consolidate web styles by responsibility, remove obsolete recurring setup code where safely unused, and clean environment examples against live references.
9. [x] Document a current free hosting path for web/API and an Android APK using the same HTTPS backend, including limits and deployment commands.
10. [x] Build SDK, run focused regression suites, typecheck web/mobile, verify production/export builds and browser flows. Record remaining infrastructure/owner-only steps clearly.

## Completion evidence

Each item will link to its implementation/audit documentation and validation result as it lands. External dependencies that cannot be verified will remain explicitly blocked, rather than be called production-ready.

- Contract review: [devnet audit](devnet-contract-audit.md). 40 stock authorities verified; four high execution blockers documented without changing contract logic. SDK build and 29 focused checks pass; SBF runtime fixtures/toolchain are unavailable.

- Mobile: [validation](../apps/mobile/MOBILE_UI_VALIDATION.md), TypeScript, 10 tests and web/Android exports pass. Native device verification remains an owner step.
- Hosting and environment: [free deployment plan](free-deployment-plan.md), provider limits and HTTPS APK setup documented; obsolete unused environment variables removed.

- Markets: [Backpack integration](backpack-integration-audit.md) and [basket evidence](basket-liquidity-audit.md). Official discovery contains 1,165 listings at the audit timestamp; only verified transferable mints enter token markets. Four reviewed mainnet basket definitions passed both quote sizes and unsigned atomic composition.
- Web UI: landing and SIP redesigned, fonts self-hosted, global CSS organized, unused overview/marquee/modal removed, phone overflow fixed. [Full validation and remaining owner work](todo-validation.md).
- Validation: all 250 SDK/web/mobile tests pass; type checks and production/export builds passed. Contract execution, a signed APK/device flow, and cloud deployment remain explicitly unverified owner/infrastructure steps.

## Commits

- `3446f74`: preserve persistent themes and data/security footer.
- `a96eb33`: integrate latest main (`6dc2d2e`).
- `74896d9`: record task plan.
- `806c2b4`: devnet contract/authority audit and keep local mint checkpoints out of Git.
- `dca4af2`: free hosting/APK plan and environment cleanup.
- `ae99eac`: mobile redesign, themes, Backpack, devnet handoff and legacy UI removal.
- `6eadcae`: verified Backpack markets, basket route audit/reviewed catalog, historical paper allocation protection.
- `d013bbf`: structured CSS, self-hosted fonts, landing redesign and phone navigation fix.
- `f86b800`: recurring setup redesign and truthful devnet readiness.
- `a5e666d`: bounded cold xStocks pagination and cancellation/deadline regressions.
