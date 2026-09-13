# Kite product review — 13 September 2026

This is the baseline review at commit `7eba866`, before the recurring investment implementation. Findings and scores are retained as historical evidence; see [current implementation and remaining release gates](recurring-investing-operations.md) for subsequent work. Shipping code alone does not establish a higher usability score.

## Executive summary

Kite has a coherent visual identity and an approachable way to explore thematic baskets. For the stated audience—people who want one-approval basket purchases and easy daily investing—the main gap is completion: recurring token permissions do not yet purchase and deliver basket assets automatically. The interface is more mature than that central investing workflow.

**Overall: 5.8/10.** This is a product usability assessment of the current MVP, not a security certification or evidence of successful funded mainnet execution.

## Scope and evidence

- Reviewed the local production web app at `http://127.0.0.1:3000`, including landing, basket details, recurring plans in both modes, activity, settings and the Privy sign-in entry.
- Inspected the responsive web layout at 390 × 844 and the default desktop viewport. Restored the viewport afterward.
- Cross-checked recurring behavior and actual activity against the current implementation and deployment documentation on `codex/deployment-mobile-upgrades`, implementation HEAD `7eba866`.
- The browser had existing paper activity and a persisted Actual selection. No storage was cleared; this was a walkthrough from a new investor's perspective, not a pristine new-account test.
- Did not sign in, authorize spending, submit a funded trade, create a recurring grant or run a collection service. Native Android/iOS, installed Expo builds, screen readers and production network performance were not tested in this review.

## Scorecard

| Dimension                |      Score | Evidence and implication                                                                                                                                                         |
| ------------------------ | ---------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onboarding               |       6/10 | Baskets are visible before authentication and email/wallet entry exists. The hero and primary CTA emphasize exploration rather than buying a basket or starting daily investing. |
| Core experience          |       4/10 | Basket purchase preparation is implemented, but live execution has route constraints. Actual recurring setup authorizes payments rather than completing the promised investment. |
| Error handling           |       6/10 | Missing prices are disclosed and pending transactions discourage duplicate submission. Recovery still asks users to interpret wallet activity.                                   |
| Information architecture |       6/10 | Baskets and Plans have clear navigation, including on phones. The first screen of Plans prioritizes an empty state over setup, and Actual activity redirects to settings.        |
| Visual design and polish |       8/10 | Consistent forest/lime palette, typography, company marks and responsive navigation. Some editorial copy obscures the action or mislabels the underlying assets.                 |
| Performance              |       6/10 | Local repeat research requests are fast; the market response is large and incomplete-price states persist. Real mobile network and deployed performance remain unmeasured.       |
| Accessibility            |       6/10 | Mode radios and form labels are exposed, with focus and reduced-motion support in code. Full keyboard, screen-reader, contrast and zoom testing is incomplete.                   |
| Feature completeness     |       4/10 | Discovery and paper journeys are broad. Automated basket delivery, a useful actual investment ledger and verified cross-platform completion are still missing.                   |
| **Overall**              | **5.8/10** | Unweighted average: 46 ÷ 8, rounded to one decimal.                                                                                                                              |

## Top three strengths

1. **A consistent, recognizable interface.** Desktop and phone views retain the same typography, palette and visual hierarchy. The landing basket showcase avoids a long vertical catalog.
2. **Users can understand a basket before connecting.** A Wider Lens shows its three components and exact allocations. Paper mode makes exploration possible without a wallet signature.
3. **The product acknowledges limits honestly.** The UI separates virtual funds from actual trading, identifies missing prices, explains atomic purchase rollback and clearly states that recurring permissions do not enforce stock delivery. Preserve that honesty as the workflow improves.

## Top three improvements

1. **Complete daily basket investing.** The intended journey should be basket → amount → daily schedule → review → approval, followed by verifiable asset delivery and a next-run status. Asking a retail investor for a buyer's Solana address leaves them responsible for assembling the service themselves.
2. **Make basket purchase availability understandable before commitment.** “Available to practice” does not tell an Actual user whether a basket can currently be bought in one transaction. Explain supported purchase paths and surface current quote limitations early; availability must remain conditional on a fresh quote.
3. **Provide investment receipts and plan outcomes inside Kite.** Show what was bought, amount spent, fees, confirmation, next scheduled investment and any action required. An explorer should support the receipt rather than serve as the main product experience.

## First-time journey observations

| Touchpoint                        | Result     | Observation                                                                                                                                                             |
| --------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Understand the offering           | Partial    | “Big ideas. Small beginnings. Limitless you.” creates an identity, but does not state the two primary jobs.                                                             |
| Browse before connecting          | Pass       | Landing cards link directly to basket composition and purchase controls.                                                                                                |
| Understand ownership and modes    | Pass       | Paper/Actual selection is visible; the app explains virtual funds and wallet approvals.                                                                                 |
| Start authentication              | Partial    | Privy email/wallet entry opens. Completing sign-in and returning to an intended purchase was not tested.                                                                |
| Review basket composition         | Pass       | A Wider Lens displays SPYx, QQQx and GLDx allocations.                                                                                                                  |
| Finish one-approval purchase      | Not tested | No funded wallet signature or settlement was performed. Existing route-size constraints mean catalog inclusion is not proof of executability.                           |
| Carry basket into recurring setup | Partial    | The link carries `basket=sol-core`; Paper selects A Wider Lens. Actual shows a generic token-payment permission with no basket selection.                               |
| Set up unattended daily investing | Incomplete | Actual requires a buyer address and does not enforce basket delivery. Paper runs only while the app is open, with fresh prices, and does not backfill missed intervals. |
| Understand investment outcomes    | Partial    | Paper activity has order rows and CSV export. Actual activity is a link to the account page rather than a ledger.                                                       |
| Use a phone layout                | Partial    | Navigation and cards fit the sampled viewport. On Plans, the setup form is below the initial screen, after a large empty state and explanations.                        |

## Detailed dimension reviews

### Onboarding — 6/10

**Working well:** No wallet wall blocks discovery. Basket composition, Paper mode and both Privy and existing-wallet entry points are present.

**Needs improvement:** The hero leads with broad aspirational language. “Find your next idea” sends users to general discovery; “Sign in with Privy” introduces a provider name before the user has chosen an investment. Switching modes changes recurring behavior substantially, beyond merely changing the source of funds.

**Priority fix:** Lead with a concrete statement such as “Choose a basket. Invest once. Build a daily habit,” but only advertise automatic daily investing once it actually works. Make Explore baskets the primary entry and retain the chosen basket and amount through authentication.

### Core experience — 4/10

**Working well:** The basket form communicates one approval, direct wallet settlement, allocations and slippage. Paper recurring setup preserves the selected basket.

**Needs improvement:** Actual recurring setup defaults to weekly and asks for a buyer wallet, period cap and duration. Its consent explicitly says stock purchases and delivery are not enforced. The documented collector moves funding tokens to the buyer; a separate integration must fulfill purchases. This is payment infrastructure, not the complete daily-investing experience.

**Priority fix:** Design and implement the full recurring execution and delivery lifecycle before simplifying its marketing. Keep the payment-only capability clearly described while incomplete. Do not hide its trust assumptions behind a simpler button.

### Error handling — 6/10

**Working well:** The interface acknowledges unavailable prices instead of fabricating them. The transaction flow persists pending intent and blocks new transactions while an outcome is uncertain.

**Needs improvement:** “I checked the outcome” puts reconciliation responsibility on an inexperienced investor. Mainnet activity does not supply a readable receipt to help that decision. Unsupported basket routes can also be discovered late in the purchase journey.

**Priority fix:** Reconcile pending signatures automatically and show clear confirmed, failed or still-checking states with a safe next action. Preserve duplicate-submission protection during uncertainty.

### Information architecture — 6/10

**Working well:** Baskets and Plans are easy to reach, including through the mobile bottom navigation. Composition appears beside purchase controls on desktop.

**Needs improvement:** Markets, research and broad discovery compete with the two primary jobs. On a phone, the empty Plans card occupies the space where a first-time user needs the setup form. Actual Activity leads to settings.

**Priority fix:** Give the home workspace two obvious actions—buy a basket and create a daily plan—followed by holdings and upcoming investments. Place the first-plan form above the empty-plan explanation on phones.

### Visual design and polish — 8/10

**Working well:** The palette, company logos, rounded panels and sliding mode control form a consistent system. The sampled phone layout has no visible horizontal overflow or white screen.

**Needs improvement:** Poetic headings sometimes delay comprehension. A Wider Lens calls its ETF components “3 companies,” although its description correctly identifies ETF exposure. Paper-oriented availability labels appear while Actual is selected on the landing page.

**Priority fix:** Use precise action copy and “3 assets” for that composition. Keep decorative and secondary text subordinate to amount, schedule, purchase status and the main action.

### Performance — 6/10

**Working well:** Fresh local sampling returned `/api/markets` in 11 ms and NVDA research in 1,057 ms, then 6 ms on an immediate repeat. These samples support the benefit of caching.

**Needs improvement:** The market JSON body was 619,359 bytes; research was 52,215 bytes. These are response-body sizes, not compressed transfer sizes. The UI showed repeated updating/partial-data notices; settings reported 703 issuer-listed assets without observed token prices at that moment. This is also a coverage problem, which faster loading alone cannot solve.

**Priority fix:** Load the basket summary and essential purchase metadata first; fetch broader catalog and research detail on demand. Measure time to usable basket and quote readiness on deployed mobile networks. The first sampled research request is not a controlled cold-cache benchmark.

### Accessibility — 6/10

**Working well:** Accessible snapshots expose names for mode radios, amount inputs and period selectors. Source inspection shows visible-focus styles and reduced-motion handling; the marquee pauses on interaction/focus.

**Needs improvement:** Many explanatory labels are visually small on phones. Full contrast compliance, modal focus restoration, keyboard traversal, screen-reader announcements and 200% zoom have not been demonstrated. Some links in the expanded mobile More snapshot exposed URLs without descriptive names, warranting a focused accessibility check.

**Priority fix:** Test keyboard and screen-reader completion of basket selection, sign-in entry, purchase review and plan setup. Verify descriptive names for More links and make pending/error changes announce themselves. Treat this score as provisional, not a WCAG claim.

### Feature completeness — 4/10

**Working well:** The MVP includes discovery, basket composition, paper orders/plans, wallet integration, actual purchase preparation and onchain recurring permissions.

**Needs improvement:** There is no complete hosted daily basket execution/delivery flow, meaningful actual order ledger or verified native-device completion in this review. Paper state is device-local, which is disclosed but limits continuity between web and mobile.

**Priority fix:** Finish and verify one coherent basket-plus-daily-plan journey before expanding secondary analytics. Separate “implemented,” “successfully exercised” and “deployed and operating” in release status.

## Improvement roadmap

Effort bands are planning estimates, not delivery commitments. Order within each band reflects impact on the stated audience.

### Quick wins — less than one day each

1. Clarify payment-only recurring behavior at entry points; avoid implying completed automatic stock investment.
2. Bring the new-plan form above the empty state on phones, default cadence to daily, and preserve basket context where supported.
3. Make baskets the landing CTA destination and tighten hero copy around the actual supported outcome.
4. Replace incorrect component labels such as “companies” for ETF baskets; distinguish practice availability from an actual executable quote.

### Medium effort — one to three days each

1. Add a concise purchase review with funding amount, per-asset estimates, minimum output, fees and clear quote-expiry recovery.
2. Build an in-app recent transaction receipt view with automatic reconciliation of pending signatures. Expand it to a durable ledger afterward.
3. Add early route-availability feedback without treating a cached check as a guarantee of future execution.
4. Reduce initial catalog payloads and measure deployed mobile performance; run keyboard, contrast and zoom checks on the two main journeys.

### Major investment — at least one week

1. Deliver a complete daily basket service: explicit user authorization, enforceable or clearly disclosed settlement guarantees, durable scheduling, asset delivery verification, duplicate prevention, failure recovery, revocation and observable outcomes. Validate its trust model before presenting it as unattended investing.
2. Verify funded owner-controlled test journeys across supported wallets and physical mobile devices, including app termination, interrupted network, wallet rejection and revocation. Web export success alone is insufficient.
3. Provide durable plan history, notifications and cross-device continuity for signed-in users, while retaining the separation between simulated and actual funds.

For the submission, prioritize a narrow, honestly demonstrated one-approval basket journey. Describe recurring investment as incomplete until scheduled execution and asset delivery are working and verified. Additional research sections and decorative motion have lower value than finishing these two core jobs.
