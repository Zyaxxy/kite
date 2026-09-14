const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { LiteSVM, FailedTransactionMetadata, Clock } = require('litesvm');
const { PublicKey, Keypair, TransactionMessage, VersionedTransaction, ComputeBudgetProgram, SystemProgram } = require('@solana/web3.js');
const { AccountLayout, MintLayout, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } = require('@solana/spl-token');
const { BorshAccountsCoder, BN } = require('@anchor-lang/core');
const { convertIdlToCamelCase } = require('@anchor-lang/core/dist/cjs/idl.js');
const { getTransactionDecoder } = createRequire(require.resolve('litesvm'))('@solana/kit');
const sdk = require('../../sdk/dist/index.js');
const idl = require('../../sdk/src/guard/kite_guard.json');
const pinned = require('./fixtures/runtime-programs.json');
const programDir = process.env.KITE_TEST_PROGRAM_DIR || path.resolve(__dirname, '../target/test-programs');
const GUARD = sdk.KITE_GUARD_PROGRAM_ID;
const RAYDIUM = sdk.DEVNET_RAYDIUM_CPMM_PROGRAM;
const SUBSCRIPTIONS = new PublicKey(sdk.MAINNET_SUBSCRIPTIONS_PROGRAM);
const coder = new BorshAccountsCoder(convertIdlToCamelCase(idl));
const key = () => Keypair.generate().publicKey;
const asAta = (mint, owner) => getAssociatedTokenAddressSync(mint, owner, true);
const disc = name => crypto.createHash('sha256').update(name).digest().subarray(0, 8);

function setAccount(svm, address, owner, data) {
  svm.setAccount({ address: address.toBase58(), programAddress: owner.toBase58(), data, executable: false, lamports: svm.minimumBalanceForRentExemption(BigInt(data.length)), space: BigInt(data.length) });
}
function mintData(owner) {
  const data = Buffer.alloc(MintLayout.span);
  MintLayout.encode({ mintAuthorityOption: 1, mintAuthority: owner, supply: 10_000_000_000_000n, decimals: 6, isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: PublicKey.default }, data);
  return data;
}
function tokenData(mint, owner, amount, delegate) {
  const data = Buffer.alloc(AccountLayout.span);
  AccountLayout.encode({ mint, owner, amount, delegateOption: delegate ? 1 : 0, delegate: delegate || PublicKey.default, state: 1, isNativeOption: 0, isNative: 0n, delegatedAmount: delegate ? (1n << 64n) - 1n : 0n, closeAuthorityOption: 0, closeAuthority: PublicKey.default }, data);
  return data;
}
function accountData(svm, address) {
  const account = svm.getAccount(address.toBase58());
  assert.equal(account.exists, true, `Account missing: ${address}`);
  return Buffer.from(account.data);
}
function balance(svm, address) { return AccountLayout.decode(accountData(svm, address)).amount; }
function send(svm, instructions, signer) {
  const message = new TransactionMessage({ payerKey: signer.publicKey, recentBlockhash: svm.latestBlockhash(), instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ...instructions] }).compileToV0Message();
  const transaction = new VersionedTransaction(message); transaction.sign([signer]);
  return svm.sendTransaction(getTransactionDecoder().decode(transaction.serialize()));
}
function expectSuccess(result) { if (result instanceof FailedTransactionMetadata) throw new Error(result.toString() + '\n' + result.meta().prettyLogs()); }

async function fixture(minimumSecond = 1n) {
  const svm = new LiteSVM();
  for (const [name, record] of Object.entries(pinned.programs)) {
    const binary = fs.readFileSync(path.join(programDir, `${name}.so`));
    assert.equal(crypto.createHash('sha256').update(binary).digest('hex'), record.sha256, `${name} fixture checksum`);
    svm.addProgram(record.programId, binary);
  }
  svm.addProgramFromFile(GUARD.toBase58(), path.join(programDir, 'kite_guard.so'));
  svm.setClock(new Clock(100n, 0n, 0n, 0n, 1_000n));
  const owner = Keypair.generate(), feePayer = Keypair.generate();
  expectSuccess(svm.airdrop(owner.publicKey.toBase58(), 2_000_000_000n));
  expectSuccess(svm.airdrop(feePayer.publicKey.toBase58(), 2_000_000_000n));
  const mints = [key(), key(), key()].sort((a, b) => Buffer.compare(a.toBuffer(), b.toBuffer()));
  const fundingMint = mints[0], outputMints = mints.slice(1);
  for (const mint of mints) setAccount(svm, mint, TOKEN_PROGRAM_ID, mintData(owner.publicKey));
  const [planKey, bump] = sdk.findGuardPlanV2Pda(owner.publicKey, fundingMint, 42n);
  const authority = sdk.guardSubscriptionAuthority(owner.publicKey.toBase58(), fundingMint.toBase58());
  const delegation = sdk.guardRecurringDelegation(owner.publicKey.toBase58(), fundingMint.toBase58(), 42n);
  const source = asAta(fundingMint, owner.publicKey), staging = asAta(fundingMint, planKey);
  setAccount(svm, source, TOKEN_PROGRAM_ID, tokenData(fundingMint, owner.publicKey, 1_000_000_000n, authority));
  setAccount(svm, staging, TOKEN_PROGRAM_ID, tokenData(fundingMint, planKey, 7n));
  const authorityBytes = Buffer.alloc(106);
  authorityBytes[0] = 0; owner.publicKey.toBuffer().copy(authorityBytes, 1); fundingMint.toBuffer().copy(authorityBytes, 33); owner.publicKey.toBuffer().copy(authorityBytes, 65);
  authorityBytes[97] = PublicKey.findProgramAddressSync([Buffer.from('SubscriptionAuthority'), owner.publicKey.toBuffer(), fundingMint.toBuffer()], SUBSCRIPTIONS)[1];
  authorityBytes.writeBigInt64LE(100n, 98); setAccount(svm, authority, SUBSCRIPTIONS, authorityBytes);
  const delegationBytes = Buffer.alloc(211);
  delegationBytes[0] = 3; delegationBytes[1] = 1;
  delegationBytes[2] = PublicKey.findProgramAddressSync([Buffer.from('delegation'), authority.toBuffer(), owner.publicKey.toBuffer(), planKey.toBuffer(), Buffer.from([42,0,0,0,0,0,0,0])], SUBSCRIPTIONS)[1];
  owner.publicKey.toBuffer().copy(delegationBytes, 3); planKey.toBuffer().copy(delegationBytes, 35); owner.publicKey.toBuffer().copy(delegationBytes, 67);
  delegationBytes.writeBigInt64LE(100n, 99); authority.toBuffer().copy(delegationBytes, 107); fundingMint.toBuffer().copy(delegationBytes, 139);
  delegationBytes.writeBigInt64LE(1000n,171); delegationBytes.writeBigUInt64LE(60n,179); delegationBytes.writeBigInt64LE(1180n,187); delegationBytes.writeBigUInt64LE(100_000_000n,195);
  setAccount(svm, delegation, SUBSCRIPTIONS, delegationBytes);
  const ammConfig = key(), configBytes = Buffer.alloc(236); disc('account:AmmConfig').copy(configBytes);
  configBytes.writeBigUInt64LE(2500n,12); setAccount(svm, ammConfig, RAYDIUM, configBytes);
  const rayAuthority = sdk.raydiumDevnetAuthority();
  const rayBump = PublicKey.findProgramAddressSync([Buffer.from('vault_and_lp_mint_auth_seed')], RAYDIUM)[1];
  const pools = [], outputs = [];
  for (const [i, mint] of outputMints.entries()) {
    const pool = key(), inputVault = key(), outputVault = key(), observation = key();
    setAccount(svm, asAta(mint, owner.publicKey), TOKEN_PROGRAM_ID, tokenData(mint, owner.publicKey, 0n));
    setAccount(svm, inputVault, TOKEN_PROGRAM_ID, tokenData(fundingMint, rayAuthority, 1_000_000_000_000n));
    setAccount(svm, outputVault, TOKEN_PROGRAM_ID, tokenData(mint, rayAuthority, 1_000_000_000_000n));
    const poolBytes = Buffer.alloc(637); disc('account:PoolState').copy(poolBytes);
    for (const [offset, address] of [[8,ammConfig],[40,owner.publicKey],[72,inputVault],[104,outputVault],[136,key()],[168,fundingMint],[200,mint],[232,TOKEN_PROGRAM_ID],[264,TOKEN_PROGRAM_ID],[296,observation]]) address.toBuffer().copy(poolBytes,offset);
    poolBytes[328]=rayBump; poolBytes[330]=6; poolBytes[331]=6; poolBytes[332]=6; poolBytes.writeBigUInt64LE(1_000_000_000_000n,333);
    setAccount(svm,pool,RAYDIUM,poolBytes);
    const observationBytes=Buffer.alloc(4075); disc('account:ObservationState').copy(observationBytes); pool.toBuffer().copy(observationBytes,11); setAccount(svm,observation,RAYDIUM,observationBytes);
    pools.push(sdk.decodeDevnetCpmmPool(poolBytes,pool.toBase58(),fundingMint.toBase58(),mint.toBase58()));
    outputs.push({ mint:mint.toBase58(),weightBps:5000,pool:pool.toBase58(),minimumAmountOut:i===1?minimumSecond:1n });
  }
  const plan={address:planKey.toBase58(),version:2,owner:owner.publicKey.toBase58(),fundingMint:fundingMint.toBase58(),nonce:42n,fundingAmount:100_000_000n,periodSeconds:60n,startsAt:1000n,expiresAt:1180n,periods:3,executedPeriods:0,lastExecutedPeriod:65535,lastExecutedAt:0n,subscriptionAuthority:authority.toBase58(),recurringDelegation:delegation.toBase58(),subscriptionInitId:100n,bump,outputs};
  const chainPlan={...plan,owner:owner.publicKey,fundingMint,nonce:new BN(42),fundingAmount:new BN(100_000_000),periodSeconds:new BN(60),startsAt:new BN(1000),expiresAt:new BN(1180),lastExecutedAt:new BN(0),subscriptionAuthority:authority,recurringDelegation:delegation,subscriptionInitId:new BN(100),outputs:outputs.map(o=>({...o,mint:new PublicKey(o.mint),pool:new PublicKey(o.pool),minimumAmountOut:new BN(o.minimumAmountOut.toString())}))};
  const encoded=await coder.encode('planV2',chainPlan); const allocated=Buffer.alloc(1684); encoded.copy(allocated); setAccount(svm,planKey,GUARD,allocated);
  return {svm,owner,feePayer,plan,planKey,fundingMint,outputMints,source,staging,delegation,authority,pools};
}

// Fixtures are explicit local accounts; BOTH downstream programs execute their pinned real SBF binaries.
test('two-asset installment performs real Subscriptions and Raydium CPIs with only a fee-payer signature', async () => {
  const f=await fixture();
  const before=balance(f.svm,f.source);
  const result=send(f.svm,sdk.buildGuardCollectInstructions(f.plan,f.pools,f.feePayer.publicKey.toBase58(),0),f.feePayer);
  expectSuccess(result);
  assert.equal(before-balance(f.svm,f.source),100_000_000n);
  assert.equal(balance(f.svm,f.staging),7n,'incidental donations remain untouched');
  for(const mint of f.outputMints) assert.ok(balance(f.svm,asAta(mint,f.owner.publicKey))>0n);
  const decoded=sdk.decodeGuardPlanV2(accountData(f.svm,f.planKey),f.plan.address);
  assert.equal(decoded.executedPeriods,1); assert.equal(decoded.lastExecutedPeriod,0);
  assert.equal(accountData(f.svm,f.delegation).readBigUInt64LE(203),100_000_000n);
  assert.ok(result.logs().some(l=>l.includes(`Program ${SUBSCRIPTIONS} invoke [2]`)));
  assert.equal(result.logs().filter(l=>l.includes(`Program ${RAYDIUM} invoke [2]`)).length,2);
  f.svm.expireBlockhash();
  const replay=send(f.svm,sdk.buildGuardCollectInstructions(decoded,f.pools,f.feePayer.publicKey.toBase58(),0),f.feePayer);
  assert.ok(replay instanceof FailedTransactionMetadata);
  assert.equal(balance(f.svm,f.source),before-100_000_000n);
});

test('a later-leg minimum-output failure rolls back collection, earlier delivery, pools, delegation and counters', async () => {
  const f=await fixture((1n<<64n)-1n);
  const addresses=[f.source,f.staging,f.planKey,f.delegation,...f.outputMints.map(m=>asAta(m,f.owner.publicKey)),...f.pools.flatMap(p=>[p.pool,p.inputVault,p.outputVault,p.observation].map(a=>new PublicKey(a)))];
  const before=addresses.map(a=>accountData(f.svm,a));
  const result=send(f.svm,sdk.buildGuardCollectInstructions(f.plan,f.pools,f.feePayer.publicKey.toBase58(),0),f.feePayer);
  assert.ok(result instanceof FailedTransactionMetadata,result.toString());
  const logs=result.meta().logs();
  assert.equal(logs.filter(l=>l.includes(`Program ${RAYDIUM} invoke [2]`)).length,2,logs.join('\n'));
  assert.ok(logs.some(l=>l.includes('ExceededSlippage')),logs.join('\n'));
  for(const [i,address]of addresses.entries()) assert.deepEqual(accountData(f.svm,address),before[i],`Rollback failed: ${address}`);
});

test('owner cancellation revokes the actual delegation, returns donations and closes rent accounts', async () => {
  const f=await fixture();
  const before=balance(f.svm,f.source);
  const result=send(f.svm,sdk.buildGuardCloseInstructions(f.plan,f.owner.publicKey.toBase58()),f.owner);
  expectSuccess(result);
  assert.equal(balance(f.svm,f.source),before+7n);
  assert.equal(f.svm.getAccount(f.plan.address).exists,false);
  assert.equal(f.svm.getAccount(f.staging.toBase58()).exists,false);
  assert.equal(f.svm.getAccount(f.delegation.toBase58()).exists,false);
});


test('SDK creation initializes the real subscription authority and grant, then admits and executes a stock plan', async () => {
  const f = await fixture();
  // Existing fixture plan 42 is independent; nonce 99 starts without a plan, staging ATA or grant.
  f.svm.setAccount({ address: f.authority.toBase58(), programAddress: SystemProgram.programId.toBase58(), data: Buffer.alloc(0), executable: false, lamports: 0n, space: 0n });
  assert.equal(f.svm.getAccount(f.authority.toBase58()).exists, false);
  f.svm.setClock(new Clock(101n, 0n, 0n, 0n, 1_000n));
  setAccount(f.svm, f.source, TOKEN_PROGRAM_ID, tokenData(f.fundingMint, f.owner.publicKey, 1_000_000_000n));
  const built = await sdk.buildGuardCreateInstructions({ owner: f.plan.owner, fundingMint: f.plan.fundingMint, nonce: 99n, fundingAmount: f.plan.fundingAmount, periodSeconds: 60n, startsAt: 1000n, expiresAt: 1180n, periods: 3, outputs: [{ ...f.plan.outputs[0], weightBps: 10000 }], pools: [f.pools[0]], initializeAuthority: true });
  const created = send(f.svm, built.instructions, f.owner);
  expectSuccess(created);
  const decoded = sdk.decodeGuardPlanV2(accountData(f.svm, new PublicKey(built.plan.address)), built.plan.address);
  assert.equal(decoded.nonce, 99n);
  assert.equal(decoded.outputs.length, 1);
  assert.equal(decoded.subscriptionInitId, 101n); // Official generation is the initialization slot.
  assert.equal(AccountLayout.decode(accountData(f.svm, f.source)).delegate.toBase58(), f.authority.toBase58());
  expectSuccess(send(f.svm, sdk.buildGuardCollectInstructions(decoded, [f.pools[0]], f.feePayer.publicKey.toBase58(), 0), f.feePayer));
  assert.equal(balance(f.svm, f.source), 900_000_000n);
});

test('protocol capability probe returns version 2 without any accounts', async () => {
  const f = await fixture();
  const result = send(f.svm, [sdk.buildGuardProtocolVersionInstruction()], f.feePayer);
  expectSuccess(result);
  assert.ok(result.logs().some(log => log.includes(`Program return: ${GUARD} Ag==`)), result.logs().join('\n'));
});

test('funding/output freeze authorities and creator-fee routes are rejected before collection', async () => {
  for (const variant of ['funding', 'output', 'creator-fee']) {
    const f = await fixture();
    if (variant === 'creator-fee') {
      const pool = new PublicKey(f.pools[0].pool), data = accountData(f.svm, pool);
      data[390] = 1; setAccount(f.svm, pool, RAYDIUM, data);
    } else {
      const mint = variant === 'funding' ? f.fundingMint : f.outputMints[0];
      const data = accountData(f.svm, mint);
      data.writeUInt32LE(1, 46); f.owner.publicKey.toBuffer().copy(data, 50); setAccount(f.svm, mint, TOKEN_PROGRAM_ID, data);
    }
    const before = accountData(f.svm, f.source);
    const result = send(f.svm, sdk.buildGuardCollectInstructions(f.plan, f.pools, f.feePayer.publicKey.toBase58(), 0), f.feePayer);
    assert.ok(result instanceof FailedTransactionMetadata, variant);
    assert.ok(result.meta().logs().some(log => log.includes(variant === 'creator-fee' ? 'InvalidPool' : 'UnsupportedFreezeAuthority')), result.meta().logs().join('\n'));
    assert.ok(!result.meta().logs().some(log => log.includes(`Program ${SUBSCRIPTIONS} invoke [2]`)));
    assert.deepEqual(accountData(f.svm, f.source), before);
  }
});

test('owner can cancel with a frozen empty staging account and a changed mint authority', async () => {
  const f = await fixture();
  const funding = accountData(f.svm, f.fundingMint);
  funding.writeUInt32LE(1, 46); f.owner.publicKey.toBuffer().copy(funding, 50); setAccount(f.svm, f.fundingMint, TOKEN_PROGRAM_ID, funding);
  const emptyFrozen = tokenData(f.fundingMint, f.planKey, 0n); emptyFrozen[108] = 2;
  setAccount(f.svm, f.staging, TOKEN_PROGRAM_ID, emptyFrozen);
  const ownerFrozen = accountData(f.svm, f.source); ownerFrozen[108] = 2;
  setAccount(f.svm, f.source, TOKEN_PROGRAM_ID, ownerFrozen);
  expectSuccess(send(f.svm, sdk.buildGuardCloseInstructions(f.plan, f.owner.publicKey.toBase58()), f.owner));
  assert.equal(f.svm.getAccount(f.plan.address).exists, false);
  assert.equal(f.svm.getAccount(f.delegation.toBase58()).exists, false);
});
