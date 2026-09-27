import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeBundleReceipt,
  parsePendingMainnetExecution,
  type PendingMainnetExecution,
} from "../lib/pending-mainnet";

const saved: PendingMainnetExecution = {
  version: 2,
  walletAddress: "11111111111111111111111111111111",
  requestId: "request",
  signature: "1".repeat(88),
  signatures: ["1".repeat(88), "2".repeat(88)],
  bundle: {
    signedTransactions: ["signed-first", "signed-second"],
    authorization: "reviewed-quote-authorization",
    recoveryExpiresAt: 12345,
  },
};
test("pending bundle persists its original review and every signature before receiving a bundle ID", () => {
  assert.deepEqual(parsePendingMainnetExecution(JSON.stringify(saved)), saved);
  assert.equal(parsePendingMainnetExecution(null), null);
  const legacy = {
    walletAddress: saved.walletAddress,
    requestId: "legacy",
    signature: saved.signature,
  };
  assert.deepEqual(
    parsePendingMainnetExecution(JSON.stringify(legacy)),
    legacy,
  );
});
test("a failed receipt poll preserves all signed recovery material and existing receipt authorization", () => {
  const receipt = {
    ...saved,
    bundleId: "a".repeat(64),
    statusAuthorization: "status-proof",
  };
  assert.deepEqual(
    mergeBundleReceipt(receipt, { status: "Unknown", signatures: [] }),
    receipt,
  );
  assert.throws(
    () =>
      mergeBundleReceipt(receipt, {
        status: "Success",
        signatures: ["3".repeat(88), "4".repeat(88)],
      }),
    /does not match/,
  );
});
test("corrupt or oversized stored receipts are rejected instead of silently clearing duplicate protection", () => {
  assert.throws(() => parsePendingMainnetExecution("invalid-json"));
  assert.throws(
    () => parsePendingMainnetExecution(" ".repeat(20001)),
    /invalid/,
  );
  assert.throws(
    () =>
      parsePendingMainnetExecution(
        JSON.stringify({ ...saved, signatures: ["https://phishing.example"] }),
      ),
    /invalid/,
  );
  assert.throws(
    () =>
      parsePendingMainnetExecution(
        JSON.stringify({
          ...saved,
          bundle: { ...saved.bundle, signedTransactions: ["one"] },
        }),
      ),
    /invalid/,
  );
});
