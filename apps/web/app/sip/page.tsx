import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Recurring investment plans",
  description:
    "Practice recurring paper investments or review stock and basket plans using valueless devnet test tokens.",
};
import { KiteApp } from "../../components/kite/KiteApp";
export default function Page() {
  return <KiteApp page="plans" />;
}
