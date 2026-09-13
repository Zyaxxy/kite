import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Your portfolio",
  description: "Review your local paper account or connected wallet holdings.",
  robots: { index: false, follow: false },
};
import { KiteApp } from "../../components/kite/KiteApp";
export default function Page() {
  return <KiteApp page="portfolio" />;
}
