const test = require("node:test");
const assert = require("node:assert/strict");
const { getMainnetCatalog } = require("../dist/markets.js");

// Virtual elapsed time avoids a slow/flaky real network timeout regression.
// Signals remain real AbortSignals, including production AbortSignal.any calls.
function issuerFixture(context, { caller, batchMilliseconds = 4000 } = {}) {
  let elapsed = 0;
  const timeouts = [];
  const requestedPages = [];
  context.mock.method(AbortSignal, "timeout", (milliseconds) => {
    const controller = new AbortController();
    timeouts.push({ controller, expiresAt: elapsed + milliseconds });
    return controller.signal;
  });
  const advanceTo = (next) => {
    elapsed = Math.max(elapsed, next);
    for (const timeout of timeouts)
      if (timeout.expiresAt <= elapsed)
        timeout.controller.abort(
          new DOMException("Deadline exceeded", "TimeoutError"),
        );
  };
  const json = (value) => new Response(JSON.stringify(value));
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname !== "api.xstocks.fi") {
      if (url.pathname === "/api/metrics") return json({ metrics: [] });
      if (url.pathname === "/products") return new Response("");
      return json([]);
    }
    const page = Number(url.searchParams.get("page"));
    requestedPages.push(page);
    await Promise.resolve();
    if (page === 3 && caller) caller.abort();
    advanceTo((Math.floor(page / 3) + 1) * batchMilliseconds);
    init.signal.throwIfAborted();
    return json({
      nodes: [
        {
          symbol: `T${page}x`,
          name: `Issuer ${page}`,
          deployments: [
            {
              network: "Solana",
              address: "1".repeat(30) + "ABCDEFGHJ"[page] + "1",
            },
          ],
        },
      ],
      page: { hasNextPage: page < 8 },
    });
  };
  return { fetcher, requestedPages, elapsed: () => elapsed };
}

test("healthy paginated issuer catalog survives twelve seconds of cold responses", async (context) => {
  const fixture = issuerFixture(context);
  const catalog = await getMainnetCatalog({ fetcher: fixture.fetcher });
  assert.equal(fixture.elapsed(), 12000);
  assert.equal(
    catalog.assets.filter((asset) => asset.issuer === "xstocks").length,
    9,
  );
  assert.ok(catalog.sources.includes("xStocks issuer catalog"));
  assert.deepEqual(fixture.requestedPages, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test("caller cancellation still stops pagination before the longer catalog deadline", async (context) => {
  const caller = new AbortController();
  const fixture = issuerFixture(context, { caller });
  const catalog = await getMainnetCatalog({
    fetcher: fixture.fetcher,
    signal: caller.signal,
  });
  assert.equal(
    catalog.assets.some((asset) => asset.issuer === "xstocks"),
    false,
  );
  assert.equal(catalog.sources.includes("xStocks issuer catalog"), false);
  assert.ok(fixture.requestedPages.every((page) => page < 6));
  assert.ok(
    catalog.warnings.some((warning) => warning.startsWith("xStocks catalog")),
  );
});

test("catalog pagination remains bounded when provider batches exceed twenty seconds", async (context) => {
  const fixture = issuerFixture(context, { batchMilliseconds: 7500 });
  const catalog = await getMainnetCatalog({ fetcher: fixture.fetcher });
  assert.equal(
    catalog.assets.some((asset) => asset.issuer === "xstocks"),
    false,
  );
  assert.equal(catalog.sources.includes("xStocks issuer catalog"), false);
  assert.ok(
    catalog.warnings.some((warning) => warning.startsWith("xStocks catalog")),
  );
});
