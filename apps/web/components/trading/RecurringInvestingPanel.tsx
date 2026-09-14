"use client";

import { useEffect, useState } from "react";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  KiteGuardIdl,
  KiteGuard,
  KITE_GUARD_PROGRAM_ID,
  findPlanPda,
  TOTAL_WEIGHT_BPS,
} from "@kite/sdk";

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
      const devnetUsdcMint = new PublicKey("4zMMC9srt5Ri5X14sgXRo6CWjLN1vc2in1t1b1Vf8w2Q"); // Typical devnet USDC

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
    <div className="panel stack" style={{ gap: 16 }}>
      <div>
        <h2 className="mb-2">Devnet Trustless Recurring Plan</h2>
        <p className="fineprint">
          Create a non-custodial recurring plan using <strong>Kite Guard</strong>. This executes directly on devnet smart contracts.
        </p>
      </div>

      <label className="form-field">
        <span>Target Devnet Asset</span>
        <select
          value={selectedToken}
          onChange={(e) => setSelectedToken(e.target.value)}
          disabled={loading || tokens.length === 0}
        >
          {tokens.map((t) => (
            <option key={t.mint} value={t.mint}>
              {t.name} ({t.symbol})
            </option>
          ))}
        </select>
      </label>

      <label className="form-field">
        <span>Funding Amount (USDC) per period</span>
        <input
          type="number"
          value={fundingAmount}
          onChange={(e) => setFundingAmount(e.target.value)}
          disabled={loading}
        />
      </label>

      <label className="form-field">
        <span>Execution Interval</span>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          disabled={loading}
        >
          <option value="60">Every 60 Seconds (Devnet Test)</option>
          <option value="86400">Every Day</option>
          <option value="604800">Every Week</option>
        </select>
      </label>

      <label className="form-field">
        <span>Total Installments</span>
        <input
          type="number"
          min="1"
          max="365"
          value={periods}
          onChange={(e) => setPeriods(e.target.value)}
          disabled={loading}
        />
      </label>

      {error && <p className="notice" style={{ color: "red" }}>{error}</p>}
      {success && <p className="notice" style={{ color: "green", wordBreak: "break-all" }}>{success}</p>}

      <button
        className="btn full"
        onClick={handleCreatePlan}
        disabled={loading || !wallet}
      >
        {loading ? "Creating Plan..." : "Create Devnet Plan"}
      </button>

      {!wallet && <p className="fineprint text-center">Please connect your wallet first.</p>}
    </div>
  );
}
