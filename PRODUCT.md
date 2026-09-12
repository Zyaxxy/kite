# Kite product contract

Kite helps people discover tokenized equity themes, practice allocations, and trade from their own Solana wallets.

## Current modes

- Paper: $10,000 starting virtual USD, no seeded holdings or history; reference-price buys and sells, basket allocations, watchlist, activity and recurring paper plans stored locally.
- Actual: mainnet portfolio reads and Jupiter swaps approved by a user wallet, with optional Privy sign-in. Assets are held directly by the wallet.
- Mobile actual trading: user-initiated handoff to the configured web Privy / wallet flow.

## Data

Issuer-confirmed Solana mint catalogs from xStocks and PreStocks; Jupiter market metadata and price observations. Discover the full catalog. Unknown data remains unavailable. Paused and reference-only products stay visible with trading blocked. No fabricated charts, financial statements, news, sentiment, returns, fills or customer metrics.

## Baskets and recurring plans

Baskets are curated allocations into individual assets, not Kite-issued basket tokens. The legacy Anchor vault does not participate in mainnet. Mainnet basket swaps require individual reviews. Paper recurring plans run while the application is open; unattended actual DCA is not implemented and must not be implied.

## Design

Use the shared forest / lime Kite system with geometric symbols and no emoji. Provide consistent web and mobile navigation, forms, reviews, error states and empty states. This provisional system awaits the user’s named Stitch reference for exact matching; do not reuse the superseded Groww direction.
