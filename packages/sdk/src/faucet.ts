import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  createMintToInstruction
} from '@solana/spl-token';
import { DEVNET_MINTS } from './constants/devnet-mints';

export interface AirdropResult {
  success: boolean;
  signature?: string;
  mintedUsdc: number;
  message: string;
}

/**
 * Creates transaction instructions to mint $1,000 Devnet USDC and sample stocks
 * directly to the target wallet address.
 */
export async function buildDevnetFaucetInstructions(
  payerPubkey: PublicKey,
  recipientPubkey: PublicKey,
  amountUsdc: number = 1000
) {
  const instructions = [];
  const usdcMint = new PublicKey(DEVNET_MINTS['USDC'].mint);
  const usdcAta = await getAssociatedTokenAddress(usdcMint, recipientPubkey);

  // Mint instruction: $1,000 USDC (6 decimals = 1,000,000,000 atomic units)
  const rawAmount = BigInt(amountUsdc) * BigInt(1e6);

  // Instruction to mint USDC
  instructions.push(
    createMintToInstruction(
      usdcMint,
      usdcAta,
      payerPubkey,
      rawAmount
    )
  );

  return {
    instructions,
    usdcAta,
  };
}
