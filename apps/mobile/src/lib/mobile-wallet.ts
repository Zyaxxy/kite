import { Platform, TurboModuleRegistry } from 'react-native';
import { WEB_URL } from './config';

export interface MobileWalletAccount {
  address: string;
  label?: string;
}

export const APP_IDENTITY = {
  name: 'Kite',
  uri: WEB_URL || 'https://kite.finance',
  icon: 'favicon.ico',
};

/** Authorizes a user's mainnet wallet. This does not sign or submit a trade. */
export async function connectMobileWallet(): Promise<MobileWalletAccount> {
  if (Platform.OS !== 'android') throw new Error('Mobile wallet authorization requires Android. Use Privy on Kite web for this device.');
  if (!TurboModuleRegistry.get('SolanaMobileWalletAdapter')) throw new Error('Mobile wallet authorization requires an Android development build. Paper trading and the Privy web link work without it.');
  const { transact } = await import('@solana-mobile/mobile-wallet-adapter-protocol');
  return transact(async (wallet) => {
    const authResult = await wallet.authorize({
      cluster: 'mainnet-beta',
      identity: APP_IDENTITY,
    });
    const account = authResult.accounts[0];
    if (!account) throw new Error('The wallet did not return an account.');
    return { address: account.address, label: account.label };
  });
}
