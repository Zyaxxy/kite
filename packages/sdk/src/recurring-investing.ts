import type { WalletTransactionOrder } from "./basket/mainnet";

/** Shared, client-safe recurring investment terms. All timestamps are Unix seconds in UTC. */
export interface RecurringInvestmentSchedule {
  unit: "day" | "week" | "month";
  interval: number;
  startsAt: number;
  occurrences: number;
}

export interface RecurringInvestmentTarget {
  type: "basket" | "stock";
  id: string;
}

export interface RecurringInvestmentAllocation {
  mint: string;
  symbol: string;
  weightBps: number;
}

export interface RecurringInvestmentPermissionWindow {
  periodSeconds: number;
  startsAt: number;
  expiresAt: number;
  /** The permission uses fixed periods, which can outnumber calendar investments. */
  maximumCollections: number;
}

export interface RecurringInvestmentPlan {
  id: string;
  owner: string;
  buyer: string;
  delegation: string;
  fundingMint: string;
  fundingSymbol: string;
  fundingDecimals: number;
  amountUnits: string;
  target: RecurringInvestmentTarget;
  allocations: RecurringInvestmentAllocation[];
  schedule: RecurringInvestmentSchedule;
  permission: RecurringInvestmentPermissionWindow;
  slippageBps: number;
  status: "draft" | "active" | "paused" | "revoked" | "completed";
  createdAt: number;
}

export interface RecurringInvestmentReceipt {
  planId: string;
  runId: string;
  scheduledAt: number;
  status: "prepared" | "pending" | "success" | "failed" | "skipped";
  amountUnits: string;
  signature?: string;
  explorerUrl?: string;
  error?: string;
  feeLamports?: number;
  outputs?: {
    mint: string;
    symbol: string;
    amountUnits: string;
    decimals: number;
  }[];
  updatedAt: number;
}

export interface RecurringInvestmentConfig {
  configured: boolean;
  executor: string | null;
  transactionVersion: 1;
  available: boolean;
  reason: string | null;
}

export interface CreateInvestmentPlanRequest {
  action: "create";
  taker: string;
  target: RecurringInvestmentTarget;
  fundingMint: string;
  amount: string;
  schedule: RecurringInvestmentSchedule;
  slippageBps: number;
  consent: true;
  supportedTransactionVersions: number[];
}

export interface InvestmentPlanReview {
  order: WalletTransactionOrder;
  plan: RecurringInvestmentPlan;
}

export interface RecurringScheduleOccurrence {
  index: number;
  scheduledAt: number;
}

export const RECURRENCE_EXECUTION_WINDOW_SECONDS = 6 * 60 * 60;
export const MAX_RECURRING_PERMISSION_SECONDS = 365 * 24 * 60 * 60;
const DAY_SECONDS = 24 * 60 * 60;

function assertTimestamp(value: number): void {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    !Number.isFinite(new Date(value * 1000).getTime())
  )
    throw new Error("Use a valid UTC date and time.");
}

export function assertRecurringInvestmentSchedule(
  schedule: RecurringInvestmentSchedule,
): void {
  if (!schedule || !["day", "week", "month"].includes(schedule.unit))
    throw new Error("Choose a daily, weekly or monthly investment schedule.");
  if (
    !Number.isSafeInteger(schedule.interval) ||
    schedule.interval < 1 ||
    schedule.interval > 12
  )
    throw new Error("Choose an interval from 1 to 12.");
  if (
    !Number.isSafeInteger(schedule.occurrences) ||
    schedule.occurrences < 1 ||
    schedule.occurrences > 365
  )
    throw new Error("Choose between 1 and 365 investments.");
  assertTimestamp(schedule.startsAt);
}

function occurrenceTimestamp(
  schedule: RecurringInvestmentSchedule,
  index: number,
): number {
  if (schedule.unit !== "month") {
    const timestamp =
      schedule.startsAt +
      index *
        schedule.interval *
        DAY_SECONDS *
        (schedule.unit === "week" ? 7 : 1);
    assertTimestamp(timestamp);
    return timestamp;
  }
  // Always anchor to the original day: Jan 31 -> Feb 28 -> Mar 31, without drift.
  const start = new Date(schedule.startsAt * 1000);
  const result = new Date(start.getTime());
  result.setUTCDate(1);
  result.setUTCMonth(start.getUTCMonth() + index * schedule.interval);
  const endOfMonth = new Date(result.getTime());
  endOfMonth.setUTCMonth(endOfMonth.getUTCMonth() + 1, 0);
  result.setUTCDate(Math.min(start.getUTCDate(), endOfMonth.getUTCDate()));
  const timestamp = result.getTime() / 1000;
  assertTimestamp(timestamp);
  return timestamp;
}

export function scheduleAt(
  schedule: RecurringInvestmentSchedule,
  index: number,
): number {
  assertRecurringInvestmentSchedule(schedule);
  if (
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index >= schedule.occurrences
  )
    throw new Error("The investment occurrence is outside this schedule.");
  return occurrenceTimestamp(schedule, index);
}

/** Last permitted service execution; this does not revoke onchain authority. */
export function recurringScheduleEndsAt(
  schedule: RecurringInvestmentSchedule,
): number {
  return (
    scheduleAt(schedule, schedule.occurrences - 1) +
    RECURRENCE_EXECUTION_WINDOW_SECONDS
  );
}

export function nextScheduleOccurrence(
  schedule: RecurringInvestmentSchedule,
  now: number,
  options: { inclusive?: boolean } = {},
): RecurringScheduleOccurrence | null {
  assertRecurringInvestmentSchedule(schedule);
  assertTimestamp(now);
  let low = 0;
  let high = schedule.occurrences;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const at = occurrenceTimestamp(schedule, middle);
    if (at > now || (options.inclusive && at === now)) high = middle;
    else low = middle + 1;
  }
  return low < schedule.occurrences
    ? { index: low, scheduledAt: occurrenceTimestamp(schedule, low) }
    : null;
}

/** Only the latest occurrence may run, for six hours. Missed investments never accumulate. */
export function dueScheduleOccurrence(
  schedule: RecurringInvestmentSchedule,
  now: number,
): RecurringScheduleOccurrence | null {
  assertRecurringInvestmentSchedule(schedule);
  assertTimestamp(now);
  if (now < schedule.startsAt) return null;
  const next = nextScheduleOccurrence(schedule, now);
  const index = (next?.index ?? schedule.occurrences) - 1;
  const scheduledAt = occurrenceTimestamp(schedule, index);
  return now < scheduledAt + RECURRENCE_EXECUTION_WINDOW_SECONDS
    ? { index, scheduledAt }
    : null;
}

/** Subscriptions has fixed-length periods; calendar scheduling remains the executor's policy. */
export function deriveRecurringPermissionWindow(
  schedule: RecurringInvestmentSchedule,
): RecurringInvestmentPermissionWindow {
  assertRecurringInvestmentSchedule(schedule);
  let periodSeconds =
    schedule.interval *
    DAY_SECONDS *
    (schedule.unit === "month" ? 28 : schedule.unit === "week" ? 7 : 1);
  if (schedule.occurrences > 1) {
    periodSeconds = Number.POSITIVE_INFINITY;
    for (let index = 1; index < schedule.occurrences; index += 1)
      periodSeconds = Math.min(
        periodSeconds,
        occurrenceTimestamp(schedule, index) -
          occurrenceTimestamp(schedule, index - 1),
      );
  }
  const expiresAt = recurringScheduleEndsAt(schedule);
  const duration = expiresAt - schedule.startsAt;
  if (duration > MAX_RECURRING_PERMISSION_SECONDS)
    throw new Error(
      "The final investment must finish within one year of the start.",
    );
  return {
    periodSeconds,
    startsAt: schedule.startsAt,
    expiresAt,
    maximumCollections: Math.ceil(duration / periodSeconds),
  };
}

export function maximumRecurringExposure(
  amountUnits: string,
  schedule: RecurringInvestmentSchedule,
): bigint {
  if (!/^[1-9]\d*$/.test(amountUnits))
    throw new Error("Use a positive amount in token units.");
  const amount = BigInt(amountUnits);
  if (amount > (1n << 64n) - 1n)
    throw new Error("The token amount exceeds the supported limit.");
  return (
    amount *
    BigInt(deriveRecurringPermissionWindow(schedule).maximumCollections)
  );
}

export function recurringScheduleLabel(
  schedule: Pick<RecurringInvestmentSchedule, "unit" | "interval">,
): string {
  const singular = { day: "Daily", week: "Weekly", month: "Monthly" }[
    schedule.unit
  ];
  return schedule.interval === 1
    ? singular
    : `Every ${schedule.interval} ${schedule.unit}s`;
}

/** Compatible with datetime-local and a plain native text field; the UI must label it UTC. */
export function utcScheduleInput(timestamp: number): string {
  assertTimestamp(timestamp);
  return new Date(timestamp * 1000).toISOString().slice(0, 16);
}

export function parseUtcScheduleInput(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Enter the UTC start as YYYY-MM-DDTHH:mm.");
  const date = new Date(`${value}:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 16) !== value
  )
    throw new Error("Enter a valid UTC calendar date and time.");
  const timestamp = date.getTime() / 1000;
  assertTimestamp(timestamp);
  return timestamp;
}
