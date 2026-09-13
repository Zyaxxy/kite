import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Stock research",
  description:
    "Company overview, sourced fundamentals, technicals and mainnet token prices.",
};
import { KiteApp } from "../../../components/kite/KiteApp";
export default async function Page({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  return <KiteApp page="stock" symbol={symbol} />;
}
