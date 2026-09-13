import { fetchJupiterBuild } from "./jupiter-build";
import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  allocateBasketInput,
  composeMainnetTransaction,
  hasCompleteIssuerCatalogs,
  toTokenAmount,
  MAINNET_SOL_MINT,
  type BasketOrderRequest,
  type BasketOrder,
} from "@kite/sdk";
import { getServerMarketCatalog } from "./markets";
import { getTradeMintDecimals } from "./mint-precision";
import {
  assertMainnetV1Ready,
  authorizeComposed,
  latestBlockhash,
  mainnetRpc,
  simulateComposed,
  type RpcAccount,
} from "./composed-transactions";

type ApiInstruction = {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string;
};
type Route = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  setupInstructions: ApiInstruction[];
  swapInstruction: ApiInstruction;
  cleanupInstruction: ApiInstruction | null;
  otherInstructions: ApiInstruction[];
  addressesByLookupTableAddress: Record<string, string[]> | null;
  platformFee?: { feeBps: number } | null;
};
const raw = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{1,20}$/.test(value) &&
  BigInt(value) > BigInt(0) &&
  BigInt(value) < BigInt(2) ** BigInt(64);
function ix(value: ApiInstruction, taker: string) {
  if (
    !value ||
    !Array.isArray(value.accounts) ||
    typeof value.data !== "string" ||
    value.data.length > 8192
  )
    throw new Error("Invalid route instructions.");
  return new TransactionInstruction({
    programId: new PublicKey(value.programId),
    data: Buffer.from(value.data, "base64"),
    keys: value.accounts.map((a) => {
      if (
        typeof a.isSigner !== "boolean" ||
        typeof a.isWritable !== "boolean" ||
        (a.isSigner && a.pubkey !== taker)
      )
        throw new Error("Unexpected route signer.");
      return { ...a, pubkey: new PublicKey(a.pubkey) };
    }),
  });
}
const JUPITER_PROGRAM = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
function setupInstruction(
  value: ApiInstruction,
  taker: string,
  nativeBudget: bigint,
): TransactionInstruction {
  const built = ix(value, taker),
    keys = built.keys.map((k) => k.pubkey.toBase58());
  const wrapped = getAssociatedTokenAddressSync(
    new PublicKey(MAINNET_SOL_MINT),
    new PublicKey(taker),
  ).toBase58();
  if (built.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
    if (
      built.data.length !== 1 ||
      built.data[0] !== 1 ||
      keys.length !== 6 ||
      keys[0] !== taker ||
      keys[2] !== taker ||
      keys[4] !== SystemProgram.programId.toBase58() ||
      ![TOKEN_PROGRAM_ID.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58()].includes(
        keys[5],
      ) ||
      getAssociatedTokenAddressSync(
        new PublicKey(keys[3]),
        new PublicKey(taker),
        false,
        new PublicKey(keys[5]),
      ).toBase58() !== keys[1]
    )
      throw new Error("A route tried to create an unexpected token account.");
  } else if (built.programId.equals(SystemProgram.programId)) {
    if (
      keys.length !== 2 ||
      keys[0] !== taker ||
      keys[1] !== wrapped ||
      built.data.length !== 12 ||
      built.data.readUInt32LE(0) !== 2 ||
      built.data.readBigUInt64LE(4) > nativeBudget
    )
      throw new Error("A route requested an unexpected SOL transfer.");
  } else if (built.programId.equals(TOKEN_PROGRAM_ID)) {
    const sync =
      built.data.length === 1 &&
      built.data[0] === 17 &&
      keys.length === 1 &&
      keys[0] === wrapped;
    const close =
      built.data.length === 1 &&
      built.data[0] === 9 &&
      keys.length === 3 &&
      keys[0] === wrapped &&
      keys[1] === taker &&
      keys[2] === taker;
    if (!sync && !close)
      throw new Error(
        "A route requested an unexpected token permission or transfer.",
      );
  } else throw new Error("A route contains unsupported setup instructions.");
  return built;
}
function balance(account: RpcAccount, mint: string, owner: string): bigint {
  if (!account) return BigInt(0);
  if (
    ![TOKEN_PROGRAM_ID.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58()].includes(
      account.owner,
    )
  )
    throw new Error("Invalid token account in basket simulation.");
  const data = Buffer.from(account.data[0], "base64");
  if (
    data.length < 165 ||
    new PublicKey(data.subarray(0, 32)).toBase58() !== mint ||
    new PublicKey(data.subarray(32, 64)).toBase58() !== owner
  )
    throw new Error("Basket assets must settle to your own token accounts.");
  return data.readBigUInt64LE(64);
}
export async function prepareBasketOrder(
  input: BasketOrderRequest,
): Promise<BasketOrder> {
  const apiKey = process.env.JUPITER_API_KEY;
  if (!apiKey) throw new Error("Jupiter routing is not configured.");
  const taker = new PublicKey(input.taker).toBase58();
  const inputMint = new PublicKey(input.inputMint).toBase58();
  if (!PublicKey.isOnCurve(new PublicKey(taker).toBytes()))
    throw new Error("A signing wallet is required.");
  if (
    typeof input.amount !== "string" ||
    input.amount.length > 40 ||
    !Number.isInteger(input.slippageBps) ||
    input.slippageBps < 1 ||
    input.slippageBps > 300
  )
    throw new Error(
      "Choose an amount and slippage from 1 to 300 basis points.",
    );
  await assertMainnetV1Ready(input.supportedTransactionVersions);
  const market = await getServerMarketCatalog();
  const basket = market.baskets.find((b) => b.id === input.basketId);
  if (
    !hasCompleteIssuerCatalogs(market) ||
    !basket ||
    basket.missingSymbols.length ||
    !basket.assets.length ||
    basket.assets.some((a) => !a.asset.verified || a.asset.tradingHalted)
  )
    throw new Error(
      "The complete, tradable issuer basket is unavailable. No partial basket will be purchased.",
    );
  if (market.assets.find((a) => a.mint === inputMint)?.tradingHalted)
    throw new Error("The input asset is halted.");
  const mints = [inputMint, ...basket.assets.map((a) => a.asset.mint)];
  const [decimals, mintAccounts] = await Promise.all([
    Promise.all(mints.map(getTradeMintDecimals)),
    mainnetRpc<{ value: RpcAccount[] }>("getMultipleAccounts", [
      mints,
      { encoding: "base64", commitment: "confirmed" },
    ]),
  ]);
  const programs = mintAccounts.value.map((a) => {
    if (
      !a ||
      ![TOKEN_PROGRAM_ID.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58()].includes(
        a.owner,
      )
    )
      throw new Error("A basket mint is not an SPL token on mainnet.");
    return new PublicKey(a.owner);
  });
  const inAmount = toTokenAmount(input.amount, decimals[0]);
  const allocations = allocateBasketInput(
    BigInt(inAmount),
    basket.assets.map((a) => ({
      mint: a.asset.mint,
      weightBps: Math.round(a.weight),
    })),
  );
  const destinations = basket.assets.map((a, i) =>
    getAssociatedTokenAddressSync(
      new PublicKey(a.asset.mint),
      new PublicKey(taker),
      false,
      programs[i + 1],
    ).toBase58(),
  );
  const inputAta = getAssociatedTokenAddressSync(
    new PublicKey(inputMint),
    new PublicKey(taker),
    false,
    programs[0],
  ).toBase58();
  const funds =
    inputMint === MAINNET_SOL_MINT
      ? BigInt(
          (
            await mainnetRpc<{ value: number }>("getBalance", [
              taker,
              { commitment: "confirmed" },
            ])
          ).value,
        )
      : balance(
          (
            await mainnetRpc<{ value: RpcAccount }>("getAccountInfo", [
              inputAta,
              { encoding: "base64", commitment: "confirmed" },
            ])
          ).value,
          inputMint,
          taker,
        );
  if (funds < BigInt(inAmount))
    throw new Error("Your wallet balance is below the full basket amount.");
  // No /order transaction concatenation: each route is built for its exact integer allocation.
  const routes = await Promise.all(
    allocations.map(async (a, i) => {
      if (a.mint === inputMint) return null;
      const params = new URLSearchParams({
        inputMint,
        outputMint: a.mint,
        amount: a.amount.toString(),
        taker,
        slippageBps: String(input.slippageBps),
        maxAccounts: "32",
        destinationTokenAccount: destinations[i],
        wrapAndUnwrapSol: "true",
      });
      const response = await fetchJupiterBuild(params, apiKey);
      if (!response.ok)
        throw new Error(
          `No executable route for ${basket.assets[i].asset.symbol}. Try a different funding token or amount.`,
        );
      const r = (await response.json()) as Route;
      if (
        r.inputMint !== inputMint ||
        r.outputMint !== a.mint ||
        r.inAmount !== a.amount.toString() ||
        r.swapMode !== "ExactIn" ||
        r.slippageBps !== input.slippageBps ||
        !raw(r.outAmount) ||
        !raw(r.otherAmountThreshold) ||
        BigInt(r.otherAmountThreshold) > BigInt(r.outAmount) ||
        BigInt(r.otherAmountThreshold) <
          (BigInt(r.outAmount) * BigInt(10000 - input.slippageBps)) /
            BigInt(10000) ||
        (r.platformFee?.feeBps ?? 0) !== 0
      )
        throw new Error(
          "A route did not honor the requested allocation and slippage.",
        );
      if (
        r.swapInstruction?.programId !== JUPITER_PROGRAM ||
        (r.otherInstructions?.length ?? 0) > 0
      )
        throw new Error("Unsupported basket router instructions.");
      return r;
    }),
  );
  const instructions: TransactionInstruction[] = [];
  const setupKeys = new Set<string>();
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i];
    if (!r) continue;
    // A destination override asks Jupiter not to create its ATA. Create it ourselves.
    const { createAssociatedTokenAccountIdempotentInstruction } =
      await import("@solana/spl-token");
    if (!setupKeys.has(destinations[i]))
      instructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
          new PublicKey(taker),
          new PublicKey(destinations[i]),
          new PublicKey(taker),
          new PublicKey(allocations[i].mint),
          programs[i + 1],
        ),
      );
    setupKeys.add(destinations[i]);
    let funded = BigInt(0);
    for (const setup of r.setupInstructions ?? []) {
      const instruction = setupInstruction(
        setup,
        taker,
        inputMint === MAINNET_SOL_MINT ? allocations[i].amount : BigInt(0),
      );
      if (instruction.programId.equals(SystemProgram.programId)) {
        funded += instruction.data.readBigUInt64LE(4);
        if (funded > allocations[i].amount)
          throw new Error("The route exceeds its SOL allocation.");
      }
      if (instruction.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
        const key = instruction.keys[1].pubkey.toBase58();
        if (setupKeys.has(key)) continue;
        setupKeys.add(key);
      }
      instructions.push(instruction);
    }
    instructions.push(ix(r.swapInstruction, taker));
    if (r.cleanupInstruction)
      instructions.push(
        setupInstruction(r.cleanupInstruction, taker, BigInt(0)),
      );
    for (const other of r.otherInstructions ?? [])
      instructions.push(ix(other, taker));
  }
  if (!instructions.length)
    throw new Error("This allocation does not require a swap.");
  // V1 encodes route accounts inline; provider lookup tables are not needed.
  const lifetime = await latestBlockhash();
  const built = await composeMainnetTransaction({
    payer: taker,
    ...lifetime,
    instructions,
    allowV1: true,
  });
  const addresses = [
    ...destinations,
    ...(inputMint !== MAINNET_SOL_MINT ? [inputAta] : []),
  ];
  const before = await mainnetRpc<{ value: RpcAccount[] }>(
    "getMultipleAccounts",
    [addresses, { encoding: "base64", commitment: "confirmed" }],
  );
  const simulation = await simulateComposed(built.transaction, addresses);
  if (!simulation.accounts || simulation.accounts.length !== addresses.length)
    throw new Error("Basket settlement could not be verified by simulation.");
  for (let i = 0; i < routes.length; i++)
    if (
      routes[i] &&
      balance(simulation.accounts[i], allocations[i].mint, taker) -
        balance(before.value[i], allocations[i].mint, taker) <
        BigInt(routes[i]!.otherAmountThreshold)
    )
      throw new Error(
        "A basket route did not deliver its minimum output to your wallet.",
      );
  if (inputMint !== MAINNET_SOL_MINT) {
    const n = addresses.length - 1;
    const spent =
      balance(before.value[n], inputMint, taker) -
      balance(simulation.accounts[n], inputMint, taker);
    const swapAmount = allocations
      .filter((a) => a.mint !== inputMint)
      .reduce((s, a) => s + a.amount, BigInt(0));
    if (spent > swapAmount || spent < BigInt(0))
      throw new Error(
        "The simulated input debit exceeds the reviewed allocation.",
      );
  }
  const order = await authorizeComposed({
    ...built,
    taker,
    lastValidBlockHeight: lifetime.lastValidBlockHeight,
    expiresAt: Date.now() + 45000,
  });
  return {
    ...order,
    basketId: basket.id,
    inputMint,
    inputDecimals: decimals[0],
    inAmount,
    slippageBps: input.slippageBps,
    priorityFeeLamports: 10000,
    outputs: allocations.map((a, i) => ({
      mint: a.mint,
      symbol: basket.assets[i].asset.symbol,
      decimals: decimals[i + 1],
      inputAmount: a.amount.toString(),
      outAmount: routes[i]?.outAmount ?? a.amount.toString(),
      minimumAmount: routes[i]?.otherAmountThreshold ?? a.amount.toString(),
      weightBps: Math.round(basket.assets[i].weight),
    })),
  };
}
