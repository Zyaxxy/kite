import {
  AddressLookupTableAccount,
  AddressLookupTableProgram,
  PublicKey,
} from "@solana/web3.js";
import { mainnetRpc, type RpcAccount } from "./composed-transactions";

/** Only tables named by Jupiter are loaded; the RPC's real table contents are authoritative. */
export async function loadVerifiedLookupTables(
  mappings: (Record<string, string[]> | null)[],
  rpc: typeof mainnetRpc = mainnetRpc,
): Promise<AddressLookupTableAccount[]> {
  const required = new Map<string, string[]>();
  for (const mapping of mappings) {
    if (!mapping) continue;
    for (const [key, addresses] of Object.entries(mapping)) {
      if (
        new PublicKey(key).toBase58() !== key ||
        !Array.isArray(addresses) ||
        addresses.length > 256
      )
        throw new Error("Invalid Jupiter lookup table metadata.");
      const previous = required.get(key);
      if (
        previous &&
        previous.some((address, index) => addresses[index] !== address)
      )
        throw new Error("Jupiter returned inconsistent lookup table metadata.");
      required.set(key, addresses);
    }
  }
  if (!required.size) return [];
  if (required.size > 32)
    throw new Error("Too many lookup tables for this basket.");
  const keys = [...required.keys()];
  const { value } = await rpc<{ value: RpcAccount[] }>("getMultipleAccounts", [
    keys,
    { encoding: "base64", commitment: "confirmed" },
  ]);
  if (value.length !== keys.length)
    throw new Error("Mainnet lookup tables are unavailable.");
  return value.map((account, i) => {
    if (
      !account ||
      account.executable ||
      account.owner !== AddressLookupTableProgram.programId.toBase58()
    )
      throw new Error(
        "Jupiter lookup table is not owned by the mainnet lookup-table program.",
      );
    const state = AddressLookupTableAccount.deserialize(
      Buffer.from(account.data[0], "base64"),
    );
    if (
      state.deactivationSlot !== BigInt("18446744073709551615") ||
      required
        .get(keys[i])!
        .some(
          (address, index) => state.addresses[index]?.toBase58() !== address,
        )
    )
      throw new Error(
        "Jupiter lookup table changed or is deactivated. Request a new quote.",
      );
    return new AddressLookupTableAccount({
      key: new PublicKey(keys[i]),
      state,
    });
  });
}
