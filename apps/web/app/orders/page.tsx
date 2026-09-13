import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Your activity",
  description: "Review paper orders and activity saved on this device.",
  robots: { index: false, follow: false },
};
import { KiteApp } from "../../components/kite/KiteApp";
export default function Page() {
  return <KiteApp page="activity" />;
}
