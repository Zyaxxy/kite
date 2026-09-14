"use client";

import { useEffect, useState } from "react";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { CalendarDays, Repeat2 } from "lucide-react";
import {
  KiteGuardIdl,
  KiteGuard,
  KITE_GUARD_PROGRAM_ID,
  findPlanPda,
  TOTAL_WEIGHT_BPS,
} from "@kite/sdk";
import { NativeSelect } from "../ui/native-select";
import recurringStyles from "./recurring-controls.module.css";

interface XStock {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  logo: string;
}

export function RecurringInvestingPanel() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const [tokens, setTokens] = useState<XStock[]>([]);
  const [selectedToken, setSelectedToken] = useState<string>("");
  const [fundingAmount, setFundingAmount] = useState<string>("10");
  const [period, setPeriod] = useState<string>("86400"); // 1 day
  const [periods, setPeriods] = useState<string>("10");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetch("/xstocks-devnet/xstocks.json")
      .then((res) => res.json())
      .then((data) => {
        setTokens(data.tokens);
        if (data.tokens.length > 0) {
          setSelectedToken(data.tokens[0].mint);
        }
      })
      .catch((err) => console.error("Failed to load devnet tokens", err));
  }, []);

  const handleCreatePlan = async () => {
    if (!wallet) return setError("Connect wallet first");
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const provider = new AnchorProvider(connection, wallet, {});
      const program = new Program(KiteGuardIdl as KiteGuard, provider);

      // Using a dummy USDC mint for funding on devnet, or use the first token as funding if you prefer.
      // For this test, let's just use a hardcoded fake devnet USDC or the wallet owner as fundingMint to test the PDA.
      // Usually you'd have a devnet USDC mint. Let's assume there is one or just use a random key for testing.
      const devnetUsdcMint = new PublicKey(
        "4zMMC9srt5Ri5X14sgXRo6CWjLN1vc2in1t1b1Vf8w2Q",
      ); // Typical devnet USDC

      const [planPda] = findPlanPda(wallet.publicKey, devnetUsdcMint);

      // We need to parse amount properly (assuming 6 decimals for USDC)
      const amountDecimals = 6;
      const amountBn = new BN(parseFloat(fundingAmount) * 10 ** amountDecimals);

      const tx = await program.methods
        .createPlan({
          fundingAmount: amountBn,
          periodSeconds: new BN(parseInt(period)),
          periods: parseInt(periods),
          outputs: [
            {
              mint: new PublicKey(selectedToken),
              weightBps: TOTAL_WEIGHT_BPS,
            },
          ],
        })
        .accountsStrict({
          owner: wallet.publicKey,
          fundingMint: devnetUsdcMint,
          subscriptionAuthority: wallet.publicKey, // For now, owner is auth
          plan: planPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setSuccess(`Plan created successfully! TX: ${tx}`);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to create plan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      className="panel stack"
      style={{ gap: 20, scrollMarginTop: 110 }}
      aria-labelledby="guard-plan-title"
    >
      <div>
        <p className="eyebrow">Kite Guard · Devnet</p>
        <h2 id="guard-plan-title" className="mb-2">
          Set your investment rhythm.
        </h2>
        <p className="fineprint">
          Choose a devnet asset, set your amount and pick a schedule. This
          creates a <strong>Kite Guard</strong> plan directly on the devnet
          smart contract.
        </p>
      </div>

      <form
        className="stack"
        style={{ gap: 20 }}
        onSubmit={(event) => {
          event.preventDefault();
          void handleCreatePlan();
        }}
      >
        <fieldset className="investing-fields" disabled={loading}>
          <label className="form-field">
            <span>Devnet asset</span>
            <NativeSelect
              value={selectedToken}
              onChange={(e) => setSelectedToken(e.target.value)}
              disabled={loading || tokens.length === 0}
            >
              {tokens.length === 0 && (
                <option value="">Select a devnet asset</option>
              )}
              {tokens.map((t) => (
                <option key={t.mint} value={t.mint}>
                  {t.name} ({t.symbol})
                </option>
              ))}
            </NativeSelect>
          </label>

          <label className="form-field">
            <span>USDC per investment · Devnet</span>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              autoComplete="off"
              placeholder="10.00"
              value={fundingAmount}
              onChange={(e) => setFundingAmount(e.target.value)}
              disabled={loading}
            />
          </label>

          <div className={recurringStyles.schedule}>
            <div className={recurringStyles.scheduleHeading}>
              <span>
                <CalendarDays size={17} aria-hidden="true" /> Your schedule
              </span>
              <span>Devnet</span>
            </div>
            <div className="investing-field-row">
              <label className="form-field">
                <span>Repeat</span>
                <NativeSelect
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  disabled={loading}
                >
                  <option value="60">Every 60 seconds · Devnet test</option>
                  <option value="86400">Every day</option>
                  <option value="604800">Every week</option>
                </NativeSelect>
              </label>

              <label className="form-field">
                <span>Number of investments</span>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={periods}
                  onChange={(e) => setPeriods(e.target.value)}
                  disabled={loading}
                />
              </label>
            </div>
            <div className={recurringStyles.scheduleSummary}>
              <Repeat2 size={15} aria-hidden="true" />
              <span>
                {period === "60"
                  ? "Every 60 seconds"
                  : period === "86400"
                    ? "Every day"
                    : "Every week"}{" "}
                · {periods || "—"} planned investments
              </span>
            </div>
          </div>
        </fieldset>

        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p
            className="notice"
            role="status"
            style={{ overflowWrap: "anywhere" }}
          >
            {success}
          </p>
        )}

        <button
          className="btn full"
          type="submit"
          aria-busy={loading}
          disabled={loading || !wallet}
        >
          {loading ? "Creating devnet plan…" : "Create devnet plan"}
        </button>

        {!wallet && (
          <p className="fineprint text-center">
            Connect your wallet to create a devnet plan.
          </p>
        )}
      </form>
    </section>
  );
}
