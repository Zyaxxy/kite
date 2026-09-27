import test from "node:test";
import assert from "node:assert/strict";
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Keypair } from "@solana/web3.js";
import type { PublishedCreatorBasket } from "@kite/sdk";
import * as store from "../lib/server/creator-store";
import * as auth from "../lib/server/creator-auth";
import { readLimitedJson } from "../lib/server/request-policy";

const prefix = "kite:creators:v1:";
const require = createRequire(import.meta.url);
type Command = (string | number)[];

/** A fake Redis REST protocol with isolated persistent state, not a live service or credential. */
class RedisFixture {
  strings = new Map<string, string>();
  hashes = new Map<string, Map<string, string>>();
  sets = new Map<string, Set<string>>();
  sorted = new Map<string, Map<string, number>>();
  commands: Command[] = [];
  unavailable = false;
  private hash(key: string) {
    let value = this.hashes.get(key);
    if (!value) {
      value = new Map();
      this.hashes.set(key, value);
    }
    return value;
  }
  private set(key: string) {
    let value = this.sets.get(key);
    if (!value) {
      value = new Set();
      this.sets.set(key, value);
    }
    return value;
  }
  fetch: typeof fetch = async (url, options) => {
    assert.equal(String(url), "https://redis.test.invalid");
    assert.equal(
      new Headers(options?.headers).get("authorization"),
      "Bearer fixture-token",
    );
    if (this.unavailable) return new Response("unavailable", { status: 503 });
    const command = JSON.parse(String(options?.body)) as Command;
    this.commands.push(command);
    return Response.json({ result: this.execute(command) });
  };
  private execute(command: Command): unknown {
    const [operation, rawKey, ...arguments_] = command;
    const key = String(rawKey);
    if (operation === "GET") return this.strings.get(key) ?? null;
    if (operation === "MGET")
      return [rawKey, ...arguments_].map(
        (item) => this.strings.get(String(item)) ?? null,
      );
    if (operation === "SET") {
      if (arguments_.includes("NX") && this.strings.has(key)) return null;
      this.strings.set(key, String(arguments_[0]));
      return "OK";
    }
    if (operation === "HSET") {
      this.hash(key).set(String(arguments_[0]), String(arguments_[1]));
      return 1;
    }
    if (operation === "HDEL")
      return Number(this.hash(key).delete(String(arguments_[0])));
    if (operation === "HVALS") return [...this.hash(key).values()];
    if (operation === "HMGET")
      return arguments_.map(
        (field) => this.hash(key).get(String(field)) ?? null,
      );
    if (operation === "ZCARD") return this.sorted.get(key)?.size ?? 0;
    if (operation === "ZREVRANGE")
      return [...(this.sorted.get(key) ?? [])]
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id)
        .slice(Number(arguments_[0]), Number(arguments_[1]) + 1);
    if (operation === "EVAL") {
      const count = Number(arguments_[0]);
      const keys = arguments_.slice(1, count + 1).map(String);
      const values = arguments_.slice(count + 1).map(String);
      if (key.includes("SISMEMBER")) {
        // Redis atomically deduplicates the signature before incrementing the network-specific total.
        assert.equal(count, 2);
        assert.match(key, /SADD/);
        assert.match(key, /HSET/);
        const seen = this.set(keys[0]);
        if (seen.has(values[0])) return 0;
        seen.add(values[0]);
        const totals = this.hash(keys[1]);
        totals.set(
          values[1],
          (BigInt(totals.get(values[1]) ?? "0") + BigInt(values[2])).toString(),
        );
        return 1;
      }
      if (key.includes("ZADD")) {
        if (this.strings.has(keys[0])) return 1;
        if ((this.sorted.get(keys[2])?.size ?? 0) >= 100) return 0;
        this.strings.set(keys[0], values[0]);
        for (const index of keys.slice(1)) {
          const entries = this.sorted.get(index) ?? new Map<string, number>();
          entries.set(values[2], Number(values[1]));
          this.sorted.set(index, entries);
        }
        return 1;
      }
      if (key.includes("INCR")) {
        const next = Number(this.strings.get(keys[0]) ?? "0") + 1;
        this.strings.set(keys[0], String(next));
        return next;
      }
    }
    throw new Error(`Unexpected Redis test command: ${String(operation)}`);
  }
}

function fixtureBasket(
  wallet = Keypair.generate().publicKey.toBase58(),
): PublishedCreatorBasket {
  const now = new Date().toISOString();
  return {
    id: "creator-0123456789abcdef01234567",
    name: "Published allocation",
    ticker: "TEST",
    description: "Registry fixture",
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
    creatorWallet: wallet,
    isCustom: true,
    rebalanceRules: { driftThresholdBps: 500 },
    allocations: [
      {
        mint: Keypair.generate().publicKey.toBase58(),
        symbol: "AAPL",
        weightBps: 5000,
      },
      {
        mint: Keypair.generate().publicKey.toBase58(),
        symbol: "MSFT",
        weightBps: 5000,
      },
    ],
  };
}

async function withRedis(operation: (redis: RedisFixture) => Promise<void>) {
  const previous = {
    fetch: globalThis.fetch,
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
    secret: process.env.CREATOR_AUTH_SECRET,
    codes: process.env.CREATOR_INVITE_CODES,
  };
  const redis = new RedisFixture();
  globalThis.fetch = redis.fetch;
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.test.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fixture-token";
  process.env.CREATOR_AUTH_SECRET =
    "test-creator-secret-at-least-32-characters";
  process.env.CREATOR_INVITE_CODES = "multi-use-fixture";
  try {
    await operation(redis);
  } finally {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of Object.entries({
      UPSTASH_REDIS_REST_URL: previous.url,
      UPSTASH_REDIS_REST_TOKEN: previous.token,
      CREATOR_AUTH_SECRET: previous.secret,
      CREATOR_INVITE_CODES: previous.codes,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("confirmed receipt retries are idempotent, exact beyond float precision, and devnet never earns real points", async () =>
  withRedis(async () => {
    const basket = fixtureBasket();
    await store.publishCreatorBasket(basket);
    const owner = Keypair.generate().publicKey.toBase58();
    const receipt = {
      basketId: basket.id,
      owner,
      signature: "2".repeat(88),
      amountBaseUnits: "9007199254740993",
      network: "mainnet-beta" as const,
    };
    await store.recordCreatorVolume(receipt);
    await store.recordCreatorVolume(receipt);
    let stats = await store.getCreatorStats(basket.creatorWallet);
    assert.equal(stats.volumeUsdcBaseUnits, receipt.amountBaseUnits);
    assert.equal(stats.points, "90071992");
    await store.recordCreatorVolume({
      ...receipt,
      network: "devnet",
      amountBaseUnits: "99999999999999999",
    });
    stats = await store.getCreatorStats(basket.creatorWallet);
    assert.equal(stats.points, "90071992");
    assert.equal(stats.devnet.volumeBaseUnits, "99999999999999999");
  }));

test("self-referral volume and plans are excluded; expired/closed plans do not count and subscribers are unique", async () =>
  withRedis(async () => {
    const basket = fixtureBasket();
    await store.publishCreatorBasket(basket);
    const owner = Keypair.generate().publicKey.toBase58();
    const plan = {
      basketId: basket.id,
      owner,
      plan: Keypair.generate().publicKey.toBase58(),
      status: "active" as const,
      network: "devnet" as const,
      expiresAt: Date.now() + 60000,
    };
    await store.recordCreatorVolume({
      basketId: basket.id,
      owner: basket.creatorWallet,
      signature: "3".repeat(88),
      amountBaseUnits: "100000000",
      network: "mainnet-beta",
    });
    await store.recordCreatorSubscription({
      ...plan,
      owner: basket.creatorWallet,
    });
    assert.equal(
      (await store.getCreatorStats(basket.creatorWallet)).devnet
        .activeSubscribers,
      0,
    );
    await store.recordCreatorSubscription(plan);
    const second = { ...plan, plan: Keypair.generate().publicKey.toBase58() };
    await store.recordCreatorSubscription(second);
    await store.recordCreatorSubscription({
      ...plan,
      owner: Keypair.generate().publicKey.toBase58(),
      plan: Keypair.generate().publicKey.toBase58(),
      expiresAt: Date.now() - 1,
    });
    let stats = await store.getCreatorStats(basket.creatorWallet);
    assert.equal(stats.devnet.activeSubscribers, 1);
    assert.equal(stats.activeSubscribers, 0);
    assert.equal(stats.points, "0");
    assert.equal(stats.volumeUsdcBaseUnits, "0");
    await store.recordCreatorSubscription({ ...plan, status: "closed" });
    await store.recordCreatorSubscription({ ...second, status: "closed" });
    stats = await store.getCreatorStats(basket.creatorWallet);
    assert.equal(stats.devnet.activeSubscribers, 0);
    await assert.rejects(
      () =>
        store.recordCreatorSubscription({ ...plan, network: "mainnet-beta" }),
      /not enabled/,
    );
  }));

test("missing or unavailable shared storage fails closed and nonce claims cannot replay", async () =>
  withRedis(async (redis) => {
    await store.claimCreatorNonce("fixture-nonce");
    await assert.rejects(
      () => store.claimCreatorNonce("fixture-nonce"),
      (error: unknown) =>
        error instanceof store.CreatorServiceError && error.status === 409,
    );
    const basket = fixtureBasket();
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    await assert.rejects(
      () => store.publishCreatorBasket(basket),
      /needs shared storage/,
    );
    await assert.rejects(
      () => store.getCreatorStats(basket.creatorWallet),
      /needs shared storage/,
    );
    process.env.UPSTASH_REDIS_REST_TOKEN = "fixture-token";
    redis.unavailable = true;
    await assert.rejects(
      () => store.resolvePublishedCreatorBasket(basket.id),
      /temporarily unavailable/,
    );
    delete process.env.CREATOR_AUTH_SECRET;
    assert.equal(auth.creatorPublishingConfigured(), false);
    assert.throws(
      () =>
        auth.prepareCreatorApproval(
          basket,
          basket.creatorWallet,
          "https://kite.test",
        ),
      /not configured/,
    );
  }));

function route(path: string, overrides: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  const source = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  runInNewContext(source, {
    exports,
    require: (name: string) =>
      Object.hasOwn(overrides, name) ? overrides[name] : require(name),
    Buffer,
    URL,
  });
  return exports as {
    GET: (request: Request) => Promise<Response>;
    POST: (request: Request) => Promise<Response>;
  };
}

test("public publishing requires owner signature and invite, rejects replay, and retains a multi-use invite for the next basket", async () =>
  withRedis(async () => {
    const owner = Keypair.generate();
    const privateKey = createPrivateKey({
      key: Buffer.concat([
        Buffer.from("302e020100300506032b657004220420", "hex"),
        Buffer.from(owner.secretKey.subarray(0, 32)),
      ]),
      format: "der",
      type: "pkcs8",
    });
    const api = route("../app/api/creators/baskets/route.ts", {
      "@/lib/server/request-policy": { readLimitedJson },
      "@/lib/server/creator-auth": auth,
      "@/lib/server/creator-store": store,
      "@/lib/site": { siteUrl: () => new URL("https://kite.test") },
    });
    const prepare = (name: string) => {
      const approval = auth.prepareCreatorApproval(
        { ...fixtureBasket(owner.publicKey.toBase58()), name },
        owner.publicKey.toBase58(),
        "https://kite.test",
      );
      return {
        token: approval.token,
        signature: sign(
          null,
          Buffer.from(approval.message),
          privateKey,
        ).toString("base64"),
        inviteCode: "multi-use-fixture",
      };
    };
    const request = (body: unknown) =>
      new Request("https://kite.test/api/creators/baskets", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
    const first = prepare("First basket");
    assert.equal(
      (
        await api.POST(
          request({ ...first, signature: Buffer.alloc(64).toString("base64") }),
        )
      ).status,
      401,
    );
    assert.equal(
      (await api.POST(request({ ...first, inviteCode: "invalid" }))).status,
      403,
    );
    assert.equal((await api.POST(request(first))).status, 201);
    assert.equal((await api.POST(request(first))).status, 409);
    assert.equal(
      (await api.POST(request(prepare("Second basket")))).status,
      201,
    );
    assert.equal(
      (await store.listPublishedCreatorBaskets(owner.publicKey.toBase58()))
        .length,
      2,
    );
  }));

test("stats API refuses to invent totals when authoritative subscription verification is unavailable", async () =>
  withRedis(async () => {
    const basket = fixtureBasket();
    await store.publishCreatorBasket(basket);
    await store.recordCreatorSubscription({
      basketId: basket.id,
      owner: Keypair.generate().publicKey.toBase58(),
      plan: Keypair.generate().publicKey.toBase58(),
      status: "active",
      network: "devnet",
      expiresAt: Date.now() + 60000,
    });
    let statsRead = false;
    const api = route("../app/api/creators/stats/route.ts", {
      "@/lib/server/creator-auth": auth,
      "@/lib/server/creator-store": {
        ...store,
        getCreatorStats: async (wallet: string) => {
          statsRead = true;
          return store.getCreatorStats(wallet);
        },
      },
      "@/lib/server/recurring-devnet": {
        reconcileCreatorSubscriptions: async () => {
          throw new Error("Devnet authoritative RPC unavailable");
        },
      },
    });
    const response = await api.GET(
      new Request(
        `https://kite.test/api/creators/stats?wallet=${basket.creatorWallet}`,
      ),
    );
    assert.equal(response.status, 503);
    assert.equal(statsRead, false);
    const payload = (await response.json()) as Record<string, unknown>;
    assert.equal(Object.hasOwn(payload, "points"), false);
    assert.match(String(payload.error), /unavailable/);
  }));

test("stats reconciles creators above 100 plans and uses the verified snapshot without a second unchecked read", async () =>
  withRedis(async (redis) => {
    const basket = fixtureBasket();
    await store.publishCreatorBasket(basket);
    const receipts = Array.from({ length: 201 }, () => ({
      basketId: basket.id,
      owner: Keypair.generate().publicKey.toBase58(),
      plan: Keypair.generate().publicKey.toBase58(),
      status: "active" as const,
      network: "devnet" as const,
      expiresAt: Date.now() + 60000,
    }));
    redis.hashes.set(
      `${prefix}subscriptions:${basket.creatorWallet}`,
      new Map(
        receipts.map((receipt) => [receipt.plan, JSON.stringify(receipt)]),
      ),
    );
    const api = route("../app/api/creators/stats/route.ts", {
      "@/lib/server/creator-auth": auth,
      "@/lib/server/creator-store": store,
      "@/lib/server/recurring-devnet": {
        reconcileCreatorSubscriptions: async (
          loaded: store.CreatorSubscriptionReceipt[],
        ) => {
          assert.equal(loaded.length, 201);
          // Only one plan remains authorized on chain; the rest must not leak back into counts.
          return loaded.slice(0, 1);
        },
      },
    });
    const response = await api.GET(
      new Request(
        `https://kite.test/api/creators/stats?wallet=${basket.creatorWallet}`,
      ),
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.devnet.activeSubscribers, 1);
    assert.equal(body.activeSubscribers, 0);
    assert.equal(body.points, "0");
    assert.equal(
      redis.commands.filter(([operation]) => operation === "HVALS").length,
      1,
    );
  }));
