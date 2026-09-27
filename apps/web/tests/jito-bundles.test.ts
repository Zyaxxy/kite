import test from "node:test";
import assert from "node:assert/strict";
import {
  getJitoBundleStatus,
  selectJitoTipLamports,
  sendJitoBundle,
} from "../lib/server/jito-bundles";
import { MAINNET_GENESIS } from "../lib/server/mainnet-connection";
import type { BundleStatusAuthorization } from "../lib/server/bundle-authorization";

test("dynamic Jito tips respect minimum, conservative fallback and a hard spending cap", () => {
  assert.equal(selectJitoTipLamports(0.00002), 20000);
  assert.equal(selectJitoTipLamports(100), 100000);
  assert.equal(selectJitoTipLamports(0.000000001), 1000);
  assert.equal(selectJitoTipLamports(undefined), 10000);
  assert.equal(selectJitoTipLamports(NaN), 10000);
  assert.equal(selectJitoTipLamports(0.002, 5000), 5000);
  assert.throws(() => selectJitoTipLamports(0.1, 100001), /between/);
});

const receipt: BundleStatusAuthorization = {
  kind: "kite-bundle-status",
  taker: "unused",
  expiresAt: Date.now() + 60000,
  lastValidBlockHeight: 100,
  signatures: ["signature1", "signature2"],
  basketId: "basket",
  inputMint: "mint",
  inAmount: "200",
};
const confirmed = (slot = 40) => ({
  err: null,
  confirmationStatus: "confirmed",
  slot,
});

test("status requires every signature confirmed in one slot; receipt IDs never mean Success", async () => {
  const previousFetch = globalThis.fetch,
    previousRpc = process.env.SOLANA_RPC_URL;
  process.env.SOLANA_RPC_URL = "https://mainnet.example.test";
  let states: unknown[] = [null, null];
  let genesis = MAINNET_GENESIS;
  let height = 50;
  const methods: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    methods.push(body.method);
    const result =
      body.method === "getGenesisHash"
        ? genesis
        : body.method === "getSignatureStatuses"
          ? { value: states }
          : body.method === "getBlockHeight"
            ? height
            : body.method === "sendBundle"
              ? "a".repeat(64)
              : null;
    return new Response(JSON.stringify({ result }), { status: 200 });
  };
  try {
    assert.equal(await sendJitoBundle(["signed1", "signed2"]), "a".repeat(64));
    assert.equal((await getJitoBundleStatus(receipt)).status, "Pending");
    states = [confirmed(), confirmed()];
    assert.equal((await getJitoBundleStatus(receipt)).status, "Success");
    states = [confirmed(), null];
    assert.equal((await getJitoBundleStatus(receipt)).status, "Unknown");
    states = [confirmed(40), confirmed(41)];
    assert.equal((await getJitoBundleStatus(receipt)).status, "Unknown");
    states = [
      {
        err: { InstructionError: [1, "Custom"] },
        confirmationStatus: "confirmed",
        slot: 40,
      },
      null,
    ];
    assert.equal((await getJitoBundleStatus(receipt)).status, "Unknown");
    states = [null, null];
    height = 101;
    assert.equal((await getJitoBundleStatus(receipt)).status, "Unknown");
    genesis = "devnet-genesis";
    const callCount = methods.length;
    await assert.rejects(
      getJitoBundleStatus(receipt),
      /must use Solana mainnet/,
    );
    assert.deepEqual(methods.slice(callCount), ["getGenesisHash"]);
    assert.ok(
      !methods.includes("sendTransaction"),
      "Never broadcast any individual bundle transaction.",
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousRpc === undefined) delete process.env.SOLANA_RPC_URL;
    else process.env.SOLANA_RPC_URL = previousRpc;
  }
});
