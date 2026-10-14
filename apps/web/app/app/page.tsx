import { pageMetadata } from "../../lib/metadata";
export const metadata = pageMetadata({
  title: "Discover",
  description:
    "Discover Solana tokenized stocks, current market activity and thematic baskets.",
});
import { KiteApp } from "../../components/kite/KiteApp";
export default function Page() {
  return <KiteApp page="discover" />;
}
