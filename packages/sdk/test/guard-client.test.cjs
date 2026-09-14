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
