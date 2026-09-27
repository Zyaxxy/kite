import test from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import {
  publishedRecurringOption,
  recurringDeepLink,
  RECURRING_CADENCES,
} from "../lib/recurring-links";

test("recurring deep links preserve all four cadences and explicitly use 30-day months", () => {
  for (const [name, value] of Object.entries(RECURRING_CADENCES))
    assert.equal(
      recurringDeepLink(`?cadence=${name}&basket=sol-ai`).periodSeconds,
      value.seconds,
    );
  assert.equal(RECURRING_CADENCES.monthly.label, "Every 30 days");
  assert.equal(
    recurringDeepLink("?cadence=unexpected&basket=https://untrusted.test")
      .periodSeconds,
    undefined,
  );
  assert.equal(
    recurringDeepLink("?cadence=unexpected&basket=https://untrusted.test")
      .basketId,
    null,
  );
});

test("linked creator allocations are selectable only when published identity and every devnet stock mapping match", () => {
  const id = "creator-0123456789abcdef01234567";
  const basket = {
    id,
    name: "A published allocation",
    ticker: "TEST",
    creatorWallet: Keypair.generate().publicKey.toBase58(),
    allocations: [
      {
        mint: Keypair.generate().publicKey.toBase58(),
        symbol: "AAPL",
        weightBps: 5000,
      },
      {
        mint: Keypair.generate().publicKey.toBase58(),
        symbol: "MSFT",
        weightBps: 5000,
      },
    ],
  };
  assert.equal(
    publishedRecurringOption(id, basket, [
      { id: "AAPL", available: true },
      { id: "MSFT", available: true },
    ]).available,
    true,
  );
  assert.equal(
    publishedRecurringOption(id, basket, [{ id: "AAPL", available: true }])
      .available,
    false,
  );
  assert.equal(
    publishedRecurringOption(id, basket, [
      { id: "AAPL", available: true },
      { id: "MSFT", available: false },
    ]).available,
    false,
  );
  assert.throws(
    () => publishedRecurringOption(id, { ...basket, id: "different" }, []),
    /does not match/,
  );
  assert.throws(
    () =>
      publishedRecurringOption(id, { ...basket, creatorWallet: undefined }, []),
    /verified/,
  );
});
