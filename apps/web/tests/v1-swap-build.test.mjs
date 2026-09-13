import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
const sdk = require("../../../packages/sdk/dist/index.js");
const web3 = require("@solana/web3.js");
const spl = require("@solana/spl-token");
const key = () => web3.Keypair.generate().publicKey.toBase58();
const wallet = key(),
  inputMint = key(),
  outputMint = key();
const inputAta = spl
  .getAssociatedTokenAddressSync(
    new web3.PublicKey(inputMint),
    new web3.PublicKey(wallet),
  )
  .toBase58();
const outputAta = spl
  .getAssociatedTokenAddressSync(
    new web3.PublicKey(outputMint),
    new web3.PublicKey(wallet),
  )
  .toBase58();
const outputToken = {
  mint: outputMint,
  symbol: "TEST",
  name: "Test token",
  decimals: 6,
  verified: false,
  tradingHalted: false,
  source: "jupiter",
  priceUsd: null,
};
function tokenAccount(mint, amount, owner = wallet) {
  const data = Buffer.alloc(165);
  new web3.PublicKey(mint).toBuffer().copy(data, 0);
  new web3.PublicKey(owner).toBuffer().copy(data, 32);
  data.writeBigUInt64LE(BigInt(amount), 64);
  return {
    owner: spl.TOKEN_PROGRAM_ID.toBase58(),
    data: [data.toString("base64"), "base64"],
    lamports: 2039280,
    executable: false,
  };
}
const compiled = ts.transpileModule(
  readFileSync(
    new URL("../lib/server/basket-order.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
function builder({
  routeChange = () => {},
  outputAmount = 1_000_000,
  inputSpent = 1_000_000,
  destinationOwner = wallet,
} = {}) {
  const exports = {},
    calls = { quotes: 0, simulations: 0, lookupRequests: 0 };
  const dependencies = {
    "@solana/web3.js": web3,
    "@solana/spl-token": spl,
    "@kite/sdk": sdk,
    "./markets": {
      getServerMarketCatalog: async () => ({
        assets: [],
        baskets: [],
        sources: ["xStocks issuer catalog", "PreStocks issuer catalog"],
      }),
    },
    "./mint-precision": { getTradeMintDecimals: async () => 6 },
    "./jupiter-build": {
      fetchJupiterBuild: async (params) => {
        calls.quotes++;
        assert.equal(params.get("destinationTokenAccount"), outputAta);
        const route = {
          inputMint,
          outputMint,
          inAmount: params.get("amount"),
          outAmount: "1000000",
          otherAmountThreshold: "990000",
          swapMode: "ExactIn",
          slippageBps: 100,
          setupInstructions: [],
          cleanupInstruction: null,
          otherInstructions: [],
          addressesByLookupTableAddress: { [key()]: [key()] },
          swapInstruction: {
            programId: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
            data: Buffer.from([1]).toString("base64"),
            accounts: [
              { pubkey: wallet, isSigner: true, isWritable: true },
              { pubkey: inputAta, isSigner: false, isWritable: true },
              { pubkey: outputAta, isSigner: false, isWritable: true },
            ],
          },
        };
        routeChange(route);
        return Response.json(route);
      },
    },
    "./composed-transactions": {
      assertMainnetV1Ready: async (versions) => {
        if (!versions?.includes(1)) throw new Error("V1 wallet required");
      },
      latestBlockhash: async () => ({
        blockhash: key(),
        lastValidBlockHeight: 100,
      }),
      authorizeComposed: async (order) => ({
        ...order,
        requestId: "test-request",
        authorization: "test-authorization",
      }),
      mainnetRpc: async (method, params) => {
        if (method === "getAccountInfo")
          return { value: tokenAccount(inputMint, 2_000_000) };
        assert.equal(method, "getMultipleAccounts");
        if (params[0][0] === inputMint)
          return {
            value: [inputMint, outputMint].map(() => ({
              owner: spl.TOKEN_PROGRAM_ID.toBase58(),
              data: [Buffer.alloc(82).toString("base64"), "base64"],
              lamports: 1461600,
              executable: false,
            })),
          };
        if (params[0][0] !== outputAta) {
          calls.lookupRequests++;
          throw new Error("Unexpected lookup table read");
        }
        return {
          value: [
            tokenAccount(outputMint, 0),
            tokenAccount(inputMint, 2_000_000),
          ],
        };
      },
      simulateComposed: async (transaction) => {
        calls.simulations++;
        assert.equal(
          (await sdk.inspectWalletTransaction(transaction)).message.version,
          1,
        );
        return {
          err: null,
          accounts: [
            tokenAccount(outputMint, outputAmount, destinationOwner),
            tokenAccount(inputMint, 2_000_000 - inputSpent),
          ],
        };
      },
    },
  };
  runInNewContext(compiled, {
    exports,
    require: (name) => {
      if (!(name in dependencies))
        throw new Error(`Unexpected dependency ${name}`);
      return dependencies[name];
    },
    Buffer,
    URLSearchParams,
    process: { env: { JUPITER_API_KEY: "test-only-key" } },
    Error,
  });
  return {
    calls,
    prepare: (versions = [1]) =>
      exports.prepareTokenSwapOrder(
        {
          inputMint,
          amount: "1",
          taker: wallet,
          slippageBps: 100,
          supportedTransactionVersions: versions,
        },
        outputToken,
      ),
  };
}
test("single-token build uses V1 and settles minimum output without ALT RPC reads", async () => {
  const run = builder();
  const order = await run.prepare();
  assert.equal(order.transactionVersion, 1);
  assert.equal(order.inAmount, "1000000");
  assert.equal(order.outputs[0].minimumAmount, "990000");
  assert.equal(run.calls.lookupRequests, 0);
  assert.equal(run.calls.simulations, 1);
});
test("unsupported signing version fails before routing or simulation", async () => {
  const run = builder();
  await assert.rejects(run.prepare([0]), /V1 wallet/);
  assert.equal(run.calls.quotes, 0);
  assert.equal(run.calls.simulations, 0);
});
test("minimum output, destination ownership and maximum input debit are enforced", async () => {
  for (const [options, pattern] of [
    [{ outputAmount: 989999 }, /minimum output/],
    [{ destinationOwner: key() }, /your own token/],
    [{ inputSpent: 1000001 }, /input debit/],
  ])
    await assert.rejects(builder(options).prepare(), pattern);
});
test("router cannot substitute quotes, extra signers or token permissions", async () => {
  for (const [routeChange, pattern] of [
    [
      (r) => {
        r.inAmount = "2";
      },
      /allocation/,
    ],
    [
      (r) => {
        r.otherAmountThreshold = "1";
      },
      /allocation/,
    ],
    [
      (r) => {
        r.swapInstruction.accounts.push({
          pubkey: key(),
          isSigner: true,
          isWritable: true,
        });
      },
      /signer/,
    ],
    [
      (r) => {
        r.setupInstructions = [
          {
            programId: spl.TOKEN_PROGRAM_ID.toBase58(),
            accounts: [],
            data: Buffer.from([4]).toString("base64"),
          },
        ];
      },
      /permission/,
    ],
  ])
    await assert.rejects(builder({ routeChange }).prepare(), pattern);
});
test("new single-token routes also respect the V1 account and byte limits", async () => {
  await assert.rejects(
    builder({
      routeChange: (r) => {
        r.swapInstruction.accounts.push(
          ...Array.from({ length: 64 }, () => ({
            pubkey: key(),
            isSigner: false,
            isWritable: true,
          })),
        );
      },
    }).prepare(),
    /64-account/,
  );
  await assert.rejects(
    builder({
      routeChange: (r) => {
        r.swapInstruction.data = Buffer.alloc(4096).toString("base64");
      },
    }).prepare(),
    /size limit/,
  );
});
