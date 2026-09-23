import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Build Custom Basket | Kite",
  description:
    "Design and execute custom thematic stock baskets with verified Solana DEX liquidity under the 64-account V1 limit.",
};

import { KiteApp } from "../../../components/kite/KiteApp";

export default function Page() {
  return <KiteApp page="basket-builder" />;
}
