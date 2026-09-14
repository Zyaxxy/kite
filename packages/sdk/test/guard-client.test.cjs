const assert = require("node:assert/strict");
const { test } = require("node:test");
const { PublicKey, Keypair } = require("@solana/web3.js");
const {
  KITE_GUARD_PROGRAM_ID,
  findPlanPda,
  validatePlanAllocations,
  validatePlanTerms,
} = require("../dist/index.js");

test("derives deterministic PDA using owner and funding mint", () => {
  const owner = Keypair.generate().publicKey;
  const mint = Keypair.generate().publicKey;

  const [pda1, bump1] = findPlanPda(owner, mint);
  const [pda2, bump2] = findPlanPda(owner.toBase58(), mint.toBase58());

  assert.equal(pda1.toBase58(), pda2.toBase58());
  assert.equal(bump1, bump2);
  assert.ok(pda1 instanceof PublicKey);
  assert.equal(typeof bump1, "number");
});

test("validates allocation weights must sum to 10,000 bps (100%)", () => {
  const mintA = Keypair.generate().publicKey.toBase58();
  const mintB = Keypair.generate().publicKey.toBase58();

  // Valid 60% / 40%
  const valid = validatePlanAllocations([
    { mint: mintA, weightBps: 6000 },
    { mint: mintB, weightBps: 4000 },
  ]);
  assert.equal(valid.valid, true);

  // Invalid: 50% + 40% = 90% (9000 bps)
  const invalidUnder = validatePlanAllocations([
    { mint: mintA, weightBps: 5000 },
    { mint: mintB, weightBps: 4000 },
  ]);
  assert.equal(invalidUnder.valid, false);
  assert.match(invalidUnder.error, /Total weights sum to 9000 bps/);

  // Invalid: zero weight
  const invalidZero = validatePlanAllocations([
    { mint: mintA, weightBps: 10000 },
    { mint: mintB, weightBps: 0 },
  ]);
  assert.equal(invalidZero.valid, false);

  // Invalid: empty outputs
  const invalidEmpty = validatePlanAllocations([]);
  assert.equal(invalidEmpty.valid, false);
});

test("enforces maximum asset count bound (<= 20 assets)", () => {
  const outputs = Array.from({ length: 21 }, () => ({
    mint: Keypair.generate().publicKey.toBase58(),
    weightBps: 476,
  }));
  const res = validatePlanAllocations(outputs);
  assert.equal(res.valid, false);
  assert.match(res.error, /exceeds maximum limit of 20 assets/);
});

test("validatePlanTerms rejects invalid funding amount and period intervals", () => {
  const owner = Keypair.generate().publicKey.toBase58();
  const mint = Keypair.generate().publicKey.toBase58();

  assert.throws(
    () =>
      validatePlanTerms({
        owner,
        fundingMint: mint,
        subscriptionAuthority: owner,
        fundingAmount: 0n,
        periodSeconds: 86400n,
        periods: 10,
        outputs: [{ mint, weightBps: 10000 }],
      }),
    /Funding amount must be greater than zero/,
  );

  assert.throws(
    () =>
      validatePlanTerms({
        owner,
        fundingMint: mint,
        subscriptionAuthority: owner,
        fundingAmount: 1000n,
        periodSeconds: 10n, // less than 60s
        periods: 10,
        outputs: [{ mint, weightBps: 10000 }],
      }),
    /Period interval must be at least 60 seconds/,
  );

  assert.throws(
    () =>
      validatePlanTerms({
        owner,
        fundingMint: mint,
        subscriptionAuthority: owner,
        fundingAmount: 1000n,
        periodSeconds: 86400n,
        periods: 0,
        outputs: [{ mint, weightBps: 10000 }],
      }),
    /Periods must be between 1 and 365/,
  );
});

test("rejects duplicate/invalid mints and non-integer allocations", () => {
  const mint = Keypair.generate().publicKey.toBase58();
  const other = Keypair.generate().publicKey.toBase58();
  for (const outputs of [
    [{ mint, weightBps: 5000 }, { mint, weightBps: 5000 }],
    [{ mint: "placeholder-mint", weightBps: 10000 }],
    [{ mint, weightBps: 5000.5 }, { mint: other, weightBps: 4999.5 }],
    [{ mint, weightBps: NaN }],
    [{ mint, weightBps: Infinity }],
  ]) assert.equal(validatePlanAllocations(outputs).valid, false);
});

test("bounds plan arithmetic and rejects self-funded output plans", () => {
  const owner = Keypair.generate().publicKey.toBase58();
  const fundingMint = Keypair.generate().publicKey.toBase58();
  const params = {
    owner, fundingMint, subscriptionAuthority: owner,
    fundingAmount: 1000000n, periodSeconds: 60n, periods: 10,
    outputs: [{ mint: Keypair.generate().publicKey.toBase58(), weightBps: 10000 }],
  };
  assert.doesNotThrow(() => validatePlanTerms(params));
  for (const override of [
    { fundingAmount: 1n << 64n }, { periodSeconds: 1n << 63n },
    { periods: 1.5 }, { periods: NaN }, { periods: Infinity },
    { periodSeconds: 86400n, periods: 366 },
    { outputs: [{ mint: fundingMint, weightBps: 10000 }] },
  ]) assert.throws(() => validatePlanTerms({ ...params, ...override }));
});

test("basket funding preserves exact units including large and uneven amounts", () => {
  const { allocateGuardFunding } = require("../dist/index.js");
  const outputs = [3334, 3333, 3333].map((weightBps) => ({
    mint: Keypair.generate().publicKey.toBase58(), weightBps,
  }));
  assert.deepEqual(allocateGuardFunding(10n, outputs), [4n, 3n, 3n]);
  const max = (1n << 64n) - 1n;
  for (const amount of [3n, 101n, 1000001n, max]) {
    const result = allocateGuardFunding(amount, outputs);
    assert.equal(result.reduce((sum, part) => sum + part, 0n), amount);
    assert.ok(result.every((part) => part > 0n));
    result.forEach((part, index) => {
      const ideal = amount * BigInt(outputs[index].weightBps);
      const difference = part * 10000n - ideal;
      assert.ok(difference > -10000n && difference < 10000n);
    });
  }
  assert.throws(() => allocateGuardFunding(2n, outputs), /every basket asset/);
});
