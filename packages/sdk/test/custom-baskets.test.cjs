const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateProgrammableBasket,
  calculateEqualWeights,
  calculateMarketCapWeights,
  resolveProgrammableBasket,
  encodeBasketShareCode,
  decodeBasketShareCode,
  forkCuratedBasket,
  formatSocialUrl,
  executePaperRebalance,
  createKiteCore,
  createPaperAccount,
  executePaperOrder,
} = require("../dist");

test("validates programmable basket invariants (2 to 4 assets, 10000 bps sum)", () => {
  const valid = {
    id: "custom-test-1",
    name: "AI & Tech",
    ticker: "MY-TECH",
    description: "My custom basket",
    allocations: [
      { mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", symbol: "AAPL", weightBps: 5000 },
      { mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", symbol: "NVDA", weightBps: 5000 },
    ],
    rebalanceRules: { driftThresholdBps: 500 },
  };

  const parsed = validateProgrammableBasket(valid);
  assert.equal(parsed.id, "custom-test-1");
  assert.equal(parsed.allocations.length, 2);
  assert.equal(parsed.isCustom, true);

  // Rejects 1 asset (baskets must have at least 2 constituents)
  assert.throws(
    () =>
      validateProgrammableBasket({
        ...valid,
        allocations: [{ mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", symbol: "AAPL", weightBps: 10000 }],
      }),
    /between 2 and 4 assets/,
  );

  // Rejects 5 assets (capped at 4 for atomic single-tx V1 execution within 64 accounts)
  assert.throws(
    () =>
      validateProgrammableBasket({
        ...valid,
        allocations: [
          { mint: "mint11111111111111111111111111111111", symbol: "A", weightBps: 2000 },
          { mint: "mint22222222222222222222222222222222", symbol: "B", weightBps: 2000 },
          { mint: "mint33333333333333333333333333333333", symbol: "C", weightBps: 2000 },
          { mint: "mint44444444444444444444444444444444", symbol: "D", weightBps: 2000 },
          { mint: "mint55555555555555555555555555555555", symbol: "E", weightBps: 2000 },
        ],
      }),
    /between 2 and 4 assets/,
  );

  // Rejects sum not equal to 10000 bps
  assert.throws(
    () =>
      validateProgrammableBasket({
        ...valid,
        allocations: [
          { mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", symbol: "AAPL", weightBps: 4000 },
          { mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", symbol: "NVDA", weightBps: 5000 },
        ],
      }),
    /sum to exactly 10,000 basis points/,
  );

  // Rejects duplicate mints
  assert.throws(
    () =>
      validateProgrammableBasket({
        ...valid,
        allocations: [
          { mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", symbol: "AAPL", weightBps: 5000 },
          { mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", symbol: "AAPL2", weightBps: 5000 },
        ],
      }),
    /Duplicate asset/,
  );
});

test("equal-weight distribution conserves every basis point (Hare-Niemeyer)", () => {
  const three = calculateEqualWeights([
    { mint: "mint11111111111111111111111111111111", symbol: "A" },
    { mint: "mint22222222222222222222222222222222", symbol: "B" },
    { mint: "mint33333333333333333333333333333333", symbol: "C" },
  ]);
  assert.equal(three.length, 3);
  assert.equal(three.reduce((sum, a) => sum + a.weightBps, 0), 10000);
  assert.equal(three[0].weightBps, 3334);
  assert.equal(three[1].weightBps, 3333);
  assert.equal(three[2].weightBps, 3333);
});

test("share code encodes and decodes custom baskets reliably", () => {
  const basket = {
    id: "custom-orig",
    name: "Trio",
    ticker: "TRIO",
    description: "Three stocks",
    allocations: [
      { mint: "mint11111111111111111111111111111111", symbol: "A", weightBps: 3334 },
      { mint: "mint22222222222222222222222222222222", symbol: "B", weightBps: 3333 },
      { mint: "mint33333333333333333333333333333333", symbol: "C", weightBps: 3333 },
    ],
    rebalanceRules: { driftThresholdBps: 300 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isCustom: true,
  };

  const code = encodeBasketShareCode(basket);
  assert.ok(typeof code === "string" && code.length > 0);

  const decoded = decodeBasketShareCode(code);
  assert.ok(decoded);
  assert.equal(decoded.name, "Trio");
  assert.equal(decoded.ticker, "TRIO");
  assert.equal(decoded.allocations.length, 3);
  assert.equal(decoded.rebalanceRules.driftThresholdBps, 300);

  // Corrupted code returns null
  assert.equal(decodeBasketShareCode("not-a-valid-base64-payload!"), null);
});

test("paper rebalancing atomically sells overweighted assets and buys underweighted assets", () => {
  const now = new Date().toISOString();
  const assets = [
    { mint: "mintA", symbol: "A", priceUsd: 100, verified: true, tradingHalted: false, priceObservedAt: now },
    { mint: "mintB", symbol: "B", priceUsd: 100, verified: true, tradingHalted: false, priceObservedAt: now },
  ];
  let account = createPaperAccount(10000);
  // Buy $2,000 of A and $1,000 of B (A is 66.6%, B is 33.3%)
  account = executePaperOrder(account, assets[0], "buy", 2000, now);
  account = executePaperOrder(account, assets[1], "buy", 1000, now);

  const targets = [
    { mint: "mintA", weightBps: 5000 },
    { mint: "mintB", weightBps: 5000 },
  ];

  // Drift threshold 500 bps (5%). Since A is ~66.6% vs 50% target, drift is 16.6% > 5%.
  const { account: rebalancedAccount, rebalanced, legs } = executePaperRebalance(
    account,
    targets,
    assets,
    500,
  );

  assert.equal(rebalanced, true);
  assert.equal(legs.length, 2);

  const posA = rebalancedAccount.positions.find((p) => p.mint === "mintA");
  const posB = rebalancedAccount.positions.find((p) => p.mint === "mintB");
  assert.ok(posA && posB);

  // Both should now be valued at approx $1,500 each (50/50 of $3,000 total portfolio)
  assert.ok(Math.abs(posA.quantity * 100 - 1500) < 1);
  assert.ok(Math.abs(posB.quantity * 100 - 1500) < 1);
});

test("KiteCore saves, hydrates and deletes custom baskets", async () => {
  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, val) => store.set(key, val),
  };

  const client = { getMarkets: async () => ({ assets: [], baskets: [] }) };
  const core = createKiteCore({
    storage,
    client,
    accountKey: "test.account",
    watchlistKey: "test.watch",
    customBasketsKey: "test.custom",
  });

  await core.hydrate();
  assert.equal(core.getSnapshot().customBaskets.length, 0);

  const basket = {
    id: "my-custom-ai",
    name: "AI Duo",
    ticker: "AIDUO",
    description: "Top AI duo",
    allocations: [
      { mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", symbol: "AAPL", weightBps: 5000 },
      { mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", symbol: "NVDA", weightBps: 5000 },
    ],
    rebalanceRules: { driftThresholdBps: 500 },
  };

  core.saveCustomBasket(basket);
  await core.flush();

  assert.equal(core.getSnapshot().customBaskets.length, 1);
  assert.equal(core.getCustomBasket("my-custom-ai")?.name, "AI Duo");

  core.deleteCustomBasket("my-custom-ai");
  await core.flush();

  assert.equal(core.getSnapshot().customBaskets.length, 0);
});

test("formatSocialUrl handles @handles, domains, full urls, and empty values", () => {
  assert.equal(formatSocialUrl(undefined), undefined);
  assert.equal(formatSocialUrl(""), undefined);
  assert.equal(formatSocialUrl("   "), undefined);
  assert.equal(formatSocialUrl("@satoshinakamoto"), "https://x.com/satoshinakamoto");
  assert.equal(formatSocialUrl("x.com/satoshinakamoto"), "https://x.com/satoshinakamoto");
  assert.equal(formatSocialUrl("https://github.com/solana-labs"), "https://github.com/solana-labs");
  assert.equal(formatSocialUrl("http://myblog.xyz"), "http://myblog.xyz");
});

test("creator name and optional social link are preserved across validation, resolution, and sharing", () => {
  const basket = {
    id: "custom-creator-test",
    name: "Alpha Titans",
    ticker: "ALPHA",
    description: "Alpha generation portfolio",
    creatorName: "Alice Walker",
    creatorSocial: "@alicewalker",
    allocations: [
      { mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", symbol: "AAPL", weightBps: 5000 },
      { mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", symbol: "NVDA", weightBps: 5000 },
    ],
    rebalanceRules: { driftThresholdBps: 500 },
  };

  const validated = validateProgrammableBasket(basket);
  assert.equal(validated.creatorName, "Alice Walker");
  assert.equal(validated.creatorSocial, "https://x.com/alicewalker");

  // Optional social link (omitted)
  const validatedNoSocial = validateProgrammableBasket({
    ...basket,
    creatorSocial: undefined,
  });
  assert.equal(validatedNoSocial.creatorName, "Alice Walker");
  assert.equal(validatedNoSocial.creatorSocial, undefined);

  // Encode & decode share code preserves creator
  const code = encodeBasketShareCode(validated);
  const decoded = decodeBasketShareCode(code);
  assert.ok(decoded);
  assert.equal(decoded.creatorName, "Alice Walker");
  assert.equal(decoded.creatorSocial, "https://x.com/alicewalker");

  // Resolution exposes creator attribution to MarketBasket
  const assets = [
    { mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", symbol: "AAPL", priceUsd: 200, verified: true, tradingHalted: false },
    { mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", symbol: "NVDA", priceUsd: 130, verified: true, tradingHalted: false },
  ];
  const resolved = resolveProgrammableBasket(validated, assets);
  assert.equal(resolved.creatorName, "Alice Walker");
  assert.equal(resolved.creatorSocial, "https://x.com/alicewalker");
  assert.equal(resolved.isCustom, true);
});

