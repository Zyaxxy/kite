# Company research and market discovery

The web stock detail and native asset screen use `GET /api/research?mint=<issuer mint>`. The server resolves the asset from the live mainnet issuer catalog before looking up its underlying company. A caller cannot supply a different company name or arbitrary upstream URL. Shared types, source parsing, indicator calculations, and a bounded five-minute cache live in `packages/sdk/src/research.ts`.

## Sources and meaning

- Yahoo Finance's publicly served chart endpoint supplies the underlying security's daily OHLC history, volume, dividends, and splits. Search data supplies the matching company name, exchange, industry, sector, and related-ticker news. Public fundamentals time series supplies reported annual and quarterly figures with actual currency, period type, and period end. These endpoints require no additional local key but are undocumented and best-effort; an upstream change can make a section unavailable.
- Wikipedia's [MediaWiki API](https://www.mediawiki.org/wiki/API:Main_page) supplies introductory company descriptions only after an exact normalized company-name match. Responses include the specific Wikipedia source and CC BY-SA attribution; the UI displays these sources. An ambiguous match stays absent.
- The existing Google News RSS integration supplies market headlines and private-company news. Article links, publisher names, and publication dates are preserved. No article body or generated financial summary is invented.

Price history and financial statements describe the **underlying company/security**, not its Solana token. Every research panel and chart labels that distinction. Known unfinished daily sessions are excluded from closing-price charts and indicators. These are provider-reported observations, not a real-time exchange feed. The token quote, token-market volume, and executable Jupiter order remain separate.

Overview includes a sourced business description, reported company classifications, daily history, the latest session's high/low, and the range available in the one-year history. Technicals calculate 20/50/200-session simple averages and Wilder's 14-session RSI only when enough reported closes exist. They describe historical movement, not a recommendation. Fundamentals show the latest fact per metric and up to five reported periods; revenue bars compare only matching currencies. Annual and quarterly data are never relabeled as trailing-twelve-month ratios. Events show observed corporate actions, not guessed future earnings dates. ETFs and private-company exposure omit unsupported company financials.

Each response has source URLs, retrieval time, coverage status, and warnings. Missing data remains null/absent. There is no AI inference of company metrics, generated chart history, or fabricated market sentiment.

## UI reference decisions

All 22 images in `Screenshots/GrowwUI` were inspected. The relevant patterns adopted are compact market movers, coverage-aware breadth, watchlist context, transparent basket compositions, stock research tabs, period selectors, performance ranges, company financials, and linked news/events. The implementation keeps Kite's existing forest/lime palette and responsive layout. Groww's personal account values, Indian index prices, mutual-fund returns, derivatives, bank controls, and shareholder numbers are not imported into Kite.

The dashboard's market sentiment is explicitly observed breadth: counts of advancing, declining, and flat priced tokens. Most-traded rankings use reported 24-hour USD token volume; gainers and losers use reported 24-hour percentage change. Coverage and missing values remain visible. Basket definitions are original Kite allocations inspired by [Cesto's thesis-and-allocation approach](https://docs.cesto.co/cesto/what-is-cesto); no Cesto returns or product claims are copied.

## Verification

- 53 SDK and web tests cover provider parsing, precision validation, both swap legs, token search, research indicators/session boundaries, market rankings, basket allocation, and atomic paper swaps.
- SDK and web production builds, native TypeScript checks, and Android/iOS Expo exports pass.
- Browser checks cover live dashboard rankings, all five research tabs, annual/quarterly financials, token search and reversal (including SOL and Bonk), basket category filters, and a 390-pixel mobile viewport.
- A browser-only paper purchase and NVDAx-to-AAPLx paper swap recorded the two linked swap entries with unchanged paper cash. These are explicitly labeled simulated records.
- Read-only Jupiter quote probes returned routes for SOL-to-NVDAx and NVDAx-to-AAPLx. No wallet transaction was signed or executed.
