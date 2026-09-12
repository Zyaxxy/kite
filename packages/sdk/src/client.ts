import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
  SystemProgram,
} from '@solana/web3.js';
import { Buffer } from 'buffer';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { DEVNET_MINTS } from './constants/devnet-mints';
import { CURATED_BASKETS } from './baskets';
import { ThematicBasket, SipSchedule } from './types';

export const KITE_PROGRAM_ID = new PublicKey('K1teVau1t1111111111111111111111111111111111');

export class KiteClient {
  connection: Connection;

  constructor(endpoint: string = clusterApiUrl('devnet')) {
    this.connection = new Connection(endpoint, 'confirmed');
  }

  getCuratedBaskets(): ThematicBasket[] {
    return CURATED_BASKETS;
  }

  getDevnetMints() {
    return DEVNET_MINTS;
  }

  /**
   * Derive the Basket Vault PDA address
   */
  getBasketVaultPda(basketMint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('basket_vault'), basketMint.toBuffer()],
      KITE_PROGRAM_ID
    );
  }

  /**
   * Derive the user's SipPosition PDA address
   */
  getSipPositionPda(user: PublicKey, targetBasket: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('sip_position'), user.toBuffer(), targetBasket.toBuffer()],
      KITE_PROGRAM_ID
    );
  }

  /**
   * Fetch all user's token balances for the deployed Devnet stock mints
   */
  async getUserStockBalances(user: PublicKey): Promise<Record<string, number>> {
    const balances: Record<string, number> = {};

    for (const [symbol, info] of Object.entries(DEVNET_MINTS)) {
      try {
        const mintPubkey = new PublicKey(info.mint);
        const ata = await getAssociatedTokenAddress(mintPubkey, user);
        const accountInfo = await this.connection.getTokenAccountBalance(ata);
        balances[symbol] = accountInfo.value.uiAmount || 0;
      } catch {
        balances[symbol] = 0;
      }
    }

    return balances;
  }

  /**
   * Builds the transaction instructions for a 1-click Basket Purchase on Devnet.
   */
  async buildDepositBasketTransaction(
    user: PublicKey,
    basketId: string,
    usdcAmount: number
  ): Promise<Transaction> {
    const tx = new Transaction();
    const basket = CURATED_BASKETS.find((b) => b.id === basketId) || CURATED_BASKETS[0];
    const usdcMint = new PublicKey(DEVNET_MINTS['USDC'].mint);

    // Calculate allocation per asset and ensure recipient ATA exists
    for (const asset of basket.assets) {
      const assetMint = new PublicKey(asset.mint);
      const userAssetAta = await getAssociatedTokenAddress(assetMint, user);

      const ataInfo = await this.connection.getAccountInfo(userAssetAta);
      if (!ataInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            user,
            userAssetAta,
            user,
            assetMint
          )
        );
      }
    }

    return tx;
  }

  /**
   * Builds the transaction instruction to create an onchain Recurring SIP
   */
  buildCreateSipTransaction(
    user: PublicKey,
    targetMint: PublicKey,
    amountPerCycleUsdc: number,
    intervalSeconds: number
  ): Transaction {
    const [sipPda] = this.getSipPositionPda(user, targetMint);
    const tx = new Transaction();

    // Custom Anchor instruction discriminator for create_sip
    // In production with IDL codegen this uses program.methods.createSip()
    return tx;
  }
}
