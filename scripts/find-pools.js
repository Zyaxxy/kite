const { createRequire } = require("node:module");
const path = require("node:path");
const workspaceRequire = createRequire(path.join(__dirname, "../packages/sdk/package.json"));
const { Connection, PublicKey } = workspaceRequire("@solana/web3.js");
const fs = require("fs");

const CPMM_PROGRAM = new PublicKey("DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb");
const KUSD_MINT = new PublicKey("jaViZzZ2ezVSKXZvyQnrmasSyBWVU5n8VMx4ZuAovjM");

// Raydium Devnet CPMM Configs
const AMM_CONFIGS = [
  new PublicKey("D4FPEruKEHrG5TenZ2mpDGEpe1iUvtiqFouAwWd32sWX"),
  new PublicKey("C1qg39G2X9x8yuQ19hJvB22BqQpAkyQeE5vG4JbH1bH8"),
];

const xstocks = JSON.parse(fs.readFileSync("apps/web/public/xstocks-devnet/xstocks.json"));

async function find() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const pools = {};
  
  for (const token of xstocks.tokens) {
    const mint = new PublicKey(token.mint);
    const [token0, token1] = Buffer.compare(KUSD_MINT.toBuffer(), mint.toBuffer()) < 0 
      ? [KUSD_MINT, mint] 
      : [mint, KUSD_MINT];

    let found = false;
    for (const config of AMM_CONFIGS) {
      const [poolAddress] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), config.toBuffer(), token0.toBuffer(), token1.toBuffer()],
        CPMM_PROGRAM
      );
      
      const account = await connection.getAccountInfo(poolAddress).catch(() => null);
      if (account) {
        console.log(`Found pool for ${token.symbol}: ${poolAddress.toBase58()}`);
        pools[token.mint] = poolAddress.toBase58();
        found = true;
        break;
      }
    }
  }
  
  if (Object.keys(pools).length > 0) {
    console.log("Found pools:");
    console.log(JSON.stringify(pools, null, 2));
  } else {
    console.log("No pools found. The user hasn't actually created the pools on Raydium yet!");
  }
}
find().catch(console.error);
