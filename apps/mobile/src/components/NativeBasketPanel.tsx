import React, { useEffect, useRef, useState } from "react";
import { Linking, Pressable, Text, TextInput, View } from "react-native";
import {
  fromTokenAmount,
  maxSwapAmount,
  type MarketBasket,
  type MainnetHolding,
  type BasketPurchaseOrder,
} from "@kite/sdk";
import { Button } from "./Primitives";
import { useMobileTrading } from "../state/MobileTradingProvider";
import { kiteClient } from "../lib/config";
import { useTheme } from "../theme";

export function NativeBasketPanel({ basket }: { basket: MarketBasket }) {
  const { colors, ui } = useTheme();
  const wallet = useMobileTrading(),
    version = useRef(0);
  const [holdings, setHoldings] = useState<MainnetHolding[]>([]),
    [mint, setMint] = useState(""),
    [amount, setAmount] = useState("");
  const [order, setOrder] = useState<BasketPurchaseOrder | null>(null),
    [summary, setSummary] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [refresh, setRefresh] = useState(0),
    [now, setNow] = useState(Date.now());
  const token = holdings.find((h) => h.mint === mint),
    disabled = busy || wallet.busy || Boolean(wallet.pending);
  useEffect(() => {
    version.current++;
    setOrder(null);
  }, [mint, amount, basket.id, wallet.account?.address]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    setHoldings([]);
    setMint("");
    if (!wallet.account) return;
    const controller = new AbortController();
    setBusy(true);
    kiteClient
      .getPortfolio(wallet.account.address, controller.signal)
      .then((portfolio) => {
        if (controller.signal.aborted) return;
        const list = portfolio.holdings.filter(
          (holding) => maxSwapAmount(holding) !== "0",
        );
        setHoldings(list);
        setMint(list[0]?.mint ?? "");
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setMessage(
            e instanceof Error ? e.message : "Unable to read wallet data.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [wallet.account?.address, refresh, basket.id]);
  async function prepare() {
    if (!wallet.account || disabled) return;
    const request = version.current;
    setBusy(true);
    setOrder(null);
    setMessage("");
    try {
      if (!wallet.canSignV0)
        throw new Error(
          "Reconnect a wallet that supports V0 transaction signing.",
        );
      const b = await kiteClient.requestBasketOrder({
        basketId: basket.id,
        inputMint: mint,
        amount,
        taker: wallet.account.address,
        slippageBps: 100,
        supportedTransactionVersions: wallet.supportedTransactionVersions,
      });
      const result = b;
      const lines = [
        `Pay ${fromTokenAmount(b.inAmount, b.inputDecimals)} ${token?.symbol}`,
        "Minimum received at 1% slippage:",
        ...b.outputs.map(
          (o) =>
            `${fromTokenAmount(o.minimumAmount, o.decimals)} ${o.symbol}${o.mint === b.inputMint ? " (retained)" : ""}`,
        ),
        `Priority fee up to ${b.priorityFeeLamports / 1_000_000_000} SOL per transaction, plus network fees and token-account rent.`,
        ...("kind" in b && b.kind === "bundle"
          ? [
              `${b.transactions.length} transactions approved together · Jito tip ${b.tipLamports / 1_000_000_000} SOL.`,
              b.atomicityWarning,
            ]
          : ["All swaps settle in one atomic transaction."]),
      ];
      if (request === version.current) {
        setOrder(result);
        setSummary(lines);
      }
    } catch (e) {
      if (request === version.current)
        setMessage(
          e instanceof Error ? e.message : "Could not prepare transaction.",
        );
    } finally {
      setBusy(false);
    }
  }
  if (!wallet.supported)
    return (
      <View style={ui.card}>
        <Text style={ui.heading}>Buy the whole basket</Text>
        <Text style={ui.body}>
          Native basket signing requires an Android development or release build
          with a compatible wallet. You can use paper baskets on this platform.
        </Text>
        {message ? <Text style={ui.small}>{message}</Text> : null}
      </View>
    );
  return (
    <View style={ui.card}>
      <Text style={ui.heading}>One basket. Your wallet.</Text>
      <Text style={ui.body}>
        Review every allocation before signing. Larger baskets use a bundle of
        transactions; the review shows the tip, fees and execution limits.
      </Text>
      {!wallet.account ? (
        <Button
          label="Connect Android wallet"
          onPress={() => {
            void wallet.connect();
          }}
          disabled={!wallet.ready}
          loading={wallet.busy}
        />
      ) : (
        <>
          {!wallet.canSignV0 && (
            <>
              <Text style={ui.small}>
                Reconnect a wallet that supports V0 signing to continue.
              </Text>
              <Button
                label="Check wallet compatibility"
                onPress={() => {
                  void wallet.connect();
                }}
                disabled={wallet.busy}
              />
            </>
          )}
          <Text style={ui.label}>Pay with tokens in your wallet</Text>
          <View style={{ gap: 8 }}>
            {holdings.map((h) => (
              <Pressable
                key={h.mint}
                accessibilityRole="button"
                accessibilityState={{ selected: mint === h.mint }}
                disabled={disabled}
                onPress={() => setMint(h.mint)}
                style={[
                  ui.card,
                  {
                    padding: 12,
                    borderColor: mint === h.mint ? colors.accent : colors.line,
                  },
                ]}
              >
                <Text style={ui.label}>
                  {h.symbol} · {h.amount}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={ui.label}>
            Basket amount in {token?.symbol ?? "tokens"}
          </Text>
          <TextInput
            style={ui.input}
            accessibilityLabel="Token amount"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            editable={!disabled}
            maxLength={40}
            placeholder="0.00"
            placeholderTextColor={colors.muted}
          />
          <Button
            label="Review transaction"
            loading={busy}
            disabled={disabled || !wallet.canSignV0 || !token || !amount}
            onPress={() => {
              void prepare();
            }}
          />
          {order && (
            <View style={ui.stack}>
              {summary.map((line, i) => (
                <Text style={ui.small} key={i}>
                  {line}
                </Text>
              ))}
              <Button
                label={
                  order.expiresAt <= now
                    ? "Review expired"
                    : "Approve in wallet"
                }
                loading={wallet.busy}
                disabled={disabled || order.expiresAt <= now}
                onPress={() => {
                  void wallet
                    .executeBasket(order)
                    .then((result) => {
                      setMessage(
                        result.status === "Success"
                          ? "Transaction confirmed."
                          : (result.error ??
                              "Confirmation is unknown. Check wallet activity."),
                      );
                      setOrder(null);
                      if (result.status === "Success") setRefresh((r) => r + 1);
                    })
                    .catch((e) => {
                      setMessage(
                        e instanceof Error
                          ? e.message
                          : "Transaction not submitted.",
                      );
                      setOrder(null);
                    });
                }}
              />
            </View>
          )}
          <Button
            secondary
            label="Refresh wallet data"
            disabled={disabled}
            onPress={() => setRefresh((r) => r + 1)}
          />
        </>
      )}
      {message || wallet.error ? (
        <Text accessibilityRole="alert" style={ui.small}>
          {message || wallet.error}
        </Text>
      ) : null}
      {wallet.pending && (
        <View style={ui.stack}>
          <Text style={ui.body}>
            Previous confirmation is unresolved. Check your wallet before
            repeating any transaction.
          </Text>
          {wallet.pending.bundle ? (
            <Button
              label="Check bundle confirmation"
              loading={wallet.busy}
              onPress={() => {
                void wallet
                  .checkBundle()
                  .then((result) =>
                    setMessage(
                      result.status === "Success"
                        ? "Basket confirmed."
                        : (result.error ?? `Bundle status: ${result.status}`),
                    ),
                  )
                  .catch((error: unknown) =>
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "Confirmation unavailable.",
                    ),
                  );
              }}
            />
          ) : null}
          <Button
            secondary
            label="Open wallet activity"
            onPress={() => {
              void Linking.openURL(
                `https://solscan.io/account/${wallet.pending!.walletAddress}`,
              );
            }}
          />
          <Button
            secondary
            label="I checked the outcome — continue"
            onPress={() => {
              void wallet.acknowledgePending();
            }}
          />
        </View>
      )}
    </View>
  );
}
