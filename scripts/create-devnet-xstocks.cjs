#!/usr/bin/env node
/**
 * Create devnet xStocks test tokens with metadata for Kite recurring/basket tests.
 * Usage:
 *   export SOLANA_RPC_URL=https://api.devnet.solana.com
 *   node scripts/create-devnet-xstocks.cjs <path/to/authority.json>
 *
 * The script writes a JSON manifest to apps/web/public/xstocks-devnet/xstocks.json
 * and outputs the generated mint addresses so they can be checked into metadata.
 */

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_SYMBOLS = [
  { symbol: "xAAPL", name: "xStocks Test Apple", decimals: 6 },
  { symbol: "xTSLA", name: "xStocks Test Tesla", decimals: 6 },
  { symbol: "xNVDA", name: "xStocks Test NVIDIA", decimals: 6 },
  { symbol: "xAMZN", name: "xStocks Test Amazon", decimals: 6 },
  { symbol: "xGOOGL", name: "xStocks Test Alphabet", decimals: 6 },
];

async function main() {
  const keypairPath = process.argv[2] || process.env.KITE_DEVNET_KEYPAIR;
  if (!keypairPath) {
    console.error("Usage: node scripts/create-devnet-xstocks.cjs <path/to/authority.json>");
    console.error("   or: SOLANA_RPC_URL=https://api.devnet.solana.com KITE_DEVNET_KEYPAIR=...");
    process.exit(1);
  }

  const { Connection, Keypair, clusterApiUrl } = require("@solana/web3.js");
  const { createMint, createAssociatedTokenAccount, mintTo } = require("@solana/spl-token");

  const rpc = process.env.SOLANA_RPC_URL || clusterApiUrl("devnet");
  const connection = new Connection(rpc, "confirmed");
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf8"))),
  );

  console.log(`Using RPC: ${rpc}`);
  console.log(`Payer: ${payer.publicKey.toBase58()}`);

  const tokens = [];
  for (const { symbol, name, decimals } of DEFAULT_SYMBOLS) {
    const mintKeypair = Keypair.generate();
    const mint = await createMint(
      connection,
      payer,
      payer.publicKey,
      null,
      decimals,
      mintKeypair,
    );

    // Fund a payer ATA with 1_000_000 whole units for manual testing.
    const ata = await createAssociatedTokenAccount(connection, payer, mint, payer.publicKey);
    await mintTo(connection, payer, mint, ata, payer, 1_000_000 * 10 ** decimals);

    tokens.push({
      symbol,
      name,
      mint: mint.toBase58(),
      decimals,
      logo: `/xstocks-devnet/${symbol}.png`,
      issuer: "kite-devnet",
      status: "test",
    });

    console.log(`${symbol}: ${mint.toBase58()} (ATA: ${ata.toBase58()})`);
  }

  const manifest = {
    network: "devnet",
    description:
      "Devnet test tokens for Kite recurring xStocks. These are valueless mints for integration testing.",
    tokens,
  };

  const outDir = path.resolve(__dirname, "../apps/web/public/xstocks-devnet");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "xstocks.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nManifest written to apps/web/public/xstocks-devnet/xstocks.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
