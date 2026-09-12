import { createHash, createHmac, createPublicKey, timingSafeEqual, verify } from 'node:crypto';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';

interface TradeAuthorization { requestId: string; taker: string; messageHash: string; expiresAt: number; }

function messageHash(transaction: VersionedTransaction): string {
  return createHash('sha256').update(transaction.message.serialize()).digest('hex');
}

export function authorizeTrade(transaction: string, requestId: string, taker: string, expiresAt: number, secret: string): string {
  const tx = VersionedTransaction.deserialize(Buffer.from(transaction, 'base64'));
  const signers = tx.message.staticAccountKeys.slice(0, tx.message.header.numRequiredSignatures);
  if (!signers.some(key => key.toBase58() === taker)) throw new Error('The quoted transaction does not require this wallet to sign.');
  const payload: TradeAuthorization = { requestId, taker, messageHash: messageHash(tx), expiresAt };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${createHmac('sha256', secret).update(encoded).digest('base64url')}`;
}

/** Only the exact issuer-validated order and a valid taker signature can reach Jupiter execution. */
export function verifyTradeAuthorization(authorization: string, signedTransaction: string, secret: string): TradeAuthorization {
  const parts = authorization.split('.');
  if (parts.length !== 2) throw new Error('Invalid trade authorization.');
  const expected = createHmac('sha256', secret).update(parts[0]).digest();
  const received = Buffer.from(parts[1], 'base64url');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new Error('Invalid trade authorization.');
  const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString()) as TradeAuthorization;
  if (!Number.isFinite(payload.expiresAt) || payload.expiresAt <= Date.now()) throw new Error('The quote expired. Request a new quote.');
  const tx = VersionedTransaction.deserialize(Buffer.from(signedTransaction, 'base64'));
  if (messageHash(tx) !== payload.messageHash) throw new Error('The signed transaction differs from the reviewed order.');
  const signers = tx.message.staticAccountKeys.slice(0, tx.message.header.numRequiredSignatures);
  const index = signers.findIndex(key => key.toBase58() === payload.taker);
  if (index < 0) throw new Error('The wallet is not a signer of this transaction.');
  const key = createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), new PublicKey(payload.taker).toBuffer()]),
    format: 'der', type: 'spki',
  });
  if (!verify(null, tx.message.serialize(), key, tx.signatures[index])) throw new Error('A valid wallet signature is required to execute this trade.');
  return payload;
}
