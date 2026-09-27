import React, { useState } from "react";
import { FlatList, Linking, Text, View } from "react-native";
import { Button, Chip, EmptyState, FilterRow } from "../components/Primitives";
import { useKite } from "../state/KiteProvider";
import { useMobileTrading } from "../state/MobileTradingProvider";
import { money, useTheme } from "../theme";

export function ActivityScreen() {
  const { colors, ui } = useTheme();
  const { account } = useKite();
  const wallet = useMobileTrading();
  const [filter, setFilter] = useState("All");
  const [error, setError] = useState("");
  const items = [
    ...account.orders.map((order) => ({
      id: order.id,
      title: `${order.side === "buy" ? "Bought" : "Sold"} ${order.symbol}`,
      mode: "Paper",
      at: new Date(order.createdAt).getTime(),
      status: "Filled",
      detail: `${money(order.totalUsd)} · ${order.quantity.toLocaleString(undefined, { maximumFractionDigits: 6 })} units`,
      signatures: [] as string[],
    })),
    ...wallet.activity
      .filter(
        (item) =>
          item.network === "devnet" ||
          !wallet.account ||
          item.walletAddress === wallet.account.address,
      )
      .map((item) => ({
        id: item.id,
        title: item.title,
        mode: item.network === "devnet" ? "Devnet" : "Mainnet",
        at: item.createdAt,
        status: item.status,
        detail: `${item.walletAddress.slice(0, 6)}…${item.walletAddress.slice(-6)}`,
        signatures: item.signatures,
      })),
  ]
    .filter((item) => filter === "All" || item.mode === filter)
    .sort((a, b) => b.at - a.at);
  return (
    <FlatList
      style={ui.screen}
      contentContainerStyle={ui.content}
      data={items}
      keyExtractor={(item) => `${item.mode}-${item.id}`}
      ListHeaderComponent={
        <View style={ui.stack}>
          <Text accessibilityRole="header" style={ui.title}>
            Activity
          </Text>
          <Text style={ui.body}>
            Orders and subscription approvals made on this device. Wallet
            receipts show network confirmation.
          </Text>
          <FilterRow
            options={["All", "Mainnet", "Devnet", "Paper"]}
            selected={filter}
            onSelect={setFilter}
          />
          {wallet.pending ? (
            <View style={[ui.card, { borderColor: colors.accent }]}>
              <Text style={ui.label}>A wallet order needs attention</Text>
              <Text style={ui.small}>
                Check the outcome before placing another order. A timeout does
                not mean it failed.
              </Text>
              {wallet.pending.bundle ? (
                <Button
                  label="Check bundle status"
                  loading={wallet.busy}
                  onPress={() => {
                    void wallet
                      .checkBundle()
                      .catch((failure: unknown) =>
                        setError(
                          failure instanceof Error
                            ? failure.message
                            : "Status unavailable.",
                        ),
                      );
                  }}
                />
              ) : null}
            </View>
          ) : null}
          {error ? (
            <Text accessibilityRole="alert" style={[ui.small, ui.negative]}>
              {error}
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          title="Nothing here yet"
          description="Your paper orders and wallet approvals will appear here once you begin investing."
        />
      }
      renderItem={({ item }) => (
        <View
          style={{
            paddingVertical: 20,
            borderBottomWidth: 1,
            borderColor: colors.line,
            gap: 10,
          }}
        >
          <View style={ui.between}>
            <Text style={[ui.label, { flex: 1 }]}>{item.title}</Text>
            <Chip label={item.mode} />
          </View>
          <View style={ui.between}>
            <Text style={ui.small}>{item.detail}</Text>
            <Text style={ui.label}>{item.status}</Text>
          </View>
          <Text style={ui.small}>{new Date(item.at).toLocaleString()}</Text>
          {item.signatures.map((signature, index) => (
            <Button
              key={signature}
              secondary
              label={`View transaction${item.signatures.length > 1 ? ` ${index + 1}` : ""}`}
              onPress={() => {
                void Linking.openURL(
                  `https://explorer.solana.com/tx/${encodeURIComponent(signature)}${item.mode === "Devnet" ? "?cluster=devnet" : ""}`,
                ).catch(() =>
                  setError("The transaction explorer could not open."),
                );
              }}
            />
          ))}
        </View>
      )}
    />
  );
}
