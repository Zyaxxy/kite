# Why Solana and tokenized equities

## Why tokenized equities

Tokenized equities connect recognizable company exposure with programmable, wallet-held assets. They make it possible to discover, transfer, compose, and automate investment workflows using the same settlement network and token accounts instead of introducing a separate account system for every product feature.

Kite does not treat a token symbol as proof of an underlying share count. It keeps issuer identity, token precision, scaled balances, corporate-action multipliers, and executable token prices distinct so users are not given false precision.

## Why Solana

- **User-controlled ownership:** SPL and Token-2022 assets can be held directly in a user's wallet.
- **Composable settlement:** Jupiter can route swaps between funding tokens and issuer assets, including multi-leg basket purchases.
- **Programmable permissions:** the official Solana Subscriptions program can express bounded, finite recurring spending permissions without a Kite custody vault.
- **Fast confirmation and low transaction overhead:** the network is suitable for frequent small investment actions, subject to live fees, capacity, route liquidity, and account limits.
- **One ecosystem across devices:** web wallets and Solana Mobile Wallet Adapter provide a shared non-custodial model.

## Why Jupiter

Kite uses Jupiter Swap V2 to find and build executable routes. Kite still validates the route independently: token pair, input amount, slippage, mint precision, issuer trading status, wallet-owned accounts, simulation, and the exact transaction message signed by the user.

## Why no custom vault or synthetic basket token

Kite's product value is the experience and orchestration layer: discovery, research, allocation, transaction composition, and recurring-plan controls. Keeping holdings in the user's wallet makes the custody boundary legible and avoids introducing a Kite-controlled pool or a second token whose relationship to the underlying basket would need to be explained and maintained.

The tradeoff is that a basket is an atomic set of individual swaps, not a single rebalancing fund. Liquidity, availability, network limits, and issuer rules can prevent a basket from executing.
