import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";

describe("kite-vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // We load the program interface
  const program = anchor.workspace.KiteVault as Program<any>;

  let basketMint: PublicKey;
  let userBasketAta: PublicKey;
  let basketVaultPda: PublicKey;
  let basketVaultBump: number;

  const authority = (provider.wallet as any).payer as Keypair;

  before(async () => {
    // Create basket mint
    basketMint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      6
    );

    // Derive vault PDA
    [basketVaultPda, basketVaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("basket_vault"), basketMint.toBuffer()],
      program.programId
    );

    // Create user ATA for basket token
    const ata = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      authority,
      basketMint,
      authority.publicKey
    );
    userBasketAta = ata.address;
  });

  it("Initializes a Kite Basket Vault", async () => {
    const name = "Magnificent 7 Tech";
    const symbol = "MAG7";
    const feeBps = 25; // 0.25%
    const assetCount = 7;

    await program.methods
      .initializeVault(name, symbol, feeBps, assetCount)
      .accounts({
        basketVault: basketVaultPda,
        basketMint: basketMint,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const vaultAccount = await program.account.basketVault.fetch(basketVaultPda);
    expect(vaultAccount.name).to.equal(name);
    expect(vaultAccount.symbol).to.equal(symbol);
    expect(vaultAccount.feeBasisPoints).to.equal(feeBps);
    expect(vaultAccount.totalMinted.toNumber()).to.equal(0);
  });

  it("Creates a Non-Custodial Recurring SIP Position", async () => {
    const amountPerCycle = new anchor.BN(25 * 1e6); // 25 USDC
    const intervalSeconds = new anchor.BN(86400 * 7); // Weekly (7 days)

    const [sipPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("sip_position"), authority.publicKey.toBuffer(), basketMint.toBuffer()],
      program.programId
    );

    await program.methods
      .createSip(amountPerCycle, intervalSeconds)
      .accounts({
        sipPosition: sipPda,
        targetBasket: basketMint,
        user: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const sipAccount = await program.account.sipPosition.fetch(sipPda);
    expect(sipAccount.owner.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(sipAccount.targetBasket.toBase58()).to.equal(basketMint.toBase58());
    expect(sipAccount.amountPerCycle.toNumber()).to.equal(25 * 1e6);
    expect(sipAccount.isActive).to.be.true;
    expect(sipAccount.totalCyclesExecuted).to.equal(0);
  });

  it("Cancels and closes the SIP position", async () => {
    const [sipPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("sip_position"), authority.publicKey.toBuffer(), basketMint.toBuffer()],
      program.programId
    );

    await program.methods
      .cancelSip()
      .accounts({
        sipPosition: sipPda,
        owner: authority.publicKey,
      })
      .rpc();

    const sipAccount = await program.account.sipPosition.fetchNullable(sipPda);
    expect(sipAccount).to.be.null;
  });
});
