import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  unpackMint,
  getTransferFeeConfig,
  getTransferHook,
  getNonTransferable,
  getPausableConfig,
} from "@solana/spl-token";
import {
  allocateBasketInput,
  validateJupiterExactInInstruction,
  type JupiterExactInTerms,
  buildCollectRecurringInstructions,
  composeMainnetTransaction,
  recurringRemaining,
  type RecurringInvestmentPlan,
} from "@kite/sdk";
import {
  assertMainnetV1Ready,
  authorizeComposed,
  latestBlockhash,
  mainnetRpc,
  simulateComposed,
  type RpcAccount,
} from "./composed-transactions";
import { readDelegation } from "./recurring-payments";
import { getServerMarketCatalog } from "./markets";
import { getTradeMintDecimals } from "./mint-precision";
import { fetchJupiterBuild } from "./jupiter-build";

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
  slippageBps: number;
  swapMode: string;
  priceImpactPct: string | number;
  swapInstruction: ApiInstruction;
  setupInstructions?: ApiInstruction[];
  otherInstructions?: ApiInstruction[];
  cleanupInstruction?: ApiInstruction | null;
  platformFee?: { feeBps: number } | null;
};
const JUPITER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const programs = [
  TOKEN_PROGRAM_ID.toBase58(),
  TOKEN_2022_PROGRAM_ID.toBase58(),
];
export async function assertInvestmentMintsSupported(mints: string[]) {
  const { value } = await mainnetRpc<{ value: RpcAccount[] }>(
    "getMultipleAccounts",
    [mints, { encoding: "base64", commitment: "confirmed" }],
  );
  return value.map((account, i) => {
    if (!account || !programs.includes(account.owner))
      throw new Error("An investment mint is not a supported mainnet token.");
    const program = new PublicKey(account.owner);
    const mint = unpackMint(
      new PublicKey(mints[i]),
      {
        ...account,
        owner: program,
        data: Buffer.from(account.data[0], "base64"),
        rentEpoch: 0,
      },
      program,
    );
    if (
      getTransferHook(mint) ||
      getNonTransferable(mint) ||
      getPausableConfig(mint)?.paused ||
      (i === 0 && getTransferFeeConfig(mint))
    )
      throw new Error(
        "Recurring investing cannot use transfer-hook, non-transferable or paused assets, or a funding token with transfer fees.",
      );
    return program;
  });
}
export function investmentTokenBalance(
  value: RpcAccount,
  mint: string,
  owner: string,
): bigint {
  if (!value) return BigInt(0);
  if (!programs.includes(value.owner))
    throw new Error("Unexpected token account program.");
  const bytes = Buffer.from(value.data[0], "base64");
  if (
    bytes.length < 165 ||
    new PublicKey(bytes.subarray(0, 32)).toBase58() !== mint ||
    new PublicKey(bytes.subarray(32, 64)).toBase58() !== owner
  )
    throw new Error(
      "Investment tokens must settle to their expected owner's accounts.",
    );
  return bytes.readBigUInt64LE(64);
}
export function validateInvestmentRoute(
  route: Route,
  amount: bigint,
  output: string,
  plan: RecurringInvestmentPlan,
  settlement?: JupiterExactInTerms["settlement"],
) {
  const positive = (v: unknown): v is string =>
    typeof v === "string" &&
    /^[1-9]\d{0,19}$/.test(v) &&
    BigInt(v) <= BigInt("18446744073709551615");
  const validImpact =
    typeof route.priceImpactPct === "number" ||
    (typeof route.priceImpactPct === "string" &&
      /^-?(?:\d+\.?\d*|\.\d+)$/.test(route.priceImpactPct));
  const impact = Number(route.priceImpactPct);
  if (
    route.inputMint !== plan.fundingMint ||
    route.outputMint !== output ||
    route.inAmount !== amount.toString() ||
    route.swapMode !== "ExactIn" ||
    route.slippageBps !== plan.slippageBps ||
    !positive(route.outAmount) ||
    !positive(route.otherAmountThreshold) ||
    BigInt(route.otherAmountThreshold) > BigInt(route.outAmount) ||
    BigInt(route.otherAmountThreshold) <
      (BigInt(route.outAmount) * BigInt(10000 - plan.slippageBps)) /
        BigInt(10000) ||
    !validImpact ||
    !Number.isFinite(impact) ||
    Math.abs(impact) > 0.01 ||
    (route.platformFee?.feeBps ?? 0) !== 0 ||
    route.swapInstruction?.programId !== JUPITER ||
    (route.otherInstructions?.length ?? 0) !== 0 ||
    route.cleanupInstruction
  )
    throw new Error(
      "The investment route exceeded its allocation, slippage or 1% price-impact policy.",
    );
  validateJupiterExactInInstruction({
    instruction: {
      ...route.swapInstruction,
      data: Buffer.from(route.swapInstruction.data, "base64"),
    },
    inputAmount: amount,
    quotedOutputAmount: BigInt(route.outAmount),
    minimumOutputAmount: BigInt(route.otherAmountThreshold),
    slippageBps: plan.slippageBps,
    settlement,
  });
}
function instruction(value: ApiInstruction, buyer: string) {
  if (
    !value ||
    !Array.isArray(value.accounts) ||
    typeof value.data !== "string" ||
    value.data.length > 8192 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)
  )
    throw new Error("Invalid investment route instruction.");
  return new TransactionInstruction({
    programId: new PublicKey(value.programId),
    data: Buffer.from(value.data, "base64"),
    keys: value.accounts.map((a) => {
      if (
        typeof a.isSigner !== "boolean" ||
        typeof a.isWritable !== "boolean" ||
        (a.isSigner && a.pubkey !== buyer)
      )
        throw new Error("Unexpected investment route signer.");
      return { ...a, pubkey: new PublicKey(a.pubkey) };
    }),
  });
}
export async function prepareRecurringInvestmentOrder(
  plan: RecurringInvestmentPlan,
  runId: string,
) {
  await assertMainnetV1Ready([1]);
  const apiKey = process.env.JUPITER_API_KEY;
  if (!apiKey) throw new Error("Jupiter routing is not configured.");
  const { payment } = await readDelegation(plan.delegation);
  if (
    payment.owner !== plan.owner ||
    payment.buyer !== plan.buyer ||
    payment.mint !== plan.fundingMint ||
    payment.amountPerPeriod !== plan.amountUnits ||
    payment.periodSeconds !== plan.permission.periodSeconds ||
    payment.expiresAt !== plan.permission.expiresAt
  )
    throw new Error(
      "The investment permission no longer matches the approved plan.",
    );
  if (
    recurringRemaining(payment, Math.floor(Date.now() / 1000)).amount <
    BigInt(plan.amountUnits)
  )
    throw new Error("This period's allowance is already spent or unavailable.");
  const market = await getServerMarketCatalog();
  for (const allocation of plan.allocations) {
    const asset = market.assets.find((a) => a.mint === allocation.mint);
    if (!asset?.verified || asset.tradingHalted)
      throw new Error(
        "An investment asset is currently unavailable or paused. No partial purchase was prepared.",
      );
  }
  if (market.assets.find((a) => a.mint === plan.fundingMint)?.tradingHalted)
    throw new Error("The funding asset is paused.");
  const mints = [plan.fundingMint, ...plan.allocations.map((a) => a.mint)];
  const [mintPrograms, decimals] = await Promise.all([
    assertInvestmentMintsSupported(mints),
    Promise.all(mints.map(getTradeMintDecimals)),
  ]);
  const buyer = new PublicKey(plan.buyer),
    owner = new PublicKey(plan.owner),
    funding = new PublicKey(plan.fundingMint);
  const source = getAssociatedTokenAddressSync(
    funding,
    owner,
    false,
    mintPrograms[0],
  );
  const staging = getAssociatedTokenAddressSync(
    funding,
    buyer,
    false,
    mintPrograms[0],
  );
  const destinations = plan.allocations.map((a, i) =>
    getAssociatedTokenAddressSync(
      new PublicKey(a.mint),
      owner,
      false,
      mintPrograms[i + 1],
    ),
  );
  const addresses = [
    source.toBase58(),
    staging.toBase58(),
    ...destinations.map((a) => a.toBase58()),
  ];
  const { value: before } = await mainnetRpc<{ value: RpcAccount[] }>(
    "getMultipleAccounts",
    [addresses, { encoding: "base64", commitment: "confirmed" }],
  );
  if (
    investmentTokenBalance(before[0], plan.fundingMint, plan.owner) <
    BigInt(plan.amountUnits)
  )
    throw new Error(
      "The wallet has insufficient funding for this scheduled investment.",
    );
  const allocations = allocateBasketInput(
    BigInt(plan.amountUnits),
    plan.allocations,
  );
  const instructions = await buildCollectRecurringInstructions(
    payment,
    BigInt(plan.amountUnits),
    mintPrograms[0].toBase58(),
  );
  const outputs = [];
  for (let i = 0; i < allocations.length; i++) {
    const a = allocations[i],
      destination = destinations[i];
    if (a.mint === plan.fundingMint) {
      instructions.push(
        createTransferCheckedInstruction(
          staging,
          funding,
          source,
          buyer,
          a.amount,
          decimals[0],
          [],
          mintPrograms[0],
        ),
      );
      outputs.push({
        mint: a.mint,
        symbol: plan.allocations[i].symbol,
        amountUnits: a.amount.toString(),
        decimals: decimals[0],
      });
      continue;
    }
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        buyer,
        destination,
        owner,
        new PublicKey(a.mint),
        mintPrograms[i + 1],
      ),
    );
    const response = await fetchJupiterBuild(
      new URLSearchParams({
        inputMint: plan.fundingMint,
        outputMint: a.mint,
        amount: a.amount.toString(),
        taker: plan.buyer,
        slippageBps: String(plan.slippageBps),
        maxAccounts: "24",
        destinationTokenAccount: destination.toBase58(),
        wrapAndUnwrapSol: "false",
      }),
      apiKey,
    );
    if (!response.ok)
      throw new Error(
        `No executable investment route for ${plan.allocations[i].symbol}.`,
      );
    const route = (await response.json()) as Route;
    validateInvestmentRoute(route, a.amount, a.mint, plan, {
      signer: plan.buyer,
      sourceTokenAccount: staging.toBase58(),
      destinationTokenAccount: destination.toBase58(),
      inputMint: plan.fundingMint,
      outputMint: a.mint,
      inputTokenProgram: mintPrograms[0].toBase58(),
      outputTokenProgram: mintPrograms[i + 1].toBase58(),
    });
    for (const setup of route.setupInstructions ?? []) {
      const ix = instruction(setup, plan.buyer),
        keys = ix.keys.map((k) => k.pubkey.toBase58());
      // Only idempotent creation of the executor's funding ATA is needed; output accounts are ours.
      if (
        !ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID) ||
        ix.data.length !== 1 ||
        ix.data[0] !== 1 ||
        keys.length !== 6 ||
        keys[0] !== plan.buyer ||
        keys[1] !== staging.toBase58() ||
        keys[2] !== plan.buyer ||
        keys[3] !== plan.fundingMint ||
        keys[4] !== SystemProgram.programId.toBase58() ||
        keys[5] !== mintPrograms[0].toBase58()
      )
        throw new Error("The route requested unsupported account setup.");
    }
    instructions.push(instruction(route.swapInstruction, plan.buyer));
    outputs.push({
      mint: a.mint,
      symbol: plan.allocations[i].symbol,
      amountUnits: route.otherAmountThreshold,
      decimals: decimals[i + 1],
    });
  }
  const lifetime = await latestBlockhash();
  const built = await composeMainnetTransaction({
    payer: plan.buyer,
    ...lifetime,
    instructions,
    allowV1: true,
  });
  const simulation = await simulateComposed(built.transaction, addresses);
  if (!simulation.accounts || simulation.accounts.length !== addresses.length)
    throw new Error("Investment settlement could not be verified.");
  const after = simulation.accounts;
  const retained = allocations
    .filter((a) => a.mint === plan.fundingMint)
    .reduce((s, a) => s + a.amount, BigInt(0));
  if (
    investmentTokenBalance(before[0], plan.fundingMint, plan.owner) -
      investmentTokenBalance(after[0], plan.fundingMint, plan.owner) !==
      BigInt(plan.amountUnits) - retained ||
    investmentTokenBalance(before[1], plan.fundingMint, plan.buyer) !==
      investmentTokenBalance(after[1], plan.fundingMint, plan.buyer)
  )
    throw new Error(
      "The investment did not consume exactly its authorized allocation.",
    );
  for (let i = 0; i < outputs.length; i++)
    if (
      outputs[i].mint !== plan.fundingMint &&
      investmentTokenBalance(after[i + 2], outputs[i].mint, plan.owner) -
        investmentTokenBalance(before[i + 2], outputs[i].mint, plan.owner) <
        BigInt(outputs[i].amountUnits)
    )
      throw new Error(
        "An investment output did not reach the investor's wallet.",
      );
  return {
    order: await authorizeComposed(
      {
        ...built,
        taker: plan.buyer,
        lastValidBlockHeight: lifetime.lastValidBlockHeight,
        expiresAt: Date.now() + 45000,
      },
      { planId: plan.id, runId },
    ),
    outputs,
  };
}
