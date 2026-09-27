import test from "node:test";
import assert from "node:assert/strict";
import { createPrivateKey, sign } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import {
  prepareCreatorApproval,
  validateCreatorInvite,
  verifyCreatorApproval,
} from "../lib/server/creator-auth";
import type { ProgrammableBasket } from "@kite/sdk";

test("multi-use invite config and wallet approvals bind owner, content, origin and expiry", () => {
  const oldSecret = process.env.CREATOR_AUTH_SECRET,
    oldCodes = process.env.CREATOR_INVITE_CODES;
  process.env.CREATOR_AUTH_SECRET =
    "test-creator-secret-with-at-least-32-characters";
  process.env.CREATOR_INVITE_CODES = " first ,second";
  try {
    assert.equal(validateCreatorInvite("first"), true);
    assert.equal(validateCreatorInvite("first"), true);
    assert.equal(validateCreatorInvite("FIRST"), false);
    assert.equal(validateCreatorInvite(""), false);
    const wallet = Keypair.generate(),
      now = 1_800_000_000_000;
    const basket: ProgrammableBasket = {
      id: "draft",
      name: "A basket",
      ticker: "TEST",
      description: "An allocation",
      isCustom: true,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      rebalanceRules: { driftThresholdBps: 500 },
      allocations: [
        {
          mint: Keypair.generate().publicKey.toBase58(),
          symbol: "A",
          weightBps: 5000,
        },
        {
          mint: Keypair.generate().publicKey.toBase58(),
          symbol: "B",
          weightBps: 5000,
        },
      ],
    };
    const approval = prepareCreatorApproval(
      basket,
      wallet.publicKey.toBase58(),
      "https://kite.test",
      now,
    );
    const privateKey = createPrivateKey({
      key: Buffer.concat([
        Buffer.from("302e020100300506032b657004220420", "hex"),
        Buffer.from(wallet.secretKey.subarray(0, 32)),
      ]),
      format: "der",
      type: "pkcs8",
    });
    const signature = sign(
      null,
      Buffer.from(approval.message),
      privateKey,
    ).toString("base64");
    assert.equal(
      verifyCreatorApproval(
        approval.token,
        signature,
        "https://kite.test",
        now + 1,
      ).wallet,
      wallet.publicKey.toBase58(),
    );
    assert.throws(
      () =>
        verifyCreatorApproval(
          approval.token,
          signature,
          "https://other.test",
          now + 1,
        ),
      /another site/,
    );
    assert.throws(
      () =>
        verifyCreatorApproval(
          approval.token,
          signature,
          "https://kite.test",
          now + 300_001,
        ),
      /expired/,
    );
    assert.throws(
      () =>
        verifyCreatorApproval(
          approval.token,
          Buffer.alloc(64).toString("base64"),
          "https://kite.test",
          now + 1,
        ),
      /signature/,
    );
    const [encoded, mac] = approval.token.split(".");
    const changed = JSON.parse(Buffer.from(encoded, "base64url").toString());
    changed.basket.allocations[0].weightBps = 9000;
    assert.throws(
      () =>
        verifyCreatorApproval(
          `${Buffer.from(JSON.stringify(changed)).toString("base64url")}.${mac}`,
          signature,
          "https://kite.test",
          now + 1,
        ),
      /changed/,
    );
  } finally {
    if (oldSecret === undefined) delete process.env.CREATOR_AUTH_SECRET;
    else process.env.CREATOR_AUTH_SECRET = oldSecret;
    if (oldCodes === undefined) delete process.env.CREATOR_INVITE_CODES;
    else process.env.CREATOR_INVITE_CODES = oldCodes;
  }
});
