import { KiteApp } from "../../../components/kite/KiteApp";
export default async function Page({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  return <KiteApp page="stock" symbol={symbol} />;
}
