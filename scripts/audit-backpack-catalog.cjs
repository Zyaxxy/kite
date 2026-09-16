#!/usr/bin/env node
// Public GET requests only. Stores observations, never credentials or account data.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const {
  parseBackpackSecurities,
  BACKPACK_SECURITIES_URL,
  BACKPACK_ASSETS_URL,
  BACKPACK_MARKETS_URL,
} = require("../packages/sdk/dist/backpack");
async function main() {
  const sources = await Promise.all(
    [BACKPACK_SECURITIES_URL, BACKPACK_ASSETS_URL, BACKPACK_MARKETS_URL].map(
      async (url) => {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok)
          throw new Error(
            `Public Backpack endpoint returned HTTP ${response.status}`,
          );
        const text = await response.text();
        return {
          url,
          observedAt: new Date().toISOString(),
          sha256: createHash("sha256").update(text).digest("hex"),
          payload: JSON.parse(text),
        };
      },
    ),
  );
  const securities = parseBackpackSecurities(
    ...sources.map((source) => source.payload),
  );
  const report = {
    observedAt: new Date().toISOString(),
    sources: sources.map(({ payload, ...source }) => ({
      ...source,
      rows: payload.length,
    })),
    counts: {
      securities: securities.length,
      solanaMappings: securities.filter((s) => s.solanaMint).length,
      transferEnabledMappings: securities.filter((s) => !s.discoveryOnly)
        .length,
      spotListings: securities.filter((s) => s.spotMarkets.length).length,
    },
    supportedTokens: securities
      .filter((s) => !s.discoveryOnly)
      .map((s) => ({
        symbol: s.symbol,
        mint: s.solanaMint,
        decimals: s.decimals,
        depositEnabled: s.depositEnabled,
        withdrawEnabled: s.withdrawEnabled,
      })),
    spotListings: securities
      .filter((s) => s.spotMarkets.length)
      .map((s) => ({ symbol: s.symbol, spotMarkets: s.spotMarkets })),
    exampleDiscoveryListings: securities.filter(
      (s) =>
        s.discoveryOnly && ["AAPL.US", "NVDA.US", "MSFT.US"].includes(s.symbol),
    ),
    limitations: [
      "Official mappings are discovery evidence, not RPC verification of deployed mint accounts or proof of DEX liquidity.",
      "Only transfer-enabled mappings enter Kite token pricing; runtime mint and quote checks remain required.",
      "No exchange orders, RFQs, wallet signatures, or transactions are submitted.",
    ],
  };
  const output = `docs/audits/backpack-catalog-${report.observedAt.slice(0, 10)}.json`;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ ...report.counts, report: output }));
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
