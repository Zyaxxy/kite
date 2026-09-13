# Kite mobile

Expo / React Native clients share `KiteClient`, `createKiteCore`, market models, precision validation and paper execution with Kite web. The forest and lime interface works on Android, iOS and Expo web. All market and company data comes from the web API; missing values remain unavailable.

## Development

1. Install the root lockfile with the pinned pnpm version, then `pnpm build:sdk`. Expo web needs the declared `react-dom`, `react-native-web` and `@expo/metro-runtime` dependencies; installing only the old native dependencies leaves web unable to bundle.
2. Start Kite web with `pnpm dev:web`.
3. Copy `apps/mobile/.env.example` to `apps/mobile/.env.local` and set `EXPO_PUBLIC_API_BASE_URL` to the web API **origin**, without `/api`, query strings or credentials.
4. Run `pnpm dev:mobile` for the native development server, or `pnpm --filter @kite/mobile web` for the browser. Restart Expo with `--clear` after an environment change. Local HTTP origins are accepted only in development; release builds require HTTPS.

A physical phone cannot reach a server through `localhost` on your computer. Use a reachable private LAN address for paper-only development, or the HTTPS API tunnel below. Android signing also requires an HTTPS `EXPO_PUBLIC_WEB_URL` identifying Kite.

## Two separate tunnels

`expo start --tunnel` exposes Metro’s app bundle. It does **not** expose Next.js or `/api/markets`.

Install the official [Cloudflare CLI](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/) and run from the repository root:

```sh
pnpm dev:web
# In a separate terminal:
node scripts/dev-api-tunnel.mjs --write-env
# In a third terminal, after the API tunnel URL is saved:
pnpm --filter @kite/mobile tunnel
```

The API tunnel proxy binds only to `127.0.0.1:3101`. It forwards GET requests for `/api/health`, `/api/markets`, `/api/research`, `/api/tokens`, `/api/portfolio`, and JSON POST requests for `/api/trade/order` and `/api/trade/execute`. Other paths, browser cookies and private/debug endpoints are excluded. Request bodies are bounded. `--write-env` updates only `EXPO_PUBLIC_API_BASE_URL` in the gitignored mobile environment; it never copies server secrets.

Keep both tunnel processes running. The API URL changes on restart, so restart Expo with `--clear` after updating it. Set `EXPO_PUBLIC_WEB_URL` separately to your public HTTPS Kite frontend for Privy and the wallet identity. An API-only tunnel does not serve the web sign-in pages. Use `--proxy-only` for a local proxy check without opening a public tunnel. The CLI’s `--help` lists port/upstream overrides.

Expo web is a browser: its exact origin (for example `http://localhost:8081`) must be allowed by the web server’s CORS configuration. Native requests do not need CORS. Do not ship a deployment-protection bypass secret to solve HTML login responses; use a production API domain accessible to app clients. `KiteClient` explains HTML/interstitial responses rather than crashing JSON parsing.

## Wallets and actual trades

- Paper mode remains the default. The starting virtual USD balance is explicitly a simulation, and persisted paper plans execute only while the app is active with live prices.
- On supported Android builds, open an asset and switch **Paper → Actual**. Connect a compatible wallet, choose one of its funded tokens, enter an amount and review the fresh route. The app refreshes wallet balances before quoting. Max excludes frozen tokens and keeps a conservative 0.01 SOL reserve; this is not a fee estimate.
- **Approve in wallet** invokes MWA `signTransactions` only. The signed payload then goes to Kite’s server authorization/execute route. Neither the mobile app nor the server holds a signing key. Orders cannot be approved with a different account or after expiry.
- MWA authorization tokens are kept in Expo SecureStore, bound to the configured HTTPS identity origin. Later sessions reauthorize. Disconnect forgets the local session and attempts wallet-side deauthorization. MWA base64 account addresses are converted to base58 before API requests.
- Before sending a signed transaction, Kite saves the attempt identity to AsyncStorage. It never saves a signed transaction. A timeout produces **confirmation unknown** and blocks another swap until the user checks wallet activity. Restarting the app preserves this guard.
- MWA is loaded only by the Android module and only when requested. Expo Go lacks the native wallet module. iOS and Expo web offer the existing Privy flow on Kite web; native Privy is not represented as configured.
- No mainnet vault or custody deposit is involved. Actual recurring plans and atomic basket transactions remain gated by their separately reviewed protocol implementation.

## Android build profiles

`eas.json` defines two standalone Android artifacts using the installed Expo SDK version: `preview` produces an internally distributed APK for direct device installation, and `production` produces an AAB for Google Play. Both use Node 24.12.0 and pnpm 10.31.0. These profiles do not depend on Metro or Expo Go at runtime.

Before requesting a build, link this app to your own EAS project and configure `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_WEB_URL` as **plaintext public values** in the matching EAS `preview` or `production` environment. Use a reachable HTTPS API origin and the HTTPS frontend origin serving Privy. Keep provider credentials only on the web server. No EAS project, signing credential or store account has been created by this change.

Run these commands from `apps/mobile` with your installed EAS CLI after that setup:

```sh
eas build --platform android --profile preview
eas build --platform android --profile production
```

Both profiles set `KITE_REQUIRE_RELEASE_CONFIG=true`. `app.config.js` validates the public origins during local EAS config resolution and on the builder; missing values, HTTP, private hosts, credentials and appended API paths fail with the affected variable name. `EAS_BUILD_PROFILE=preview` or `production` also activates the guard. Local `expo start`, config inspection and exports remain available without production configuration so the setup/research screens can still be tested. For a preflight without submitting a build, run `KITE_REQUIRE_RELEASE_CONFIG=true pnpm exec expo config --type public` from this app directory with both public variables supplied.

Use `pnpm --filter @kite/mobile android` for the existing local custom development build. A standalone APK still requires physical-device verification of MWA signing and lifecycle behavior before distribution. If you choose to add an EAS development-client profile later, install and configure `expo-dev-client` first; it is intentionally not declared as already available here.

Profile references: [Expo APK configuration](https://docs.expo.dev/build-reference/apk/), [EAS build profiles](https://docs.expo.dev/build/eas-json/), [EAS public environment variables](https://docs.expo.dev/eas/environment-variables/).

## Release checks

```sh
pnpm build:sdk
pnpm --filter @kite/mobile test
pnpm --filter @kite/mobile exec tsc --noEmit --noUnusedLocals --noUnusedParameters
pnpm --filter @kite/mobile exec expo export --clear --platform web --platform ios --platform android
```

Build a native Android development/release binary (`pnpm --filter @kite/mobile android`) to exercise MWA. Verify on a physical Android wallet: connect/reauthorize, account changes, rejection, expired quote, background/resume during wallet approval, execution timeout and restart recovery. Native signing has not been verified by a real-money transaction in automated browser tests. iOS MWA is intentionally unavailable; test the Privy web handoff separately.

The Expo entry initializes Buffer before the SDK and imports Metro’s browser runtime. Web styles constrain the root to a column with a scrollable content area and fixed navigation; this avoids offscreen roots and clipped phone layouts. A render error boundary offers recovery. Paper fills, plan success and reset confirmations render inline on both native and web, where `Alert.alert` would otherwise be a no-op.

Sources: [Expo monorepo guide](https://docs.expo.dev/guides/monorepos/), [Solana Mobile direct MWA sessions](https://docs.solanamobile.com/get-started/react-native/invoke-mwa-sessions-directly), [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/). Design review used the installed mobile/frontend skills and [coss UI](https://coss.com/ui) for clear fields, empty states and focused selection panels.
