#!/usr/bin/env node
// Read-only devnet program snapshots for local LiteSVM tests. Never sends a transaction.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PublicKey } = require('@solana/web3.js');
const manifest = require('../tests/fixtures/runtime-programs.json');
const out = process.env.KITE_TEST_PROGRAM_DIR || path.resolve(__dirname, '../target/test-programs');
const endpoint = process.env.KITE_TEST_DEVNET_RPC || 'https://api.devnet.solana.com';
async function rpc(method, params = []) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(20_000) });
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(`Devnet read failed: ${method}`);
  return result.result;
}
async function main() {
  if (await rpc('getGenesisHash') !== 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG') throw new Error('Fixtures require Solana devnet.');
  fs.mkdirSync(out, { recursive: true });
  for (const [name, expected] of Object.entries(manifest.programs)) {
    const account = (await rpc('getAccountInfo', [expected.programId, { encoding: 'base64' }])).value;
    if (!account?.executable || account.owner !== 'BPFLoaderUpgradeab1e11111111111111111111111') throw new Error(`Not an upgradeable program: ${name}`);
    const programData = new PublicKey(Buffer.from(account.data[0], 'base64').subarray(4, 36)).toBase58();
    if (programData !== expected.programData) throw new Error(`ProgramData changed: ${name}`);
    const dataAccount = (await rpc('getAccountInfo', [programData, { encoding: 'base64' }])).value;
    if (dataAccount?.owner !== account.owner) throw new Error(`Unexpected ProgramData owner: ${name}`);
    const data = Buffer.from(dataAccount.data[0], 'base64');
    if (data.readUInt32LE(0) !== 3) throw new Error(`Invalid ProgramData: ${name}`);
    const binary = data.subarray(45);
    if (crypto.createHash('sha256').update(binary).digest('hex') !== expected.sha256) throw new Error(`Official ${name} deployment changed. Review and update the pinned fixture before testing.`);
    fs.writeFileSync(path.join(out, `${name}.so`), binary);
    console.log(`Verified ${name}: ${expected.sha256}`);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
