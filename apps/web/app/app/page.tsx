import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Discover",
  description:
    "Discover Solana tokenized stocks, current market activity and thematic baskets.",
};
import { KiteApp } from "../../components/kite/KiteApp";
export default function Page() {
  return <KiteApp page="discover" />;
}
