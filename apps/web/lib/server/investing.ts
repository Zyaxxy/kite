import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  allocateBasketInput,
  composeMainnetTransaction,
  deriveRecurringPermissionWindow,
  dueScheduleOccurrence,
  scheduleAt,
  RECURRENCE_EXECUTION_WINDOW_SECONDS,
  hasCompleteIssuerCatalogs,
  walletTransactionSignature,
  toTokenAmount,
  type CreateInvestmentPlanRequest,
  type RecurringInvestmentPlan,
  type RecurringInvestmentReceipt,
} from "@kite/sdk";
import {
  assertMainnet,
  assertMainnetV1Ready,
  authorizeComposed,
  latestBlockhash,
  mainnetRpc,
  mainnetV1Active,
  simulateComposed,
  verifyComposed,
} from "./composed-transactions";
import { getServerMarketCatalog } from "./markets";
import { prepareRecurringPayment, readDelegation } from "./recurring-payments";
import { getTradeMintDecimals } from "./mint-precision";
import {
  createInvestment,
  investmentIds,
  investingStateDirectory,
  readInvestment,
  withInvestmentLock,
  writeInvestment,
  type InvestmentRecord,
} from "./investing-store";
import {
  prepareRecurringInvestmentOrder,
  assertInvestmentMintsSupported,
} from "./investing-order";
import {
  readExecutorHeartbeat,
  recordExecutorHeartbeat,
} from "./investing-health";

export function investmentExecutor() {
  const value = process.env.KITE_INVESTING_EXECUTOR;
  if (!value || !PublicKey.isOnCurve(new PublicKey(value).toBytes()))
    throw new Error("The recurring investment executor is not configured.");
  if (
    !process.env.KITE_RECURRING_EXECUTOR_SECRET ||
    process.env.KITE_RECURRING_EXECUTOR_SECRET.length < 32
  )
    throw new Error("The recurring executor API credential is not configured.");
  investingStateDirectory();
  return new PublicKey(value).toBase58();
}
export function assertExecutorCredential(authorization: string | null) {
  const expected = process.env.KITE_RECURRING_EXECUTOR_SECRET;
  if (
    !expected ||
    expected.length < 32 ||
    !authorization?.startsWith("Bearer ")
  )
    throw new Error("Executor authentication required.");
  const a = Buffer.from(authorization.slice(7)),
    b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw new Error("Executor authentication required.");
}
export async function investmentConfig() {
  try {
    const executor = investmentExecutor();
    await assertMainnet();
    const [active, heartbeat] = await Promise.all([
      mainnetV1Active(),
      readExecutorHeartbeat(executor),
    ]);
    return {
      configured: true,
      executor,
      transactionVersion: 1 as const,
      available: active && heartbeat.healthy,
      reason: !active
        ? "Recurring investing will be available when V1 is active on the configured mainnet RPC."
        : !heartbeat.healthy
          ? "The investment executor is offline. New plans are disabled until its heartbeat returns."
          : null,
    };
  } catch {
    return {
      configured: false,
      executor: null,
      transactionVersion: 1 as const,
      available: false,
      reason:
        "The investment service is not configured. An operator must configure a persistent ledger, executor and worker before enabling plans.",
    };
  }
}
export async function createInvestmentPlan(input: CreateInvestmentPlanRequest) {
  const buyer = investmentExecutor(),
    now = Math.floor(Date.now() / 1000);
  if (
    !input ||
    input.action !== "create" ||
    input.consent !== true ||
    !input.target ||
    !["stock", "basket"].includes(input.target.type) ||
    typeof input.target.id !== "string" ||
    input.target.id.length > 64 ||
    typeof input.amount !== "string" ||
    input.amount.length > 40 ||
    !Number.isInteger(input.slippageBps) ||
    input.slippageBps < 1 ||
    input.slippageBps > 300
  )
    throw new Error(
      "Choose a target, amount, schedule and accept the executor permission terms.",
    );
  const owner = new PublicKey(input.taker).toBase58(),
    fundingMint = new PublicKey(input.fundingMint).toBase58();
  await assertMainnetV1Ready(input.supportedTransactionVersions);
  if (!(await readExecutorHeartbeat(buyer)).healthy)
    throw new Error(
      "The investment executor is offline. Please retry once the service is running.",
    );
  const permission = deriveRecurringPermissionWindow(input.schedule);
  if (
    input.schedule.startsAt < now + 120 ||
    permission.expiresAt > now + 31536000
  )
    throw new Error(
      "Start at least two minutes from now and finish within one year.",
    );
  const market = await getServerMarketCatalog();
  if (!hasCompleteIssuerCatalogs(market))
    throw new Error("The issuer catalog is not ready. Please retry shortly.");
  const basket = market.baskets.find((b) => b.id === input.target.id);
  const stock = market.assets.find((a) => a.mint === input.target.id);
  const allocations =
    input.target.type === "basket" && basket && !basket.missingSymbols.length
      ? basket.assets.map((a) => ({
          mint: a.asset.mint,
          symbol: a.asset.symbol,
          weightBps: Math.round(a.weight),
        }))
      : input.target.type === "stock" && stock
        ? [{ mint: stock.mint, symbol: stock.symbol, weightBps: 10000 }]
        : [];
  if (
    !allocations.length ||
    allocations.length > 12 ||
    allocations.some((a) => {
      const v = market.assets.find((b) => b.mint === a.mint);
      return !v?.verified || v.tradingHalted;
    })
  )
    throw new Error("The complete investment target is unavailable or paused.");
  if (allocations.length === 1 && allocations[0].mint === fundingMint)
    throw new Error(
      "You already hold the selected asset. Choose a different funding token.",
    );
  await assertInvestmentMintsSupported([
    fundingMint,
    ...allocations.map((a) => a.mint),
  ]);
  const fundingDecimals = await getTradeMintDecimals(fundingMint);
  const amountUnits = toTokenAmount(input.amount, fundingDecimals);
  allocateBasketInput(BigInt(amountUnits), allocations);
  const plan: RecurringInvestmentPlan = {
    id: randomBytes(16).toString("hex"),
    owner,
    buyer,
    delegation: "",
    fundingMint,
    fundingSymbol:
      market.assets.find((a) => a.mint === fundingMint)?.symbol ?? "tokens",
    fundingDecimals,
    amountUnits,
    target: input.target,
    allocations,
    schedule: input.schedule,
    permission,
    slippageBps: input.slippageBps,
    status: "draft",
    createdAt: now,
  };
  const prepared = await prepareRecurringPayment(
    {
      taker: owner,
      buyer,
      mint: fundingMint,
      amount: input.amount,
      periodSeconds: permission.periodSeconds,
      periods: 1,
      supportedTransactionVersions: input.supportedTransactionVersions,
    },
    { startsAt: permission.startsAt, expiresAt: permission.expiresAt },
  );
  plan.delegation = prepared.payment.address;
  const commitment = createHash("sha256")
    .update(JSON.stringify(plan))
    .digest("hex");
  prepared.instructions.push(
    new TransactionInstruction({
      programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
      keys: [],
      data: Buffer.from(`kite-investment:${plan.id}:${commitment}`),
    }),
  );
  const lifetime = await latestBlockhash();
  const built = await composeMainnetTransaction({
    payer: owner,
    ...lifetime,
    instructions: prepared.instructions,
    allowV1: true,
    computeUnitLimit: 350000,
  });
  await simulateComposed(built.transaction);
  const order = await authorizeComposed(
    {
      ...built,
      taker: owner,
      lastValidBlockHeight: lifetime.lastValidBlockHeight,
      expiresAt: Date.now() + 45000,
      investmentSetup: plan,
    },
    undefined,
    commitment,
  );
  return { order, plan };
}
/** Only call after verifyComposed has verified an unexpired signature from the plan owner. */
export async function storeSignedInvestmentSetup(
  input: unknown,
  owner: string,
  expectedHash: string,
) {
  if (!input || typeof input !== "object")
    throw new Error("The reviewed investment terms are required.");
  const plan = input as RecurringInvestmentPlan;
  if (
    createHash("sha256").update(JSON.stringify(plan)).digest("hex") !==
      expectedHash ||
    plan.owner !== owner ||
    plan.status !== "draft"
  )
    throw new Error("The investment terms differ from the signed review.");
  await createInvestment({ plan, receipts: [] });
}
async function refreshPlan(record: InvestmentRecord) {
  if (["revoked", "completed"].includes(record.plan.status)) return record;
  let payment;
  try {
    payment = (await readDelegation(record.plan.delegation)).payment;
  } catch (e) {
    if (
      e instanceof Error &&
      e.message === "The delegation does not exist or was revoked."
    ) {
      if (record.plan.status !== "draft") record.plan.status = "revoked";
      return record;
    }
    throw e;
  }
  const p = record.plan;
  if (
    payment.owner !== p.owner ||
    payment.buyer !== p.buyer ||
    payment.mint !== p.fundingMint ||
    payment.amountPerPeriod !== p.amountUnits ||
    payment.periodSeconds !== p.permission.periodSeconds ||
    payment.expiresAt !== p.permission.expiresAt ||
    (p.status === "draft" &&
      payment.currentPeriodStartedAt !== p.permission.startsAt)
  )
    throw new Error(
      "Onchain permission does not match the saved investment plan.",
    );
  if (p.permission.expiresAt <= Math.floor(Date.now() / 1000))
    p.status = "completed";
  else p.status = "active";
  const now = Math.floor(Date.now() / 1000);
  for (let index = 0; index < p.schedule.occurrences; index++) {
    const scheduledAt = scheduleAt(p.schedule, index);
    if (now < scheduledAt + RECURRENCE_EXECUTION_WINDOW_SECONDS) break;
    const runId = `${p.id}:${index}`;
    if (!record.receipts.some((r) => r.runId === runId))
      record.receipts.push({
        planId: p.id,
        runId,
        scheduledAt,
        status: "skipped",
        amountUnits: p.amountUnits,
        error:
          "The execution window elapsed without a submission. No catch-up purchase was made.",
        updatedAt: now,
      });
  }
  return record;
}
function receipt(record: InvestmentRecord, runId: string) {
  return record.receipts.find((r) => r.runId === runId);
}
async function reconcile(record: InvestmentRecord) {
  if (!record.pending) return record;
  const pending = record.pending;
  const { value } = await mainnetRpc<{
    value: ({ err: unknown; confirmationStatus: string } | null)[];
  }>("getSignatureStatuses", [
    [pending.signature],
    { searchTransactionHistory: true },
  ]);
  const status = value[0],
    entry = receipt(record, pending.runId);
  if (!entry) throw new Error("Pending investment receipt is missing.");
  if (status?.err) {
    entry.status = "failed";
    entry.error =
      "The transaction failed onchain; investment changes were rolled back. Network fees may apply.";
    delete record.pending;
  } else if (
    status &&
    ["confirmed", "finalized"].includes(status.confirmationStatus)
  ) {
    entry.status = "success";
    // Record actual chain balance deltas, never substitute quoted amounts for receipts.
    const transaction = await mainnetRpc<{
      meta: {
        fee: number;
        preTokenBalances: TokenBalance[];
        postTokenBalances: TokenBalance[];
      } | null;
    } | null>("getTransaction", [
      pending.signature,
      {
        encoding: "json",
        commitment: "confirmed",
        maxSupportedTransactionVersion: 1,
      },
    ]);
    if (transaction?.meta) {
      const meta = transaction.meta;
      entry.feeLamports = meta.fee;
      entry.outputs = record.plan.allocations
        .filter((a) => a.mint !== record.plan.fundingMint)
        .map((a) => {
          const before = sumBalances(
              meta.preTokenBalances,
              a.mint,
              record.plan.owner,
            ),
            after = sumBalances(
              meta.postTokenBalances,
              a.mint,
              record.plan.owner,
            );
          const d = meta.postTokenBalances.find(
            (b) => b.owner === record.plan.owner && b.mint === a.mint,
          )?.uiTokenAmount.decimals;
          if (d === undefined || after <= before)
            throw new Error(
              "Confirmed investment delivery requires reconciliation.",
            );
          return {
            mint: a.mint,
            symbol: a.symbol,
            amountUnits: (after - before).toString(),
            decimals: d,
          };
        });
    } else {
      entry.status = "pending";
      return record;
    }
    delete record.pending;
  }
  // A missing status is never proof of failure. Keep it pending even after blockhash expiry.
  entry.updatedAt = Math.floor(Date.now() / 1000);
  return record;
}
type TokenBalance = {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string; decimals: number };
};
function sumBalances(values: TokenBalance[], mint: string, owner: string) {
  return values
    .filter((v) => v.mint === mint && v.owner === owner)
    .reduce((s, v) => s + BigInt(v.uiTokenAmount.amount), BigInt(0));
}
export async function listInvestmentPlans(wallet: string) {
  new PublicKey(wallet);
  const plans: RecurringInvestmentPlan[] = [],
    receipts: RecurringInvestmentReceipt[] = [];
  for (const id of await investmentIds()) {
    let initial: InvestmentRecord;
    try {
      initial = await readInvestment(id);
    } catch {
      continue;
    }
    if (initial.plan.owner !== wallet) continue;
    let value = initial;
    try {
      value = await withInvestmentLock(id, async () => {
        const r = await reconcile(await refreshPlan(await readInvestment(id)));
        await writeInvestment(r);
        return r;
      });
    } catch {
      /* The last durable snapshot remains readable while the executor holds the lease. */
    }
    plans.push(value.plan);
    receipts.push(...value.receipts);
  }
  return {
    plans: plans.sort((a, b) => b.createdAt - a.createdAt),
    receipts: receipts.sort((a, b) => b.scheduledAt - a.scheduledAt),
  };
}
let executorScanCursor = 0;
export async function dueInvestments() {
  const buyer = investmentExecutor(),
    runs: { planId: string; runId: string; scheduledAt: number }[] = [];
  await recordExecutorHeartbeat(buyer);
  const issues: { planId: string; reason: string }[] = [];
  const ids = (await investmentIds()).sort();
  const started = Date.now();
  let checked = 0,
    chainChecks = 0;
  // Round-robin bounded work keeps one slow/locked permission from starving other plans.
  while (
    checked < ids.length &&
    chainChecks < 10 &&
    Date.now() - started < 35000
  ) {
    const id = ids[executorScanCursor % ids.length];
    executorScanCursor = (executorScanCursor + 1) % Math.max(1, ids.length);
    checked++;
    try {
      const snapshot = await readInvestment(id);
      if (
        snapshot.plan.buyer !== buyer ||
        (["revoked", "completed"].includes(snapshot.plan.status) &&
          !snapshot.pending &&
          !snapshot.prepared)
      )
        continue;
      if (
        !snapshot.pending &&
        !snapshot.prepared &&
        !dueScheduleOccurrence(
          snapshot.plan.schedule,
          Math.floor(Date.now() / 1000),
        )
      )
        continue;
      chainChecks++;
      await withInvestmentLock(id, async () => {
        const record = await reconcile(
          await refreshPlan(await readInvestment(id)),
        );
        await writeInvestment(record);
        if (record.pending) return;
        if (record.prepared) {
          if (record.prepared.order.expiresAt <= Date.now()) {
            const prior = receipt(record, record.prepared.runId);
            if (prior)
              runs.push({
                planId: id,
                runId: prior.runId,
                scheduledAt: prior.scheduledAt,
              });
          }
          return;
        }
        if (record.plan.status !== "active") return;
        const due = dueScheduleOccurrence(
          record.plan.schedule,
          Math.floor(Date.now() / 1000),
        );
        if (!due) return;
        const runId = `${id}:${due.index}`;
        const prior = receipt(record, runId);
        if (prior && prior.status !== "prepared") return;
        if (
          record.prepared?.runId === runId &&
          record.prepared.order.expiresAt > Date.now()
        )
          return;
        runs.push({ planId: id, runId, scheduledAt: due.scheduledAt });
      });
    } catch {
      issues.push({
        planId: id,
        reason:
          "This plan needs ledger or provider reconciliation; other plans continue.",
      });
    }
  }
  return { runs, issues };
}
export async function prepareInvestmentRun(planId: string, runId: string) {
  return withInvestmentLock(planId, async () => {
    const record = await reconcile(
      await refreshPlan(await readInvestment(planId)),
    );
    if (record.plan.buyer !== investmentExecutor() || record.pending)
      throw new Error("This investment requires reconciliation.");
    if (record.prepared) {
      if (record.prepared.runId !== runId)
        throw new Error(
          "Discard the previous expired review before preparing another occurrence.",
        );
      return { ...record.prepared.order, planId, runId };
    }
    const due = dueScheduleOccurrence(
      record.plan.schedule,
      Math.floor(Date.now() / 1000),
    );
    if (
      record.plan.buyer !== investmentExecutor() ||
      record.plan.status !== "active" ||
      record.pending ||
      !due ||
      runId !== `${planId}:${due.index}`
    )
      throw new Error("This investment is not due or requires reconciliation.");
    const prior = receipt(record, runId);
    if (prior && prior.status !== "prepared")
      throw new Error("This investment occurrence was already processed.");
    // Do not replace a prepared message behind a worker that may have signed it.
    // An expired, never-recorded preparation is explicitly discarded under this lock.
    if (record.prepared?.runId === runId)
      return { ...record.prepared.order, planId, runId };
    const built = await prepareRecurringInvestmentOrder(record.plan, runId);
    const entry: RecurringInvestmentReceipt = {
      planId,
      runId,
      scheduledAt: due.scheduledAt,
      status: "prepared",
      amountUnits: record.plan.amountUnits,
      updatedAt: Math.floor(Date.now() / 1000),
    };
    if (prior) Object.assign(prior, entry);
    else record.receipts.push(entry);
    record.prepared = { runId, order: built.order };
    await writeInvestment(record);
    return { ...built.order, planId, runId };
  });
}
export async function recordInvestmentRun(
  planId: string,
  runId: string,
  signedTransaction: string,
  authorization: string,
) {
  return withInvestmentLock(planId, async () => {
    let record = await readInvestment(planId);
    if (record.plan.buyer !== investmentExecutor())
      throw new Error("This plan belongs to a different executor.");
    const entry = receipt(record, runId);
    if (!entry)
      throw new Error("Review an investment transaction before submitting it.");
    if (entry.status === "success" || entry.status === "failed")
      return { status: entry.status, signature: entry.signature };
    if (record.pending) {
      if (
        record.pending.runId !== runId ||
        record.pending.signedTransaction !== signedTransaction
      )
        throw new Error(
          "Another signed investment is awaiting reconciliation.",
        );
      record = await reconcile(record);
      await writeInvestment(record);
      return {
        status: receipt(record, runId)!.status,
        signature: entry.signature,
      };
    }
    if (
      record.prepared?.runId !== runId ||
      record.prepared.order.authorization !== authorization
    )
      throw new Error("The signed investment does not match its review.");
    const verified = await verifyComposed(authorization, signedTransaction, {
      acceptExpired: true,
    });
    if (
      verified.taker !== record.plan.buyer ||
      verified.version !== 1 ||
      verified.investmentRun?.planId !== planId ||
      verified.investmentRun?.runId !== runId
    )
      throw new Error(
        "The investment must be signed by its approved V1 executor for this occurrence.",
      );
    if (record.prepared.order.expiresAt <= Date.now()) {
      // This server never broadcasts without pending intent. No pending means this
      // expired preparation was never submitted through the executor endpoint.
      entry.status = "failed";
      entry.error =
        "The review expired before submission. No investment was submitted.";
      entry.updatedAt = Math.floor(Date.now() / 1000);
      delete record.prepared;
      await writeInvestment(record);
      return { status: "failed" as const };
    }
    await assertMainnetV1Ready([1]);
    if (
      record.plan.status !== "active" ||
      !dueScheduleOccurrence(
        record.plan.schedule,
        Math.floor(Date.now() / 1000),
      )
    )
      throw new Error("This investment's execution window has ended.");
    const signature = await walletTransactionSignature(signedTransaction);
    entry.status = "pending";
    entry.signature = signature;
    entry.explorerUrl = `https://solscan.io/tx/${signature}`;
    record.pending = {
      runId,
      signature,
      signedTransaction,
      lastValidBlockHeight: verified.lastValidBlockHeight,
    };
    delete record.prepared;
    await writeInvestment(record); // Durable signed intent BEFORE broadcasting; no replacement on ambiguity.
    try {
      const returned = await mainnetRpc<string>("sendTransaction", [
        signedTransaction,
        {
          encoding: "base64",
          skipPreflight: false,
          preflightCommitment: "confirmed",
          maxRetries: 2,
        },
      ]);
      if (returned !== signature)
        throw new Error("Unexpected transaction signature.");
      record = await reconcile(record);
      await writeInvestment(record);
    } catch {
      /* Preserve pending: transport errors can happen after broadcast. */
    }
    return { status: receipt(record, runId)!.status, signature };
  });
}
export async function discardInvestmentRun(
  planId: string,
  runId: string,
  authorization: string,
) {
  return withInvestmentLock(planId, async () => {
    const record = await readInvestment(planId);
    if (
      record.pending ||
      record.prepared?.runId !== runId ||
      record.prepared.order.authorization !== authorization ||
      record.prepared.order.expiresAt > Date.now()
    )
      throw new Error(
        "Only an expired investment that was never submitted can be discarded.",
      );
    const entry = receipt(record, runId);
    if (!entry) throw new Error("Investment receipt missing.");
    entry.status = "failed";
    entry.error =
      "The review expired before signing. No investment was submitted.";
    entry.updatedAt = Math.floor(Date.now() / 1000);
    delete record.prepared;
    await writeInvestment(record);
    return { status: "failed" as const };
  });
}
export async function reconcileInvestmentRun(planId: string, runId: string) {
  return withInvestmentLock(planId, async () => {
    const record = await reconcile(await readInvestment(planId));
    await writeInvestment(record);
    const entry = receipt(record, runId);
    return { status: entry?.status ?? "prepared", signature: entry?.signature };
  });
}
