import test from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import {
  actionHeaders,
  parseActionSubscription,
  subscriptionActionMetadata,
} from "../lib/server/recurring-actions";
import {
  parseCreateDevnetPlan,
  parseCloseDevnetPlan,
} from "../lib/server/recurring-devnet-policy";

const wallet = Keypair.generate().publicKey.toBase58();
const params = () =>
  new URLSearchParams({
    amount: "25.123456",
    cadence: "weekly",
    periods: "12",
  });
test("Actions advertise devnet, public CORS, and explicitly valueless stock demonstration", () => {
  const headers = actionHeaders();
  assert.equal(
    headers["X-Blockchain-Ids"],
    "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  );
  assert.equal(headers["Access-Control-Allow-Origin"], "*");
  const metadata = subscriptionActionMetadata(
    {
      id: "sol-digital-leaders",
      name: "Digital leaders",
      symbols: ["AAPL"],
      available: true,
      missing: [],
    },
    "https://kite.runs",
  );
  assert.match(metadata.description, /No real stocks are purchased/);
  assert.equal(metadata.links?.actions[0].type, "transaction");
  assert.match(metadata.links?.actions[0].href ?? "", /amount=\{amount\}/);
});

test("Action parameters validate account, exact decimal amount, bounded schedule, and declared inputs", () => {
  const request = parseActionSubscription("sol-digital-leaders", params(), {
    account: wallet,
  });
  assert.equal(request.amount, "25.123456");
  assert.equal(request.periodSeconds, 604800);
  assert.deepEqual(request.supportedTransactionVersions, [0]);
  for (const amount of ["0", "-1", "1e2", "1.0000001", "1000001"]) {
    const search = params();
    search.set("amount", amount);
    assert.throws(() =>
      parseActionSubscription("sol-digital-leaders", search, {
        account: wallet,
      }),
    );
  }
  for (const changes of [
    { cadence: "hourly" },
    { periods: "53" },
    { periods: "1.1" },
  ]) {
    const search = params();
    Object.entries(changes).forEach(([key, value]) => search.set(key, value));
    assert.throws(() =>
      parseActionSubscription("sol-digital-leaders", search, {
        account: wallet,
      }),
    );
  }
  const duplicate = params();
  duplicate.append("amount", "100");
  assert.throws(
    () =>
      parseActionSubscription("sol-digital-leaders", duplicate, {
        account: wallet,
      }),
    /duplicate/,
  );
  assert.throws(() =>
    parseActionSubscription("sol-digital-leaders", params(), {
      account: wallet,
      buyer: wallet,
    }),
  );
  assert.throws(() =>
    parseActionSubscription("sol-digital-leaders", params(), {
      account: "not-a-wallet",
    }),
  );
});

test("standard recurring requests accept V0-only mobile wallets and reject unknown transaction versions", () => {
  const request = parseActionSubscription("sol-digital-leaders", params(), {
    account: wallet,
  });
  assert.deepEqual(
    parseCreateDevnetPlan(request).supportedTransactionVersions,
    [0],
  );
  assert.deepEqual(
    parseCloseDevnetPlan({
      schemaVersion: 1,
      plan: wallet,
      owner: wallet,
      supportedTransactionVersions: [0],
    }).supportedTransactionVersions,
    [0],
  );
  for (const supportedTransactionVersions of [[], [2], [-1], ["0"], [0, 0]]) {
    assert.throws(
      () => parseCreateDevnetPlan({ ...request, supportedTransactionVersions }),
      /signing/,
    );
  }
});
