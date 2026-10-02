import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  JitoRejectedError,
  prepareJitoTip,
  sendJitoBundle,
} from "../lib/server/jito-bundles";

const taker = "11111111111111111111111111111111";
const providerDetail =
  "https://provider.invalid/?api-key=private-provider-token";
const rpcError = {
  jsonrpc: "2.0",
  id: 1,
  error: { code: -32097, message: providerDetail },
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

type Reply = () => Response | Promise<Response>;
function mockEngine(t: TestContext, reply: Reply) {
  const requests: { method: string; params: unknown[] }[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (!init?.body) return json([]); // Optional public tip-floor request.
      requests.push(JSON.parse(String(init.body)));
      return reply();
    },
  );
  return requests;
}

const unavailableReplies: {
  name: string;
  reply: Reply;
  rateLimited?: boolean;
}[] = [
  {
    name: "HTTP 429 JSON-RPC error",
    reply: () => json(rpcError, 429),
    rateLimited: true,
  },
  {
    name: "HTTP 429 non-JSON body",
    reply: () => new Response(providerDetail, { status: 429 }),
    rateLimited: true,
  },
  {
    name: "HTTP 503 JSON body",
    reply: () => json({ message: providerDetail }, 503),
  },
  {
    name: "HTTP 502 non-JSON body",
    reply: () => new Response(providerDetail, { status: 502 }),
  },
  { name: "JSON-RPC error", reply: () => json(rpcError) },
  { name: "null body", reply: () => json(null) },
  { name: "null result", reply: () => json({ result: null }) },
  { name: "missing result", reply: () => json({}) },
  { name: "malformed error", reply: () => json({ error: providerDetail }) },
  {
    name: "failed body read",
    reply: () => {
      const response = new Response("{}");
      response.json = async () => {
        throw new Error(providerDetail);
      };
      return response;
    },
  },
  {
    name: "network failure",
    reply: async () => {
      throw new TypeError(providerDetail);
    },
  },
  {
    name: "timeout",
    reply: async () => {
      throw new DOMException(providerDetail, "TimeoutError");
    },
  },
];

for (const { name, reply, rateLimited } of unavailableReplies) {
  test(`tip preparation handles ${name} without claiming a bundle was submitted`, async (t) => {
    const requests = mockEngine(t, reply);
    await assert.rejects(prepareJitoTip(taker), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(!(error instanceof JitoRejectedError));
      assert.match(error.message, /Jito tip/);
      assert.match(error.message, /No transactions were submitted/);
      if (rateLimited) assert.match(error.message, /rate-limited/);
      assert.doesNotMatch(
        error.message,
        /receipt|signature|rejected|provider|private-provider-token/,
      );
      return true;
    });
    assert.deepEqual(requests, [
      { jsonrpc: "2.0", id: 1, method: "getTipAccounts", params: [] },
    ]);
  });
}

for (const result of [[], [taker], [null]]) {
  test(`unverified tip accounts ${JSON.stringify(result)} block preparation before submission`, async (t) => {
    const requests = mockEngine(t, () => json({ result }));
    await assert.rejects(
      prepareJitoTip(taker),
      /could not be verified\. No transactions were submitted/,
    );
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "getTipAccounts");
  });
}

for (const status of [200, 429]) {
  test(`sendBundle preserves explicit JSON-RPC rejection on HTTP ${status} without promising no execution`, async (t) => {
    const requests = mockEngine(t, () => json(rpcError, status));
    await assert.rejects(
      sendJitoBundle(["signed1", "signed2"]),
      (error: unknown) => {
        assert.ok(error instanceof JitoRejectedError);
        assert.match(error.message, /Jito rejected the bundle request/);
        assert.match(error.message, /Check every signature before retrying/);
        assert.doesNotMatch(
          error.message,
          /No transactions were submitted|private-provider-token/,
        );
        return true;
      },
    );
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "sendBundle");
    assert.deepEqual(requests[0].params, [
      ["signed1", "signed2"],
      { encoding: "base64" },
    ]);
  });
}

const uncertainReplies = [
  ...unavailableReplies.filter(
    ({ name }) => !["HTTP 429 JSON-RPC error", "JSON-RPC error"].includes(name),
  ),
  { name: "unmatched response id", reply: () => json({ ...rpcError, id: 2 }) },
  {
    name: "missing JSON-RPC envelope",
    reply: () => json({ error: rpcError.error }),
  },
  {
    name: "conflicting result and error",
    reply: () => json({ ...rpcError, result: "a".repeat(64) }),
  },
  { name: "invalid receipt", reply: () => json({ result: providerDetail }) },
];
for (const { name, reply } of uncertainReplies) {
  test(`sendBundle keeps ${name} uncertain and does not broadcast individual transactions`, async (t) => {
    const requests = mockEngine(t, reply);
    await assert.rejects(
      sendJitoBundle(["signed1", "signed2"]),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(!(error instanceof JitoRejectedError));
        assert.match(error.message, /[Cc]heck (every )?signature/);
        assert.doesNotMatch(
          error.message,
          /No transactions were submitted|private-provider-token|provider\.invalid/,
        );
        return true;
      },
    );
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "sendBundle");
  });
}
