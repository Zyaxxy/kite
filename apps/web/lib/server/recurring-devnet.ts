import { randomBytes } from "node:crypto";
import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  unpackAccount,
  unpackMint,
} from "@solana/spl-token";
import {
  allocateGuardFunding,
  buildGuardCloseInstructions,
  buildGuardCollectInstructions,
  buildGuardCreateInstructions,
  buildGuardProtocolVersionInstruction,
  composeV1Transaction,
  decodeDevnetCpmmPool,
  decodeDevnetCpmmTradeFee,
  decodeGuardPlanV2,
  decodeRecurringPayment,
  decodeSubscriptionAuthority,
  DEVNET_RECURRING_BASKETS,
  DEVNET_RAYDIUM_CPMM_PROGRAM,
  DEVNET_XSTOCK_CATALOG,
  guardDuePeriod,
  guardSubscriptionAuthority,
  KITE_GUARD_PROGRAM_ID,
  MAINNET_SUBSCRIPTIONS_PROGRAM,
  quoteDevnetCpmmExactIn,
  raydiumDevnetAuthority,
  resolveDevnetBasketAssets,
  toTokenAmount,
  validateDevnetXStockManifest,
  type DevnetCpmmPool,
  type DevnetGuardPlan,
  type DevnetXStockManifest,
  type DevnetXStockToken,
} from "@kite/sdk";
import manifestJson from "../../public/xstocks-devnet/xstocks.json";
import type { RpcAccount } from "./composed-transactions";
import type { CreateDevnetPlanRequest } from "./recurring-devnet-policy";
import {
  assertRecurringDevnet,
  assertRecurringV1,
  authorizeRecurringTransaction,
  recurringAuthorizationConfigured,
  recurringDevnetRpc,
  recurringLatestBlockhash,
  recurringV1Active,
  simulateRecurring,
} from "./recurring-devnet-transport";

const TOKEN_PROGRAM = TOKEN_PROGRAM_ID.toBase58();
const CPMM_PROGRAM = DEVNET_RAYDIUM_CPMM_PROGRAM.toBase58();
const GUARD_PROGRAM = KITE_GUARD_PROGRAM_ID.toBase58();
const QUOTE_SLIPPAGE_BPS = 100;
type AccountMap = Map<string, RpcAccount>;
interface VerifiedPool {
  pool: DevnetCpmmPool;
  inputVaultAmount: bigint;
  outputVaultAmount: bigint;
  tradeFeeRate: bigint;
}
const accountInfo = (value: NonNullable<RpcAccount>) => ({
  ...value,
  data: Buffer.from(value.data[0], "base64"),
  owner: new PublicKey(value.owner),
  rentEpoch: 0,
});

async function loadAccounts(
  addresses: string[],
  cache: AccountMap = new Map(),
): Promise<AccountMap> {
  const missing = [...new Set(addresses)].filter(
    (address) => !cache.has(address),
  );
  for (let start = 0; start < missing.length; start += 100) {
    const batch = missing.slice(start, start + 100);
    const { value } = await recurringDevnetRpc<{ value: RpcAccount[] }>(
      "getMultipleAccounts",
      [batch, { encoding: "base64", commitment: "confirmed" }],
    );
    if (value.length !== batch.length)
      throw new Error("Devnet returned an incomplete account snapshot.");
    batch.forEach((address, index) => cache.set(address, value[index]));
  }
  return cache;
}
function requiredAccount(
  cache: AccountMap,
  address: string,
  owner: string,
  label: string,
): NonNullable<RpcAccount> {
  const value = cache.get(address);
  if (
    !value ||
    value.owner !== owner ||
    value.data[1] !== "base64" ||
    value.executable
  )
    throw new Error(
      `${label} is missing or has the wrong devnet program owner.`,
    );
  return value;
}
function manifest(): DevnetXStockManifest {
  return validateDevnetXStockManifest(manifestJson);
}
function configuredPools(): Record<string, string> {
  const input = JSON.parse(process.env.KITE_RECURRING_POOLS || "{}") as unknown;
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).length > 40
  )
    throw new Error("The devnet pool registry is invalid.");
  return Object.fromEntries(
    Object.entries(input).map(([mint, pool]) => {
      if (typeof pool !== "string")
        throw new Error("The devnet pool registry is invalid.");
      return [new PublicKey(mint).toBase58(), new PublicKey(pool).toBase58()];
    }),
  );
}
function verifyMint(token: DevnetXStockToken, cache: AccountMap) {
  const value = requiredAccount(
    cache,
    token.mint,
    TOKEN_PROGRAM,
    `${token.symbol} mint`,
  );
  if (Buffer.from(value.data[0], "base64").length !== 82)
    throw new Error(
      "Recurring supports plain SPL devnet mints without extensions.",
    );
  const decoded = unpackMint(
    new PublicKey(token.mint),
    accountInfo(value),
    TOKEN_PROGRAM_ID,
  );
  if (
    !decoded.isInitialized ||
    decoded.decimals !== token.decimals ||
    decoded.freezeAuthority
  )
    throw new Error(
      `${token.symbol} is not a supported unfrozen devnet test mint.`,
    );
  return decoded;
}
function readToken(
  cache: AccountMap,
  address: string,
  mint: string,
  owner: string,
) {
  const value = requiredAccount(cache, address, TOKEN_PROGRAM, "Token account");
  if (Buffer.from(value.data[0], "base64").length !== 165)
    throw new Error("Unsupported token account extensions.");
  const decoded = unpackAccount(
    new PublicKey(address),
    accountInfo(value),
    TOKEN_PROGRAM_ID,
  );
  if (
    !decoded.isInitialized ||
    decoded.isFrozen ||
    decoded.mint.toBase58() !== mint ||
    decoded.owner.toBase58() !== owner
  )
    throw new Error(
      "The devnet token account has unexpected mint, owner, or frozen state.",
    );
  return decoded;
}
async function chainNow(): Promise<bigint> {
  const slot = await recurringDevnetRpc<number>("getSlot", [
    { commitment: "confirmed" },
  ]);
  const time = await recurringDevnetRpc<number | null>("getBlockTime", [slot]);
  if (!Number.isSafeInteger(time) || Number(time) <= 0)
    throw new Error(
      "Devnet time is unavailable. Retry when the RPC catches up.",
    );
  return BigInt(Number(time));
}
async function verifyPrograms() {
  const addresses = [
    GUARD_PROGRAM,
    CPMM_PROGRAM,
    MAINNET_SUBSCRIPTIONS_PROGRAM,
  ];
  const accounts = await loadAccounts(addresses);
  if (addresses.some((address) => !accounts.get(address)?.executable))
    throw new Error(
      "The recurring contract, Subscriptions, and Raydium CPMM must all be deployed on devnet.",
    );
}
async function protocolVersion(payer: string) {
  const lifetime = await recurringLatestBlockhash();
  const built = await composeV1Transaction({
    payer,
    ...lifetime,
    instructions: [buildGuardProtocolVersionInstruction()],
    allowV1: true,
    computeUnitLimit: 50_000,
    priorityFeeLamports: 0,
  });
  await simulateRecurring(built.transaction, {
    programId: GUARD_PROGRAM,
    value: 2,
  });
}

async function verifiedPools(
  funding: DevnetXStockToken,
  outputs: Array<{ token: DevnetXStockToken; poolAddress: string }>,
): Promise<VerifiedPool[]> {
  const initial = await loadAccounts([
    funding.mint,
    ...outputs.flatMap(({ token, poolAddress }) => [token.mint, poolAddress]),
  ]);
  verifyMint(funding, initial);
  const pools = outputs.map(({ token, poolAddress }) => {
    verifyMint(token, initial);
    const value = requiredAccount(
      initial,
      poolAddress,
      CPMM_PROGRAM,
      "Approved swap pool",
    );
    return decodeDevnetCpmmPool(
      Buffer.from(value.data[0], "base64"),
      poolAddress,
      funding.mint,
      token.mint,
    );
  });
  await loadAccounts(
    pools.flatMap((pool) => [
      pool.ammConfig,
      pool.inputVault,
      pool.outputVault,
      pool.observation,
    ]),
    initial,
  );
  return pools.map((pool) => {
    const config = requiredAccount(
      initial,
      pool.ammConfig,
      CPMM_PROGRAM,
      "Pool fee configuration",
    );
    requiredAccount(
      initial,
      pool.observation,
      CPMM_PROGRAM,
      "Pool observation",
    );
    const input = readToken(
      initial,
      pool.inputVault,
      funding.mint,
      raydiumDevnetAuthority().toBase58(),
    );
    const output = readToken(
      initial,
      pool.outputVault,
      pool.outputMint,
      raydiumDevnetAuthority().toBase58(),
    );
    if (
      input.delegate ||
      output.delegate ||
      input.closeAuthority ||
      output.closeAuthority
    )
      throw new Error("Unsupported delegated pool vault.");
    return {
      pool,
      inputVaultAmount: input.amount,
      outputVaultAmount: output.amount,
      tradeFeeRate: decodeDevnetCpmmTradeFee(
        Buffer.from(config.data[0], "base64"),
      ),
    };
  });
}

export async function getDevnetRecurringConfig() {
  const reasons: string[] = [];
  let catalog: DevnetXStockManifest | undefined;
  let registry: Record<string, string> = {};
  const supported = new Set<string>();
  try {
    catalog = manifest();
    registry = configuredPools();
  } catch (error) {
    reasons.push(
      error instanceof Error ? error.message : "Invalid devnet configuration.",
    );
  }
  if (!catalog?.fundingToken)
    reasons.push(
      "Provision the KUSD funding mint and devnet xStock test mints before creating a plan.",
    );
  if (!recurringAuthorizationConfigured())
    reasons.push(
      "Devnet recurring transaction authorization is not configured.",
    );
  try {
    await assertRecurringDevnet();
    await verifyPrograms();
    if (!(await recurringV1Active()))
      reasons.push(
        "The configured devnet RPC does not have V1 transactions activated.",
      );
    if (catalog?.fundingToken) {
      const now = await chainNow();
      // An invalid asset does not hide other explicitly provisioned, verified stock targets.
      const candidates = catalog.tokens.filter((token) => registry[token.mint]);
      for (let start = 0; start < candidates.length; start += 4) {
        const batch = candidates.slice(start, start + 4);
        const validateQuote = (
          token: DevnetXStockToken,
          pool: VerifiedPool,
        ) => {
          quoteDevnetCpmmExactIn({
            ...pool,
            amountIn: BigInt(10 ** catalog!.fundingToken!.decimals),
            slippageBps: QUOTE_SLIPPAGE_BPS,
            nowSeconds: now,
          });
          supported.add(token.underlyingSymbol);
        };
        try {
          const pools = await verifiedPools(
            catalog.fundingToken,
            batch.map((token) => ({
              token,
              poolAddress: registry[token.mint],
            })),
          );
          batch.forEach((token, index) => {
            try {
              validateQuote(token, pools[index]);
            } catch {
              /* Unavailable target. */
            }
          });
        } catch {
          await Promise.all(
            batch.map(async (token) => {
              try {
                const [pool] = await verifiedPools(catalog!.fundingToken!, [
                  { token, poolAddress: registry[token.mint] },
                ]);
                validateQuote(token, pool);
              } catch {
                /* This target stays unavailable; preparation repeats detailed checks. */
              }
            }),
          );
        }
      }
      if (!supported.size)
        reasons.push(
          "No provisioned xStock has a verified, liquid devnet CPMM pool.",
        );
    }
  } catch (error) {
    reasons.push(
      error instanceof Error
        ? error.message
        : "The devnet recurring backend is unavailable.",
    );
  }
  return {
    schemaVersion: 1,
    network: "devnet",
    protocolVersion: 2,
    status: reasons.length ? "blocked" : "requires-wallet-verification",
    readyToPrepare: reasons.length === 0,
    contractVerification:
      "The connected wallet must pass a protocol v2 simulation before any transaction is returned for approval.",
    reasons,
    fundingToken: catalog?.fundingToken ?? null,
    fundingSymbol: "KUSD",
    testTokensOnly: true,
    slippageBps: QUOTE_SLIPPAGE_BPS,
    stocks: DEVNET_XSTOCK_CATALOG.map((token) => ({
      ...token,
      id: token.underlyingSymbol,
      available: supported.has(token.underlyingSymbol),
    })),
    baskets: DEVNET_RECURRING_BASKETS.map((basket) => ({
      ...basket,
      available: basket.underlyingSymbols.every((symbol) =>
        supported.has(symbol),
      ),
    })),
  };
}

async function prepareOrder(
  payer: string,
  plan: string,
  operation: "create" | "collect" | "close",
  instructions: TransactionInstruction[],
) {
  const lifetime = await recurringLatestBlockhash();
  const built = await composeV1Transaction({
    payer,
    ...lifetime,
    instructions,
    allowV1: true,
    computeUnitLimit: 1_400_000,
    priorityFeeLamports: 0,
  });
  await simulateRecurring(built.transaction);
  return authorizeRecurringTransaction({
    transaction: built.transaction,
    signer: payer,
    plan,
    operation,
    expiresAt: Date.now() + 45_000,
    lastValidBlockHeight: lifetime.lastValidBlockHeight,
  });
}

async function fundingAuthority(
  owner: string,
  funding: DevnetXStockToken,
  requiredAmount: bigint,
) {
  const authority = guardSubscriptionAuthority(owner, funding.mint).toBase58();
  const source = getAssociatedTokenAddressSync(
    new PublicKey(funding.mint),
    new PublicKey(owner),
    false,
    TOKEN_PROGRAM_ID,
  ).toBase58();
  const accounts = await loadAccounts([source, authority]);
  const token = readToken(accounts, source, funding.mint, owner);
  if (token.amount < requiredAmount)
    throw new Error(
      "Fund your wallet with enough devnet KUSD for the next investment.",
    );
  const existing = accounts.get(authority);
  if (!existing) {
    if (token.delegate)
      throw new Error(
        "The funding token already has a delegate. Revoke it before creating a recurring plan.",
      );
    return { initializeAuthority: true, expectedInitId: undefined };
  }
  const state = await decodeSubscriptionAuthority(
    Buffer.from(
      requiredAccount(
        accounts,
        authority,
        MAINNET_SUBSCRIPTIONS_PROGRAM,
        "Subscription authority",
      ).data[0],
      "base64",
    ),
  );
  if (
    state.user !== owner ||
    state.tokenMint !== funding.mint ||
    token.delegate?.toBase58() !== authority ||
    token.delegatedAmount < requiredAmount
  )
    throw new Error(
      "This subscription authority was disabled or has insufficient delegated allowance. Kite will not silently restore it.",
    );
  return { initializeAuthority: false, expectedInitId: state.initId };
}

export async function createDevnetRecurringPlan(
  input: CreateDevnetPlanRequest,
) {
  await assertRecurringV1(input.supportedTransactionVersions);
  await verifyPrograms();
  await protocolVersion(input.owner);
  const catalog = manifest();
  if (!catalog.fundingToken)
    throw new Error("The devnet KUSD funding mint has not been provisioned.");
  const registry = configuredPools();
  const selected =
    input.target.type === "basket"
      ? resolveDevnetBasketAssets(catalog, input.target.id)
      : (() => {
          const token = catalog.tokens.find(
            (item) => item.underlyingSymbol === input.target.id,
          );
          if (!token)
            throw new Error("This devnet stock has not been provisioned.");
          return [{ token, weightBps: 10_000 }];
        })();
  const verified = await verifiedPools(
    catalog.fundingToken,
    selected.map(({ token }) => {
      if (!registry[token.mint])
        throw new Error(
          `No devnet CPMM pool is configured for ${token.symbol}.`,
        );
      return { token, poolAddress: registry[token.mint] };
    }),
  );
  const fundingAmount = BigInt(
    toTokenAmount(input.amount, catalog.fundingToken.decimals),
  );
  const allocations = allocateGuardFunding(
    fundingAmount,
    selected.map(({ token, weightBps }) => ({ mint: token.mint, weightBps })),
  );
  const now = await chainNow();
  const outputs = selected.map(({ token, weightBps }, index) => ({
    mint: token.mint,
    weightBps,
    pool: verified[index].pool.pool,
    minimumAmountOut: quoteDevnetCpmmExactIn({
      ...verified[index],
      amountIn: allocations[index],
      slippageBps: QUOTE_SLIPPAGE_BPS,
      nowSeconds: now,
    }).minimumAmountOut,
  }));
  const authority = await fundingAuthority(
    input.owner,
    catalog.fundingToken,
    fundingAmount,
  );
  const periodSeconds = BigInt(input.periodSeconds);
  // Enough time to review/sign, fixed before approval; delayed signing never extends the grant.
  const startsAt = now + BigInt(120);
  const expiresAt = startsAt + periodSeconds * BigInt(input.periods);
  const built = await buildGuardCreateInstructions({
    owner: input.owner,
    fundingMint: catalog.fundingToken.mint,
    nonce: randomBytes(8).readBigUInt64LE(),
    fundingAmount,
    periodSeconds,
    startsAt,
    expiresAt,
    periods: input.periods,
    outputs,
    pools: verified.map(({ pool }) => pool),
    ...authority,
  });
  return {
    ...(await prepareOrder(
      input.owner,
      built.plan.address,
      "create",
      built.instructions,
    )),
    terms: {
      target: input.target,
      fundingSymbol: catalog.fundingToken.symbol,
      fundingMint: catalog.fundingToken.mint,
      amount: input.amount,
      fundingAmount: fundingAmount.toString(),
      periodSeconds: input.periodSeconds,
      periods: input.periods,
      startsAt: Number(startsAt),
      expiresAt: Number(expiresAt),
      slippageBps: QUOTE_SLIPPAGE_BPS,
      outputs: outputs.map((output, index) => ({
        ...output,
        symbol: selected[index].token.symbol,
        decimals: selected[index].token.decimals,
        inputAmount: allocations[index].toString(),
        minimumAmountOut: output.minimumAmountOut.toString(),
      })),
      minimumPolicy:
        "Each minimum output is fixed for this plan. Future installments fail if any pool cannot deliver that minimum; create a new plan to approve different terms.",
    },
  };
}

async function readPlan(address: string): Promise<DevnetGuardPlan> {
  const accounts = await loadAccounts([address]);
  return decodeGuardPlanV2(
    Buffer.from(
      requiredAccount(accounts, address, GUARD_PROGRAM, "Devnet recurring plan")
        .data[0],
      "base64",
    ),
    address,
  );
}
function publicPlan(plan: DevnetGuardPlan, now: bigint) {
  let duePeriodIndex: number | null = null;
  try {
    duePeriodIndex = guardDuePeriod(plan, now);
  } catch {
    /* Not due, expired, or complete. */
  }
  return {
    ...plan,
    nonce: plan.nonce.toString(),
    fundingAmount: plan.fundingAmount.toString(),
    periodSeconds: Number(plan.periodSeconds),
    startsAt: Number(plan.startsAt),
    expiresAt: Number(plan.expiresAt),
    lastExecutedAt: Number(plan.lastExecutedAt),
    subscriptionInitId: plan.subscriptionInitId.toString(),
    duePeriodIndex,
    outputs: plan.outputs.map((output) => ({
      ...output,
      minimumAmountOut: output.minimumAmountOut.toString(),
    })),
  };
}
export async function listDevnetRecurringPlans(owner: string) {
  await assertRecurringDevnet();
  const [now, accounts] = await Promise.all([
    chainNow(),
    recurringDevnetRpc<
      Array<{ pubkey: string; account: NonNullable<RpcAccount> }>
    >("getProgramAccounts", [
      GUARD_PROGRAM,
      {
        encoding: "base64",
        commitment: "confirmed",
        filters: [{ dataSize: 1684 }, { memcmp: { offset: 9, bytes: owner } }],
      },
    ]),
  ]);
  return accounts.flatMap(({ pubkey, account }) => {
    if (account.owner !== GUARD_PROGRAM)
      throw new Error("Unexpected recurring plan owner.");
    // The owner offset is not shared with legacy Plan accounts; still reject every unknown version.
    const plan = decodeGuardPlanV2(
      Buffer.from(account.data[0], "base64"),
      pubkey,
    );
    if (plan.owner !== owner) throw new Error("Unexpected recurring wallet.");
    return [publicPlan(plan, now)];
  });
}

export async function collectDevnetRecurringPlan(input: {
  plan: string;
  feePayer: string;
  expectedPeriodIndex: number;
}) {
  await assertRecurringV1([1]);
  await verifyPrograms();
  await protocolVersion(input.feePayer);
  const plan = await readPlan(input.plan);
  const now = await chainNow();
  if (guardDuePeriod(plan, now) !== input.expectedPeriodIndex)
    throw new Error(
      "The requested period is stale or not yet due. Refresh the on-chain plan.",
    );
  const catalog = manifest();
  if (!catalog.fundingToken || catalog.fundingToken.mint !== plan.fundingMint)
    throw new Error(
      "This plan does not use the provisioned devnet funding mint.",
    );
  const outputs = plan.outputs.map((output) => {
    const token = catalog.tokens.find((item) => item.mint === output.mint);
    if (!token)
      throw new Error("The plan contains an unregistered devnet stock mint.");
    return { token, poolAddress: output.pool };
  });
  // Pools, amounts, destinations, and minimums come exclusively from the owner's on-chain plan.
  const pools = await verifiedPools(catalog.fundingToken, outputs);
  const source = await fundingAuthority(
    plan.owner,
    catalog.fundingToken,
    plan.fundingAmount,
  );
  if (
    source.initializeAuthority ||
    source.expectedInitId !== plan.subscriptionInitId
  )
    throw new Error(
      "The plan's subscription authority was revoked or reinitialized.",
    );
  const accounts = await loadAccounts([plan.recurringDelegation]);
  const delegation = await decodeRecurringPayment(
    plan.recurringDelegation,
    Buffer.from(
      requiredAccount(
        accounts,
        plan.recurringDelegation,
        MAINNET_SUBSCRIPTIONS_PROGRAM,
        "Recurring delegation",
      ).data[0],
      "base64",
    ),
  );
  if (
    delegation.payment.owner !== plan.owner ||
    delegation.payment.buyer !== plan.address ||
    delegation.payment.mint !== plan.fundingMint ||
    delegation.initId !== plan.subscriptionInitId ||
    delegation.subscriptionAuthority !== plan.subscriptionAuthority ||
    BigInt(delegation.payment.amountPerPeriod) !== plan.fundingAmount ||
    BigInt(delegation.payment.periodSeconds) !== plan.periodSeconds ||
    BigInt(delegation.payment.expiresAt) !== plan.expiresAt
  )
    throw new Error(
      "The subscription permission does not match the on-chain plan.",
    );
  return {
    ...(await prepareOrder(
      input.feePayer,
      plan.address,
      "collect",
      buildGuardCollectInstructions(
        plan,
        pools.map(({ pool }) => pool),
        input.feePayer,
        input.expectedPeriodIndex,
      ),
    )),
    expectedPeriodIndex: input.expectedPeriodIndex,
  };
}

export async function closeDevnetRecurringPlan(input: {
  plan: string;
  owner: string;
  supportedTransactionVersions: number[];
}) {
  await assertRecurringV1(input.supportedTransactionVersions);
  await protocolVersion(input.owner);
  const plan = await readPlan(input.plan);
  if (plan.owner !== input.owner)
    throw new Error("Only the plan owner can revoke this recurring plan.");
  const accounts = await loadAccounts([plan.recurringDelegation]);
  const account = accounts.get(plan.recurringDelegation);
  let rentPayer = plan.owner;
  if (
    account &&
    !(
      account.owner === "11111111111111111111111111111111" &&
      Buffer.from(account.data[0], "base64").length === 0
    )
  ) {
    const delegation = await decodeRecurringPayment(
      plan.recurringDelegation,
      Buffer.from(
        requiredAccount(
          accounts,
          plan.recurringDelegation,
          MAINNET_SUBSCRIPTIONS_PROGRAM,
          "Recurring delegation",
        ).data[0],
        "base64",
      ),
    );
    if (
      delegation.payment.owner !== input.owner ||
      delegation.payment.buyer !== plan.address
    )
      throw new Error("The recurring permission belongs to another plan.");
    rentPayer = delegation.payer;
  }
  return prepareOrder(
    input.owner,
    plan.address,
    "close",
    buildGuardCloseInstructions(plan, rentPayer),
  );
}
