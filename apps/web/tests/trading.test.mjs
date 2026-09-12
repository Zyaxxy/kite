import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { authorizeTrade, verifyTradeAuthorization } from '../lib/server/trade-authorization.ts';
import { toTokenAmount, fromTokenAmount, canApproveTrade, classifyTradeExecution, hasCompleteIssuerCatalogs } from '../../../packages/sdk/src/trading.ts';

test('amount conversion preserves exact token units and rejects invalid precision', () => {
  assert.equal(toTokenAmount('9007199254.740993', 6), '9007199254740993');
  assert.equal(fromTokenAmount('9007199254740993', 6), '9007199254.740993');
  assert.equal(fromTokenAmount('1000000', 6), '1');
  assert.equal(fromTokenAmount('0', 6), '0');
  for (const value of ['0', '-1', '1e6', 'NaN', '0.0000001', '18446744073709551616']) assert.throws(() => toTokenAmount(value, 6));
});

function fixture() {
  const wallet = Keypair.generate();
  const recipient = Keypair.generate().publicKey;
  const message = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
    instructions: [SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: recipient, lamports: 1 })],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  const unsigned = Buffer.from(tx.serialize()).toString('base64');
  const authorization = authorizeTrade(unsigned, 'test-order', wallet.publicKey.toBase58(), Date.now() + 10_000, 'test-secret');
  return { wallet, tx, unsigned, authorization };
}

test('only the reviewed message with a valid wallet signature can execute', () => {
  const { wallet, tx, unsigned, authorization } = fixture();
  assert.throws(() => verifyTradeAuthorization(authorization, unsigned, 'test-secret'), /signature/);
  tx.sign([wallet]);
  const signed = Buffer.from(tx.serialize()).toString('base64');
  assert.equal(verifyTradeAuthorization(authorization, signed, 'test-secret').requestId, 'test-order');
  assert.throws(() => verifyTradeAuthorization(authorization, signed, 'wrong-secret'), /authorization/);
  tx.message.recentBlockhash = Keypair.generate().publicKey.toBase58();
  tx.sign([wallet]);
  assert.throws(() => verifyTradeAuthorization(authorization, Buffer.from(tx.serialize()).toString('base64'), 'test-secret'), /differs/);
});

test('expired quotes and a different wallet cannot be approved', () => {
  const { wallet, unsigned } = fixture();
  const expired = authorizeTrade(unsigned, 'old-order', wallet.publicKey.toBase58(), Date.now() - 1, 'test-secret');
  assert.throws(() => verifyTradeAuthorization(expired, unsigned, 'test-secret'), /expired/);
  assert.equal(canApproveTrade({ taker: 'wallet-a', transaction: 'transaction', expiresAt: 100 }, 'wallet-b', 1), false);
  assert.equal(canApproveTrade({ taker: 'wallet-a', transaction: 'transaction', expiresAt: 100 }, 'wallet-a', 100), false);
});

test('missing issuer catalogs cannot be presented as a complete empty portfolio', () => {
  assert.equal(hasCompleteIssuerCatalogs({ status: 'partial', sources: ['PreStocks issuer catalog', 'Jupiter Tokens V2'] }), false);
  assert.equal(hasCompleteIssuerCatalogs({ status: 'partial', sources: ['xStocks issuer catalog'] }), false);
  assert.equal(hasCompleteIssuerCatalogs({ status: 'unavailable', sources: [] }), false);
  // Price outages can remain partial without losing the ability to identify every issuer holding.
  assert.equal(hasCompleteIssuerCatalogs({ status: 'partial', sources: ['xStocks issuer catalog', 'PreStocks issuer catalog'] }), true);
});

test('missing confirmation is unknown rather than a false success or failure', () => {
  for (const payload of [null, {}, new Error('network timeout'), { status: 'Pending' }, { status: 'Success' }, { status: 'Success', signature: 'invalid' }]) {
    const result = classifyTradeExecution(payload);
    assert.equal(result.status, 'Unknown');
    assert.match(result.error, /may have completed/);
  }
  const signature = '2'.repeat(88);
  assert.equal(classifyTradeExecution({ status: 'Success', signature }).status, 'Success');
  assert.equal(classifyTradeExecution({ status: 'Failed', error: 'Transaction rejected' }).status, 'Failed');
});
