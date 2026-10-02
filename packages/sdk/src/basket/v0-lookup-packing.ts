import {
  AddressLookupTableAccount,
  MessageV0,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
} from "@solana/web3.js";

/** Exact transaction wire size, before web3.js writes into its fixed buffer. */
function wireLength(message: MessageV0): number {
  const shortvec = (length: number) =>
    length < 128 ? 1 : length < 16384 ? 2 : 3;
  return (
    shortvec(message.header.numRequiredSignatures) +
    64 * message.header.numRequiredSignatures +
    1 +
    3 +
    shortvec(message.staticAccountKeys.length) +
    32 * message.staticAccountKeys.length +
    32 +
    shortvec(message.compiledInstructions.length) +
    message.compiledInstructions.reduce(
      (total, ix) =>
        total +
        1 +
        shortvec(ix.accountKeyIndexes.length) +
        ix.accountKeyIndexes.length +
        shortvec(ix.data.length) +
        ix.data.length,
      0,
    ) +
    shortvec(message.addressTableLookups.length) +
    message.addressTableLookups.reduce(
      (total, table) =>
        total +
        32 +
        shortvec(table.writableIndexes.length) +
        table.writableIndexes.length +
        shortvec(table.readonlyIndexes.length) +
        table.readonlyIndexes.length,
      0,
    )
  );
}

/** Move selected loaded keys to static slots without changing any ALT's indexes. */
function keepAccountsStatic(
  message: MessageV0,
  tables: AddressLookupTableAccount[],
  instructions: TransactionInstruction[],
  requiredStatic: ReadonlySet<string>,
): MessageV0 {
  if (!requiredStatic.size || !message.addressTableLookups.length)
    return message;
  const loaded = message.resolveAddressTableLookups(tables);
  const selected = (key: PublicKey) => requiredStatic.has(key.toBase58());
  const writable = loaded.writable.filter(selected);
  const readonly = loaded.readonly.filter(selected);
  if (!writable.length && !readonly.length) return message;
  const tableByKey = new Map(
    tables.map((table) => [table.key.toBase58(), table]),
  );
  const writableEnd =
    message.staticAccountKeys.length -
    message.header.numReadonlyUnsignedAccounts;
  const result = new MessageV0({
    header: {
      ...message.header,
      numReadonlyUnsignedAccounts:
        message.header.numReadonlyUnsignedAccounts + readonly.length,
    },
    staticAccountKeys: [
      ...message.staticAccountKeys.slice(0, writableEnd),
      ...writable,
      ...message.staticAccountKeys.slice(writableEnd),
      ...readonly,
    ],
    recentBlockhash: message.recentBlockhash,
    compiledInstructions: [],
    addressTableLookups: message.addressTableLookups
      .map((lookup) => {
        const table = tableByKey.get(lookup.accountKey.toBase58());
        if (!table) throw new Error("Missing verified lookup table.");
        const keepIndex = (index: number) => {
          const address = table.state.addresses[index];
          if (!address) throw new Error("Invalid lookup table index.");
          return !selected(address);
        };
        return {
          accountKey: lookup.accountKey,
          writableIndexes: lookup.writableIndexes.filter(keepIndex),
          readonlyIndexes: lookup.readonlyIndexes.filter(keepIndex),
        };
      })
      .filter(
        (lookup) =>
          lookup.writableIndexes.length || lookup.readonlyIndexes.length,
      ),
  });
  // Recompile against the new static/loaded ordering rather than shifting
  // indexes manually. The original instructions and verified tables are intact.
  result.compiledInstructions = result
    .getAccountKeys({ addressLookupTableAccounts: tables })
    .compileInstructions(instructions);
  return result;
}

function compactLookupOrder(
  payer: PublicKey,
  instructions: TransactionInstruction[],
  tables: AddressLookupTableAccount[],
  requiredStatic: ReadonlySet<string>,
): AddressLookupTableAccount[] {
  const eligible = new Set<string>();
  const excluded = new Set([payer.toBase58(), ...requiredStatic]);
  for (const instruction of instructions) {
    excluded.add(instruction.programId.toBase58());
    for (const account of instruction.keys) {
      const key = account.pubkey.toBase58();
      if (account.isSigner) excluded.add(key);
      else eligible.add(key);
    }
  }
  for (const key of excluded) eligible.delete(key);
  const candidates = tables.map((table) => ({
    table,
    keys: new Set(
      table.state.addresses
        .map((address) => address.toBase58())
        .filter((address) => eligible.has(address)),
    ),
  }));
  const ordered: AddressLookupTableAccount[] = [];
  while (eligible.size) {
    let best = -1;
    // One loaded key costs more bytes than keeping that key static.
    let bestCount = 1;
    for (let index = 0; index < candidates.length; index++) {
      const count = [...candidates[index].keys].filter((key) =>
        eligible.has(key),
      ).length;
      if (count > bestCount) {
        best = index;
        bestCount = count;
      }
    }
    if (best < 0) break;
    const candidate = candidates.splice(best, 1)[0];
    ordered.push(candidate.table);
    for (const key of candidate.keys) eligible.delete(key);
  }
  return ordered;
}

/** Compare three bounded candidates; retain the original packing as a baseline. */
export function compilePackedV0Message(params: {
  payer: PublicKey;
  blockhash: string;
  instructions: TransactionInstruction[];
  lookupTables: AddressLookupTableAccount[];
  staticAccountKeys: readonly PublicKey[];
}): { message: MessageV0; wireLength: number } {
  const requiredStatic = new Set(
    params.staticAccountKeys.map((key) => key.toBase58()),
  );
  const orders = [params.lookupTables];
  if (params.lookupTables.length) {
    orders.push([]);
    orders.push(
      compactLookupOrder(
        params.payer,
        params.instructions,
        params.lookupTables,
        requiredStatic,
      ),
    );
  }
  let best: { message: MessageV0; wireLength: number } | undefined;
  for (const tables of orders) {
    const message = keepAccountsStatic(
      new TransactionMessage({
        payerKey: params.payer,
        recentBlockhash: params.blockhash,
        instructions: params.instructions,
      }).compileToV0Message(tables),
      tables,
      params.instructions,
      requiredStatic,
    );
    const length = wireLength(message);
    if (!best || length < best.wireLength)
      best = { message, wireLength: length };
  }
  return best!;
}
