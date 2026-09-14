#!/usr/bin/env node
/**
 * Provision valueless SPL test instruments for every public Kite basket on devnet.
 * This creates mint accounts and a local catalog, not issuer-backed xStocks or
 * on-chain name/logo metadata. It does not create swap liquidity or deploy programs.
 *
 * pnpm build:sdk
 * node scripts/create-devnet-xstocks.cjs --list
 * node scripts/create-devnet-xstocks.cjs --dry-run
 * node scripts/create-devnet-xstocks.cjs <authority.json> [--symbols AAPL,MSFT]
 *
 * A private, git-ignored .env.kite-devnet-xstocks-state.json checkpoint retains
 * pending mint keypairs so interrupted runs reuse the same addresses. Do not
 * delete it while provisioning is incomplete. The public manifest records only
 * mint accounts already verified on devnet. Existing addresses are never replaced.
 */

const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "apps/web/public/xstocks-devnet/xstocks.json");
const STATE_PATH = path.join(ROOT, ".env.kite-devnet-xstocks-state.json");
const INITIAL_WHOLE_SUPPLY = 1_000_000n;

function loadCatalog() {
  try {
    return require("../packages/sdk/dist/devnet-xstocks.js");
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") throw error;
    throw new Error("Build the shared catalog first: pnpm build:sdk");
  }
}

function parseArgs(argv) {
  const options = { list: false, dryRun: false, help: false, symbols: undefined, keypairPath: undefined };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--list") options.list = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--symbols") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--symbols requires a comma-separated list of underlying symbols.");
      options.symbols = [...new Set(value.split(",").map((symbol) => symbol.trim().toUpperCase()))];
    } else if (arg.startsWith("-") || options.keypairPath) throw new Error(`Unknown argument: ${arg}`);
    else options.keypairPath = arg;
  }
  return options;
}

function atomicJson(filePath, value, privateFile = false) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  const fd = fs.openSync(temporaryPath, "w", privateFile ? 0o600 : 0o644);
  try {
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temporaryPath, filePath);
  if (privateFile) fs.chmodSync(filePath, 0o600);
}

async function assertDevnet(connection, expectedGenesisHash) {
  if (await connection.getGenesisHash() !== expectedGenesisHash) {
    throw new Error("Refusing to provision tokens: the RPC is not Solana devnet.");
  }
}

function validateMintAccount(mint, authority, decimals, symbol) {
  if (!mint.isInitialized || mint.decimals !== decimals || !mint.mintAuthority?.equals(authority) || mint.freezeAuthority !== null) {
    throw new Error(`${symbol}: existing mint has unexpected initialization, decimals, mint authority, or freeze authority. It will not be replaced.`);
  }
}

function supplyShortfall(supply, decimals) {
  if (typeof supply !== "bigint" || supply < 0n) throw new Error("Invalid mint supply.");
  const target = INITIAL_WHOLE_SUPPLY * 10n ** BigInt(decimals);
  return supply < target ? target - supply : 0n;
}

function readManifest(catalog) {
  if (!fs.existsSync(MANIFEST_PATH)) return catalog.createUnprovisionedDevnetManifest();
  return catalog.validateDevnetXStockManifest(JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")));
}

function readPrivateState(authority, genesisHash) {
  if (!fs.existsSync(STATE_PATH)) return { schemaVersion: 1, genesisHash, authority, mints: {} };
  const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  if (state.schemaVersion !== 1 || state.genesisHash !== genesisHash || state.authority !== authority || !state.mints || typeof state.mints !== "object") {
    throw new Error("Private provisioning checkpoint belongs to another authority or cluster. Use the original authority; do not replace pending mint addresses.");
  }
  return state;
}

/** One idempotent provisioning step; injected IO permits failure/retry tests. */
async function provisionToken({ definition, existing, payer, connection, state, writeState, writeMint, Keypair, PublicKey, createMint, getMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID }) {
  let mintAddress;
  if (existing) {
    mintAddress = new PublicKey(existing.mint);
    if (state.mints[definition.symbol]) {
      const pending = Keypair.fromSecretKey(Uint8Array.from(state.mints[definition.symbol]));
      if (!pending.publicKey.equals(mintAddress)) throw new Error(`${definition.symbol}: checkpoint and manifest addresses disagree; neither will be replaced.`);
    }
  } else {
    if (!state.mints[definition.symbol]) {
      state.mints[definition.symbol] = Array.from(Keypair.generate().secretKey);
      await writeState(state);
    }
    const mintKeypair = Keypair.fromSecretKey(Uint8Array.from(state.mints[definition.symbol]));
    mintAddress = mintKeypair.publicKey;
    if (!await connection.getAccountInfo(mintAddress, "confirmed")) {
      await createMint(connection, payer, payer.publicKey, null, definition.decimals, mintKeypair, { commitment: "confirmed" }, TOKEN_PROGRAM_ID);
    }
  }
  const mint = await getMint(connection, mintAddress, "confirmed", TOKEN_PROGRAM_ID);
  validateMintAccount(mint, payer.publicKey, definition.decimals, definition.symbol);
  if (!existing) await writeMint({ ...definition, mint: mintAddress.toBase58() });
  const amount = supplyShortfall(mint.supply, definition.decimals);
  if (amount > 0n) {
    const ata = await getOrCreateAssociatedTokenAccount(connection, payer, mintAddress, payer.publicKey, false, "confirmed", { commitment: "confirmed" }, TOKEN_PROGRAM_ID);
    await mintTo(connection, payer, mintAddress, ata.address, payer, amount, [], { commitment: "confirmed" }, TOKEN_PROGRAM_ID);
  }
  return { mintAddress, amount };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log("Usage: node scripts/create-devnet-xstocks.cjs [authority.json] [--list | --dry-run] [--symbols AAPL,MSFT]\nDefaults to SOLANA_DEVNET_RPC_URL, then SOLANA_RPC_URL, then public devnet. The RPC genesis hash must match devnet.\n--list and --dry-run never load a keypair or submit a transaction. --dry-run checks recorded mints on-chain.\nProvisioning resumes from the private git-ignored checkpoint and preserves every recorded mint address.");
    return;
  }
  const catalog = loadCatalog();
  const definitions = [catalog.DEVNET_FUNDING_TOKEN_DEFINITION, ...catalog.DEVNET_XSTOCK_CATALOG];
  const selected = definitions.filter((token) => !options.symbols || options.symbols.includes(token.underlyingSymbol) || options.symbols.includes(token.symbol.toUpperCase()));
  if (!selected.length || options.symbols?.some((symbol) => !definitions.some((token) => token.underlyingSymbol === symbol || token.symbol.toUpperCase() === symbol))) {
    throw new Error("Unknown or empty --symbols selection. Use --list for the supported underlying symbols.");
  }
  let manifest = readManifest(catalog);
  const recordedTokens = () => [...manifest.tokens, ...(manifest.fundingToken ? [manifest.fundingToken] : [])];
  if (options.list) {
    console.log(JSON.stringify({ network: "devnet", totalCatalog: catalog.DEVNET_XSTOCK_CATALOG.length, baskets: catalog.DEVNET_RECURRING_BASKETS, tokens: selected.map((token) => ({ ...token, mint: recordedTokens().find((item) => item.underlyingSymbol === token.underlyingSymbol)?.mint ?? null })) }, null, 2));
    return;
  }

  // The script lives at the monorepo root; Solana dependencies belong to the SDK.
  const workspaceRequire = createRequire(path.join(ROOT, "packages/sdk/package.json"));
  const { Connection, Keypair, PublicKey, clusterApiUrl } = workspaceRequire("@solana/web3.js");
  const { createMint, getMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } = workspaceRequire("@solana/spl-token");
  const rpc = process.env.SOLANA_DEVNET_RPC_URL || process.env.SOLANA_RPC_URL || clusterApiUrl("devnet");
  const connection = new Connection(rpc, "confirmed");
  await assertDevnet(connection, catalog.DEVNET_GENESIS_HASH);

  const keypairPath = options.keypairPath || process.env.KITE_DEVNET_KEYPAIR;
  if (!options.dryRun && !keypairPath) throw new Error("Provide authority.json or KITE_DEVNET_KEYPAIR to provision tokens; use --dry-run for a read-only check.");
  // The private authority is read only for an explicitly requested provisioning run.
  const payer = options.dryRun ? null : Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf8"))));
  const expectedAuthority = payer?.publicKey ?? (manifest.mintAuthority ? new PublicKey(manifest.mintAuthority) : null);
  if (manifest.mintAuthority && payer && manifest.mintAuthority !== payer.publicKey.toBase58()) {
    throw new Error("Manifest belongs to another mint authority. Existing tokens will not be replaced.");
  }
  if (recordedTokens().length && !expectedAuthority) throw new Error("Recorded mints require the manifest mintAuthority for verification.");
  for (const token of recordedTokens()) {
    const mint = await getMint(connection, new PublicKey(token.mint), "confirmed", TOKEN_PROGRAM_ID);
    validateMintAccount(mint, expectedAuthority, token.decimals, token.symbol);
  }
  if (options.dryRun) {
    console.log(JSON.stringify({ network: "devnet", genesisVerified: true, recordedMintsVerified: recordedTokens().length, intendedTokens: selected.length, missingSymbols: selected.filter((token) => !recordedTokens().some((item) => item.underlyingSymbol === token.underlyingSymbol)).map((token) => token.underlyingSymbol), mintingAuthorityConfigured: Boolean(manifest.mintAuthority), transactionsSubmitted: 0 }, null, 2));
    return;
  }

  // Avoid duplicate local provisioners. A failed process leaves an explicit lock;
  // remove it only after checking the recorded PID is no longer running.
  const lockPath = `${STATE_PATH}.lock`;
  let lock;
  try {
    lock = fs.openSync(lockPath, "wx", 0o600);
    fs.writeFileSync(lock, String(process.pid));
  } catch (error) {
    if (error.code === "EEXIST") throw new Error("Provisioning lock exists. Check that no other provisioner is running before removing .env.kite-devnet-xstocks-state.json.lock.");
    throw error;
  }
  try {
    const authority = payer.publicKey.toBase58();
    // Another process could have completed while this run was verifying the RPC.
    // Read again under the lock before publishing any checkpoint.
    manifest = readManifest(catalog);
    if (manifest.mintAuthority && manifest.mintAuthority !== authority) throw new Error("Manifest mint authority changed; existing addresses will not be replaced.");
    for (const token of recordedTokens()) {
      const mint = await getMint(connection, new PublicKey(token.mint), "confirmed", TOKEN_PROGRAM_ID);
      validateMintAccount(mint, payer.publicKey, token.decimals, token.symbol);
    }
    const state = readPrivateState(authority, catalog.DEVNET_GENESIS_HASH);
    console.log(`Verified devnet. Mint authority: ${authority}. Provisioning ${selected.length} selected instruments.`);
    for (const definition of selected) {
      const existing = recordedTokens().find((token) => token.underlyingSymbol === definition.underlyingSymbol);
      const { mintAddress, amount } = await provisionToken({
        definition, existing, payer, connection, state, Keypair, PublicKey,
        createMint, getMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID,
        writeState: (value) => atomicJson(STATE_PATH, value, true),
        writeMint: (record) => {
          if (definition.symbol === catalog.DEVNET_FUNDING_TOKEN_DEFINITION.symbol) manifest.fundingToken = record;
          else manifest.tokens.push(record);
          manifest.mintAuthority = authority;
          manifest.status = manifest.tokens.length === catalog.DEVNET_XSTOCK_CATALOG.length && manifest.fundingToken ? "ready" : "partial";
          manifest.updatedAt = new Date().toISOString();
          catalog.validateDevnetXStockManifest(manifest);
          atomicJson(MANIFEST_PATH, manifest);
        },
      });
      console.log(`${definition.symbol}: ${mintAddress.toBase58()} (${existing ? "reused" : "provisioned"}; added raw supply ${amount})`);
    }
    console.log(`Verified ${recordedTokens().length}/${definitions.length} devnet mint addresses in the public manifest. Swap liquidity is configured separately.`);
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  }
}

module.exports = { parseArgs, assertDevnet, validateMintAccount, supplyShortfall, atomicJson, provisionToken, main };
if (require.main === module) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
