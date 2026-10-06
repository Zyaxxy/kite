import {
  calculateCreatorPoints,
  type CreatorStats,
  type PublishedCreatorBasket,
} from "@kite/sdk";
import {
  recurringRpcTimeout,
  withinRecurringDeadline,
} from "./devnet-connection";

const PREFIX = "kite:creators:v1:";
export class CreatorServiceError extends Error {
  constructor(
    message: string,
    public readonly status = 503,
  ) {
    super(message);
  }
}

/** Creator records are durable data, unlike the optional market cache. Fail closed. */
export async function creatorRedis<T>(command: unknown[]): Promise<T> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token)
    throw new CreatorServiceError(
      "Creator publishing needs shared storage. Private drafts still work.",
    );
  try {
    const response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(Math.min(5_000, recurringRpcTimeout())),
    });
    if (!response.ok) throw new Error("Storage unavailable");
    const result = (await response.json()) as { result?: T; error?: string };
    if (result.error || !Object.hasOwn(result, "result"))
      throw new Error("Storage error");
    return result.result as T;
  } catch {
    throw new CreatorServiceError(
      "Creator publishing is temporarily unavailable. Your private draft is safe; please retry.",
    );
  }
}

export async function limitCreatorAttempts(wallet: string): Promise<void> {
  const count = await creatorRedis<number>([
    "EVAL",
    "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],600) end; return n",
    1,
    `${PREFIX}attempts:${wallet}`,
  ]);
  if (count > 12)
    throw new CreatorServiceError(
      "Too many publishing attempts. Try again in 10 minutes.",
      429,
    );
}

export async function claimCreatorNonce(nonce: string): Promise<void> {
  const result = await creatorRedis<string | null>([
    "SET",
    `${PREFIX}nonce:${nonce}`,
    "used",
    "NX",
    "EX",
    600,
  ]);
  if (result !== "OK")
    throw new CreatorServiceError(
      "This approval has already been used. Review the basket again.",
      409,
    );
}

export async function resolvePublishedCreatorBasket(
  id: string,
): Promise<PublishedCreatorBasket | null> {
  if (!/^creator-[a-f0-9]{24}$/.test(id)) return null;
  const value = await creatorRedis<string | null>([
    "GET",
    `${PREFIX}basket:${id}`,
  ]);
  if (!value) return null;
  try {
    const basket = JSON.parse(value) as PublishedCreatorBasket;
    if (
      basket.id !== id ||
      !basket.creatorWallet ||
      !Array.isArray(basket.allocations)
    )
      throw new Error();
    return basket;
  } catch {
    throw new CreatorServiceError(
      "This published basket record is unavailable.",
    );
  }
}

export async function publishCreatorBasket(
  basket: PublishedCreatorBasket,
): Promise<void> {
  // Immutable versions: replacing allocations changes the content-derived ID.
  const saved = await creatorRedis<number>([
    "EVAL",
    `
    if redis.call('EXISTS',KEYS[1]) == 1 then return 1 end
    if redis.call('ZCARD',KEYS[3]) >= 100 then return 0 end
    redis.call('SET',KEYS[1],ARGV[1])
    redis.call('ZADD',KEYS[2],ARGV[2],ARGV[3])
    redis.call('ZADD',KEYS[3],ARGV[2],ARGV[3])
    return 1`,
    3,
    `${PREFIX}basket:${basket.id}`,
    `${PREFIX}published`,
    `${PREFIX}wallet:${basket.creatorWallet}`,
    JSON.stringify(basket),
    Date.parse(basket.publishedAt),
    basket.id,
  ]);
  if (saved !== 1)
    throw new CreatorServiceError(
      "This wallet has reached the 100 published basket limit.",
      409,
    );
}

export async function listPublishedCreatorBaskets(
  wallet?: string,
): Promise<PublishedCreatorBasket[]> {
  const index = wallet ? `${PREFIX}wallet:${wallet}` : `${PREFIX}published`;
  const ids = await creatorRedis<string[]>(["ZREVRANGE", index, 0, 99]);
  if (!ids.length) return [];
  const rows = await creatorRedis<(string | null)[]>([
    "MGET",
    ...ids.map((id) => `${PREFIX}basket:${id}`),
  ]);
  return rows.flatMap((row) =>
    row ? [JSON.parse(row) as PublishedCreatorBasket] : [],
  );
}

export interface CreatorVolumeReceipt {
  basketId: string;
  signature: string;
  owner: string;
  amountBaseUnits: string;
  network: "mainnet-beta" | "devnet";
}

/** Internal only: execution handlers call this after verifying the chain receipt.
 * Lua decimal addition preserves exact base units beyond JS/Redis float precision. */
export async function recordCreatorVolume(
  receipt: CreatorVolumeReceipt,
): Promise<void> {
  if (!/^creator-[a-f0-9]{24}$/.test(receipt.basketId)) return;
  if (
    !/^[1-9]\d{0,19}$/.test(receipt.amountBaseUnits) ||
    BigInt(receipt.amountBaseUnits) > BigInt("18446744073709551615") ||
    !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(receipt.signature)
  ) {
    throw new Error("Invalid confirmed creator receipt.");
  }
  const basket = await resolvePublishedCreatorBasket(receipt.basketId);
  if (!basket || basket.creatorWallet === receipt.owner) return; // No self-referral points.
  await creatorRedis<number>([
    "EVAL",
    `
    if redis.call('SISMEMBER',KEYS[1],ARGV[1])==1 then return 0 end
    local a=redis.call('HGET',KEYS[2],ARGV[2]) or '0'
    local b=ARGV[3]; local carry=0; local out=''; local i=#a; local j=#b
    while i>0 or j>0 or carry>0 do
      local x=i>0 and tonumber(string.sub(a,i,i)) or 0
      local y=j>0 and tonumber(string.sub(b,j,j)) or 0
      local s=x+y+carry; out=tostring(s%10)..out; carry=math.floor(s/10); i=i-1; j=j-1
    end
    redis.call('SADD',KEYS[1],ARGV[1]); redis.call('HSET',KEYS[2],ARGV[2],out); return 1`,
    2,
    `${PREFIX}receipts:${receipt.network}`,
    `${PREFIX}volume:${basket.creatorWallet}`,
    receipt.signature,
    receipt.network,
    receipt.amountBaseUnits,
  ]);
}

export interface CreatorSubscriptionReceipt {
  basketId: string;
  owner: string;
  plan: string;
  status: "active" | "closed";
  expiresAt: number;
  network: "devnet" | "mainnet-beta";
}

export async function recordCreatorSubscription(
  receipt: CreatorSubscriptionReceipt,
): Promise<void> {
  // There is no deployed mainnet recurring protocol in this release.
  if (receipt.network !== "devnet")
    throw new Error("Mainnet recurring attribution is not enabled.");
  if (!/^creator-[a-f0-9]{24}$/.test(receipt.basketId)) return;
  if (
    !Number.isFinite(receipt.expiresAt) ||
    !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(receipt.plan)
  )
    throw new Error("Invalid subscription receipt.");
  const basket = await resolvePublishedCreatorBasket(receipt.basketId);
  if (!basket || basket.creatorWallet === receipt.owner) return;
  const key = `${PREFIX}subscriptions:${basket.creatorWallet}`;
  if (receipt.status === "closed")
    await creatorRedis(["HDEL", key, receipt.plan]);
  else await creatorRedis(["HSET", key, receipt.plan, JSON.stringify(receipt)]);
}

export async function listCreatorSubscriptions(
  wallet: string,
): Promise<CreatorSubscriptionReceipt[]> {
  const rows = await creatorRedis<string[]>([
    "HVALS",
    `${PREFIX}subscriptions:${wallet}`,
  ]);
  return rows.map((row) => JSON.parse(row) as CreatorSubscriptionReceipt);
}

export function withinCreatorStatsDeadline<T>(
  operation: () => Promise<T>,
): Promise<T> {
  return withinRecurringDeadline(Date.now() + 25_000, operation);
}

export async function getCreatorStats(
  wallet: string,
  verifiedSubscriptions?: CreatorSubscriptionReceipt[],
): Promise<CreatorStats> {
  const [published, volume, plans] = await Promise.all([
    creatorRedis<number>(["ZCARD", `${PREFIX}wallet:${wallet}`]),
    creatorRedis<(string | null)[]>([
      "HMGET",
      `${PREFIX}volume:${wallet}`,
      "mainnet-beta",
      "devnet",
    ]),
    verifiedSubscriptions ?? listCreatorSubscriptions(wallet),
  ]);
  const active = plans.filter(
    (plan) =>
      plan.status === "active" &&
      plan.expiresAt > Date.now() &&
      plan.owner !== wallet,
  );
  const mainnet = new Set(
    active.filter((p) => p.network === "mainnet-beta").map((p) => p.owner),
  ).size;
  const devnet = new Set(
    active.filter((p) => p.network === "devnet").map((p) => p.owner),
  ).size;
  return {
    creatorWallet: wallet,
    publishedBaskets: published,
    activeSubscribers: mainnet,
    volumeUsdcBaseUnits: volume[0] ?? "0",
    points: calculateCreatorPoints(volume[0] ?? "0", mainnet),
    devnet: { activeSubscribers: devnet, volumeBaseUnits: volume[1] ?? "0" },
    asOf: new Date().toISOString(),
  };
}
