# Kite interface sources

- [shadcn/ui Table](https://ui.shadcn.com/docs/components/table) and [Native Select](https://ui.shadcn.com/docs/components/native-select): table and select primitives adapted to Kite’s existing CSS tokens. MIT license in SHADCN-LICENSE.md.
- [shadcn/ui Dropdown Menu](https://ui.shadcn.com/docs/components/dropdown-menu): grouped, portaled menu composition adapted to the already-installed Base UI Menu primitive. Base UI 1.8.0 is now explicitly declared by the web package; no global tools were installed.
- [coss Menu](https://coss.com/ui/docs/components/menu): interaction reference for menu grouping and link items; no coss implementation is redistributed.
- [Consensys](https://consensys.io/): reference for the compact rounded navigation group, four destinations, dropdown hierarchy, and separate action on the right.
- User-supplied Kokonut UI profile dropdown: adapted identity block, grouped account links, separators, and sign-out treatment. Kite uses the real connected account state, with no sample profile information.
- User-supplied [Kokonut UI Currency Transfer](https://kokonutui.com/docs/components/currency-transfer): adapted in trading/TradeTransfer.tsx. Animation follows the transaction state, with separate review, signing, confirming, success, unknown, and error states. Its license is included alongside the component.
- Screenshots/GrowwUI: reference for market overview, compact stock cards, aligned market tables, and the account/tools/news rail. All figures and headlines come from Kite’s existing data services.

The navigation contains Discover, Baskets, Recurring, and Portfolio. Markets redirects into Discover. Activity is included in Portfolio and accessible separately from the account menu. Saved assets remain a Discover filter. Trading mode controls appear only inside the app.

- [shadcn/ui Toggle Group](https://ui.shadcn.com/docs/components/base/toggle-group): compact appearance selector composed with the existing Base UI ToggleGroup and Toggle primitives, using Kite theme tokens. [Dark mode guidance](https://ui.shadcn.com/docs/dark-mode/next) informed root provider placement and hydration-safe initialization; no new dependency is required.

- [shadcn/ui Base UI Dialog](https://ui.shadcn.com/docs/components/base/dialog): title, description, portal, backdrop and close composition for the Backpack explainer, using the installed Base UI primitive for focus trapping and Escape dismissal.
