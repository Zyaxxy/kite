import { JUPITER_EXACT_IN_IDL } from "./jupiter-idl/exact-in";

export const JUPITER_SWAP_PROGRAM =
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
type IdlType =
  | string
  | { vec: IdlType }
  | { option: IdlType }
  | { array: [IdlType, number] }
  | { defined: { name: string } };
type Field = { name: string; type: IdlType };
type Definition =
  | { kind: "struct"; fields: Field[] }
  | { kind: "enum"; variants: { name: string; fields?: Field[] }[] };
interface InstructionSchema {
  name: string;
  discriminator: number[];
  accounts: {
    name: string;
    signer?: boolean;
    writable?: boolean;
    optional?: boolean;
    address?: string;
  }[];
  args: Field[];
}
const schema = JUPITER_EXACT_IN_IDL as unknown as {
  instructions: InstructionSchema[];
  types: Record<string, Definition>;
};

class BorshReader {
  offset = 0;
  private nodes = 0;
  private readonly view: DataView;
  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  private take(length: number): number {
    if (
      !Number.isSafeInteger(length) ||
      length < 0 ||
      this.offset + length > this.bytes.length
    )
      throw new Error("Truncated Jupiter instruction.");
    const start = this.offset;
    this.offset += length;
    return start;
  }
  private length(): number {
    const length = this.view.getUint32(this.take(4), true);
    if (length > 4096)
      throw new Error("Jupiter instruction length exceeds its limit.");
    return length;
  }
  fields(fields: Field[], depth = 0): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const field of fields)
      result[field.name] = this.read(field.type, depth);
    return result;
  }
  read(type: IdlType, depth = 0): unknown {
    if (++this.nodes > 8192 || depth > 12)
      throw new Error("Jupiter instruction nesting exceeds its limit.");
    if (typeof type === "string") {
      if (type === "u8") return this.view.getUint8(this.take(1));
      if (type === "u16") return this.view.getUint16(this.take(2), true);
      if (type === "u32") return this.view.getUint32(this.take(4), true);
      if (type === "u64") return this.view.getBigUint64(this.take(8), true);
      if (type === "u128") {
        const start = this.take(16);
        return (
          this.view.getBigUint64(start, true) +
          (this.view.getBigUint64(start + 8, true) << 64n)
        );
      }
      if (type === "bool") {
        const value = this.view.getUint8(this.take(1));
        if (value > 1) throw new Error("Invalid Jupiter boolean encoding.");
        return value === 1;
      }
      if (type === "bytes") {
        const length = this.length();
        return this.bytes.subarray(this.take(length), this.offset);
      }
      throw new Error("Unsupported Jupiter instruction field.");
    }
    if ("option" in type) {
      const present = this.view.getUint8(this.take(1));
      if (present > 1) throw new Error("Invalid Jupiter option encoding.");
      return present ? this.read(type.option, depth + 1) : null;
    }
    if ("array" in type || "vec" in type) {
      const length = "array" in type ? type.array[1] : this.length();
      if (length > 256)
        throw new Error("Jupiter instruction vector exceeds its limit.");
      const element = "array" in type ? type.array[0] : type.vec;
      return Array.from({ length }, () => this.read(element, depth + 1));
    }
    const definition = schema.types[type.defined.name];
    if (!definition) throw new Error("Unsupported Jupiter instruction type.");
    if (definition.kind === "struct")
      return this.fields(definition.fields, depth + 1);
    const variant = definition.variants[this.view.getUint8(this.take(1))];
    if (!variant)
      throw new Error(
        "Unsupported Jupiter swap variant. Refresh the reviewed program schema before enabling this route.",
      );
    return {
      variant: variant.name,
      ...this.fields(variant.fields ?? [], depth + 1),
    };
  }
}

export interface JupiterExactInTerms {
  instruction: {
    programId: string;
    data: Uint8Array;
    accounts?: readonly {
      pubkey: string;
      isSigner: boolean;
      isWritable: boolean;
    }[];
  };
  inputAmount: bigint;
  quotedOutputAmount: bigint;
  minimumOutputAmount: bigint;
  slippageBps: number;
  /** When provided, also bind the instruction's account prefix to the reviewed settlement. */
  settlement?: {
    signer: string;
    sourceTokenAccount: string;
    destinationTokenAccount: string;
    inputMint: string;
    outputMint: string;
    inputTokenProgram?: string;
    outputTokenProgram?: string;
  };
}

/** Walk every Borsh field from the pinned program IDL; Anchor may ignore trailing bytes, we do not. */
export function validateJupiterExactInInstruction(input: JupiterExactInTerms) {
  const { instruction, settlement } = input;
  if (
    instruction.programId !== JUPITER_SWAP_PROGRAM ||
    instruction.data.length < 8 ||
    instruction.data.length > 4096
  )
    throw new Error("Unsupported Jupiter swap instruction.");
  const format = schema.instructions.find((candidate) =>
    candidate.discriminator.every(
      (byte, index) => instruction.data[index] === byte,
    ),
  );
  if (!format)
    throw new Error(
      "Unsupported Jupiter instruction variant; only reviewed ExactIn routes are accepted.",
    );
  const reader = new BorshReader(instruction.data);
  reader.offset = 8;
  const values = reader.fields(format.args);
  if (reader.offset !== instruction.data.length)
    throw new Error("Trailing bytes in Jupiter instruction are not accepted.");
  if (!Array.isArray(values.route_plan) || !values.route_plan.length)
    throw new Error("A Jupiter route must contain at least one swap step.");
  if (
    !Number.isInteger(input.slippageBps) ||
    input.slippageBps < 1 ||
    input.slippageBps > 300 ||
    input.inputAmount <= 0n ||
    input.quotedOutputAmount <= 0n ||
    values.in_amount !== input.inputAmount ||
    values.quoted_out_amount !== input.quotedOutputAmount ||
    values.slippage_bps !== input.slippageBps ||
    values.platform_fee_bps !== 0 ||
    (values.positive_slippage_bps !== undefined &&
      values.positive_slippage_bps !== 0)
  )
    throw new Error(
      "Encoded Jupiter amounts, slippage or fees differ from the reviewed quote.",
    );
  // Jupiter build reports amount - floor(amount * bps / 10000), i.e. a ceiling.
  // Keep the separate mainnet simulation/destination checks; schema validation is not execution proof.
  const minimum =
    input.quotedOutputAmount -
    (input.quotedOutputAmount * BigInt(input.slippageBps)) / 10_000n;
  if (minimum <= 0n || input.minimumOutputAmount !== minimum)
    throw new Error(
      "The Jupiter minimum output differs from the encoded quote and slippage.",
    );
  if (settlement) {
    const accounts = instruction.accounts;
    if (!accounts || accounts.length < format.accounts.length)
      throw new Error("Missing Jupiter settlement accounts.");
    const account = (name: string) => {
      const index = format.accounts.findIndex((a) => a.name === name);
      return index < 0 ? undefined : accounts[index];
    };
    const equal = (
      name: string,
      expected: string | undefined,
      writable = false,
      signer = false,
    ) => {
      if (!expected) return;
      const value = account(name);
      if (
        !value ||
        value.pubkey !== expected ||
        (writable && !value.isWritable) ||
        (signer && !value.isSigner)
      )
        throw new Error(
          "Encoded Jupiter settlement differs from the reviewed wallet and tokens.",
        );
    };
    equal("user_transfer_authority", settlement.signer, false, true);
    equal(
      format.name.startsWith("shared_")
        ? "source_token_account"
        : "user_source_token_account",
      settlement.sourceTokenAccount,
      true,
    );
    const override = account("destination_token_account");
    equal(
      format.name.startsWith("shared_") ||
        (override && override.pubkey !== JUPITER_SWAP_PROGRAM)
        ? "destination_token_account"
        : "user_destination_token_account",
      settlement.destinationTokenAccount,
      true,
    );
    if (account("source_mint")) equal("source_mint", settlement.inputMint);
    equal("destination_mint", settlement.outputMint);
    if (account("source_token_program"))
      equal("source_token_program", settlement.inputTokenProgram);
    if (account("destination_token_program"))
      equal("destination_token_program", settlement.outputTokenProgram);
    equal("program", JUPITER_SWAP_PROGRAM);
    for (const [index, field] of format.accounts.entries())
      if (field.address && accounts[index].pubkey !== field.address)
        throw new Error("Unexpected Jupiter instruction authority.");
  }
  return {
    name: format.name,
    inputAmount: input.inputAmount,
    quotedOutputAmount: input.quotedOutputAmount,
    minimumOutputAmount: minimum,
    slippageBps: input.slippageBps,
  };
}
