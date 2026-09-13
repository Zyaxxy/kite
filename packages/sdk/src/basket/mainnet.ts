import { Buffer } from "buffer";
import {
  PublicKey,
  TransactionInstruction,
  AddressLookupTableAccount,
} from "@solana/web3.js";

export interface WalletTransactionOrder {
  /** Bound by the server authorization hash; stored only after a valid owner signature. */
  investmentSetup?: import("../recurring-investing").RecurringInvestmentPlan;
  requestId: string;
  transaction: string;
  authorization: string;
  taker: string;
  expiresAt: number;
  transactionVersion: 0 | 1;
  serializedBytes: number;
  lastValidBlockHeight: number;
}
export interface BasketOrderRequest {
  basketId: string;
  inputMint: string;
  amount: string;
  taker: string;
  slippageBps: number;
  supportedTransactionVersions?: number[];
}
export interface BasketOrder extends WalletTransactionOrder {
  basketId: string;
  inputMint: string;
  inputDecimals: number;
  inAmount: string;
  slippageBps: number;
  priorityFeeLamports: number;
  outputs: {
    mint: string;
    symbol: string;
    decimals: number;
    inputAmount: string;
    outAmount: string;
    minimumAmount: string;
    weightBps: number;
  }[];
}
export interface RecurringPayment {
  address: string;
  owner: string;
  buyer: string;
  mint: string;
  amountPerPeriod: string;
  periodSeconds: number;
  startsAt: number;
  expiresAt: number;
  pulledInPeriod: string;
  currentPeriodStartedAt: number;
}
export interface RecurringPaymentRequest {
  taker: string;
  buyer: string;
  mint: string;
  amount: string;
  periodSeconds: number;
  periods: number;
  supportedTransactionVersions?: number[];
}

/** Instruction conversion is structural: no private keys or signing happens here. */
export function kitInstructionToWeb3(ix: {
  programAddress: string;
  accounts?: readonly { address: string; role: number }[];
  data?: ArrayLike<number>;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programAddress),
    keys: (ix.accounts ?? []).map((a) => ({
      pubkey: new PublicKey(a.address),
      isWritable: (a.role & 1) !== 0,
      isSigner: (a.role & 2) !== 0,
    })),
    data: Buffer.from(ix.data ?? []),
  });
}

/** New mainnet orders are V1 only. The caller must verify network and wallet capability. */
export async function composeMainnetTransaction(params: {
  payer: string;
  blockhash: string;
  lastValidBlockHeight: number;
  instructions: TransactionInstruction[];
  lookupTables?: AddressLookupTableAccount[];
  allowV1: boolean;
  computeUnitLimit?: number;
  loadedAccountsDataSizeLimit?: number;
  priorityFeeLamports?: number;
}): Promise<{
  transaction: string;
  serializedBytes: number;
  transactionVersion: 1;
}> {
  const units = params.computeUnitLimit ?? 1_400_000;
  const fee = params.priorityFeeLamports ?? 10_000;
  if (!Number.isInteger(fee) || fee < 0 || fee > 100_000)
    throw new Error("Invalid priority fee limit.");
  if (!params.allowV1)
    throw new Error(
      "V1 trading requires an activated mainnet and a wallet that supports V1 signing. No transaction was created.",
    );
  const kit = await import("@solana/kit-v1");
  if (!Number.isInteger(units) || units < 1 || units > 1_400_000)
    throw new Error("Invalid compute budget.");
  const dataLimit = params.loadedAccountsDataSizeLimit ?? 64 * 1024 * 1024;
  if (
    !Number.isInteger(dataLimit) ||
    dataLimit < 1 ||
    dataLimit > 64 * 1024 * 1024
  )
    throw new Error("Invalid loaded-account data budget.");
  const accounts = new Set([params.payer]);
  for (const ix of params.instructions) {
    if (
      ix.programId.toBase58() === "ComputeBudget111111111111111111111111111111"
    )
      throw new Error("V1 resource limits belong in the message config.");
    accounts.add(ix.programId.toBase58());
    for (const key of ix.keys) {
      if (key.isSigner && key.pubkey.toBase58() !== params.payer)
        throw new Error("Unsupported additional signer.");
      accounts.add(key.pubkey.toBase58());
    }
  }
  if (accounts.size > 64)
    throw new Error(
      "This basket exceeds the 64-account limit, including on V1. No partial order was created.",
    );
  const message = kit.pipe(
    kit.createTransactionMessage({ version: 1 }),
    (m) => kit.setTransactionMessageFeePayer(kit.address(params.payer), m),
    (m) =>
      kit.setTransactionMessageLifetimeUsingBlockhash(
        {
          blockhash: kit.blockhash(params.blockhash),
          lastValidBlockHeight: BigInt(params.lastValidBlockHeight),
        },
        m,
      ),
    (m) => kit.setTransactionMessageComputeUnitLimit(units, m),
    (m) => kit.setTransactionMessageLoadedAccountsDataSizeLimit(dataLimit, m),
    (m) => kit.setTransactionMessagePriorityFeeLamports(BigInt(fee), m),
    (m) =>
      kit.appendTransactionMessageInstructions(
        params.instructions.map((ix) => ({
          programAddress: kit.address(ix.programId.toBase58()),
          data: new Uint8Array(ix.data),
          accounts: ix.keys.map((key) => ({
            address: kit.address(key.pubkey.toBase58()),
            role: (key.isSigner ? 2 : 0) + (key.isWritable ? 1 : 0),
          })),
        })),
        m,
      ),
  );
  const bytes = kit
    .getTransactionEncoder()
    .encode(kit.compileTransaction(message));
  if (bytes.length > 4096)
    throw new Error(
      "This basket exceeds the V1 transaction size limit. No partial order was created.",
    );
  return {
    transaction: Buffer.from(bytes).toString("base64"),
    serializedBytes: bytes.length,
    transactionVersion: 1,
  };
}

export async function inspectWalletTransaction(encoded: string) {
  const kit = await import("@solana/kit-v1");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
    throw new Error("Invalid transaction encoding.");
  const bytes = Buffer.from(encoded, "base64");
  const transaction = kit.getTransactionDecoder().decode(bytes);
  const message = kit
    .getCompiledTransactionMessageDecoder()
    .decode(transaction.messageBytes);
  if (bytes.length > (message.version === 1 ? 4096 : 1232))
    throw new Error("Unsupported transaction size.");
  return { transaction, message, bytes };
}

/** Derive the explorer ID before submission, including when the HTTP response is lost. */
export async function walletTransactionSignature(
  encoded: string,
): Promise<string> {
  const kit = await import("@solana/kit-v1");
  const { transaction } = await inspectWalletTransaction(encoded);
  const signature = Object.values(transaction.signatures)[0];
  if (!signature || signature.every((byte) => byte === 0))
    throw new Error("The wallet did not sign this transaction.");
  return kit.getBase58Decoder().decode(signature);
}
