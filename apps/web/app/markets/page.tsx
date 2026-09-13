import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Markets",
  description:
    "Explore issuer-listed xStocks and PreStocks with available mainnet prices and company research.",
};
import { KiteApp } from "../../components/kite/KiteApp";
export default function Page() {
  return <KiteApp page="markets" />;
}
