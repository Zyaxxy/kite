# Deployment and launch verification

Recorded 13 September 2026 against `codex/deployment-mobile-upgrades`, based on original-repository main `2df5c9e`. This is a tested implementation and release guide. The custom Anchor workspace has been retired in favor of official mainnet Subscriptions. No real wallet trade was submitted during verification.

## Deploy web and API together

Install the committed lockfile with **pnpm 10.31.0** and use Node 24.12.0 for the documented deployment toolchain. Build the SDK, then the Next.js application. Configure the hosting project root/build command for this workspace and allow the trade route's declared 60-second function duration where supported.

Use `apps/web/.env.example` as the configuration inventory. Set server-only `JUPITER_API_KEY`, `KITE_TRADE_SECRET` (independent, at least 32 characters) and a mainnet `SOLANA_RPC_URL` in the host's secret store. A server Privy feature may require `PRIVY_APP_SECRET`; a public app ID is not that secret. Browser RPC URLs and public Privy identifiers are intentionally visible to users and must have the provider's appropriate origin restrictions. Never copy server keys into `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*` variables.

Set `KITE_SITE_URL` to the canonical public HTTPS origin. Vercel's trusted proxy is recognized automatically; another proxy must overwrite forwarded headers before `KITE_TRUST_PROXY=true` is appropriate. Verify HTTPS redirect and HSTS at that deployed edge. Set `KITE_ALLOWED_ORIGINS` to the exact origins of any separately hosted Expo web client; native Android clients do not send browser CORS requests. Public API access must return JSON without a hosting login interstitial. Do not put a protection-bypass token in a mobile build.

Portfolio, quote and execution responses must remain private and uncached. Market responses use short public cache lifetimes and ETag revalidation; incomplete snapshots have a shorter lifetime. In-memory cache, pending-request deduplication and throttling are per process. Configure distributed rate limiting at the production gateway/WAF for internet-facing API abuse protection. The included bounded per-process limiter is not a shared global quota.

## Connect mobile

`EXPO_PUBLIC_API_BASE_URL` is the API origin, without `/api`. `EXPO_PUBLIC_WEB_URL` is the frontend origin used by the wallet identity and the Privy web handoff. Both must be explicit public HTTPS origins for the EAS preview and production profiles. The API-only tunnel does not serve web sign-in pages.

For development, run these in separate terminals:

```sh
pnpm dev:web
node scripts/dev-api-tunnel.mjs --write-env
pnpm --filter @kite/mobile tunnel --clear
```

Install the official Cloudflare CLI first. The helper exposes only approved API routes through a loopback proxy and writes only the public API URL into ignored mobile configuration. An Expo Metro tunnel transports the application bundle separately. Restart Expo with `--clear` whenever public environment values change; otherwise Metro can retain an earlier inlined URL.

See [mobile setup and Android release profiles](../apps/mobile/README.md). Preview builds produce APKs, and production builds produce AABs after the operator links an EAS project and configures signing. Those external accounts and signing credentials are not provisioned here. Android actual trading uses MWA in a custom native build. iOS and Expo web use the existing web Privy handoff; native Privy embedded-wallet parity remains future work.

## Launch checklist

| Item                       | Implemented behavior                                                                                                                            | Deployment check                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Privacy and terms          | `/privacy` and `/terms` describe current storage, providers and execution boundaries                                                            | Set the real `KITE_OPERATOR_NAME` and `KITE_SUPPORT_EMAIL`; have the operator review policy accuracy for its jurisdiction |
| Images and load speed      | Removed 15.8 MB of unused duplicate public assets; issuer images use AVIF/WebP optimization; wallet providers load separately from public pages | Measure real device/network Web Vitals after deployment; local HTTP latency is not user-perceived load time               |
| Secrets                    | API owns private provider and quote credentials; client-artifact scanner checks configured secret literals                                      | Scan the final deployed web and mobile artifacts after production configuration is applied                                |
| Contrast and mobile layout | Forest/lime design retained; muted text contrast increased; scroll roots, navigation, selection panels and mobile empty/error states corrected  | Physical device accessibility and wallet lifecycle checks                                                                 |
| HTTPS                      | Canonical redirects, trusted proxy handling, HSTS on HTTPS and restrictive CORS                                                                 | Verify the host actually enforces HTTPS and strips untrusted forwarding headers                                           |
| Cookie/storage choices     | Essential-only default, optional analytics consent, saved choice and withdrawal; GPC/DNT suppress analytics                                     | Keep policy and actual enabled providers aligned                                                                          |
| Metadata and discovery     | Route titles/descriptions, canonical URL, favicon, social image, sitemap, robots and custom 404                                                 | Use the real site origin; preview/local robots intentionally disallow indexing                                            |
| Links and images           | Policy/footer navigation, stock and basket links, unknown-wallet-token inline swaps, meaningful avatar alt text                                 | Smoke-test the public domain and any configured external support links                                                    |
| Forms and spam             | Exact amount/precision validation, funded-balance check, bounded JSON bodies and API throttling                                                 | Configure a distributed gateway quota; there is no new unauthenticated contact form to protect                            |
| Analytics                  | Consent-gated Plausible page categories and Web Vitals; no wallet, query, transaction or form data sent                                         | Supply an owned Plausible site matching `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`; analytics is disabled until configured            |
| Main call to action        | Public landing leads to basket discovery; the workspace prioritizes baskets and recurring plans                                                 | Confirm the intended public launch destination                                                                            |

## Latest recurring investment verification

Recorded against implementation commit `7063061` on 13 September 2026. These local checks ran with Node **26.4.0**; the documented deployment toolchain remains Node 24.12.0 and pnpm 10.31.0 and should be exercised in deployment CI.

- **221/221 tests passed** across SDK, web API/security, mobile configuration, recurring worker and local API-tunnel integration. Coverage includes daily/weekly/calendar-month scheduling, custom intervals, exact encoded Jupiter terms, signed-plan binding, atomic delivery, expiry, replay protection and crash-before-send recovery.
- SDK compilation, web TypeScript and strict mobile TypeScript passed. Next.js 15.5.24 production build passed.
- Expo web and Android exports passed: 1.27 MB web JavaScript and 4.31 MB Android Hermes bundle before transport compression. These are export results, not physical-device or mobile-network performance measurements.
- **225 client artifacts** were scanned against three configured server-only values with no literal/encoded matches. This checks known configured secrets, not every possible information flow.
- Responsive web inspection at 375px showed the recurring controls without horizontal overflow. No connected-wallet signature or funded execution was performed.
- The refreshed local production server returned 200 for landing and plan screens, 200 with an explicit unconfigured state for investment availability, 401 for unauthenticated executor access and 422 for an invalid plan request.
- Local-only tunnel tests verified public plan routes and CORS, blocked executor routes and stripped credentials. No public tunnel was needed for these tests.

No executor key, hosted worker or investor funds were provisioned. New approvals remain disabled until the operator configures persistent storage and a reachable worker, and the API verifies V1 activation and signing-method compatibility. The dependency audit figures below belong to the earlier audit; this pass did not rerun it or resolve the remaining advisories.

Reproduce the regression suite from the repository root after compiling the SDK:

```sh
node --test packages/sdk/test/*.test.cjs apps/web/tests/*.test.mjs apps/mobile/tests/*.test.cjs scripts/test/*.test.cjs scripts/test/*.test.mjs
```

## Earlier mainnet integration verification

- 161 SDK, web API/security and mobile configuration checks passed. SDK, web and strict mobile TypeScript checks passed.
- Next.js production build and cleared Expo web/Android exports passed. Metro uses a client-only SDK entry to exclude server-side Kit/Subscriptions builders on both Expo platforms.
- 221 web/mobile client artifacts were scanned against three configured server-only values, with no literal/encoded matches.
- Read-only mainnet API checks returned an empty real recurring-permission list for a fresh public key, rejected an unfunded basket, and rejected execution without valid authorization.
- Live Jupiter routes for `sol-core` encoded into v0 at 1,059 bytes and 44 accounts. This was an encoding/capacity probe with an ephemeral wallet, not a funded simulation or completed purchase.
- Browser inspection confirmed the actual basket review controls and recurring setup/consent screen. No wallet approval, real transfer or buyer-runner activation was performed.
- The production audit remains at eight findings: zero critical, three high and five moderate, as documented in the dependency security report.

## Earlier baseline verification

The combined Node test run passed **145/145 tests** across SDK, web API/security and mobile configuration. Two additional dependency compatibility tests passed, including actual Expo archive extraction. SDK compilation, strict mobile TypeScript checks, and the Next.js production build passed. Expo exported web, iOS and Android bundles successfully with a cleared cache. Historical checks of the retired Rust prototype are preserved in git history; they are not evidence for the current mainnet payment integration.

Browser verification covered Expo web boot, real API markets, filters, stock research, basket details and responsive layouts at 390, 768 and 1280 pixels. Public web pages, stock research and disconnected wallet-first swap selection were checked. An actual connected-wallet signature and Android app switching were not exercised. API tunnel checks observed health/markets success, forbidden-route rejection and body/content-type rejection. Temporary test tunnels were closed.

Local production observations below are individual measurements on the development computer, not latency promises or a before/after benchmark:

| Observation                  | Result                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| Landing HTTP response        | 21 ms, 34.6 KB HTML                                                                 |
| Privacy/terms HTTP responses | 3–5 ms                                                                              |
| Initial market snapshot      | 6.9 s, 841 catalog assets, enrichment still refreshing                              |
| NVDA research                | 931 ms fresh; 7 ms warm; 43 fundamentals and 251 historical bars                    |
| Optimized issuer icon        | 758-byte AVIF, 164 ms                                                               |
| Social image                 | 36.2 KB PNG                                                                         |
| Next.js first-load estimate  | Landing 129 KB; policy pages 109 KB; workspace 248 KB before deferred wallet chunks |
| Expo export                  | Web 1.24 MB; iOS 3.36 MB; Android 4.25 MB, before transport compression             |

The client-artifact scan checked 217 web/mobile artifacts against the three unique configured server-only secret values and found no matches. This check detects configured literal/encoded secrets; it does not establish the absence of every possible data leak.

Reproduce the application checks from the repository root:

```sh
pnpm build:sdk
node --test packages/sdk/test/*.test.cjs apps/web/tests/*.test.mjs apps/mobile/tests/*.test.cjs
node --test scripts/test-dependency-compatibility.cjs
pnpm --filter @kite/mobile exec tsc --noEmit --noUnusedLocals --noUnusedParameters
pnpm build:web
pnpm --filter @kite/mobile exec expo export --clear --platform web --platform ios --platform android
node scripts/check-client-secrets.mjs apps/web/.next/static apps/mobile/dist
pnpm audit --prod
```

## Protocol and release gates

Update for recurring investments: newly created transactions are V1-only, including individual swaps and permission management. Calendar schedules, a durable executor API/worker and stock/basket settlement are implemented. Operating them requires a shared private persistent API volume, an executor signer, fresh worker heartbeat and funded end-to-end verification; see [recurring investing operations](recurring-investing-operations.md). Existing V0 transactions remain readable for history/recovery. V1 still requires current route/account limits and wallet compatibility.

The production audit fell from 57 findings to 8 (zero critical, three high, five moderate). Dependency auditing and the compatible patch decisions are recorded in [dependency security](dependency-security.md). Remaining advisories require the documented upstream migration or mitigation work; passing application tests does not clear those findings.

The actual basket API and recurring permission APIs are connected to web and Android. Configure a buyer-controlled signer and persistent collection runner to operate recurring payments; the web server does not hold that key. V1 remains gated on live mainnet activation and wallet capabilities, and oversized baskets fail atomically. Token-extension compatibility and connected-wallet/device checks remain deployment validation, not claims derived from unit tests. See [current architecture](sdk-architecture-and-improvements.md) and [recurring payments](mainnet-recurring-payments.md).

Before distributing an Android release, verify connection, reauthorization, account changes, rejected signatures, expiry, background/resume during approval, timeout recovery and restart recovery on a real supported wallet. Use an appropriately scoped test plan before risking mainnet funds. Configure production RPC capacity, provider keys, a stable HTTPS API/frontend, monitoring and distributed abuse controls.

## Commit and rollback order

Each row is a separate commit in chronological order. Later client commits depend on earlier SDK/API changes; roll back in reverse order or revert the full dependent group. A commit boundary does not make arbitrary cross-version mixing safe.

| Commit    | Scope                                                          | Compatibility                                                          |
| --------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `93670eb` | Mobile storage and Anchor test dependencies                    | Additive prerequisites                                                 |
| `f84b6b4` | Bounded non-custodial SIP settlement                           | **Breaking Anchor interface**, local-only                              |
| `2ec9229` | Atomic composition, analysis and protocol SDK utilities        | Additive exports                                                       |
| `435cd29` | Shared API transport and cross-platform state                  | Internal migration; preserves existing paper storage                   |
| `35e2d79` | API policy, quote preflight and separate authorization secret  | Config change; quotes fail closed when preflight/secret is unavailable |
| `894201a` | Wallet holdings, funded-token swaps and pending-attempt guards | Expanded API/UI; coordinate client and server rollout                  |
| `58ccc49` | Expo web startup and native wallet execution                   | Native rebuild required for SecureStore/MWA                            |
| `f027fd8` | Mobile screens and responsive navigation                       | UI change                                                              |
| `1ca09ce` | Verified oracle mappings and unavailable adapter values        | Missing numeric fields may now be null; invalid observations reject    |
| `9441fa3` | API tunnel and validated APK/AAB profiles                      | Release configuration required                                         |
| `d57320d` | Public rendering and image optimization                        | UI/build change                                                        |
| `49b2145` | Policy pages, privacy choices and metadata                     | Optional operator/analytics configuration                              |

`6a4573b` follows with scoped dependency patches, the Expo archive compatibility fix, smoke tests and residual advisory notes. This evidence document follows in the documentation commit. Reverting package overrides must also revert their matching lockfile and pnpm patch changes.

## Mainnet integration commit order

| Commit    | Change                                                                                | Rollback dependency                                                                                             |
| --------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `8cff615` | Shared basket/V1 and official Subscriptions builders, client contracts                | Base for the following changes                                                                                  |
| `f2189a4` | Remove custom Anchor ABI and dependencies; add buyer runner and mobile SDK entry      | Breaking removal of prototype imports/build scripts; preserve any onchain grants independently of code rollback |
| `bb5469a` | Mainnet basket, recurring, revoke, collect and composed-execution APIs; tunnel routes | Client screens require these APIs                                                                               |
| `c1c6399` | Web review, one-approval purchase and recurring consent/revocation                    | Requires SDK and API commits                                                                                    |
| `370be64` | Android MWA basket and recurring UI, unsupported-platform web handoff                 | Requires SDK, Metro entry and APIs                                                                              |

Revert clients before their APIs and SDK. Removing application code does not revoke an onchain delegation: owners must revoke permissions, and buyer operators must stop scheduled collection separately.

## Recurring investment commit groups

The V1 migration is a breaking transaction-capability change: new approvals require a compatible wallet and the live feature. The investment API adds persistent storage and worker configuration. Individual commits remain available for inspection, but deploy the matching SDK, clients, API and worker together; some intermediate commits introduce consumers before the complete service is assembled.

| Commits                                    | Scope                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `bd78067`, `44c4152`, `2b87669`            | V1-only composition/signing, removal of the unused V0 builder and payment-runner migration |
| `59db6f6`, `9b9a6e4`, `3aefe1e`, `511ae33` | Calendar schedules, durable worker, expired-review recovery and heartbeat                  |
| `f615d52`, `dc6f9c3`, `5de3e21`            | Web/mobile recurring forms, focused discovery and narrow-screen actions                    |
| `7acc7b2`, `94516b9`, `7c2fad0`            | Atomic investment API/store, security tests and public tunnel routes                       |
| `e2be071`, `c8f97a4`, `7063061`            | Encoded Jupiter validation, tampering tests and exact-transaction submission recovery      |

Stop the executor and reconcile pending signatures before a service rollback. Back up persistent plan and worker state. Code rollback does not erase or revoke an owner's spending grants; revocation is a separate owner-signed onchain action.

A live MAG7 encoding probe required 98 accounts with the observed Jupiter routes and was rejected by the 64-account ceiling. V1 increases byte capacity, not this account ceiling. Route availability and composition can change; this implementation does not claim every theme fits a single transaction.
