import { useMemo } from "react";
import { resolveAllMarketBaskets, resolveProgrammableBasket } from "@kite/sdk";
import { useKite } from "./State";
import type { BasketDisplay } from "./MarketUI";

export function useBaskets(): BasketDisplay[] {
  const { snapshot, customBaskets } = useKite();
  return useMemo(() => {
    const curated = (snapshot?.baskets ?? resolveAllMarketBaskets([])).map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      assets: b.assets.map((a) => a.asset),
      available: b.available,
      source: b,
      isCustom: Boolean(b.isCustom),
      creatorName: b.creatorName,
      creatorSocial: b.creatorSocial,
    }));

    const custom = (customBaskets ?? []).map((cb) => {
      const resolved = resolveProgrammableBasket(cb, snapshot?.assets ?? []);
      return {
        id: resolved.id,
        name: resolved.name,
        description: resolved.description,
        assets: resolved.assets.map((a) => a.asset),
        available: resolved.available,
        source: resolved,
        isCustom: true,
        creatorName: resolved.creatorName || cb.creatorName,
        creatorSocial: resolved.creatorSocial || cb.creatorSocial,
      };
    });

    return [...custom, ...curated];
  }, [snapshot, customBaskets]);
}
