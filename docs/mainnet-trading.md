# Mainnet wallet integration

Kite's actual trading path uses a user-controlled Solana wallet and Jupiter Swap V2. It does not deposit into an Anchor vault, mint replacement stocks, use a server signing key, or hold a user signing key. Recurring collections are signed by a separately configured buyer service. Paper mode is an independent, local simulation using observed market prices.

## Configure the deployment

Copy `apps/web/.env.example` to the deployment environment. Never commit populated secrets.

- `NEXT_PUBLIC_PRIVY_APP_ID`: optional public app identifier. Enable Solana wallets and the deployed origin in the Privy dashboard. The app offers email and wallet login, and creates a Solana embedded wallet for users without a wallet. When absent, Privy remains visibly unavailable and external Solana wallet connection still works.
- Sign-in becomes available when Privy authentication has initialized. Wallet discovery is a separate prerequisite for signing and does not disable login.
- `NEXT_PUBLIC_SOLANA_RPC_URL`: browser-safe Solana mainnet RPC. Restrict any public API key to your deployed origins.
- `NEXT_PUBLIC_SOLANA_WS_URL`: optional matching mainnet WebSocket URL for Privy; otherwise derived from the public HTTP URL.
- `SOLANA_RPC_URL`: server-only mainnet RPC used to read actual balances and mint precision; falls back to the public RPC configuration. Both lookups verify the full mainnet genesis hash.
- `JUPITER_API_KEY`: server-only Jupiter key. Without it actual order preparation and execution return HTTP 503 with an explicit configuration message.
- `KITE_TRADE_SECRET`: required independent server-only HMAC key of at least 32 characters, shared by all deployment instances. It must differ from `JUPITER_API_KEY`. Rotating it invalidates outstanding quotes.

No private wallet key is required. The retired `/api/faucet` returns HTTP 410. `/api/buy-basket` now builds atomic wallet-approved purchases and does not issue synthetic tokens.

## Review, approve, execute

`POST /api/trade/order` accepts `{ inputMint, outputMint, amount, taker, supportedTransactionVersions: [1] }`, where `amount` is a decimal string in the input token's units and the version list must come from the connected wallet's signing capability. Either side can be SOL, USDC, USDT, an issuer-listed market asset, or a token indexed by Jupiter. This enables stock-to-stock swaps without a separate USDC trade. The earlier `{ mint, amount, taker, side }` token-selection shape remains supported with the required V1 capability: `buy` pays USDC and `sell` receives USDC.

`GET /api/tokens?query=...` searches by name, symbol or mint address and combines real Jupiter Tokens V2 results with issuer assets. The selectors show mint addresses and distinguish issuer assets, verified tokens and unverified tokens. A Jupiter index entry does not imply issuer verification or guarantee a routable pool. No discovery prices are seeded. The order server independently resolves token identities, checks issuer halt status on both sides, verifies both mint accounts directly on mainnet, rejects invalid/nonpositive amounts, and checks that Jupiter's returned token pair and input amount match the request. Non-base-token swaps require both issuer catalogs to be available so a provider outage cannot bypass a stock's halt status. Canonical SOL/USDC/USDT pairs can still route during an issuer outage.

An HTTP 200 market snapshot can contain partial metadata. Missing Jupiter token decimals do not block order preparation: the server reads the initialized SPL Token or Token-2022 mint, verifies its owner and account layout, and uses its actual precision for conversion. Successful precision reads are cached briefly; failures are not cached. If the RPC cannot verify the mint, quoting stays disabled with an explicit RPC error rather than guessing decimals.

The server requests `https://api.jup.ag/swap/v2/build` with its API key, validates the encoded swap instructions and composes a V1 transaction. A valid review includes exact token amounts, minimum output, resource limits and a short expiry. A server-authenticated authorization binds the wallet, transaction message digest, block-height limit and expiry. The server rejects slippage above 3% and requires a successful read-only mainnet simulation of the unchanged transaction before returning it. The UI shows this review before offering wallet approval. Missing routes, insufficient balances and unavailable metadata are errors rather than simulated fills.

The approval button invokes a signing method that explicitly supports V1: a compatible Wallet Standard method on web or MWA on Android. Privy sign-in and embedded-wallet discovery remain available but are not assumed to provide V1 signing. The wallet signs on the user's device; the server cannot sign for the user. The client clears a quote whenever its amount, input mint, output mint or wallet changes.

New V1 orders execute through `POST /api/transaction/execute`. It verifies the HMAC, expiry, unchanged message, mainnet identity and Ed25519 signature from the quoted wallet before RPC broadcast. The older `/api/trade/execute` authorization path remains for historical orders. Confirmed trades link to Solscan. Transport errors, timeouts and malformed confirmation responses after submission return `status: Unknown`, never a definite failure. The client locks new quotes until the user acknowledges checking their wallet activity, with a direct Solscan link. An attempt identifier is persisted before dispatch in localStorage on web and AsyncStorage on native mobile, so reloads, restarts and web tab changes retain the check. Storage failure prevents dispatch; the user-facing client does not persist signed bytes. The recurring executor separately persists its own signed intent for exact-transaction recovery.

## Amounts, balances and corporate actions

Transaction quantities are exact raw token units divided by the mint's decimals; decimal input is converted with integer arithmetic. Actual trade inputs and review notes identify token units. They must not be interpreted as underlying share counts. Jupiter's native SOL mint identifier routes native SOL with wrapping and unwrapping handled by the assembled swap transaction.

The portfolio reads every standard SPL and Token-2022 account owned by the wallet, aggregates with exact integers, excludes frozen amounts from spending and keeps the RPC's adjusted UI quantities separate from raw transaction units. Wallet balances load independently of issuer catalogs and token-search metadata; enrichment failure preserves the real mint and balance with unavailable metadata. An RPC failure remains an error rather than an empty wallet. This preserves Token-2022 scaled balances after dividends or stock splits. Jupiter Tokens V2 does not establish its scaled-versus-raw price basis in its public schema, so the actual portfolio deliberately leaves xStocks fiat valuation unavailable instead of multiplying incompatible quantities and prices. Non-scaled holdings with verified prices may contribute a clearly labeled subtotal; a total is unavailable when any holding is unpriced. Cost basis and realized profit are unavailable from balances alone.

Swaps and atomic baskets use Jupiter `/swap/v2/build`, exact integer allocation, wallet-owned output accounts and full-transaction simulation. New transactions are V1-only, require live network activation and signing-method support, use no ALTs and never silently split a basket. Historical V0 transactions remain readable for recovery. Recurring investing composes permitted collection and owner-directed stock delivery in one transaction; the official Subscriptions grant still trusts the buyer with withdrawals. See [execution architecture](sdk-architecture-and-improvements.md) and [recurring investing operations](recurring-investing-operations.md). Mainnet token availability is determined by the issuer and the live router, not by a static demo token list.

See [wallet-first swaps](wallet-swaps.md) for balance selection, exact Max behavior and pending execution guards, and [mobile setup](../apps/mobile/README.md) for Android MWA.

## Verification

Build the SDK with `pnpm build:sdk`, then run `node --experimental-strip-types --test packages/sdk/test/*.test.cjs apps/web/tests/*.test.mjs` on Node 24. These tests create ephemeral local transactions without sending them. They cover exact decimal conversion, precision and range rejection, arbitrary token pairs, issuer halt precedence, required signatures, altered-message rejection, invalid authorization keys, quote expiry and wallet identity changes. Check web types with `pnpm --filter @kite/web exec tsc --noEmit`.

Actual transactions were not submitted during development verification. Verify live V1 activation, the selected wallet signing method, production RPC/Jupiter configuration and an owner-controlled funded wallet for the final sign-and-execute interaction. Privy sign-in alone does not imply V1 signing compatibility.

## Official references

- [Privy Solana setup and signing](https://docs.privy.io/recipes/solana/getting-started-with-privy-and-solana)
- [Jupiter Swap V2 build](https://developers.jup.ag/docs/api-reference/swap/build)
- [Jupiter Tokens V2 search](https://developers.jup.ag/docs/tokens/token-information)
- [Solana scaled UI amount integration](https://solana.com/docs/tokens/extensions/scaled-ui-amount/integration-guide)
- [xStocks multipliers and corporate actions](https://docs.xstocks.fi/developers/multipliers)
