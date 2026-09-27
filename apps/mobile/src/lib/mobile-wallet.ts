import type { SignableWalletOrder } from "@kite/sdk";
import type {
  NativeSigningReview,
  WalletNetwork,
} from "./mobile-wallet-policy";
export interface MobileWalletAccount {
  address: string;
  label?: string;
  supportedTransactionVersions?: number[];
}
export const supportsMobileWallet = false;
const unsupported = () =>
  new Error(
    "Native wallet signing requires a compatible Android wallet and a Kite development or release build. This platform supports browsing and paper investing.",
  );
export async function restoreMobileWallet(
  _network: WalletNetwork = "mainnet",
): Promise<MobileWalletAccount | null> {
  return null;
}
export async function connectMobileWallet(
  _network: WalletNetwork = "mainnet",
): Promise<MobileWalletAccount> {
  throw unsupported();
}
export async function disconnectMobileWallet(
  _network: WalletNetwork = "mainnet",
): Promise<void> {
  /* No native authorization on this platform. */
}
export async function signMobileTransaction(
  _order: SignableWalletOrder,
): Promise<string> {
  throw unsupported();
}
export async function signMobileTransactions(
  _review: NativeSigningReview,
): Promise<string[]> {
  throw unsupported();
}
