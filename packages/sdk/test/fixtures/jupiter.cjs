// Test-only Borsh encoding from the pinned program IDL, independent of the validating reader.
const {
  JUPITER_EXACT_IN_IDL: idl,
} = require("../../dist/jupiter-idl/exact-in");
const JUPITER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
function unsigned(value, bytes) {
  const out = Buffer.alloc(bytes);
  let n = BigInt(value ?? 0);
  for (let i = 0; i < bytes; i++) {
    out[i] = Number(n & 255n);
    n >>= 8n;
  }
  return out;
}
function fields(list, value = {}) {
  return Buffer.concat(list.map((f) => encode(f.type, value[f.name])));
}
function encode(type, value) {
  if (typeof type === "string") {
    if (/^u(8|16|32|64|128)$/.test(type))
      return unsigned(value, Number(type.slice(1)) / 8);
    if (type === "bool") return Buffer.from([value ? 1 : 0]);
    if (type === "bytes") {
      const bytes = Buffer.from(value ?? []);
      return Buffer.concat([unsigned(bytes.length, 4), bytes]);
    }
    throw new Error(`Unsupported fixture type ${type}`);
  }
  if (type.option)
    return value == null
      ? Buffer.from([0])
      : Buffer.concat([Buffer.from([1]), encode(type.option, value)]);
  if (type.vec) {
    const values = value ?? [];
    return Buffer.concat([
      unsigned(values.length, 4),
      ...values.map((v) => encode(type.vec, v)),
    ]);
  }
  if (type.array)
    return Buffer.concat(
      Array.from({ length: type.array[1] }, (_, i) =>
        encode(type.array[0], value?.[i]),
      ),
    );
  const definition = idl.types[type.defined.name];
  if (definition.kind === "struct") return fields(definition.fields, value);
  const name = value?.variant ?? definition.variants[0].name;
  const index = definition.variants.findIndex((v) => v.name === name);
  if (index < 0) throw new Error("Unknown fixture variant");
  return Buffer.concat([
    Buffer.from([index]),
    fields(definition.variants[index].fields ?? [], value),
  ]);
}
function testJupiterInstruction({
  kind = "route_v2",
  signer,
  source,
  destination,
  inputMint,
  outputMint,
  inputTokenProgram = TOKEN,
  outputTokenProgram = TOKEN,
  amount = "1000000",
  out = "1000000",
  slippage = 100,
  args = {},
  swap = { variant: "RaydiumCP" },
}) {
  const shape = idl.instructions.find((i) => i.name === kind);
  const values = {
    id: 0,
    in_amount: BigInt(amount),
    quoted_out_amount: BigInt(out),
    slippage_bps: slippage,
    platform_fee_bps: 0,
    positive_slippage_bps: 0,
    route_plan: [
      { swap, percent: 100, bps: 10000, input_index: 0, output_index: 1 },
    ],
    ...args,
  };
  const addresses = {
    user_transfer_authority: signer,
    user_source_token_account: source,
    source_token_account: source,
    user_destination_token_account: destination,
    destination_token_account: destination,
    source_mint: inputMint,
    destination_mint: outputMint,
    token_program: inputTokenProgram,
    source_token_program: inputTokenProgram,
    destination_token_program: outputTokenProgram,
    program: JUPITER,
  };
  return {
    programId: JUPITER,
    data: Buffer.concat([
      Buffer.from(shape.discriminator),
      fields(shape.args, values),
    ]).toString("base64"),
    accounts: shape.accounts.map((a) => ({
      pubkey: a.address ?? addresses[a.name] ?? JUPITER,
      isSigner: a.signer ?? false,
      isWritable: a.writable ?? false,
    })),
  };
}
module.exports = { testJupiterInstruction, encode };
