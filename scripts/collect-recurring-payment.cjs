#!/usr/bin/env node
/** Run on buyer-controlled infrastructure. Never ship the buyer key in a client bundle. */
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const sdkRequire = createRequire(
  path.resolve(__dirname, "../packages/sdk/package.json"),
);
const { Connection, PublicKey, Keypair } = sdkRequire("@solana/web3.js");
const { getMint, getTransferHook } = sdkRequire("@solana/spl-token");
const {
  MAINNET_SUBSCRIPTIONS_PROGRAM,
  decodeRecurringPayment,
  recurringRemaining,
  buildCollectRecurringInstructions,
  composeMainnetTransaction,
  walletTransactionSignature,
  inspectWalletTransaction,
} = require("../packages/sdk/dist");
const kit = sdkRequire("@solana/kit-v1");
const TX_V1_FEATURE = "txv1aq4pp281K9um3tnPgkfX8UqtFT6wcVW3hNezGLL";
function featureActive(value, slot) {
  return Boolean(
    value &&
    value.owner.toBase58() === "Feature111111111111111111111111111111111111" &&
    value.data.length === 9 &&
    value.data[0] === 1 &&
    value.data.readBigUInt64LE(1) <= BigInt(slot),
  );
}
async function requireV1(connection) {
  const [value, slot] = await Promise.all([
    connection.getAccountInfo(new PublicKey(TX_V1_FEATURE)),
    connection.getSlot("confirmed"),
  ]);
  if (!featureActive(value, slot))
    throw new Error(
      "Buyer collection requires activated V1 on mainnet. No transaction was submitted.",
    );
}
async function signV1Collection(encoded, secretKey) {
  const { transaction, message } = await inspectWalletTransaction(encoded);
  if (message.version !== 1)
    throw new Error("Buyer collection requires a V1 transaction.");
  const keypair = await kit.createKeyPairFromBytes(secretKey);
  const signed = await kit.signTransaction([keypair], transaction);
  return Buffer.from(kit.getTransactionEncoder().encode(signed)).toString(
    "base64",
  );
}
function writeState(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(temporary, "w", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(value));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temporary, file);
  const parent = fs.openSync(path.dirname(file), "r");
  try {
    fs.fsyncSync(parent);
  } finally {
    fs.closeSync(parent);
  }
}
const delegation = process.argv[2];
const watch = process.argv.includes("--watch");
const genesis = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
let stop = false;
process.on("SIGINT", () => {
  stop = true;
});
process.on("SIGTERM", () => {
  stop = true;
});
async function main() {
  if (
    !delegation ||
    !process.env.KITE_BUYER_KEYPAIR_PATH ||
    !process.env.SOLANA_RPC_URL
  )
    throw new Error(
      "Configure SOLANA_RPC_URL, KITE_BUYER_KEYPAIR_PATH and pass a delegation address. Add --watch for recurring collection.",
    );
  const account = new PublicKey(delegation);
  const endpoint = new URL(process.env.SOLANA_RPC_URL);
  if (endpoint.protocol !== "https:")
    throw new Error("Buyer collection requires an HTTPS mainnet RPC.");
  const connection = new Connection(endpoint.toString(), "confirmed");
  if ((await connection.getGenesisHash()) !== genesis)
    throw new Error("Buyer collection requires Solana mainnet.");
  await requireV1(connection);
  const rpc = async (method, params) => {
    const response = await fetch(endpoint.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok || data.error || !("result" in data))
      throw new Error("Mainnet RPC unavailable.");
    return data.result;
  };
  const key = Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(fs.readFileSync(process.env.KITE_BUYER_KEYPAIR_PATH, "utf8")),
    ),
  );
  const statePath = path.resolve(
    process.env.KITE_COLLECTION_STATE_DIR || ".kite-collections",
    `${delegation}.json`,
  );
  fs.mkdirSync(path.dirname(statePath), { recursive: true, mode: 0o700 });
  const lockPath = statePath + ".lock";
  const lock = fs.openSync(lockPath, "wx", 0o600);
  try {
    do {
      const info = await connection.getAccountInfo(account);
      if (!info || info.owner.toBase58() !== MAINNET_SUBSCRIPTIONS_PROGRAM)
        throw new Error("Delegation missing or revoked.");
      const { payment } = await decodeRecurringPayment(delegation, info.data);
      if (payment.buyer !== key.publicKey.toBase58())
        throw new Error("This signer is not the authorized buyer.");
      const now = Math.floor(Date.now() / 1000);
      if (payment.expiresAt && payment.expiresAt <= now) {
        console.log("Permission expired. Collection stopped.");
        break;
      }
      const remaining = recurringRemaining(payment, now);
      const previous = fs.existsSync(statePath)
        ? JSON.parse(fs.readFileSync(statePath, "utf8"))
        : null;
      if (previous?.status === "Unknown") {
        const status = (
          await connection.getSignatureStatuses([previous.signature], {
            searchTransactionHistory: true,
          })
        ).value[0];
        if (status?.err) {
          previous.status = "Failed";
          writeState(statePath, previous);
        } else if (
          status?.confirmationStatus === "confirmed" ||
          status?.confirmationStatus === "finalized"
        ) {
          previous.status = "Success";
          writeState(statePath, previous);
        } else
          throw new Error(
            "Previous collection outcome is unknown. Resolve its signature before restarting; no repeat was submitted.",
          );
      }
      // A keeper collects once per period. Another delegatee client may consume the allowance;
      // the program remains the authority and simulation rejects concurrent overspending.
      if (
        remaining.amount > 0n &&
        !(
          previous?.status === "Success" &&
          previous.periodStartedAt === remaining.periodStartedAt
        )
      ) {
        const mintInfo = await connection.getAccountInfo(
          new PublicKey(payment.mint),
        );
        if (!mintInfo) throw new Error("Funding mint missing.");
        const mint = await getMint(
          connection,
          new PublicKey(payment.mint),
          "confirmed",
          mintInfo.owner,
        );
        if (getTransferHook(mint))
          throw new Error(
            "This collector does not support transfer-hook tokens.",
          );
        const instructions = await buildCollectRecurringInstructions(
          payment,
          remaining.amount,
          mintInfo.owner.toBase58(),
        );
        await requireV1(connection);
        const lifetime = await connection.getLatestBlockhash();
        const built = await composeMainnetTransaction({
          payer: payment.buyer,
          ...lifetime,
          instructions,
          allowV1: true,
          computeUnitLimit: 300000,
        });
        const signed = await signV1Collection(built.transaction, key.secretKey);
        const simulation = await rpc("simulateTransaction", [
          signed,
          { encoding: "base64", sigVerify: true, commitment: "confirmed" },
        ]);
        if (simulation.value.err)
          throw new Error(
            "Collection simulation failed. No transfer submitted. Check token funds, authority and SOL fees.",
          );
        const signature = await walletTransactionSignature(signed);
        const entry = {
          status: "Unknown",
          signature,
          periodStartedAt: remaining.periodStartedAt,
          lastValidBlockHeight: lifetime.lastValidBlockHeight,
          amount: remaining.amount.toString(),
        };
        // Durable intent before network I/O. Do not retry unknown outcomes with a new blockhash.
        writeState(statePath, entry);
        console.log(`Submitting collection ${signature}`);
        await rpc("sendTransaction", [
          signed,
          {
            encoding: "base64",
            skipPreflight: false,
            preflightCommitment: "confirmed",
            maxRetries: 2,
          },
        ]);
        const confirmation = await connection.confirmTransaction(
          { signature, ...lifetime },
          "confirmed",
        );
        entry.status = confirmation.value.err ? "Failed" : "Success";
        writeState(statePath, entry);
        console.log(`Collection ${entry.status}: ${signature}`);
      } else console.log("No collection due.");
      if (watch && !stop)
        await new Promise((resolve) => setTimeout(resolve, 60000));
    } while (watch && !stop);
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  }
}
module.exports = { featureActive, signV1Collection };
if (require.main === module)
  main().catch((error) => {
    // RPC exceptions can contain provider credentials. Print only our own known messages.
    const safe = [
      "Configure ",
      "Buyer collection requires",
      "This signer",
      "Delegation missing",
      "Previous collection outcome",
      "Funding mint",
      "This collector",
      "Collection simulation",
    ];
    console.error(
      safe.some((prefix) => error.message?.startsWith(prefix))
        ? error.message
        : "Collection stopped. Check provider availability and the local collection ledger before restarting.",
    );
    process.exitCode = 1;
  });
