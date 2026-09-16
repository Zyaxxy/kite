const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { Keypair, PublicKey, SystemProgram } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } = require('@solana/spl-token');
const subscriptions = require('@solana/subscriptions');
const { address, createNoopSigner } = require('@solana/kit');
const guard = require('../dist/guard/devnet.js');
const { KITE_GUARD_PROGRAM_ID } = require('../dist/guard/client.js');
const { composeV1Transaction, inspectWalletTransaction } = require('../dist/basket/mainnet.js');
const { DEVNET_RECURRING_BASKETS } = require('../dist/devnet-xstocks.js');

// Synthetic local fixtures only: these addresses do not describe deployed pools or mints.
const digest = (label) => createHash('sha256').update(`kite-devnet-test-fixture:${label}`).digest();
const fixtureKey = (label) => new PublicKey(digest(label)).toBase58();
const wallet = (label) => Keypair.fromSeed(digest(label)).publicKey.toBase58();
const discriminator = (name) => createHash('sha256').update(name).digest().subarray(0, 8);
const owner = wallet('owner');
const feePayer = wallet('fee-payer');
const fundingMint = fixtureKey('KUSD');
const ownerAta = (mint, authority = owner) => getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(authority), true, TOKEN_PROGRAM_ID).toBase58();
const kitInstruction = (ix) => ({ programAddress: ix.programId.toBase58(), data: new Uint8Array(ix.data), accounts: ix.keys.map((entry) => ({ address: entry.pubkey.toBase58(), role: (entry.isSigner ? 2 : 0) + (entry.isWritable ? 1 : 0) })) });
const metas = (ix) => ix.keys.map(({ pubkey, isSigner, isWritable }) => ({ address: pubkey.toBase58(), isSigner, isWritable }));

function fixturePool(symbol) {
  return {
    pool: fixtureKey(`pool:${symbol}`), ammConfig: fixtureKey('shared-cpmm-config'),
    inputVault: fixtureKey(`input-vault:${symbol}`), outputVault: fixtureKey(`output-vault:${symbol}`),
    observation: fixtureKey(`observation:${symbol}`), fundingMint, outputMint: fixtureKey(symbol),
    inputFees: 0n, outputFees: 0n, openTime: 1n, swapsEnabled: true, creatorFeeEnabled: false,
  };
}
function createParams(symbols = ['AAPL'], overrides = {}) {
  const count = symbols.length;
  const pools = symbols.map(fixturePool);
  return {
    owner, fundingMint, nonce: 77n, fundingAmount: 100_000_007n, periodSeconds: 60n,
    startsAt: 1_800_000_000n, expiresAt: 1_800_000_180n, periods: 3, initializeAuthority: true,
    outputs: symbols.map((symbol, index) => ({ mint: fixtureKey(symbol), weightBps: Math.floor(10000 / count) + (index < 10000 % count ? 1 : 0), pool: overrides.devnetMock ? PublicKey.default.toBase58() : pools[index].pool, minimumAmountOut: 100n + BigInt(index) })),
    pools, ...overrides,
  };
}
function integer(value, bytes, signed = false) {
  const out = Buffer.alloc(bytes);
  if (bytes === 8) signed ? out.writeBigInt64LE(value) : out.writeBigUInt64LE(value);
  else if (bytes === 4) out.writeUInt32LE(value);
  else out.writeUInt16LE(value);
  return out;
}
const publicKeyBytes = (key) => new PublicKey(key).toBuffer();
function encodeOutputs(outputs) {
  return Buffer.concat([
    integer(outputs.length, 4),
    ...outputs.map((output) =>
      Buffer.concat([
        publicKeyBytes(output.mint),
        integer(output.weightBps, 2),
        integer(output.minimumAmountOut, 8),
      ]),
    ),
  ]);
}
// Borsh fixture follows Rust Plan field order and allocated 8 + Plan::MAX_SIZE (1045) space.
function encodeRustPlan(plan) {
  const value = Buffer.concat([
    discriminator('account:Plan'),
    Buffer.from([2]),
    Buffer.from([plan.devnetMock ? 1 : 0]),
    publicKeyBytes(plan.owner),
    publicKeyBytes(plan.fundingMint),
    integer(plan.nonce, 8),
    integer(plan.fundingAmount, 8),
    integer(plan.periodSeconds, 8),
    integer(plan.startsAt, 8, true),
    integer(plan.expiresAt, 8, true),
    integer(plan.periods, 2),
    integer(plan.executedPeriods, 2),
    integer(plan.lastExecutedPeriod, 2),
    integer(plan.lastExecutedAt, 8, true),
    publicKeyBytes(plan.subscriptionAuthority),
    publicKeyBytes(plan.recurringDelegation),
    integer(plan.subscriptionInitId, 8, true),
    Buffer.from([plan.bump]),
    encodeOutputs(plan.outputs),
  ]);
  const allocated = Buffer.alloc(1045);
  value.copy(allocated);
  return allocated;
}

// Compare PDA helpers to the installed official client, not another copy of the seeds.
test('Guard subscription authority, delegation, and event PDAs match official Subscriptions 0.5', async () => {
  const params = createParams();
  const [plan] = guard.findGuardPlanV2Pda(owner, fundingMint, params.nonce);
  const [officialAuthority] = await subscriptions.findSubscriptionAuthorityPda({ user: address(owner), tokenMint: address(fundingMint) });
  const [officialDelegation] = await subscriptions.findRecurringDelegationPda({ subscriptionAuthority: officialAuthority, delegator: address(owner), delegatee: address(plan.toBase58()), nonce: params.nonce });
  const [officialEvent] = await subscriptions.findEventAuthorityPda();
  assert.equal(guard.guardSubscriptionAuthority(owner, fundingMint).toBase58(), officialAuthority);
  assert.equal(guard.guardRecurringDelegation(owner, fundingMint, params.nonce).toBase58(), officialDelegation);
  assert.equal(guard.subscriptionsEventAuthority().toBase58(), officialEvent);
  assert.notEqual(guard.findGuardPlanV2Pda(owner, fundingMint, params.nonce + 1n)[0].toBase58(), plan.toBase58());
});

test('create binds the official delegation to the plan PDA and only requires the owner signer', async () => {
  const params = createParams(['AAPL', 'MSFT']);
  const { instructions, plan } = await guard.buildGuardCreateInstructions(params);
  const official = instructions.filter((ix) => ix.programId.toBase58() === subscriptions.PROGRAM_ID);
  assert.equal(official.length, 2);
  const init = subscriptions.parseInitSubscriptionAuthorityInstruction(kitInstruction(official[0]));
  assert.equal(init.accounts.owner.address, owner);
  assert.equal(init.accounts.subscriptionAuthority.address, plan.subscriptionAuthority);
  assert.equal(init.accounts.userAta.address, ownerAta(fundingMint));
  const delegation = subscriptions.parseCreateRecurringDelegationInstruction(kitInstruction(official[1]));
  assert.equal(delegation.accounts.delegator.address, owner);
  assert.equal(delegation.accounts.delegatee.address, plan.address);
  assert.equal(delegation.accounts.delegationAccount.address, plan.recurringDelegation);
  assert.equal(delegation.accounts.subscriptionAuthority.address, plan.subscriptionAuthority);
  assert.deepEqual(delegation.data.recurringDelegation, {
    nonce: params.nonce, amountPerPeriod: params.fundingAmount, periodLengthS: params.periodSeconds,
    startTs: params.startsAt, expiryTs: params.expiresAt, expectedSubscriptionAuthorityInitId: subscriptions.UNKNOWN_INIT_ID,
  });
  assert.ok(instructions.flatMap(metas).filter((meta) => meta.isSigner).every((meta) => meta.address === owner));
  assert.equal(instructions.filter((ix) => ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).length, 3);
  const planAta = instructions[0];
  assert.equal(planAta.keys[1].pubkey.toBase58(), ownerAta(fundingMint, plan.address));
  assert.equal(planAta.keys[2].pubkey.toBase58(), plan.address);
  assert.equal(planAta.data[0], 1); // idempotent ATA creation
});

test('existing authority setup pins its observed init generation and does not reinitialize it', async () => {
  const params = createParams(['AAPL'], { initializeAuthority: false, expectedInitId: 123456n });
  const built = await guard.buildGuardCreateInstructions(params);
  const official = built.instructions.filter((ix) => ix.programId.toBase58() === subscriptions.PROGRAM_ID);
  assert.equal(official.length, 1);
  assert.equal(subscriptions.getCreateRecurringDelegationInstructionDataDecoder().decode(official[0].data).recurringDelegation.expectedSubscriptionAuthorityInitId, 123456n);
  await assert.rejects(guard.buildGuardCreateInstructions({ ...params, expectedInitId: undefined }), /generation/);
});

test('Guard create data and account prefix match the Rust ABI', async () => {
  const params = createParams(['AAPL', 'NVDA']);
  const { instructions, plan } = await guard.buildGuardCreateInstructions(params);
  const create = instructions.at(-1);
  assert.equal(create.programId.toBase58(), KITE_GUARD_PROGRAM_ID.toBase58());
  assert.deepEqual(create.data, Buffer.concat([
    discriminator('global:create_plan'), integer(params.nonce, 8), integer(params.fundingAmount, 8), integer(params.periodSeconds, 8),
    integer(params.startsAt, 8, true), integer(params.expiresAt, 8, true), integer(params.periods, 2), Buffer.from([0]), encodeOutputs(params.outputs),
  ]));
  assert.deepEqual(metas(create).slice(0, 8).map((meta) => meta.address), [owner, fundingMint, plan.subscriptionAuthority, plan.recurringDelegation, plan.address, ownerAta(fundingMint, plan.address), SystemProgram.programId.toBase58(), TOKEN_PROGRAM_ID.toBase58()]);
});

test('collect supplies every official CPI account without requiring a keeper token authority', async () => {
  const params = createParams(['AAPL', 'MSFT']);
  const { plan } = await guard.buildGuardCreateInstructions(params);
  const collect = guard.buildGuardCollectInstructions(plan, params.pools, feePayer, 0)[0];
  assert.deepEqual(collect.data, Buffer.concat([discriminator('global:execute_swap'), integer(0, 2)]));
  assert.deepEqual(metas(collect).filter((meta) => meta.isSigner).map((meta) => meta.address), [feePayer]);
  const transfer = await subscriptions.getTransferRecurringOverlayInstructionAsync({
    amount: plan.fundingAmount, delegatee: createNoopSigner(address(plan.address)), delegationPda: address(plan.recurringDelegation),
    delegator: address(plan.owner), delegatorAta: address(ownerAta(plan.fundingMint)), receiverAta: address(ownerAta(plan.fundingMint, plan.address)),
    tokenMint: address(plan.fundingMint), tokenProgram: address(TOKEN_PROGRAM_ID.toBase58()),
  });
  const available = new Map(metas(collect).map((meta) => [meta.address, meta]));
  for (const account of transfer.accounts) {
    assert.ok(available.has(account.address), `CPI account ${account.address} must be supplied`);
    if ((account.role & 1) !== 0) assert.equal(available.get(account.address).isWritable, true);
    if ((account.role & 2) !== 0) assert.equal(account.address, plan.address, 'the PDA signs only within the Guard CPI');
  }
  assert.equal(collect.keys[9].pubkey.toBase58(), guard.guardMockMintAuthority().toBase58());
});

test('close recreates the owner funding ATA and preserves the recorded delegation rent recipient', async () => {
  const { plan } = await guard.buildGuardCreateInstructions(createParams());
  const rentPayer = wallet('rent-payer');
  const instructions = guard.buildGuardCloseInstructions(plan, rentPayer);
  assert.equal(instructions[0].programId.toBase58(), ASSOCIATED_TOKEN_PROGRAM_ID.toBase58());
  assert.equal(instructions[0].keys[1].pubkey.toBase58(), ownerAta(fundingMint));
  const close = instructions.at(-1);
  assert.deepEqual(close.data, discriminator('global:close_plan'));
  assert.equal(close.keys[3].pubkey.toBase58(), rentPayer);
  assert.ok(instructions.flatMap(metas).filter((meta) => meta.isSigner).every((meta) => meta.address === owner));
});

test('Rust Plan account fixtures decode all identity, schedule, execution, and basket fields', async () => {
  const { plan: preview } = await guard.buildGuardCreateInstructions(createParams(['AAPL', 'MSFT', 'NVDA'], { devnetMock: true }));
  const plan = { ...preview, subscriptionInitId: 987654321n, executedPeriods: 1, lastExecutedPeriod: 1, lastExecutedAt: preview.startsAt + 61n };
  const decoded = guard.decodeGuardPlanV2(encodeRustPlan(plan), plan.address);
  for (const field of ['address', 'version', 'owner', 'fundingMint', 'nonce', 'fundingAmount', 'periodSeconds', 'startsAt', 'expiresAt', 'periods', 'executedPeriods', 'lastExecutedPeriod', 'lastExecutedAt', 'subscriptionAuthority', 'recurringDelegation', 'subscriptionInitId', 'bump', 'outputs']) assert.deepEqual(decoded[field], plan[field], field);
  const bytes = encodeRustPlan(plan);
  assert.throws(() => guard.decodeGuardPlanV2(bytes.subarray(0, bytes.length - 1), plan.address), /version/);
  const legacy = Buffer.from(bytes); legacy[8] = 1;
  assert.throws(() => guard.decodeGuardPlanV2(legacy, plan.address), /version/);
  const badCount = Buffer.from(bytes); badCount.writeUInt32LE(21, 201);
  assert.throws(() => guard.decodeGuardPlanV2(badCount, plan.address), /basket size/);
  assert.throws(() => guard.decodeGuardPlanV2(bytes, fixtureKey('wrong-plan')), /identity/);
});

test('basket routes reject omitted, substituted, duplicate, default, and mismatched pools or mints', async () => {
  const params = createParams(['AAPL', 'MSFT']);
  const { plan } = await guard.buildGuardCreateInstructions(params);
  for (const pools of [
    [], [...params.pools].reverse(),
    [{ ...params.pools[0], fundingMint: fixtureKey('wrong-funding') }, params.pools[1]],
    [{ ...params.pools[0], outputMint: fixtureKey('wrong-output') }, params.pools[1]],
    [{ ...params.pools[0], pool: fixtureKey('wrong-pool') }, params.pools[1]],
  ]) assert.throws(() => guard.buildGuardCollectInstructions(plan, pools, feePayer, 0), /pool/i);
  for (const outputs of [
    [{ ...plan.outputs[0], pool: plan.outputs[1].pool }, plan.outputs[1]],
    [{ ...plan.outputs[0], pool: PublicKey.default.toBase58() }, plan.outputs[1]],
    [{ ...plan.outputs[0], mint: PublicKey.default.toBase58() }, plan.outputs[1]],
    [{ ...plan.outputs[0], minimumAmountOut: 0n }, plan.outputs[1]],
  ]) assert.throws(() => guard.validateGuardPlanV2({ ...plan, outputs }));
});

function encodePoolFixture(forward = true) {
  const pool = fixturePool('AAPL');
  const bytes = Buffer.alloc(637);
  discriminator('account:PoolState').copy(bytes);
  const pub = (offset, key) => publicKeyBytes(key).copy(bytes, offset);
  pub(8, pool.ammConfig); pub(72, forward ? pool.inputVault : pool.outputVault); pub(104, forward ? pool.outputVault : pool.inputVault);
  pub(168, forward ? pool.fundingMint : pool.outputMint); pub(200, forward ? pool.outputMint : pool.fundingMint);
  pub(232, TOKEN_PROGRAM_ID.toBase58()); pub(264, TOKEN_PROGRAM_ID.toBase58()); pub(296, pool.observation);
  for (const [offset, value] of [[341, 11n], [349, 13n], [357, 17n], [365, 19n], [373, 1000n], [397, 23n], [405, 29n]]) bytes.writeBigUInt64LE(value, offset);
  return { pool, bytes };
}

test('CPMM decoding identifies direction, excludes accrued fees, and rejects nonclassic or wrong-mint pools', () => {
  for (const forward of [true, false]) {
    const { pool, bytes } = encodePoolFixture(forward);
    const decoded = guard.decodeDevnetCpmmPool(bytes, pool.pool, fundingMint, pool.outputMint);
    assert.equal(decoded.inputVault, pool.inputVault);
    assert.equal(decoded.outputVault, pool.outputVault);
    assert.equal(decoded.inputFees, forward ? 51n : 61n);
    assert.equal(decoded.outputFees, forward ? 61n : 51n);
    assert.equal(decoded.openTime, 1000n);
    assert.equal(decoded.swapsEnabled, true);
    assert.throws(() => guard.decodeDevnetCpmmPool(bytes, pool.pool, fixtureKey('wrong-mint'), pool.outputMint), /mints/);
    const unsupported = Buffer.from(bytes); publicKeyBytes(TOKEN_2022_PROGRAM_ID.toBase58()).copy(unsupported, 232);
    assert.throws(() => guard.decodeDevnetCpmmPool(unsupported, pool.pool, fundingMint, pool.outputMint), /classic SPL/);
    const stopped = Buffer.from(bytes); stopped[329] = 4;
    assert.equal(guard.decodeDevnetCpmmPool(stopped, pool.pool, fundingMint, pool.outputMint).swapsEnabled, false);
  }
  const config = Buffer.alloc(236); discriminator('account:AmmConfig').copy(config); config.writeBigUInt64LE(3000n, 12);
  assert.equal(guard.decodeDevnetCpmmTradeFee(config), 3000n);
  config.writeBigUInt64LE(1_000_000n, 12);
  assert.throws(() => guard.decodeDevnetCpmmTradeFee(config), /fee/);
});

test('CPMM quote rounds input fee up, output down, and slippage down with exact integers', () => {
  const params = { pool: { ...fixturePool('AAPL'), inputFees: 17n, outputFees: 29n }, amountIn: 101n, inputVaultAmount: 1017n, outputVaultAmount: 2029n, tradeFeeRate: 3000n, slippageBps: 100, nowSeconds: 1000n };
  // 101 input - ceil(101*0.003)=100; floor(2000*100/1100)=181; floor(181*.99)=179.
  assert.deepEqual(guard.quoteDevnetCpmmExactIn(params), { amountOut: 181n, minimumAmountOut: 179n });
  assert.deepEqual(guard.quoteDevnetCpmmExactIn({ ...params, slippageBps: 0 }), { amountOut: 181n, minimumAmountOut: 181n });
  for (const invalid of [
    { amountIn: 0n }, { amountIn: 1n }, { amountIn: 1n << 64n }, { tradeFeeRate: -1n }, { tradeFeeRate: 1_000_000n },
    { slippageBps: -1 }, { slippageBps: 501 }, { slippageBps: 0.5 },
    { inputVaultAmount: 17n }, { outputVaultAmount: 29n },
    { pool: { ...params.pool, swapsEnabled: false } }, { pool: { ...params.pool, openTime: 1001n } },
    { pool: { ...params.pool, creatorFeeEnabled: true } },
  ]) assert.throws(() => guard.quoteDevnetCpmmExactIn({ ...params, ...invalid }));
});

test('cadence rejects early, replayed, expired, and completed installments without backfilling', async () => {
  const { plan } = await guard.buildGuardCreateInstructions(createParams());
  assert.throws(() => guard.guardDuePeriod(plan, plan.startsAt - 1n), /no installment/);
  assert.equal(guard.guardDuePeriod(plan, plan.startsAt), 0);
  assert.equal(guard.guardDuePeriod(plan, plan.startsAt + 59n), 0);
  assert.equal(guard.guardDuePeriod(plan, plan.startsAt + 60n), 1);
  assert.equal(guard.guardDuePeriod(plan, plan.expiresAt - 1n), 2);
  assert.throws(() => guard.guardDuePeriod(plan, plan.expiresAt), /no installment/);
  const afterFirst = { ...plan, executedPeriods: 1, lastExecutedPeriod: 0, lastExecutedAt: plan.startsAt + 1n };
  assert.throws(() => guard.guardDuePeriod(afterFirst, plan.startsAt + 59n), /already collected/);
  assert.equal(guard.guardDuePeriod(afterFirst, plan.startsAt + 120n), 2, 'missed period 1 is not backfilled');
  const completed = { ...plan, executedPeriods: 3, lastExecutedPeriod: 2, lastExecutedAt: plan.startsAt + 120n };
  assert.throws(() => guard.guardDuePeriod(completed, plan.startsAt + 150n), /no installment/);
  assert.throws(() => guard.validateGuardPlanV2({ ...plan, lastExecutedPeriod: 0 }), /Inconsistent/);
});

test('all 11 public baskets compose atomic create and collect V1 messages within account and byte limits', async (t) => {
  for (const basket of DEVNET_RECURRING_BASKETS) {
    const params = createParams(basket.underlyingSymbols);
    const { plan, instructions: create } = await guard.buildGuardCreateInstructions(params);
    const collect = guard.buildGuardCollectInstructions(plan, params.pools, feePayer, 0);
    for (const [action, payer, instructions] of [['create', owner, create], ['collect', feePayer, collect]]) {
      const accounts = new Set([payer, ...instructions.flatMap((ix) => [ix.programId.toBase58(), ...ix.keys.map((entry) => entry.pubkey.toBase58())])]);
      assert.ok(accounts.size <= 64, `${basket.ticker} ${action}: ${accounts.size} accounts`);
      const composed = await composeV1Transaction({ payer, blockhash: fixtureKey('blockhash'), lastValidBlockHeight: 100, allowV1: true, instructions });
      assert.ok(composed.serializedBytes <= 4096, `${basket.ticker} ${action}: ${composed.serializedBytes} bytes`);
      const decoded = await inspectWalletTransaction(composed.transaction);
      assert.equal(decoded.message.version, 1);
      assert.deepEqual(Object.keys(decoded.transaction.signatures), [payer]);
      assert.equal(decoded.transaction.signatures[payer], null, 'fixture remains unsigned');
      if (basket.ticker === 'SOL-MAG7') t.diagnostic(`MAG7 ${action}: ${accounts.size} accounts, ${composed.serializedBytes} unsigned serialized bytes`);
    }
  }
});
