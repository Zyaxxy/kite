import { TurboModuleRegistry } from "react-native";
import * as SecureStore from "expo-secure-store";
import { Buffer } from "buffer";
import { PublicKey } from "@solana/web3.js";
import { advertisedSigningVersions, type SignableWalletOrder } from "@kite/sdk";
import type {
  AuthorizationResult,
  MobileWallet,
} from "@solana-mobile/mobile-wallet-adapter-protocol";
import { WEB_URL } from "./config";
import {
  assertNativeSigningReview,
  assertSignedPayloads,
  walletAuthorizationKey,
  type NativeSigningReview,
  type WalletNetwork,
} from "./mobile-wallet-policy";

export interface MobileWalletAccount {
  address: string;
  label?: string;
  supportedTransactionVersions?: number[];
}
interface StoredAuthorization {
  token: string;
  account: MobileWalletAccount;
  origin: string;
  network: WalletNetwork;
}
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

async function stored(
  network: WalletNetwork,
): Promise<StoredAuthorization | null> {
  const raw = await SecureStore.getItemAsync(walletAuthorizationKey(network));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as StoredAuthorization;
    if (
      typeof value.token !== "string" ||
      !value.token ||
      value.origin !== WEB_URL ||
      (value.network !== network &&
        !(network === "mainnet" && value.network === undefined)) ||
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
async function authorize(
  wallet: MobileWallet,
  network: WalletNetwork,
): Promise<MobileWalletAccount> {
  assertSessionActive();
  const previous = await stored(network);
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
        await SecureStore.deleteItemAsync(walletAuthorizationKey(network));
        result = await wallet.authorize({
          chain: `solana:${network}`,
          identity: identity(),
        });
      } else throw error;
    }
  } else
    result = await wallet.authorize({
      chain: `solana:${network}`,
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
    walletAuthorizationKey(network),
    JSON.stringify({
      token: result.auth_token,
      account,
      origin: WEB_URL,
      network,
    }),
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
export async function restoreMobileWallet(
  network: WalletNetwork = "mainnet",
): Promise<MobileWalletAccount | null> {
  const account = (await stored(network))?.account;
  // A saved session is not fresh evidence of installed wallet capabilities.
  return account ? { ...account, supportedTransactionVersions: [] } : null;
}
export async function connectMobileWallet(
  network: WalletNetwork = "mainnet",
): Promise<MobileWalletAccount> {
  return session((wallet) => authorize(wallet, network));
}
export async function disconnectMobileWallet(
  network: WalletNetwork = "mainnet",
): Promise<void> {
  const previous = await stored(network);
  try {
    if (previous)
      await session((wallet) =>
        wallet.deauthorize({ auth_token: previous.token }),
      );
  } finally {
    await SecureStore.deleteItemAsync(walletAuthorizationKey(network));
  }
}
export async function signMobileTransaction(
  order: SignableWalletOrder,
): Promise<string> {
  const signed = await signMobileTransactions({
    signer: order.taker,
    network: "mainnet",
    transactionVersion: order.transactionVersion ?? 0,
    transactions: [order.transaction],
    expiresAt: order.expiresAt,
  });
  return signed[0]!;
}

/** MWA signs locally in a single session. Broadcasting is always an explicit server API step. */
export async function signMobileTransactions(
  review: NativeSigningReview,
): Promise<string[]> {
  return session(async (wallet) => {
    const account = await authorize(wallet, review.network);
    assertNativeSigningReview(review, account, review.network);
    assertSessionActive();
    const capabilities = await wallet.getCapabilities();
    if (
      review.transactions.length > 1 &&
      capabilities.max_transactions_per_request &&
      capabilities.max_transactions_per_request < review.transactions.length
    )
      throw new Error(
        "This wallet cannot approve the complete basket bundle in one request. Update your wallet or choose a smaller basket.",
      );
    const response = await wallet.signTransactions({
      payloads: review.transactions,
    });
    assertSessionActive();
    assertNativeSigningReview(review, account, review.network);
    assertSignedPayloads(response.signed_payloads, review.transactions.length);
    return response.signed_payloads;
  });
}
