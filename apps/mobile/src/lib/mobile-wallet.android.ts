import { TurboModuleRegistry } from "react-native";
import * as SecureStore from "expo-secure-store";
import { Buffer } from "buffer";
import { PublicKey } from "@solana/web3.js";
import {
  advertisedSigningVersions,
  canApproveTrade,
  type SignableWalletOrder,
} from "@kite/sdk";
import type {
  AuthorizationResult,
  MobileWallet,
} from "@solana-mobile/mobile-wallet-adapter-protocol";
import { WEB_URL } from "./config";

export interface MobileWalletAccount {
  address: string;
  label?: string;
  supportedTransactionVersions?: number[];
}
interface StoredAuthorization {
  token: string;
  account: MobileWalletAccount;
  origin: string;
}
const KEY = "kite.mainnet.wallet.authorization.v1";
let sessionBusy = false;
let sessionDeadline = 0;
function assertSessionActive() {
  if (Date.now() >= sessionDeadline)
    throw new Error(
      "Wallet request timed out. Close the wallet prompt and try again. Nothing was submitted.",
    );
}
export const supportsMobileWallet = Boolean(
  TurboModuleRegistry.get("SolanaMobileWalletAdapter"),
);
const identity = () => ({ name: "Kite", uri: WEB_URL, icon: "icon.svg" });

async function stored(): Promise<StoredAuthorization | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as StoredAuthorization;
    if (
      typeof value.token !== "string" ||
      !value.token ||
      value.origin !== WEB_URL ||
      !value.account?.address ||
      new PublicKey(value.account.address).toBase58() !== value.account.address
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
function accountFromAuthorization(
  result: AuthorizationResult,
): MobileWalletAccount {
  const account = result.accounts[0];
  if (!account) throw new Error("The wallet did not return an account.");
  // MWA protocol accounts use base64; Wallet Standard accounts expose publicKey bytes.
  const bytes =
    "publicKey" in account
      ? account.publicKey
      : Buffer.from(account.address, "base64");
  return { address: new PublicKey(bytes).toBase58(), label: account.label };
}
async function authorize(wallet: MobileWallet): Promise<MobileWalletAccount> {
  assertSessionActive();
  const previous = await stored();
  let result: AuthorizationResult;
  if (previous) {
    try {
      result = await wallet.reauthorize({
        auth_token: previous.token,
        identity: identity(),
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === -1
      ) {
        await SecureStore.deleteItemAsync(KEY);
        result = await wallet.authorize({
          chain: "solana:mainnet",
          identity: identity(),
        });
      } else throw error;
    }
  } else
    result = await wallet.authorize({
      chain: "solana:mainnet",
      identity: identity(),
    });
  assertSessionActive();
  const account = accountFromAuthorization(result);
  // Do not confuse sign-and-send support with the raw signing method used below.
  try {
    const capabilities = await wallet.getCapabilities();
    account.supportedTransactionVersions = advertisedSigningVersions(
      capabilities.supported_transaction_versions,
      capabilities.features.includes("solana:signTransactions"),
    );
  } catch {
    account.supportedTransactionVersions = [];
  }
  assertSessionActive();
  await SecureStore.setItemAsync(
    KEY,
    JSON.stringify({ token: result.auth_token, account, origin: WEB_URL }),
    { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY },
  );
  return account;
}
async function session<T>(
  action: (wallet: MobileWallet) => Promise<T>,
): Promise<T> {
  if (!supportsMobileWallet)
    throw new Error(
      "Use a Kite Android development or release build. Expo Go does not include Mobile Wallet Adapter.",
    );
  if (!WEB_URL.startsWith("https://"))
    throw new Error(
      "Configure an HTTPS Kite web origin before connecting a mainnet wallet.",
    );
  if (sessionBusy)
    throw new Error(
      "A wallet request is already open. Complete or dismiss it before continuing.",
    );
  sessionBusy = true;
  sessionDeadline = Date.now() + 120_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { transact } =
      await import("@solana-mobile/mobile-wallet-adapter-protocol");
    const operation = transact((wallet) => {
      assertSessionActive();
      return action(wallet);
    });
    // Keep the native-session lock until its actual completion, even if the UI timeout fires.
    void operation.then(
      () => {
        sessionBusy = false;
        clearTimeout(timer);
      },
      () => {
        sessionBusy = false;
        clearTimeout(timer);
      },
    );
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "Wallet request timed out. Close the wallet prompt before trying again. Nothing was submitted.",
              ),
            ),
          120_000,
        );
      }),
    ]);
  } catch (error) {
    if (Date.now() < sessionDeadline) sessionBusy = false;
    throw error;
  }
}
export async function restoreMobileWallet(): Promise<MobileWalletAccount | null> {
  const account = (await stored())?.account;
  // A saved session is not fresh evidence of installed wallet capabilities.
  return account ? { ...account, supportedTransactionVersions: [] } : null;
}
export async function connectMobileWallet(): Promise<MobileWalletAccount> {
  return session(authorize);
}
export async function disconnectMobileWallet(): Promise<void> {
  const previous = await stored();
  try {
    if (previous)
      await session((wallet) =>
        wallet.deauthorize({ auth_token: previous.token }),
      );
  } finally {
    await SecureStore.deleteItemAsync(KEY);
  }
}
export async function signMobileTransaction(
  order: SignableWalletOrder,
): Promise<string> {
  return session(async (wallet) => {
    const account = await authorize(wallet);
    if (!canApproveTrade(order, account.address))
      throw new Error(
        "The wallet changed or the quote expired. Request a new quote.",
      );
    assertSessionActive();
    if (order.transactionVersion !== 1)
      throw new Error("New trades require V1. Request a fresh review.");
    if (!account.supportedTransactionVersions?.includes(1))
      throw new Error(
        "This Android wallet does not advertise V1 transaction signing. Update or reconnect a compatible wallet, or open Kite web.",
      );
    const response = await wallet.signTransactions({
      payloads: [order.transaction],
    });
    const signed = response.signed_payloads[0];
    if (!signed)
      throw new Error("The wallet did not return a signed transaction.");
    if (!canApproveTrade(order, account.address))
      throw new Error(
        "This quote expired while the wallet was open. Nothing was submitted.",
      );
    return signed;
  });
}
