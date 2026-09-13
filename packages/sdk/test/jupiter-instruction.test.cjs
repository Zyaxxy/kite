const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  validateJupiterExactInInstruction: validate,
  JUPITER_SWAP_PROGRAM,
} = require("../dist/jupiter-instruction");
const { testJupiterInstruction } = require("./fixtures/jupiter.cjs");
const live = require("./fixtures/jupiter-mainnet-build.json");
const { JUPITER_EXACT_IN_IDL: idl } = require("../dist/jupiter-idl/exact-in");
function request(instruction, terms = {}) {
  return {
    instruction: {
      ...instruction,
      data: Buffer.from(instruction.data, "base64"),
    },
    inputAmount: 1000000n,
    quotedOutputAmount: 1000000n,
    minimumOutputAmount: 990000n,
    slippageBps: 100,
    ...terms,
  };
}
const accounts = {
  signer: live.taker,
  source: live.swapInstruction.accounts[1].pubkey,
  destination: live.swapInstruction.accounts[2].pubkey,
  inputMint: live.inputMint,
  outputMint: live.outputMint,
};
test("decodes a captured mainnet Jupiter build including its ceil-rounded minimum", () => {
  const result = validate(
    request(live.swapInstruction, {
      inputAmount: BigInt(live.inAmount),
      quotedOutputAmount: BigInt(live.outAmount),
      minimumOutputAmount: BigInt(live.otherAmountThreshold),
      settlement: {
        signer: live.taker,
        sourceTokenAccount: accounts.source,
        destinationTokenAccount: accounts.destination,
        inputMint: live.inputMint,
        outputMint: live.outputMint,
      },
    }),
  );
  assert.equal(result.name, "route_v2");
  assert.equal(result.minimumOutputAmount, 99435n);
});
test("all four reviewed ExactIn layouts bind encoded quote fields and settlement accounts", () => {
  for (const kind of [
    "route",
    "shared_accounts_route",
    "route_v2",
    "shared_accounts_route_v2",
  ]) {
    const instruction = testJupiterInstruction({ ...accounts, kind });
    assert.equal(
      validate(
        request(instruction, {
          settlement: {
            signer: accounts.signer,
            sourceTokenAccount: accounts.source,
            destinationTokenAccount: accounts.destination,
            inputMint: accounts.inputMint,
            outputMint: accounts.outputMint,
          },
        }),
      ).name,
      kind,
    );
    for (const args of [
      { in_amount: 2n },
      { quoted_out_amount: 2n },
      { slippage_bps: 300 },
      { platform_fee_bps: 1 },
      ...(kind.endsWith("v2") ? [{ positive_slippage_bps: 1 }] : []),
    ])
      assert.throws(
        () =>
          validate(
            request(testJupiterInstruction({ ...accounts, kind, args })),
          ),
        /Encoded Jupiter/,
      );
  }
});
test("walks all pinned swap variants and nested options rather than guessing footer offsets", () => {
  for (const variant of idl.types.Swap.variants)
    validate(
      request(
        testJupiterInstruction({
          ...accounts,
          swap: { variant: variant.name },
        }),
      ),
    );
  for (const swap of [
    {
      variant: "WhirlpoolSwapV2",
      a_to_b: true,
      remaining_accounts_info: { slices: [{ accounts_type: 6, length: 2 }] },
    },
    {
      variant: "DynamicV2",
      candidate_swaps: [
        {
          candidate_swap: {
            variant: "HumidiFiRouter",
            claimed_ms: 4n,
            is_base_to_quote: true,
            seed_rng: Array(32).fill(7),
            token: Array(16).fill(9),
          },
          bps: 10000,
        },
      ],
      max_split_quote_calls: 1,
      max_split_candidates: 1,
    },
    { variant: "JupiterRfqV2", side: { variant: "Ask" }, fill_data: [1, 2, 3] },
  ])
    validate(request(testJupiterInstruction({ ...accounts, swap })));
});
test("trailing forged footers, truncated fields, unknown enums and noncanonical flags fail closed", () => {
  const instruction = testJupiterInstruction({ ...accounts, kind: "route" });
  const bytes = Buffer.from(instruction.data, "base64");
  for (const data of [
    Buffer.concat([bytes, bytes.subarray(-19)]),
    bytes.subarray(0, bytes.length - 1),
    Buffer.concat([Buffer.alloc(8), bytes.subarray(8)]),
  ])
    assert.throws(
      () =>
        validate(request({ ...instruction, data: data.toString("base64") })),
      /Trailing|Truncated|Unsupported/,
    );
  const unknown = Buffer.from(bytes);
  unknown[12] = 255;
  assert.throws(
    () =>
      validate(request({ ...instruction, data: unknown.toString("base64") })),
    /Unsupported Jupiter swap/,
  );
  const bool = testJupiterInstruction({
    ...accounts,
    kind: "route",
    swap: { variant: "Whirlpool", a_to_b: true },
  });
  const malformed = Buffer.from(bool.data, "base64");
  malformed[13] = 2;
  assert.throws(
    () => validate(request({ ...bool, data: malformed.toString("base64") })),
    /boolean/,
  );
  const huge = Buffer.from(bytes);
  huge.writeUInt32LE(0xffffffff, 8);
  assert.throws(
    () => validate(request({ ...instruction, data: huge.toString("base64") })),
    /length exceeds/,
  );
});
test("quote minimum and settlement substitutions cannot be concealed by correct JSON", () => {
  const instruction = testJupiterInstruction(accounts);
  assert.throws(
    () => validate(request(instruction, { minimumOutputAmount: 989999n })),
    /minimum output/,
  );
  const wrong = {
    ...instruction,
    accounts: instruction.accounts.map((a) => ({ ...a })),
  };
  wrong.accounts[1].pubkey = JUPITER_SWAP_PROGRAM;
  assert.throws(
    () =>
      validate(
        request(wrong, {
          settlement: {
            signer: accounts.signer,
            sourceTokenAccount: accounts.source,
            destinationTokenAccount: accounts.destination,
            inputMint: accounts.inputMint,
            outputMint: accounts.outputMint,
          },
        }),
      ),
    /settlement/,
  );
});
