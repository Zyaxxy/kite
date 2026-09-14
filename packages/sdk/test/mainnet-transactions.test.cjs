const test = require("node:test");
const assert = require("node:assert/strict");
const {
  Keypair,
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  VersionedTransaction,
  TransactionMessage,
  ComputeBudgetProgram,
} = require("@solana/web3.js");
const sdk = require("../dist");
const key = () => Keypair.generate().publicKey.toBase58();

test("V1-only creation rejects missing capability and never splits orders", async () => {
  const payer = key(),
    blockhash = key();
  const instructions = [
    new TransactionInstruction({
      programId: SystemProgram.programId,
      keys: [],
      data: Buffer.alloc(1300),
    }),
  ];
  await assert.rejects(
    sdk.composeMainnetTransaction({
      payer,
      blockhash,
      lastValidBlockHeight: 10,
      instructions,
      allowV1: false,
    }),
    /V1 transactions require/,
  );
  const v1 = await sdk.composeMainnetTransaction({
    payer,
    blockhash,
    lastValidBlockHeight: 10,
    instructions,
    allowV1: true,
  });
  assert.equal(v1.transactionVersion, 1);
  assert.ok(v1.serializedBytes <= 4096);
  const decoded = await sdk.inspectWalletTransaction(v1.transaction);
  assert.equal(decoded.message.version, 1);
  assert.deepEqual(Object.keys(decoded.transaction.signatures), [payer]);
});
test("V1 still refuses more than 64 accounts and additional signers", async () => {
  const payer = key(),
    blockhash = key();
  const ix = new TransactionInstruction({
    programId: SystemProgram.programId,
    keys: Array.from({ length: 64 }, () => ({
      pubkey: new PublicKey(key()),
      isSigner: false,
      isWritable: true,
    })),
    data: Buffer.alloc(0),
  });
  await assert.rejects(
    sdk.composeMainnetTransaction({
      payer,
      blockhash,
      lastValidBlockHeight: 1,
      instructions: [ix],
      allowV1: true,
    }),
    /64-account/,
  );
  ix.keys = [
    { pubkey: new PublicKey(key()), isSigner: true, isWritable: true },
  ];
  await assert.rejects(
    sdk.composeMainnetTransaction({
      payer,
      blockhash,
      lastValidBlockHeight: 1,
      instructions: [ix],
      allowV1: true,
    }),
    /signer/,
  );
});
test("even compact orders use V1 with explicit resource budgets", async () => {
  const owner = Keypair.generate();
  const built = await sdk.composeMainnetTransaction({
    payer: owner.publicKey.toBase58(),
    blockhash: key(),
    lastValidBlockHeight: 1,
    instructions: [
      SystemProgram.transfer({
        fromPubkey: owner.publicKey,
        toPubkey: new PublicKey(key()),
        lamports: 1,
      }),
    ],
    allowV1: true,
    computeUnitLimit: 100_000,
    loadedAccountsDataSizeLimit: 131072,
    priorityFeeLamports: 5000,
  });
  assert.equal(built.transactionVersion, 1);
  const { message } = await sdk.inspectWalletTransaction(built.transaction);
  assert.equal(message.version, 1);
  const config =
    require("@solana/kit-v1").decompileTransactionMessage(message).config;
  assert.equal(config.computeUnitLimit, 100_000);
  assert.equal(config.loadedAccountsDataSizeLimit, 131072);
  assert.equal(config.priorityFeeLamports, 5000n);
  assert.equal(message.addressTableLookups, undefined);
  await assert.rejects(
    sdk.walletTransactionSignature(built.transaction),
    /did not sign/,
  );
});
test("old v0 transaction reading and explorer signatures remain supported", async () => {
  const owner = Keypair.generate();
  const transaction = new VersionedTransaction(
    new TransactionMessage({
      payerKey: owner.publicKey,
      recentBlockhash: key(),
      instructions: [
        SystemProgram.transfer({
          fromPubkey: owner.publicKey,
          toPubkey: new PublicKey(key()),
          lamports: 1,
        }),
      ],
    }).compileToV0Message(),
  );
  transaction.sign([owner]);
  const encoded = Buffer.from(transaction.serialize()).toString("base64");
  assert.equal(
    (await sdk.inspectWalletTransaction(encoded)).message.version,
    0,
  );
  assert.match(
    await sdk.walletTransactionSignature(encoded),
    /^[1-9A-HJ-NP-Za-km-z]{80,90}$/,
  );
});
test("V1 rejects no-op compute instructions, oversized payloads and invalid limits", async () => {
  const params = {
    payer: key(),
    blockhash: key(),
    lastValidBlockHeight: 1,
    allowV1: true,
  };
  await assert.rejects(
    sdk.composeMainnetTransaction({
      ...params,
      instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1 })],
    }),
    /message config/,
  );
  await assert.rejects(
    sdk.composeMainnetTransaction({
      ...params,
      instructions: [
        new TransactionInstruction({
          programId: SystemProgram.programId,
          keys: [],
          data: Buffer.alloc(4096),
        }),
      ],
    }),
    /size limit/,
  );
  for (const limits of [
    { computeUnitLimit: 0 },
    { computeUnitLimit: 1_400_001 },
    { loadedAccountsDataSizeLimit: 0 },
    { priorityFeeLamports: 100_001 },
  ])
    await assert.rejects(
      sdk.composeMainnetTransaction({ ...params, ...limits, instructions: [] }),
      /budget|fee limit/,
    );
});
test("official recurring setup contains only official instructions and the owner signer", async () => {
  const owner = key(),
    buyer = key(),
    mint = key();
  const built = await sdk.buildRecurringPaymentInstructions({
    owner,
    buyer,
    mint,
    tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    amount: 100n,
    periodSeconds: 86400,
    periods: 3,
    nonce: 42n,
    nowSeconds: 1000,
    initializeAuthority: true,
  });
  assert.equal(built.instructions.length, 2);
  assert.ok(
    built.instructions.every(
      (ix) => ix.programId.toBase58() === sdk.MAINNET_SUBSCRIPTIONS_PROGRAM,
    ),
  );
  assert.ok(
    built.instructions.every((ix) =>
      ix.keys
        .filter((k) => k.isSigner)
        .every((k) => k.pubkey.toBase58() === owner),
    ),
  );
  assert.equal(built.payment.expiresAt, 260200);
  assert.equal(built.payment.startsAt, 0);
  const revoke = await sdk.buildRevokeRecurringInstruction(
    owner,
    built.payment.address,
    owner,
  );
  assert.equal(revoke.programId.toBase58(), sdk.MAINNET_SUBSCRIPTIONS_PROGRAM);
  assert.ok(
    revoke.keys.some(
      (k) => k.pubkey.toBase58() === built.payment.address && k.isWritable,
    ),
  );
});
test("recurring limits reject infinite, oversized and invalid schedules", () => {
  for (const [amount, interval, periods] of [
    [0n, 86400, 3],
    [2n ** 64n, 86400, 3],
    [1n, 3599, 1],
    [1n, 86400, 0],
    [1n, 2592000, 13],
    [1n, NaN, 1],
  ])
    assert.throws(() => sdk.validateRecurringTerms(amount, interval, periods));
  sdk.validateRecurringTerms(1n, 86400, 365);
});
test("collection does not backfill missed periods or run after hard expiry", () => {
  const p = {
    amountPerPeriod: "100",
    pulledInPeriod: "60",
    periodSeconds: 3600,
    currentPeriodStartedAt: 1000,
    expiresAt: 20000,
  };
  assert.deepEqual(sdk.recurringRemaining(p, 2000), {
    amount: 40n,
    periodStartedAt: 1000,
  });
  assert.deepEqual(sdk.recurringRemaining(p, 10000), {
    amount: 100n,
    periodStartedAt: 8200,
  });
  assert.equal(sdk.recurringRemaining(p, 999).amount, 0n);
  assert.equal(sdk.recurringRemaining(p, 20000).amount, 0n);
});
