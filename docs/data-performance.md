# Market and research loading performance

Measured locally on 13 September 2026 using the production Next.js build and real public/mainnet provider responses. These are individual observations, not latency guarantees; issuer/network conditions and Jupiter rate limits vary.

| Path | Before | After |
| --- | --- | --- |
| Initial market response | 26.3 s, waited for every price/reference batch | 5.0 s, verified issuer catalog returned first |
| Usable token-price coverage | Blocked behind the whole 26.3 s request | All 138 available token prices observed by 6.2 s |
| Full supplemental references | Part of the blocking request | Finished in background at 26.4 s |
| Company-only research fetch | 1.55 s | 1.01 s |
| Cold HTTP research, including issuer discovery | Previously chained to full market fetching | 6.17 s |
| Cached HTTP research | — | 5 ms |

Both market measurements returned 841 issuer-listed assets and 138 available token prices. Research retained 251 real daily bars, 43 reported financial facts, and the company description. Missing quotes remain missing. Cached responses contain source observation dates; no fixture, hardcoded quote, inferred price history or reference-price substitution is used to achieve these timings.

## Changes

- Separate issuer identity from the price universe. Research and token/trade identity checks need no Jupiter market scan.
- Return a catalog or previous observations immediately, then publish token data before optional references. Use Next.js `after` to await background work within the request lifecycle.
- Refresh full reference batches every five minutes instead of on every 30-second token refresh. Target previously V3-only token quotes separately so they remain fresh.
- Coalesce server and client work, bound upstream deadlines, and suppress rapid retries during outages. ETag validators make unchanged two-second market polls return an empty 304 response instead of retransmitting the entire catalog.
- Cache slow-changing financial statements and company descriptions independently. Combine the two Wikipedia requests and overlap company enrichment with financial requests.
- Share web/mobile research transport caching, cancellation, response validation and freshness calculation. Keep financials visible during refresh; stop follow-up polling on completion or failure.

Caches are bounded, in-process caches. A new server process starts cold; instances do not share cache entries. This change does not introduce a Redis/database dependency. Supplemental references can still take a full provider rate-limit window, but no longer block browsing or research. Paper trades continue to require observed token quotes no older than two minutes; actual swaps still verify issuer status, both mint precisions, the reviewed route and wallet authorization.

## Validation

86 SDK/web tests pass, including progressive responses before a blocked provider, immutable snapshots, concurrent request coalescing, failure cooldowns, V3-only quote refresh, stale timestamp preservation, and web/mobile research cancellation/freshness. SDK and web production builds, native TypeScript checks, and Android/iOS Expo exports pass. Browser checks confirm sourced overview/fundamentals remain populated while market refreshes and changing research tabs does not lose data. No real trade was executed for performance testing.

The separate [cleanup audit](data-cleanup.md) lists removed dead/mock prototype code and unused dependencies. Deterministic tests and the explicitly virtual paper account remain.
