import type { MainnetTradeOrder } from "@kite/sdk";
export interface MobileWalletAccount {
  address: string;
  label?: string;
}
export const supportsMobileWallet = false;
const unsupported = () =>
  new Error(
    "Native wallet signing requires a compatible Android wallet and a Kite development or release build. Use Privy on Kite web for this device.",
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
  _order: MainnetTradeOrder,
): Promise<string> {
  throw unsupported();
}
