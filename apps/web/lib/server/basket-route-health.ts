import { randomUUID } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import {
  allocateBasketInput,
  BASE_SWAP_TOKENS,
  MAINNET_SOL_MINT,
  MAINNET_USDC_MINT,
  MAINNET_USDT_MINT,
  classifyJupiterRouteError,
  routeProbeAmount,
  getJupiterIntermediateMints,
  resolveAllMarketBaskets,
  toTokenAmount,
  ROUTE_HEALTH_LABELS,
  type BasketRouteHealth,
  type BasketRouteHealthRequest,
  type BasketRouteCoverage,
  type RouteObservation,
} from "@kite/sdk";
import { createRouteHealthCache } from "./route-health-cache";
import { executeRedisCommand, isRedisConfigured } from "./redis";
import { fetchJupiterQuote } from "./jupiter-build";
import { getServerMarkets } from "./markets";
import { resolvePublishedCreatorBasket } from "./creator-store";
import { assertMainnet } from "./composed-transactions";

export const ROUTE_FUNDING = BASE_SWAP_TOKENS.filter((token) =>
  [MAINNET_USDC_MINT, MAINNET_USDT_MINT, MAINNET_SOL_MINT].includes(token.mint),
);
const PREFIX = "kite:route-health:v1:";
const localClaims = new Map<string, string>();
let localBudget = { minute: 0, count: 0 };
let networkReadyUntil = 0;
let networkCheck: Promise<void> | null = null;
async function verifyHealthNetwork() {
  if (networkReadyUntil > Date.now()) return;
  if (!networkCheck)
    networkCheck = assertMainnet()
      .then(() => {
        networkReadyUntil = Date.now() + 300_000;
      })
      .finally(() => {
        networkCheck = null;
      });
  await networkCheck;
}
const cache = createRouteHealthCache({
  async read(key) {
    const raw = await executeRedisCommand<string>(["GET", PREFIX + key], 1500);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  async write(key, value) {
    await executeRedisCommand(
      ["SET", PREFIX + key, JSON.stringify(value), "EX", 1800],
      1500,
    );
  },
  async claim(key) {
    const token = randomUUID();
    if (isRedisConfigured())
      return (await executeRedisCommand(
        ["SET", PREFIX + "lease:" + key, token, "NX", "EX", 90],
        1500,
      )) === "OK"
        ? token
        : null;
    // Production requires shared coordination; outages never fan out to Jupiter.
    if (process.env.NODE_ENV === "production") return null;
    if (localClaims.has(key)) return null;
    localClaims.set(key, token);
    return token;
  },
  async release(key, token) {
    if (isRedisConfigured())
      await executeRedisCommand(
        [
          "EVAL",
          "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",
          1,
          PREFIX + "lease:" + key,
          token,
        ],
        1500,
      );
    else if (localClaims.get(key) === token) localClaims.delete(key);
  },
  async budget() {
    const minute = Math.floor(Date.now() / 60_000);
    // Reserve three requests per leg for the worst-case retry ladder: <=36 calls/min.
    if (isRedisConfigured()) {
      const count = await executeRedisCommand<number>(
        [
          "EVAL",
          "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],120) end; return n",
          1,
          PREFIX + "budget:" + minute,
        ],
        1500,
      );
      return count !== null && count <= 12;
    }
    if (localBudget.minute !== minute) localBudget = { minute, count: 0 };
    return ++localBudget.count <= 12;
  },
});
function key(
  inputMint: string,
  outputMint: string,
  probe: string,
  slippage: number,
) {
  return `mainnet:metis:32-40-48:${inputMint}:${outputMint}:${probe}:${slippage}`;
}
export function routeFundingToken(mint: string) {
  const token = ROUTE_FUNDING.find((value) => value.mint === mint);
  if (!token || token.decimals === null)
    throw new Error("Route checks support USDC, USDT and SOL funding.");
  return { ...token, decimals: token.decimals };
}
export function validateRouteHealthRequest(input: BasketRouteHealthRequest) {
  if (
    !input ||
    typeof input.inputMint !== "string" ||
    typeof input.amount !== "string" ||
    input.amount.length > 40 ||
    !Number.isInteger(input.slippageBps) ||
    ![50, 100, 200, 300].includes(input.slippageBps) ||
    (input.basketId !== undefined &&
      (typeof input.basketId !== "string" || input.basketId.length > 128)) ||
    (!input.basketId && !input.allocations)
  )
    throw new Error("Invalid route-health request.");
  const funding = routeFundingToken(input.inputMint);
  toTokenAmount(input.amount, funding.decimals);
  if (input.allocations !== undefined) {
    if (
      !Array.isArray(input.allocations) ||
      input.allocations.length < 1 ||
      input.allocations.length > 12
    )
      throw new Error("Choose between one and twelve assets for route checks.");
    for (const allocation of input.allocations) {
      if (
        !allocation ||
        typeof allocation.mint !== "string" ||
        new PublicKey(allocation.mint).toBase58() !== allocation.mint
      )
        throw new Error("Invalid allocation mint.");
    }
    allocateBasketInput(
      BigInt(toTokenAmount(input.amount, funding.decimals)),
      input.allocations,
    );
  }
}

export async function observeRoute(
  inputMint: string,
  outputMint: string,
  probeAmount: string,
  slippageBps: number,
): Promise<RouteObservation> {
  return cache.get(
    key(inputMint, outputMint, probeAmount, slippageBps),
    probeAmount,
    async () => {
      const apiKey = process.env.JUPITER_API_KEY;
      if (!apiKey)
        return {
          status: "unknown",
          probeAmount,
          maxAccounts: null,
          detail:
            "Jupiter routing is not configured. Liquidity was not determined.",
        };
      await verifyHealthNetwork();
      const response = await fetchJupiterQuote(
        new URLSearchParams({
          inputMint,
          outputMint,
          amount: probeAmount,
          slippageBps: String(slippageBps),
          swapMode: "ExactIn",
          maxAccounts: "32",
        }),
        apiKey,
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const status = classifyJupiterRouteError(response.status, data);
        return {
          status,
          probeAmount,
          maxAccounts: null,
          detail:
            status === "unknown"
              ? "Jupiter could not check this route. Liquidity is unknown."
              : ROUTE_HEALTH_LABELS[status] +
                ". Try a different amount or funding token.",
        };
      }
      const raw = (value: unknown): value is string =>
        typeof value === "string" &&
        /^\d{1,20}$/.test(value) &&
        BigInt(value) > BigInt(0) &&
        BigInt(value) < BigInt(2) ** BigInt(64);
      if (
        !data ||
        data.inputMint !== inputMint ||
        data.outputMint !== outputMint ||
        data.inAmount !== probeAmount ||
        data.swapMode !== "ExactIn" ||
        data.slippageBps !== slippageBps ||
        !raw(data.outAmount) ||
        !raw(data.otherAmountThreshold) ||
        BigInt(data.otherAmountThreshold) > BigInt(data.outAmount) ||
        BigInt(data.otherAmountThreshold) <
          (BigInt(data.outAmount) * BigInt(10_000 - slippageBps)) /
            BigInt(10_000) ||
        (data.platformFee?.feeBps ?? 0) !== 0
      )
        throw new Error("Invalid advisory quote.");
      getJupiterIntermediateMints(data.routePlan, inputMint, outputMint);
      const maxAccounts =
        Number(response.headers.get("x-kite-route-max-accounts")) || 32;
      return {
        status: "routable",
        probeAmount,
        maxAccounts,
        detail:
          maxAccounts > 32
            ? "Route found with a wider account search. Complete basket fit is checked at review."
            : "Jupiter returned a quote at this probe amount. Complete basket fit is checked at review.",
      };
    },
  );
}

export async function getBasketRouteHealth(
  input: BasketRouteHealthRequest,
): Promise<BasketRouteHealth> {
  validateRouteHealthRequest(input);
  const funding = routeFundingToken(input.inputMint);
  const market = await getServerMarkets();
  const published = input.basketId?.startsWith("creator-")
    ? await resolvePublishedCreatorBasket(input.basketId)
    : null;
  if (
    input.basketId?.startsWith("creator-") &&
    (!published || input.allocations)
  )
    throw new Error("Published allocations must be checked unchanged.");
  const basket = resolveAllMarketBaskets(market.assets).find(
    (value) => value.id === input.basketId,
  );
  if (
    !input.allocations &&
    !published &&
    (!basket || basket.missingSymbols.length)
  )
    throw new Error("The complete basket catalog is unavailable.");
  const weights =
    published?.allocations ??
    input.allocations ??
    basket!.assets.map(({ asset, weight }) => ({
      mint: asset.mint,
      weightBps: weight,
    }));
  const allocations = allocateBasketInput(
    BigInt(toTokenAmount(input.amount, funding.decimals)),
    weights,
  );
  const legs = await Promise.all(
    allocations.map(async (allocation) => {
      const asset = market.assets.find(
        (value) => value.mint === allocation.mint,
      );
      const probeAmount = routeProbeAmount(allocation.amount, funding.decimals);
      const observation: RouteObservation =
        !asset ||
        !asset.verified ||
        asset.tradingHalted ||
        !(Number(asset.priceUsd) > 0)
          ? {
              status: "unavailable",
              checkedAt: Date.now(),
              expiresAt: Date.now() + 60_000,
              consistent: false,
              probeAmount,
              maxAccounts: null,
              detail:
                "Verified asset, trading status or token price is unavailable.",
            }
          : allocation.mint === input.inputMint
            ? {
                status: "routable",
                checkedAt: Date.now(),
                expiresAt: Date.now() + 300_000,
                consistent: true,
                probeAmount,
                maxAccounts: 0,
                detail:
                  "This allocation remains in your funding token; no swap is needed.",
              }
            : await observeRoute(
                input.inputMint,
                allocation.mint,
                probeAmount,
                input.slippageBps,
              );
      return {
        ...observation,
        mint: allocation.mint,
        symbol: asset?.symbol ?? allocation.mint,
        allocatedAmount: allocation.amount.toString(),
        liquidityUsd: asset?.liquidityUsd ?? null,
      };
    }),
  );
  return {
    network: "mainnet-beta",
    inputMint: input.inputMint,
    inputSymbol: funding.symbol,
    inputDecimals: funding.decimals,
    amount: input.amount,
    slippageBps: input.slippageBps,
    advisory: true,
    legs,
  };
}

/** Card curation uses cached, repeated observations at fixed per-asset probes. */
export async function getBasketRouteCoverage(): Promise<BasketRouteCoverage[]> {
  const market = await getServerMarkets();
  return Promise.all(
    resolveAllMarketBaskets(market.assets).map(async (basket) => {
      const funding = await Promise.all(
        ROUTE_FUNDING.map(async (token) => {
          const probe = toTokenAmount(
            token.mint === MAINNET_SOL_MINT ? "0.1" : "25",
            token.decimals!,
          );
          const observations = await Promise.all(
            basket.assets.map(({ asset }) =>
              cache.peek(key(token.mint, asset.mint, probe, 100)),
            ),
          );
          const all =
            basket.available &&
            observations.length > 0 &&
            observations.every((value) => value !== null);
          const checkedAt = all
            ? Math.min(...observations.map((value) => value!.checkedAt))
            : null;
          const stale =
            !all ||
            observations.some(
              (value) => !value || value.expiresAt <= Date.now(),
            );
          const routable = observations.filter(
            (value) => value?.status === "routable",
          ).length;
          return {
            inputMint: token.mint,
            symbol: token.symbol,
            routable,
            total: basket.assets.length + basket.missingSymbols.length,
            checkedAt,
            stale,
            consistent:
              all &&
              !stale &&
              observations.every(
                (value) => value!.status === "routable" && value!.consistent,
              ),
          };
        }),
      );
      return {
        basketId: basket.id,
        funding,
        featured: funding.every((value) => value.consistent),
      };
    }),
  );
}

/** Small bounded sweep, shared cache leases/budget; safe to call from Next after(). */
export async function warmDefaultRouteHealth(): Promise<void> {
  const started = Date.now();
  const market = await getServerMarkets();
  const assets = [
    ...new Map(
      resolveAllMarketBaskets(market.assets)
        .filter((basket) => basket.available)
        .flatMap((basket) =>
          basket.assets.map(({ asset }) => [asset.mint, asset] as const),
        ),
    ).values(),
  ];
  const jobs = (
    await Promise.all(
      assets.flatMap((asset) =>
        ROUTE_FUNDING.map(async (token) => {
          const probe = toTokenAmount(
            token.mint === MAINNET_SOL_MINT ? "0.1" : "25",
            token.decimals!,
          );
          const observation = await cache.peek(
            key(token.mint, asset.mint, probe, 100),
          );
          return { token, asset, probe, observation };
        }),
      ),
    )
  )
    .filter(
      (job) => !job.observation || job.observation.expiresAt <= Date.now(),
    )
    .sort(
      (a, b) =>
        (a.observation?.checkedAt ?? 0) - (b.observation?.checkedAt ?? 0),
    );
  for (const job of jobs.slice(0, 8)) {
    if (Date.now() - started > 35_000) break;
    await observeRoute(job.token.mint, job.asset.mint, job.probe, 100);
  }
}
