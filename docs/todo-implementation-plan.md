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
2. [ ] Audit mock-mint contract, mint authorities, official Subscriptions integration, and recurring network isolation. Record findings and owner-run commands.
3. [ ] Audit and implement Backpack discovery with truthful availability/benefits and a dedicated catalog UI on web/mobile.
4. [ ] Run read-only Jupiter basket route checks; document amounts, timestamps and results; restrict live baskets using evidence without silently changing an existing basket allocation.
5. [ ] Align mobile navigation, typography, panels and recurring screen with the web product.
6. [ ] Redesign `/sip` around clear devnet setup, schedule, funding, delivery and plan management; preserve execution behavior.
7. [ ] Redesign landing page using `image.png` layout inspiration and real product data. Preserve Kite positioning and both themes.
8. [ ] Consolidate web styles by responsibility, remove obsolete recurring setup code where safely unused, and clean environment examples against live references.
9. [ ] Document a current free hosting path for web/API and an Android APK using the same HTTPS backend, including limits and deployment commands.
10. [ ] Build SDK, run focused regression suites, typecheck web/mobile, verify production/export builds and browser flows. Record remaining infrastructure/owner-only steps clearly.

## Completion evidence

Each item will link to its implementation/audit documentation and validation result as it lands. External dependencies that cannot be verified will remain explicitly blocked, rather than be called production-ready.
