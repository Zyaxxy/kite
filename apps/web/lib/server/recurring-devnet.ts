import { randomBytes } from "node:crypto";
import {
  Keypair,
  PublicKey,
  VersionedTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
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
  composeDevnetV0Transaction,
  decodeGuardPlan,
  decodeRecurringPayment,
  decodeSubscriptionAuthority,
  DEVNET_RECURRING_BASKETS,
  DEVNET_XSTOCK_CATALOG,
  guardDuePeriod,
  guardSubscriptionAuthority,
  guardMockMintAuthority,
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
  authorizeRecurringTransaction,
  executeRecurringTransaction,
  recurringAuthorizationConfigured,
  recurringDevnetRpc,
  recurringLatestBlockhash,
  simulateRecurring,
  recurringTransactionVersion,
} from "./recurring-devnet-transport";
import { withinRecurringDeadline } from "./devnet-connection";
import { reconcileInBatches } from "./creator-reconciliation";
import type { CreatorSubscriptionReceipt } from "./creator-store";
import {
  keeperStore,
  withCollectorLease,
  runIsolatedCollector,
  type CollectorSummary,
} from "./recurring-keeper";

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
function verifyMint(
  token: { mint: string; symbol: string; decimals: number },
  cache: AccountMap,
) {
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
    assets:
      catalog?.tokens.map((token) => ({
        ...token,
        id: token.underlyingSymbol,
      })) ?? [],
    testTokensOnly: true,
    slippageBps: QUOTE_SLIPPAGE_BPS,
    devnetMockMode: true,
    stocks: DEVNET_XSTOCK_CATALOG.map((token) => ({
      ...token,
      id: token.underlyingSymbol,
      mint:
        catalog?.tokens.find(
          (item) => item.underlyingSymbol === token.underlyingSymbol,
        )?.mint ?? null,
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
  transactionVersion: 0 | 1 = 1,
) {
  const lifetime = await recurringLatestBlockhash();
  const reviewedInstructions = [
    ...instructions,
    buildGuardProtocolVersionInstruction(),
  ];
  const built =
    transactionVersion === 0
      ? composeDevnetV0Transaction({
          payer,
          ...lifetime,
          instructions: reviewedInstructions,
        })
      : await composeV1Transaction({
          payer,
          ...lifetime,
          instructions: reviewedInstructions,
          allowV1: true,
          computeUnitLimit: 1_400_000,
          priorityFeeLamports: 0,
        });
  await simulateRecurring(built.transaction, {
    programId: GUARD_PROGRAM,
    value: 2,
  });
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
  const transactionVersion = await recurringTransactionVersion(
    input.supportedTransactionVersions,
  );
  const catalog = manifest();
  if (!catalog.fundingToken)
    throw new Error("The devnet KUSD funding mint has not been provisioned.");
  const selected =
    input.target.type === "basket"
      ? await resolveRecurringBasketAssets(catalog, input.target.id)
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
  const mintAccounts = await loadAccounts([
    catalog.fundingToken.mint,
    ...selected.map(({ token }) => token.mint),
  ]);
  verifyMint(catalog.fundingToken, mintAccounts);
  for (const { token } of selected) {
    const mint = verifyMint(token, mintAccounts);
    if (!mint.mintAuthority?.equals(guardMockMintAuthority()))
      throw new Error(
        `${token.symbol} is not controlled by the devnet test-mint authority.`,
      );
  }
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
  const prepared = await prepareOrder(
    input.owner,
    built.plan.address,
    "create",
    built.instructions,
    transactionVersion,
  );
  if (
    input.target.type === "basket" &&
    !DEVNET_RECURRING_BASKETS.some((basket) => basket.id === input.target.id)
  ) {
    // Attribution is pending until the signed plan actually exists on chain.
    await keeperStore.write(
      `attribution:${built.plan.address}`,
      {
        basketId: input.target.id,
        owner: input.owner,
        expiresAt: Number(expiresAt) * 1000,
      },
      370 * 86_400_000,
    );
  }
  return {
    ...prepared,
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
        "Devnet demonstration only: installments collect test KUSD and mint valueless test stocks at fixed test-unit allocations. This is not a market-price swap or a mainnet investment.",
    },
  };
}

async function resolveRecurringBasketAssets(
  catalog: DevnetXStockManifest,
  id: string,
) {
  if (DEVNET_RECURRING_BASKETS.some((basket) => basket.id === id))
    return resolveDevnetBasketAssets(catalog, id);
  const { resolvePublishedCreatorBasket } = await import("./creator-store");
  const basket = await resolvePublishedCreatorBasket(id);
  if (!basket) throw new Error("This creator basket is not published.");
  return basket.allocations.map((allocation) => {
    const token = catalog.tokens.find(
      (candidate) => candidate.underlyingSymbol === allocation.symbol,
    );
    if (!token)
      throw new Error(
        `${allocation.symbol} has no provisioned devnet test stock. This basket cannot be subscribed to on devnet.`,
      );
    return { token, weightBps: allocation.weightBps };
  });
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
  const transactionVersion = await recurringTransactionVersion([0, 1]);
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
      transactionVersion,
    )),
    expectedPeriodIndex: input.expectedPeriodIndex,
  };
}

export async function closeDevnetRecurringPlan(input: {
  plan: string;
  owner: string;
  supportedTransactionVersions: number[];
}) {
  const transactionVersion = await recurringTransactionVersion(
    input.supportedTransactionVersions,
  );
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
    transactionVersion,
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

/** A lease prevents overlapping workers; the on-chain exact period check remains authoritative. */
export async function runDevnetCollectorPass(): Promise<CollectorSummary> {
  return withCollectorLease(() =>
    withinRecurringDeadline(Date.now() + 40_000, runCollector),
  );
}

async function runCollector(): Promise<CollectorSummary> {
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

  // Rotate through sorted addresses so a repeatedly underfunded first wallet cannot starve later users.
  const cursor = await keeperStore.read<string>("cursor");
  const ordered = [...accounts].sort((a, b) =>
    a.pubkey.localeCompare(b.pubkey),
  );
  const start = cursor
    ? ordered.findIndex((entry) => entry.pubkey > cursor)
    : 0;
  const entries =
    start > 0 ? [...ordered.slice(start), ...ordered.slice(0, start)] : ordered;
  const decoded = new Map<string, DevnetGuardPlan>();
  let lastScanned: string | undefined;
  const summary = await runIsolatedCollector({
    entries,
    address: (entry) => entry.pubkey,
    deadline: Date.now() + 20_000,
    maxPlans: 32,
    duePeriod: ({ pubkey, account }) => {
      lastScanned = pubkey;
      if (
        account.owner !== GUARD_PROGRAM ||
        account.executable ||
        account.data[1] !== "base64"
      )
        throw new Error("Invalid recurring plan account owner or encoding.");
      const plan = decodeGuardPlan(
        Buffer.from(account.data[0], "base64"),
        pubkey,
      );
      decoded.set(pubkey, plan);
      try {
        return guardDuePeriod(plan, nowSeconds);
      } catch {
        return null;
      }
    },
    collect: async ({ pubkey }, periodIndex) => {
      const journalKey = `installment:${pubkey}:${periodIndex}`;
      let pending = await keeperStore.read<{
        authorization: string;
        signedTransaction: string;
      }>(journalKey);
      if (!pending) {
        const prepared = await collectDevnetRecurringPlan({
          plan: pubkey,
          feePayer: botKeypair.publicKey.toBase58(),
          expectedPeriodIndex: periodIndex,
        });
        let signedTransaction: string;
        if (prepared.transactionVersion === 1)
          signedTransaction = await signV1Collection(
            prepared.transaction,
            botKeypair.secretKey,
          );
        else {
          const transaction = VersionedTransaction.deserialize(
            Buffer.from(prepared.transaction, "base64"),
          );
          transaction.sign([botKeypair]);
          signedTransaction = Buffer.from(transaction.serialize()).toString(
            "base64",
          );
        }
        pending = { authorization: prepared.authorization, signedTransaction };
        // Persist the exact signed message BEFORE broadcast. Timeouts reuse its signature, never a new debit.
        await keeperStore.write(journalKey, pending);
      }
      const result = await executeRecurringTransaction(pending);
      if (result.status === "expired" || result.status === "failed")
        await keeperStore.remove(journalKey);
      if (result.status === "confirmed") {
        const plan = decoded.get(pubkey)!;
        await reconcileCreatorPlan(plan, "active", result.signature).catch(
          () => undefined,
        );
      }
      return result;
    },
  });
  if (lastScanned) await keeperStore.write("cursor", lastScanned);
  return summary;
}

interface PlanAttribution {
  basketId: string;
  owner: string;
  expiresAt: number;
}

async function reconcileCreatorPlan(
  plan: DevnetGuardPlan,
  status: "active" | "closed",
  signature?: string,
) {
  const attribution = await keeperStore.read<PlanAttribution>(
    `attribution:${plan.address}`,
  );
  if (!attribution || attribution.owner !== plan.owner) return;
  const { recordCreatorSubscription, recordCreatorVolume } =
    await import("./creator-store");
  await recordCreatorSubscription({
    ...attribution,
    plan: plan.address,
    status,
    network: "devnet",
  });
  if (signature)
    await recordCreatorVolume({
      basketId: attribution.basketId,
      owner: plan.owner,
      signature,
      amountBaseUnits: plan.fundingAmount.toString(),
      network: "devnet",
    });
}

/** Called only after exact-message execution reports confirmation. Public unsigned setup creates no points. */
export async function reconcileConfirmedRecurring(
  planAddress: string,
  operation: "create" | "collect" | "close",
): Promise<void> {
  await assertRecurringDevnet();
  if (operation === "close") {
    const attribution = await keeperStore.read<PlanAttribution>(
      `attribution:${planAddress}`,
    );
    if (!attribution) return;
    const { recordCreatorSubscription } = await import("./creator-store");
    await recordCreatorSubscription({
      ...attribution,
      plan: planAddress,
      status: "closed",
      network: "devnet",
    });
  } else {
    const plan = await readPlan(planAddress);
    await reconcileCreatorPlan(
      plan,
      plan.executedPeriods >= plan.periods ||
        plan.expiresAt <= (await chainNow())
        ? "closed"
        : "active",
    );
  }
}

/** Refresh creator counts from confirmed devnet state. RPC/decode failures propagate as unavailable, never fabricated inactivity. */
export async function reconcileCreatorSubscriptions(
  receipts: CreatorSubscriptionReceipt[],
): Promise<CreatorSubscriptionReceipt[]> {
  const relevant = receipts.filter(
    (receipt) => receipt.network === "devnet" && receipt.status === "active",
  );
  if (!relevant.length) return [];
  return withinRecurringDeadline(Date.now() + 25_000, async () => {
    await assertRecurringDevnet();
    const now = await chainNow();
    return reconcileInBatches(relevant, (batch) =>
      reconcileCreatorSubscriptionBatch(batch, now),
    );
  });
}

async function reconcileCreatorSubscriptionBatch(
  relevant: CreatorSubscriptionReceipt[],
  now: bigint,
): Promise<CreatorSubscriptionReceipt[]> {
  const accounts = await loadAccounts(relevant.map((receipt) => receipt.plan));
  const decoded = new Map<string, DevnetGuardPlan>();
  for (const receipt of relevant) {
    const account = accounts.get(receipt.plan);
    if (
      !account ||
      (account.owner === PublicKey.default.toBase58() &&
        Buffer.from(account.data[0], "base64").length === 0)
    )
      continue;
    const plan = decodeGuardPlan(
      Buffer.from(
        requiredAccount(
          accounts,
          receipt.plan,
          GUARD_PROGRAM,
          "Devnet recurring plan",
        ).data[0],
        "base64",
      ),
      receipt.plan,
    );
    if (plan.owner !== receipt.owner)
      throw new Error(
        "The creator subscription owner does not match its on-chain plan.",
      );
    decoded.set(receipt.plan, plan);
  }
  await loadAccounts(
    [...decoded.values()].flatMap((plan) => [
      plan.recurringDelegation,
      plan.subscriptionAuthority,
      getAssociatedTokenAddressSync(
        new PublicKey(plan.fundingMint),
        new PublicKey(plan.owner),
        false,
        TOKEN_PROGRAM_ID,
      ).toBase58(),
    ]),
    accounts,
  );
  const verified: CreatorSubscriptionReceipt[] = [];
  for (const receipt of relevant) {
    const plan = decoded.get(receipt.plan);
    let active = Boolean(
      plan && plan.expiresAt > now && plan.executedPeriods < plan.periods,
    );
    if (active && plan) {
      const delegation = accounts.get(plan.recurringDelegation),
        authority = accounts.get(plan.subscriptionAuthority);
      const source = getAssociatedTokenAddressSync(
        new PublicKey(plan.fundingMint),
        new PublicKey(plan.owner),
        false,
        TOKEN_PROGRAM_ID,
      ).toBase58();
      const sourceAccount = accounts.get(source);
      const closed = (account: RpcAccount | undefined) =>
        !account ||
        (account.owner === PublicKey.default.toBase58() &&
          Buffer.from(account.data[0], "base64").length === 0);
      if (closed(delegation) || closed(authority) || closed(sourceAccount))
        active = false;
      else {
        const permission = await decodeRecurringPayment(
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
        const grant = await decodeSubscriptionAuthority(
          Buffer.from(
            requiredAccount(
              accounts,
              plan.subscriptionAuthority,
              MAINNET_SUBSCRIPTIONS_PROGRAM,
              "Subscription authority",
            ).data[0],
            "base64",
          ),
        );
        const funding = readToken(
          accounts,
          source,
          plan.fundingMint,
          plan.owner,
        );
        active =
          permission.payment.owner === plan.owner &&
          permission.payment.buyer === plan.address &&
          permission.payment.mint === plan.fundingMint &&
          permission.initId === plan.subscriptionInitId &&
          permission.subscriptionAuthority === plan.subscriptionAuthority &&
          BigInt(permission.payment.expiresAt) > now &&
          grant.initId === plan.subscriptionInitId &&
          grant.user === plan.owner &&
          grant.tokenMint === plan.fundingMint &&
          funding.delegate?.toBase58() === plan.subscriptionAuthority &&
          funding.delegatedAmount > BigInt(0);
      }
    }
    if (active) verified.push(receipt);
  }
  return verified;
}
