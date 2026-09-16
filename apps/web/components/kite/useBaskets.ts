import { useMemo } from "react";
import { resolveReviewedMarketBaskets } from "@kite/sdk";
import { useKite } from "./State";
import type { BasketDisplay } from "./MarketUI";
export function useBaskets(): BasketDisplay[] {
  const { snapshot } = useKite();
  return useMemo(
    () =>
      (snapshot?.baskets ?? resolveReviewedMarketBaskets([])).map((b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        assets: b.assets.map((a) => a.asset),
        available: b.available,
        source: b,
      })),
    [snapshot],
  );
}
