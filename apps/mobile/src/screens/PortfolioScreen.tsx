import React, { useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { valuePaperAccount, type MarketAsset } from "@kite/sdk";
import { AssetLogo, MarketStatus } from "../components/Market";
import { Chip, EmptyState, FilterRow } from "../components/Primitives";
import { useKite } from "../state/KiteProvider";
import { money, percentage, useTheme } from "../theme";

export function PortfolioScreen({
  onAsset,
  onExplore,
}: {
  onAsset: (asset: MarketAsset) => void;
  onExplore: () => void;
}) {
  const { colors, ui } = useTheme();
  const { market, account, ready, loading, refresh } = useKite();
  const [tab, setTab] = useState("Holdings");
  const [showAllOrders, setShowAllOrders] = useState(false);
  const assetsByMint = new Map(
    (market?.assets ?? []).map((asset) => [asset.mint, asset]),
  );
  const valuation = valuePaperAccount(account, market?.assets ?? []);
  const orders = showAllOrders ? account.orders : account.orders.slice(0, 30);
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
        <Text style={ui.title}>Portfolio</Text>
      </View>
      <View style={ui.card}>
        <View style={ui.between}>
          <Text style={ui.small}>Total balance</Text>
          <Chip label="Paper" selected />
        </View>
        <Text style={ui.money}>
          {ready ? money(valuation.totalUsd) : "Loading…"}
        </Text>
        <Text
          style={[
            ui.body,
            valuation.profitLossUsd != null &&
              (valuation.profitLossUsd >= 0 ? ui.positive : ui.negative),
          ]}
        >
          {money(valuation.profitLossUsd)} ·{" "}
          {percentage(valuation.profitLossPct)} since starting
        </Text>
        <View style={ui.divider} />
        <View style={ui.between}>
          <Text style={ui.body}>Virtual cash</Text>
          <Text style={ui.label}>{money(account.cashUsd)}</Text>
        </View>
        <View style={ui.between}>
          <Text style={ui.body}>Holdings value</Text>
          <Text style={ui.label}>{money(valuation.holdingsUsd)}</Text>
        </View>
        {valuation.unpricedMints.length ? (
          <Text style={ui.small}>
            Some held assets have no available price. Total valuation is
            unavailable until prices return.
          </Text>
        ) : null}
      </View>
      <MarketStatus />
      <FilterRow
        options={["Holdings", "Activity"]}
        selected={tab}
        onSelect={setTab}
      />
      {tab === "Holdings" ? (
        account.positions.length ? (
          account.positions.map((position) => {
            const asset = assetsByMint.get(position.mint);
            const value =
              asset?.priceUsd == null
                ? null
                : position.quantity * asset.priceUsd;
            const gain = value == null ? null : value - position.costBasisUsd;
            return (
              <Pressable
                key={position.mint}
                accessibilityRole="button"
                disabled={!asset}
                onPress={() => {
                  if (asset) onAsset(asset);
                }}
                style={{
                  paddingVertical: 18,
                  gap: 12,
                  borderBottomWidth: 1,
                  borderColor: colors.line,
                }}
              >
                <View style={ui.between}>
                  <View style={ui.row}>
                    {asset ? <AssetLogo asset={asset} /> : null}
                    <View>
                      <Text style={ui.label}>{position.symbol}</Text>
                      <Text style={ui.small}>
                        {position.quantity.toLocaleString("en-US", {
                          maximumFractionDigits: 6,
                        })}{" "}
                        units
                      </Text>
                    </View>
                  </View>
                  <Text style={ui.label}>{money(value)}</Text>
                </View>
                <View style={ui.between}>
                  <Text style={ui.small}>
                    Cost basis {money(position.costBasisUsd)}
                  </Text>
                  <Text
                    style={[
                      ui.small,
                      gain != null && (gain >= 0 ? ui.positive : ui.negative),
                    ]}
                  >
                    {money(gain)} unrealized
                  </Text>
                </View>
              </Pressable>
            );
          })
        ) : (
          <EmptyState
            title="No holdings yet"
            description="Your first paper investment will appear here. Explore a company or choose a basket to get started."
            action="Explore investments"
            onAction={onExplore}
          />
        )
      ) : account.orders.length ? (
        <View style={ui.stack}>
          {orders.map((order) => (
            <View
              key={order.id}
              style={{
                paddingVertical: 16,
                gap: 8,
                borderBottomWidth: 1,
                borderColor: colors.line,
              }}
            >
              <View style={ui.between}>
                <View style={{ gap: 4 }}>
                  <Text style={ui.label}>
                    {order.side === "buy" ? "Bought" : "Sold"} {order.symbol}
                  </Text>
                  <Text style={ui.small}>
                    {new Date(order.createdAt).toLocaleString()}
                  </Text>
                </View>
                <Text style={ui.label}>{money(order.totalUsd)}</Text>
              </View>
              <Text style={ui.small}>
                {order.quantity.toLocaleString("en-US", {
                  maximumFractionDigits: 6,
                })}{" "}
                units at {money(order.priceUsd)} · Paper fill
              </Text>
            </View>
          ))}
          {account.orders.length > 30 && !showAllOrders ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowAllOrders(true)}
            >
              <Text style={[ui.label, { color: colors.accent }]}>
                Show all {account.orders.length} paper orders
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <EmptyState
          title="No activity yet"
          description="Completed paper buys and sells will appear here with their actual simulated fill time and observed price."
          action="Find your first investment"
          onAction={onExplore}
        />
      )}
    </ScrollView>
  );
}
