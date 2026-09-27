import test from "node:test";
import assert from "node:assert/strict";
import {
  AddressLookupTableProgram,
  Keypair,
  SystemProgram,
} from "@solana/web3.js";
import { loadVerifiedLookupTables } from "../lib/server/jupiter-lookup-tables";
import type {
  mainnetRpc,
  RpcAccount,
} from "../lib/server/composed-transactions";

const tableKey = Keypair.fromSeed(
  new Uint8Array(32).fill(1),
).publicKey.toBase58();
const address = Keypair.fromSeed(new Uint8Array(32).fill(2)).publicKey;
const map = { [tableKey]: [address.toBase58()] };
function tableAccount(active = true): NonNullable<RpcAccount> {
  const data = Buffer.alloc(88);
  data.writeUInt32LE(1, 0);
  data.writeBigUInt64LE(
    active ? BigInt("18446744073709551615") : BigInt(100),
    4,
  );
  address.toBuffer().copy(data, 56);
  return {
    executable: false,
    lamports: 1,
    owner: AddressLookupTableProgram.programId.toBase58(),
    data: [data.toString("base64"), "base64"],
  };
}
const reader =
  (account: RpcAccount): typeof mainnetRpc =>
  async <T>(method: string, params?: unknown[]) => {
    assert.equal(method, "getMultipleAccounts");
    assert.deepEqual(params?.[0], [tableKey]);
    return { value: [account] } as T;
  };

test("lookup tables use actual mainnet account data and reject owner, contents and activation mismatches", async () => {
  const loaded = await loadVerifiedLookupTables(
    [map, map],
    reader(tableAccount()),
  );
  assert.equal(loaded.length, 1);
  assert.ok(loaded[0].state.addresses[0].equals(address));
  await assert.rejects(
    loadVerifiedLookupTables([map], reader(null)),
    /not owned/,
  );
  await assert.rejects(
    loadVerifiedLookupTables(
      [map],
      reader({ ...tableAccount(), owner: SystemProgram.programId.toBase58() }),
    ),
    /not owned/,
  );
  await assert.rejects(
    loadVerifiedLookupTables([map], reader(tableAccount(false))),
    /deactivated/,
  );
  await assert.rejects(
    loadVerifiedLookupTables(
      [{ [tableKey]: [SystemProgram.programId.toBase58()] }],
      reader(tableAccount()),
    ),
    /changed/,
  );
  await assert.rejects(
    loadVerifiedLookupTables(
      [map, { [tableKey]: [SystemProgram.programId.toBase58()] }],
      reader(tableAccount()),
    ),
    /inconsistent/,
  );
});
