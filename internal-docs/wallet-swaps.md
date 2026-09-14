# Wallet holdings and mainnet swaps

The swap screen starts with **Your tokens**, including native SOL and funded SPL and Token-2022 accounts. Token names, icons, values and mint addresses appear together. **All tokens** remains available for discovering a destination. Half and Max operate on exact decimal strings; frozen funds are excluded and SOL Max retains a conservative 0.01 SOL buffer. This is a buffer, not a fee estimate. The route and wallet confirm actual network fees and account rent.

## Wallet API

`GET /api/portfolio?wallet=<base58>` reads both token programs directly from a verified Solana mainnet RPC. Standard `getTokenAccountsByOwner` returns all matching accounts and has no pagination parameter. Multiple accounts for one mint are aggregated with bigint. Token-2022 and non-associated token accounts are included. A failed or malformed account response does not turn into zero holdings.

Wallet holdings no longer depend on the issuer catalog being available. Unknown tokens retain their real mint, precision and balance; metadata and prices can be unavailable. Mainnet mint/account precision establishes amounts. Tokens with more than 18 decimals remain visible but cannot be passed through Kite's current swap amount converter. Token metadata uses Jupiter Tokens V2 in batches of at most 100 mints, three batches at a time, with a six-second overall deadline. Individual metadata results are cached for one minute and simultaneous requests for one wallet share the same in-flight read. All response bodies use private, no-store caching.

Native and wrapped SOL appear in one SOL holding. `solBalance` remains the native balance. The swap source may need an associated token account or an unwrap, depending on the route; seeing a balance is not a guarantee that a specific route can spend it.

Additional shared holding fields are `decimals`, `rawAmount`, `spendableAmount`, `frozenAmount`, `logoUrl`, `verified`, `source`, `tradingHalted`, `native`, `tokenProgram` and `marketAsset`. They are optional in the SDK type for compatibility with older servers; the new server populates them. `amount` and `spendableAmount` are decimalized raw token units. `displayAmount` is the RPC's potentially corporate-action-adjusted amount. Never interchange them.

xStocks valuations remain unavailable while the feed's raw-versus-adjusted basis cannot be established. No underlying equity price is substituted. Unpriced holdings are shown alongside the verified priced subtotal. A balance alone provides neither cost basis nor profit.

## Approval and execution

Both web and native clients refresh the selected wallet balance before requesting a quote. The server independently resolves both mint precisions and issuer halt state. Orders above a 3% slippage limit are rejected. A mainnet simulation must pass before an order can be signed. Simulation preserves the original blockhash and transaction bytes, and uses `sigVerify: false` because the user has not signed yet. A passing simulation does not guarantee a future fill.

A separate server-only `KITE_TRADE_SECRET` of at least 32 characters is required. The Jupiter API key is not used as an authorization-secret fallback. A quote authorization binds the wallet, request ID, expiry and exact serialized transaction message. Execution requires a cryptographically valid signature from the bound wallet and rejects a changed message. Request bodies are byte-bounded and the deployment middleware applies shared request controls.

Pending execution identities persist across browser reloads and native app restarts. Signed transaction bytes and private keys are never persisted by Kite. Failed persistence prevents submission. Unknown transport or confirmation results never trigger an automatic retry or silently expire; the user must check wallet activity before another trade.

## Verification

Automated tests cover account aggregation above floating-point precision, frozen accounts, Token-2022, 205-token metadata batching, concurrent read coalescing, outages, unverified metadata, invalid mainnet genesis, scaled valuations, exact Max amounts, missing authorization secrets, slippage limits, simulation failures and unchanged-message signature authorization. Browser and native wallet signing still require a real connected wallet for end-to-end validation; automated checks do not execute user funds.

Sources: [Solana Token-2022 wallet guide](https://www.solana-program.com/docs/token-2022/wallet), [Jupiter Tokens V2 information](https://developers.jup.ag/docs/tokens/token-information), [Jupiter managed order and execute](https://developers.jup.ag/docs/swap/order-and-execute). The comfortable token rows and restrained panel structure follow the installed design-taste skill and the [coss ui reference](https://coss.com/ui), preserving Kite's existing forest and lime palette.
