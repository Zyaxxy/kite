#!/usr/bin/env node
/* Read-only: GET catalogs/builds and getGenesisHash/getMultipleAccounts RPC only.
 * Never signs, submits, mints, funds a wallet, or deploys a program.
 * Run after pnpm build:sdk:
 * node --env-file=apps/web/.env scripts/audit-basket-liquidity.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const sdkRequire = createRequire(path.resolve("packages/sdk/package.json"));
const { PublicKey, TransactionInstruction } = sdkRequire("@solana/web3.js");
const {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} = sdkRequire("@solana/spl-token");
const {
  getMainnetCatalog,
  resolveMarketBaskets,
  allocateBasketInput,
  composeMainnetTransaction,
  MAINNET_USDC_MINT,
  BASKET_QUOTE_REVIEW_POLICY,
  assessBasketRoundTrip,
  validateJupiterExactInInstruction,
} = require("../packages/sdk/dist");

const KEY = process.env.JUPITER_API_KEY;
const RPC =
  process.env.SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";
// Public, non-owned fixture address. Its private key is neither loaded nor needed.
const TAKER = "5c8wE4dUVyPGxKWvQZny7J92wDHzNevqPXRhYeb9QUeG";
const amounts = BASKET_QUOTE_REVIEW_POLICY.basketAmountsUsdc;
const maxRoundTripLossBps = BASKET_QUOTE_REVIEW_POLICY.maxRoundTripLossBps;
const output =
  process.env.KITE_LIQUIDITY_AUDIT_OUTPUT ||
  `docs/audits/basket-liquidity-${new Date().toISOString().slice(0, 10)}.json`;
const report = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  completedAt: null,
  mode: "read-only-unsigned-build",
  endpoint: "https://api.jup.ag/swap/v2/build",
  policy: {
    fundingMint: MAINNET_USDC_MINT,
    basketAmountsUsdc: amounts,
    slippageBps: 100,
    maxAccountsPerLeg: 32,
    maxRoundTripLossBps,
    maxBasketAccounts: 64,
    maxV1Bytes: 4096,
  },
  catalog: {},
  baskets: [],
  warnings: [],
};
const write = () => {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let nextRequestAt = 0;
async function rpc(method, params = []) {
  if (!["getGenesisHash", "getMultipleAccounts"].includes(method))
    throw new Error("Disallowed audit RPC method");
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20000),
  });
  const p = await r.json();
  if (!r.ok || p.error) throw new Error(`Read-only RPC ${method} unavailable`);
  return p.result;
}
async function build(inputMint, outputMint, amount, destination) {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: String(amount),
    taker: TAKER,
    slippageBps: "100",
    maxAccounts: "32",
    wrapAndUnwrapSol: "true",
  });
  if (destination) params.set("destinationTokenAccount", destination);
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(Math.max(0, nextRequestAt - Date.now()));
    nextRequestAt = Date.now() + 1500;
    let response;
    try {
      response = await fetch(`https://api.jup.ag/swap/v2/build?${params}`, {
        headers: { "x-api-key": KEY },
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      return {
        ok: false,
        reason: "provider-timeout",
        observedAt: new Date().toISOString(),
      };
    }
    if (response.status === 429 && attempt < 2) {
      const reset =
        Number(response.headers.get("x-ratelimit-reset")) * 1000 -
        Date.now() +
        250;
      await sleep(
        Math.min(
          15000,
          Math.max(
            1500,
            reset,
            Number(response.headers.get("retry-after") || "2") * 1000,
          ),
        ),
      );
      continue;
    }
    const payload = await response.json().catch(() => ({}));
    const observedAt = new Date().toISOString();
    if (!response.ok)
      return {
        ok: false,
        reason:
          response.status === 429
            ? "provider-rate-limit"
            : String(payload.errorCode || "build-unavailable"),
        providerMessage:
          typeof payload.error === "string"
            ? payload.error.slice(0, 200)
            : null,
        httpStatus: response.status,
        observedAt,
      };
    if (
      payload.inputMint !== inputMint ||
      payload.outputMint !== outputMint ||
      payload.inAmount !== String(amount) ||
      payload.swapMode !== "ExactIn" ||
      payload.slippageBps !== 100 ||
      !/^\d+$/.test(payload.outAmount) ||
      BigInt(payload.outAmount) <= 0n ||
      !/^\d+$/.test(payload.otherAmountThreshold) ||
      BigInt(payload.otherAmountThreshold) <= 0n ||
      !payload.swapInstruction ||
      (payload.otherInstructions?.length ?? 0) > 0
    )
      return { ok: false, reason: "unsupported-build", observedAt };
    return {
      ok: true,
      observedAt,
      inAmount: payload.inAmount,
      outAmount: payload.outAmount,
      minimumOutput: payload.otherAmountThreshold,
      priceImpactPct: payload.priceImpactPct ?? null,
      routes: (payload.routePlan ?? []).map((leg) => ({
        label: leg.swapInfo?.label,
        ammKey: leg.swapInfo?.ammKey,
      })),
      payload,
    };
  }
}
const compact = ({ payload, ...result }) => result;
function instruction(value) {
  return new TransactionInstruction({
    programId: new PublicKey(value.programId),
    keys: value.accounts.map((account) => ({
      ...account,
      pubkey: new PublicKey(account.pubkey),
    })),
    data: Buffer.from(value.data, "base64"),
  });
}
async function main() {
  if (!KEY)
    throw new Error(
      "Set JUPITER_API_KEY in the server environment; no secret is written to the report.",
    );
  let catalog = await getMainnetCatalog();
  for (
    let attempt = 0;
    attempt < 2 && !catalog.sources.includes("xStocks issuer catalog");
    attempt++
  ) {
    await sleep(2500);
    catalog = await getMainnetCatalog();
  }
  let baskets = resolveMarketBaskets(catalog.assets);
  if (process.env.KITE_LIQUIDITY_AUDIT_SELECTION) {
    const selection = JSON.parse(
      fs.readFileSync(process.env.KITE_LIQUIDITY_AUDIT_SELECTION, "utf8"),
    );
    report.selectionFile = process.env.KITE_LIQUIDITY_AUDIT_SELECTION;
    baskets = selection.map((item) => {
      const source = baskets.find(
        (basket) => basket.id === item.sourceBasketId,
      );
      if (!source || !Array.isArray(item.symbols) || item.symbols.length < 2)
        throw new Error("Invalid explicit audit selection");
      const members = item.symbols.map((symbol) =>
        source.assets.find(
          (member) => member.asset.underlyingSymbol === symbol,
        ),
      );
      return {
        ...source,
        id: item.id,
        ticker: item.ticker,
        missingSymbols: item.symbols.filter((_, index) => !members[index]),
        assets: members.filter(Boolean).map((member, index) => ({
          asset: member.asset,
          weight:
            Math.floor(10000 / item.symbols.length) +
            (index < 10000 % item.symbols.length ? 1 : 0),
        })),
      };
    });
  }
  if (process.env.KITE_LIQUIDITY_AUDIT_IDS) {
    report.onlyBasketIds = process.env.KITE_LIQUIDITY_AUDIT_IDS.split(",");
    baskets = baskets.filter((basket) =>
      report.onlyBasketIds.includes(basket.id),
    );
    if (!baskets.length) throw new Error("No selected audit baskets exist.");
  }
  report.catalog = {
    observedAt: catalog.asOf,
    sources: catalog.sources,
    warnings: catalog.warnings,
    assetCount: catalog.assets.length,
    backpackSecurities: catalog.backpackSecurities?.length ?? 0,
  };
  let accounts = new Map();
  try {
    if (
      (await rpc("getGenesisHash")) !==
      "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
    )
      throw new Error("Configured RPC is not mainnet");
    report.mainnetRpcVerified = true;
    const mints = [
      ...new Set([
        MAINNET_USDC_MINT,
        ...baskets.flatMap((b) => b.assets.map((m) => m.asset.mint)),
      ]),
    ];
    for (let offset = 0; offset < mints.length; offset += 100) {
      const batch = mints.slice(offset, offset + 100);
      const result = await rpc("getMultipleAccounts", [
        batch,
        { encoding: "base64", commitment: "confirmed" },
      ]);
      batch.forEach((mint, i) => {
        const account = result.value[i];
        if (
          account &&
          [
            TOKEN_PROGRAM_ID.toBase58(),
            TOKEN_2022_PROGRAM_ID.toBase58(),
          ].includes(account.owner)
        )
          accounts.set(mint, account.owner);
      });
    }
  } catch (error) {
    report.warnings.push(
      error.message.startsWith("Configured RPC")
        ? error.message
        : "Mainnet mint-account reads unavailable; atomic composition cannot be verified.",
    );
  }
  for (const basket of baskets) {
    const result = {
      id: basket.id,
      ticker: basket.ticker,
      symbols: basket.assets.map((m) => m.asset.underlyingSymbol),
      missingSymbols: basket.missingSymbols,
      samples: [],
    };
    report.baskets.push(result);
    if (
      basket.missingSymbols.length ||
      !basket.assets.length ||
      basket.assets.some((m) => m.asset.tradingHalted)
    ) {
      result.status = "incomplete-catalog";
      write();
      continue;
    }
    for (const amount of amounts) {
      const sample = {
        totalUsdc: amount,
        legs: [],
        atomic: { status: "not-checked" },
      };
      result.samples.push(sample);
      let allocations;
      try {
        allocations = allocateBasketInput(
          BigInt(amount) * 1000000n,
          basket.assets.map((m) => ({
            mint: m.asset.mint,
            weightBps: m.weight,
          })),
        );
      } catch {
        sample.atomic = { status: "unsupported-allocation" };
        continue;
      }
      const instructions = [],
        seenSetups = new Set();
      for (const allocation of allocations) {
        const asset = basket.assets.find(
          (m) => m.asset.mint === allocation.mint,
        ).asset;
        const program = accounts.get(asset.mint);
        const destination = program
          ? getAssociatedTokenAddressSync(
              new PublicKey(asset.mint),
              new PublicKey(TAKER),
              false,
              new PublicKey(program),
            ).toBase58()
          : undefined;
        const buy = await build(
          MAINNET_USDC_MINT,
          asset.mint,
          allocation.amount,
          destination,
        );
        const sell = buy.ok
          ? await build(asset.mint, MAINNET_USDC_MINT, buy.outAmount)
          : null;
        const assessment = assessBasketRoundTrip(
          allocation.amount.toString(),
          sell?.ok ? sell.outAmount : null,
        );
        let instructionValidation = { status: "not-checked" };
        if (
          buy.ok &&
          destination &&
          program &&
          accounts.has(MAINNET_USDC_MINT)
        ) {
          try {
            validateJupiterExactInInstruction({
              instruction: {
                ...buy.payload.swapInstruction,
                data: Buffer.from(buy.payload.swapInstruction.data, "base64"),
              },
              inputAmount: allocation.amount,
              quotedOutputAmount: BigInt(buy.outAmount),
              minimumOutputAmount: BigInt(buy.minimumOutput),
              slippageBps: 100,
              settlement: {
                signer: TAKER,
                sourceTokenAccount: getAssociatedTokenAddressSync(
                  new PublicKey(MAINNET_USDC_MINT),
                  new PublicKey(TAKER),
                  false,
                  new PublicKey(accounts.get(MAINNET_USDC_MINT)),
                ).toBase58(),
                destinationTokenAccount: destination,
                inputMint: MAINNET_USDC_MINT,
                outputMint: asset.mint,
                inputTokenProgram: accounts.get(MAINNET_USDC_MINT),
                outputTokenProgram: program,
              },
            });
            instructionValidation = { status: "passed" };
          } catch (error) {
            instructionValidation = { status: "failed", reason: error.message };
          }
        }
        const leg = {
          symbol: asset.underlyingSymbol,
          mint: asset.mint,
          tokenProgram: program ?? null,
          weightBps: basket.assets.find((m) => m.asset.mint === asset.mint)
            .weight,
          inputRaw: allocation.amount.toString(),
          buy: compact(buy),
          sell: sell ? compact(sell) : null,
          roundTripLossBps: assessment.lossBps,
          instructionValidation,
          passes: Boolean(
            buy.ok &&
            sell?.ok &&
            assessment.passes &&
            instructionValidation.status === "passed",
          ),
        };
        sample.legs.push(leg);
        if (buy.ok && program && destination) {
          const ownAta = createAssociatedTokenAccountIdempotentInstruction(
            new PublicKey(TAKER),
            new PublicKey(destination),
            new PublicKey(TAKER),
            new PublicKey(asset.mint),
            new PublicKey(program),
          );
          for (const ix of [
            ownAta,
            ...(buy.payload.setupInstructions ?? []).map(instruction),
          ]) {
            const key = `${ix.programId}:${ix.keys.map((k) => k.pubkey).join(",")}:${ix.data.toString("base64")}`;
            if (!seenSetups.has(key)) {
              instructions.push(ix);
              seenSetups.add(key);
            }
          }
          instructions.push(instruction(buy.payload.swapInstruction));
          if (buy.payload.cleanupInstruction)
            instructions.push(instruction(buy.payload.cleanupInstruction));
        }
        write();
      }
      if (
        sample.legs.every((leg) => leg.passes) &&
        allocations.every((a) => accounts.has(a.mint))
      ) {
        try {
          const composed = await composeMainnetTransaction({
            payer: TAKER,
            blockhash: "11111111111111111111111111111111",
            lastValidBlockHeight: 1,
            instructions,
            allowV1: true,
          });
          sample.atomic = {
            status: "unsigned-composition-passed",
            serializedBytes: composed.serializedBytes,
            accounts: new Set([
              TAKER,
              ...instructions.flatMap((ix) => [
                ix.programId.toBase58(),
                ...ix.keys.map((k) => k.pubkey.toBase58()),
              ]),
            ]).size,
          };
        } catch (error) {
          sample.atomic = {
            status: "composition-failed",
            reason: error.message,
          };
        }
      } else sample.atomic = { status: "leg-or-mint-check-failed" };
      write();
    }
    result.status =
      result.samples.length === amounts.length &&
      result.samples.every(
        (s) => s.atomic.status === "unsigned-composition-passed",
      )
        ? "quote-and-composition-checked"
        : result.samples.some((sample) =>
              sample.legs.some((leg) =>
                [leg.buy, leg.sell].some(
                  (quote) =>
                    quote &&
                    ["provider-rate-limit", "provider-timeout"].includes(
                      quote.reason,
                    ),
                ),
              ),
            )
          ? "inconclusive-provider-error"
          : "gated";
    console.log(`${result.ticker}: ${result.status}`);
    write();
  }
  report.completedAt = new Date().toISOString();
  write();
  console.log(
    `Read-only audit saved to ${output}. No signing, simulation, or submission occurred.`,
  );
}
main().catch((error) => {
  report.warnings.push(error.message);
  write();
  console.error(error.message);
  process.exitCode = 1;
});
