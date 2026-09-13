import { Buffer } from "buffer";
import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { deriveSipAddress, type SipAccounts } from "./delegation";

/** Build direct settlement from executor inventory. This does not fetch or authorize
 * arbitrary routes; Jupiter composition requires an independently validated executor. */
export function buildSipExecutionTransaction(params: SipAccounts & {
  executor: PublicKey;
  executorInputAccount: PublicKey;
  executorOutputAccount: PublicKey;
  outputAmount: bigint;
  recentBlockhash: string;
}): Transaction {
  if (params.owner.equals(params.executor)) throw new Error("SIP executor must differ from the buyer.");
  if (params.inputMint.equals(params.outputMint)) throw new Error("SIP input and output mints must differ.");
  if (params.outputAmount <= 0n || params.outputAmount > (1n << 64n) - 1n) throw new Error("Invalid settlement output amount.");
  const amount = Buffer.alloc(8); amount.writeBigUInt64LE(params.outputAmount);
  const instruction = new TransactionInstruction({ programId: params.programId, keys: [
    { pubkey: deriveSipAddress(params.programId, params.owner, params.planId), isSigner: false, isWritable: true },
    { pubkey: params.executor, isSigner: true, isWritable: false },
    { pubkey: params.inputMint, isSigner: false, isWritable: false },
    { pubkey: params.outputMint, isSigner: false, isWritable: false },
    { pubkey: params.inputAccount, isSigner: false, isWritable: true },
    { pubkey: params.outputAccount, isSigner: false, isWritable: true },
    { pubkey: params.executorInputAccount, isSigner: false, isWritable: true },
    { pubkey: params.executorOutputAccount, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ], data: Buffer.concat([Buffer.from([223, 213, 85, 145, 104, 79, 178, 207]), amount]) });
  return new Transaction({ feePayer: params.executor, recentBlockhash: params.recentBlockhash }).add(instruction);
}
