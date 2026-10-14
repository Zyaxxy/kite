import { pageMetadata } from "../../lib/metadata";
import { Shell } from "../../components/kite/Shell";
import { CreatorDashboard } from "../../components/kite/CreatorDashboard";
export const metadata = pageMetadata({
  title: "Creator studio",
  description:
    "Publish invited creator baskets, share devnet subscription Blinks and follow verified engagement on Kite.",
});
export default function Page() {
  return (
    <Shell title="Creator studio">
      <CreatorDashboard />
    </Shell>
  );
}
