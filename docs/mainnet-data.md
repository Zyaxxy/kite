# Mainnet market data and paper trading

The production SDK entry point exports live market discovery, paper accounting and direct-wallet trading contracts. The old Anchor/devnet prototype is retained behind `packages/sdk/src/legacy-devnet.ts`; it is not part of the active web/mobile SDK interface. No vault, mint authority or server wallet is used for mainnet trades.

## Data sources

- [xStocks public API](https://docs.xstocks.fi/apis/openapi/assets): `https://api.xstocks.fi/api/v2/public/assets?network=Solana&page=0&pageSize=100`. Every page is fetched, only Solana deployments are admitted, and mint addresses come directly from the issuer. The API needs no key for public data.
- [PreStocks products](https://prestocks.com/products): the issuer's public `/api/metrics` response supplies its `splMint` catalog and current observed token prices. Its products page supplies public server-rendered names, logos, decimals and availability metadata. Kite parses JSON only and never executes third-party scripts. This website interface is not a versioned developer API, so schema failures disable affected trading and surface unavailable data. Retired/converting products with `skipPipeline` or `hideOnPrestocksApi` are discoverable but cannot be bought through Kite.
- [Jupiter Tokens V2](https://developers.jup.ag/docs/tokens/token-information): `/tokens/v2/search?query=<issuer-mints>` batches at most 100 exact issuer mints. Kite preserves issuer identity and enriches it with current token price, decimals, 24-hour percentage change, buy plus sell volume and liquidity. Unknown values stay `null`. Jupiter response rows not present in the issuer catalogs are ignored.
- [xStocks quantity/multiplier guide](https://docs.xstocks.fi/developers): Solana xStocks use Token-2022 scaled balances. Displayed share quantities and raw token units differ after corporate actions. Paper holdings are explicitly simulated units at observed market prices; actual transaction amounts use the token's exact raw-unit precision. Do not present raw wallet balances as underlying shares without applying the issuer/onchain multiplier.

## Configuration

`JUPITER_API_KEY` is a server-only key from the [Jupiter developer portal](https://developers.jup.ag/portal). With it the SDK uses `https://api.jup.ag`. Without it, market reads attempt Jupiter's public `https://lite-api.jup.ag` compatibility endpoint, verified on 12 September 2026. Availability/rate limits of that legacy endpoint are not guaranteed; set a key for production. The key must never use a `NEXT_PUBLIC_` or `EXPO_PUBLIC_` prefix.

`GET /api/markets` serves both clients from the web backend. Issuer catalog metadata is cached for ten minutes and copied before enrichment; prices are fetched independently. Catalog pages and exact-mint quote batches use at most three concurrent requests per provider. The snapshot cache lasts 30 seconds (10 seconds for complete outages), coalesces concurrent requests, and preserves each batch's source observation timestamps. HTTP 503 includes the same snapshot shape with `status: unavailable`; partial provider success returns HTTP 200 with `status: partial` and warnings. Clients should refresh at least once per minute and show missing/stale values explicitly.

## Paper account semantics

Paper mode starts with an explicitly virtual USD balance; it does not invent market prices, holdings, fills or return history. A buy/sell uses a positive issuer-verified observed price no older than two minutes, checks buying power/holdings and returns a new account. Basket allocation definitions contain no mint addresses: their members are resolved from the current catalog, and missing members disable the basket without silently changing its weights. Basket orders apply atomically to local paper state. Paper fills do not simulate real slippage, route liquidity or fees.

Scheduled paper plans run while the app is open. One due installment uses the current observed price; missed periods are never backfilled with fabricated historical executions. There is no claim of background/mainnet automation. A failed installment retains its due date and error for a later retry. Persisted accounts must pass `parsePaperAccount` before use; unreadable state must not silently reset the user's account.

There is no price-history, sentiment or news fallback. Add such surfaces only when a genuine API supplies them. Never turn 24-hour percentage changes into synthetic historical charts.

## Verification

Run `node node_modules/typescript/bin/tsc -p packages/sdk/tsconfig.json` and `node --test packages/sdk/test/*.test.cjs`. Tests cover catalog pagination, issuer mint allowlisting, partial outages, unknown metadata, basket completeness, account immutability, overspending/overselling, stale prices, unavailable valuation, persisted state and recurring-plan dates.
