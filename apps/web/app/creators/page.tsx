import type { Metadata } from "next";
import { Shell } from "../../components/kite/Shell";
import { CreatorDashboard } from "../../components/kite/CreatorDashboard";
export const metadata: Metadata = {
  title: "Creator studio",
  description:
    "Publish invited creator baskets, share devnet subscription Blinks and follow verified engagement on Kite.",
};
export default function Page() {
  return (
    <Shell title="Creator studio">
      <CreatorDashboard />
    </Shell>
  );
}
