# Product

<!-- impeccable:product-schema 1 -->

Kite's shared product brief for web and native mobile. Refreshed against the current checkout and project instructions on 8 October 2026, including creator baskets, advisory route checks and single-transaction/Jito purchase routing. This describes implemented behavior and product commitments, not deployment readiness or an investment offer.

## Platform

adaptive

## Users

- **Primary:** serious investors researching tokenized equities, choosing understandable stock allocations, and reviewing wallet-controlled purchases. They need useful financial data and explicit execution terms, not abstract crypto messaging.
- **Basket creators:** users building private allocations; invited creators can publish immutable versions after wallet-signed review.
- **Evaluators:** hackathon judges and product reviewers who need to understand the product, the vaultless recurring mechanism, and which demonstrations use test tokens without prior protocol knowledge.

## Product Purpose

Kite is a self-custody interface for tokenized equities and ETFs on Solana. It brings market discovery, company research, individual purchases, basket allocations, portfolio visibility, and configurable recurring-investment demonstrations into one product.

Success means users can understand an asset and its data coverage, inspect an allocation, review the exact spending terms, and distinguish a confirmed purchase from a simulation or pending submission. No conversion target, return benchmark, or customer adoption metric is established by this brief.

## Positioning

Kite is a premium, data-led investing product. Lead with tokenized stocks, research, basket purchases, and understandable recurring investing rather than vague claims such as “ideas on chain.”

The central differentiator to explain is **vaultless automated DCA/SIP**: a user configures a finite schedule and bounded spending permission instead of depositing into a Kite custodial investment vault. The implemented wallet-recurring flow is a **devnet test-token demonstration** using official Solana Subscriptions and Kite Guard. **Mainnet recurring is disabled.** This distinction must accompany the claim wherever the feature is presented.

For mainnet spot purchases, individual issuer tokens settle to the owner's wallet accounts; a basket is an allocation definition, not a Kite-issued synthetic token. Self-custody does not remove issuer, market, network, liquidity, or execution risk. Do not imply regulatory approval, direct ownership of company shares, no counterparty risk, guaranteed fills, or guaranteed returns.

## Operating Context

Web and native mobile share `@kite/sdk` business rules, transaction contracts, market data, research, and paper accounting. Their local paper records do not sync between devices.

| Experience                     | Network and funding                           | Current scope                                                                                      |
| ------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Paper practice                 | Device-local virtual USD                      | Starts with $10,000 and no seeded holdings or history; no on-chain trade.                          |
| Wallet spot purchases          | Solana mainnet                                | Wallet-reviewed single-stock swaps and basket orders, subject to fresh route and execution checks. |
| Wallet recurring demonstration | Solana devnet, test KUSD and test stock mints | Finite delegated schedules; not mainnet stock investing or real-market swaps.                      |

- **Web:** Next.js App Router, Tailwind, Privy and Solana Wallet Adapter. External-wallet signing and configured Privy embedded signing are distinct integrations.
- **Native mobile:** Expo/React Native with native stack navigation, system back gestures, and Explore, Subscriptions, Portfolio and Activity tabs. Android uses on-device Mobile Wallet Adapter. iOS and Expo web support browsing and paper practice, **not native wallet signing**; they do not redirect trading or subscription management to a browser. Expo Go lacks the required Android native wallet module.
- **Evaluation:** the project originated in the Solana tokenized stocks hackathon. Historical submission dates, liquidity audits and test totals are not current rollout evidence.
- **Operations:** mainnet uses server `SOLANA_RPC_URL`; devnet recurring uses `KITE_RECURRING_RPC_URL`. Each flow independently verifies the correct genesis. Public client configuration is separate from privileged server credentials.

### Pages and Workflows

- `/` and `/landing`: product introduction, observed market data, research previews, basket allocations and a clearly labeled recurring illustration.
- `/app`, `/markets`, `/stock/[symbol]`, `/watchlist`: discovery, issuer filters, asset research and saved assets.
- `/baskets`, `/basket/[id]`, `/basket/builder`, `/creators`: curated and published allocations, purchase review, private drafts and creator publishing/activity.
- `/portfolio`, `/orders`, `/sip`: holdings, locally recorded activity and paper/devnet recurring plans.
- `/settings`, `/terms`, `/privacy`: account, wallet, mode, cache and policy controls.

## Capabilities and Constraints

### Market Data and Stock Research

- Sources include xStocks, PreStocks, Backpack Securities, Jupiter, Yahoo Finance, Wikipedia, Google News RSS and Pyth reference feeds. Issuer identity, token market prices and underlying share references are separate observations.
- Discovery-only listings are not verified tradable mints. Missing, halted, unpriced or unsupported constituents block purchase preparation. Do not hard-code catalog counts or historical liquidity results into product claims.
- Research has five areas: overview, technicals, fundamentals, news and events. History, indicators, reported financials, descriptions and events appear only where upstream coverage exists; company/share research is not a token execution-price forecast.
- Market breadth, volume and movers derive from observed data and its coverage, not fabricated sentiment. Liquidity and price-divergence filters do not prove that an asset is safe or a route will fill.
- Preserve unavailable, stale, partial and provider-error states, with source and timing where available. Never supply synthetic prices, charts, news, balances or activity as production fallbacks.

### Basket Route Checks

- Users can check curated, published creator or private builder allocations using **USDC, USDT or SOL**, a funding amount and selected slippage. The check reports each constituent's observed route, probe amount, observation time and expiry; separately available pool-liquidity data is not a fill guarantee.
- Checks use cached, rounded-up funding-token amount bands. SOL probes are quantities of SOL, not estimated dollars. Results distinguish route found, no route at the probe amount, amount/slippage failure, route account limit, unavailable asset and unknown availability. Provider failures must not become claims of insufficient liquidity.
- Basket cards expose cached coverage and stale/unknown states. The “Consistent routes” filter requires three successful observations at least five minutes apart for every constituent and funding token, with all observations currently fresh. Reference probes do not establish that every purchase amount or complete basket will fit.
- Route checks are advisory and return no transaction instructions or purchase authorization. They do not certify wallet compatibility, supported token extensions, full transaction fit or future execution. Refresh occurs while requests reach the application, not through a guaranteed continuous market monitor.
- Exact purchase review builds fresh wallet-specific instructions for the actual allocation and funding amount, validates transaction limits and simulates the prepared transactions. It determines whether the order uses one transaction or a Jito bundle. A failed constituent is never silently omitted; guidance may suggest another funding token, amount, basket or later retry without automatically raising slippage.

### Mainnet Trading and Basket Execution

- New Jupiter Swap V2 orders negotiate **V1 or V0** from the actual signing method's advertised capabilities and the configured mainnet RPC. V1 requires verified feature activation; a wallet name never establishes support. Privy embedded signing currently advertises V0 only.
- V1 uses static accounts, **no ALTs**, and at most **4,096 serialized bytes / 64 runtime accounts**. V0 must fit **1,232 serialized bytes / 64 runtime accounts**; only Jupiter-referenced ALTs with verified mainnet owner, active state and contents may be used. ALTs do not expand runtime account capacity.
- Every basket first attempts one complete transaction with no Jito tip. Routing depends on actual bytes and accounts, not asset count. Only typed capacity failures may select **two to five ordered transactions** through Jito; complete swap legs remain intact. Invalid instructions, signer errors and simulation failures do not authorize partitioning.
- Review funding debits and maximum budgets, allocations, minimum outputs, fees, transaction version/count and any tip before signing. An ordinary single transaction is atomic; a multi-transaction bundle is **not unconditionally all-or-nothing** because skipped/uncled-block rebroadcast can produce independent execution. There is no mainnet cross-transaction Guard.
- A received bundle is pending. Success requires every expected signature to have successful confirmed/finalized receipts in the same slot. Per-transaction simulation is not a stateful simulation of the whole bundle or a guarantee of a future fill.
- Persist the reviewed signed payload before submission. Recover lost responses using the original authorization and status checks; do not individually broadcast bundle legs or create a replacement purchase while execution is uncertain. Wallet batching does not guarantee one approval prompt in every wallet.

Protocol details and review requirements: [mainnet basket execution](docs/jito-basket-execution.md).

### Basket Definitions and Creator Publishing

- Baskets are weights across individual assets. BigInt Largest Remainder allocation conserves the specified funding units across weights totaling **10,000 basis points**. Outputs settle to owner wallet accounts.
- The curated catalog is defined in the SDK. The builder accepts **2–12 assets** and preserves private device drafts. This range is a definition limit, not a guarantee that every live route fits one transaction or a bounded bundle.
- Public publishing requires a configured multi-use creator invitation, a wallet signature over the exact allocation, an expiring origin-bound challenge and a one-use nonce. Durable Redis storage keeps immutable published versions and confirmed activity; publishing fails closed without it.
- The creator workflow is build and balance an allocation, save a private draft, review and sign publication with an invite, then share its immutable published basket. Route availability is advisory and does not prevent saving or publishing an allocation; each buyer's exact purchase review independently determines executability. Published IDs resolve to server-controlled allocations and reject client overrides.
- The web creator studio shows the connected publishing wallet's baskets and confirmed activity, with basket creation and mainnet purchase Blink sharing. Shared SDK contracts also let native consumers resolve published baskets; do not imply that every web authoring or studio control already exists on native.
- Creator volume comes from confirmed, deduplicated mainnet USDC receipts, excludes self-referrals, and is separate from devnet test units. Page views, quotes and unsigned Actions are not investments.
- The point rule is one point per complete $100 of mainnet USDC volume plus 100 per active mainnet subscriber. Mainnet recurring remains disabled; devnet subscriptions earn no mainnet points. Do not invent subscriber or volume totals.

### Paper Practice and Recurring Plans

- Paper starts with **$10,000 virtual cash**, zero holdings and no fabricated history. Single-stock trades, stock-to-stock swaps and basket purchases use recent observed prices and local buying-power/holding checks.
- Paper records stay device-local. Simulated results exclude real network fees, slippage, liquidity effects and corporate-action effects; they are not execution forecasts.
- Paper schedules support daily, weekly, biweekly and calendar-month intervals. The monthly paper calculation advances a UTC month and clamps to that month's last day.
- Paper recurring runs at most one due installment per plan while the application is open, at the current observed price. It does not backfill missed intervals or fabricate backdated fills. This local scheduler is separate from the wallet-recurring protocol.

### Wallet Recurring: Devnet Only

- The current Guard collects **test KUSD** through official Solana Subscriptions and mints test stock outputs to owner wallet accounts. It is not a mainnet equity purchase, a Raydium/AMM swap implementation, or a promise of real-market stock delivery.
- Web, Android and the subscription Action share recurring preparation. Wallet cadences are daily, weekly, biweekly or **every 30 days**, with finite installment counts and total permission duration bounded to one year. The 30-day interval is not a calendar month.
- Plan approval binds the owner, funding authority, amount, schedule, allocation, expiry and owner destinations. Guard's current entrypoints are `create_plan`, `execute_swap`, `close_plan`; its plan seeds are `[b"plan_v2", owner, funding_mint, nonce_u64_le]`. Current source/IDL, mint authorities and protocol simulation take precedence over historical ABI fixtures.
- Delegation authorizes the Guard plan, not unrestricted spending by the scheduler wallet. Setup must fit one atomic transaction; never split delegation from its Guard to bypass limits. App V1 use requires actual wallet support and devnet feature activation.
- Users can review and close plans with wallet approval. Lost setup/cancellation responses retain the exact signed submission and block duplicate setup while unresolved.
- Both collector methods require dedicated bearer authorization. Production collection requires durable Redis leases and signed-transaction journals, bounded work, per-plan failure isolation and unknown-submission recovery. Count confirmed installments only. All fee-payer keys and executor credentials stay server-only.
- Source-defined program IDs do not establish on-chain readiness. Verify the deployed program, provisioned test mints, mint authorities and create/collect/close behavior independently; do not present an old audit's findings as current verification.

Operations and rollout limits: [Actions and collector](docs/actions-and-collector.md).

### Actions and Blinks

- `/api/actions/buy-baskets/{id}` prepares an unsigned **V0 mainnet USDC** purchase only when the complete basket fits one transaction. A bundle-required order links back to app checkout instead of returning a partial purchase.
- `/api/actions/baskets/{id}` remains an unsigned **V0 devnet test-token subscription** Action. Oversized setup is rejected rather than split.
- Both resolve server-controlled curated or immutable creator allocations and advertise their network explicitly. `actions.json` maps basket pages to the one-time purchase Action; explicit subscription URLs remain devnet.
- An unsigned Action is not confirmed activity. Public Actions CORS does not authorize privileged APIs. Social-feed rendering depends on the compatible client's registry, network support and deployed-origin configuration.

### Portfolio, Activity and Native Signing

- Mainnet valuation uses actual wallet token balances and available prices; an unavailable quote must not silently become zero. A balance read does not establish an imported wallet's full cost basis or investment return.
- Paper portfolios track virtual cash, recorded positions, cost basis and simulated results. Watchlists support saved asset discovery; web paper orders support CSV export.
- Wallet receipts and paper fills recorded on-device are not an exhaustive chain history.
- Android authorizations and SecureStore records are separate for mainnet and devnet; restored capabilities are rechecked. Basket batches sign up to five reviewed messages in one MWA session before server verification/submission. Unsupported signing never silently falls back to a browser.
- A physical phone needs a reachable API origin; `localhost` refers to the phone. Native development/release builds and actual device signing need separate verification.

Platform requirements: [mobile setup](apps/mobile/README.md).

### Unverified or Undecided Scope

- This brief does not establish commercial pricing, supported jurisdictions, issuer-specific eligibility, brokerage/licensing status, or an approved mainnet recurring launch date. Verify those terms before making public claims.
- Funded Jito V1 transport/execution, physical Android signing, funded devnet installments, public Blink rendering and production configuration remain separate rollout checks; local builds, fixtures and RPC feature activation do not prove them.
- Do not deploy contracts, request faucet funds, fund wallets or submit trades as incidental validation. Those actions require explicit authorization and recorded scope.

## Brand Commitments

- Preserve the Kite name and the existing forest/cream/lime identity across web and mobile. Financial numbers use tabular formatting; iconography is geometric, with no emoji.
- Communicate calmly and precisely: name the asset, data source, allocation, funding amount, schedule and network. Premium presentation must make the financial product easier to understand, including for judges.
- Kimia and Griffin are user-supplied presentation references, not affiliates, customer proof or templates to copy verbatim. Product previews must use real observations or conspicuously labeled illustrations.
- Animation should explain product mechanics without implying fabricated price movements, returns or confirmed activity. The approved landing treatment and GSAP behavior are documented in [landing design](docs/landing-design.md); visual recipes stay there rather than becoming product truth.

## Evidence on Hand

- **Confirmed brief and constraints:** the user's serious-investor positioning and vaultless DCA/SIP priority, plus [AGENTS.md](AGENTS.md).
- **Current implementation:** [shared SDK](packages/sdk/src/index.ts), [builder validation](packages/sdk/src/basket/custom.ts), [route-check contract and guidance](packages/sdk/src/basket/route-health.ts), [route-check presentation](apps/web/components/kite/RouteHealth.tsx), [creator studio](apps/web/components/kite/CreatorDashboard.tsx), [paper accounting/scheduler](packages/sdk/src/paper.ts), [recurring request validation](apps/web/lib/server/recurring-devnet-policy.ts) and [current Guard entrypoints](packages/anchor/programs/kite_guard/src/lib.rs).
- **Execution and operations:** [mainnet basket execution](docs/jito-basket-execution.md), [Actions and collector](docs/actions-and-collector.md), [upgrade and verification](docs/production-upgrade.md) and [mobile setup](apps/mobile/README.md). Current source, generated contracts and project instructions take precedence when older architecture, roadmap or audit documents disagree.
- **Presentation assets:** [landing implementation](apps/web/components/kite/Landing.tsx), the user's [DollarAbstract artwork](apps/web/public/images/landing/DollarAbstract.png), its [optimized hero asset](apps/web/public/images/landing/dollar-abstract.webp), user-supplied `Griffin.mp4`, `kimia.mp4` and `wallstreet.png` references, and [landing direction/verification notes](docs/landing-design.md).
- **Local verification evidence:** recorded build and browser checks in [landing verification notes](docs/landing-design.md). Documentation screenshots were removed during cleanup. Local test results do not verify a deployment or funded transaction.
- **Not established here:** testimonials, customer logos, adoption figures, investment returns, universal issuer availability or current funded-execution guarantees. Do not fabricate them to fill a landing section.

## Product Principles

1. **Make the investment understandable.** Concrete assets, research and allocations precede protocol jargon; explain bounded recurring permissions in plain language.
2. **Keep custody and authorization explicit.** Show what is being signed, where outputs settle, what permission is granted and what risk remains.
3. **Separate real investing from demonstrations.** Mainnet spot, devnet recurring and device-local paper practice are distinct, visibly labeled experiences.
4. **Prefer honest gaps to manufactured certainty.** Preserve stale/unavailable data, route limits and pending outcomes; never turn an audit, simulation or image into proof of a fill.
5. **Share rules, respect platforms.** One SDK defines business contracts; web and native interactions honor real signing capabilities rather than hiding unsupported behavior.

## Accessibility & Inclusion

- Make the primary task easy to find on mobile and web. Preserve accessible contrast, readable financial data, visible focus and keyboard access; do not communicate availability, network, gains or losses by color alone.
- Explain SIP (systematic investment plan) and DCA (dollar-cost averaging) in plain language. Do not assume judges or investors already understand Solana, delegation, ATAs or transaction bundles.
- Product explanations must remain understandable without animation or JavaScript. The landing's reduced-motion mode removes parallax, entrances and extended sticky-story spacing; its research tabs and full diagram remain available with direct controls.
- Research views and recurring steps follow scroll, not a timer. Provide pause/follow-scroll and direct controls. Motion never blocks reading or replaces important risk and network disclosures.
- State unsupported native signing, incomplete data and provider outages as useful text, with a safe next step. Browsing and paper practice remain available on iOS and Expo web.
