const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { createMint, createAccount, mintTo, getAccount, createRevokeInstruction, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { createSipDelegationInstruction, cancelSipInstruction, deriveSipAddress } = require('../../sdk/dist/subscriptions/delegation');
const { buildSipExecutionTransaction } = require('../../sdk/dist/subscriptions/crank');

// Intentional local-validator-only integration fixture. Never mint test balances or
// send these test transactions to an external network.
const rpc = process.env.ANCHOR_PROVIDER_URL || 'http://127.0.0.1:8899';
const url = new URL(rpc);
assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname), 'Integration tests only support a local validator');
const connection = new Connection(rpc, 'confirmed');
const programId = new PublicKey('WUrZqhZgSHZ8R8F6zV4CD3LQUXUWffpkZQf6zBCCmEa');
let owner, executor, attacker, inputMint, outputMint;
let sequence = BigInt(Date.now());
async function balance(address) { return (await getAccount(connection,address)).amount; }
async function send(instructions, signer=owner) {
  return sendAndConfirmTransaction(connection,new Transaction().add(...instructions),[signer],{commitment:'confirmed'});
}
async function plan() {
  const inputAccount=await createAccount(connection,owner,inputMint,owner.publicKey,Keypair.generate());
  const outputAccount=await createAccount(connection,owner,outputMint,owner.publicKey,Keypair.generate());
  const executorInputAccount=await createAccount(connection,owner,inputMint,executor.publicKey,Keypair.generate());
  const executorOutputAccount=await createAccount(connection,owner,outputMint,executor.publicKey,Keypair.generate());
  await mintTo(connection,owner,inputMint,inputAccount,owner,1000n);
  await mintTo(connection,owner,outputMint,executorOutputAccount,owner,1000n);
  const now=BigInt(Math.floor(Date.now()/1000));
  const p={programId,owner:owner.publicKey,planId:sequence++,inputMint,outputMint,inputAccount,outputAccount,executor:executor.publicKey,executorInputAccount,executorOutputAccount};
  await send([createSipDelegationInstruction({...p,terms:{amountPerCycle:100n,minimumOutput:25n,intervalSeconds:60n,firstExecutionAt:now+2n,expiresAt:now+3600n,maxCycles:2}})]);
  await new Promise(resolve => setTimeout(resolve, 2500));
  return p;
}
async function execute(p, outputAmount=25n, signer=executor) {
  const {blockhash}=await connection.getLatestBlockhash();
  return sendAndConfirmTransaction(connection,buildSipExecutionTransaction({...p,outputAmount,recentBlockhash:blockhash}),[signer],{commitment:'confirmed'});
}

describe('bounded direct-settlement SIP program',()=>{
  before(async()=>{
    const genesis = await connection.getGenesisHash();
    assert.notEqual(genesis, '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d', 'Refusing mainnet even through a localhost proxy');
    const program=await connection.getAccountInfo(programId);
    assert.ok(program?.executable,'Build and deploy the local Anchor program before running the integration suite');
    const wallet=process.env.ANCHOR_WALLET || path.join(process.env.HOME,'.config/solana/id.json');
    owner=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(wallet,'utf8'))));
    executor=Keypair.generate();attacker=Keypair.generate();
    for(const actor of [executor,attacker]){
      const signature=await connection.requestAirdrop(actor.publicKey,1000000000);
      await connection.confirmTransaction(signature,'confirmed');
    }
    inputMint=await createMint(connection,owner,owner.publicKey,null,6);
    outputMint=await createMint(connection,owner,owner.publicKey,null,6);
  });
  it('keeps funds in owner account on creation and settles both sides exactly',async()=>{
    const p=await plan();
    assert.equal(await balance(p.inputAccount),1000n);
    const account=await getAccount(connection,p.inputAccount);
    assert.equal(account.delegatedAmount,200n);
    assert.ok(account.delegate.equals(deriveSipAddress(programId,p.owner,p.planId)));
    await execute(p);
    assert.equal(await balance(p.inputAccount),900n);
    assert.equal(await balance(p.outputAccount),25n);
    assert.equal(await balance(p.executorInputAccount),100n);
    assert.equal(await balance(p.executorOutputAccount),975n);
    await assert.rejects(execute(p));
    assert.equal(await balance(p.inputAccount),900n,'An early repeat cannot drain a second installment');
  });
  it('underpayment and wrong recipient fail without spending owner funds',async()=>{
    const p=await plan();
    await assert.rejects(execute(p,24n), error => error.transactionLogs?.some(line => line.includes('MinimumOutput')));
    assert.equal(await balance(p.inputAccount),1000n);
    const wrong=await createAccount(connection,owner,outputMint,attacker.publicKey,Keypair.generate());
    await assert.rejects(execute({...p,outputAccount:wrong}));
    assert.equal(await balance(p.inputAccount),1000n);
    assert.equal(await balance(wrong),0n);
  });
  it('insufficient counterparty inventory rolls back plan state and both transfers',async()=>{
    const p=await plan();
    const empty=await createAccount(connection,owner,outputMint,executor.publicKey,Keypair.generate());
    await assert.rejects(execute({...p,executorOutputAccount:empty}));
    assert.equal(await balance(p.inputAccount),1000n);
    await execute(p);
    assert.equal(await balance(p.inputAccount),900n,'Failed settlement did not consume a cycle');
  });
  it('requires owner authorization to cancel and cancellation revokes allowance permanently',async()=>{
    const p=await plan();
    const wrong=cancelSipInstruction(p);
    wrong.keys[1].pubkey=attacker.publicKey;
    await assert.rejects(send([wrong],attacker));
    await send([cancelSipInstruction(p)]);
    assert.equal((await getAccount(connection,p.inputAccount)).delegate,null);
    await assert.rejects(execute(p));
    assert.ok(await connection.getAccountInfo(deriveSipAddress(programId,p.owner,p.planId)),'Tombstone prevents old ID reinitialization');
  });
  it('honors independent SPL allowance revocation immediately',async()=>{
    const p=await plan();
    await send([createRevokeInstruction(p.inputAccount,owner.publicKey,[],TOKEN_PROGRAM_ID)]);
    await assert.rejects(execute(p));
    assert.equal(await balance(p.inputAccount),1000n);
  });
});
