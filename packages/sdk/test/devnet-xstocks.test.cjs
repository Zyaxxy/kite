const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Keypair, PublicKey } = require('@solana/web3.js');
const {
  DEVNET_GENESIS_HASH,
  DEVNET_FUNDING_TOKEN_DEFINITION,
  DEVNET_XSTOCK_CATALOG,
  DEVNET_RECURRING_BASKETS,
  createUnprovisionedDevnetManifest,
  validateDevnetXStockManifest,
  resolveDevnetBasketAssets,
} = require('../dist/devnet-xstocks.js');
const { resolveMarketBaskets } = require('../dist/markets.js');
const {
  parseArgs, assertDevnet, validateMintAccount, supplyShortfall, provisionToken,
} = require('../../../scripts/create-devnet-xstocks.cjs');

function fixtureMint(index) {
  return new PublicKey(Uint8Array.from({ length: 32 }, (_, byte) => byte === 0 ? index + 1 : 0)).toBase58();
}
function provisionedManifest() {
  return {
    ...createUnprovisionedDevnetManifest(),
    status: 'ready',
    mintAuthority: fixtureMint(99),
    tokens: DEVNET_XSTOCK_CATALOG.map((definition, index) => ({ ...definition, mint: fixtureMint(index) })),
    fundingToken: { ...DEVNET_FUNDING_TOKEN_DEFINITION, mint: fixtureMint(40) },
  };
}

test('the devnet catalog covers every public basket without creating private substitutes', () => {
  const canonical = resolveMarketBaskets([]).filter((basket) => basket.category !== 'private');
  const expectedSymbols = [...new Set(canonical.flatMap((basket) => basket.missingSymbols))].sort();
  assert.equal(canonical.length, 11);
  assert.equal(DEVNET_XSTOCK_CATALOG.length, 40);
  assert.deepEqual(DEVNET_XSTOCK_CATALOG.map((token) => token.underlyingSymbol).sort(), expectedSymbols);
  assert.deepEqual(DEVNET_RECURRING_BASKETS.map((basket) => basket.id), canonical.map((basket) => basket.id));
  for (const token of DEVNET_XSTOCK_CATALOG) {
    assert.ok(fs.existsSync(path.join(__dirname, '../../../apps/web/public', token.logo)));
    assert.equal(token.issuer, 'kite-devnet');
  }
});

test('unprovisioned manifests publish intentions without fabricated mint addresses or USDC', () => {
  const manifest = createUnprovisionedDevnetManifest();
  assert.equal(validateDevnetXStockManifest(manifest), manifest);
  assert.deepEqual(manifest.tokens, []);
  assert.equal(manifest.fundingToken, null);
  assert.equal(manifest.intendedCatalog.length, 40);
  assert.equal(manifest.intendedFundingToken.symbol, 'KUSD');
  assert.ok(!manifest.intendedCatalog.some((token) => 'mint' in token));
  assert.throws(() => resolveDevnetBasketAssets(manifest, 'sol-mag7'), /not provisioned.*AAPL/);
});

test('all provisioned baskets use canonical constituents and allocate exactly 10000 bps', () => {
  const manifest = provisionedManifest();
  for (const basket of DEVNET_RECURRING_BASKETS) {
    const allocations = resolveDevnetBasketAssets(manifest, basket.id);
    assert.deepEqual(allocations.map(({ token }) => token.underlyingSymbol), basket.underlyingSymbols);
    assert.equal(allocations.reduce((sum, allocation) => sum + allocation.weightBps, 0), 10_000);
    assert.ok(Math.max(...allocations.map((asset) => asset.weightBps)) - Math.min(...allocations.map((asset) => asset.weightBps)) <= 1);
  }
  assert.throws(() => resolveDevnetBasketAssets(manifest, 'sol-pre-stocks'), /Only public/);
});

test('missing basket constituents fail closed instead of redistributing their allocation', () => {
  const manifest = provisionedManifest();
  manifest.tokens = manifest.tokens.filter((token) => token.underlyingSymbol !== 'TSLA');
  manifest.status = 'partial';
  assert.throws(() => resolveDevnetBasketAssets(manifest, 'sol-mag7'), /TSLA/);
  assert.equal(resolveDevnetBasketAssets(manifest, 'sol-core').length, 3);
});

test('manifest validation rejects cluster, decimal, duplicate, funding-token, and status mistakes', () => {
  for (const mutate of [
    (manifest) => { manifest.network = 'mainnet-beta'; },
    (manifest) => { manifest.genesisHash = 'mainnet'; },
    (manifest) => { manifest.tokens[0].decimals = 9; },
    (manifest) => { manifest.tokens[0].mint = 'xTsla111111111111111111111111111111111111111'; },
    (manifest) => { manifest.tokens[1].mint = manifest.tokens[0].mint; },
    (manifest) => { manifest.tokens[1] = manifest.tokens[0]; },
    (manifest) => { manifest.fundingToken = manifest.tokens[0]; },
    (manifest) => { manifest.fundingToken.symbol = 'USDC'; },
    (manifest) => { manifest.fundingToken.mint = manifest.tokens[0].mint; },
    (manifest) => { manifest.status = 'unprovisioned'; },
  ]) {
    const manifest = provisionedManifest();
    mutate(manifest);
    assert.throws(() => validateDevnetXStockManifest(manifest));
  }
});

test('provisioning rejects mainnet or an unidentified RPC before any token work', async () => {
  await assertDevnet({ getGenesisHash: async () => DEVNET_GENESIS_HASH }, DEVNET_GENESIS_HASH);
  await assert.rejects(assertDevnet({ getGenesisHash: async () => '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' }, DEVNET_GENESIS_HASH), /not Solana devnet/);
  await assert.rejects(assertDevnet({ getGenesisHash: async () => { throw new Error('RPC offline'); } }, DEVNET_GENESIS_HASH), /offline/);
});

test('mint reuse checks the authority, decimals, initialization, and absence of freeze authority', () => {
  const authority = new PublicKey(fixtureMint(70));
  const mint = { isInitialized: true, decimals: 6, mintAuthority: authority, freezeAuthority: null };
  validateMintAccount(mint, authority, 6, 'xAAPL');
  for (const update of [
    { decimals: 9 }, { mintAuthority: new PublicKey(fixtureMint(71)) },
    { mintAuthority: null }, { freezeAuthority: authority }, { isInitialized: false },
  ]) assert.throws(() => validateMintAccount({ ...mint, ...update }, authority, 6, 'xAAPL'), /will not be replaced/);
});

test('supply targets use exact bigint arithmetic and do not mint the initial supply twice', () => {
  assert.equal(supplyShortfall(0n, 6), 1_000_000_000_000n);
  assert.equal(supplyShortfall(999_999_999_999n, 6), 1n);
  assert.equal(supplyShortfall(1_000_000_000_000n, 6), 0n);
  assert.equal(supplyShortfall(2_000_000_000_000n, 6), 0n);
  assert.equal(supplyShortfall(0n, 18), 1_000_000_000_000_000_000_000_000n);
});

function provisioningHarness() {
  const payer = Keypair.generate();
  const state = { mints: {} };
  const events = [];
  let record;
  let minted;
  const options = {
    definition: DEVNET_XSTOCK_CATALOG[0], payer, state, Keypair, PublicKey,
    TOKEN_PROGRAM_ID: new PublicKey(fixtureMint(90)),
    connection: { getAccountInfo: async () => minted ? {} : null },
    writeState: async () => { events.push('checkpoint'); },
    writeMint: async (value) => { events.push('manifest'); record = value; },
    createMint: async (_connection, _payer, authority, freezeAuthority, decimals) => {
      assert.ok(state.mints.xAAPL);
      events.push('create');
      minted = { isInitialized: true, decimals, mintAuthority: authority, freezeAuthority, supply: 0n };
    },
    getMint: async () => ({ ...minted }),
    getOrCreateAssociatedTokenAccount: async () => ({ address: new PublicKey(fixtureMint(91)) }),
    mintTo: async (_connection, _payer, _mint, _ata, _authority, amount) => {
      events.push('fund'); minted.supply += amount;
    },
  };
  return { options, events, getRecord: () => record, getMint: () => minted };
}

test('repeating a completed provision reuses its mint and never adds supply twice', async () => {
  const harness = provisioningHarness();
  const first = await provisionToken(harness.options);
  const second = await provisionToken({ ...harness.options, existing: harness.getRecord() });
  assert.equal(first.mintAddress.toBase58(), second.mintAddress.toBase58());
  assert.equal(second.amount, 0n);
  assert.deepEqual(harness.events, ['checkpoint', 'create', 'manifest', 'fund']);
});

test('a creation timeout resumes from the checkpoint without generating or creating another mint', async () => {
  const harness = provisioningHarness();
  const create = harness.options.createMint;
  await assert.rejects(provisionToken({ ...harness.options, createMint: async (...args) => { await create(...args); throw new Error('confirmation timeout'); } }), /timeout/);
  assert.equal(harness.getRecord(), undefined);
  const pendingAddress = Keypair.fromSecretKey(Uint8Array.from(harness.options.state.mints.xAAPL)).publicKey.toBase58();
  const recovered = await provisionToken(harness.options);
  assert.equal(recovered.mintAddress.toBase58(), pendingAddress);
  assert.deepEqual(harness.events, ['checkpoint', 'create', 'manifest', 'fund']);
});

test('a funding confirmation timeout can be retried without a duplicate mint or supply', async () => {
  const harness = provisioningHarness();
  const fund = harness.options.mintTo;
  await assert.rejects(provisionToken({ ...harness.options, mintTo: async (...args) => { await fund(...args); throw new Error('funding timeout'); } }), /timeout/);
  const recovered = await provisionToken({ ...harness.options, existing: harness.getRecord() });
  assert.equal(recovered.amount, 0n);
  assert.equal(harness.getMint().supply, 1_000_000_000_000n);
  assert.deepEqual(harness.events, ['checkpoint', 'create', 'manifest', 'fund']);
});

test('a manifest/checkpoint conflict fails before writing or creating a replacement mint', async () => {
  const harness = provisioningHarness();
  await provisionToken(harness.options);
  const eventsBefore = [...harness.events];
  await assert.rejects(provisionToken({ ...harness.options, existing: { ...harness.getRecord(), mint: fixtureMint(80) } }), /disagree/);
  assert.deepEqual(harness.events, eventsBefore);
});

test('script supports explicit read-only modes and normalizes selected catalog symbols', () => {
  assert.equal(parseArgs(['--list']).list, true);
  assert.equal(parseArgs(['--dry-run']).dryRun, true);
  assert.deepEqual(parseArgs(['--symbols', 'aapl,MSFT,aapl,KUSD']).symbols, ['AAPL', 'MSFT', 'KUSD']);
  assert.throws(() => parseArgs(['--symbols']), /requires/);
  assert.throws(() => parseArgs(['--mystery']), /Unknown/);
});
