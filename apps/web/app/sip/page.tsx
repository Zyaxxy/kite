import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Recurring plans and payments",
  description:
    "Practice recurring paper investments or authorize bounded token payments from your wallet.",
};
import { KiteApp } from "../../components/kite/KiteApp";
import { RecurringDevnetDialog } from "../../components/trading/RecurringDevnetDialog";
export default function Page() {
  return (
    <>
      <RecurringDevnetDialog />
      <KiteApp page="plans" />
    </>
  );
}
