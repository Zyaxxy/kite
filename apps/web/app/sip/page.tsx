import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Recurring paper plans",
  description:
    "Practice recurring investment plans using virtual funds and available mainnet prices.",
};
import { KiteApp } from "../../components/kite/KiteApp";
export default function Page() {
  return <KiteApp page="plans" />;
}
