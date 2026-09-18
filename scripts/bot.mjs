#!/usr/bin/env node
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const require = createRequire(new URL("../packages/sdk/package.json", import.meta.url));
const { PublicKey, Keypair, VersionedTransaction } = require("@solana/web3.js");
const { decodeGuardPlan, guardDuePeriod, KITE_GUARD_PROGRAM_ID } = require("./dist/index.js");

const RPC_URL = process.env.KITE_RECURRING_RPC_URL || process.env.SOLANA_DEVNET_RPC_URL || "https://api.devnet.solana.com";
const WEB_URL = process.env.KITE_WEB_URL || "http://localhost:3000";

function parseKeypair(input) {
  const trimmed = input.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return Keypair.fromSecretKey(new Uint8Array(JSON.parse(trimmed)));
  }
  if (/^[0-9a-fA-F]{128}$/.test(trimmed)) {
    return Keypair.fromSecretKey(Uint8Array.from(Buffer.from(trimmed, "hex")));
  }
  try {
    return Keypair.fromSecretKey(new Uint8Array(JSON.parse(trimmed)));
  } catch {
    throw new Error("Invalid BOT_KEYPAIR format. Supply a 64-byte JSON array [1,2...] or 128-char hex string.");
  }
}

let botKeypair;
const defaultKeypath = join(homedir(), ".config", "solana", "id.json");
if (process.env.BOT_KEYPAIR) {
  botKeypair = parseKeypair(process.env.BOT_KEYPAIR);
} else if (existsSync(defaultKeypath)) {
  botKeypair = parseKeypair(readFileSync(defaultKeypath, "utf8"));
} else {
  console.log("No BOT_KEYPAIR found. Generating an ephemeral keypair for the bot...");
  botKeypair = Keypair.generate();
  console.log("Bot Pubkey:", botKeypair.publicKey.toBase58());
  console.log("WARNING: Ephemeral keypair has 0 SOL. Fund this address or set BOT_KEYPAIR to pay transaction fees.");
}

async function rpc(method, params = []) {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

async function runBot() {
  console.log(`[Bot] Starting collection pass at ${new Date().toISOString()}`);
  console.log(`[Bot] Fee Payer: ${botKeypair.publicKey.toBase58()}`);

  const slot = await rpc("getSlot", [{ commitment: "confirmed" }]);
  const time = await rpc("getBlockTime", [slot]);
  const nowSeconds = BigInt(time);

  console.log(`[Bot] Current chain time: ${nowSeconds}`);

  const accounts = await rpc("getProgramAccounts", [
    KITE_GUARD_PROGRAM_ID.toBase58(),
    {
      encoding: "base64",
      commitment: "confirmed",
      filters: [{ dataSize: 1045 }]
    }
  ]);

  console.log(`[Bot] Found ${accounts.length} total recurring plan(s).`);

  let collected = 0;
  let skipped = 0;
  let failed = 0;

  for (const { pubkey, account } of accounts) {
    let plan;
    try {
      plan = decodeGuardPlan(Buffer.from(account.data[0], "base64"), pubkey);
    } catch (e) {
      console.error(`[Bot] Failed to decode plan ${pubkey}:`, e.message);
      continue;
    }

    let duePeriodIndex;
    try {
      duePeriodIndex = guardDuePeriod(plan, nowSeconds);
    } catch (e) {
      // Not due
      skipped++;
      continue;
    }

    console.log(`[Bot] Plan ${pubkey} is DUE for period index ${duePeriodIndex}! Collecting...`);

    try {
      // 1. Prepare collection transaction via the Kite Web API
      const collectRes = await fetch(`${WEB_URL}/api/recurring/collect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: 1,
          plan: pubkey,
          feePayer: botKeypair.publicKey.toBase58(),
          expectedPeriodIndex: duePeriodIndex
        })
      });

      if (!collectRes.ok) {
        const errData = await collectRes.json();
        throw new Error(errData.error || `HTTP ${collectRes.status}`);
      }

      const prepared = await collectRes.json();

      // 2. Sign the transaction
      const txBuffer = Buffer.from(prepared.transaction, "base64");
      const transaction = VersionedTransaction.deserialize(txBuffer);
      transaction.sign([botKeypair]);
      
      const signedTransaction = Buffer.from(transaction.serialize()).toString("base64");

      // 3. Execute / Submit the transaction
      const execRes = await fetch(`${WEB_URL}/api/recurring/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: 1,
          authorization: prepared.authorization,
          signedTransaction
        })
      });

      if (!execRes.ok) {
        const errData = await execRes.json();
        throw new Error(errData.error || `HTTP ${execRes.status}`);
      }

      const result = await execRes.json();
      console.log(`[Bot] Successfully collected plan ${pubkey}. Status: ${result.status}, Signature: ${result.signature}`);
      collected++;
    } catch (e) {
      console.error(`[Bot] Failed to collect plan ${pubkey}:`, e.message);
      failed++;
    }
  }

  console.log(`[Bot] Pass complete. Collected: ${collected}, Skipped: ${skipped}, Failed: ${failed}`);
}

runBot().catch(console.error);
