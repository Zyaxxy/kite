"use client";
import { useEffect, useState } from "react";
import type { PublishedCreatorBasket } from "@kite/sdk";
let cached: PublishedCreatorBasket[] = [];
let expires = 0;
let pending: Promise<PublishedCreatorBasket[]> | null = null;
async function load(): Promise<PublishedCreatorBasket[]> {
  if (Date.now() < expires) return cached;
  if (pending) return pending;
  pending = (async () => {
    const response = await fetch("/api/creators/baskets");
    if (!response.ok)
      throw new Error("Published creator baskets are temporarily unavailable.");
    const data = (await response.json()) as {
      baskets: PublishedCreatorBasket[];
    };
    cached = data.baskets;
    expires = Date.now() + 30_000;
    return cached;
  })().finally(() => {
    pending = null;
  });
  return pending;
}
export function usePublishedBaskets(id?: string) {
  const [baskets, setBaskets] = useState<PublishedCreatorBasket[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const rows = await load();
        const result = [...rows];
        if (id?.startsWith("creator-") && !result.some((b) => b.id === id)) {
          const response = await fetch(
            `/api/creators/baskets/${encodeURIComponent(id)}`,
          );
          if (response.ok)
            result.push(
              (await response.json()).basket as PublishedCreatorBasket,
            );
        }
        if (active) {
          setBaskets(result);
          setError("");
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Creator baskets unavailable.",
          );
      }
    }
    void refresh();
    const invalidate = () => {
      expires = 0;
      void refresh();
    };
    window.addEventListener("kite:creator-published", invalidate);
    return () => {
      active = false;
      window.removeEventListener("kite:creator-published", invalidate);
    };
  }, [id]);
  return { baskets, error };
}
