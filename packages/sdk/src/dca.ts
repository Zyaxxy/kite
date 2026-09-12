import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { SipSchedule } from './types';

export interface CreateDcaParams {
  payer: PublicKey;
  inputMint: PublicKey; // USDC
  outputMint: PublicKey; // Tokenized stock or basket mint
  inAmountPerCycle: bigint;
  cycleFrequencySeconds: number;
}

/**
 * Helper to construct an automated Systematic Investment Plan (DCA) order
 * Non-custodial, routing through onchain execution programs.
 */
export async function buildSipInstruction(
  params: CreateDcaParams
): Promise<{ instructions: TransactionInstruction[]; scheduleSummary: string }> {
  // In production, this composes with Jupiter DCA or custom Anchor Vault instructions
  const frequencyLabel = params.cycleFrequencySeconds <= 86400 ? 'Daily' : 'Weekly';
  
  return {
    instructions: [],
    scheduleSummary: `${frequencyLabel} SIP of ${(Number(params.inAmountPerCycle) / 1e6).toFixed(2)} USDC`
  };
}
