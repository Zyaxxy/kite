import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as web3 from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import type { SwapToken } from "@kite/sdk";
import {
  describeJupiterBuildFailure,
  JupiterBuildError,
} from "../lib/server/jupiter-build";

const require = createRequire(import.meta.url);
const sdk =
  require("../../../packages/sdk/dist/index.js") as typeof import("@kite/sdk");
type ApiInstruction = {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string;
};
const { testJupiterInstruction } =
  require("../../../packages/sdk/test/fixtures/jupiter.cjs") as {
    testJupiterInstruction: (options: {
      signer: string;
      source: string;
      destination: string;
      inputMint: string;
      outputMint: string;
      amount: string;
      args: Record<string, unknown>;
    }) => ApiInstruction;
  };
type Route = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  routePlan?: {
    percent: number;
    swapInfo: { ammKey: string; inputMint: string; outputMint: string };
  }[];
  setupInstructions: ApiInstruction[];
  swapInstruction: ApiInstruction;
  cleanupInstruction: ApiInstruction | null;
  otherInstructions: ApiInstruction[];
  addressesByLookupTableAddress: null;
};
type RpcAccount = {
  owner: string;
  data: [string, "base64"];
  lamports: number;
  executable: boolean;
};
type ServerExports = Pick<
  typeof import("../lib/server/basket-order"),
  "prepareTokenSwapOrder" | "prepareBasketOrder"
>;
const key = () => web3.Keypair.generate().publicKey.toBase58();
const wallet = key();
const inputMint = key();
const intermediateMint = key();
const outputMints = [key(), key()];
const ata = (mint: string, tokenProgram = spl.TOKEN_PROGRAM_ID) =>
  spl
    .getAssociatedTokenAddressSync(
      new web3.PublicKey(mint),
      new web3.PublicKey(wallet),
      false,
      tokenProgram,
    )
    .toBase58();
const outputToken = (mint: string): SwapToken => ({
  mint,
  symbol: "TEST",
  name: "Test token",
  decimals: 6,
  verified: true,
  tradingHalted: false,
  source: "jupiter",
  logoUrl: null,
  priceUsd: 1,
});
function tokenAccount(
  mint: string,
  amount: number,
  tokenProgram = spl.TOKEN_PROGRAM_ID,
): RpcAccount {
  const data = Buffer.alloc(165);
  new web3.PublicKey(mint).toBuffer().copy(data, 0);
  new web3.PublicKey(wallet).toBuffer().copy(data, 32);
  data.writeBigUInt64LE(BigInt(amount), 64);
  data[108] = 1;
  if (mint === sdk.MAINNET_SOL_MINT) {
    data.writeUInt32LE(1, 109);
    data.writeBigUInt64LE(BigInt(2039280), 113);
  }
  return {
    owner: tokenProgram.toBase58(),
    data: [data.toString("base64"), "base64"],
    lamports: 2039280 + (mint === sdk.MAINNET_SOL_MINT ? amount : 0),
    executable: false,
  };
}
function mintAccount(tokenProgram = spl.TOKEN_PROGRAM_ID): RpcAccount {
  const data = Buffer.alloc(82);
  data[44] = 6;
  data[45] = 1;
  return {
    owner: tokenProgram.toBase58(),
    data: [data.toString("base64"), "base64"],
    lamports: 1461600,
    executable: false,
  };
}
function createAta(mint: string, tokenProgram: web3.PublicKey): ApiInstruction {
  const instruction = spl.createAssociatedTokenAccountIdempotentInstruction(
    new web3.PublicKey(wallet),
    new web3.PublicKey(ata(mint, tokenProgram)),
    new web3.PublicKey(wallet),
    new web3.PublicKey(mint),
    tokenProgram,
  );
  return apiInstruction(instruction);
}
function apiInstruction(
  instruction: web3.TransactionInstruction,
): ApiInstruction {
  return {
    programId: instruction.programId.toBase58(),
    accounts: instruction.keys.map(({ pubkey, isSigner, isWritable }) => ({
      pubkey: pubkey.toBase58(),
      isSigner,
      isWritable,
    })),
    data: instruction.data.toString("base64"),
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
  basket = false,
  nativeInput = false,
  fundingMintOverride,
  basketPriceUsd = 1,
  catalogPriceUsd = null,
  basketSource = "custom",
  quoteFailure,
  initialCapacityFailure = false,
  transactionVersion = 0,
  tokenProgram = spl.TOKEN_PROGRAM_ID,
  routeChange = (_route: Route) => {},
  intermediateAccount = mintAccount(tokenProgram) as RpcAccount | null,
  intermediateMintOverride,
  intermediateStartingAccount,
  intermediateEndingAccount,
  intermediateBefore = 0,
  intermediateAfter = intermediateBefore,
}: {
  basket?: boolean;
  nativeInput?: boolean;
  fundingMintOverride?: string;
  basketPriceUsd?: number | null;
  catalogPriceUsd?: number | null;
  basketSource?: "custom" | "curated" | "published";
  quoteFailure?: Response;
  initialCapacityFailure?: boolean;
  transactionVersion?: 0 | 1;
  tokenProgram?: web3.PublicKey;
  routeChange?: (route: Route) => void;
  intermediateAccount?: RpcAccount | null;
  intermediateMintOverride?: string;
  intermediateStartingAccount?: RpcAccount | null;
  intermediateEndingAccount?: RpcAccount | null;
  intermediateBefore?: number;
  intermediateAfter?: number;
} = {}) {
  const routeIntermediateMint = intermediateMintOverride ?? intermediateMint;
  const mints = basket ? outputMints : outputMints.slice(0, 1);
  const fundingMint = nativeInput
    ? sdk.MAINNET_SOL_MINT
    : (fundingMintOverride ?? inputMint);
  const fundingAta = ata(fundingMint);
  const legAmount = nativeInput ? 1_000_000_000 : 1_000_000;
  const intermediateAta = ata(routeIntermediateMint, tokenProgram);
  const addresses = [
    ...mints.map((mint) => ata(mint)),
    ...(nativeInput ? [] : [fundingAta]),
    wallet,
    intermediateAta,
  ];
  const calls = {
    quotes: 0,
    simulations: 0,
    intermediateMintReads: 0,
    marketPriceReads: 0,
    bundleFlags: [] as (string | null)[],
  };
  const exports: Partial<ServerExports> = {};
  const walletAccount = (lamports: number): RpcAccount => ({
    owner: web3.SystemProgram.programId.toBase58(),
    data: ["", "base64"],
    lamports,
    executable: false,
  });
  const dependencies: Record<string, unknown> = {
    "@solana/web3.js": web3,
    "@solana/spl-token": spl,
    "@kite/sdk": {
      ...sdk,
      composeBasketV0Chunks: (
        params: Parameters<typeof sdk.composeBasketV0Chunks>[0],
      ) => {
        if (initialCapacityFailure) {
          initialCapacityFailure = false;
          throw new sdk.TransactionCapacityError(
            "test initial route exceeds bytes",
            "bytes",
          );
        }
        return sdk.composeBasketV0Chunks(params);
      },
    },
    "./markets": {
      getServerMarketCatalog: async () => ({
        assets: mints.map((mint) => ({
          ...outputToken(mint),
          priceUsd: catalogPriceUsd,
        })),
        baskets:
          basketSource === "curated"
            ? [
                {
                  id: "curated-test",
                  missingSymbols: [],
                  assets: mints.map((mint) => ({
                    asset: { ...outputToken(mint), priceUsd: catalogPriceUsd },
                    weight: 5000,
                  })),
                },
              ]
            : [],
        sources: ["xStocks issuer catalog", "PreStocks issuer catalog"],
      }),
      getServerBasketPrices: async (
        _catalog: unknown,
        requestedMints: string[],
      ) => {
        calls.marketPriceReads++;
        assert.deepEqual(Array.from(requestedMints), mints);
        return new Map(
          mints.flatMap((mint) =>
            typeof basketPriceUsd === "number" &&
            Number.isFinite(basketPriceUsd) &&
            basketPriceUsd > 0
              ? [[mint, basketPriceUsd] as const]
              : [],
          ),
        );
      },
    },
    "./mint-precision": {
      getTradeMintDecimals: async (mint: string) =>
        mint === sdk.MAINNET_SOL_MINT ? 9 : 6,
    },
    "./creator-store": {
      resolvePublishedCreatorBasket: async () =>
        basketSource === "published"
          ? { allocations: mints.map((mint) => ({ mint, weightBps: 5000 })) }
          : null,
    },
    "./bundle-authorization": {},
    "./jito-bundles": {},
    "./jupiter-lookup-tables": { loadVerifiedLookupTables: async () => [] },
    "./jupiter-build": {
      describeJupiterBuildFailure,
      JupiterBuildError,
      fetchJupiterBuild: async (params: URLSearchParams) => {
        calls.quotes++;
        calls.bundleFlags.push(params.get("forJitoBundle"));
        if (quoteFailure) return quoteFailure.clone();
        const outputMint = params.get("outputMint");
        const amount = params.get("amount");
        assert.ok(outputMint && mints.includes(outputMint));
        assert.equal(amount, String(legAmount));
        assert.equal(params.get("destinationTokenAccount"), ata(outputMint));
        const route: Route = {
          inputMint: fundingMint,
          outputMint,
          inAmount: amount,
          outAmount: "1000000",
          otherAmountThreshold: "990000",
          swapMode: "ExactIn",
          slippageBps: 100,
          routePlan: [
            {
              percent: 100,
              swapInfo: {
                ammKey: key(),
                inputMint: fundingMint,
                outputMint: routeIntermediateMint,
              },
            },
            {
              percent: 100,
              swapInfo: {
                ammKey: key(),
                inputMint: routeIntermediateMint,
                outputMint,
              },
            },
          ],
          setupInstructions: [createAta(routeIntermediateMint, tokenProgram)],
          cleanupInstruction: null,
          otherInstructions: [],
          addressesByLookupTableAddress: null,
          swapInstruction: testJupiterInstruction({
            signer: wallet,
            source: fundingAta,
            destination: ata(outputMint),
            inputMint: fundingMint,
            outputMint,
            amount,
            args: {
              route_plan: [
                {
                  swap: { variant: "RaydiumCP" },
                  percent: 100,
                  bps: 10000,
                  input_index: 0,
                  output_index: 1,
                },
                {
                  swap: { variant: "RaydiumCP" },
                  percent: 100,
                  bps: 10000,
                  input_index: 1,
                  output_index: 2,
                },
              ],
            },
          }),
        };
        route.swapInstruction.accounts.push({
          pubkey: intermediateAta,
          isSigner: false,
          isWritable: true,
        });
        if (nativeInput) {
          route.setupInstructions.unshift(
            createAta(fundingMint, spl.TOKEN_PROGRAM_ID),
            apiInstruction(
              web3.SystemProgram.transfer({
                fromPubkey: new web3.PublicKey(wallet),
                toPubkey: new web3.PublicKey(fundingAta),
                lamports: legAmount,
              }),
            ),
            apiInstruction(
              spl.createSyncNativeInstruction(new web3.PublicKey(fundingAta)),
            ),
          );
          route.cleanupInstruction = apiInstruction(
            spl.createCloseAccountInstruction(
              new web3.PublicKey(fundingAta),
              new web3.PublicKey(wallet),
              new web3.PublicKey(wallet),
            ),
          );
        }
        routeChange(route);
        return Response.json(route);
      },
    },
    "./composed-transactions": {
      selectMainnetTransactionVersion: async (versions: number[]) => {
        assert.deepEqual(Array.from(versions), [transactionVersion]);
        return transactionVersion;
      },
      latestBlockhash: async () => ({
        blockhash: key(),
        lastValidBlockHeight: 100,
      }),
      authorizeComposed: async (order: Record<string, unknown>) => ({
        ...order,
        requestId: "test",
        authorization: "test",
      }),
      mainnetRpc: async (method: string, params: unknown[]) => {
        if (method === "getBalance") {
          assert.equal(nativeInput, true);
          assert.equal(params[0], wallet);
          return { value: 10_000_000_000 };
        }
        if (method === "getAccountInfo") {
          assert.equal(nativeInput, false);
          assert.equal(params[0], fundingAta);
          return { value: tokenAccount(fundingMint, 3_000_000) };
        }
        assert.equal(method, "getMultipleAccounts");
        assert.ok(Array.isArray(params[0]));
        const requested = Array.from(params[0] as string[]);
        if (requested[0] === fundingMint) {
          assert.deepEqual(requested, [fundingMint, ...mints]);
          return { value: requested.map(() => mintAccount()) };
        }
        if (requested[0] === routeIntermediateMint) {
          calls.intermediateMintReads++;
          assert.deepEqual(requested, [routeIntermediateMint]);
          return { value: [intermediateAccount] };
        }
        assert.deepEqual(requested, addresses);
        return {
          value: [
            ...mints.map((mint) => tokenAccount(mint, 0)),
            ...(nativeInput ? [] : [tokenAccount(fundingMint, 3_000_000)]),
            walletAccount(10_000_000_000),
            intermediateStartingAccount !== undefined
              ? intermediateStartingAccount
              : intermediateBefore === 0
                ? null
                : tokenAccount(
                    routeIntermediateMint,
                    intermediateBefore,
                    tokenProgram,
                  ),
          ],
        };
      },
      simulateComposed: async (
        transaction: string,
        queriedAddresses: string[],
      ) => {
        calls.simulations++;
        assert.deepEqual(Array.from(queriedAddresses), addresses);
        assert.equal(
          (await sdk.inspectWalletTransaction(transaction)).message.version,
          transactionVersion,
        );
        return {
          err: null,
          accounts: [
            ...mints.map((mint) => tokenAccount(mint, 1_000_000)),
            ...(nativeInput
              ? []
              : [
                  tokenAccount(
                    fundingMint,
                    3_000_000 - mints.length * legAmount,
                  ),
                ]),
            walletAccount(
              10_000_000_000 -
                (nativeInput ? mints.length * legAmount : 0) -
                15_000,
            ),
            intermediateEndingAccount !== undefined
              ? intermediateEndingAccount
              : tokenAccount(
                  routeIntermediateMint,
                  intermediateAfter,
                  tokenProgram,
                ),
          ],
        };
      },
    },
  };
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
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
    prepare: async () => {
      const request = {
        inputMint: fundingMint,
        amount: basket ? "2" : "1",
        taker: wallet,
        slippageBps: 100,
        supportedTransactionVersions: [transactionVersion],
      };
      assert.ok(exports.prepareBasketOrder && exports.prepareTokenSwapOrder);
      return basket
        ? exports.prepareBasketOrder({
            ...request,
            basketId:
              basketSource === "published"
                ? "creator-test"
                : basketSource === "curated"
                  ? "curated-test"
                  : "custom",
            ...(basketSource === "custom"
              ? {
                  customAllocations: mints.map((mint) => ({
                    mint,
                    weightBps: 5000,
                  })),
                }
              : {}),
          })
        : exports.prepareTokenSwapOrder(request, outputToken(mints[0]));
    },
  };
}

for (const [name, tokenProgram] of [
  ["SPL Token", spl.TOKEN_PROGRAM_ID],
  ["plain Token-2022", spl.TOKEN_2022_PROGRAM_ID],
] as const) {
  test(`single swap accepts a route-connected, owner-owned ${name} intermediate ATA`, async () => {
    const run = builder({ tokenProgram });
    const order = await run.prepare();
    assert.equal(order.inAmount, "1000000");
    assert.equal(order.outputs.length, 1);
    assert.equal(run.calls.intermediateMintReads, 1);
    assert.equal(run.calls.simulations, 1);
  });
}

test("multi-leg basket validates a shared intermediate mint once and includes its ATA in settlement simulation", async () => {
  const run = builder({ basket: true, intermediateBefore: 250 });
  const order = await run.prepare();
  assert.equal(order.inAmount, "2000000");
  assert.equal(order.outputs.length, 2);
  assert.equal(run.calls.quotes, 2);
  assert.deepEqual(run.calls.bundleFlags, [null, null]);
  assert.equal(run.calls.intermediateMintReads, 1);
  assert.equal(run.calls.simulations, 1);
});

test("native SOL funding supports a token intermediary and preserves the wallet simulation index", async () => {
  const run = builder({ nativeInput: true, intermediateBefore: 250 });
  const order = await run.prepare();
  assert.equal(order.inputMint, sdk.MAINNET_SOL_MINT);
  assert.equal(order.inAmount, "1000000000");
  assert.equal(order.inputDecimals, 9);
  assert.equal(run.calls.intermediateMintReads, 1);
  assert.equal(run.calls.simulations, 1);
});

test("SOL basket recreates canonical WSOL before each leg when Jupiter omits existing account setup", async () => {
  const run = builder({
    basket: true,
    nativeInput: true,
    routeChange: (route) => {
      route.setupInstructions = route.setupInstructions.filter(
        (instruction) =>
          !(
            instruction.programId ===
              spl.ASSOCIATED_TOKEN_PROGRAM_ID.toBase58() &&
            instruction.accounts[3].pubkey === sdk.MAINNET_SOL_MINT
          ),
      );
    },
  });
  const order = await run.prepare();
  assert.ok(!("kind" in order));
  const transaction = web3.VersionedTransaction.deserialize(
    Buffer.from(order.transaction, "base64"),
  );
  const instructions = web3.TransactionMessage.decompile(
    transaction.message,
  ).instructions;
  const wrapped = ata(sdk.MAINNET_SOL_MINT);
  let open = false;
  let created = 0;
  let closed = 0;
  for (const instruction of instructions) {
    if (
      instruction.programId.equals(spl.ASSOCIATED_TOKEN_PROGRAM_ID) &&
      instruction.keys[1].pubkey.toBase58() === wrapped
    ) {
      assert.equal(instruction.data[0], 1);
      assert.equal(instruction.keys[0].pubkey.toBase58(), wallet);
      assert.equal(instruction.keys[2].pubkey.toBase58(), wallet);
      open = true;
      created++;
    }
    if (instruction.programId.equals(web3.SystemProgram.programId)) {
      assert.equal(open, true, "WSOL ATA must exist before funding every leg");
    }
    if (
      instruction.programId.equals(spl.TOKEN_PROGRAM_ID) &&
      instruction.data[0] === 9
    ) {
      assert.equal(open, true);
      open = false;
      closed++;
    }
  }
  assert.equal(created, 2);
  assert.equal(closed, 2);
  assert.equal(order.inAmount, "2000000000");
});

test("USDT basket requotes with bundle-compatible routes only after typed capacity failure", async () => {
  const run = builder({
    basket: true,
    fundingMintOverride: sdk.MAINNET_USDT_MINT,
    initialCapacityFailure: true,
  });
  const order = await run.prepare();
  assert.equal(order.inputMint, sdk.MAINNET_USDT_MINT);
  assert.equal(order.inAmount, "2000000");
  assert.deepEqual(run.calls.bundleFlags, [null, null, "true", "true"]);
  assert.equal(run.calls.simulations, 1);
});

test("single-token swaps do not restrict Jupiter to bundle-compatible routes", async () => {
  const run = builder();
  await run.prepare();
  assert.deepEqual(run.calls.bundleFlags, [null]);
});

test("a negotiated V1 route retains intermediate ATA validation and settlement checks", async () => {
  const run = builder({ transactionVersion: 1 });
  const order = await run.prepare();
  assert.equal(order.transactionVersion, 1);
  assert.equal(run.calls.intermediateMintReads, 1);
  assert.equal(run.calls.simulations, 1);
});

test("duplicate intermediate ATA setup within a route is composed only once", async () => {
  const run = builder({
    routeChange: (route) => {
      route.setupInstructions.push(
        createAta(intermediateMint, spl.TOKEN_PROGRAM_ID),
      );
    },
  });
  const order = await run.prepare();
  assert.ok(!("kind" in order));
  const transaction = web3.VersionedTransaction.deserialize(
    Buffer.from(order.transaction, "base64"),
  );
  const { staticAccountKeys, compiledInstructions } = transaction.message;
  const matchingSetups = compiledInstructions.filter(
    (instruction) =>
      staticAccountKeys[instruction.programIdIndex].equals(
        spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      ) &&
      staticAccountKeys[instruction.accountKeyIndexes[1]].toBase58() ===
        ata(intermediateMint),
  );
  assert.equal(matchingSetups.length, 1);
  assert.equal(run.calls.intermediateMintReads, 1);
  assert.equal(run.calls.simulations, 1);
});

const invalidRoutes: [string, (route: Route) => void][] = [
  [
    "missing route plan",
    (route) => {
      delete route.routePlan;
    },
  ],
  [
    "disconnected route plan",
    (route) => {
      assert.ok(route.routePlan);
      route.routePlan[1].swapInfo.inputMint = key();
    },
  ],
  [
    "unrelated additional ATA",
    (route) => {
      route.setupInstructions.push(createAta(key(), spl.TOKEN_PROGRAM_ID));
    },
  ],
  [
    "intermediate ATA absent from the swap",
    (route) => {
      route.swapInstruction.accounts.pop();
    },
  ],
  [
    "read-only intermediate ATA",
    (route) => {
      route.swapInstruction.accounts[
        route.swapInstruction.accounts.length - 1
      ].isWritable = false;
    },
  ],
  [
    "noncanonical ATA address",
    (route) => {
      route.setupInstructions[0].accounts[1].pubkey = key();
    },
  ],
  [
    "different ATA owner",
    (route) => {
      route.setupInstructions[0].accounts[2].pubkey = key();
    },
  ],
  [
    "different ATA payer",
    (route) => {
      route.setupInstructions[0].accounts[0].pubkey = key();
    },
  ],
];
for (const [name, routeChange] of invalidRoutes) {
  test(`${name} is rejected before simulation`, async () => {
    const run = builder({ routeChange });
    await assert.rejects(
      run.prepare(),
      /route|token account|signer|intermediate/i,
    );
    assert.equal(run.calls.simulations, 0);
  });
}

test("an intermediate mint's on-chain token program must match its ATA setup", async () => {
  const run = builder({
    intermediateAccount: mintAccount(spl.TOKEN_2022_PROGRAM_ID),
  });
  await assert.rejects(run.prepare(), /mint|token program|token account/i);
  assert.equal(run.calls.simulations, 0);
});

test("unsupported Token-2022 intermediate mint extensions fail before simulation", async () => {
  const intermediateAccount = mintAccount(spl.TOKEN_2022_PROGRAM_ID);
  const data = Buffer.alloc(
    spl.getMintLen([spl.ExtensionType.TransferFeeConfig]),
  );
  Buffer.from(intermediateAccount.data[0], "base64").copy(data);
  data[spl.ACCOUNT_SIZE] = spl.AccountType.Mint;
  data.writeUInt16LE(spl.ExtensionType.TransferFeeConfig, spl.ACCOUNT_SIZE + 1);
  data.writeUInt16LE(spl.TRANSFER_FEE_CONFIG_SIZE, spl.ACCOUNT_SIZE + 3);
  intermediateAccount.data = [data.toString("base64"), "base64"];
  const run = builder({
    tokenProgram: spl.TOKEN_2022_PROGRAM_ID,
    intermediateAccount,
  });
  await assert.rejects(run.prepare(), /extension|mint|token/i);
  assert.equal(run.calls.simulations, 0);
});

for (const name of [
  "missing",
  "non-token",
  "uninitialized",
  "truncated",
] as const) {
  test(`${name} intermediate mint is rejected before simulation`, async () => {
    let account: RpcAccount | null = mintAccount();
    if (name === "missing") account = null;
    else if (name === "non-token")
      account.owner = web3.SystemProgram.programId.toBase58();
    else {
      const data = Buffer.from(account.data[0], "base64");
      if (name === "uninitialized") data[45] = 0;
      account.data = [
        (name === "truncated" ? data.subarray(0, 81) : data).toString("base64"),
        "base64",
      ];
    }
    const run = builder({ intermediateAccount: account });
    await assert.rejects(run.prepare(), /mint|token|account|initializ/i);
    assert.equal(run.calls.simulations, 0);
  });
}

test("simulation cannot spend a wallet's existing intermediate-token balance", async () => {
  const run = builder({ intermediateBefore: 250, intermediateAfter: 249 });
  await assert.rejects(run.prepare(), /intermediate|balance|debit/i);
  assert.equal(run.calls.simulations, 1);
});

for (const price of [null, 0, NaN]) {
  test(`unpriced basket constituents block preparation before quotes (${price})`, async () => {
    const run = builder({ basket: true, basketPriceUsd: price });
    await assert.rejects(
      run.prepare(),
      /no current market price.*No partial basket/,
    );
    assert.equal(run.calls.quotes, 0);
    assert.equal(run.calls.simulations, 0);
  });
}

for (const [status, body, expected] of [
  [400, { error: "No routes found" }, /Jupiter found no executable route/],
  [401, { error: "Unauthorized" }, /routing authentication failed/],
  [503, { error: "unavailable" }, /routing is temporarily unavailable/],
] as const) {
  test(`basket preserves the actual Jupiter preparation failure (HTTP ${status})`, async () => {
    const run = builder({
      basket: true,
      quoteFailure: Response.json(body, { status }),
    });
    await assert.rejects(run.prepare(), expected);
    assert.equal(run.calls.simulations, 0);
  });
}

for (const [name, body] of [
  ["HTML", "<html>private provider diagnostic</html>"],
  ["null", "null"],
  ["array", "[]"],
] as const) {
  test(`successful HTTP with ${name} is a sanitized invalid response`, async () => {
    const run = builder({ basket: true, quoteFailure: new Response(body) });
    await assert.rejects(
      run.prepare(),
      (error: unknown) =>
        error instanceof JupiterBuildError &&
        error.kind === "invalid-response" &&
        !error.message.includes("private"),
    );
    assert.equal(run.calls.simulations, 0);
  });
}

for (const basketSource of ["custom", "curated", "published"] as const) {
  test(`${basketSource} basket uses current observations when the issuer-only catalog has null prices`, async () => {
    const run = builder({
      basket: true,
      basketSource,
      catalogPriceUsd: null,
      basketPriceUsd: 125,
    });
    const order = await run.prepare();
    assert.equal(order.outputs.length, 2);
    assert.equal(run.calls.marketPriceReads, 1);
    assert.equal(run.calls.quotes, 2);
    assert.equal(run.calls.simulations, 1);
  });
}

test("a positive catalog price cannot bypass missing current price observations", async () => {
  const run = builder({
    basket: true,
    catalogPriceUsd: 125,
    basketPriceUsd: null,
  });
  await assert.rejects(run.prepare(), /no current market price/);
  assert.equal(run.calls.quotes, 0);
});

const closedIntermediate: RpcAccount = {
  owner: web3.SystemProgram.programId.toBase58(),
  data: ["", "base64"],
  lamports: 0,
  executable: false,
};
const wrappedIntermediateClose = apiInstruction(
  spl.createCloseAccountInstruction(
    new web3.PublicKey(ata(sdk.MAINNET_SOL_MINT)),
    new web3.PublicKey(wallet),
    new web3.PublicKey(wallet),
  ),
);
for (const transactionVersion of [0, 1] as const) {
  test(`USDT basket accepts closed empty WSOL simulation accounts in V${transactionVersion}`, async () => {
    const run = builder({
      basket: true,
      transactionVersion,
      fundingMintOverride: sdk.MAINNET_USDT_MINT,
      intermediateMintOverride: sdk.MAINNET_SOL_MINT,
      intermediateEndingAccount: closedIntermediate,
      routeChange: (route) => {
        route.cleanupInstruction = wrappedIntermediateClose;
      },
    });
    const order = await run.prepare();
    assert.equal(order.inAmount, "2000000");
    assert.equal(run.calls.simulations, 1);
  });
}

test("closing an existing positive WSOL balance is still rejected", async () => {
  const run = builder({
    fundingMintOverride: sdk.MAINNET_USDT_MINT,
    intermediateMintOverride: sdk.MAINNET_SOL_MINT,
    intermediateBefore: 250,
    intermediateEndingAccount: closedIntermediate,
    routeChange: (route) => {
      route.cleanupInstruction = wrappedIntermediateClose;
    },
  });
  await assert.rejects(run.prepare(), /existing intermediate token balance/);
});

for (const [label, account] of [
  ["funded system account", { ...closedIntermediate, lamports: 1 }],
  ["executable system account", { ...closedIntermediate, executable: true }],
  [
    "system account with data",
    { ...closedIntermediate, data: ["AA==", "base64"] },
  ],
  ["invalid base64", { ...closedIntermediate, data: ["!!!", "base64"] }],
  ["incorrect encoding", { ...closedIntermediate, data: ["", "base58"] }],
  ["unrelated program", { ...closedIntermediate, owner: key() }],
] as const) {
  test(`${label} cannot masquerade as a closed intermediate`, async () => {
    const run = builder({ intermediateEndingAccount: account as RpcAccount });
    await assert.rejects(run.prepare(), /intermediate|token account/);
  });
}

test("prefunded system-owned WSOL cannot be treated as an empty starting token account", async () => {
  const run = builder({
    intermediateMintOverride: sdk.MAINNET_SOL_MINT,
    intermediateStartingAccount: { ...closedIntermediate, lamports: 3_000_000 },
    intermediateEndingAccount: closedIntermediate,
    routeChange: (route) => {
      route.cleanupInstruction = wrappedIntermediateClose;
    },
  });
  await assert.rejects(run.prepare(), /intermediate|token account/);
});

test("existing intermediate holdings are checked even if Jupiter omits ATA setup", async () => {
  const run = builder({
    intermediateBefore: 250,
    intermediateAfter: 249,
    routeChange: (route) => {
      route.setupInstructions = [];
    },
  });
  await assert.rejects(run.prepare(), /existing intermediate token balance/);
  assert.equal(run.calls.intermediateMintReads, 1);
  assert.equal(run.calls.simulations, 1);
});

test("USDT basket recreates a WSOL intermediary before each leg when Jupiter omits setup", async () => {
  const run = builder({
    basket: true,
    fundingMintOverride: sdk.MAINNET_USDT_MINT,
    intermediateMintOverride: sdk.MAINNET_SOL_MINT,
    intermediateEndingAccount: closedIntermediate,
    routeChange: (route) => {
      route.setupInstructions = [
        apiInstruction(
          spl.createSyncNativeInstruction(
            new web3.PublicKey(ata(sdk.MAINNET_SOL_MINT)),
          ),
        ),
      ];
      route.cleanupInstruction = wrappedIntermediateClose;
    },
  });
  const order = await run.prepare();
  assert.ok(!("kind" in order));
  const transaction = web3.VersionedTransaction.deserialize(
    Buffer.from(order.transaction, "base64"),
  );
  const instructions = web3.TransactionMessage.decompile(
    transaction.message,
  ).instructions;
  let open = false;
  let creates = 0;
  let closes = 0;
  for (const instruction of instructions) {
    if (
      instruction.programId.equals(spl.ASSOCIATED_TOKEN_PROGRAM_ID) &&
      instruction.keys[1].pubkey.toBase58() === ata(sdk.MAINNET_SOL_MINT)
    ) {
      assert.equal(instruction.data[0], 1);
      open = true;
      creates++;
    }
    if (
      instruction.programId.toBase58() ===
      "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
    ) {
      assert.equal(
        open,
        true,
        "Each swap needs its own WSOL setup after a preceding close",
      );
    }
    if (
      instruction.programId.equals(spl.TOKEN_PROGRAM_ID) &&
      instruction.data[0] === 17
    ) {
      assert.equal(open, true, "WSOL must exist before SyncNative");
    }
    if (
      instruction.programId.equals(spl.TOKEN_PROGRAM_ID) &&
      instruction.data[0] === 9
    ) {
      assert.equal(open, true);
      open = false;
      closes++;
    }
  }
  assert.equal(creates, 2);
  assert.equal(closes, 2);
  assert.equal(run.calls.intermediateMintReads, 1);
});

test("closing WSOL with an unsynced preexisting SOL balance is still rejected", async () => {
  const starting = tokenAccount(sdk.MAINNET_SOL_MINT, 0);
  starting.lamports += 250;
  const run = builder({
    fundingMintOverride: sdk.MAINNET_USDT_MINT,
    intermediateMintOverride: sdk.MAINNET_SOL_MINT,
    intermediateStartingAccount: starting,
    intermediateEndingAccount: closedIntermediate,
    routeChange: (route) => {
      route.cleanupInstruction = wrappedIntermediateClose;
    },
  });
  await assert.rejects(run.prepare(), /existing intermediate token balance/);
});

test("omitting ATA setup cannot bypass a missing intermediate route plan", async () => {
  const run = builder({
    routeChange: (route) => {
      route.setupInstructions = [];
      delete route.routePlan;
    },
  });
  await assert.rejects(run.prepare(), /route plan/);
  assert.equal(run.calls.simulations, 0);
});
