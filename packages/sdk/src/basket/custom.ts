import type { MarketAsset, MarketBasket } from "../markets";

export const MAX_CUSTOM_BASKET_LEGS = 8;
export const MIN_CUSTOM_BASKET_LEGS = 2;

export interface BasketAllocation {
  mint: string;
  symbol: string;
  name?: string;
  weightBps: number;
}

export interface RebalanceRules {
  driftThresholdBps: number;
  schedule?: "none" | "weekly" | "monthly";
}

export interface ProgrammableBasket {
  id: string;
  name: string;
  ticker: string;
  description: string;
  category?: MarketBasket["category"] | "custom";
  allocations: BasketAllocation[];
  rebalanceRules: RebalanceRules;
  createdAt: string;
  updatedAt: string;
  isCustom: true;
  creatorName?: string;
  creatorSocial?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Sanitizes and formats a social or profile URL (e.g. "@username", "x.com/username", or full URL). */
export function formatSocialUrl(input?: string): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  // Handle @handle e.g. @satoshinakamoto -> https://x.com/satoshinakamoto
  if (trimmed.startsWith("@")) {
    const handle = trimmed.slice(1).trim();
    return handle ? `https://x.com/${handle}` : undefined;
  }

  // If already full protocol URL
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // Prepend https://
  return `https://${trimmed}`;
}

/** Validate allocation definitions. Route availability and transaction bounds are checked at quote time:
 * strictly positive integer basis points, exact 10,000 bps sum, unique mints. */
export function validateProgrammableBasket(input: unknown): ProgrammableBasket {
  if (!isRecord(input)) throw new Error("Invalid custom basket object.");
  const id = String(input.id || "").trim();
  const name = String(input.name || "").trim();
  const ticker = String(input.ticker || "")
    .trim()
    .toUpperCase();
  const description = String(input.description || "").trim();
  const category = (
    typeof input.category === "string" ? input.category : "custom"
  ) as ProgrammableBasket["category"];
  const createdAt =
    typeof input.createdAt === "string"
      ? input.createdAt
      : new Date().toISOString();
  const updatedAt =
    typeof input.updatedAt === "string" ? input.updatedAt : createdAt;

  const rawCreatorName =
    typeof input.creatorName === "string"
      ? input.creatorName.trim()
      : undefined;
  const creatorName =
    rawCreatorName && rawCreatorName.length > 0
      ? rawCreatorName.slice(0, 50)
      : undefined;

  const rawCreatorSocial =
    typeof input.creatorSocial === "string"
      ? input.creatorSocial.trim()
      : undefined;
  const creatorSocial = rawCreatorSocial
    ? formatSocialUrl(rawCreatorSocial)?.slice(0, 200)
    : undefined;

  if (!id || id.length > 100)
    throw new Error("Basket identifier is missing or too long.");
  if (!name || name.length > 50)
    throw new Error("Basket name must be between 1 and 50 characters.");
  if (!ticker || ticker.length < 2 || ticker.length > 15)
    throw new Error("Basket ticker must be between 2 and 15 characters.");
  if (description.length > 500)
    throw new Error("Basket description must not exceed 500 characters.");

  if (!Array.isArray(input.allocations))
    throw new Error("Basket allocations must be an array.");
  if (
    input.allocations.length < MIN_CUSTOM_BASKET_LEGS ||
    input.allocations.length > MAX_CUSTOM_BASKET_LEGS
  ) {
    throw new Error(
      `Custom baskets must contain between ${MIN_CUSTOM_BASKET_LEGS} and ${MAX_CUSTOM_BASKET_LEGS} assets. Execution depends on current routes and transaction limits.`,
    );
  }

  const seenMints = new Set<string>();
  let totalBps = 0;
  const allocations: BasketAllocation[] = [];

  for (const item of input.allocations) {
    if (!isRecord(item)) throw new Error("Invalid allocation item.");
    const mint = String(item.mint || "").trim();
    const symbol = String(item.symbol || "")
      .trim()
      .toUpperCase();
    const nameStr =
      typeof item.name === "string" ? item.name.trim() : undefined;
    const weightBps = Number(item.weightBps);

    if (!mint || mint.length < 32 || mint.length > 44)
      throw new Error(`Invalid mint address: ${mint}`);
    if (seenMints.has(mint))
      throw new Error(`Duplicate asset in basket: ${symbol || mint}`);
    seenMints.add(mint);

    if (!Number.isInteger(weightBps) || weightBps <= 0 || weightBps > 10_000) {
      throw new Error(
        `Allocation for ${symbol || mint} must be a positive integer basis point amount.`,
      );
    }

    totalBps += weightBps;
    allocations.push({ mint, symbol, name: nameStr, weightBps });
  }

  if (totalBps !== 10_000) {
    throw new Error(
      `Total basket allocations must sum to exactly 10,000 basis points (100.00%). Current sum: ${totalBps}.`,
    );
  }

  const rebalanceRulesInput = isRecord(input.rebalanceRules)
    ? input.rebalanceRules
    : {};
  const driftThresholdBps = Number(rebalanceRulesInput.driftThresholdBps);
  const validDrift =
    Number.isInteger(driftThresholdBps) &&
    driftThresholdBps >= 100 &&
    driftThresholdBps <= 5000
      ? driftThresholdBps
      : 500; // default 5%
  const schedule = ["none", "weekly", "monthly"].includes(
    String(rebalanceRulesInput.schedule),
  )
    ? (String(rebalanceRulesInput.schedule) as RebalanceRules["schedule"])
    : "none";

  return {
    id,
    name,
    ticker,
    description,
    category,
    allocations,
    rebalanceRules: { driftThresholdBps: validDrift, schedule },
    createdAt,
    updatedAt,
    isCustom: true,
    creatorName,
    creatorSocial,
  };
}

/** Calculate equal-weight basis points conserving every indivisible unit via Hare-Niemeyer. */
export function calculateEqualWeights(
  assets: Array<{ mint: string; symbol: string; name?: string }>,
): BasketAllocation[] {
  if (!assets.length || assets.length > MAX_CUSTOM_BASKET_LEGS) {
    throw new Error(`Select between 1 and ${MAX_CUSTOM_BASKET_LEGS} assets.`);
  }
  const count = assets.length;
  const base = Math.floor(10_000 / count);
  const remainder = 10_000 % count;
  return assets.map((a, i) => ({
    mint: a.mint,
    symbol: a.symbol,
    name: a.name,
    weightBps: base + (i < remainder ? 1 : 0),
  }));
}

/** Auto-balances basket allocations to sum to exactly 10,000 basis points (100.00%) using the Hare-Niemeyer (Largest Remainder) algorithm in BigInt arithmetic. */
export function autoBalanceWeights(
  allocations: BasketAllocation[],
): BasketAllocation[] {
  if (!allocations.length) return [];
  if (allocations.length > MAX_CUSTOM_BASKET_LEGS) {
    throw new Error(`Select between 1 and ${MAX_CUSTOM_BASKET_LEGS} assets.`);
  }

  const rawWeights = allocations.map((a) => {
    const bps = Number.isFinite(a.weightBps) ? Math.max(0, Math.round(a.weightBps)) : 0;
    return BigInt(bps);
  });

  const totalRaw = rawWeights.reduce((sum, w) => sum + w, 0n);

  // If all weights are 0, distribute equally via Hare-Niemeyer
  if (totalRaw === 0n) {
    return calculateEqualWeights(allocations);
  }

  // If total is under 10,000 and some assets are 0 bps, distribute remainder among those zero-weight assets
  const zeroIndices = rawWeights
    .map((w, i) => (w === 0n ? i : -1))
    .filter((i) => i !== -1);

  if (totalRaw < 10_000n && zeroIndices.length > 0) {
    const remainderToDistribute = 10_000n - totalRaw;
    const count = BigInt(zeroIndices.length);
    const baseShare = remainderToDistribute / count;
    const rem = Number(remainderToDistribute % count);

    const result = allocations.map((a, i) => ({
      ...a,
      weightBps: Number(rawWeights[i]),
    }));

    zeroIndices.forEach((idx, i) => {
      result[idx].weightBps = Number(baseShare + (i < rem ? 1n : 0n));
    });

    return result;
  }

  // Proportional scaling via Largest Remainder (Hare-Niemeyer)
  // Ensure every asset has at least 1 unit effective weight so no leg receives 0
  const effectiveWeights = rawWeights.map((w) => (w <= 0n ? 1n : w));
  const effectiveTotal = effectiveWeights.reduce((sum, w) => sum + w, 0n);

  const baseWeights = effectiveWeights.map((w) =>
    Number((w * 10_000n) / effectiveTotal),
  );
  const remainders = effectiveWeights
    .map((w, index) => ({
      index,
      remainder: (w * 10_000n) % effectiveTotal,
    }))
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.index - b.index
        : a.remainder > b.remainder
          ? -1
          : 1,
    );

  const leftover = 10_000 - baseWeights.reduce((sum, val) => sum + val, 0);
  for (let i = 0; i < leftover; i++) {
    baseWeights[remainders[i].index]++;
  }

  const result = allocations.map((a, i) => ({
    ...a,
    weightBps: Math.max(1, baseWeights[i]),
  }));

  // Re-verify exact 10,000 sum conservation
  let sumBps = result.reduce((sum, a) => sum + a.weightBps, 0);
  let diff = 10_000 - sumBps;
  while (diff !== 0) {
    if (diff > 0) {
      result[0].weightBps++;
      diff--;
    } else {
      let maxIdx = 0;
      for (let i = 1; i < result.length; i++) {
        if (result[i].weightBps > result[maxIdx].weightBps) {
          maxIdx = i;
        }
      }
      if (result[maxIdx].weightBps > 1) {
        result[maxIdx].weightBps--;
        diff++;
      } else {
        break;
      }
    }
  }

  return result;
}

/** Calculate market-cap weighted basis points using live catalog metrics and largest remainder. */
export function calculateMarketCapWeights(
  selected: Array<{ mint: string; symbol: string; name?: string }>,
  catalog: MarketAsset[],
): BasketAllocation[] {
  if (!selected.length || selected.length > MAX_CUSTOM_BASKET_LEGS) {
    throw new Error(`Select between 1 and ${MAX_CUSTOM_BASKET_LEGS} assets.`);
  }
  const byMint = new Map(catalog.map((a) => [a.mint, a]));
  const caps = selected.map((s) => {
    const asset = byMint.get(s.mint);
    const cap = asset?.underlyingMarketCapUsd ?? asset?.marketCapUsd;
    if (cap == null || !Number.isFinite(cap) || cap < 1) {
      throw new Error(
        `Market cap is unavailable for ${s.symbol}. Choose equal or manual weights.`,
      );
    }
    return BigInt(Math.round(cap));
  });
  const totalCap = caps.reduce((sum, c) => sum + c, 0n);
  const weights = caps.map((cap) => Number((cap * 10_000n) / totalCap));
  const remainders = caps
    .map((cap, index) => ({ index, remainder: (cap * 10_000n) % totalCap }))
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.index - b.index
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
  const leftover = 10_000 - weights.reduce((sum, value) => sum + value, 0);
  for (let i = 0; i < leftover; i++) weights[remainders[i].index]++;
  if (weights.some((weight) => weight <= 0))
    throw new Error(
      "A market-cap weight is too small. Choose equal or manual weights.",
    );
  return selected.map((s, i) => ({
    mint: s.mint,
    symbol: s.symbol,
    name: s.name,
    weightBps: weights[i],
  }));
}

/** Resolves a ProgrammableBasket into an executable MarketBasket against the live catalog. */
export function resolveProgrammableBasket(
  basket: ProgrammableBasket,
  assets: MarketAsset[],
): MarketBasket {
  const byMint = new Map(assets.map((a) => [a.mint, a]));
  const missingSymbols: string[] = [];
  const unpricedSymbols: string[] = [];
  const resolvedMembers: Array<{ asset: MarketAsset; weight: number }> = [];

  for (const alloc of basket.allocations) {
    const asset = byMint.get(alloc.mint);
    if (!asset) {
      missingSymbols.push(alloc.symbol);
    } else {
      if (
        asset.priceUsd === null ||
        !Number.isFinite(asset.priceUsd) ||
        asset.priceUsd <= 0
      ) {
        unpricedSymbols.push(asset.symbol);
      }
      resolvedMembers.push({ asset, weight: alloc.weightBps });
    }
  }

  const available =
    missingSymbols.length === 0 &&
    unpricedSymbols.length === 0 &&
    resolvedMembers.length >= MIN_CUSTOM_BASKET_LEGS &&
    resolvedMembers.every(
      ({ asset }) => asset.verified && !asset.tradingHalted,
    );

  return {
    id: basket.id,
    name: basket.name,
    ticker: basket.ticker,
    category: basket.category,
    description: basket.description,
    assets: resolvedMembers,
    missingSymbols,
    unpricedSymbols,
    available,
    isCustom: true,
    creatorName: basket.creatorName,
    creatorSocial: basket.creatorSocial,
  };
}

/** Compact URL-safe encoder for sharing custom basket links. */
export function encodeBasketShareCode(basket: ProgrammableBasket): string {
  const payload: Record<string, unknown> = {
    n: basket.name,
    t: basket.ticker,
    d: basket.description,
    c: basket.category,
    a: basket.allocations.map((a) => [a.mint, a.symbol, a.weightBps]),
    r: basket.rebalanceRules.driftThresholdBps,
  };
  if (basket.creatorName) payload.u = basket.creatorName;
  if (basket.creatorSocial) payload.s = basket.creatorSocial;

  const json = JSON.stringify(payload);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json).toString("base64url");
  }
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decodes a shared basket link payload into a valid ProgrammableBasket. */
export function decodeBasketShareCode(code: string): ProgrammableBasket | null {
  try {
    const padded = code.replace(/-/g, "+").replace(/_/g, "/");
    let json: string;
    if (typeof Buffer !== "undefined") {
      json = Buffer.from(code, "base64url").toString("utf8");
    } else {
      json = atob(padded);
    }
    const parsed = JSON.parse(json);
    if (!isRecord(parsed) || !Array.isArray(parsed.a)) return null;

    const allocations: BasketAllocation[] = parsed.a.map((item: unknown) => {
      if (!Array.isArray(item) || item.length < 3)
        throw new Error("Invalid allocation array");
      return {
        mint: String(item[0]),
        symbol: String(item[1]),
        weightBps: Number(item[2]),
      };
    });

    return validateProgrammableBasket({
      id: `custom-shared-${Date.now()}`,
      name: String(parsed.n || "Shared Basket"),
      ticker: String(parsed.t || "CUSTOM"),
      description: String(parsed.d || "Shared programmable basket"),
      category: parsed.c || "custom",
      allocations,
      rebalanceRules: { driftThresholdBps: Number(parsed.r) || 500 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isCustom: true,
      creatorName: typeof parsed.u === "string" ? parsed.u : undefined,
      creatorSocial: typeof parsed.s === "string" ? parsed.s : undefined,
    });
  } catch {
    return null;
  }
}

/** Forks any existing curated basket into an editable custom basket. */
export function forkCuratedBasket(basket: MarketBasket): ProgrammableBasket {
  // Take up to 4 assets to guarantee mainnet V1 account limits
  const topAssets = basket.assets.slice(0, MAX_CUSTOM_BASKET_LEGS);
  const count = topAssets.length;
  const base = Math.floor(10_000 / count);
  const remainder = 10_000 % count;
  const allocations: BasketAllocation[] = topAssets.map((item, i) => ({
    mint: item.asset.mint,
    symbol: item.asset.symbol,
    name: item.asset.name,
    weightBps: base + (i < remainder ? 1 : 0),
  }));

  const now = new Date().toISOString();
  return {
    id: `custom-${Date.now()}-${basket.id.slice(0, 8)}`,
    name: `My ${basket.name.replace(/^The /i, "")}`,
    ticker: `MY-${basket.ticker.replace(/^SOL-/i, "")}`,
    description: `Customized version of ${basket.name}. Adjusted allocations for personal thesis.`,
    category: basket.category ?? "custom",
    allocations,
    rebalanceRules: { driftThresholdBps: 500, schedule: "none" },
    createdAt: now,
    updatedAt: now,
    isCustom: true,
  };
}
