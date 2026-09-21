import React, { useState } from "react";
import {
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { executePaperOrder, type MarketAsset } from "@kite/sdk";
import { AssetLogo, MarketStatus } from "../components/Market";
import { Button, Chip, FilterRow } from "../components/Primitives";
import { StockResearch } from "../components/StockResearch";
import { useKite } from "../state/KiteProvider";
import { NativeTradePanel } from "../components/NativeTradePanel";
import { money, percentage, useTheme } from "../theme";

export function AssetScreen({
  asset,
  onClose,
  onPlan,
}: {
  asset: MarketAsset;
  onClose: () => void;
  onPlan: (asset: MarketAsset, mode?: "Paper" | "Actual") => void;
}) {
  const { colors, ui } = useTheme();
  const styles = useStyles();
  const {
    account,
    watchlist,
    toggleWatch,
    updateAccount,
    loading,
    refresh,
    ready,
  } = useKite();
  const [mode, setMode] = useState("Paper");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [researchRefresh, setResearchRefresh] = useState(0);
  const held = account.positions.find(
    (position) => position.mint === asset.mint,
  );
  const numericAmount = Number(amount);
  const canTrade = ready && asset.priceUsd !== null && !asset.tradingHalted;
  const hasReference =
    asset.underlyingPriceUsd != null &&
    Number.isFinite(asset.underlyingPriceUsd) &&
    asset.underlyingPriceUsd > 0;
  const showReference = asset.priceUsd === null && hasReference;

  function trade() {
    try {
      updateAccount((current) =>
        executePaperOrder(current, asset, side, numericAmount),
      );
      setAmount("");
      setError(null);
      setNotice(
        `${side === "buy" ? "Bought" : "Sold"} ${money(numericAmount)} of ${asset.symbol} using virtual funds. View the fill in Portfolio.`,
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "This paper order could not be placed.",
      );
    }
  }

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={ui.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => {
            void refresh();
            setResearchRefresh((current) => current + 1);
          }}
          tintColor={colors.accent}
        />
      }
    >
      <Button secondary label="← Back to market" onPress={onClose} />
      <View style={ui.between}>
        <AssetLogo asset={asset} large />
        <Chip
          label={watchlist.includes(asset.mint) ? "Saved" : "Save stock"}
          selected={watchlist.includes(asset.mint)}
          onPress={() => toggleWatch(asset.mint)}
        />
      </View>
      <View style={ui.stack}>
        <View style={styles.issuerBadge}>
          <Text style={styles.issuerText}>
            {asset.issuer === "prestocks"
              ? "PreStocks · Private equity"
              : `${asset.kind === "etf" ? "ETF" : "Equity"} · ${asset.issuer === "backpack" ? "Backpack" : "xStocks"}`}
          </Text>
        </View>
        <Text style={ui.title}>{asset.name}</Text>
        <Text style={ui.body}>{asset.symbol}</Text>
      </View>
      <View style={ui.stack}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={ui.small}>
            {showReference
              ? "Underlying share reference"
              : "Live token price"}
          </Text>
          {showReference && asset.isRealTimePyth ? (
            <View style={styles.pythRealTimeBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.pythRealTimeBadgeText}>Pyth Real-Time</Text>
            </View>
          ) : null}
        </View>
        <Text style={ui.money}>
          {money(showReference ? asset.underlyingPriceUsd : asset.priceUsd)}
        </Text>
        {showReference ? (
          <Text style={ui.small}>
            The underlying share has a Pyth reference price. A token market price is
            currently unavailable.
          </Text>
        ) : (
          <Text
            style={[
              ui.label,
              asset.change24hPct != null &&
                (asset.change24hPct >= 0 ? ui.positive : ui.negative),
            ]}
          >
            {percentage(asset.change24hPct)}
            {asset.change24hPct != null ? " past 24h" : ""}
          </Text>
        )}
        {asset.priceUsd !== null && hasReference && (
          <View style={styles.pythRefRow}>
            <Text style={ui.small}>Underlying share:</Text>
            <Text style={[ui.label, { color: colors.accent }]}>
              {money(asset.underlyingPriceUsd)}
            </Text>
            <View
              style={
                asset.isRealTimePyth ? styles.pythRealTimeBadge : styles.pythBadge
              }
            >
              {asset.isRealTimePyth ? <View style={styles.liveDot} /> : null}
              <Text
                style={
                  asset.isRealTimePyth
                    ? styles.pythRealTimeBadgeText
                    : styles.pythBadgeText
                }
              >
                {asset.isRealTimePyth ? "Pyth Real-Time" : "via Pyth"}
              </Text>
            </View>
            {asset.underlyingConfidenceUsd ? (
              <Text style={[ui.small, { color: colors.muted, fontSize: 11 }]}>
                ±$
                {asset.underlyingConfidenceUsd < 0.01
                  ? asset.underlyingConfidenceUsd.toFixed(4)
                  : asset.underlyingConfidenceUsd.toFixed(2)}
              </Text>
            ) : null}
          </View>
        )}
      </View>
      <MarketStatus />
      <View style={ui.card}>
        <Text style={ui.heading}>Market metrics</Text>
        <View style={ui.between}>
          <Text style={ui.body}>24h traded volume</Text>
          <Text style={ui.label}>{money(asset.volume24hUsd, 0)}</Text>
        </View>
        <View style={ui.between}>
          <Text style={ui.body}>Liquidity</Text>
          <Text style={ui.label}>{money(asset.liquidityUsd, 0)}</Text>
        </View>
        <View style={ui.between}>
          <Text style={ui.body}>Token market cap</Text>
          <Text style={ui.label}>{money(asset.marketCapUsd, 0)}</Text>
        </View>
        {hasReference ? (
          <View style={ui.between}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={ui.body}>Underlying price</Text>
              <View
                style={
                  asset.isRealTimePyth
                    ? styles.pythRealTimeBadge
                    : styles.pythBadge
                }
              >
                {asset.isRealTimePyth ? <View style={styles.liveDot} /> : null}
                <Text
                  style={
                    asset.isRealTimePyth
                      ? styles.pythRealTimeBadgeText
                      : styles.pythBadgeText
                  }
                >
                  {asset.isRealTimePyth ? "Pyth Real-Time" : "via Pyth"}
                </Text>
              </View>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={ui.label}>{money(asset.underlyingPriceUsd)}</Text>
              {asset.underlyingConfidenceUsd ? (
                <Text
                  style={[ui.small, { color: colors.muted, fontSize: 10 }]}
                >
                  ±$
                  {asset.underlyingConfidenceUsd < 0.01
                    ? asset.underlyingConfidenceUsd.toFixed(4)
                    : asset.underlyingConfidenceUsd.toFixed(2)}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}
        <View style={ui.divider} />
        <Text style={ui.small}>
          Token market prices and underlying share references can differ. Paper
          fills require a token price; actual swaps use a fresh executable
          quote.
        </Text>
        {asset.priceObservedAt ? (
          <Text style={ui.small}>
            Price observed {new Date(asset.priceObservedAt).toLocaleString()}
          </Text>
        ) : null}
        {hasReference && asset.underlyingPriceUpdatedAt ? (
          <Text style={ui.small}>
            Pyth reference updated{" "}
            {new Date(asset.underlyingPriceUpdatedAt).toLocaleString()}
          </Text>
        ) : null}
      </View>
      <FilterRow
        options={["Paper", "Actual"]}
        selected={mode}
        onSelect={setMode}
      />
      {mode === "Paper" ? (
        <>
          <View style={ui.card}>
            <View style={ui.between}>
              <Text style={ui.heading}>Your next move.</Text>
              <Chip label="Paper trade" selected />
            </View>
            <FilterRow
              options={["Buy", "Sell"]}
              selected={side === "buy" ? "Buy" : "Sell"}
              onSelect={(value) => {
                setSide(value === "Buy" ? "buy" : "sell");
                setError(null);
              }}
            />
            <Text style={ui.small}>
              {side === "buy"
                ? `${money(account.cashUsd)} virtual buying power`
                : `${(held?.quantity ?? 0).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${asset.symbol} paper units held`}
            </Text>
            <Text style={ui.label}>Amount in virtual USD</Text>
            <TextInput
              accessibilityLabel="Paper trade amount in dollars"
              value={amount}
              onChangeText={(value) => {
                setAmount(value);
                setNotice(null);
              }}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.muted}
              style={[ui.input, { fontSize: 30 }]}
            />
            <View style={ui.between}>
              <Text style={ui.body}>Estimated units</Text>
              <Text style={ui.label}>
                {asset.priceUsd && numericAmount > 0
                  ? (numericAmount / asset.priceUsd).toLocaleString("en-US", {
                      maximumFractionDigits: 6,
                    })
                  : "—"}
              </Text>
            </View>
            {notice ? (
              <Text accessibilityRole="alert" style={[ui.small, ui.positive]}>
                {notice}
              </Text>
            ) : null}
            {error ? (
              <Text accessibilityRole="alert" style={[ui.small, ui.negative]}>
                {error}
              </Text>
            ) : null}
            {!canTrade ? (
              <Text style={[ui.small, ui.negative]}>
                {!ready
                  ? "Paper account is not ready."
                  : asset.tradingHalted
                    ? asset.tradingNotice ||
                      "Trading is currently halted for this asset."
                    : "A live price is required to place a paper trade."}
              </Text>
            ) : null}
            <Button
              label={`Paper ${side} ${asset.symbol}`}
              onPress={trade}
              disabled={
                !canTrade ||
                !Number.isFinite(numericAmount) ||
                numericAmount <= 0
              }
            />
            <Text style={ui.small}>
              Simulated fill at the observed price. No tokens move and no wallet
              signature is requested. Real execution may include fees and
              slippage.
            </Text>
          </View>
          <View style={ui.card}>
            <Text style={ui.heading}>Build a rhythm.</Text>
            <Text style={ui.body}>
              Turn this idea into a recurring paper investment.
            </Text>
            <Button
              secondary
              label="Create a paper plan"
              onPress={() => onPlan(asset)}
              disabled={!canTrade}
            />
          </View>
        </>
      ) : (
        <>
          <NativeTradePanel asset={asset} />
          <Button
            secondary
            label="Set up recurring investment"
            onPress={() => onPlan(asset, "Actual")}
          />
        </>
      )}
      <StockResearch asset={asset} refreshKey={researchRefresh} />
      <View style={ui.card}>
        <Text style={ui.heading}>Issuer & mint</Text>
        <Text style={ui.body}>
          Tokenized exposure has issuer-specific terms, restrictions and risks.
          Review the issuer before placing a real trade.
        </Text>
        <Text selectable style={ui.small}>
          Solana mint{"\n"}
          {asset.mint}
        </Text>
        <Button
          secondary
          label="Read issuer information"
          onPress={() => {
            void Linking.openURL(asset.sourceUrl).catch(() =>
              setError("The issuer page could not be opened."),
            );
          }}
        />
      </View>
    </ScrollView>
  );
}

function useStyles() {
  const { colors } = useTheme();
  return StyleSheet.create({
    issuerBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: colors.raised,
      borderWidth: 1,
      borderColor: colors.line,
    },
    issuerText: {
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 0.5,
      color: colors.accent,
    },
    pythBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: colors.raised,
      borderWidth: 1,
      borderColor: colors.line,
    },
    pythBadgeText: {
      fontSize: 10,
      fontWeight: "600",
      color: colors.accent,
      letterSpacing: 0.3,
    },
    pythRealTimeBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: "rgba(16, 185, 129, 0.12)",
      borderWidth: 1,
      borderColor: "rgba(16, 185, 129, 0.28)",
    },
    pythRealTimeBadgeText: {
      fontSize: 10,
      fontWeight: "600",
      color: "#10b981",
      letterSpacing: 0.3,
    },
    liveDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: "#10b981",
    },
    pythRefRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 2,
    },
  });
}
