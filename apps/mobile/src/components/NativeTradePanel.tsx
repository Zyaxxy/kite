import React, { useEffect, useRef, useState } from "react";
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  canApproveTrade,
  fromTokenAmount,
  maxSwapAmount,
  toTokenAmount,
  type MainnetHolding,
  type MainnetPortfolio,
  type MainnetTradeOrder,
  type MainnetTradeResult,
  type MarketAsset,
} from "@kite/sdk";
import { Button, Chip, EmptyState } from "./Primitives";
import { useMobileTrading } from "../state/MobileTradingProvider";
import { kiteClient, WEB_URL } from "../lib/config";
import { money, useTheme } from "../theme";

export function NativeTradePanel({ asset }: { asset: MarketAsset }) {
  const { colors, ui } = useTheme();
  const styles = useStyles();
  const wallet = useMobileTrading();
  const [portfolio, setPortfolio] = useState<MainnetPortfolio | null>(null);
  const [input, setInput] = useState<MainnetHolding | null>(null);
  const [amount, setAmount] = useState("");
  const [order, setOrder] = useState<MainnetTradeOrder | null>(null);
  const [result, setResult] = useState<MainnetTradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(Date.now());
  const version = useRef(0);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      version.current += 1;
    };
  }, []);
  useEffect(() => {
    version.current += 1;
    setOrder(null);
    setError(null);
  }, [amount, input?.mint, asset.mint, wallet.account?.address]);
  useEffect(() => {
    setPortfolio(null);
    setInput(null);
    if (!wallet.account) return;
    const address = wallet.account.address;
    const controller = new AbortController();
    setLoading(true);
    kiteClient
      .getPortfolio(address, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setPortfolio(value);
        const candidates = value.holdings.filter(
          (holding) =>
            holding.mint !== asset.mint && maxSwapAmount(holding) !== "0",
        );
        setInput(candidates[0] ?? null);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Wallet balances are unavailable.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [wallet.account?.address, refresh, asset.mint]);
  useEffect(() => {
    if (!order) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [order]);

  async function quote() {
    if (!wallet.account || !input || wallet.pending || loading) return;
    const request = ++version.current;
    setError(null);
    setOrder(null);
    setResult(null);
    setLoading(true);
    try {
      if (!wallet.canSignV1)
        throw new Error(
          "Reconnect an updated wallet that supports V1 signing, or open Kite web.",
        );
      if (input.decimals === undefined)
        throw new Error(
          "Token precision is unavailable. Refresh your wallet balances.",
        );
      const address = wallet.account.address;
      const fresh = await kiteClient.getPortfolio(address);
      if (!active.current || request !== version.current) return;
      const currentInput = fresh.holdings.find(
        (holding) => holding.mint === input.mint,
      );
      if (!currentInput || currentInput.decimals === undefined)
        throw new Error(
          "This funding token is no longer available in your wallet. Refresh your balances.",
        );
      setPortfolio(fresh);
      const raw = BigInt(toTokenAmount(amount.trim(), currentInput.decimals));
      const maximum = maxSwapAmount(currentInput);
      if (
        maximum === "0" ||
        raw > BigInt(toTokenAmount(maximum, currentInput.decimals))
      )
        throw new Error(
          "Amount exceeds your available balance after the SOL fee reserve.",
        );
      const next = await kiteClient.requestTradeOrder({
        inputMint: input.mint,
        outputMint: asset.mint,
        amount: amount.trim(),
        taker: address,
        supportedTransactionVersions: wallet.supportedTransactionVersions,
      });
      if (active.current && request === version.current) {
        setOrder(next);
        setNow(Date.now());
      }
    } catch (failure) {
      if (active.current && request === version.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "A quote could not be prepared.",
        );
    } finally {
      if (active.current) setLoading(false);
    }
  }
  async function approve() {
    if (
      !order ||
      wallet.busy ||
      wallet.pending ||
      !canApproveTrade(order, wallet.account?.address ?? null)
    )
      return;
    setError(null);
    try {
      const next = await wallet.execute(order);
      if (active.current) {
        setResult(next);
        setOrder(null);
        if (next.status === "Success") {
          setAmount("");
          setRefresh((value) => value + 1);
        }
      }
    } catch (failure) {
      if (active.current) {
        setOrder(null);
        setError(
          failure instanceof Error
            ? failure.message
            : "The wallet request was not completed.",
        );
      }
    }
  }
  async function openWeb() {
    try {
      await Linking.openURL(
        `${WEB_URL}/stock/${encodeURIComponent(asset.mint)}?mode=actual`,
      );
    } catch {
      setError(
        "Kite web could not be opened. Check the configured web address.",
      );
    }
  }
  return (
    <View style={ui.card}>
      <View style={ui.between}>
        <Text style={ui.heading}>Swap into {asset.symbol}</Text>
        <Chip label="Mainnet" />
      </View>
      <Text style={ui.body}>
        Spend tokens you already hold. Review the route, then approve it in your
        wallet.
      </Text>
      {wallet.account && !wallet.canSignV1 && (
        <>
          <Text style={ui.small}>
            Reconnect a wallet that supports V1 signing to trade.
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
      {wallet.supported ? (
        <>
          {wallet.account ? (
            <View style={ui.between}>
              <Text style={ui.small}>
                {wallet.account.label || "Connected wallet"} ·{" "}
                {wallet.account.address.slice(0, 4)}…
                {wallet.account.address.slice(-4)}
              </Text>
              <Button
                secondary
                label="Refresh"
                disabled={wallet.busy || loading}
                onPress={() => setRefresh((value) => value + 1)}
              />
            </View>
          ) : (
            <Button
              label="Connect Android wallet"
              onPress={() => {
                void wallet.connect();
              }}
              loading={wallet.busy}
              disabled={!wallet.ready}
            />
          )}
          {wallet.pending ? (
            <View style={styles.notice}>
              <Text style={ui.label}>Check your previous swap</Text>
              <Text style={ui.body}>
                Confirmation is unknown. This swap may have completed. Check
                wallet activity before placing another trade.
              </Text>
              <Button
                secondary
                label="View wallet activity"
                onPress={() => {
                  void Linking.openURL(
                    `https://explorer.solana.com/address/${wallet.pending!.walletAddress}`,
                  );
                }}
              />
              <Button
                secondary
                label="I checked my wallet activity"
                disabled={wallet.busy}
                onPress={() => {
                  void wallet
                    .acknowledgePending()
                    .catch(() =>
                      setError(
                        "The pending swap could not be cleared from device storage.",
                      ),
                    );
                }}
              />
            </View>
          ) : null}
          {wallet.account && !wallet.pending ? (
            <>
              {loading && !portfolio ? (
                <Text style={ui.small}>
                  Reading your mainnet wallet balances…
                </Text>
              ) : null}
              {portfolio &&
              !portfolio.holdings.some(
                (holding) =>
                  holding.mint !== asset.mint && maxSwapAmount(holding) !== "0",
              ) ? (
                <EmptyState
                  title="No available funding tokens"
                  description="Add a supported token to this wallet and keep SOL available for network fees. Then refresh your balances."
                />
              ) : null}
              {portfolio?.holdings.some(
                (holding) =>
                  holding.mint !== asset.mint && maxSwapAmount(holding) !== "0",
              ) ? (
                <>
                  <Text style={ui.eyebrow}>PAY WITH · YOUR WALLET</Text>
                  <View style={styles.tokens}>
                    {portfolio.holdings
                      .filter(
                        (holding) =>
                          holding.mint !== asset.mint &&
                          maxSwapAmount(holding) !== "0",
                      )
                      .map((holding) => (
                        <Pressable
                          key={holding.mint}
                          accessibilityRole="button"
                          accessibilityState={{
                            selected: input?.mint === holding.mint,
                            disabled: wallet.busy,
                          }}
                          disabled={wallet.busy}
                          onPress={() => {
                            setInput(holding);
                            setAmount("");
                          }}
                          style={[
                            styles.token,
                            input?.mint === holding.mint && styles.selected,
                          ]}
                        >
                          <View style={ui.between}>
                            <Text style={ui.label}>{holding.symbol}</Text>
                            <Text style={ui.small}>
                              {money(holding.valueUsd)}
                            </Text>
                          </View>
                          <Text numberOfLines={1} style={ui.small}>
                            {holding.amount} {holding.symbol}
                          </Text>
                          {holding.verified === false ? (
                            <Text style={ui.small}>
                              Unverified · {holding.mint.slice(0, 4)}…
                              {holding.mint.slice(-4)}
                            </Text>
                          ) : null}
                        </Pressable>
                      ))}
                  </View>
                  <View style={ui.between}>
                    <Text style={ui.label}>You pay {input?.symbol}</Text>
                    <Button
                      secondary
                      label="Max"
                      disabled={!input || wallet.busy}
                      onPress={() =>
                        setAmount(maxSwapAmount(input ?? undefined))
                      }
                    />
                  </View>
                  <TextInput
                    accessibilityLabel={`Amount of ${input?.symbol ?? "funding token"} to swap`}
                    value={amount}
                    onChangeText={setAmount}
                    editable={!wallet.busy}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={colors.muted}
                    style={[ui.input, styles.amount]}
                  />
                  <Text style={ui.small}>
                    Max keeps 0.01 SOL for fees and rent. Quotes use raw token
                    units; issuer-adjusted display units can differ.
                  </Text>
                  <Button
                    label={order ? "Refresh quote" : "Review swap"}
                    onPress={() => {
                      void quote();
                    }}
                    loading={loading}
                    disabled={
                      !input || !amount || wallet.busy || asset.tradingHalted
                    }
                  />
                </>
              ) : null}
            </>
          ) : null}
          {order ? (
            <View style={styles.notice}>
              <Text style={ui.eyebrow}>REVIEW YOUR SWAP</Text>
              <View style={ui.between}>
                <Text style={ui.body}>You pay</Text>
                <Text style={ui.label}>
                  {fromTokenAmount(order.inAmount, order.inputDecimals)}{" "}
                  {order.inputSymbol}
                </Text>
              </View>
              <View style={ui.between}>
                <Text style={ui.body}>You receive</Text>
                <Text style={ui.label}>
                  {fromTokenAmount(order.outAmount, order.outputDecimals)}{" "}
                  {order.outputSymbol}
                </Text>
              </View>
              {order.otherAmountThreshold ? (
                <Text style={ui.small}>
                  Minimum received{" "}
                  {fromTokenAmount(
                    order.otherAmountThreshold,
                    order.outputDecimals,
                  )}{" "}
                  {order.outputSymbol}
                </Text>
              ) : null}
              <Text style={ui.small}>
                Slippage {order.slippageBps / 100}% · Routing fee{" "}
                {order.feeBps / 100}% · {order.router}
              </Text>
              <Text style={ui.small}>
                Your wallet shows the network fee before approval. Quote expires
                in {Math.max(0, Math.ceil((order.expiresAt - now) / 1000))}s.
              </Text>
              <Button
                label="Approve in wallet"
                onPress={() => {
                  void approve();
                }}
                loading={wallet.busy}
                disabled={
                  Boolean(wallet.pending) ||
                  !canApproveTrade(order, wallet.account?.address ?? null, now)
                }
              />
            </View>
          ) : null}
          {result ? (
            <View style={styles.notice}>
              <Text accessibilityRole="alert" style={ui.label}>
                {result.status === "Success"
                  ? "Swap confirmed"
                  : result.status === "Unknown"
                    ? "Confirmation pending"
                    : "Swap not completed"}
              </Text>
              {result.error ? (
                <Text style={ui.small}>{result.error}</Text>
              ) : null}
              {result.signature ? (
                <Button
                  secondary
                  label="View transaction"
                  onPress={() => {
                    void Linking.openURL(
                      `https://explorer.solana.com/tx/${result.signature}`,
                    );
                  }}
                />
              ) : null}
            </View>
          ) : null}
        </>
      ) : (
        <Text style={ui.small}>
          Native signing is available in Kite’s Android development and release
          builds. This device can use Privy on Kite web.
        </Text>
      )}
      {wallet.error || error ? (
        <Text accessibilityRole="alert" style={[ui.small, ui.negative]}>
          {error || wallet.error}
        </Text>
      ) : null}
      <View style={ui.divider} />
      <Button
        secondary
        label="Continue with Privy on web"
        disabled={!WEB_URL || wallet.busy}
        onPress={() => {
          void openWeb();
        }}
      />
    </View>
  );
}
function useStyles() {
  const { colors } = useTheme();
  return StyleSheet.create({
    tokens: { gap: 8 },
    token: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      padding: 14,
      gap: 4,
      minHeight: 64,
    },
    selected: { borderColor: colors.accent, backgroundColor: colors.raised },
    amount: { fontSize: 30, fontVariant: ["tabular-nums"] },
    notice: {
      backgroundColor: colors.raised,
      borderRadius: 12,
      padding: 16,
      gap: 12,
    },
  });
}
