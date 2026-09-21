import React, { useMemo, useState } from "react";
import {
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import type { BackpackSecurity, MarketAsset } from "@kite/sdk";
import { AssetRow, MarketStatus } from "../components/Market";
import { EmptyState, FilterRow } from "../components/Primitives";
import { IconArrowUpRight, IconChevronRight } from "../components/Icons";
import { useKite } from "../state/KiteProvider";
import { useTheme } from "../theme";

type Entry =
  | { kind: "asset"; asset: MarketAsset }
  | { kind: "security"; security: BackpackSecurity };
const FILTERS = [
  "All assets",
  "Top gainers",
  "Top losers",
  "Most traded",
  "With prices",
  "xStocks",
  "PreStocks",
  "Backpack",
  "ETFs",
] as const;
export function ExploreScreen({
  onAsset,
  onBaskets,
  watchlistOnly = false,
}: {
  onAsset: (asset: MarketAsset) => void;
  onBaskets: () => void;
  watchlistOnly?: boolean;
}) {
  const { colors, ui } = useTheme();
  const { market, watchlist, loading, refresh, error } = useKite();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All assets");
  const [linkError, setLinkError] = useState("");
  const entries = useMemo(() => {
    const search = query.trim().toLowerCase();
    const matches = (value: string) => value.toLowerCase().includes(search);
    const assets = (market?.assets ?? [])
      .filter((asset) => {
        if (watchlistOnly && !watchlist.includes(asset.mint)) return false;
        if (
          filter === "With prices" &&
          (asset.priceUsd === null || asset.tradingHalted)
        )
          return false;
        if (
          filter === "Top gainers" &&
          (asset.change24hPct === null || asset.change24hPct <= 0)
        )
          return false;
        if (
          filter === "Top losers" &&
          (asset.change24hPct === null || asset.change24hPct >= 0)
        )
          return false;
        if (
          filter === "Most traded" &&
          (asset.volume24hUsd === null || asset.volume24hUsd <= 0)
        )
          return false;
        if (filter === "xStocks" && asset.issuer !== "xstocks") return false;
        if (filter === "PreStocks" && asset.issuer !== "prestocks")
          return false;
        if (filter === "Backpack" && asset.issuer !== "backpack") return false;
        if (filter === "ETFs" && asset.kind !== "etf") return false;
        return matches(
          `${asset.symbol} ${asset.name} ${asset.underlyingSymbol} ${asset.mint}`,
        );
      })
      .sort((a, b) => {
        if (filter === "Top gainers") {
          return (b.change24hPct ?? -Infinity) - (a.change24hPct ?? -Infinity);
        }
        if (filter === "Top losers") {
          return (a.change24hPct ?? Infinity) - (b.change24hPct ?? Infinity);
        }
        if (filter === "Most traded") {
          return (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0);
        }
        return (
          Number(b.priceUsd !== null && !b.tradingHalted) -
            Number(a.priceUsd !== null && !a.tradingHalted) ||
          (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0) ||
          a.name.localeCompare(b.name)
        );
      });
    const result: Entry[] = assets.map((asset) => ({ kind: "asset", asset }));
    if (filter === "Backpack" && !watchlistOnly) {
      const executable = new Set(
        (market?.assets ?? [])
          .filter((asset) => asset.issuer === "backpack")
          .map((asset) => asset.mint),
      );
      result.push(
        ...(market?.backpackSecurities ?? [])
          .filter(
            (security) =>
              (!security.solanaMint || !executable.has(security.solanaMint)) &&
              matches(
                `${security.symbol} ${security.name} ${security.underlyingSymbol}`,
              ),
          )
          .map((security) => ({ kind: "security" as const, security })),
      );
    }
    return result;
  }, [market, watchlist, watchlistOnly, filter, query]);
  return (
    <FlatList<Entry>
      style={ui.screen}
      contentContainerStyle={[ui.content, { gap: 0 }]}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
      data={entries}
      keyExtractor={(entry) =>
        entry.kind === "asset"
          ? `asset:${entry.asset.mint}`
          : `security:${entry.security.id}`
      }
      renderItem={({ item }) =>
        item.kind === "asset" ? (
          <AssetRow asset={item.asset} onPress={() => onAsset(item.asset)} />
        ) : (
          <View
            style={{
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderColor: colors.line,
              gap: 8,
            }}
          >
            <View style={ui.between}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={ui.label}>{item.security.symbol}</Text>
                <Text style={ui.small} numberOfLines={1}>
                  {item.security.name}
                </Text>
              </View>
              <Text style={ui.small}>Discovery only</Text>
            </View>
            <Text style={ui.small}>
              No transferable, supported Solana token is available in Kite.
            </Text>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`View ${item.security.name} on Backpack`}
              onPress={() => {
                void Linking.openURL(item.security.sourceUrl).catch(() =>
                  setLinkError("Backpack could not open. Please try again."),
                );
              }}
              style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Text style={[ui.small, { color: colors.accent }]}>
                View issuer details
              </Text>
              <IconArrowUpRight color={colors.accent} size={13} />
            </Pressable>
          </View>
        )
      }
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => {
            void refresh();
          }}
          tintColor={colors.accent}
        />
      }
      ListHeaderComponent={
        <View style={{ gap: 20, paddingBottom: 16 }}>
          <View style={ui.stack}>
            <Text style={ui.title}>
              {watchlistOnly ? "Watchlist" : "Explore stocks"}
            </Text>
            <Text style={ui.body}>
              {watchlistOnly
                ? "Keep the companies you follow in one place."
                : "Public companies, funds and private-market exposure."}
            </Text>
          </View>
          <TextInput
            accessibilityLabel="Search assets"
            style={ui.input}
            placeholder="Search companies or symbols"
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          <FilterRow options={FILTERS} selected={filter} onSelect={setFilter} />
          {filter === "Backpack" ? (
            <Text style={ui.small}>
              Backpack securities use a separate issuer catalog. Only supported
              Solana mints can open an investment page; all other listings
              remain discovery only.
            </Text>
          ) : null}
          <MarketStatus />
          {linkError ? (
            <Text accessibilityRole="alert" style={[ui.small, ui.negative]}>
              {linkError}
            </Text>
          ) : null}
          <View style={ui.between}>
            <Text style={ui.small}>
              {entries.length} {entries.length === 1 ? "asset" : "assets"}
            </Text>
            {!watchlistOnly ? (
              <Pressable
                accessibilityRole="button"
                onPress={onBaskets}
                hitSlop={12}
                style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44 }}
              >
                <Text style={[ui.small, { color: colors.accent }]}>
                  Browse baskets
                </Text>
                <IconChevronRight color={colors.accent} size={14} />
              </Pressable>
            ) : null}
          </View>
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          title={
            loading
              ? "Loading the market"
              : watchlistOnly && !query
                ? "No saved stocks yet"
                : "No matching assets"
          }
          description={
            loading
              ? "Fetching issuer catalogs and available prices."
              : error
                ? "The market feed is unavailable. Pull down to retry."
                : watchlistOnly && !query
                  ? "Open a stock and tap Add to watchlist to save it here."
                  : "Try a different search or issuer. Unavailable listings are never replaced with sample data."
          }
        />
      }
    />
  );
}
