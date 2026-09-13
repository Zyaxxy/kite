import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Settings",
  description:
    "Manage paper activity, wallet connection and sign-in preferences.",
  robots: { index: false, follow: false },
};
import { KiteApp } from "../../components/kite/KiteApp";
export default function Page() {
  return <KiteApp page="settings" />;
}
