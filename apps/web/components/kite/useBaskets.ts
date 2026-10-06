import { useMemo } from "react";
import {
  resolveAllMarketBaskets,
  resolveProgrammableBasket,
} from "@kite/sdk";
import { useKite } from "./State";
import type { BasketDisplay } from "./MarketUI";
import { usePublishedBaskets } from "./creator-client";
import { useRouteCoverage } from "./useRouteHealth";

export function useBaskets(id?: string): BasketDisplay[] {
  const { snapshot, customBaskets } = useKite();
  const { baskets: published } = usePublishedBaskets(id);
  const coverage = useRouteCoverage();
  return useMemo(() => {
    const curated = resolveAllMarketBaskets(snapshot?.assets ?? []).map(
      (b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        assets: b.assets.map((a) => a.asset),
        available: b.available,
        source: b,
        isCustom: Boolean(b.isCustom),
        creatorName: b.creatorName,
        creatorSocial: b.creatorSocial,
      }),
    );

    const custom = [
      ...published,
      ...(customBaskets ?? []).filter(
        (b) => !published.some((p) => p.id === b.id),
      ),
    ].map((cb) => {
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

    const featured = new Set(coverage.filter((value) => value.featured).map((value) => value.basketId));
    curated.sort((a, b) => Number(featured.has(b.id)) - Number(featured.has(a.id)));
    return [...custom, ...curated];
  }, [snapshot, customBaskets, published, coverage]);
}
