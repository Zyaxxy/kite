import type { Metadata } from "next";
import { LegalPage } from "../../components/kite/LegalPage";
import { operatorName } from "../../lib/site";
export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "How Kite handles local paper accounts, wallet information and optional analytics.",
};
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      introduction="A clear view of the information used when you explore, practise and trade with Kite."
    >
      <section>
        <h2>Who operates this interface</h2>
        <p>
          This version of Kite is maintained by {operatorName}. This notice
          describes the data flows implemented in this interface. Your wallet,
          asset issuer and service providers also have their own policies.
        </p>
      </section>
      <section>
        <h2>Paper activity stays on your device</h2>
        <p>
          Your virtual account, orders, recurring paper plans and watchlist are
          saved in browser storage or the mobile app’s local storage. They are
          not automatically synchronised between devices. You can reset your
          paper account in Settings or remove the app’s local data. Clearing
          browser data also removes locally saved activity.
        </p>
      </section>
      <section>
        <h2>Wallet and sign-in information</h2>
        <p>
          When you connect a wallet, the API uses your public wallet address to
          read balances and prepare trades. When you approve a transaction, its
          signed payload is sent for execution. Private keys are not requested
          by Kite’s API. Native wallet authorisation tokens are kept in device
          secure storage; unresolved trade identifiers may be saved locally to
          prevent repeat submissions.
        </p>
        <p>
          Privy processes sign-in information when you choose its authentication
          flow. Your wallet provider and RPC providers process the requests
          needed for signing, balances and transactions. Onchain transactions
          are public and cannot be erased by clearing Kite data.
        </p>
      </section>
      <section>
        <h2>Market providers and technical requests</h2>
        <p>
          The server requests asset metadata, prices and company research from
          the sources identified in the app, including Jupiter, asset issuers,
          Yahoo Finance and Wikipedia. Hosting and network providers receive
          technical information such as your IP address, request path, browser
          details and request timing. Retention of their operational logs
          depends on the deployment and provider settings. Kite does not promise
          that external providers retain no logs.
        </p>
      </section>
      <section>
        <h2>Cookies, local storage and analytics</h2>
        <p>
          Essential storage supports paper activity, preferences and sign-in.
          Wallet and sign-in providers may use storage necessary for the
          features you request. Optional Kite usage analytics are disabled
          unless the deployment configures them and you select Allow analytics.
          When enabled, Plausible receives page categories and basic request
          information; Kite excludes wallet addresses, transaction payloads,
          query parameters and form values from analytics events.
        </p>
        <p>
          Use Privacy choices at the bottom of any page to decline or withdraw
          optional analytics. Your preference is kept on this device. We do not
          load advertising trackers in this implementation.
        </p>
      </section>
      <section>
        <h2>Your choices</h2>
        <p>
          You can use paper mode without connecting a wallet, disconnect your
          wallet, decline analytics and remove locally saved data. For access,
          correction or deletion questions about information handled by the
          deployment operator, contact the maintainers. Rights and available
          remedies depend on your location and the applicable law; external
          providers handle requests about information they control.
        </p>
      </section>
    </LegalPage>
  );
}
