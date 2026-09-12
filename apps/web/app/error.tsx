"use client";
import Link from "next/link";
import { RotateCw } from "lucide-react";
import { Brand, OrbitArt } from "../components/kite/Brand";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="system-screen">
      <Brand />
      <section>
        <OrbitArt />
        <p className="eyebrow">A little turbulence</p>
        <h1>Let’s reconnect.</h1>
        <p>
          This page couldn’t load. If you were approving a trade, check your
          wallet activity before trying another order.
        </p>
        <div className="system-actions">
          <button className="btn" onClick={reset}>
            <RotateCw size={16} /> Try again
          </button>
          <Link href="/app" className="btn secondary">
            Back to discover
          </Link>
        </div>
      </section>
    </main>
  );
}
