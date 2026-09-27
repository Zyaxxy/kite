"use client";
import { useEffect, useRef, useState } from "react";
import {
  walletTransactionSignature,
  type WalletTransactionOrder,
  type BasketBundleOrder,
  type BasketBundleExecution,
} from "@kite/sdk";
import { useTradingAuth } from "./TradingAuth";
import { kiteClient } from "../kite/api-client";
import {
  mergeBundleReceipt,
  parsePendingMainnetExecution,
  type PendingMainnetExecution,
} from "@/lib/pending-mainnet";

const pendingKey = "kite:pending-mainnet-execution";
export function useComposedTransaction() {
  const auth = useTradingAuth(),
    wallet = useRef(auth.walletAddress),
    running = useRef(false);
  wallet.current = auth.walletAddress;
  const [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    [signature, setSignature] = useState<string | null>(null),
    [signatures, setSignatures] = useState<string[]>([]),
    [savedReceipt, setSavedReceipt] = useState<PendingMainnetExecution | null>(
      null,
    ),
    [confirmedBundleRevision, setConfirmedBundleRevision] = useState(0);
  const recheckRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const sync = () => {
      try {
        const raw = localStorage.getItem(pendingKey);
        setPending(Boolean(raw));
        const saved = parsePendingMainnetExecution(raw);
        setSavedReceipt(saved);
        if (saved) {
          if (saved.signature) setSignature(saved.signature);
          setSignatures(
            saved.signatures ?? (saved.signature ? [saved.signature] : []),
          );
        }
      } catch {
        setPending(true);
        setMessage(
          "Browser storage is required to protect against duplicate transactions.",
        );
      }
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(pendingKey, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(pendingKey, sync);
    };
  }, []);
  const activeBundleRequest =
    savedReceipt?.bundle || savedReceipt?.statusAuthorization
      ? savedReceipt.requestId
      : null;
  useEffect(() => {
    if (!pending || !activeBundleRequest) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || running.current) return;
      if (++attempts > 10) {
        window.clearInterval(timer);
        return;
      }
      void recheckRef.current();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [pending, activeBundleRequest]);
  function save(value: PendingMainnetExecution | null) {
    if (value) localStorage.setItem(pendingKey, JSON.stringify(value));
    else {
      localStorage.removeItem(pendingKey);
      sessionStorage.removeItem(pendingKey);
    }
    window.dispatchEvent(new Event(pendingKey));
  }
  function applyBundleResult(
    saved: PendingMainnetExecution,
    result: BasketBundleExecution,
  ): boolean {
    const receipt = mergeBundleReceipt(saved, result);
    if (result.status === "Success") {
      save(null);
      setConfirmedBundleRevision((value) => value + 1);
      setMessage(
        "Every basket transaction is confirmed. Your wallet has been updated.",
      );
      return true;
    }
    if (result.status === "Failed") {
      save(null);
      setMessage(
        result.error ??
          "The bundle was rejected. Review your wallet before trying again.",
      );
      return false;
    }
    save(receipt);
    setMessage(
      result.error ??
        (result.status === "Pending"
          ? "Bundle submitted. Checking every transaction before another purchase."
          : "Confirmation is unknown. Check every basket transaction before retrying."),
    );
    return false;
  }
  async function execute(
    order: WalletTransactionOrder | BasketBundleOrder,
  ): Promise<boolean> {
    if (running.current || pending) return false;
    running.current = true;
    setBusy(true);
    setMessage("");
    setSignature(null);
    setSignatures([]);
    let submitted = false;
    try {
      if (localStorage.getItem(pendingKey))
        throw new Error("Resolve the previous transaction before continuing.");
      if (order.taker !== wallet.current || order.expiresAt <= Date.now())
        throw new Error(
          "The wallet changed or this review expired. Review again.",
        );
      const bundle = "kind" in order && order.kind === "bundle";
      const signedTransactions = bundle
        ? await auth.signTransactions(order.transactions, 0)
        : [
            await auth.signTransaction(
              (order as WalletTransactionOrder).transaction,
              order.transactionVersion,
            ),
          ];
      const signedTransaction = signedTransactions[0];
      if (order.taker !== wallet.current || order.expiresAt <= Date.now())
        throw new Error(
          "The wallet changed or the transaction expired while signing. Nothing was submitted.",
        );
      if (localStorage.getItem(pendingKey))
        throw new Error(
          "Another transaction is pending. Nothing new was submitted.",
        );
      const txSignature = await walletTransactionSignature(signedTransaction);
      const signatures = await Promise.all(
        signedTransactions.map(walletTransactionSignature),
      );
      setSignatures(signatures);
      setSignature(txSignature);
      const receipt: PendingMainnetExecution = {
        version: 2,
        walletAddress: order.taker,
        requestId: order.requestId,
        signature: txSignature,
        signatures,
        ...(bundle
          ? {
              bundle: {
                signedTransactions,
                authorization: order.authorization,
                recoveryExpiresAt: order.expiresAt + 24 * 60 * 60 * 1000,
              },
            }
          : {}),
      };
      save(receipt);
      submitted = true;
      if (bundle) {
        const result = await kiteClient.executeBundle({
          signedTransactions,
          authorization: order.authorization,
        });
        return applyBundleResult(receipt, result);
      }
      const result = await kiteClient.executeTransaction({
        signedTransaction,
        authorization: order.authorization,
        investmentSetup: order.investmentSetup,
      });
      if (result.signature) setSignature(result.signature);
      if (result.status === "Unknown") {
        setMessage(
          "Confirmation is still unknown. Check wallet activity before submitting anything again.",
        );
        return false;
      }
      save(null);
      if (result.status === "Failed")
        throw new Error(
          result.error ??
            "The transaction failed. Network fees may still apply.",
        );
      setMessage("Confirmed. Your wallet has been updated.");
      return true;
    } catch (e) {
      let unresolved = submitted;
      try {
        unresolved = submitted && Boolean(localStorage.getItem(pendingKey));
      } catch {
        /* Keep the conservative state if storage fails. */
      }
      setMessage(
        unresolved
          ? "Confirmation is unknown. Check wallet activity before continuing."
          : e instanceof Error
            ? e.message
            : "The transaction was not submitted.",
      );
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function recheck() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const saved = parsePendingMainnetExecution(
        localStorage.getItem(pendingKey),
      );
      if (!saved || saved.walletAddress !== wallet.current)
        throw new Error(
          "Reconnect the wallet used for this purchase to check its receipts.",
        );
      if (!saved.statusAuthorization && !saved.bundle)
        throw new Error(
          "Open wallet activity and check the original transaction before continuing.",
        );
      if (saved.bundle && saved.bundle.recoveryExpiresAt <= Date.now()) {
        save({ ...saved, bundle: undefined, statusAuthorization: undefined });
        throw new Error(
          "The automatic recovery window expired. Check every linked transaction before acknowledging this purchase.",
        );
      }
      const result = saved.statusAuthorization
        ? await kiteClient.getBundleStatus({
            bundleId: saved.bundleId,
            authorization: saved.statusAuthorization,
          })
        : await kiteClient.recoverBundle(saved.bundle!);
      if (result.error?.includes("authorization expired")) {
        save({ ...saved, bundle: undefined, statusAuthorization: undefined });
        throw new Error(
          "The automatic recovery window expired. Check every linked transaction before acknowledging this purchase.",
        );
      }
      applyBundleResult(saved, result);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not check confirmation. Please retry.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  recheckRef.current = recheck;
  return {
    auth,
    busy,
    pending,
    message,
    signature,
    signatures,
    pendingWalletAddress: savedReceipt?.walletAddress ?? auth.walletAddress,
    confirmedBundleRevision,
    execute,
    recheck,
    setMessage,
    acknowledge: () => {
      if (running.current) return;
      save(null);
      setPending(false);
      setMessage(
        "Previous activity acknowledged. Review a fresh transaction to continue.",
      );
    },
  };
}
export function TransactionFeedback({
  flow,
}: {
  flow: ReturnType<typeof useComposedTransaction>;
}) {
  return (
    <div aria-live="polite">
      {flow.message && <p className="fineprint">{flow.message}</p>}
      {flow.signatures.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          {flow.signatures.map((signature, index) => (
            <a
              key={signature}
              className="text-link"
              href={`https://solscan.io/tx/${signature}`}
              target="_blank"
              rel="noreferrer"
            >
              {flow.signatures.length > 1
                ? `View transaction ${index + 1} of ${flow.signatures.length}`
                : "View transaction"}
            </a>
          ))}
        </div>
      )}
      {flow.pending && !flow.busy && (
        <div className="notice" style={{ display: "block", marginTop: 12 }}>
          <p>
            A previous submission has an unresolved outcome. Do not repeat it
            until you have checked your wallet activity.
          </p>
          {flow.pendingWalletAddress && (
            <a
              className="text-link"
              href={`https://solscan.io/account/${flow.pendingWalletAddress}`}
              target="_blank"
              rel="noreferrer"
            >
              Open wallet activity
            </a>
          )}
          <button
            type="button"
            className="btn secondary full"
            onClick={() => void flow.recheck()}
          >
            Check confirmation
          </button>
          <button
            type="button"
            className="btn secondary full"
            style={{ marginTop: 12 }}
            onClick={flow.acknowledge}
          >
            I checked the outcome — allow a new transaction
          </button>
        </div>
      )}
    </div>
  );
}
