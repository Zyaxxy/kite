import type { SignableWalletOrder } from "@kite/sdk";
export interface MobileWalletAccount {
  address: string;
  label?: string;
  supportedTransactionVersions?: number[];
}
export const supportsMobileWallet = false;
const unsupported = () =>
  new Error(
    "Native wallet signing requires a compatible Android wallet and a Kite development or release build. Open Kite web with a wallet that advertises V1 signing.",
  );
export async function restoreMobileWallet(): Promise<MobileWalletAccount | null> {
  return null;
}
export async function connectMobileWallet(): Promise<MobileWalletAccount> {
  throw unsupported();
}
export async function disconnectMobileWallet(): Promise<void> {
  /* No native authorization on this platform. */
}
export async function signMobileTransaction(
  _order: SignableWalletOrder,
): Promise<string> {
  throw unsupported();
}
