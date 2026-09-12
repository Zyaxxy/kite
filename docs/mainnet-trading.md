# Mainnet wallet integration

Kite's actual trading path uses a user-controlled Solana wallet and Jupiter Swap V2. It does not deposit into an Anchor vault, mint replacement stocks, use a server signing key, or execute unattended trades. Paper mode is an independent, local simulation using observed market prices.

## Configure the deployment

Copy `apps/web/.env.example` to the deployment environment. Never commit populated secrets.

- `NEXT_PUBLIC_PRIVY_APP_ID`: optional public app identifier. Enable Solana wallets and the deployed origin in the Privy dashboard. The app offers email and wallet login, and creates a Solana embedded wallet for users without a wallet. When absent, Privy remains visibly unavailable and external Solana wallet connection still works.
- Sign-in becomes available when Privy authentication has initialized. Wallet discovery is a separate prerequisite for signing and does not disable login.
- `NEXT_PUBLIC_SOLANA_RPC_URL`: browser-safe Solana mainnet RPC. Restrict any public API key to your deployed origins.
- `NEXT_PUBLIC_SOLANA_WS_URL`: optional matching mainnet WebSocket URL for Privy; otherwise derived from the public HTTP URL.
- `SOLANA_RPC_URL`: server-only mainnet RPC used to read actual balances and mint precision; falls back to the public RPC configuration. Both lookups verify the full mainnet genesis hash.
- `JUPITER_API_KEY`: server-only Jupiter key. Without it actual order preparation and execution return HTTP 503 with an explicit configuration message.
- `KITE_TRADE_SECRET`: optional server-only HMAC key shared by all deployment instances. If omitted, order authorization uses `JUPITER_API_KEY`. Rotating either active authorization key invalidates outstanding quotes.

No private wallet key is required. The retired `/api/faucet` and `/api/buy-basket` routes return HTTP 410 and no longer load a local authority key or issue tokens.

## Review, approve, execute

`POST /api/trade/order` accepts `{ mint, amount, taker, side }`, where `amount` is a decimal string and `side` is `buy` or `sell`. Buy input is mainnet USDC; sell input is the selected asset. Both directions use the current issuer catalog as a mint allowlist, check issuer halt status, verify decimals directly from the mainnet mint account, reject invalid/nonpositive amounts, and validate the provider's returned token pair and input amount.

An HTTP 200 market snapshot can contain partial metadata. Missing Jupiter token decimals do not block order preparation: the server reads the initialized SPL Token or Token-2022 mint, verifies its owner and account layout, and uses its actual precision for conversion. Successful precision reads are cached briefly; failures are not cached. If the RPC cannot verify the mint, quoting stays disabled with an explicit RPC error rather than guessing decimals.

The server requests `https://api.jup.ag/swap/v2/order` with its API key. A valid route returns the unsigned transaction, exact token amounts, fees, slippage, route and a short quote expiry. A server-authenticated authorization binds the order ID, wallet, transaction message digest and expiry. The UI shows this review before offering wallet approval. Missing routes, insufficient balances and unavailable metadata are errors rather than simulated fills.

The approval button invokes Privy's Solana signing UI or the connected Wallet Adapter's `signTransaction`. Privy is explicitly configured to display its wallet confirmation. The wallet signs on the user's device; the server cannot sign for the user. The client clears a quote whenever its amount, asset, direction or wallet changes.

`POST /api/trade/execute` accepts the signed transaction and the authorization. It verifies the HMAC, expiry, unchanged transaction message and an Ed25519 signature from the quoted wallet before passing the signed transaction to Jupiter `/execute`. Jupiter returns confirmation and the signature; confirmed trades link to Solscan. Transport errors, timeouts and malformed confirmation responses after submission return `status: Unknown`, never a definite failure. The client locks new quotes until the user acknowledges checking their wallet activity, with a direct Solscan link. An attempt identifier is kept in session storage so reloads and navigation in the same tab retain the check; signed transactions are never stored or retried.

## Amounts, balances and corporate actions

Transaction quantities are exact raw token units divided by the mint's decimals; decimal input is converted with integer arithmetic. Actual trade fields and quote summaries explicitly label raw units. They must not be interpreted as underlying share counts.

The portfolio reads standard SPL and Token-2022 accounts, sums balances, and displays the RPC's `uiAmountString` separately from raw transaction units. Both issuer catalogs must be available before a complete portfolio is returned; an individual issuer outage returns HTTP 503 instead of silently hiding its holdings or showing an empty balance. This preserves Token-2022 scaled balances after dividends or stock splits. Jupiter Tokens V2 does not establish its scaled-versus-raw price basis in its public schema, so the actual portfolio deliberately leaves xStocks fiat valuation unavailable instead of multiplying incompatible quantities and prices. Non-scaled holdings with verified prices may contribute a clearly labeled subtotal; a total is unavailable when any holding is unpriced. Cost basis and realized profit are unavailable from balances alone.

Actual recurring investments and atomic basket execution are not connected. The interface offers individual wallet-approved swaps; recurring plans and basket allocation demonstrations use paper mode. Mainnet token availability is determined by the issuer and the live router, not by a static demo token list.

## Verification

Run `node --experimental-strip-types --test apps/web/tests/trading.test.mjs` on Node 24. These tests create ephemeral local transactions without sending them. They cover exact decimal conversion, precision and range rejection, required signatures, altered-message rejection, invalid authorization keys, quote expiry and wallet identity changes. Build the SDK before checking web types: `pnpm build:sdk`, then `pnpm --filter @kite/web exec tsc --noEmit`.

Actual transactions were not submitted during development verification. A configured Privy app, Jupiter key and funded user wallet are needed to verify the final sign-and-execute interaction in the deployment.

## Official references

- [Privy Solana setup and signing](https://docs.privy.io/recipes/solana/getting-started-with-privy-and-solana)
- [Jupiter Swap V2 order and execute](https://developers.jup.ag/docs/swap/order-and-execute)
- [Solana scaled UI amount integration](https://solana.com/docs/tokens/extensions/scaled-ui-amount/integration-guide)
- [xStocks multipliers and corporate actions](https://docs.xstocks.fi/developers/multipliers)
