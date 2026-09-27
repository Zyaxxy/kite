import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Basket studio",
  description:
    "Build your own tokenized stock allocation, save a private basket, or publish with a creator invite. Review real trading routes before you invest.",
};

import { KiteApp } from "../../../components/kite/KiteApp";

export default function Page() {
  return <KiteApp page="basket-builder" />;
}
