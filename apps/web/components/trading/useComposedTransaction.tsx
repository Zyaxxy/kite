"use client";
import { useEffect, useRef, useState } from "react";
import {
  walletTransactionSignature,
  type WalletTransactionOrder,
} from "@kite/sdk";
import { useTradingAuth } from "./TradingAuth";
import { kiteClient } from "../kite/api-client";

const pendingKey = "kite:pending-mainnet-execution";
export function useComposedTransaction() {
  const auth = useTradingAuth(),
    wallet = useRef(auth.walletAddress),
    running = useRef(false);
  wallet.current = auth.walletAddress;
  const [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    [signature, setSignature] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => {
      try {
        const saved = localStorage.getItem(pendingKey);
        setPending(Boolean(saved));
        if (saved) {
          const value = JSON.parse(saved);
          if (typeof value.signature === "string")
            setSignature(value.signature);
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
  function save(
    value: {
      walletAddress: string;
      requestId: string;
      signature?: string;
    } | null,
  ) {
    if (value) localStorage.setItem(pendingKey, JSON.stringify(value));
    else {
      localStorage.removeItem(pendingKey);
      sessionStorage.removeItem(pendingKey);
    }
    window.dispatchEvent(new Event(pendingKey));
  }
  async function execute(order: WalletTransactionOrder): Promise<boolean> {
    if (running.current || pending) return false;
    running.current = true;
    setBusy(true);
    setMessage("");
    setSignature(null);
    let submitted = false;
    try {
      if (localStorage.getItem(pendingKey))
        throw new Error("Resolve the previous transaction before continuing.");
      if (order.taker !== wallet.current || order.expiresAt <= Date.now())
        throw new Error(
          "The wallet changed or this review expired. Review again.",
        );
      const signedTransaction = await auth.signTransaction(
        order.transaction,
        order.transactionVersion,
      );
      if (order.taker !== wallet.current || order.expiresAt <= Date.now())
        throw new Error(
          "The wallet changed or the transaction expired while signing. Nothing was submitted.",
        );
      if (localStorage.getItem(pendingKey))
        throw new Error(
          "Another transaction is pending. Nothing new was submitted.",
        );
      const txSignature = await walletTransactionSignature(signedTransaction);
      setSignature(txSignature);
      save({
        walletAddress: order.taker,
        requestId: order.requestId,
        signature: txSignature,
      });
      submitted = true;
      const result = await kiteClient.executeTransaction({
        signedTransaction,
        authorization: order.authorization,
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
      setMessage(
        submitted && localStorage.getItem(pendingKey)
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
  return {
    auth,
    busy,
    pending,
    message,
    signature,
    execute,
    setMessage,
    acknowledge: () => {
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
      {flow.signature && (
        <a
          className="text-link"
          href={`https://solscan.io/tx/${flow.signature}`}
          target="_blank"
          rel="noreferrer"
        >
          View transaction
        </a>
      )}
      {flow.pending && !flow.busy && (
        <div className="notice" style={{ display: "block", marginTop: 12 }}>
          <p>
            A previous submission has an unresolved outcome. Do not repeat it
            until you have checked your wallet activity.
          </p>
          {flow.auth.walletAddress && (
            <a
              className="text-link"
              href={`https://solscan.io/account/${flow.auth.walletAddress}`}
              target="_blank"
              rel="noreferrer"
            >
              Open wallet activity
            </a>
          )}
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
