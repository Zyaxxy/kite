#!/usr/bin/env node
// Read-only: reads the public manifest and public RPC accounts. No wallet/keypair file is loaded.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(new URL("../packages/sdk/package.json", import.meta.url));
const { PublicKey } = require("@solana/web3.js");
export const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const GUARD_PROGRAM = "8Fm9HENPAFnyo6L8cHJFx62HHsZ6ez6CPUDuzgKAzrjs";
export const SUBSCRIPTIONS_PROGRAM = "De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";
const V1_FEATURE = "txv1aq4pp281K9um3tnPgkfX8UqtFT6wcVW3hNezGLL";
const MOCK_AUTHORITY = PublicKey.findProgramAddressSync(
  [Buffer.from("mock_mint_authority")], new PublicKey(GUARD_PROGRAM),
)[0].toBase58();

export async function auditDevnetRecurring({ rpc, manifest }) {
  const genesis = await rpc("getGenesisHash");
  if (genesis !== DEVNET_GENESIS) throw new Error("Refusing to inspect a non-devnet RPC.");
  if (manifest.network !== "devnet" || manifest.genesisHash !== genesis || !manifest.fundingToken || !Array.isArray(manifest.tokens)) {
    throw new Error("A provisioned devnet public manifest is required.");
  }
  const tokens = [manifest.fundingToken, ...manifest.tokens];
  const addresses = [GUARD_PROGRAM, SUBSCRIPTIONS_PROGRAM, V1_FEATURE, ...tokens.map(token => token.mint)];
  if (new Set(addresses).size !== addresses.length || addresses.length > 100) throw new Error("Invalid or oversized devnet mint catalog.");
  addresses.forEach(address => new PublicKey(address));
  const snapshot = await rpc("getMultipleAccounts", [addresses, { encoding: "jsonParsed", commitment: "confirmed" }]);
  if (!Array.isArray(snapshot.value) || snapshot.value.length !== addresses.length) throw new Error("Incomplete devnet account snapshot.");
  const issues = [];
  const programs = snapshot.value.slice(0, 2).map((account, index) => {
    const address = addresses[index];
    const programData = account?.data?.parsed?.info?.programData;
    if (!account?.executable || account.owner !== LOADER || !programData) issues.push(`Program ${address} is missing or is not an executable upgradeable program.`);
    return { address, executable: Boolean(account?.executable), programData: programData ?? null };
  });
  const programDataAddresses = programs.flatMap(program => program.programData ? [program.programData] : []);
  if (programDataAddresses.length) {
    const data = await rpc("getMultipleAccounts", [programDataAddresses, { encoding: "base64", commitment: "confirmed" }]);
    if (!Array.isArray(data.value) || data.value.length !== programDataAddresses.length) throw new Error("Incomplete program-data snapshot.");
    for (const program of programs) {
      if (!program.programData) continue;
      const value = data.value[programDataAddresses.indexOf(program.programData)];
      const bytes = value?.data?.[1] === "base64" ? Buffer.from(value.data[0], "base64") : Buffer.alloc(0);
      if (value?.owner !== LOADER || bytes.length < 45 || bytes.readUInt32LE(0) !== 3 || bytes[12] > 1) {
        issues.push(`Program data for ${program.address} could not be decoded.`);
        continue;
      }
      program.lastDeployedSlot = bytes.readBigUInt64LE(4).toString();
      program.upgradeAuthority = bytes[12] === 1 ? new PublicKey(bytes.subarray(13, 45)).toBase58() : null;
    }
  }
  const feature = snapshot.value[2];
  const featureInfo = feature?.data?.parsed?.info;
  const featureBytes = feature?.data?.[1] === "base64" ? Buffer.from(feature.data[0], "base64") : null;
  const activatedAt = featureInfo?.activationSlot ?? (featureBytes?.length === 9 && featureBytes[0] === 1 ? Number(featureBytes.readBigUInt64LE(1)) : null);
  const v1Active = feature?.owner === "Feature111111111111111111111111111111111111" && Number.isSafeInteger(activatedAt) && activatedAt <= snapshot.context.slot;
  if (!v1Active) issues.push("V1 transaction activation could not be confirmed.");
  const mints = snapshot.value.slice(3).map((account, index) => {
    const token = tokens[index];
    const info = account?.data?.parsed?.info;
    const errors = [];
    if (account?.owner !== TOKEN_PROGRAM || account?.data?.parsed?.type !== "mint" || !info?.isInitialized || info?.decimals !== token.decimals || info?.freezeAuthority !== null) errors.push("not an initialized unfrozen classic SPL mint with the manifest decimals");
    if (index > 0 && info?.mintAuthority !== MOCK_AUTHORITY) errors.push("mint authority differs from the Guard mock PDA");
    if (errors.length) issues.push(`${token.symbol}: ${errors.join("; ")}.`);
    return { symbol: token.symbol, mint: token.mint, mintAuthority: info?.mintAuthority ?? null, freezeAuthority: info?.freezeAuthority ?? null, decimals: info?.decimals ?? null, valid: !errors.length };
  });
  return {
    network: "devnet", genesis, slot: snapshot.context.slot, transactionsSubmitted: 0,
    authorityChecksPassed: issues.length === 0, contractExecutionVerified: false,
    note: "Account and authority checks do not prove that the deployed binary matches source or that a recurring installment can execute. See docs/devnet-contract-audit.md.",
    mockMintAuthority: MOCK_AUTHORITY, v1Active, programs,
    fundingToken: mints[0], stocksChecked: mints.length - 1,
    stocksWithGuardAuthority: mints.slice(1).filter(mint => mint.valid).length,
    manifestAuthorityMatchesFunding: manifest.mintAuthority === mints[0].mintAuthority,
    issues, mints,
  };
}

async function main() {
  const endpoint = process.env.KITE_RECURRING_RPC_URL || process.env.SOLANA_DEVNET_RPC_URL || "https://api.devnet.solana.com";
  const manifest = JSON.parse(await readFile(new URL("../apps/web/public/xstocks-devnet/xstocks.json", import.meta.url), "utf8"));
  const rpc = async (method, params = []) => {
    if (!["getGenesisHash", "getMultipleAccounts"].includes(method)) throw new Error("This audit only allows read-only RPC methods.");
    const response = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(20_000),
    });
    const result = await response.json();
    if (!response.ok || result.error || !("result" in result)) throw new Error(`Devnet ${method} failed (HTTP ${response.status}); no transactions were submitted.`);
    return result.result;
  };
  const report = await auditDevnetRecurring({ rpc, manifest });
  console.log(JSON.stringify(report, null, 2));
  if (!report.authorityChecksPassed) process.exitCode = 1;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
