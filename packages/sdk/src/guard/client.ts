import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";

export const KITE_GUARD_PROGRAM_ID = new PublicKey(
  "8Fm9HENPAFnyo6L8cHJFx62HHsZ6ez6CPUDuzgKAzrjs",
);

export const TOTAL_WEIGHT_BPS = 10_000;
export const MAX_OUTPUT_ASSETS = 20;
export const MIN_PERIOD_SECONDS = 60;
export const MAX_PLAN_DURATION_SECONDS = 31_536_000n;
const MAX_TOKEN_AMOUNT = (1n << 64n) - 1n;

export interface KiteGuardOutput {
  mint: string;
  weightBps: number;
}

export interface CreatePlanParams {
  owner: string;
  fundingMint: string;
  subscriptionAuthority: string;
  fundingAmount: bigint;
  periodSeconds: bigint;
  periods: number;
  outputs: KiteGuardOutput[];
}

export interface KiteGuardPlan {
  address: string;
  owner: string;
  fundingMint: string;
  fundingAmount: bigint;
  periodSeconds: bigint;
  lastExecutedAt: bigint;
  periods: number;
  executedPeriods: number;
  subscriptionAuthority: string;
  bump: number;
  outputs: KiteGuardOutput[];
}

/**
 * Derives the deterministic Plan PDA address.
 */
export function findPlanPda(
  owner: PublicKey | string,
  fundingMint: PublicKey | string,
  programId: PublicKey = KITE_GUARD_PROGRAM_ID,
): [PublicKey, number] {
  const ownerPubkey = typeof owner === "string" ? new PublicKey(owner) : owner;
  const mintPubkey =
    typeof fundingMint === "string" ? new PublicKey(fundingMint) : fundingMint;

  return PublicKey.findProgramAddressSync(
    [Buffer.from("plan"), ownerPubkey.toBuffer(), mintPubkey.toBuffer()],
    programId,
  );
}

import type { KiteGuard } from "./kite_guard";
import KiteGuardIdl from "./kite_guard.json";
export type { KiteGuard };
export { KiteGuardIdl };
/**
 * Validates output asset allocations.
 * Weights must strictly sum to 10,000 basis points (100.00%) with between 1 and 20 assets.
 */
export function validatePlanAllocations(
  outputs: KiteGuardOutput[],
): { valid: boolean; error?: string } {
  if (!Array.isArray(outputs) || outputs.length === 0) {
    return { valid: false, error: "Plan must contain at least one output asset." };
  }
  if (outputs.length > MAX_OUTPUT_ASSETS) {
    return {
      valid: false,
      error: `Plan exceeds maximum limit of ${MAX_OUTPUT_ASSETS} assets.`,
    };
  }

  let totalBps = 0;
  const seen = new Set<string>();
  for (const output of outputs) {
    if (!output || typeof output.mint !== "string" || !output.mint) {
      return { valid: false, error: "Output asset mint cannot be empty." };
    }
    let mint: string;
    try {
      mint = new PublicKey(output.mint).toBase58();
    } catch {
      return { valid: false, error: "Output asset mint must be a valid public key." };
    }
    if (seen.has(mint)) {
      return { valid: false, error: "Each output asset mint must be unique." };
    }
    seen.add(mint);
    if (!Number.isSafeInteger(output.weightBps) || output.weightBps <= 0 || output.weightBps > TOTAL_WEIGHT_BPS) {
      return { valid: false, error: "Each asset weight must be an integer between 1 and 10,000 bps." };
    }
    totalBps += output.weightBps;
  }

  if (totalBps !== TOTAL_WEIGHT_BPS) {
    return {
      valid: false,
      error: `Total weights sum to ${totalBps} bps; must equal exactly ${TOTAL_WEIGHT_BPS} bps (100%).`,
    };
  }

  return { valid: true };
}

/**
 * Validates terms for creating an on-chain recurring plan.
 */
export function validatePlanTerms(params: CreatePlanParams): void {
  if (typeof params.fundingAmount !== "bigint" || params.fundingAmount <= 0n) {
    throw new Error("Funding amount must be greater than zero.");
  }
  if (params.fundingAmount > MAX_TOKEN_AMOUNT) {
    throw new Error("Funding amount exceeds the token program's u64 limit.");
  }
  if (!Number.isSafeInteger(params.periods) || params.periods <= 0 || params.periods > 365) {
    throw new Error("Periods must be between 1 and 365.");
  }
  if (typeof params.periodSeconds !== "bigint" || params.periodSeconds < BigInt(MIN_PERIOD_SECONDS)) {
    throw new Error(`Period interval must be at least ${MIN_PERIOD_SECONDS} seconds.`);
  }
  if (params.periodSeconds * BigInt(params.periods) > MAX_PLAN_DURATION_SECONDS) {
    throw new Error("The recurring schedule must end within one year.");
  }

  const validation = validatePlanAllocations(params.outputs);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  const owner = new PublicKey(params.owner);
  if (!PublicKey.isOnCurve(owner.toBytes())) {
    throw new Error("The plan owner must be a signing wallet.");
  }
  const fundingMint = new PublicKey(params.fundingMint).toBase58();
  new PublicKey(params.subscriptionAuthority);
  if (params.outputs.some((output) => new PublicKey(output.mint).toBase58() === fundingMint)) {
    throw new Error("The funding mint cannot also be a basket output.");
  }
}

/** Largest-remainder allocation conserves every funding unit; ties use plan order. */
export function allocateGuardFunding(amount: bigint, outputs: KiteGuardOutput[]): bigint[] {
  if (typeof amount !== "bigint" || amount <= 0n || amount > MAX_TOKEN_AMOUNT) {
    throw new Error("A positive u64 funding amount is required.");
  }
  const validation = validatePlanAllocations(outputs);
  if (!validation.valid) throw new Error(validation.error);
  const divisor = BigInt(TOTAL_WEIGHT_BPS);
  const parts = outputs.map((output, index) => {
    const product = amount * BigInt(output.weightBps);
    return { index, amount: product / divisor, remainder: product % divisor };
  });
  const remaining = amount - parts.reduce((sum, part) => sum + part.amount, 0n);
  const ranked = [...parts].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (let index = 0; index < Number(remaining); index++) ranked[index].amount += 1n;
  if (parts.some((part) => part.amount === 0n)) {
    throw new Error("Increase the installment amount so every basket asset receives funding.");
  }
  return parts.map((part) => part.amount);
}
