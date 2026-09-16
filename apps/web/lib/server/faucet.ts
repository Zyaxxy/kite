import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  transfer,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { DEVNET_GENESIS_HASH } from "@kite/sdk";
import manifestJson from "../../public/xstocks-devnet/xstocks.json";

const KUSD_MINT =
  manifestJson.fundingToken?.mint ||
  "jaViZzZ2ezVSKXZvyQnrmasSyBWVU5n8VMx4ZuAovjM";
const KUSD_DECIMALS = manifestJson.fundingToken?.decimals ?? 6;
const DEFAULT_KUSD_AMOUNT = 500;
const MIN_SOL_THRESHOLD = 0.05 * LAMPORTS_PER_SOL;
const SOL_TOPUP_AMOUNT = 0.1 * LAMPORTS_PER_SOL;
const COOLDOWN_MS = 15_000; // 15s per wallet rate limit

const recipientLastClaim = new Map<string, number>();

/**
 * Parses a 64-byte Solana Keypair from environment variables.
 * Supports:
 * - JSON array of 64 numbers: [1,2,3...]
 * - 128-char hex string: a1b2c3...
 * - 88-char base64 string
 *
 * Does NOT access the local filesystem or look for id.json.
 * Completely serverless and deployment ready (Vercel, Render, Docker).
 */
function parseKeypairFromEnv(): Keypair | null {
  const raw = (
    process.env.KITE_FAUCET_SECRET_KEY ||
    process.env.KITE_FAUCET_PRIVATE_KEY ||
    ""
  ).trim();

  if (!raw) return null;

  try {
    let bytes: Uint8Array | null = null;
    if (raw.startsWith("[") && raw.endsWith("]")) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === 64) {
        bytes = Uint8Array.from(parsed);
      }
    } else if (raw.length === 128 && /^[0-9a-fA-F]+$/.test(raw)) {
      bytes = Uint8Array.from(Buffer.from(raw, "hex"));
    } else if (raw.length === 88) {
      const buf = Buffer.from(raw, "base64");
      if (buf.length === 64) bytes = Uint8Array.from(buf);
    }

    if (!bytes || bytes.length !== 64) {
      console.warn("KITE_FAUCET_SECRET_KEY must be a 64-byte keypair (JSON array, hex, or base64).");
      return null;
    }

    return Keypair.fromSecretKey(bytes);
  } catch (error) {
    console.warn("Failed to parse KITE_FAUCET_SECRET_KEY:", error);
    return null;
  }
}

export function isFaucetConfigured(): boolean {
  return parseKeypairFromEnv() !== null;
}

export function getFaucetStatus() {
  const keypair = parseKeypairFromEnv();
  if (!keypair) {
    return {
      available: false,
      network: "devnet",
      fundingMint: KUSD_MINT,
      faucetAddress: null,
      reason: "Faucet secret key is not configured in environment variables.",
    };
  }

  return {
    available: true,
    network: "devnet",
    fundingMint: KUSD_MINT,
    faucetAddress: keypair.publicKey.toBase58(),
  };
}

export async function requestDevnetFunds(
  recipientAddress: string,
  kusdAmount = DEFAULT_KUSD_AMOUNT,
) {
  let recipientPubkey: PublicKey;
  try {
    recipientPubkey = new PublicKey(recipientAddress);
  } catch {
    throw new Error("Invalid recipient wallet address.");
  }

  if (PublicKey.isOnCurve(recipientPubkey.toBytes()) === false) {
    throw new Error("Recipient address must be a valid on-curve wallet address.");
  }

  const faucetKeypair = parseKeypairFromEnv();
  if (!faucetKeypair) {
    throw new Error(
      "Devnet faucet is not configured on this deployment. Set KITE_FAUCET_SECRET_KEY in server environment variables.",
    );
  }

  const now = Date.now();
  const lastClaim = recipientLastClaim.get(recipientPubkey.toBase58());
  if (lastClaim && now - lastClaim < COOLDOWN_MS) {
    const remainingSecs = Math.ceil((COOLDOWN_MS - (now - lastClaim)) / 1000);
    throw new Error(
      `Please wait ${remainingSecs}s before requesting faucet funds again.`,
    );
  }

  const rpcUrl =
    process.env.KITE_RECURRING_RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  const genesis = await connection.getGenesisHash();
  if (genesis !== DEVNET_GENESIS_HASH) {
    throw new Error(
      "Refusing faucet operation: configured RPC is not Solana devnet.",
    );
  }

  // 1. Top up devnet SOL if recipient has less than 0.05 SOL for transaction fees
  let solSent = 0;
  const currentSolBalance = await connection.getBalance(recipientPubkey);
  if (currentSolBalance < MIN_SOL_THRESHOLD) {
    try {
      const faucetSolBalance = await connection.getBalance(
        faucetKeypair.publicKey,
      );
      if (faucetSolBalance > SOL_TOPUP_AMOUNT + 10_000) {
        const solTx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: faucetKeypair.publicKey,
            toPubkey: recipientPubkey,
            lamports: SOL_TOPUP_AMOUNT,
          }),
        );
        await sendAndConfirmTransaction(connection, solTx, [faucetKeypair], {
          commitment: "confirmed",
        });
        solSent = SOL_TOPUP_AMOUNT / LAMPORTS_PER_SOL;
      }
    } catch {
      // Ignore SOL top-up errors to allow KUSD transfer to proceed
    }
  }

  // 2. Ensure both faucet and recipient have Associated Token Accounts for KUSD
  const mintPubkey = new PublicKey(KUSD_MINT);
  const faucetAta = await getOrCreateAssociatedTokenAccount(
    connection,
    faucetKeypair,
    mintPubkey,
    faucetKeypair.publicKey,
    false,
    "confirmed",
    { commitment: "confirmed" },
    TOKEN_PROGRAM_ID,
  );

  const recipientAta = await getOrCreateAssociatedTokenAccount(
    connection,
    faucetKeypair,
    mintPubkey,
    recipientPubkey,
    false,
    "confirmed",
    { commitment: "confirmed" },
    TOKEN_PROGRAM_ID,
  );

  // 3. Transfer KUSD
  const rawAmount = BigInt(Math.round(kusdAmount * 10 ** KUSD_DECIMALS));
  const transferSig = await transfer(
    connection,
    faucetKeypair,
    faucetAta.address,
    recipientAta.address,
    faucetKeypair,
    rawAmount,
    [],
    { commitment: "confirmed" },
    TOKEN_PROGRAM_ID,
  );

  recipientLastClaim.set(recipientPubkey.toBase58(), now);

  return {
    ok: true,
    recipient: recipientPubkey.toBase58(),
    recipientAta: recipientAta.address.toBase58(),
    kusdAmount,
    solAirdropped: solSent,
    signature: transferSig,
    solscanUrl: `https://solscan.io/tx/${transferSig}?cluster=devnet`,
  };
}
