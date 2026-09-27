# Kite mobile

Kite uses native React Native screens, a native stack with system back gestures, and platform bottom tabs: Explore, Subscriptions, Portfolio, Activity. The first screen introduces baskets and recurring investing without requiring a wallet. Expo web has a separate tab implementation and never imports native tab or wallet modules.

The app shares market, paper, transaction and devnet recurring API contracts with `@kite/sdk`. Missing market values remain unavailable. Paper fills and paper recurring plans are explicitly simulations.

## Development

1. Install the root lockfile using the pinned pnpm version and run `pnpm build:sdk`.
2. Start the API with `pnpm dev:web`.
3. Copy `.env.example` to `.env.local`. Set `EXPO_PUBLIC_API_BASE_URL` to the reachable API **origin** and `EXPO_PUBLIC_WEB_URL` to Kite’s HTTPS identity origin. Never put provider keys, keeper bearer tokens or wallet secrets in Expo public variables.
4. Run `pnpm --filter @kite/mobile android` for a native development build. Expo Go does not contain Mobile Wallet Adapter or native tabs. Run `pnpm --filter @kite/mobile web` for the browser preview.

After native dependency changes, rebuild the native app. Restarting Metro alone cannot install native modules. The bottom-tab config plugin in `app.json` configures Android’s native theme. The Expo 52-compatible screens and safe-area versions are pinned; do not replace them with versions intended for newer Expo SDKs without an Expo upgrade.

## Public API connectivity

A phone cannot reach your computer using `localhost`. Use a reachable HTTPS API deployment or a development tunnel. Metro’s `expo start --tunnel` only exposes the app bundle; it does not expose Next.js or `/api`.

```sh
# Terminal 1, repository root
pnpm dev:web
# Terminal 2, repository root; requires cloudflared
node scripts/dev-api-tunnel.mjs --write-env
# Terminal 3
pnpm --filter @kite/mobile tunnel --clear
```

Keep both tunnels alive and restart Expo after the API hostname changes. Configure `EXPO_PUBLIC_WEB_URL` separately as an HTTPS wallet identity. It is not a sign-in redirect: wallet connection and trading stay native.

Expo web also needs its exact browser origin in `KITE_ALLOWED_ORIGINS`. Native requests do not send an Origin header. Do not use wildcard CORS or deployment-protection bypass secrets in a mobile bundle. The SDK rejects non-JSON tunnel/protection pages with a readable error.

## Wallets and network isolation

The official React Native MWA integration is `@solana-mobile/mobile-wallet-adapter-protocol`. Its `transact`/`signTransactions` APIs exchange serialized transactions with an on-device wallet; the unsuffixed `@solana-mobile/mobile-wallet-adapter` in the initial brief is not the integration package used by the official Expo template.

- Mainnet and devnet authorize with distinct MWA chains and distinct SecureStore keys. A mainnet authorization is never reused for a devnet subscription.
- Authorization tokens are bound to the configured HTTPS identity. Stored capabilities are cleared on restore; reconnect obtains fresh wallet capabilities.
- Android batch signing calls MWA once with all reviewed V0 bundle payloads in order. The app verifies the number of returned payloads, account, expiry and wallet version support. A wallet that cannot sign the complete batch is rejected.
- Single stock trading uses the existing server-selected transaction format. Basket purchases use V0. Larger baskets can return a Jito bundle; the review includes all allocations, tip and partial-execution limitations. A bundle never falls back to individually sending its transactions.
- iOS and Expo web do not expose unsupported native signing controls or redirect trading to a browser. They support market research and paper investing. Android wallet signing must be tested in a custom development/release build.

The app signs only. The server verifies reviewed messages and broadcasts to the correct cluster. Funds never enter a Kite vault.

## Native subscriptions

Choose a provisioned devnet stock or basket, amount, cadence and installment count. Cadences are daily, weekly, every two weeks or every 30 days. The last is a fixed interval, not a calendar month. The server caps the whole plan at one year.

The native review shows the amount, schedule, allocation and minimum-output policy returned by the devnet API. Approval signs on device with a separate devnet authorization. Plans can be listed and cancelled from the app; cancellation requires its own review and wallet approval. Test-token subscriptions never use mainnet stock tokens or real share prices.

Before broadcast, the exact signed devnet setup/cancellation is saved locally. A timeout retains it and blocks new plans. **Check saved submission** reuses that same signed payload, preventing a second subscription when the first HTTP response was lost. Terminal confirmed/failed/expired outcomes release the guard.

Mainnet bundle attempts similarly persist the reviewed authorization and signed bundle before submission; **Check bundle status** uses read-only recovery. Single swaps preserve the existing pending-attempt guard. Activity lists device-local paper fills and wallet receipts; it does not claim to be a complete on-chain account history.

## Android build profiles

`eas.json` includes `preview` APK and `production` AAB profiles. Configure public HTTPS origins in the matching EAS environment and link the app to your own EAS project before requesting a build. Release configuration rejects missing origins, HTTP, private hosts, credentials and appended API paths. No signing credentials or store account are created by this source change.

```sh
eas build --platform android --profile preview
eas build --platform android --profile production
```

## Validation and known environment limits

```sh
pnpm build:sdk
pnpm --filter @kite/mobile test
pnpm --filter @kite/mobile exec tsc --noEmit
pnpm --filter @kite/mobile exec expo export --platform web --platform android --platform ios
npx solana-mobile@latest doctor
```

On 2026-09-27 the requested doctor ran successfully as a command and exited **1** because the host lacks JDK 17+, `JAVA_HOME`, Android SDK, `adb` 33+ and any emulator. macOS, disk space, Node and package managers passed. It reported project creation ready, Android builds unavailable, and emulator/physical-device workflows unavailable. Install a complete JDK and Android Studio SDK/Platform Tools, set `JAVA_HOME` and `ANDROID_HOME`, then rerun the doctor. No emulator or real-wallet transaction was tested on this host.

Before distribution, verify on Android: both network authorizations, wallet rejection, account changes, background/resume, one-transaction basket, complete batch signing, insufficient funds, expiration, lost-response recovery, subscription creation and cancellation. Rebuild after any MWA or navigation dependency change.

Official references: [Solana Mobile setup](https://docs.solanamobile.com/get-started/development-setup), [direct MWA sessions](https://docs.solanamobile.com/get-started/react-native/invoke-mwa-sessions-directly), [Solana Expo template](https://github.com/solana-mobile/solana-mobile-expo-template), [native bottom tabs](https://oss.callstack.com/react-native-bottom-tabs/docs/getting-started/quick-start), [Expo monorepos](https://docs.expo.dev/guides/monorepos/).
