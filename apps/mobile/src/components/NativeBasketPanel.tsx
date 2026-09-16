import React, { useEffect, useRef, useState } from "react";
import { Linking, Pressable, Text, TextInput, View } from "react-native";
import {
  fromTokenAmount,
  maxSwapAmount,
  type MarketBasket,
  type MainnetHolding,
  type WalletTransactionOrder,
} from "@kite/sdk";
import { Button } from "./Primitives";
import { useMobileTrading } from "../state/MobileTradingProvider";
import { kiteClient, WEB_URL } from "../lib/config";
import { useTheme } from "../theme";

export function NativeBasketPanel({ basket }: { basket: MarketBasket }) {
  const { colors, ui } = useTheme();
  const wallet = useMobileTrading(),
    version = useRef(0);
  const [holdings, setHoldings] = useState<MainnetHolding[]>([]),
    [mint, setMint] = useState(""),
    [amount, setAmount] = useState("");
  const [order, setOrder] = useState<WalletTransactionOrder | null>(null),
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
      if (!wallet.canSignV1)
        throw new Error(
          "Reconnect an updated wallet that supports V1 signing, or open Kite web.",
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
        "Priority fee up to 0.00001 SOL, plus network fees and token-account rent.",
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
          Open Kite web with a wallet that supports V1 transaction signing.
        </Text>
        <Button
          label="Continue in Kite web"
          disabled={!WEB_URL}
          onPress={() => {
            void Linking.openURL(
              `${WEB_URL}/basket/${basket.id}?mode=actual`,
            ).catch(() => setMessage("Unable to open Kite web."));
          }}
        />
        {message ? <Text style={ui.small}>{message}</Text> : null}
      </View>
    );
  return (
    <View style={ui.card}>
      <Text style={ui.heading}>One basket. One approval.</Text>
      <Text style={ui.body}>
        Every asset settles in one atomic transaction. If any swap fails, all
        swaps revert; network fees may still apply.
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
          {!wallet.canSignV1 && (
            <>
              <Text style={ui.small}>
                Reconnect a wallet that supports V1 signing to continue.
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
            disabled={disabled || !wallet.canSignV1 || !token || !amount}
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
                    .execute(order)
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
