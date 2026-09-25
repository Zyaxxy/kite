import { randomBytes } from "node:crypto";
import { Keypair, PublicKey, type TransactionInstruction } from "@solana/web3.js";
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
  composeV1Transaction,
  decodeGuardPlan,
  decodeRecurringPayment,
  decodeSubscriptionAuthority,
  DEVNET_RECURRING_BASKETS,
  DEVNET_XSTOCK_CATALOG,
  guardDuePeriod,
  guardSubscriptionAuthority,
  KITE_GUARD_PROGRAM_ID,
  MAINNET_SUBSCRIPTIONS_PROGRAM,
  resolveDevnetBasketAssets,
  signV1Collection,
  toTokenAmount,
  validateDevnetXStockManifest,
  type DevnetGuardPlan,
  type DevnetXStockManifest,
} from "@kite/sdk";
import manifestJson from "../../public/xstocks-devnet/xstocks.json";
import type { RpcAccount } from "./composed-transactions";
import type { CreateDevnetPlanRequest } from "./recurring-devnet-policy";
import {
  assertRecurringDevnet,
  assertRecurringV1,
  authorizeRecurringTransaction,
  executeRecurringTransaction,
  recurringAuthorizationConfigured,
  recurringDevnetRpc,
  recurringLatestBlockhash,
  recurringV1Active,
  simulateRecurring,
} from "./recurring-devnet-transport";

const TOKEN_PROGRAM = TOKEN_PROGRAM_ID.toBase58();
const GUARD_PROGRAM = KITE_GUARD_PROGRAM_ID.toBase58();
const QUOTE_SLIPPAGE_BPS = 100;

/** Devnet always uses mock minting — no Raydium pools needed. */
export function devnetMockModeEnabled(): boolean {
  return true;
}

type AccountMap = Map<string, RpcAccount>;

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
function verifyMint(token: { mint: string; symbol: string; decimals: number }, cache: AccountMap) {
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

export async function getDevnetRecurringConfig() {
  const reasons: string[] = [];
  let catalog: DevnetXStockManifest | undefined;
  const supported = new Set<string>();
  try {
    catalog = manifest();
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
    if (!(await recurringV1Active()))
      reasons.push(
        "The configured devnet RPC does not have V1 transactions activated.",
      );
    // In mock mode, all catalog tokens are available since we mint directly.
    if (catalog?.fundingToken) {
      for (const token of catalog.tokens) {
        supported.add(token.underlyingSymbol);
      }
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
      "The connected wallet must pass a protocol simulation before any transaction is returned for approval.",
    reasons,
    fundingToken: catalog?.fundingToken ?? null,
    fundingSymbol: "KUSD",
    testTokensOnly: true,
    slippageBps: QUOTE_SLIPPAGE_BPS,
    devnetMockMode: true,
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
  funding: { mint: string; decimals: number },
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
  const tokenAccount = accounts.get(source);
  if (!tokenAccount)
    throw new Error(
      "Devnet KUSD token account not found. Claim test KUSD using the faucet to fund your wallet.",
    );
  const token = readToken(accounts, source, funding.mint, owner);
  if (token.amount < requiredAmount)
    throw new Error(
      "Fund your wallet with enough devnet KUSD for the next investment. Use the faucet below to claim test KUSD.",
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
  const catalog = manifest();
  if (!catalog.fundingToken)
    throw new Error("The devnet KUSD funding mint has not been provisioned.");
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
    pool: PublicKey.default.toBase58(),
    minimumAmountOut: allocations[index],
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
    pools: [],
    devnetMock: true,
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
  return decodeGuardPlan(
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
        filters: [{ dataSize: 1045 }, { memcmp: { offset: 10, bytes: owner } }],
      },
    ]),
  ]);
  return accounts.flatMap(({ pubkey, account }) => {
    if (account.owner !== GUARD_PROGRAM)
      throw new Error("Unexpected recurring plan owner.");
    const plan = decodeGuardPlan(
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
        [],
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

function getBotKeypair(): Keypair | null {
  const raw =
    process.env.BOT_KEYPAIR?.trim() ||
    process.env.KITE_FAUCET_SECRET_KEY?.trim();
  if (!raw) return null;
  try {
    if (raw.startsWith("[") && raw.endsWith("]")) {
      return Keypair.fromSecretKey(new Uint8Array(JSON.parse(raw)));
    }
    if (/^[0-9a-fA-F]{128}$/.test(raw)) {
      return Keypair.fromSecretKey(Uint8Array.from(Buffer.from(raw, "hex")));
    }
    return Keypair.fromSecretKey(new Uint8Array(JSON.parse(raw)));
  } catch {
    return null;
  }
}

/** Executes an automated collection pass across all active devnet plans, signing and submitting any due installments. */
export async function runDevnetCollectorPass(): Promise<{
  scanned: number;
  due: number;
  collected: number;
  skipped: number;
  failed: number;
  results: Array<{
    plan: string;
    periodIndex: number;
    signature?: string;
    status?: string;
    error?: string;
  }>;
}> {
  const botKeypair = getBotKeypair();
  if (!botKeypair) {
    throw new Error(
      "No BOT_KEYPAIR or KITE_FAUCET_SECRET_KEY configured on the server to pay gas fees.",
    );
  }

  await assertRecurringDevnet();
  const [nowSeconds, accounts] = await Promise.all([
    chainNow(),
    recurringDevnetRpc<
      Array<{ pubkey: string; account: NonNullable<RpcAccount> }>
    >("getProgramAccounts", [
      GUARD_PROGRAM,
      {
        encoding: "base64",
        commitment: "confirmed",
        filters: [{ dataSize: 1045 }],
      },
    ]),
  ]);

  let collected = 0;
  let skipped = 0;
  let failed = 0;
  const results: Array<{
    plan: string;
    periodIndex: number;
    signature?: string;
    status?: string;
    error?: string;
  }> = [];

  const startedAt = Date.now();
  // Safe deadline for external 30s cron providers (e.g. cron-job.org)
  const MAX_PASS_DURATION_MS = 20_000;

  for (const { pubkey, account } of accounts) {
    if (Date.now() - startedAt > MAX_PASS_DURATION_MS) {
      break;
    }
    let plan: DevnetGuardPlan;
    try {
      plan = decodeGuardPlan(Buffer.from(account.data[0], "base64"), pubkey);
    } catch {
      continue;
    }

    let duePeriodIndex: number;
    try {
      duePeriodIndex = guardDuePeriod(plan, nowSeconds);
    } catch {
      skipped++;
      continue;
    }

    try {
      const prepared = await collectDevnetRecurringPlan({
        plan: pubkey,
        feePayer: botKeypair.publicKey.toBase58(),
        expectedPeriodIndex: duePeriodIndex,
      });

      const signedTransaction = await signV1Collection(
        prepared.transaction,
        botKeypair.secretKey,
      );

      const execResult = await executeRecurringTransaction({
        authorization: prepared.authorization,
        signedTransaction,
      });

      results.push({
        plan: pubkey,
        periodIndex: duePeriodIndex,
        signature: execResult.signature,
        status: execResult.status,
      });
      collected++;
    } catch (e: unknown) {
      results.push({
        plan: pubkey,
        periodIndex: duePeriodIndex,
        error: e instanceof Error ? e.message : "Failed to collect plan",
      });
      failed++;
    }
  }

  return {
    scanned: accounts.length,
    due: collected + failed,
    collected,
    skipped,
    failed,
    results,
  };
}

