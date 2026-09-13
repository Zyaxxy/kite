const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { Keypair } = require('@solana/web3.js');
const { validateSipTerms, createSipDelegationInstruction, cancelSipInstruction, deriveSipAddress } = require('../dist/subscriptions/delegation');
const { buildSipExecutionTransaction } = require('../dist/subscriptions/crank');
const key = () => Keypair.generate().publicKey;
const terms = { amountPerCycle: 10n, minimumOutput: 1n, intervalSeconds: 60n, firstExecutionAt: 100n, expiresAt: 1000n, maxCycles: 2 };
const sip = () => ({ programId: key(), owner: key(), planId: 5n, inputMint: key(), outputMint: key(), inputAccount: key(), outputAccount: key() });

test('delegated SIP terms require positive finite allowance, floor and dates', () => {
  assert.equal(validateSipTerms(terms, 100n), 20n);
  assert.throws(() => validateSipTerms({...terms, maxCycles:0},100n));
  assert.throws(() => validateSipTerms({...terms, amountPerCycle:(1n<<64n)-1n},100n), /allowance/);
  assert.throws(() => validateSipTerms({...terms, minimumOutput:0n},100n));
  assert.throws(() => validateSipTerms({...terms, firstExecutionAt:99n},100n));
  assert.throws(() => validateSipTerms({...terms, intervalSeconds:59n},100n));
});
test('SIP builders encode Anchor discriminators and derive owner-bound PDA', () => {
  const params = sip();
  const create = createSipDelegationInstruction({...params, terms, nowSeconds:100n});
  assert.deepEqual(create.data.subarray(0,8),createHash('sha256').update('global:create_sip').digest().subarray(0,8));
  assert.equal(create.data.readBigUInt64LE(8),5n);
  assert.equal(create.data.readBigUInt64LE(16),10n);
  assert.equal(create.data.readUInt32LE(56),2);
  assert.ok(create.keys[0].pubkey.equals(deriveSipAddress(params.programId, params.owner, 5n)));
  assert.ok(!create.keys[0].pubkey.equals(deriveSipAddress(params.programId, key(), 5n)));
  assert.equal(create.keys.filter(x => x.isSigner).length,1);
  const cancel = cancelSipInstruction(params);
  assert.deepEqual(cancel.data,createHash('sha256').update('global:cancel_sip').digest().subarray(0,8));
  const execute = buildSipExecutionTransaction({...params,executor:key(),executorInputAccount:key(),executorOutputAccount:key(),outputAmount:2n,recentBlockhash:key().toBase58()});
  assert.deepEqual(execute.instructions[0].data.subarray(0,8),createHash('sha256').update('global:execute_sip').digest().subarray(0,8));
});
