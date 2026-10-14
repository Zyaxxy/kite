import { pageMetadata } from "../../lib/metadata";
export const metadata = pageMetadata({
  title: "Thematic baskets",
  description:
    "Explore the companies and allocations behind Kite’s thematic stock baskets.",
});
import { KiteApp } from "../../components/kite/KiteApp";
export default function Page() {
  return <KiteApp page="baskets" />;
}
