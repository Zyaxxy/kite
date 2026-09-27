import test from "node:test";
import assert from "node:assert/strict";
import {
  assertNativeSigningReview,
  assertSignedPayloads,
  walletAuthorizationKey,
  type NativeSigningReview,
} from "../src/lib/mobile-wallet-policy";
import {
  DevnetRecurringClient,
  assertDevnetRecurringReview,
} from "../../../packages/sdk/src/client/recurring-client";

const account = { address: "owner", supportedTransactionVersions: [0] };
const review: NativeSigningReview = {
  signer: "owner",
  network: "mainnet",
  transactionVersion: 0,
  expiresAt: 2_000,
  transactions: ["AQIDBA==", "BQYHCA=="],
};

test("native basket approvals require the exact owner, live review and advertised version", () => {
  assert.doesNotThrow(() =>
    assertNativeSigningReview(review, account, "mainnet", 1_000),
  );
  assert.throws(
    () =>
      assertNativeSigningReview(
        review,
        { ...account, address: "another-owner" },
        "mainnet",
        1_000,
      ),
    /wallet changed/,
  );
  assert.throws(
    () => assertNativeSigningReview(review, account, "mainnet", 2_000),
    /expired/,
  );
  assert.throws(
    () =>
      assertNativeSigningReview(
        review,
        { ...account, supportedTransactionVersions: [1] },
        "mainnet",
        1_000,
      ),
    /V0/,
  );
});
test("devnet authorizations cannot reuse mainnet sessions or batch basket signing", () => {
  assert.notEqual(
    walletAuthorizationKey("devnet"),
    walletAuthorizationKey("mainnet"),
  );
  assert.throws(
    () => assertNativeSigningReview(review, account, "devnet", 1_000),
    /network/,
  );
  assert.throws(
    () =>
      assertNativeSigningReview(
        { ...review, network: "devnet" },
        account,
        "devnet",
        1_000,
      ),
    /Only reviewed mainnet/,
  );
});
test("partial or malformed wallet signature responses never proceed to broadcast", () => {
  assert.doesNotThrow(() => assertSignedPayloads(["AQIDBA==", "BQYHCA=="], 2));
  assert.throws(() => assertSignedPayloads(["AQIDBA=="], 2), /every signed/);
  assert.throws(() => assertSignedPayloads(["<html>"], 1), /every signed/);
  assert.throws(
    () =>
      assertNativeSigningReview(
        { ...review, transactions: [] },
        account,
        "mainnet",
        1_000,
      ),
    /payload/,
  );
});
test("recurring client rejects mainnet service responses and another owner's plan list", async () => {
  const fetcher: typeof fetch = async () =>
    new Response(JSON.stringify({ network: "mainnet", plans: [] }), {
      headers: { "content-type": "application/json" },
    });
  const client = new DevnetRecurringClient({
    baseUrl: "https://kite.example",
    fetcher,
  });
  await assert.rejects(client.plans("owner"), /invalid network or wallet/);
  await assert.rejects(client.config(), /valid devnet configuration/);
});
test("recurring client routes signed payloads only to devnet execution API, with no keeper bearer", async () => {
  let path = "";
  let request: RequestInit | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    path = String(input);
    request = init;
    return new Response(
      JSON.stringify({
        status: "confirmed",
        signature: "test-receipt",
        explorerUrl: "https://explorer.solana.com/tx/test?cluster=devnet",
      }),
      { headers: { "content-type": "application/json" } },
    );
  };
  const client = new DevnetRecurringClient({
    baseUrl: "https://kite.example",
    fetcher,
  });
  await client.execute({
    authorization: "review-authorization",
    signedTransaction: "AQIDBA==",
  });
  assert.equal(path, "https://kite.example/api/recurring/execute");
  assert.equal(new Headers(request?.headers).has("authorization"), false);
  assert.equal(JSON.parse(String(request?.body)).schemaVersion, 1);
});
test("recurring reviews fail closed when terms or network do not match", () => {
  const close = {
    schemaVersion: 1,
    protocolVersion: 2,
    network: "devnet",
    signer: "owner",
    transactionVersion: 0,
    transaction: "AQIDBA==",
    authorization: "review-auth",
    plan: "plan",
    operation: "close",
    expiresAt: 2_000,
  };
  assert.doesNotThrow(() => assertDevnetRecurringReview(close, "owner"));
  assert.throws(
    () =>
      assertDevnetRecurringReview({ ...close, network: "mainnet" }, "owner"),
    /valid devnet/,
  );
  assert.throws(
    () =>
      assertDevnetRecurringReview({ ...close, operation: "create" }, "owner"),
    /missing its reviewed/,
  );
});
