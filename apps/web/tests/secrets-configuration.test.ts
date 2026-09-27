import test from "node:test";
import assert from "node:assert/strict";
import { configuredServerSecrets } from "../../../scripts/check-client-secrets.mjs";

test("artifact scan includes creator invitations, collector keypairs and rotating API keys", async () => {
  const secrets = await configuredServerSecrets({
    envFiles: [],
    environment: {
      CREATOR_INVITE_CODES: "test-invitation-only",
      BOT_KEYPAIR: "test-collector-key-only",
      JUPITER_API_KEYS: "test-rotation-only",
      NEXT_PUBLIC_PRIVY_APP_ID: "public-app-id",
    },
  });
  assert.equal(secrets.size, 3);
  assert.equal(secrets.has("public-app-id"), false);
});
