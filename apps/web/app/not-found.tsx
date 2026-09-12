import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand, OrbitArt } from "../components/kite/Brand";

export default function NotFound() {
  return (
    <main className="system-screen">
      <Brand />
      <section>
        <OrbitArt />
        <p className="eyebrow">404 · Off the map</p>
        <h1>This page has drifted.</h1>
        <p>
          Head back to your workspace to explore the ideas taking shape onchain.
        </p>
        <Link href="/app" className="btn">
          <ArrowLeft size={16} /> Back to discover
        </Link>
      </section>
    </main>
  );
}
