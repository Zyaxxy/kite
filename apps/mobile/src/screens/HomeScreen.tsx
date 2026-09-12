import React, { useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getMarketPulse, valuePaperAccount, type MarketAsset } from "@kite/sdk";
import { AssetRow, MarketStatus } from "../components/Market";
import {
  Button,
  Chip,
  EmptyState,
  FilterRow,
  OrbitArt,
  SectionTitle,
} from "../components/Primitives";
import type { Screen } from "../components/Navigation";
import { useKite } from "../state/KiteProvider";
import { colors, money, percentage, ui } from "../theme";

export function HomeScreen({
  onNavigate,
  onAsset,
}: {
  onNavigate: (screen: Screen) => void;
  onAsset: (asset: MarketAsset) => void;
}) {
  const { account, market, loading, ready, refresh, watchlist } = useKite();
  const [leaderboard, setLeaderboard] = useState("Volume");
  const pulse = useMemo(
    () => getMarketPulse(market?.assets ?? [], 4),
    [market],
  );
  const leaders =
    leaderboard === "Gainers"
      ? pulse.gainers
      : leaderboard === "Losers"
        ? pulse.losers
        : pulse.topVolume;
  const basketCount = market?.baskets.length ?? 0;
  const availableBaskets =
    market?.baskets.filter((basket) => basket.available).length ?? 0;
  const valuation = valuePaperAccount(account, market?.assets ?? []);
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
        <Text style={ui.eyebrow}>A NEW WAY TO OWN WHAT'S NEXT</Text>
        <Text style={ui.title}>Big ideas.{"\n"}Smaller starting points.</Text>
        <Text style={ui.body}>
          Explore tokenized companies and build your own point of view.
        </Text>
      </View>
      <View style={styles.balanceCard}>
        <View style={ui.between}>
          <Text style={[ui.eyebrow, { color: colors.accentInk }]}>
            YOUR PAPER PORTFOLIO
          </Text>
          <Text style={styles.virtualLabel}>VIRTUAL USD</Text>
        </View>
        <Text style={[ui.money, { color: colors.accentInk }]}>
          {ready ? money(valuation.totalUsd) : "Loading…"}
        </Text>
        <Text style={styles.balanceNote}>
          {account.orders.length
            ? `${money(valuation.profitLossUsd)} · ${percentage(valuation.profitLossPct)} all time`
            : `${money(account.startingCashUsd)} in virtual funds. Your first move is yours.`}
        </Text>
        <View style={styles.balanceDivider} />
        <View style={ui.between}>
          <Text style={styles.balanceNote}>Buying power</Text>
          <Text style={styles.balanceAmount}>{money(account.cashUsd)}</Text>
        </View>
        <Button
          secondary
          label="Explore investments"
          onPress={() => onNavigate("explore")}
        />
      </View>
      <View style={ui.card}>
        <View style={ui.between}>
          <View style={{ flex: 1, gap: 10 }}>
            <Text style={ui.eyebrow}>CURATED CONVICTION</Text>
            <Text style={ui.heading}>One idea.{"\n"}A whole basket.</Text>
          </View>
          <OrbitArt small />
        </View>
        <Text style={ui.body}>
          From semiconductors and healthcare to everyday spending. Discover
          thematic allocations built from mainnet assets.
        </Text>
        {basketCount ? (
          <View style={styles.categories}>
            <Chip label={`${basketCount} ideas to explore`} />
            <Chip label={`${availableBaskets} with complete prices`} />
          </View>
        ) : null}
        <Button
          secondary
          label="Discover baskets"
          onPress={() => onNavigate("baskets")}
        />
      </View>
      <MarketStatus />
      <View style={ui.card}>
        <View style={ui.stack}>
          <Text style={ui.eyebrow}>MARKET PULSE</Text>
          <Text style={ui.heading}>Where the activity is.</Text>
          <Text style={ui.small}>
            Observed 24-hour token-market breadth across{" "}
            {pulse.breadth.coveredAssets} assets with change data.
          </Text>
        </View>
        <View style={styles.pulseGrid}>
          <View style={styles.pulseMetric}>
            <Text style={[styles.pulseValue, ui.positive]}>
              {market ? pulse.breadth.advancing : "—"}
            </Text>
            <Text style={ui.small}>Advancing</Text>
          </View>
          <View style={styles.pulseMetric}>
            <Text style={[styles.pulseValue, ui.negative]}>
              {market ? pulse.breadth.declining : "—"}
            </Text>
            <Text style={ui.small}>Declining</Text>
          </View>
          <View style={styles.pulseMetric}>
            <Text style={styles.pulseValue}>
              {market ? pulse.breadth.unchanged : "—"}
            </Text>
            <Text style={ui.small}>Unchanged</Text>
          </View>
        </View>
        {pulse.breadth.coveredAssets > 0 ? (
          <View
            accessibilityLabel={`${pulse.breadth.advancing} advancing, ${pulse.breadth.declining} declining, ${pulse.breadth.unchanged} unchanged`}
            style={styles.breadthBar}
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
        ) : (
          <Text style={ui.small}>
            Waiting for sufficient token change data.
          </Text>
        )}
        <View style={ui.divider} />
        <View style={ui.between}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={ui.label}>24h traded volume</Text>
            <Text style={ui.small}>
              {pulse.volumeCoveredAssets} assets with volume data
            </Text>
          </View>
          <Text style={[ui.heading, { flexShrink: 1 }]}>
            {compactMoney(pulse.volume24hUsd)}
          </Text>
        </View>
        <Text style={ui.small}>
          {pulse.pricedAssets} of {pulse.tradableAssets} active assets have
          token prices. Coverage uses active assets with observed token prices
          and reported daily activity.
        </Text>
      </View>
      <View style={ui.stack}>
        <SectionTitle
          title="On your radar"
          action="Watchlist"
          onAction={() => onNavigate("watchlist")}
        />
        {watched.length ? (
          <View>
            {watched.slice(0, 4).map((asset) => (
              <AssetRow
                key={asset.mint}
                asset={asset}
                onPress={() => onAsset(asset)}
              />
            ))}
          </View>
        ) : (
          <EmptyState
            title="Keep your next idea close."
            description="Save assets to your watchlist as you explore. Your picks will appear here."
            action="Find an asset"
            onAction={() => onNavigate("explore")}
          />
        )}
      </View>
      <View style={ui.stack}>
        <SectionTitle
          title="Market leaders"
          action="View all"
          onAction={() => onNavigate("explore")}
        />
        <FilterRow
          options={["Volume", "Gainers", "Losers"]}
          selected={leaderboard}
          onSelect={setLeaderboard}
        />
        {leaders.length ? (
          leaders.map((asset) => (
            <AssetRow
              key={asset.mint}
              asset={asset}
              detail={
                leaderboard === "Volume"
                  ? `${compactMoney(asset.volume24hUsd)} traded in 24h`
                  : asset.name
              }
              onPress={() => onAsset(asset)}
            />
          ))
        ) : (
          <Text style={ui.body}>
            {loading
              ? "Loading observed market activity…"
              : `No ${leaderboard.toLowerCase()} are available from the current token data.`}
          </Text>
        )}
        <Text style={ui.small}>
          Ranked using available token prices and activity. Missing or halted
          assets are excluded.
        </Text>
      </View>
    </ScrollView>
  );
}

function compactMoney(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  const scale =
    value >= 1e12
      ? 1e12
      : value >= 1e9
        ? 1e9
        : value >= 1e6
          ? 1e6
          : value >= 1e3
            ? 1e3
            : 1;
  const suffix =
    scale === 1e12
      ? "T"
      : scale === 1e9
        ? "B"
        : scale === 1e6
          ? "M"
          : scale === 1e3
            ? "K"
            : "";
  return `${money(value / scale)}${suffix}`;
}

const styles = StyleSheet.create({
  balanceCard: {
    backgroundColor: colors.accent,
    borderRadius: 22,
    padding: 22,
    gap: 14,
  },
  virtualLabel: {
    color: colors.accentInk,
    fontSize: 8,
    letterSpacing: 1,
    borderWidth: 1,
    borderColor: "#9DB656",
    borderRadius: 5,
    padding: 4,
  },
  balanceNote: { color: "#42512B", fontSize: 12, lineHeight: 19 },
  balanceAmount: { color: colors.accentInk, fontSize: 16, fontWeight: "600" },
  balanceDivider: { height: 1, backgroundColor: "#B4D15F", marginTop: 4 },
  categories: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pulseGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  pulseMetric: { flex: 1, minWidth: 70, gap: 4 },
  pulseValue: {
    color: colors.ink,
    fontSize: 27,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  breadthBar: {
    flexDirection: "row",
    height: 7,
    borderRadius: 10,
    overflow: "hidden",
  },
});
