import { Landing } from "../../components/kite/Landing";
import { getServerMarkets } from "@/lib/server/markets";

export const revalidate = 60;

export default async function Page() {
  let initialSnapshot = null;
  try {
    initialSnapshot = await getServerMarkets();
  } catch {
    initialSnapshot = null;
  }
  return <Landing initialSnapshot={initialSnapshot} />;
}
