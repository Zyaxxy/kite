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
  if (!outputs || outputs.length === 0) {
    return { valid: false, error: "Plan must contain at least one output asset." };
  }
  if (outputs.length > MAX_OUTPUT_ASSETS) {
    return {
      valid: false,
      error: `Plan exceeds maximum limit of ${MAX_OUTPUT_ASSETS} assets.`,
    };
  }

  let totalBps = 0;
  for (const output of outputs) {
    if (!output.mint) {
      return { valid: false, error: "Output asset mint cannot be empty." };
    }
    if (output.weightBps <= 0) {
      return { valid: false, error: "Each asset weight must be greater than zero." };
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
  if (params.fundingAmount <= 0n) {
    throw new Error("Funding amount must be greater than zero.");
  }
  if (params.periods <= 0 || params.periods > 365) {
    throw new Error("Periods must be between 1 and 365.");
  }
  if (params.periodSeconds < BigInt(MIN_PERIOD_SECONDS)) {
    throw new Error(`Period interval must be at least ${MIN_PERIOD_SECONDS} seconds.`);
  }

  const validation = validatePlanAllocations(params.outputs);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
}
