<!-- Curated for the Kite monorepo. Sources and decisions are recorded in design.json. -->

# Project Design Context

Reference-led landing page direction, 7 October 2026. The 21st root scanner does not detect the nested web app; this document and design.json explicitly record its design context.

## Project

- Name: kite-monorepo
- Product: self-custody interface for tokenized securities on Solana.
- Stack: Next.js App Router, React, strict TypeScript, CSS Modules, Tailwind and the shared SDK.
- Color mode: light and dark.
- Density: editorial landing page with focused financial data panels.

## Sources

- Tokens: apps/web/styles/foundation.css; apps/web/components/kite/Landing.module.css.
- Components: existing Brand, AssetAvatar, Change, ThemeToggle and SocialLinks.
- Assets: local Manrope fonts, issuer company logos and the user's DollarAbstract artwork, optimized as dollar-abstract.webp. The Wall Street film poster is a visual reference only.
- Instructions: PRODUCT.md, AGENTS.md

## Components

- Reuse existing Kite components and shared market/research transports.
- Use semantic details/summary for FAQs, keyboard-operated research tabs, geometric Lucide icons and Next Image.

## Tokens

- Forest #193c2b, cream #f6f5ef and lime #d5f478, with readable theme variants.
- Local Manrope for body/navigation; Georgia italic for editorial headline accents.
- Tabular financial numbers; compact 4–5px panel corners.
- Maximum content width 1320px; desktop padding 56px; mobile padding 24px.
- Scoped GSAP motion: a coordinated masked-headline/artwork entrance, independent image parallax and allocation assembly. Below-fold reading text fades upward once on approach, with a short eased stagger inspired by `kimia.mp4`. Pinned widget shells are excluded from independent timed entrances; their panes have one scroll owner. Observed charts are not artificially drawn.
- Research advances through all five views on scroll; recurring advances through all four steps. Both reverse with scrolling and never play on a timer. Persistent panes and captions share a stable grid height.
- Animated product chapters finish at 86% of their finite GSAP pin, reserving the remaining scroll for a completed-frame hold. Timelines read pin progress directly on scroll and refresh; landing-scoped anchoring suppression prevents viewport jumps when spacers rebuild. Fit a whole chapter first, then its smaller workspace/allocation/ownership stage. Stable research pane/source areas and compact vertical spacing at short viewport heights preserve type sizes, disclosures and 44px controls; truly oversized stages stay inline. Pause/direct selection remain available. Reduced motion removes pins and offers manual tabs/next-step controls. No wheel/touch trapping.
- One forest footer contains the final CTA, brand, product/community links, risk disclosure and legal/data controls. The global privacy component supplies the consent banner and storage-error notice without adding a second landing footer; other routes retain their existing data/security footer.
- Griffin-inspired navigation continuously morphs into a centered island over 180px of scroll, retaining the geometric home glyph and measured crisp-text geometry. Keep 96px clear above pinned stages. The compact dated market snapshot concludes the research chapter, outside its pin, aligned to the workspace with four desktop columns and two on phones. One combined issuer/tools section follows How Kite Works and precedes FAQ, with separate role-labeled groups and official Jupiter/Pyth marks; no endorsement implication.
- The desktop theme toggle fades/collapses during the island morph, returning at the page top. The compact width is measured from the remaining controls so Open Kite fits. Mobile theme controls remain in the menu; concealed header controls are inert.

## Constraints

### Must

- Clearly distinguish mainnet spot purchases, devnet wallet recurring and paper practice.
- Use actual observed market/research data and SDK-resolved basket allocations.
- Preserve unavailable and stale data, dates, source links and direct wallet ownership.
- Support mobile navigation, light/dark themes, keyboard interaction and reduced motion.

### Avoid

- Invented prices, charts, returns, testimonials or creator metrics.
- Vague onchain slogans, mainnet recurring claims or unconditional bundle atomicity.
- Calling fixed 30-day cadence calendar-month scheduling.

## Decisions

- Adapt the user's Kimia and Griffin references into a premium editorial landing page: the user's currency artwork, quiet typography, clear product explanations and source-backed data.
- Retrieve 21st Financial Platform Feature Grid (component 29553) for composition reference. Use existing Kite primitives rather than installing its spotlight styling and extra dependencies.
- Explain vaultless SIP/DCA with wallet custody, bounded approval, due test-token collection and test stock delivery to owner accounts.
- The latest explicit request authorizes GSAP pin/unpin spacing for finite product chapters, superseding the earlier native-sticky decision. Keep browser scrolling native and restore scoped styles/triggers on route or media changes; never use timed chapter playback.
- The latest contextual 21st search was blocked by workspace data-egress review. No context was uploaded and no third-party component code was installed for this rebuild.
