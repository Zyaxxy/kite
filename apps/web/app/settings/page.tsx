import { pageMetadata } from "../../lib/metadata";
export const metadata = pageMetadata({
  title: "Settings",
  description:
    "Manage paper activity, wallet connection and sign-in preferences.",
  robots: { index: false, follow: false },
});
import { KiteApp } from "../../components/kite/KiteApp";
export default function Page() {
  return <KiteApp page="settings" />;
}
