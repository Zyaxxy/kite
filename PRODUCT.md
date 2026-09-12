# Product

<!-- uizze:product-schema 1 -->

## Platform

web

## Register

product

## Users

Solana wallet holders (Phantom, Solflare) who want US tokenized equities without a custodian. They arrive with USDC, a connected wallet, and a job: put money to work in a thematic basket or a recurring SIP, then leave. They are not day-trading from this surface.

## Product Purpose

Kite is a non-custodial neo-brokerage on Solana. It lets people mint 1-click thematic stock baskets (MAG7, AI-SEMI) as SPL tokens and run automated USDC SIPs / DCA via Jupiter, with Pyth-priced sentiment on the underlying names. Success is a signed mint or an active SIP in one sitting, with keys never leaving the wallet.

## Positioning

Atomic multi-leg Jupiter swap + basket mint from the user's own wallet — not a brokerage account, not a custodial SIP, not a list of individual stock tickets.

## Operating Context

Devnet wallet session. Routes: Markets (`/`), Thematic Baskets (`/baskets`), Recurring SIPs (`/sip`), stock detail (`/stock/[symbol]`). Mint and SIP submits are currently simulated client-side; prices and headlines come from `@kite/sdk` mock Pyth insights. Hackathon demo under Solana Foundation Tokenized Stocks.

## Capabilities and Constraints

- Connect Phantom/Solflare; auto-connect.
- Scan tokenized US names with price, 24h change, sentiment, one headline.
- Select a curated basket, enter USDC, simulate atomic mint into the wallet.
- Create a daily/weekly/monthly USDC SIP against a basket or single name.
- Stock detail: sentiment gauge + catalyst headlines.
- Do not invent live fills, AUM, customers, fees beyond the zero-management-fee copy already in the app, or onchain proofs that are not implemented.

## Brand Commitments

Name: Kite. Voice: direct, specific, non-custodial. Binding product words: thematic baskets, SIP / DCA, Pyth, Jupiter, USDC, MAG7, AI-SEMI. User confirmed this is a product (operate) surface, not a marketing landing.

Standing visual preference (user-chosen): category-standard dark brokerage executed at [Groww](https://groww.in) craft — list-first markets, scheme holdings you can read, SIP as a 3-field mandate, no dashboard theater.

## Evidence on Hand

`packages/sdk` mock insights (NVDA, AAPL, TSLA, MSFT) and two curated baskets with real weightings. No real customer quotes, press, or screenshots of live mainnet fills. Do not fabricate those.

## Product Principles

- Show the atomic basket, not a generic “invest in the future” hero.
- Custody is a property of the UI: wallet, USDC, and destination token stay visible.
- One primary action per screen; scanning and executing never compete equally.
- Data is the proof; adjectives are not.
- Empty, disconnected, and in-flight states are first-class, not afterthoughts.

## Accessibility & Inclusion

No product-specific mandate was set. Default to WCAG 2.2 AA on text contrast, focus rings, and form labels; honor `prefers-reduced-motion`.

## Anti-references

Generic dark-blue Solana dashboards; gradient indigo/purple heroes; identical metric cards with icon + heading; glass sticky nav with a letter-mark tile; emoji as basket identity; “Powered by X ✨” pills; hero-metric SaaS templates.
