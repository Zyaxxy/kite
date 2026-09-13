import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Basket details",
  description:
    "Understand a thematic basket’s allocations, companies and available market data.",
};
import { KiteApp } from "../../../components/kite/KiteApp";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <KiteApp page="basket" basketId={id} />;
}
