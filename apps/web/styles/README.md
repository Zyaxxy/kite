# Web styles

`app/globals.css` is the only global entry; `styles/index.css` fixes cascade order.

- `foundation.css`: theme tokens, resets, typography and shared utilities.
- `workspace-base.css`, `navigation.css`: shell and responsive navigation.
- `market-base.css`, `discovery.css`: asset tables, baskets and discovery panels.
- `account-forms.css`, `trading.css`, `recurring.css`: account and investment surfaces.
- `research.css`: charts, research tabs and service states.
- `landing-base.css`: shared public-page frame; landing-specific composition uses a colocated module.
- `privacy.css`: legal pages, data/security footer and consent.
- `overlays.css`, `theme-surfaces.css`: shared dialogs, scrims and theme adaptations.
- `wallet-adapter.css`: upstream wallet modal baseline (license adjacent); `wallet-overrides.css` applies Kite tokens.
- `responsive.css`: legacy shared breakpoints, kept in their original cascade position.

New styles belong in the existing responsibility file or in a component CSS module. Do not add another global `*-redesign.css` override sheet. Use semantic theme variables; keep explicit dark colors limited to intentional artwork. The split preserves existing selector order and specificity.

Shared app sizing lives in `foundation.css`: use `--space-*` for the 4px spacing
scale, `--text-*` for typography roles, and `--radius-*` for badges, controls and
panels. Body text, navigation and financial figures use local Manrope; retain
tabular numerals on financial values. Primary controls and fields are 44px high;
compact desktop actions are 36px. Panels use a 16px radius, controls 10px, and
badges 6px. Use 24px panel padding and 32px between content sections. Page titles
are 36px on desktop and 28px on phones; section titles are 22px. The landing's
editorial display sizes, serif accents and diagram labels remain local to its
CSS module.
