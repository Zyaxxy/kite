import React, { useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getMarketPulse, type MarketAsset } from "@kite/sdk";
import { AssetRow, MarketStatus } from "../components/Market";
import { EmptyState, FilterRow, SectionTitle } from "../components/Primitives";
import { IconArrowUpRight } from "../components/Icons";
import type { Screen } from "../components/Navigation";
import { useKite } from "../state/KiteProvider";
import { money, useTheme } from "../theme";

export function HomeScreen({
  onNavigate,
  onAsset,
}: {
  onNavigate: (screen: Screen) => void;
  onAsset: (asset: MarketAsset) => void;
}) {
  const { colors, ui } = useTheme();
  const { market, loading, refresh, watchlist } = useKite();
  const [leaderboard, setLeaderboard] = useState("Trending");
  const pulse = useMemo(
    () => getMarketPulse(market?.assets ?? [], 6),
    [market],
  );
  const leaders = useMemo(() => {
    if (leaderboard === "Gainers") {
      return pulse.gainers;
    }
    if (leaderboard === "Losers") {
      return pulse.losers;
    }
    if (pulse.topVolume.length > 0) {
      return pulse.topVolume;
    }
    const priced = (market?.assets ?? []).filter(
      (a) =>
        (a.priceUsd !== null || a.underlyingPriceUsd !== null) &&
        !a.tradingHalted,
    );
    return priced
      .sort(
        (a, b) =>
          (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0) ||
          (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0) ||
          Math.abs(b.change24hPct ?? 0) - Math.abs(a.change24hPct ?? 0) ||
          a.symbol.localeCompare(b.symbol),
      )
      .slice(0, 6);
  }, [leaderboard, pulse, market]);
  const watched =
    market?.assets.filter((asset) => watchlist.includes(asset.mint)) ?? [];
  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={ui.content}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => {
            void refresh();
          }}
          tintColor={colors.accent}
        />
      }
    >
      <View style={ui.stack}>
        <Text style={ui.title}>Discover</Text>
        <Text style={ui.body}>Companies you know. Ideas worth following.</Text>
      </View>
      <View style={styles.shortcuts}>
        {(
          [
            {
              title: "Stocks",
              detail: "Explore the market",
              screen: "explore",
            },
            {
              title: "Watchlist",
              detail: `${watchlist.length} saved ideas`,
              screen: "watchlist",
            },
          ] as const
        ).map((item) => (
          <Pressable
            key={item.title}
            accessibilityRole="button"
            onPress={() => onNavigate(item.screen)}
            style={({ pressed }) => [
              styles.shortcut,
              {
                backgroundColor: colors.surface,
                borderColor: colors.line,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <View style={ui.between}>
              <Text style={ui.label}>{item.title}</Text>
              <IconArrowUpRight color={colors.accent} size={16} />
            </View>
            <Text style={ui.small}>{item.detail}</Text>
          </Pressable>
        ))}
      </View>
      <MarketStatus />
      <View style={ui.stack}>
        <SectionTitle
          title="Market movers"
          action="All stocks"
          onAction={() => onNavigate("explore")}
        />
        <FilterRow
          options={["Trending", "Gainers", "Losers"]}
          selected={leaderboard}
          onSelect={setLeaderboard}
        />
        <View style={{ borderTopWidth: 1, borderColor: colors.line }}>
          {leaders.length ? (
            leaders.map((asset) => (
              <AssetRow
                key={asset.mint}
                asset={asset}
                detail={
                  leaderboard === "Trending" && asset.volume24hUsd
                    ? `Vol: ${money(asset.volume24hUsd, 0)}`
                    : undefined
                }
                onPress={() => onAsset(asset)}
              />
            ))
          ) : (
            <EmptyState
              title={
                loading
                  ? `Loading ${leaderboard.toLowerCase()}`
                  : leaderboard === "Gainers"
                    ? "No advancing assets today"
                    : leaderboard === "Losers"
                      ? "No declining assets today"
                      : "Market activity unavailable"
              }
              description={
                loading
                  ? "Fetching latest 24-hour market prices..."
                  : leaderboard === "Gainers"
                    ? "No assets recorded a positive 24-hour price change in the latest session."
                    : leaderboard === "Losers"
                      ? "No assets recorded a negative 24-hour price change in the latest session."
                      : "Movers appear when the market feed returns observed prices and daily activity."
              }
              action="Browse stocks"
              onAction={() => onNavigate("explore")}
            />
          )}
        </View>
      </View>
      {pulse.breadth.coveredAssets > 0 ? (
        <View style={ui.card}>
          <View style={ui.between}>
            <Text style={ui.label}>Market direction</Text>
            <Text style={ui.small}>24h</Text>
          </View>
          <View style={ui.between}>
            <Text style={[ui.small, ui.positive]}>
              {pulse.breadth.advancing} advancing
            </Text>
            <Text style={[ui.small, ui.negative]}>
              {pulse.breadth.declining} declining
            </Text>
          </View>
          <View
            accessibilityLabel={`${pulse.breadth.advancing} advancing, ${pulse.breadth.declining} declining, ${pulse.breadth.unchanged} unchanged`}
            style={styles.breadth}
          >
            {pulse.breadth.advancing > 0 ? (
              <View
                style={{
                  flex: pulse.breadth.advancing,
                  backgroundColor: colors.up,
                }}
              />
            ) : null}
            {pulse.breadth.unchanged > 0 ? (
              <View
                style={{
                  flex: pulse.breadth.unchanged,
                  backgroundColor: colors.muted,
                }}
              />
            ) : null}
            {pulse.breadth.declining > 0 ? (
              <View
                style={{
                  flex: pulse.breadth.declining,
                  backgroundColor: colors.down,
                }}
              />
            ) : null}
          </View>
          <Text style={ui.small}>
            Based on {pulse.breadth.coveredAssets} actively traded assets with 24h returns (out of {pulse.totalAssets} catalog assets; remaining had no trades).
          </Text>
        </View>
      ) : null}
      <View style={ui.stack}>
        <SectionTitle
          title="On your radar"
          action="Watchlist"
          onAction={() => onNavigate("watchlist")}
        />
        {watched.length ? (
          watched
            .slice(0, 4)
            .map((asset) => (
              <AssetRow
                key={asset.mint}
                asset={asset}
                onPress={() => onAsset(asset)}
              />
            ))
        ) : (
          <EmptyState
            title="Keep a company in view"
            description="Save a stock from its research page. Its latest price will appear here."
            action="Find a stock"
            onAction={() => onNavigate("explore")}
          />
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => onNavigate("baskets")}
        style={[ui.card, { backgroundColor: colors.raised }]}
      >
        <View style={ui.between}>
          <Text style={ui.heading}>Explore baskets</Text>
          <IconArrowUpRight color={colors.accent} size={20} />
        </View>
        <Text style={ui.body}>
          See the companies and allocations behind each idea before you invest.
        </Text>
      </Pressable>
      <View
        style={{
          borderTopWidth: 1,
          borderColor: colors.line,
          paddingTop: 20,
          gap: 5,
        }}
      >
        <Text style={ui.label}>Your wallet. Your control.</Text>
        <Text style={ui.small}>
          Manage your account and device data in Settings.
        </Text>
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  shortcuts: { flexDirection: "row", gap: 12 },
  shortcut: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 16, gap: 8 },
  breadth: {
    height: 6,
    borderRadius: 6,
    flexDirection: "row",
    overflow: "hidden",
    gap: 3,
  },
});
