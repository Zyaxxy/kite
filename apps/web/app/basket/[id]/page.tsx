import { KiteApp } from "../../../components/kite/KiteApp";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <KiteApp page="basket" basketId={id} />;
}
