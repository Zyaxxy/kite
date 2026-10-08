import { Landing } from "../../components/kite/Landing";
import { after } from "next/server";
import { getServerMarkets } from "@/lib/server/markets";

// Match the home route: cached market observations can refresh through Redis.
export const dynamic = "force-dynamic";

export default async function Page() {
  let initialSnapshot = null;
  try {
    initialSnapshot = await getServerMarkets({
      waitUntil: (task) => after(() => task),
    });
  } catch {
    initialSnapshot = null;
  }
  return <Landing initialSnapshot={initialSnapshot} />;
}
