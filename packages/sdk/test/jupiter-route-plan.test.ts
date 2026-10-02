import assert from "node:assert/strict";
import test from "node:test";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ACCOUNT_SIZE,
  AccountType,
  ExtensionType,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  getJupiterIntermediateMints,
  getJupiterNativeTokenBalance,
  isClosedJupiterTokenAccount,
  validateJupiterIntermediateMint,
} from "../src/jupiter-route-plan";

const mint = (value: number) =>
  new PublicKey(new Uint8Array(32).fill(value)).toBase58();
const input = mint(1),
  output = mint(2),
  bridge = mint(3),
  alternate = mint(4),
  unrelated = mint(5);
const hop = (inputMint: unknown, outputMint: unknown) => ({
  swapInfo: { inputMint, outputMint },
});

test("direct routes have no intermediate mints", () => {
  assert.deepEqual(
    getJupiterIntermediateMints([hop(input, output)], input, output),
    new Set(),
  );
});

test("multi-hop routes return only the connected intermediate mints", () => {
  assert.deepEqual(
    getJupiterIntermediateMints(
      [hop(input, bridge), hop(bridge, alternate), hop(alternate, output)],
      input,
      output,
    ),
    new Set([bridge, alternate]),
  );
});

test("split routes may merge and list their steps out of order", () => {
  assert.deepEqual(
    getJupiterIntermediateMints(
      [
        hop(bridge, output),
        hop(input, alternate),
        hop(input, bridge),
        hop(alternate, bridge),
        hop(input, output),
      ],
      input,
      output,
    ),
    new Set([alternate, bridge]),
  );
});

test("missing and oversized route plans fail closed", () => {
  for (const plan of [
    undefined,
    null,
    [],
    {},
    "route",
    Array(65).fill(hop(input, output)),
  ])
    assert.throws(
      () => getJupiterIntermediateMints(plan, input, output),
      /route plan/,
    );
  const path = Array.from({ length: 65 }, (_, index) => mint(index + 1));
  const longestPlan = path
    .slice(1)
    .map((destination, index) => hop(path[index], destination));
  assert.equal(
    getJupiterIntermediateMints(longestPlan, path[0], path[64]).size,
    63,
  );
});

test("malformed steps and noncanonical public keys are rejected", () => {
  for (const step of [
    null,
    [],
    {},
    { swapInfo: null },
    { swapInfo: [] },
    hop(undefined, output),
    hop(input, 123),
    hop("not-a-public-key", output),
    hop(input, ` ${output}`),
    hop(`${input} `, output),
    hop("1".repeat(33), output),
  ])
    assert.throws(
      () => getJupiterIntermediateMints([step], input, output),
      /route plan/,
    );
});

test("same-mint hops and invalid endpoints are rejected", () => {
  assert.throws(
    () => getJupiterIntermediateMints([hop(input, input)], input, output),
    /same-mint/,
  );
  for (const endpoints of [
    ["invalid", output],
    [input, "invalid"],
    [input, input],
  ])
    assert.throws(
      () =>
        getJupiterIntermediateMints(
          [hop(input, output)],
          endpoints[0],
          endpoints[1],
        ),
      /route plan/,
    );
});

test("disconnected metadata cannot authorize an unrelated intermediate mint", () => {
  for (const plan of [
    [hop(input, output), hop(bridge, unrelated)],
    [hop(input, output), hop(bridge, unrelated), hop(unrelated, bridge)],
    [hop(input, bridge), hop(alternate, output)],
  ])
    assert.throws(
      () => getJupiterIntermediateMints(plan, input, output),
      /unrelated swap path/,
    );
});

test("each branch must both originate at input and reach output", () => {
  for (const extra of [hop(input, unrelated), hop(unrelated, output)])
    assert.throws(
      () =>
        getJupiterIntermediateMints([hop(input, output), extra], input, output),
      /unrelated swap path/,
    );
});

function mintAccount({
  owner = TOKEN_PROGRAM_ID.toBase58(),
  initialized = true,
  decimals = 6,
  extensions = [],
}: {
  owner?: string;
  initialized?: boolean;
  decimals?: number;
  extensions?: Array<{ type: number; data: Buffer }>;
} = {}) {
  const data = Buffer.alloc(
    extensions.length
      ? ACCOUNT_SIZE +
          1 +
          extensions.reduce(
            (size, extension) => size + 4 + extension.data.length,
            0,
          )
      : MINT_SIZE,
  );
  data[44] = decimals;
  data[45] = Number(initialized);
  if (extensions.length) data[ACCOUNT_SIZE] = AccountType.Mint;
  let offset = ACCOUNT_SIZE + 1;
  for (const extension of extensions) {
    data.writeUInt16LE(extension.type, offset);
    data.writeUInt16LE(extension.data.length, offset + 2);
    extension.data.copy(data, offset + 4);
    offset += 4 + extension.data.length;
  }
  return { owner, data, executable: false };
}

test("initialized plain legacy and Token-2022 mints return their verified program", () => {
  for (const owner of [
    TOKEN_PROGRAM_ID.toBase58(),
    TOKEN_2022_PROGRAM_ID.toBase58(),
  ])
    for (const decimals of [0, 6, 18])
      assert.equal(
        validateJupiterIntermediateMint(
          bridge,
          mintAccount({ owner, decimals }),
        ),
        owner,
      );
});

test("Token-2022 intermediate mints may contain inert metadata extensions", () => {
  const owner = TOKEN_2022_PROGRAM_ID.toBase58();
  const metadata = Buffer.alloc(80);
  new PublicKey(bridge).toBuffer().copy(metadata, 32);
  const pointer = Buffer.alloc(64);
  new PublicKey(bridge).toBuffer().copy(pointer, 32);
  const extensions = [
    { type: ExtensionType.MetadataPointer, data: pointer },
    { type: ExtensionType.TokenMetadata, data: metadata },
  ];
  for (const allowed of [extensions, [extensions[0]], [extensions[1]]])
    assert.equal(
      validateJupiterIntermediateMint(
        bridge,
        mintAccount({ owner, extensions: allowed }),
      ),
      owner,
    );
});

test("missing, truncated, uninitialized and wrong-owner intermediate mints fail closed", () => {
  for (const account of [
    null,
    { ...mintAccount(), data: Buffer.alloc(81) },
    mintAccount({ initialized: false }),
    mintAccount({ decimals: 19 }),
    mintAccount({ owner: input }),
    { ...mintAccount(), executable: true },
  ])
    assert.throws(
      () => validateJupiterIntermediateMint(bridge, account),
      /invalid or unsupported intermediate token mint/,
    );
});

test("transfer-affecting, unknown and malformed intermediate mint extensions are rejected", () => {
  const owner = TOKEN_2022_PROGRAM_ID.toBase58();
  for (const type of [
    ExtensionType.TransferFeeConfig,
    ExtensionType.TransferHook,
    ExtensionType.PermanentDelegate,
    ExtensionType.NonTransferable,
    ExtensionType.DefaultAccountState,
    ExtensionType.ConfidentialTransferMint,
    65535,
  ])
    assert.throws(
      () =>
        validateJupiterIntermediateMint(
          bridge,
          mintAccount({
            owner,
            extensions: [{ type, data: Buffer.alloc(64) }],
          }),
        ),
      /invalid or unsupported intermediate token mint/,
    );

  const pointer = {
    type: ExtensionType.MetadataPointer,
    data: Buffer.alloc(64),
  };
  const valid = mintAccount({ owner, extensions: [pointer] });
  const oversized = { ...valid, data: Buffer.from(valid.data) };
  oversized.data.writeUInt16LE(65, ACCOUNT_SIZE + 3);
  for (const account of [
    mintAccount({ extensions: [pointer] }),
    mintAccount({ owner, extensions: [pointer, pointer] }),
    mintAccount({
      owner,
      extensions: [
        { type: ExtensionType.TokenMetadata, data: Buffer.alloc(79) },
      ],
    }),
    { ...valid, data: valid.data.subarray(0, valid.data.length - 1) },
    { ...valid, data: Buffer.concat([valid.data, Buffer.from([1])]) },
    oversized,
  ])
    assert.throws(
      () => validateJupiterIntermediateMint(bridge, account),
      /invalid or unsupported intermediate token mint/,
    );
});

const closedAccount = {
  owner: SystemProgram.programId.toBase58(),
  data: ["", "base64"] as const,
  executable: false,
  lamports: 0,
};

test("missing and exact closed simulation accounts are recognized as zero balances", () => {
  assert.equal(isClosedJupiterTokenAccount(null), true);
  assert.equal(isClosedJupiterTokenAccount(closedAccount), true);
  assert.equal(
    isClosedJupiterTokenAccount({ ...closedAccount, data: ["", "base64"] }),
    true,
  );
});

const liveTokenData = Buffer.alloc(ACCOUNT_SIZE);
new PublicKey(bridge).toBuffer().copy(liveTokenData, 0);
new PublicKey(input).toBuffer().copy(liveTokenData, 32);
liveTokenData.writeBigUInt64LE(250n, 64);
liveTokenData[108] = 1;

for (const [name, account] of [
  [
    "positive legacy token balance",
    {
      ...closedAccount,
      owner: TOKEN_PROGRAM_ID.toBase58(),
      data: [liveTokenData.toString("base64"), "base64"] as const,
      lamports: 2039280,
    },
  ],
  [
    "positive Token-2022 balance",
    {
      ...closedAccount,
      owner: TOKEN_2022_PROGRAM_ID.toBase58(),
      data: [liveTokenData.toString("base64"), "base64"] as const,
      lamports: 2039280,
    },
  ],
  ["prefunded System account", { ...closedAccount, lamports: 1 }],
  [
    "zero-lamport token-owned account",
    { ...closedAccount, owner: TOKEN_PROGRAM_ID.toBase58() },
  ],
  ["unrelated owner", { ...closedAccount, owner: input }],
  [
    "noncanonical System owner",
    { ...closedAccount, owner: ` ${closedAccount.owner}` },
  ],
  ["executable account", { ...closedAccount, executable: true }],
  [
    "nonempty zero data",
    { ...closedAccount, data: ["AA==", "base64"] as const },
  ],
  [
    "nonempty token data",
    {
      ...closedAccount,
      data: [liveTokenData.toString("base64"), "base64"] as const,
    },
  ],
  ["negative lamports", { ...closedAccount, lamports: -1 }],
  ["negative-zero lamports", { ...closedAccount, lamports: -0 }],
  ["NaN lamports", { ...closedAccount, lamports: NaN }],
  ["infinite lamports", { ...closedAccount, lamports: Infinity }],
  ["fractional lamports", { ...closedAccount, lamports: 0.5 }],
  [
    "unsafe lamports",
    { ...closedAccount, lamports: Number.MAX_SAFE_INTEGER + 1 },
  ],
] as const) {
  test(`${name} is not a closed token account`, () => {
    assert.equal(isClosedJupiterTokenAccount(account), false);
  });
}

test("malformed closed-account fields are rejected without coercion", () => {
  for (const account of [
    undefined,
    [],
    {},
    "closed",
    { ...closedAccount, executable: 0 },
    { ...closedAccount, executable: undefined },
    { ...closedAccount, data: undefined },
    { ...closedAccount, data: null },
    { ...closedAccount, data: [] },
    { ...closedAccount, data: "" },
    { ...closedAccount, data: new Uint8Array() },
    { ...closedAccount, data: ["", "base58"] },
    { ...closedAccount, data: ["", "base64", "extra"] },
    { ...closedAccount, data: ["!!!!", "base64"] },
    { ...closedAccount, data: [" ", "base64"] },
    { ...closedAccount, data: { byteLength: 0 } },
    { ...closedAccount, lamports: "0" },
    { ...closedAccount, lamports: 0n },
    { ...closedAccount, lamports: null },
    { ...closedAccount, lamports: false },
  ])
    assert.equal(
      isClosedJupiterTokenAccount(
        account as Parameters<typeof isClosedJupiterTokenAccount>[0],
      ),
      false,
    );
});

function nativeAccount({
  amount = 250n,
  excessLamports = 250,
  reserve = 2039280n,
  nativeFlag = 1,
}: {
  amount?: bigint;
  excessLamports?: number;
  reserve?: bigint;
  nativeFlag?: number;
} = {}) {
  const data = Buffer.alloc(ACCOUNT_SIZE);
  data[108] = 1;
  data.writeBigUInt64LE(amount, 64);
  data.writeUInt32LE(nativeFlag, 109);
  data.writeBigUInt64LE(reserve, 113);
  return { data, lamports: Number(reserve) + excessLamports };
}

for (const [name, amount, excessLamports] of [
  ["synced WSOL", 250n, 250],
  ["unsynced WSOL with zero encoded amount", 0n, 250],
  ["partially synced WSOL", 100n, 250],
  ["reserve-only WSOL", 0n, 0],
] as const) {
  test(`${name} preserves all effective lamports above the native reserve`, () => {
    assert.equal(
      getJupiterNativeTokenBalance(nativeAccount({ amount, excessLamports })),
      BigInt(excessLamports),
    );
  });
}

test("the largest safely represented native account balance remains exact", () => {
  const account = nativeAccount({ amount: 0n });
  account.lamports = Number.MAX_SAFE_INTEGER;
  assert.equal(
    getJupiterNativeTokenBalance(account),
    BigInt(Number.MAX_SAFE_INTEGER) - 2039280n,
  );
});

for (const nativeFlag of [0, 2, 256, 0xffffffff]) {
  test(`native COption flag ${nativeFlag} is rejected`, () => {
    assert.throws(
      () => getJupiterNativeTokenBalance(nativeAccount({ nativeFlag })),
      /malformed native SOL token account/,
    );
  });
}

for (const [name, lamports] of [
  ["negative", -1],
  ["fractional", 2039280.5],
  ["NaN", NaN],
  ["infinite", Infinity],
  ["unsafe", Number.MAX_SAFE_INTEGER + 1],
  ["below reserve", 2039279],
] as const) {
  test(`${name} native lamports are rejected`, () => {
    assert.throws(
      () => getJupiterNativeTokenBalance({ ...nativeAccount(), lamports }),
      /malformed native SOL token account/,
    );
  });
}

test("encoded token amounts cannot exceed actual native balance", () => {
  assert.throws(
    () => getJupiterNativeTokenBalance(nativeAccount({ amount: 251n })),
    /malformed native SOL token account/,
  );
  const account = nativeAccount({ amount: 0n });
  account.data.writeBigUInt64LE(1n << 63n, 113);
  assert.throws(
    () => getJupiterNativeTokenBalance(account),
    /malformed native SOL token account/,
  );
});

test("truncated and malformed native account inputs fail descriptively", () => {
  const valid = nativeAccount();
  for (const account of [
    null,
    undefined,
    {},
    { ...valid, data: valid.data.subarray(0, 164) },
    { ...valid, data: valid.data.subarray(0, 120) },
    { ...valid, data: new Uint8Array() },
    { ...valid, data: Array(165).fill(0) },
    { ...valid, data: "" },
    { ...valid, lamports: "2039530" },
    { ...valid, lamports: 2039530n },
  ])
    assert.throws(
      () =>
        getJupiterNativeTokenBalance(
          account as Parameters<typeof getJupiterNativeTokenBalance>[0],
        ),
      /malformed native SOL token account/,
    );
});
