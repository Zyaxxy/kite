const { test } = require("node:test");
const assert = require("node:assert/strict");
const { KiteClient } = require("../dist/client/kite-client.js");
const market = {
  assets: [],
  baskets: [],
  network: "mainnet-beta",
  asOf: new Date().toISOString(),
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", etag: '"one"' },
  });
test("client validates mainnet responses and skips decoding a conditional 304", async () => {
  let calls = 0;
  const client = new KiteClient({
    fetcher: async (url, init) => {
      assert.equal(url, "/api/markets");
      if (++calls === 1) return json(market);
      assert.equal(init.headers["If-None-Match"], '"one"');
      return new Response(null, { status: 304 });
    },
  });
  assert.deepEqual((await client.getMarkets()).data, market);
  assert.deepEqual(await client.getMarkets({ etag: '"one"' }), {
    notModified: true,
    etag: '"one"',
  });
  await assert.rejects(
    () =>
      new KiteClient({
        fetcher: async () => json({ ...market, network: "devnet" }),
      }).getMarkets(),
    /invalid response/,
  );
});
test("client gives actionable HTML/tunnel errors and rejects credential URLs", async () => {
  assert.throws(
    () => new KiteClient({ baseUrl: "https://user:secret@example.com" }),
    /without credentials/,
  );
  assert.throws(
    () => new KiteClient({ baseUrl: "http://example.com" }),
    /HTTPS/,
  );
  await assert.rejects(
    () =>
      new KiteClient({
        fetcher: async () =>
          new Response("<html>Login</html>", {
            headers: { "content-type": "text/html" },
          }),
      }).getMarkets(),
    /deployment access/,
  );
});
test("execution response loss remains Unknown and is never retried", async () => {
  let attempts = 0;
  const client = new KiteClient({
    fetcher: async () => {
      attempts++;
      throw new Error("network dropped after broadcast");
    },
  });
  assert.equal(
    (
      await client.executeTrade({
        signedTransaction: "signed",
        authorization: "proof",
      })
    ).status,
    "Unknown",
  );
  assert.equal(attempts, 1);
});
test("wallet data cannot be returned for a different wallet", async () => {
  const client = new KiteClient({
    fetcher: async () =>
      json({ walletAddress: "other", network: "mainnet-beta", holdings: [] }),
  });
  await assert.rejects(
    () => client.getPortfolio("requested"),
    /invalid response/,
  );
});
test("cancellation propagates without leaking upstream URLs or errors", async () => {
  const controller = new AbortController();
  const client = new KiteClient({
    fetcher: (_url, init) =>
      new Promise((_, reject) =>
        init.signal.addEventListener("abort", () =>
          reject(new Error("secret provider URL")),
        ),
      ),
  });
  const request = client.getMarkets({ signal: controller.signal });
  controller.abort();
  await assert.rejects(request, /Request cancelled/);
});

test("trade responses must preserve the requested amount and contain usable quote fields", async () => {
  const request = {
    inputMint: "input",
    outputMint: "output",
    amount: "1.25",
    taker: "wallet",
  };
  const order = {
    ...request,
    requestId: "request",
    transaction: "unsigned",
    authorization: "proof",
    inputDecimals: 6,
    outputDecimals: 8,
    inputSymbol: "IN",
    outputSymbol: "OUT",
    inAmount: "1250000",
    outAmount: "100000000",
    slippageBps: 50,
    feeBps: 0,
    router: "Jupiter",
    expiresAt: Date.now() + 45000,
  };
  assert.equal(
    (
      await new KiteClient({
        fetcher: async () => json(order),
      }).requestTradeOrder(request)
    ).inAmount,
    "1250000",
  );
  for (const changes of [
    { inAmount: "12500000" },
    { inputDecimals: 19 },
    { outAmount: "-1" },
    { outAmount: "1e8" },
    { transaction: "" },
    { requestId: "" },
    { slippageBps: 301 },
    { expiresAt: null },
    { otherAmountThreshold: "100000001" },
  ]) {
    await assert.rejects(
      () =>
        new KiteClient({
          fetcher: async () => json({ ...order, ...changes }),
        }).requestTradeOrder(request),
      /invalid response/,
    );
  }
  let finish;
  const client = new KiteClient({
    fetcher: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const pending = client.requestTradeOrder(request);
  request.amount = "999";
  finish(json(order));
  assert.equal((await pending).inAmount, "1250000");
});
test("cancellation discards late results even when a custom fetcher ignores AbortSignal", async () => {
  let finish;
  const controller = new AbortController();
  const client = new KiteClient({
    fetcher: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const request = client.getMarkets({ signal: controller.signal });
  controller.abort();
  finish(json(market));
  await assert.rejects(request, /cancelled/);
  for (const timeoutMs of [0, -1, NaN, Infinity, 120001])
    assert.throws(() => new KiteClient({ timeoutMs }), /timeout/);
});
test("explicit failure responses remain Failed while proxy errors remain Unknown", async () => {
  const failed = new KiteClient({
    fetcher: async () =>
      json({ status: "Failed", error: "Not submitted" }, 400),
  });
  assert.equal(
    (
      await failed.executeTrade({
        signedTransaction: "signed",
        authorization: "proof",
      })
    ).status,
    "Failed",
  );
  const unavailable = new KiteClient({
    fetcher: async () => json({ error: "Gateway failure" }, 503),
  });
  assert.equal(
    (
      await unavailable.executeTrade({
        signedTransaction: "signed",
        authorization: "proof",
      })
    ).status,
    "Unknown",
  );
});
