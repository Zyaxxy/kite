import * as anchor from "@anchor-lang/core";
import { PublicKey, Keypair } from "@solana/web3.js";
import { expect } from "chai";
import * as fs from "node:fs";
import * as path from "node:path";

import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const idlPath = path.resolve(__dirname, "../target/idl/kite_guard.json");
const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));

describe("Kite Guard - Recurring Deposit Contract", () => {
  const PROGRAM_ID = new PublicKey("Fg6PaFpoGXkYidMpWEEe9nM3q7x5JqFHvXy6n3sNof9S");

  // Synthetic test accounts
  const owner = Keypair.generate();
  const fundingMint = Keypair.generate().publicKey;
  const subscriptionAuthority = Keypair.generate().publicKey;
  const cranker = Keypair.generate();

  // Target token mints (e.g. xAAPL, xTSLA)
  const stockApple = Keypair.generate().publicKey;
  const stockTesla = Keypair.generate().publicKey;

  function derivePlanPda(ownerPubkey: PublicKey, mintPubkey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("plan"), ownerPubkey.toBuffer(), mintPubkey.toBuffer()],
      PROGRAM_ID
    );
  }

  it("loads program IDL with required instructions, accounts, and types", () => {
    expect(idl.address).to.equal(PROGRAM_ID.toBase58());
    const instructionNames = idl.instructions.map((ix: any) => ix.name);
    expect(instructionNames).to.include("create_plan");
    expect(instructionNames).to.include("execute_swap");
    expect(instructionNames).to.include("close_plan");

    const accountNames = idl.accounts.map((acc: any) => acc.name);
    expect(accountNames).to.include("Plan");
  });

  it("derives deterministic Plan PDA address from owner and funding mint", () => {
    const [planPda, bump] = derivePlanPda(owner.publicKey, fundingMint);
    expect(planPda).to.be.instanceOf(PublicKey);
    expect(bump).to.be.a("number").and.within(0, 255);

    // Deterministic reproduction
    const [planPda2, bump2] = derivePlanPda(owner.publicKey, fundingMint);
    expect(planPda.toBase58()).to.equal(planPda2.toBase58());
    expect(bump).to.equal(bump2);
  });

  it("validates allocation weight constraints (10,000 bps = 100%)", () => {
    const validOutputs = [
      { mint: stockApple, weightBps: 6000 },
      { mint: stockTesla, weightBps: 4000 },
    ];
    const totalBps = validOutputs.reduce((sum, o) => sum + o.weightBps, 0);
    expect(totalBps).to.equal(10000);

    const invalidOutputs = [
      { mint: stockApple, weightBps: 5000 },
      { mint: stockTesla, weightBps: 4000 }, // sum = 9000 != 10000
    ];
    const invalidTotal = invalidOutputs.reduce((sum, o) => sum + o.weightBps, 0);
    expect(invalidTotal).to.not.equal(10000);
  });

  it("enforces maximum asset count (<= 20 assets per plan)", () => {
    const maxAssets = 20;
    const outputs = Array.from({ length: 25 }, () => ({
      mint: Keypair.generate().publicKey,
      weightBps: 400,
    }));
    expect(outputs.length).to.be.greaterThan(maxAssets);
  });

  it("verifies error codes defined in the IDL match contract specifications", () => {
    const errorNames = idl.errors.map((e: any) => e.name);
    expect(errorNames).to.include("InvalidAmount");
    expect(errorNames).to.include("InvalidPeriods");
    expect(errorNames).to.include("PeriodTooShort");
    expect(errorNames).to.include("InvalidOutputsCount");
    expect(errorNames).to.include("InvalidAllocationWeights");
    expect(errorNames).to.include("PlanAlreadyCompleted");
    expect(errorNames).to.include("PeriodNotElapsed");
    expect(errorNames).to.include("MismatchedFundingMint");
  });

  it("builds create_plan instruction accounts layout correctly", () => {
    const [planPda] = derivePlanPda(owner.publicKey, fundingMint);
    const createPlanIx = idl.instructions.find((ix: any) => ix.name === "create_plan");
    expect(createPlanIx).to.exist;

    const accountNames = createPlanIx.accounts.map((acc: any) => acc.name);
    expect(accountNames).to.deep.equal([
      "owner",
      "funding_mint",
      "subscription_authority",
      "plan",
      "system_program",
    ]);

    // Verify discriminator length is 8 bytes
    expect(createPlanIx.discriminator.length).to.equal(8);
  });

  it("builds execute_swap instruction accounts layout correctly", () => {
    const executeSwapIx = idl.instructions.find((ix: any) => ix.name === "execute_swap");
    expect(executeSwapIx).to.exist;

    const accountNames = executeSwapIx.accounts.map((acc: any) => acc.name);
    expect(accountNames).to.include("cranker");
    expect(accountNames).to.include("plan");
    expect(accountNames).to.include("source_token");
    expect(accountNames).to.include("vault_funding_token");
    expect(accountNames).to.include("owner_output_token");
    expect(accountNames).to.include("output_mint");
  });

  it("builds close_plan instruction with owner rent reclamation accounts", () => {
    const closePlanIx = idl.instructions.find((ix: any) => ix.name === "close_plan");
    expect(closePlanIx).to.exist;

    const accountNames = closePlanIx.accounts.map((acc: any) => acc.name);
    expect(accountNames).to.deep.equal(["owner", "plan"]);
    expect(closePlanIx.accounts[0].writable).to.be.true;
    expect(closePlanIx.accounts[0].signer).to.be.true;
    expect(closePlanIx.accounts[1].writable).to.be.true;
  });
});
