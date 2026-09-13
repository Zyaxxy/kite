import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PublicKey } from "@solana/web3.js";
const require = createRequire(import.meta.url);
const sdk = require("../../../packages/sdk/dist/index.js");
const spl = require("@solana/spl-token");
const wallet = "11111111111111111111111111111111";
const code = ts.transpileModule(
  readFileSync(new URL("../lib/server/holdings.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const address = (index) =>
  new PublicKey(
    Uint8Array.from({ length: 32 }, (_, position) =>
      position < 2 ? (index >> (position * 8)) & 255 : 12,
    ),
  ).toBase58();
function tokenAccount(mint, frozen = false, program = spl.TOKEN_PROGRAM_ID) {
  return {
    account: {
      owner: program,
      data: {
        parsed: {
          type: "account",
          info: {
            owner: wallet,
            mint,
            state: frozen ? "frozen" : "initialized",
            tokenAmount: {
              amount: "1250000",
              decimals: 6,
              uiAmountString: "1.25",
            },
          },
        },
      },
    },
  };
}
function fixture({
  legacy = [],
  token2022 = [],
  assets = [],
  metadataFails = false,
  catalogFails = false,
  genesis = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
} = {}) {
  const exports = {};
  const calls = { metadata: [], rpc: 0 };
  class Connection {
    async getGenesisHash() {
      return genesis;
    }
    async getParsedTokenAccountsByOwner(_wallet, { programId }) {
      calls.rpc++;
      return {
        value: programId.equals(spl.TOKEN_PROGRAM_ID) ? legacy : token2022,
      };
    }
    async getBalance() {
      return 1000000000;
    }
  }
  const dependencies = {
    "@solana/web3.js": { Connection, PublicKey },
    "@solana/spl-token": spl,
    "@kite/sdk": sdk,
    "./markets": {
      getServerMarketCatalog: async () => {
        if (catalogFails) throw new Error("outage");
        return {
          assets,
          status: "live",
          sources: ["xStocks issuer catalog", "PreStocks issuer catalog"],
        };
      },
    },
  };
  runInNewContext(code, {
    exports,
    require: (name) => {
      if (!(name in dependencies)) throw new Error(name);
      return dependencies[name];
    },
    process: { env: {} },
    AbortSignal,
    URLSearchParams,
    fetch: async (input) => {
      const mints = new URL(input).searchParams.get("query").split(",");
      calls.metadata.push(mints);
      if (metadataFails) return new Response("", { status: 503 });
      return Response.json(
        mints.map((mint) => ({
          id: mint,
          symbol: "TEST",
          name: "Test-only token",
          decimals: mint === sdk.MAINNET_SOL_MINT ? 9 : 6,
          isVerified: false,
          usdPrice: mint === sdk.MAINNET_SOL_MINT ? 100 : 2,
        })),
      );
    },
  });
  return { read: () => exports.getWalletPortfolio(wallet), calls };
}

test("portfolio includes non-catalog tokens, Token-2022, frozen funds and native SOL", async () => {
  const route = fixture({
    legacy: [tokenAccount(address(1)), tokenAccount(address(1), true)],
    token2022: [tokenAccount(address(2), false, spl.TOKEN_2022_PROGRAM_ID)],
  });
  const value = await route.read();
  assert.equal(value.holdings.length, 3);
  const arbitrary = value.holdings.find((item) => item.mint === address(1));
  assert.equal(arbitrary.amount, "2.5");
  assert.equal(arbitrary.spendableAmount, "1.25");
  assert.equal(arbitrary.frozenAmount, "1.25");
  assert.equal(arbitrary.valueUsd, 5);
  assert.equal(arbitrary.marketAsset, false);
  assert.equal(arbitrary.verified, false);
  assert.equal(
    value.holdings.find((item) => item.mint === address(2)).tokenProgram,
    spl.TOKEN_2022_PROGRAM_ID.toBase58(),
  );
  assert.equal(value.solBalance, "1");
  assert.equal(value.pricedHoldingsValueUsd, 107.5);
});
test("all holdings metadata batches are fetched without a catalog cap and concurrent requests coalesce", async () => {
  const route = fixture({
    legacy: Array.from({ length: 205 }, (_, i) => tokenAccount(address(i + 1))),
  });
  const [first, second] = await Promise.all([route.read(), route.read()]);
  assert.equal(first, second);
  assert.equal(first.holdings.length, 206);
  assert.equal(route.calls.rpc, 2);
  assert.equal(route.calls.metadata.length, 3);
  assert.ok(route.calls.metadata.every((batch) => batch.length <= 100));
  assert.equal(new Set(route.calls.metadata.flat()).size, 206);
});
test("provider outages preserve unknown token balances instead of zeroing or inventing prices", async () => {
  const value = await fixture({
    legacy: [tokenAccount(address(1))],
    metadataFails: true,
    catalogFails: true,
  }).read();
  const token = value.holdings.find((item) => item.mint === address(1));
  assert.equal(token.amount, "1.25");
  assert.equal(token.source, "wallet");
  assert.equal(token.priceUsd, null);
  assert.equal(token.valueUsd, null);
  assert.equal(value.hasUnpricedHoldings, true);
  assert.equal(value.warnings.length, 2);
});
test("xStocks raw-versus-adjusted price basis stays unavailable and non-mainnet RPC is rejected", async () => {
  const value = await fixture({
    legacy: [tokenAccount(address(1))],
    assets: [
      {
        mint: address(1),
        symbol: "TESTx",
        name: "Test equity",
        issuer: "xstocks",
        verified: true,
        tradingHalted: false,
        priceUsd: 2,
      },
    ],
  }).read();
  assert.equal(
    value.holdings.find((item) => item.mint === address(1)).valueUsd,
    null,
  );
  const wrongNetwork = fixture({ genesis: "devnet" });
  await assert.rejects(wrongNetwork.read(), /Mainnet/);
  assert.equal(wrongNetwork.calls.rpc, 0);
});
