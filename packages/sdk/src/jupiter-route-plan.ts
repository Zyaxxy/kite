import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ExtensionType,
  METADATA_POINTER_SIZE,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  unpackMint,
} from "@solana/spl-token";

const MAX_ROUTE_HOPS = 64;

function mintAddress(value: unknown): string {
  if (typeof value !== "string" || value.length < 32 || value.length > 44)
    throw new Error("The Jupiter route plan contains an invalid mint.");
  try {
    if (new PublicKey(value).toBase58() === value) return value;
  } catch {
    // Keep malformed addresses within the route validation error boundary.
  }
  throw new Error("The Jupiter route plan contains an invalid mint.");
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reachableFrom(
  start: string,
  graph: ReadonlyMap<string, readonly string[]>,
): Set<string> {
  const reached = new Set([start]);
  const pending = [start];
  for (let index = 0; index < pending.length; index++) {
    for (const next of graph.get(pending[index]) ?? []) {
      if (reached.has(next)) continue;
      reached.add(next);
      pending.push(next);
    }
  }
  return reached;
}

/**
 * Identify candidate intermediate mints on the quoted input-to-output paths.
 * Metadata alone does not authorize account creation: callers must also verify
 * the mint program, canonical owner ATA and its use in the swap instruction.
 */
export function getJupiterIntermediateMints(
  routePlan: unknown,
  inputMint: string,
  outputMint: string,
): ReadonlySet<string> {
  mintAddress(inputMint);
  mintAddress(outputMint);
  if (
    inputMint === outputMint ||
    !Array.isArray(routePlan) ||
    routePlan.length === 0 ||
    routePlan.length > MAX_ROUTE_HOPS
  )
    throw new Error("The Jupiter route plan is missing or exceeds its limits.");

  const forward = new Map<string, string[]>();
  const backward = new Map<string, string[]>();
  const edges: Array<readonly [string, string]> = [];
  for (const step of routePlan) {
    if (!record(step) || !record(step.swapInfo))
      throw new Error("The Jupiter route plan contains an invalid swap step.");
    const source = mintAddress(step.swapInfo.inputMint);
    const destination = mintAddress(step.swapInfo.outputMint);
    if (source === destination)
      throw new Error("The Jupiter route plan contains a same-mint swap step.");
    edges.push([source, destination]);
    forward.set(source, [...(forward.get(source) ?? []), destination]);
    backward.set(destination, [...(backward.get(destination) ?? []), source]);
  }

  const fromInput = reachableFrom(inputMint, forward);
  const toOutput = reachableFrom(outputMint, backward);
  if (
    !fromInput.has(outputMint) ||
    edges.some(
      ([source, destination]) =>
        !fromInput.has(source) || !toOutput.has(destination),
    )
  )
    throw new Error("The Jupiter route plan contains an unrelated swap path.");

  return new Set(
    [...fromInput].filter((mint) => mint !== inputMint && mint !== outputMint),
  );
}

/** Verify an intermediate mint read from the independently checked mainnet RPC. */
export function validateJupiterIntermediateMint(
  mint: string,
  account: {
    owner: string;
    data: Uint8Array;
    executable: boolean;
  } | null,
): string {
  try {
    const address = new PublicKey(mintAddress(mint));
    if (
      !account ||
      account.executable !== false ||
      ![TOKEN_PROGRAM_ID.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58()].includes(
        account.owner,
      )
    )
      throw new Error("Unsupported mint account.");
    const program = new PublicKey(account.owner);
    const data = Buffer.from(account.data);
    if (program.equals(TOKEN_PROGRAM_ID) && data.length !== MINT_SIZE)
      throw new Error("Legacy mints cannot contain extensions.");
    const decoded = unpackMint(
      address,
      { owner: program, data, executable: false, lamports: 0 },
      program,
    );
    if (!decoded.isInitialized || decoded.decimals > 18)
      throw new Error("Uninitialized mint or unsupported precision.");

    // Validate TLV boundaries too: the SPL extension-list helper alone permits
    // a declared extension length to advance beyond the end of its buffer.
    const extensions = new Set<number>();
    for (let offset = 0; offset < decoded.tlvData.length;) {
      if (decoded.tlvData.length - offset < 4)
        throw new Error("Truncated mint extension.");
      const type = decoded.tlvData.readUInt16LE(offset);
      const length = decoded.tlvData.readUInt16LE(offset + 2);
      const end = offset + 4 + length;
      if (
        end > decoded.tlvData.length ||
        extensions.has(type) ||
        (type !== ExtensionType.MetadataPointer &&
          type !== ExtensionType.TokenMetadata) ||
        (type === ExtensionType.MetadataPointer &&
          length !== METADATA_POINTER_SIZE) ||
        // TokenMetadata has two keys and four length prefixes before any text.
        (type === ExtensionType.TokenMetadata && length < 80)
      )
        throw new Error("Unsupported or malformed mint extension.");
      extensions.add(type);
      offset = end;
    }
    return program.toBase58();
  } catch {
    throw new Error(
      "A route uses an invalid or unsupported intermediate token mint.",
    );
  }
}

/**
 * Normalize only a missing account or the exact closed-account state returned
 * by simulation. Callers must still reject a decrease from a starting balance.
 * Prefunded System accounts are not closed token accounts.
 */
export function isClosedJupiterTokenAccount(
  account: {
    owner: string;
    data: readonly [string, string];
    executable: boolean;
    lamports: number;
  } | null,
): boolean {
  if (account === null) return true;
  return (
    typeof account === "object" &&
    account !== undefined &&
    account.owner === SystemProgram.programId.toBase58() &&
    account.executable === false &&
    Array.isArray(account.data) &&
    account.data.length === 2 &&
    account.data[0] === "" &&
    account.data[1] === "base64" &&
    Object.is(account.lamports, 0)
  );
}

/**
 * Effective WSOL includes lamports deposited before SyncNative updates the
 * encoded amount. The caller must verify the native mint, token program and
 * wallet owner before using this balance.
 */
export function getJupiterNativeTokenBalance(account: {
  data: Uint8Array;
  lamports: number;
}): bigint {
  const invalid = () =>
    new Error("The route uses a malformed native SOL token account.");
  if (
    !account ||
    !(account.data instanceof Uint8Array) ||
    account.data.byteLength < 165 ||
    !Number.isSafeInteger(account.lamports) ||
    account.lamports < 0
  )
    throw invalid();
  const data = Buffer.from(account.data);
  // SPL Account.is_native is a four-byte COption followed by its u64 reserve.
  if (data.readUInt32LE(109) !== 1) throw invalid();
  const reserve = data.readBigUInt64LE(113);
  const lamports = BigInt(account.lamports);
  if (lamports < reserve) throw invalid();
  const effective = lamports - reserve;
  if (data.readBigUInt64LE(64) > effective) throw invalid();
  return effective;
}
