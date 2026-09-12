import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol';
import { PublicKey } from '@solana/web3.js';

export interface MobileWalletAccount {
  address: string;
  label?: string;
}

export const APP_IDENTITY = {
  name: 'Kite',
  uri: 'https://kite.finance',
  icon: 'favicon.ico',
};

/**
 * Connects to Solana Mobile Wallet (Phantom / Solflare / Seed Vault on Saga/Seeker)
 */
export async function connectMobileWallet(): Promise<MobileWalletAccount | null> {
  try {
    return await transact(async (wallet) => {
      const authResult = await wallet.authorize({
        cluster: 'devnet',
        identity: APP_IDENTITY,
      });

      const firstAccount = authResult.accounts[0];
      return {
        address: firstAccount.address,
        label: firstAccount.label,
      };
    });
  } catch (error) {
    console.warn('Solana Mobile Wallet Adapter connection error:', error);
    return null;
  }
}
