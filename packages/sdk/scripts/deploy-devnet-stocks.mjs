import { Connection, Keypair, clusterApiUrl } from '@solana/web3.js';
import { createMint } from '@solana/spl-token';
import fs from 'fs';
import os from 'os';
import path from 'path';

const keypairPath = path.join(os.homedir(), '.config/solana/id.json');
const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf8')));
const payer = Keypair.fromSecretKey(secretKey);

const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

console.log('Deployer Public Key:', payer.publicKey.toBase58());

const STOCKS_TO_DEPLOY = [
  { symbol: 'USDC', name: 'Mock USD Coin', decimals: 6 },
  { symbol: 'xNVDA', name: 'Nvidia Corp. xStock', decimals: 6 },
  { symbol: 'xAAPL', name: 'Apple Inc. xStock', decimals: 6 },
  { symbol: 'xMSFT', name: 'Microsoft Corp. xStock', decimals: 6 },
  { symbol: 'xTSLA', name: 'Tesla Inc. xStock', decimals: 6 },
  { symbol: 'xAMZN', name: 'Amazon.com Inc. xStock', decimals: 6 },
  { symbol: 'xGOOGL', name: 'Alphabet Inc. xStock', decimals: 6 },
  { symbol: 'xMETA', name: 'Meta Platforms Inc. xStock', decimals: 6 },
  { symbol: 'preOPENAI', name: 'OpenAI Pre-Stock', decimals: 6 },
  { symbol: 'preSPACEX', name: 'SpaceX Pre-Stock', decimals: 6 },
  { symbol: 'preSTRIPE', name: 'Stripe Pre-Stock', decimals: 6 },
];

async function main() {
  const deployedMints = {};

  for (const stock of STOCKS_TO_DEPLOY) {
    console.log(`Creating Devnet SPL Mint for ${stock.symbol} (${stock.name})...`);
    try {
      const mint = await createMint(
        connection,
        payer,
        payer.publicKey, // mintAuthority
        payer.publicKey, // freezeAuthority
        stock.decimals
      );
      console.log(`  -> ${stock.symbol} Mint: ${mint.toBase58()}`);
      deployedMints[stock.symbol] = {
        symbol: stock.symbol,
        name: stock.name,
        decimals: stock.decimals,
        mint: mint.toBase58(),
      };
    } catch (err) {
      console.error(`Error creating mint for ${stock.symbol}:`, err);
      process.exit(1);
    }
  }

  // Write to packages/sdk/src/constants/devnet-mints.json
  const outDir = path.join(process.cwd(), 'packages/sdk/src/constants');
  fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, 'devnet-mints.json');
  fs.writeFileSync(jsonPath, JSON.stringify(deployedMints, null, 2));

  // Write TypeScript constants file
  const tsContent = `// Auto-generated 1:1 Solana Devnet xStocks and Pre-Stocks Mints
export interface DevnetStockInfo {
  symbol: string;
  name: string;
  decimals: number;
  mint: string;
}

export const DEVNET_MINTS: Record<string, DevnetStockInfo> = ${JSON.stringify(deployedMints, null, 2)};
`;

  const tsPath = path.join(outDir, 'devnet-mints.ts');
  fs.writeFileSync(tsPath, tsContent);

  console.log('\nSuccessfully deployed all 11 token mints to Solana Devnet!');
  console.log('Saved to:', jsonPath);
  console.log('Saved to:', tsPath);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
