import {
  describeJupiterBuildFailure,
  JupiterBuildError,
  fetchJupiterBuild,
} from "./jupiter-build";
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
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import {
  allocateBasketInput,
  validateJupiterExactInInstruction,
  getJupiterIntermediateMints,
  isClosedJupiterTokenAccount,
  getJupiterNativeTokenBalance,
  validateJupiterIntermediateMint,
  composeBasketV0Chunks,
  composeBasketV1Chunks,
  isTransactionCapacityError,
  BUNDLE_ATOMICITY_WARNING,
  hasCompleteIssuerCatalogs,
  toTokenAmount,
  MAINNET_SOL_MINT,
  MAX_CUSTOM_BASKET_LEGS,
  MIN_CUSTOM_BASKET_LEGS,
  type BasketOrderRequest,
  type BasketOrder,
  type BasketPurchaseOrder,
  type BasketSwapLeg,
  type MarketAsset,
  type SwapToken,
} from "@kite/sdk";
import { getServerBasketPrices, getServerMarketCatalog } from "./markets";
import { getTradeMintDecimals } from "./mint-precision";
import {
  selectMainnetTransactionVersion,
  authorizeComposed,
  latestBlockhash,
  mainnetRpc,
  simulateComposed,
  type RpcAccount,
} from "./composed-transactions";
import { authorizeBundle } from "./bundle-authorization";
import { prepareJitoTip } from "./jito-bundles";
import { loadVerifiedLookupTables } from "./jupiter-lookup-tables";
import { resolvePublishedCreatorBasket } from "./creator-store";

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
  routePlan?: unknown;
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
  if (mint === MAINNET_SOL_MINT) {
    if (account.owner !== TOKEN_PROGRAM_ID.toBase58())
      throw new Error("Invalid wrapped SOL token program.");
    return getJupiterNativeTokenBalance({ data, lamports: account.lamports });
  }
  return data.readBigUInt64LE(64);
}
export async function prepareBasketOrder(
  input: BasketOrderRequest,
): Promise<BasketPurchaseOrder> {
  return prepareAllocationOrder(input);
}

/** Single-token swaps use the same strict build, debit and destination checks. */
export async function prepareTokenSwapOrder(
  input: Omit<BasketOrderRequest, "basketId">,
  outputToken: SwapToken,
): Promise<BasketOrder> {
  const order = await prepareAllocationOrder(
    { ...input, basketId: outputToken.mint },
    outputToken,
  );
  if ("kind" in order)
    throw new Error("Single-token swaps cannot use bundles.");
  return order;
}

/** Compose first; settlement simulation is deliberately outside capacity fallback. */
export async function composeBasketExecution({
  transactionVersion,
  taker,
  lifetime,
  legs,
  routeLookupTables,
  allowBundle = true,
}: {
  transactionVersion: 0 | 1;
  taker: string;
  lifetime: { blockhash: string; lastValidBlockHeight: number };
  legs: BasketSwapLeg[];
  routeLookupTables: Array<Record<string, string[]> | null>;
  /** Standard routes must be rebuilt for Jito after an actual capacity failure. */
  allowBundle?: boolean;
}) {
  // V1 inlines account addresses; referenced ALTs are fetched only for a V0 route.
  const lookupTables =
    transactionVersion === 0
      ? await loadVerifiedLookupTables(routeLookupTables)
      : [];
  const composition = {
    payer: taker,
    blockhash: lifetime.blockhash,
    lastValidBlockHeight: lifetime.lastValidBlockHeight,
    legs,
    lookupTables,
  };
  let tip: Awaited<ReturnType<typeof prepareJitoTip>> | undefined;
  const compose = (finalTipInstruction?: TransactionInstruction) =>
    transactionVersion === 1
      ? composeBasketV1Chunks({
          payer: taker,
          blockhash: lifetime.blockhash,
          lastValidBlockHeight: lifetime.lastValidBlockHeight,
          legs,
          allowV1: true,
          finalTipInstruction,
        })
      : composeBasketV0Chunks({ ...composition, finalTipInstruction });
  let chunks: Awaited<ReturnType<typeof compose>>;
  try {
    // Asset count is not a capacity heuristic: every basket first tries one atomic transaction.
    chunks = await compose();
  } catch (error) {
    // Validation errors are never interpreted as a reason to change execution routes.
    if (!isTransactionCapacityError(error) || legs.length === 1 || !allowBundle)
      throw error;
    tip = await prepareJitoTip(taker);
    chunks = await compose(tip.instruction);
  }
  return { chunks, tipLamports: tip?.lamports ?? 0 };
}

async function prepareAllocationOrder(
  input: BasketOrderRequest,
  outputToken?: SwapToken,
  bundleRoutes = false,
): Promise<BasketPurchaseOrder> {
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
  const transactionVersion = await selectMainnetTransactionVersion(
    input.supportedTransactionVersions,
  );
  const market = await getServerMarketCatalog();
  if (
    market.backpackSecurities?.some(
      (security) =>
        security.discoveryOnly &&
        (security.candidateSolanaMints ?? [security.solanaMint]).some(
          (mint) =>
            mint !== null && (mint === inputMint || mint === outputToken?.mint),
        ),
    )
  )
    throw new Error(
      "This Backpack security is discovery-only until Solana transfers can be verified.",
    );
  const published = outputToken
    ? null
    : await resolvePublishedCreatorBasket(input.basketId);
  if (input.basketId.startsWith("creator-") && !published)
    throw new Error("This published creator basket is unavailable.");
  if (published && input.customAllocations !== undefined)
    throw new Error(
      "Published basket allocations are immutable. Remove client allocation overrides.",
    );
  const customAllocations = published?.allocations ?? input.customAllocations;
  let basket:
    | {
        id: string;
        missingSymbols: string[];
        assets: Array<{ asset: MarketAsset | SwapToken; weight: number }>;
      }
    | undefined;

  if (outputToken) {
    basket = {
      id: outputToken.mint,
      missingSymbols: [],
      assets: [{ asset: outputToken, weight: 10_000 }],
    };
  } else if (
    customAllocations &&
    Array.isArray(customAllocations) &&
    customAllocations.length > 0
  ) {
    if (
      customAllocations.length < MIN_CUSTOM_BASKET_LEGS ||
      customAllocations.length > MAX_CUSTOM_BASKET_LEGS
    ) {
      throw new Error(
        `Custom baskets must contain between ${MIN_CUSTOM_BASKET_LEGS} and ${MAX_CUSTOM_BASKET_LEGS} assets, subject to route capacity.`,
      );
    }
    const seen = new Set<string>();
    let totalBps = 0;
    const resolvedAssets: Array<{ asset: MarketAsset; weight: number }> = [];
    for (const alloc of customAllocations) {
      if (seen.has(alloc.mint))
        throw new Error("Duplicate mint in custom basket.");
      seen.add(alloc.mint);
      if (!Number.isInteger(alloc.weightBps) || alloc.weightBps <= 0) {
        throw new Error("Custom allocation weights must be positive integers.");
      }
      totalBps += alloc.weightBps;
      const asset = market.assets.find((a) => a.mint === alloc.mint);
      if (!asset || !asset.verified || asset.tradingHalted) {
        throw new Error(
          `Asset ${alloc.mint} is unavailable or halted for trading.`,
        );
      }
      resolvedAssets.push({ asset, weight: alloc.weightBps });
    }
    if (totalBps !== 10_000) {
      throw new Error(
        "Custom allocation weights must total exactly 10,000 basis points.",
      );
    }
    basket = {
      id: input.basketId || "custom",
      missingSymbols: [],
      assets: resolvedAssets,
    };
  } else {
    basket = market.baskets.find((b) => b.id === input.basketId);
  }

  if (
    (!outputToken &&
      !customAllocations &&
      !hasCompleteIssuerCatalogs(market)) ||
    !basket ||
    basket.missingSymbols.length ||
    !basket.assets.length ||
    basket.assets.some(
      (a) => (!outputToken && !a.asset.verified) || a.asset.tradingHalted,
    )
  )
    throw new Error(
      "The complete, tradable issuer basket is unavailable. No partial basket will be purchased.",
    );
  if (!outputToken) {
    // The issuer catalog supplies identity/status, not xStock market prices.
    // Check independently hydrated token observations for only this allocation.
    const prices = await getServerBasketPrices(
      market,
      basket.assets.map(({ asset }) => asset.mint),
    );
    const unpriced = basket.assets.filter(
      ({ asset }) => !prices.has(asset.mint),
    );
    if (unpriced.length)
      throw new Error(
        `This basket is unavailable because ${unpriced.map(({ asset }) => asset.symbol).join(", ")} ${unpriced.length === 1 ? "has" : "have"} no current market price. No partial basket will be purchased.`,
      );
  }
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
        // Only the bounded second preparation pass restricts DEXes for Jito.
        ...(bundleRoutes ? { forJitoBundle: "true" } : {}),
      });
      const response = await fetchJupiterBuild(params, apiKey);
      if (!response.ok)
        throw await describeJupiterBuildFailure(
          response,
          basket.assets[i].asset.symbol,
        );
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new JupiterBuildError(
          "invalid-response",
          "Jupiter returned an unreadable routing response. No transactions were submitted.",
          response.status,
        );
      }
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new JupiterBuildError(
          "invalid-response",
          "Jupiter returned an invalid routing response. No transactions were submitted.",
          response.status,
        );
      const r = body as Route;
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
      validateJupiterExactInInstruction({
        instruction: {
          ...r.swapInstruction,
          data: Buffer.from(r.swapInstruction.data, "base64"),
        },
        inputAmount: a.amount,
        quotedOutputAmount: BigInt(r.outAmount),
        minimumOutputAmount: BigInt(r.otherAmountThreshold),
        slippageBps: input.slippageBps,
        settlement: {
          signer: taker,
          sourceTokenAccount: inputAta,
          destinationTokenAccount: destinations[i],
          inputMint,
          outputMint: a.mint,
          inputTokenProgram: programs[0].toBase58(),
          outputTokenProgram: programs[i + 1].toBase58(),
        },
      });
      return r;
    }),
  );
  const legs: BasketSwapLeg[] = [];
  const intermediateAccounts = new Map<
    string,
    { mint: string; tokenProgram: string; allocationIndexes: Set<number> }
  >();
  const trackIntermediate = (
    address: string,
    mint: string,
    tokenProgram: string,
    allocationIndex: number,
  ) => {
    const account = intermediateAccounts.get(address);
    if (account) account.allocationIndexes.add(allocationIndex);
    else
      intermediateAccounts.set(address, {
        mint,
        tokenProgram,
        allocationIndexes: new Set([allocationIndex]),
      });
    if (intermediateAccounts.size > 64)
      throw new Error(
        "The route requires too many intermediate token accounts.",
      );
  };
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i];
    if (!r) continue;
    const instructions: TransactionInstruction[] = [];
    // Every leg is independently executable: ATA setup cannot depend on an earlier chunk.
    const setupKeys = new Set<string>();
    // Jupiter may omit setup for an existing WSOL ATA, but an earlier basket leg
    // can close it. Recreate it idempotently before each native SOL funding leg.
    if (inputMint === MAINNET_SOL_MINT) {
      instructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
          new PublicKey(taker),
          new PublicKey(inputAta),
          new PublicKey(taker),
          new PublicKey(inputMint),
          programs[0],
        ),
      );
      setupKeys.add(inputAta);
    }
    // A destination override asks Jupiter not to create its ATA. Create it ourselves.
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
    if (!Array.isArray(r.setupInstructions) || r.setupInstructions.length > 64)
      throw new Error("The route token-account setup exceeds its limits.");
    let intermediateMints: ReadonlySet<string> | undefined;
    const writableSwapAccounts = new Set(
      r.swapInstruction.accounts
        .filter((account) => account.isWritable && !account.isSigner)
        .map((account) => account.pubkey),
    );
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
        const mint = instruction.keys[3].pubkey.toBase58();
        const tokenProgram = instruction.keys[5].pubkey.toBase58();
        const endpointProgram =
          mint === inputMint
            ? programs[0].toBase58()
            : mint === allocations[i].mint
              ? programs[i + 1].toBase58()
              : undefined;
        if (endpointProgram) {
          if (tokenProgram !== endpointProgram)
            throw new Error(
              "A route token account uses the wrong token program.",
            );
        } else {
          intermediateMints ??= getJupiterIntermediateMints(
            r.routePlan,
            inputMint,
            allocations[i].mint,
          );
          if (!intermediateMints.has(mint) || !writableSwapAccounts.has(key))
            throw new Error(
              "A route requested a token account outside its verified swap path.",
            );
          trackIntermediate(key, mint, tokenProgram, i);
        }
        if (setupKeys.has(key)) continue;
        setupKeys.add(key);
      }
      instructions.push(instruction);
    }
    // Existing owner ATAs may be omitted from Jupiter's setup list. Track
    // canonical writable intermediates too; setup omission cannot skip checks.
    intermediateMints ??= getJupiterIntermediateMints(
      r.routePlan,
      inputMint,
      allocations[i].mint,
    );
    for (const mint of intermediateMints) {
      for (const program of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
        const address = getAssociatedTokenAddressSync(
          new PublicKey(mint),
          new PublicKey(taker),
          false,
          program,
        ).toBase58();
        if (!writableSwapAccounts.has(address)) continue;
        trackIntermediate(address, mint, program.toBase58(), i);
        // A preceding leg can close a WSOL intermediary even for USDT funding.
        if (mint === MAINNET_SOL_MINT && !setupKeys.has(address)) {
          instructions.unshift(
            createAssociatedTokenAccountIdempotentInstruction(
              new PublicKey(taker),
              new PublicKey(address),
              new PublicKey(taker),
              new PublicKey(mint),
              program,
            ),
          );
          setupKeys.add(address);
        }
      }
    }
    instructions.push(ix(r.swapInstruction, taker));
    if (r.cleanupInstruction)
      instructions.push(
        setupInstruction(r.cleanupInstruction, taker, BigInt(0)),
      );
    for (const other of r.otherInstructions ?? [])
      instructions.push(ix(other, taker));
    legs.push({ allocationIndex: i, instructions });
  }
  if (!legs.length) throw new Error("This allocation does not require a swap.");
  // Route metadata is untrusted. Confirm every additional mint and its token
  // program on the independently mainnet-verified RPC before composition.
  const intermediateMints = [
    ...new Set(
      [...intermediateAccounts.values()].map((account) => account.mint),
    ),
  ];
  if (intermediateMints.length) {
    const result = await mainnetRpc<{ value: RpcAccount[] }>(
      "getMultipleAccounts",
      [intermediateMints, { encoding: "base64", commitment: "confirmed" }],
    );
    if (result.value.length !== intermediateMints.length)
      throw new Error("Intermediate token mints could not be verified.");
    const mintPrograms = new Map(
      intermediateMints.map((mint, index) => {
        const account = result.value[index];
        return [
          mint,
          validateJupiterIntermediateMint(
            mint,
            account && {
              owner: account.owner,
              data: Buffer.from(account.data[0], "base64"),
              executable: account.executable,
            },
          ),
        ] as const;
      }),
    );
    for (const account of intermediateAccounts.values())
      if (mintPrograms.get(account.mint) !== account.tokenProgram)
        throw new Error(
          "An intermediate token account uses the wrong token program.",
        );
  }
  const lifetime = await latestBlockhash();
  let composition: Awaited<ReturnType<typeof composeBasketExecution>>;
  try {
    composition = await composeBasketExecution({
      transactionVersion,
      taker,
      lifetime,
      legs,
      routeLookupTables: routes
        .filter((route): route is Route => route !== null)
        .map((route) => route.addressesByLookupTableAddress),
      allowBundle: bundleRoutes,
    });
  } catch (error) {
    if (
      !bundleRoutes &&
      !outputToken &&
      legs.length > 1 &&
      isTransactionCapacityError(error)
    ) {
      // Re-quote every exact allocation once with compatible DEXes. All owner,
      // mint, amount and instruction validation runs again on the new routes.
      // No order has been authorized or submitted at this point.
      return prepareAllocationOrder(input, outputToken, true);
    }
    throw error;
  }
  const { chunks, tipLamports } = composition;
  const addresses = [
    ...destinations,
    ...(inputMint !== MAINNET_SOL_MINT ? [inputAta] : []),
    taker,
  ];
  const walletIndex = addresses.length - 1;
  for (const address of intermediateAccounts.keys())
    if (!addresses.includes(address)) addresses.push(address);
  const before = await mainnetRpc<{ value: RpcAccount[] }>(
    "getMultipleAccounts",
    [addresses, { encoding: "base64", commitment: "confirmed" }],
  );
  if (before.value.length !== addresses.length)
    throw new Error("Basket starting balances could not be verified.");
  const walletBefore = before.value[walletIndex];
  if (!walletBefore || !Number.isSafeInteger(walletBefore.lamports))
    throw new Error("The fee payer balance is unavailable.");
  let totalLamports = BigInt(0);
  // Chunks deliberately do not consume each other's outputs. Independent simulation validates
  // every route's delivery. It does not prove sequential bundle execution or Jito V1 transport support.
  for (const chunk of chunks) {
    const simulation = await simulateComposed(chunk.transaction, addresses);
    if (!simulation.accounts || simulation.accounts.length !== addresses.length)
      throw new Error("Basket settlement could not be verified by simulation.");
    for (const i of chunk.allocationIndexes) {
      if (
        balance(simulation.accounts[i], allocations[i].mint, taker) -
          balance(before.value[i], allocations[i].mint, taker) <
        BigInt(routes[i]!.otherAmountThreshold)
      )
        throw new Error(
          "A basket route did not deliver its minimum output to your wallet.",
        );
    }
    const swapAmount = chunk.allocationIndexes.reduce(
      (sum, index) => sum + allocations[index].amount,
      BigInt(0),
    );
    if (inputMint !== MAINNET_SOL_MINT) {
      const n = destinations.length;
      const spent =
        balance(before.value[n], inputMint, taker) -
        balance(simulation.accounts[n], inputMint, taker);
      if (spent !== swapAmount)
        throw new Error(
          "The simulated input debit does not match the reviewed allocation.",
        );
    }
    // A multihop swap may use an existing owner ATA, but it must never spend
    // that account's preexisting balance beyond the reviewed funding debit.
    for (const [address, account] of intermediateAccounts) {
      if (
        !chunk.allocationIndexes.some((index) =>
          account.allocationIndexes.has(index),
        )
      )
        continue;
      const index = addresses.indexOf(address);
      // RPC simulation may return a cleared system account after CloseAccount
      // instead of null. Only that exact zero-lamport representation is empty;
      // prefunded or malformed accounts must still fail validation.
      const starting = isClosedJupiterTokenAccount(before.value[index])
        ? null
        : before.value[index];
      const ending = isClosedJupiterTokenAccount(simulation.accounts[index])
        ? null
        : simulation.accounts[index];
      if (
        (starting && starting.owner !== account.tokenProgram) ||
        (ending && ending.owner !== account.tokenProgram)
      )
        throw new Error(
          "An intermediate token account has an unexpected owner or state. No transaction was created.",
        );
      if (
        balance(ending, account.mint, taker) <
        balance(starting, account.mint, taker)
      )
        throw new Error(
          "A route would spend an existing intermediate token balance.",
        );
    }
    const walletAfter = simulation.accounts[walletIndex];
    if (!walletAfter || !Number.isSafeInteger(walletAfter.lamports))
      throw new Error("The simulated SOL budget is unavailable.");
    const debit = BigInt(walletBefore.lamports) - BigInt(walletAfter.lamports);
    const minimumDebit =
      inputMint === MAINNET_SOL_MINT ? swapAmount : BigInt(0);
    totalLamports += debit > minimumDebit ? debit : minimumDebit;
  }
  // Reserve all chunks together, including fees if the RPC simulation does not deduct them.
  if (
    BigInt(walletBefore.lamports) <
    totalLamports + BigInt(chunks.length * 15_000)
  )
    throw new Error(
      "Your wallet needs more SOL for all basket transactions, account rent and the reviewed tip.",
    );
  const metadata = {
    basketId: basket.id,
    inputMint,
    inputDecimals: decimals[0],
    inAmount,
    slippageBps: input.slippageBps,
    priorityFeeLamports: 10_000 * chunks.length,
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
  const expiresAt = Date.now() + 60_000;
  const basketReceipt = {
    basketId: basket.id,
    inputMint,
    inAmount: allocations
      .filter((allocation) => allocation.mint !== inputMint)
      .reduce((sum, allocation) => sum + allocation.amount, BigInt(0))
      .toString(),
  };
  if (chunks.length === 1) {
    const order = await authorizeComposed(
      {
        transaction: chunks[0].transaction,
        serializedBytes: chunks[0].serializedBytes,
        transactionVersion,
        taker,
        lastValidBlockHeight: lifetime.lastValidBlockHeight,
        expiresAt,
      },
      undefined,
      undefined,
      basketReceipt,
    );
    return { ...order, ...metadata };
  }
  const transactions = chunks.map((chunk) => chunk.transaction);
  return {
    kind: "bundle",
    ...metadata,
    ...(await authorizeBundle({
      transactions,
      taker,
      expiresAt,
      lastValidBlockHeight: lifetime.lastValidBlockHeight,
      ...basketReceipt,
    })),
    transactions,
    taker,
    expiresAt,
    lastValidBlockHeight: lifetime.lastValidBlockHeight,
    transactionVersion,
    serializedBytes: chunks.map((chunk) => chunk.serializedBytes),
    tipLamports,
    atomicityWarning: BUNDLE_ATOMICITY_WARNING,
  };
}
