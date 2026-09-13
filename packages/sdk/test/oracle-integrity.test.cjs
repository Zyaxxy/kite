const test = require("node:test");
const assert = require("node:assert/strict");
const { PublicKey } = require("@solana/web3.js");
const {
  XSTOCKS_PYTH_FEEDS,
  PythSolanaClient,
  PythHermesClient,
  PYTH_RECEIVER_PROGRAM_ID,
  PYTH_PUSH_ORACLE_PROGRAM_ID,
  fetchXStocksOracles,
  normalizeSymbol,
} = require("../dist/pyth-oracle.js");
const { JupiterPriceClient } = require("../dist/jupiter.js");
const { MeteoraClient } = require("../dist/meteora.js");

test("token and underlying equity feed identities remain distinct and Amazon is not SOL", () => {
  const feeds = Object.values(XSTOCKS_PYTH_FEEDS);
  const ids = feeds.flatMap((feed) => [
    feed.xStockFeedId,
    feed.equityReferenceFeedId,
  ]);
  assert.equal(new Set(ids).size, 16);
  assert.ok(ids.every((id) => /^0x[a-f0-9]{64}$/.test(id)));
  assert.equal(
    XSTOCKS_PYTH_FEEDS.AMZN.xStockFeedId,
    "0x7148fbe6e493ff2580305c92a8d7f8628c9943b11b9b253aebc24863fec290e8",
  );
  assert.equal(
    XSTOCKS_PYTH_FEEDS.AMZN.equityReferenceFeedId,
    "0xb5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a",
  );
  assert.equal(
    XSTOCKS_PYTH_FEEDS.SPY.equityReferenceFeedId,
    "0x19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5",
  );
  assert.ok(
    !ids.includes(
      "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    ),
  );
  assert.equal(normalizeSymbol("XOM"), "XOM");
  assert.equal(normalizeSymbol("NFLX"), "NFLX");
  assert.equal(normalizeSymbol("xAAPL"), "AAPL");
  assert.equal(normalizeSymbol("AAPLx"), "AAPL");
});
test("feed search requires an exact token symbol and oracle outages never fabricate a registry", async () => {
  const client = new PythHermesClient();
  client.searchFeeds = async () => [
    { id: "unrelated", attributes: { symbol: "Crypto.NOT_AAPLX/USD" } },
  ];
  assert.equal(await client.getFeedDetails("AAPL"), null);
  assert.deepEqual(await fetchXStocksOracles(), []);
  const original = global.fetch;
  global.fetch = async () => new Response("", { status: 503 });
  try {
    assert.deepEqual(
      await fetchXStocksOracles("https://issuer.example/oracles"),
      [],
    );
  } finally {
    global.fetch = original;
  }
});
function account() {
  const data = Buffer.alloc(134);
  Buffer.from([34, 241, 35, 99, 157, 126, 244, 205]).copy(data);
  data[40] = 1;
  Buffer.from(XSTOCKS_PYTH_FEEDS.NVDA.xStockFeedId.slice(2), "hex").copy(
    data,
    41,
  );
  data.writeBigInt64LE(12345000000n, 73);
  data.writeBigUInt64LE(1000000n, 81);
  data.writeInt32LE(-8, 89);
  data.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000)), 93);
  return { data, owner: PYTH_RECEIVER_PROGRAM_ID, executable: false };
}
test("onchain reads use the push PDA and verify receiver, discriminator, feed, full verification and age", async () => {
  let value = account();
  const client = new PythSolanaClient({ getAccountInfo: async () => value });
  const feed = XSTOCKS_PYTH_FEEDS.NVDA.xStockFeedId;
  const expected = PublicKey.findProgramAddressSync(
    [Buffer.from([0, 0]), Buffer.from(feed.slice(2), "hex")],
    PYTH_PUSH_ORACLE_PROGRAM_ID,
  )[0];
  assert.equal(
    client.getPriceFeedAccountAddress(0, feed).toBase58(),
    expected.toBase58(),
  );
  const price = await client.getOnChainPrice(0, feed);
  assert.equal(price.price, 123.45);
  assert.equal(price.status, "unknown");
  for (const mutate of [
    (v) => (v.owner = new PublicKey("11111111111111111111111111111111")),
    (v) => (v.data[0] = 0),
    (v) => (v.data[40] = 0),
    (v) => (v.data[41] ^= 1),
    (v) => v.data.writeBigInt64LE(1n, 93),
    (v) => (v.executable = true),
  ]) {
    value = account();
    mutate(value);
    assert.equal(await client.getOnChainPrice(0, feed), null);
  }
  assert.throws(() => client.getPriceFeedAccountAddress(0, "abc"), /32-byte/);
});
test("legacy adapters preserve unknown precision and missing volume without zero defaults", async () => {
  const original = global.fetch;
  try {
    global.fetch = async () =>
      Response.json({ data: { mint: { price: "1.23" } } });
    const jupiter = new JupiterPriceClient();
    const price = await jupiter.getTokenPriceInfo("mint");
    assert.equal(price.usdPrice, 1.23);
    assert.equal(price.decimals, undefined);
    global.fetch = async () =>
      Response.json({ tvl: 1, apr: 2, apy: 3, current_price: 4 });
    const metrics = await new MeteoraClient().getPoolMetrics("pool");
    assert.equal(metrics.volume24h, null);
    assert.equal(metrics.fee24h, null);
  } finally {
    global.fetch = original;
  }
});
