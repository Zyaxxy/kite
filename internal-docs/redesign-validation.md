# Frontend redesign verification

Verified on 12 September 2026.

## Product coverage

The web application includes the landing page, discovery, full issuer markets, thematic baskets, basket allocation details, asset details, paper/actual portfolios, watchlist, activity, recurring paper plans, account settings, search, and branded missing-page/error states.

The Expo application includes discovery, markets and saved assets, baskets, asset details, paper portfolio and orders, recurring paper plans, and account settings. Both applications use forest, lime, geometric Kite artwork, and shared market/accounting logic in `@kite/sdk`. Active interfaces contain no emoji or fabricated market data.

The requested “Unified UI Design System - Kite project ss” / Stitch reference was unavailable in the checkout and conversation. The implemented visual system is provisional; exact matching requires that source.

## Completed checks

- Next.js 15.5.24 production build, route generation, and TypeScript validation pass.
- SDK build and native TypeScript validation pass.
- All 14 SDK/accounting/trading tests pass, including insufficient funds, stale prices, atomic paper baskets, corrupt saved accounts, monthly recurrence, issuer outages, transaction tampering, and unknown trade confirmations.
- Expo production JavaScript exports pass for Android and iOS. Native simulator/device interaction was not tested.
- Browser verification covered desktop at 1440 pixels and responsive web at 390 pixels, including filters, paused asset restrictions, navigation, account setup, and missing-page rendering.
- A paper buy updated cash and holdings, persisted after reload, and appeared in portfolio/activity. A recurring paper plan could be created, paused, and resumed. Verification paper activity and bookmarks were cleared afterward.
- The live API returned 841 issuer-listed Solana assets: 832 xStocks and 9 PreStocks, with prices available for 138 at the time of verification. Counts and quotes are dynamic. Missing quotes remain unavailable; paused issuer products cannot be newly traded.
- Retired `/api/faucet` and `/api/buy-basket` endpoints returned HTTP 410. An invalid wallet query returned HTTP 400.
- The upstream news route preserves genuine RSS articles and reports empty or unavailable feeds explicitly. Targeted runtime checks cover feed failures, empty results, real article metadata, and xStock symbol normalization.
- No production-browser application errors appeared during the checked flows. No real transaction was signed or submitted.

## Deployment inputs and current limits

Configure the public Privy app ID, server Jupiter API key, and a suitable Solana mainnet RPC using `apps/web/.env.example`. Configure a reachable web/API origin using `apps/mobile/.env.example`. Never place provider secrets in mobile or public environment variables.

Privy actual trading is implemented on web. Native users hand off to the web asset page for sign-in, quote review, and wallet approval. Native Solana wallet authorization requires an Android development build with the wallet module.

There is no active mainnet Kite vault. Actual baskets use individual wallet-approved swaps. Actual unattended recurring investing is unavailable; paper installments run only while the application is open with fresh data. Web and mobile paper accounts remain device-local.

Historical charts, sentiment, news, fees, slippage, and corporate-action performance are not synthesized. The paper ledger is a reference-price simulation. Actual xStocks valuations remain unavailable where the provider does not establish the relationship between quoted raw units and adjusted wallet balances.

See [data sources](mainnet-data.md), [mainnet trading](mainnet-trading.md), and [mobile setup](../apps/mobile/README.md).

The branch preserves the latest upstream news endpoint and Jupiter, Meteora, and Pyth adapter modules. Active frontend quotes use the separately verified market pipeline; retaining an adapter does not validate the upstream oracle probe or connect it to order execution. The typecheck command generates Next.js route types so it can run before a production build on a fresh checkout.
