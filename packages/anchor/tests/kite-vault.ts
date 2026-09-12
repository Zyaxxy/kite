import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";

describe("kite-vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  it("Is initialized!", async () => {
    // Basic test scaffold verifying anchor environment connection
    expect(provider.wallet.publicKey).to.not.be.null;
  });
});
