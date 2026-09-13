import React, { useEffect, useRef, useState } from "react";
import {
  Linking,
  Pressable,
  Text,
  TextInput,
  View,
  Switch,
} from "react-native";
import {
  fromTokenAmount,
  MAINNET_SOL_MINT,
  maxSwapAmount,
  type MarketBasket,
  type MainnetHolding,
  type RecurringPayment,
  type WalletTransactionOrder,
} from "@kite/sdk";
import { Button, FilterRow } from "./Primitives";
import { useMobileTrading } from "../state/MobileTradingProvider";
import { kiteClient, WEB_URL } from "../lib/config";
import { colors, ui } from "../theme";

export function NativeComposedPanel({ basket }: { basket?: MarketBasket }) {
  const wallet = useMobileTrading(),
    version = useRef(0);
  const [holdings, setHoldings] = useState<MainnetHolding[]>([]),
    [mint, setMint] = useState(""),
    [amount, setAmount] = useState(""),
    [buyer, setBuyer] = useState(""),
    [period, setPeriod] = useState("Weekly"),
    [periods, setPeriods] = useState("4"),
    [consent, setConsent] = useState(false);
  const [payments, setPayments] = useState<RecurringPayment[]>([]),
    [order, setOrder] = useState<WalletTransactionOrder | null>(null),
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
    setConsent(false);
  }, [
    mint,
    amount,
    buyer,
    period,
    periods,
    basket?.id,
    wallet.account?.address,
  ]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    setHoldings([]);
    setPayments([]);
    setMint("");
    if (!wallet.account) return;
    const controller = new AbortController();
    setBusy(true);
    Promise.all([
      kiteClient.getPortfolio(wallet.account.address, controller.signal),
      basket
        ? Promise.resolve([])
        : kiteClient.getRecurringPayments(
            wallet.account.address,
            controller.signal,
          ),
    ])
      .then(([p, plans]) => {
        if (controller.signal.aborted) return;
        const list = p.holdings.filter(
          (h) =>
            maxSwapAmount(h) !== "0" && (basket || h.mint !== MAINNET_SOL_MINT),
        );
        setHoldings(list);
        setMint(list[0]?.mint ?? "");
        setPayments(plans);
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
  }, [wallet.account?.address, refresh, basket?.id]);
  async function prepare(revoke?: string) {
    if (!wallet.account || disabled) return;
    const request = version.current;
    setBusy(true);
    setOrder(null);
    setMessage("");
    try {
      let result: WalletTransactionOrder;
      let lines: string[];
      if (revoke) {
        result = await kiteClient.revokeRecurringPayment(
          wallet.account.address,
          revoke,
        );
        lines = [
          "Revoke this payment permission. Previously collected payments cannot be reversed.",
        ];
      } else if (basket) {
        const b = await kiteClient.requestBasketOrder({
          basketId: basket.id,
          inputMint: mint,
          amount,
          taker: wallet.account.address,
          slippageBps: 100,
          supportedTransactionVersions: [0],
        });
        result = b;
        lines = [
          `Pay ${fromTokenAmount(b.inAmount, b.inputDecimals)} ${token?.symbol}`,
          "Minimum received at 1% slippage:",
          ...b.outputs.map(
            (o) =>
              `${fromTokenAmount(o.minimumAmount, o.decimals)} ${o.symbol}${o.mint === b.inputMint ? " (retained)" : ""}`,
          ),
          "Priority fee up to 0.00001 SOL, plus network fees and token-account rent.",
        ];
      } else {
        const p = await kiteClient.requestRecurringPayment({
          taker: wallet.account.address,
          buyer: buyer.trim(),
          mint,
          amount,
          periodSeconds:
            period === "Daily" ? 86400 : period === "Weekly" ? 604800 : 2592000,
          periods: Number(periods),
        });
        result = p;
        lines = [
          `Buyer: ${p.payment.buyer}`,
          `Up to ${fromTokenAmount(p.payment.amountPerPeriod, p.decimals)} ${token?.symbol} per period, starting on confirmation.`,
          `Expires ${new Date(p.payment.expiresAt * 1000).toLocaleString()}. No vault deposit; network fees and rent apply.`,
        ];
      }
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
        <Text style={ui.heading}>
          {basket ? "Buy the whole basket" : "Recurring token payments"}
        </Text>
        <Text style={ui.body}>
          Use Kite web with Privy or a supported Solana wallet on this device.
        </Text>
        <Button
          label="Continue in Kite web"
          onPress={() => {
            void Linking.openURL(
              `${WEB_URL}/${basket ? `basket/${basket.id}` : "sip"}?mode=actual`,
            ).catch(() => setMessage("Unable to open Kite web."));
          }}
        />
        {message ? <Text style={ui.small}>{message}</Text> : null}
      </View>
    );
  return (
    <View style={ui.card}>
      <Text style={ui.heading}>
        {basket
          ? "One basket. One approval."
          : "Set a recurring payment limit."}
      </Text>
      <Text style={ui.body}>
        {basket
          ? "Every asset settles in one atomic transaction. If any swap fails, all swaps revert; network fees may still apply."
          : "Authorize a buyer to collect tokens each period. Your buyer runs the collection schedule; Kite holds no tokens or signing keys."}
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
            {basket ? "Basket amount" : "Maximum per period"} in{" "}
            {token?.symbol ?? "tokens"}
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
          {!basket && (
            <>
              <Text style={ui.label}>Buyer’s Solana wallet</Text>
              <TextInput
                style={ui.input}
                accessibilityLabel="Buyer wallet"
                value={buyer}
                onChangeText={setBuyer}
                editable={!disabled}
                autoCapitalize="none"
                maxLength={44}
              />
              <FilterRow
                options={["Daily", "Weekly", "Every 30 days"]}
                selected={period}
                onSelect={(v) => {
                  if (!disabled) setPeriod(v);
                }}
              />
              <Text style={ui.label}>
                Number of periods (expiry within one year)
              </Text>
              <TextInput
                style={ui.input}
                accessibilityLabel="Number of periods"
                keyboardType="number-pad"
                value={periods}
                onChangeText={setPeriods}
                editable={!disabled}
                maxLength={3}
              />
              <View style={ui.row}>
                <Switch
                  value={consent}
                  onValueChange={(value) => {
                    setConsent(value);
                    if (!value) setOrder(null);
                  }}
                  disabled={disabled}
                  accessibilityLabel="Consent to buyer withdrawals"
                />
                <Text style={[ui.small, { flex: 1 }]}>
                  I trust this buyer to withdraw the period limit. Stock
                  purchases and delivery are not enforced. The shared program
                  receives token delegate permission; its records enforce the
                  buyer’s limits. I can revoke it.
                </Text>
              </View>
            </>
          )}
          <Button
            label="Review transaction"
            loading={busy}
            disabled={
              disabled || !token || !amount || (!basket && (!buyer || !consent))
            }
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
          {payments.map((p) => (
            <View key={p.address} style={ui.card}>
              <Text style={ui.label}>
                Permission to {p.buyer.slice(0, 5)}…{p.buyer.slice(-4)}
              </Text>
              <Text style={ui.small}>
                {p.amountPerPeriod} base units every {p.periodSeconds / 86400}{" "}
                days ·{" "}
                {p.expiresAt
                  ? `Expires ${new Date(p.expiresAt * 1000).toLocaleDateString()}`
                  : "No expiry"}
              </Text>
              <Button
                secondary
                label="Review revocation"
                disabled={disabled}
                onPress={() => {
                  void prepare(p.address);
                }}
              />
            </View>
          ))}
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
