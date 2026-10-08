import { Landing } from "../components/kite/Landing";
import { after } from "next/server";
import { getServerMarkets } from "@/lib/server/markets";

// Market and Redis observations use no-store reads. Keep this route dynamic
// even when the process-local snapshot cache satisfies a build-time request.
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
