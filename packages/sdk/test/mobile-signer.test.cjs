const test = require("node:test");
const assert = require("node:assert/strict");
const { signAndExecuteMobileOrder } = require("../dist/mobile-signer");
const order = {
  taker: "wallet-a",
  transaction: "dHg=",
  expiresAt: 2000,
  authorization: "server-auth",
  requestId: "request-a",
};
function fixture(overrides = {}) {
  const calls = [];
  const signer = {
    getAddress: () => "wallet-a",
    signTransaction: async () => {
      calls.push("sign");
      return "c2lnbmVk";
    },
    ...overrides,
  };
  const client = {
    executeTrade: async (request) => {
      calls.push(request);
      return { status: "Failed", error: "Rejected before submit" };
    },
  };
  return { calls, signer, client };
}
test("mobile signing rejects expiry and account mismatch before a wallet prompt", async () => {
  for (const [expiresAt, getAddress] of [
    [999, () => "wallet-a"],
    [2000, () => "wallet-b"],
  ]) {
    const { calls, signer, client } = fixture({ getAddress });
    await assert.rejects(
      signAndExecuteMobileOrder({ ...order, expiresAt }, client, signer, {
        now: () => 1000,
      }),
      /expired/,
    );
    assert.equal(calls.length, 0);
  }
});
test("wallet changes or expiry while signing prevent broadcast", async () => {
  let current = 1000;
  const { calls, signer, client } = fixture({
    signTransaction: async () => {
      current = 3000;
      return "c2lnbmVk";
    },
  });
  await assert.rejects(
    signAndExecuteMobileOrder(order, client, signer, { now: () => current }),
    /expired/,
  );
  assert.equal(calls.length, 0);
});
test("durable attempt is saved before execution without storing signed payloads", async () => {
  const { calls, signer, client } = fixture();
  const result = await signAndExecuteMobileOrder(order, client, signer, {
    now: () => 1000,
    beforeExecute: async (attempt) => calls.push(attempt),
  });
  assert.equal(result.status, "Failed");
  assert.deepEqual(calls, [
    "sign",
    { walletAddress: "wallet-a", requestId: "request-a" },
    { signedTransaction: "c2lnbmVk", authorization: "server-auth" },
  ]);
});
test("attempt storage errors stop execution", async () => {
  const { calls, signer, client } = fixture();
  await assert.rejects(
    signAndExecuteMobileOrder(order, client, signer, {
      now: () => 1000,
      beforeExecute: async () => {
        throw new Error("disk full");
      },
    }),
    /disk full/,
  );
  assert.deepEqual(calls, ["sign"]);
});
test("broadcast transport failures return Unknown to prevent duplicate swaps", async () => {
  const { signer } = fixture();
  const result = await signAndExecuteMobileOrder(
    order,
    {
      executeTrade: async () => {
        throw new Error("timeout");
      },
    },
    signer,
    { now: () => 1000 },
  );
  assert.equal(result.status, "Unknown");
});
test("wallet rejection is not converted to an attempted broadcast", async () => {
  const { calls, client, signer } = fixture({
    signTransaction: async () => {
      throw new Error("User rejected");
    },
  });
  await assert.rejects(
    signAndExecuteMobileOrder(order, client, signer, { now: () => 1000 }),
    /rejected/,
  );
  assert.equal(calls.length, 0);
});
