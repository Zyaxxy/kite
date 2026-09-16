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
