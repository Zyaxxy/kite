import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Thematic baskets",
  description:
    "Explore the companies and allocations behind Kite’s thematic stock baskets.",
};
import { KiteApp } from "../../components/kite/KiteApp";
export default function Page() {
  return <KiteApp page="baskets" />;
}
