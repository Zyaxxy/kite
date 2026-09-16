import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { auditDevnetRecurring, DEVNET_GENESIS, GUARD_PROGRAM } from "../../../scripts/audit-devnet-recurring.mjs";

const require = createRequire(import.meta.url);
const { PublicKey } = require("@solana/web3.js");
const address = value => new PublicKey(Buffer.alloc(32, value)).toBase58();
const mockAuthority = PublicKey.findProgramAddressSync([Buffer.from("mock_mint_authority")], new PublicKey(GUARD_PROGRAM))[0].toBase58();
const loader = "BPFLoaderUpgradeab1e11111111111111111111111";
function fixture({ genesis = DEVNET_GENESIS, stockAuthority = mockAuthority, activation = 1 } = {}) {
  const calls = [];
  const manifest = {
    network: "devnet", genesisHash: DEVNET_GENESIS, mintAuthority: mockAuthority,
    fundingToken: { symbol: "KUSD", mint: address(1), decimals: 6 },
    tokens: [{ symbol: "xTEST", mint: address(2), decimals: 6 }],
  };
  const mint = mintAuthority => ({ owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", data: { parsed: { type: "mint", info: { isInitialized: true, decimals: 6, mintAuthority, freezeAuthority: null } } } });
  const programData = Buffer.alloc(45);
  programData.writeUInt32LE(3); programData.writeBigUInt64LE(10n, 4);
  const rpc = async (method, params = []) => {
    calls.push(method);
    if (method === "getGenesisHash") return genesis;
    assert.equal(method, "getMultipleAccounts", "audit may only read public chain state");
    if (params[1].encoding === "base64") return { value: params[0].map(() => ({ owner: loader, data: [programData.toString("base64"), "base64"] })) };
    return { context: { slot: 100 }, value: [
      ...[3, 4].map(value => ({ executable: true, owner: loader, data: { parsed: { info: { programData: address(value) } } } })),
      { owner: "Feature111111111111111111111111111111111111", data: { parsed: { info: { activationSlot: activation } } } },
      mint(address(5)), mint(stockAuthority),
    ] };
  };
  return { manifest, rpc, calls };
}

test("authority audit stops at genesis when RPC points at another network", async () => {
  const input = fixture({ genesis: "mainnet" });
  await assert.rejects(() => auditDevnetRecurring(input), /non-devnet/);
  assert.deepEqual(input.calls, ["getGenesisHash"]);
});

test("mock stocks require the Guard PDA while funding may retain the faucet authority", async () => {
  const input = fixture();
  const result = await auditDevnetRecurring(input);
  assert.equal(result.authorityChecksPassed, true);
  assert.equal(result.manifestAuthorityMatchesFunding, false);
  assert.equal(result.stocksWithGuardAuthority, 1);
  assert.equal(result.transactionsSubmitted, 0);
  assert.equal(result.contractExecutionVerified, false);
  assert.deepEqual(input.calls, ["getGenesisHash", "getMultipleAccounts", "getMultipleAccounts"]);
});

test("wrong stock authority and future V1 activation are explicit readiness failures", async () => {
  const result = await auditDevnetRecurring(fixture({ stockAuthority: address(6), activation: 101 }));
  assert.equal(result.authorityChecksPassed, false);
  assert.equal(result.v1Active, false);
  assert.match(result.issues.join(" "), /V1 transaction activation/);
  assert.match(result.issues.join(" "), /mint authority differs/);
});

test("missing or duplicate manifest mints fail without loading private provisioning state", async () => {
  const input = fixture();
  input.manifest.tokens[0].mint = input.manifest.fundingToken.mint;
  await assert.rejects(() => auditDevnetRecurring(input), /Invalid or oversized/);
  assert.deepEqual(input.calls, ["getGenesisHash"]);
});
