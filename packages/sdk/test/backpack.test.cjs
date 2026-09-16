const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseBackpackSecurities,
  getBackpackCatalog,
} = require("../dist/backpack");
const { getMainnetCatalog, getMainnetMarkets } = require("../dist/markets");
const { hasCompleteIssuerCatalogs } = require("../dist/trading");
const mint = "SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb";
const session = {
  name: "US_EQUITIES_REGULAR",
  minQuantity: "0.01",
  maxQuantity: "10000",
  stepSize: "0.00001",
};
const security = {
  asset: "SPCX.US",
  name: "SpaceX",
  cusip: "000000000",
  sessions: [session],
};
const mapping = {
  symbol: "SPCX.US",
  tokens: [
    {
      blockchain: "Solana",
      contractAddress: mint,
      nativeDecimals: 6,
      depositEnabled: true,
      withdrawEnabled: true,
    },
  ],
};
const json = (value) =>
  new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });

test("discovery IDs never become fake mints or pretend prices", () => {
  const [result] = parseBackpackSecurities([security]);
  assert.equal(result.id, "backpack:SPCX.US");
  assert.equal(result.solanaMint, null);
  assert.equal(result.discoveryOnly, true);
  assert.equal("mint" in result, false);
  assert.equal("priceUsd" in result, false);
  assert.equal(result.underlyingSymbol, "SPCX");
});

test("only an unambiguous official Solana mapping with enabled transfers is eligible", () => {
  const parse = (assets) => parseBackpackSecurities([security], assets)[0];
  assert.equal(parse([mapping]).discoveryOnly, false);
  assert.equal(parse([mapping]).solanaMint, mint);
  for (const token of [
    { ...mapping.tokens[0], blockchain: "Ethereum" },
    { ...mapping.tokens[0], contractAddress: "backpack:SPCX.US" },
    { ...mapping.tokens[0], withdrawEnabled: false },
    { ...mapping.tokens[0], nativeDecimals: null },
  ])
    assert.equal(parse([{ ...mapping, tokens: [token] }]).discoveryOnly, true);
  const conflict = {
    ...mapping,
    tokens: [
      {
        ...mapping.tokens[0],
        contractAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      },
    ],
  };
  assert.equal(parse([mapping, conflict]).solanaMint, null);
  assert.deepEqual(parse([mapping, conflict]).candidateSolanaMints, [
    mint,
    conflict.tokens[0].contractAddress,
  ]);
  assert.equal(
    parse([
      mapping,
      { ...mapping, tokens: [{ ...mapping.tokens[0], depositEnabled: false }] },
    ]).discoveryOnly,
    true,
  );
});

test("exchange perpetuals, hidden books and RFQ symbols are not called spot availability", () => {
  const market = {
    baseSymbol: "SPCX.US",
    rwaMarketType: "STOCK",
    marketType: "SPOT",
    visible: true,
    symbol: "SPCX.US_USDC",
    orderBookState: "Open",
  };
  const [result] = parseBackpackSecurities(
    [security],
    [mapping],
    [
      market,
      { ...market, marketType: "PERP" },
      { ...market, visible: false },
      { ...market, marketType: "RFQ" },
    ],
  );
  assert.deepEqual(result.spotMarkets, [
    { symbol: "SPCX.US_USDC", state: "Open" },
  ]);
});

test("mapping outage preserves real discovery without enabling token orders", async () => {
  const result = await getBackpackCatalog({
    fetcher: async (url) =>
      String(url).endsWith("/securities")
        ? json([security])
        : new Response("", { status: 503 }),
  });
  assert.equal(result.securities.length, 1);
  assert.equal(result.securities[0].discoveryOnly, true);
  assert.equal(result.warnings.length, 2);
  await assert.rejects(
    getBackpackCatalog({ fetcher: async () => json({ results: [security] }) }),
    /catalog could not be loaded/,
  );
});

test("malformed mapping rows and mixed invalid securities cannot claim complete issuer verification", async () => {
  const result = await getBackpackCatalog({
    fetcher: async (url) => {
      if (String(url).endsWith("/securities")) return json([security]);
      if (String(url).endsWith("/assets"))
        return json([{ unexpectedSchema: true }]);
      return json([]);
    },
  });
  assert.equal(result.mappingsAvailable, false);
  assert.equal(result.securities[0].discoveryOnly, true);
  assert.ok(
    result.warnings.some((warning) =>
      warning.includes("mappings could not be verified"),
    ),
  );
  assert.throws(
    () =>
      parseBackpackSecurities(
        [security, { ...security, asset: "AAPL.US", sessions: null }],
        [mapping],
      ),
    /invalid listing/,
  );
  assert.throws(
    () => parseBackpackSecurities([security, security], [mapping]),
    /duplicate listing/,
  );
});

test("new-format snapshots require Backpack mappings before unknown-token trade fallback", () => {
  const snapshot = {
    status: "live",
    sources: ["xStocks issuer catalog", "PreStocks issuer catalog"],
  };
  assert.equal(
    hasCompleteIssuerCatalogs(snapshot),
    true,
    "old persisted snapshots remain readable",
  );
  snapshot.backpackSecurities = [];
  assert.equal(hasCompleteIssuerCatalogs(snapshot), false);
  snapshot.sources.push("Backpack securities catalog");
  assert.equal(hasCompleteIssuerCatalogs(snapshot), false);
  snapshot.sources.push("Backpack Solana mappings");
  assert.equal(hasCompleteIssuerCatalogs(snapshot), true);
});

test("only transfer-enabled tokens enter issuer pricing and catalog snapshots retain separate discovery", async () => {
  const requests = [];
  const fetcher = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.includes("xstocks.fi"))
      return json({ nodes: [], page: { hasNextPage: false } });
    if (url.endsWith("/products")) return new Response("");
    if (url.endsWith("/api/metrics")) return json({ metrics: [] });
    if (url.endsWith("/securities"))
      return json([security, { ...security, asset: "AAPL.US", name: "Apple" }]);
    if (url.endsWith("/assets")) return json([mapping]);
    if (url.endsWith("/markets")) return json([]);
    if (url.includes("/tokens/v2/"))
      return json([{ id: mint, usdPrice: 99, decimals: 6 }]);
    return json({});
  };
  const catalog = await getMainnetCatalog({ fetcher });
  assert.equal(catalog.backpackSecurities.length, 2);
  assert.equal(catalog.assets.length, 1);
  assert.equal(catalog.assets[0].issuer, "backpack");
  assert.equal(
    catalog.assets[0].kind,
    "unknown",
    "security catalog does not classify equities versus ETFs",
  );
  const result = await getMainnetMarkets({ catalog, fetcher });
  assert.equal(result.assets[0].priceUsd, 99);
  assert.equal(result.backpackSecurities.length, 2);
  assert.ok(
    requests
      .filter((url) => url.includes("jup.ag"))
      .every((url) => !url.includes("backpack:") && !url.includes("AAPL.US")),
  );
});
