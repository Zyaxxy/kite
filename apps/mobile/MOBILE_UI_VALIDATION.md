# Mobile workspace update — 16 September 2026

The native workspace now follows the web app's forest/lime palette, compact header, clear page titles and four destinations: Discover, Baskets, Recurring and Portfolio. Search and Watchlist live under Discover; order Activity lives inside Portfolio. Account settings remain reachable in the header.

## What changed

- Discover prioritizes market movers and saved stocks. Market direction uses observed breadth only. Removed the oversized paper-balance/marketing panels from the first screen.
- Baskets have theme filters, concise descriptions and constituent previews. Basket detail keeps the existing paper purchase and wallet-approved mainnet basket behavior.
- Recurring defaults to a clearly marked devnet flow. Paper practice remains separate. The old mainnet investing screen and unreachable direct recurring-payment controls were removed.
- Portfolio uses an account summary followed by holdings or Activity. Its existing paper-account accounting is unchanged.
- Settings groups Appearance, device data, wallet and connection details. Detailed API configuration is behind a disclosure.
- Light and dark colors apply to screens, modals, research and transaction panels. The app initializes from the system appearance and stores an explicit selection locally. Failure to read preferences does not block startup.
- Backpack has its own catalog filter. Only actual supported `MarketAsset` Solana mints open stock/trading screens. Other securities show “Discovery only” and an issuer link; catalog IDs never become token mints.

## Recurring network boundary

The native availability panel only reads `/api/recurring/config`. It accepts schema 1 / protocol 2, `network: devnet` and `testTokensOnly: true`; mainnet or incompatible responses fail closed. Backend reasons are shown verbatim. A 15-second timeout ends a stalled check and permits retry.

`readyToPrepare` means a wallet review may be requested, not that the contract is verified or executable. The screen states that the web flow must successfully simulate a transaction before approval. When backend configuration is blocked, the setup button is disabled.

Native MWA signing is currently bound to mainnet and is retained for spot/basket trades. The Recurring screen therefore opens the configured Kite `/sip` page for devnet setup and pending-submission status checks. Existing-plan management and revocation controls are not yet exposed in this web screen. It never sends devnet instructions through the mainnet MWA signer. A selected mainnet stock/basket is shown as context; users explicitly select its supported devnet equivalent on web. Native devnet signing is not claimed to be implemented.

The contract audit has identified execution blockers. This UI does not resolve or conceal them and does not claim a successful installment.

## Verification performed

| Check | Result |
| --- | --- |
| Mobile TypeScript (`tsc --noEmit -p apps/mobile/tsconfig.json`) | Passed |
| Mobile unit tests (`node --test apps/mobile/tests/*.test.cjs`) | 10 passed |
| Expo web production export | Passed, 490 modules |
| Expo Android production JS/Hermes export | Passed, 897 modules |
| Expo web UI at 390 × 844 | Discover, Recurring, Portfolio, Settings inspected |
| Light/dark and reload persistence | Passed in browser preview |
| Recurring real backend response | Blocked authorization reason displayed; setup button disabled |
| Console runtime errors during inspected flow | None |
| Signing, transactions, swaps, or minting | Not performed |

The recurring regression tests reject mainnet, stale protocol, non-test-token and malformed readiness responses, preserve blocked reasons, and exclude malformed catalog entries from supported counts.

## Device validation still needed

Neither Android `adb` / emulator nor Xcode `simctl` is installed in the available environment. The Android export validates bundle compilation, not a native APK build, wallet round-trip or physical-device layout. Before releasing an APK:

1. Build against the public HTTPS API and web origins required by the existing release configuration validator. Provider secrets remain on the backend.
2. Verify scrolling, safe-area insets, keyboard dismissal, Android back navigation and persisted theme on a device.
3. Verify MWA account connection/disconnection and V1 signing support without submitting a transaction during a read-only smoke test.
4. Open Recurring and confirm that any setup link stays on the devnet web flow and that a blocked configuration cannot initiate approval.
5. After contract blockers are reviewed and fixed separately, run the protocol's explicit devnet integration test plan before claiming recurring execution works.
