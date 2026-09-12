# Kite mobile

The Expo app shares Kite's live mainnet catalogs, paper execution, portfolio valuation and recurring-plan rules with the web app through `@kite/sdk`.

## Run

1. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_BASE_URL` to the running Kite web origin. A physical phone needs a reachable LAN address or HTTPS deployment. Provider credentials belong on the web server.
2. Optionally set `EXPO_PUBLIC_WEB_URL` to the origin used for Privy sign-in and actual mainnet trading. It defaults to the API origin.
3. From the workspace root, run `pnpm build:sdk`, then `pnpm dev:mobile`.

## Behavior

- Home, Explore, watchlist, baskets, stock details, paper portfolio/orders, recurring paper plans, and settings use one shared visual system.
- Market data comes from `/api/markets`, including the full available xStocks and PreStocks issuer catalogs. Missing prices stay unavailable; there are no sample candles, invented returns or fake news.
- A clearly labeled virtual USD starting balance supports paper trading. Account state and watchlist persist with AsyncStorage on this device. Invalid saved account data pauses paper execution until the user resets it.
- Paper plans run at most one due installment when the app is open with fresh market data. They are not onchain or background automation.
- Actual trading is a user-initiated handoff to the matching web asset page and Privy sign-in. No real order is signed automatically. Android users with a native development build (`pnpm --filter @kite/mobile android`) may also authorize a compatible Solana Mobile Wallet on mainnet; authorization alone does not execute a trade. Expo Go does not include the wallet native module; the app loads it only when supported and requested.
- No mainnet vault is required by the frontend.
