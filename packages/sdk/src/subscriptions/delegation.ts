import { Buffer } from "buffer";
import { Connection, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { getAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";

export interface SipTerms {
  amountPerCycle: bigint;
  minimumOutput: bigint;
  intervalSeconds: bigint;
  firstExecutionAt: bigint;
  expiresAt: bigint;
  maxCycles: number;
}
export interface SipAccounts {
  programId: PublicKey;
  owner: PublicKey;
  planId: bigint;
  inputMint: PublicKey;
  outputMint: PublicKey;
  inputAccount: PublicKey;
  outputAccount: PublicKey;
}
const U64_MAX = (1n << 64n) - 1n;
const I64_MAX = (1n << 63n) - 1n;
function u64(value: bigint): Buffer {
  if (value < 0n || value > U64_MAX) throw new Error("Value is outside the unsigned 64-bit range.");
  const bytes = Buffer.alloc(8); bytes.writeBigUInt64LE(value); return bytes;
}
export function validateSipTerms(terms: SipTerms, nowSeconds = BigInt(Math.floor(Date.now() / 1_000))): bigint {
  if (terms.amountPerCycle <= 0n || terms.minimumOutput <= 0n || terms.minimumOutput > U64_MAX) throw new Error("Installment and minimum output must be positive token units.");
  if (terms.intervalSeconds < 60n || terms.intervalSeconds > 31_536_000n) throw new Error("SIP intervals must be between one minute and one year.");
  if (!Number.isInteger(terms.maxCycles) || terms.maxCycles < 1 || terms.maxCycles > 0xffff_ffff) throw new Error("A finite cycle limit is required.");
  if (terms.firstExecutionAt < nowSeconds || terms.expiresAt <= terms.firstExecutionAt || terms.expiresAt > I64_MAX || terms.firstExecutionAt + terms.intervalSeconds > I64_MAX) throw new Error("Invalid SIP authorization dates.");
  const allowance = terms.amountPerCycle * BigInt(terms.maxCycles);
  if (allowance > U64_MAX) throw new Error("The SIP allowance exceeds the token integer range.");
  return allowance;
}
export function deriveSipAddress(programId: PublicKey, owner: PublicKey, planId: bigint): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("sip"), owner.toBuffer(), u64(planId)], programId)[0];
}

/** The program validates the plan and grants its finite PDA allowance atomically.
 * Experimental legacy-SPL settlement only. No configured mainnet program ID. */
export function createSipDelegationInstruction(params: SipAccounts & { terms: SipTerms; nowSeconds?: bigint }): TransactionInstruction {
  validateSipTerms(params.terms, params.nowSeconds);
  if (params.inputMint.equals(params.outputMint) || params.inputAccount.equals(params.outputAccount)) throw new Error("SIP input and output must be distinct.");
  const cycles = Buffer.alloc(4); cycles.writeUInt32LE(params.terms.maxCycles);
  const { terms } = params;
  return new TransactionInstruction({
    programId: params.programId,
    keys: [
      { pubkey: deriveSipAddress(params.programId, params.owner, params.planId), isSigner: false, isWritable: true },
      { pubkey: params.owner, isSigner: true, isWritable: true },
      { pubkey: params.inputMint, isSigner: false, isWritable: false },
      { pubkey: params.outputMint, isSigner: false, isWritable: false },
      { pubkey: params.inputAccount, isSigner: false, isWritable: true },
      { pubkey: params.outputAccount, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from([137, 160, 213, 227, 90, 214, 229, 81]), u64(params.planId), u64(terms.amountPerCycle), u64(terms.minimumOutput), u64(terms.intervalSeconds), u64(terms.firstExecutionAt), u64(terms.expiresAt), cycles]),
  });
}

export function cancelSipInstruction(params: Pick<SipAccounts, "programId" | "owner" | "planId" | "inputAccount">): TransactionInstruction {
  return new TransactionInstruction({ programId: params.programId, keys: [
    { pubkey: deriveSipAddress(params.programId, params.owner, params.planId), isSigner: false, isWritable: true },
    { pubkey: params.owner, isSigner: true, isWritable: false },
    { pubkey: params.inputAccount, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ], data: Buffer.from([133, 56, 35, 99, 18, 235, 117, 29]) });
}

/** Returns the live allowance only after checking source owner, mint and plan PDA. */
export async function getDelegatedAllowance(params: Pick<SipAccounts, "programId" | "owner" | "planId" | "inputAccount" | "inputMint"> & { connection: Connection }): Promise<bigint> {
  const account = await getAccount(params.connection, params.inputAccount, "confirmed", TOKEN_PROGRAM_ID);
  if (!account.owner.equals(params.owner) || !account.mint.equals(params.inputMint)) throw new Error("The allowance account does not match the owner and input mint.");
  return account.delegate?.equals(deriveSipAddress(params.programId, params.owner, params.planId)) ? account.delegatedAmount : 0n;
}
