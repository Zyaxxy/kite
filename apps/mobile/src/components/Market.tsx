import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { MarketAsset } from "@kite/sdk";
import { money, percentage, useTheme } from "../theme";
import { useKite } from "../state/KiteProvider";

export function AssetLogo({
  asset,
  large = false,
}: {
  asset: MarketAsset;
  large?: boolean;
}) {
  const { colors, ui } = useTheme();
  const styles = useStyles();
  const [failed, setFailed] = useState(false);
  const size = large ? 64 : 38;
  return (
    <View
      style={[
        styles.logo,
        { width: size, height: size, borderRadius: large ? 16 : 11 },
      ]}
    >
      {asset.logoUrl && !failed ? (
        <Image
          accessibilityLabel={`${asset.name} logo`}
          accessibilityIgnoresInvertColors
          source={{ uri: asset.logoUrl }}
          style={{ width: size - 14, height: size - 14, borderRadius: 9 }}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={[styles.initial, large && { fontSize: 21 }]}>
          {asset.underlyingSymbol.slice(0, 2).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

export function AssetRow({
  asset,
  onPress,
  detail,
}: {
  asset: MarketAsset;
  onPress: () => void;
  detail?: string;
}) {
  const { colors, ui } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${asset.name}, ${money(asset.priceUsd)}, view asset`}
      onPress={onPress}
      style={({ pressed }) => [styles.assetRow, pressed && { opacity: 0.7 }]}
    >
      <AssetLogo asset={asset} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={ui.label} numberOfLines={1}>
          {asset.symbol}
        </Text>
        <Text style={ui.small} numberOfLines={1}>
          {detail || asset.name}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text style={ui.label}>{money(asset.priceUsd)}</Text>
        <Text
          style={[
            ui.small,
            asset.change24hPct != null &&
              (asset.change24hPct >= 0 ? ui.positive : ui.negative),
          ]}
        >
          {percentage(asset.change24hPct)}
        </Text>
      </View>
    </Pressable>
  );
}

export function MarketStatus() {
  const { colors, ui } = useTheme();
  const styles = useStyles();
  const { market, loading, error, storageError, refresh } = useKite();
  const [expanded, setExpanded] = useState(false);
  const issue = storageError || error;
  if (issue)
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void refresh();
        }}
        style={styles.notice}
      >
        <Text style={[ui.small, { color: colors.down }]}>{issue}</Text>
        <Text style={[ui.small, { color: colors.accent }]}>
          Refresh connection
        </Text>
      </Pressable>
    );
  if (market?.warnings.length)
    return (
      <View style={styles.notice}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            expanded ? "Hide market feed details" : "Show market feed details"
          }
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((value) => !value)}
          style={[ui.between, { minHeight: 28 }]}
        >
          <Text style={ui.small}>Some market feeds are unavailable</Text>
          <Text style={[ui.small, { color: colors.accent }]}>
            {expanded ? "Hide" : "Details"}
          </Text>
        </Pressable>
        {expanded
          ? market.warnings.map((warning) => (
              <Text key={warning} style={ui.small}>
                {warning}
              </Text>
            ))
          : null}
        {market.refreshing ? (
          <Text style={ui.small}>Updating mainnet prices…</Text>
        ) : null}
      </View>
    );
  return (
    <View style={ui.between}>
      <View style={ui.row}>
        <View style={styles.liveDot} />
        <Text style={ui.label}>Live market</Text>
      </View>
      <Text style={ui.small}>
        {loading || market?.refreshing
          ? "Refreshing…"
          : market
            ? `Updated ${new Date(market.asOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Connecting…"}
      </Text>
    </View>
  );
}

function useStyles() {
  const { colors } = useTheme();
  return StyleSheet.create({
    logo: {
      backgroundColor: colors.raised,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: "center",
      justifyContent: "center",
    },
    initial: { color: colors.accent, fontSize: 13, fontWeight: "600" },
    assetRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderColor: colors.line,
      minHeight: 72,
    },
    notice: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.raised,
      padding: 14,
      gap: 6,
    },
    liveDot: {
      width: 5,
      height: 5,
      borderRadius: 4,
      backgroundColor: colors.accent,
    },
  });
}
