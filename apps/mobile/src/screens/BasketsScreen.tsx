import React, { useState } from "react";
import {
  Modal,
  SafeAreaView,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { executePaperBasket, type MarketBasket } from "@kite/sdk";
import {
  Button,
  Chip,
  EmptyState,
  OrbitArt,
  FilterRow,
} from "../components/Primitives";
import { AssetLogo, MarketStatus } from "../components/Market";
import { useKite } from "../state/KiteProvider";
import { NativeComposedPanel } from "../components/NativeComposedPanel";
import { colors, money, ui } from "../theme";

export function BasketsScreen({
  onPlan,
}: {
  onPlan: (basket: MarketBasket, mode?: "Paper" | "Actual") => void;
}) {
  const { market, account, updateAccount, ready, loading, refresh } = useKite();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState("Paper");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selected = market?.baskets.find((basket) => basket.id === selectedId);
  function buy() {
    if (!selected) return;
    try {
      updateAccount((current) =>
        executePaperBasket(current, selected, Number(amount)),
      );
      setAmount("");
      setError(null);
      setNotice(
        `${selected.name} was added to your paper portfolio using live prices. No real funds were used.`,
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "This basket could not be purchased.",
      );
    }
  }
  return (
    <>
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
            }}
            tintColor={colors.accent}
          />
        }
      >
        <View style={ui.stack}>
          <Text style={ui.eyebrow}>CURATED CONVICTION</Text>
          <Text style={ui.title}>
            Invest in an idea.{"\n"}Own its possibilities.
          </Text>
          <Text style={ui.body}>
            Thematic allocations across real mainnet assets. Start with paper
            funds and see how your ideas take shape.
          </Text>
        </View>
        <MarketStatus />
        {market?.baskets.length ? (
          market.baskets.map((basket) => (
            <Pressable
              key={basket.id}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedId === basket.id }}
              onPress={() => {
                setSelectedId(basket.id);
                setError(null);
                setNotice(null);
              }}
              style={[
                ui.card,
                selectedId === basket.id && { borderColor: colors.accent },
              ]}
            >
              <View style={ui.between}>
                <View style={{ flex: 1, gap: 10 }}>
                  <Text style={ui.eyebrow}>{basket.ticker}</Text>
                  <Text style={ui.heading}>{basket.name}</Text>
                </View>
                <OrbitArt small />
              </View>
              <Text style={ui.body}>{basket.description}</Text>
              <View style={ui.between}>
                <View style={{ flexDirection: "row", gap: 5 }}>
                  {basket.assets.slice(0, 4).map(({ asset }) => (
                    <AssetLogo key={asset.mint} asset={asset} />
                  ))}
                </View>
                <Text style={ui.small}>{basket.assets.length} assets</Text>
              </View>
              <View style={ui.divider} />
              <View style={ui.between}>
                <Text
                  style={[ui.small, basket.available ? ui.positive : undefined]}
                >
                  {basket.available
                    ? "Live prices available"
                    : "Awaiting complete market data"}
                </Text>
                <Text style={[ui.label, { color: colors.accent }]}>
                  {selectedId === basket.id ? "Selected" : "Explore"}
                </Text>
              </View>
            </Pressable>
          ))
        ) : (
          <EmptyState
            title={
              loading ? "Gathering the ideas." : "Baskets are unavailable."
            }
            description="Basket allocations resolve against the live issuer catalogs. Refresh the connection to try again."
          />
        )}
      </ScrollView>
      <Modal
        visible={Boolean(selected)}
        animationType="slide"
        onRequestClose={() => setSelectedId(null)}
      >
        <SafeAreaView style={ui.screen}>
          <ScrollView
            contentContainerStyle={ui.content}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            <Button
              secondary
              label="Back to baskets"
              onPress={() => setSelectedId(null)}
            />
            <FilterRow
              options={["Paper", "Actual"]}
              selected={mode}
              onSelect={setMode}
            />
            {selected && mode === "Actual" ? (
              <>
                <NativeComposedPanel basket={selected} />
                <Button
                  secondary
                  label="Set up recurring investment"
                  onPress={() => {
                    setSelectedId(null);
                    onPlan(selected, "Actual");
                  }}
                />
              </>
            ) : selected ? (
              <View style={ui.card}>
                <View style={ui.between}>
                  <Text style={ui.heading}>{selected.ticker}</Text>
                  <Chip label="Paper allocation" selected />
                </View>
                <Text style={ui.body}>
                  Every allocation appears as an individual paper holding. This
                  basket does not create a vault or index token.
                </Text>
                {selected.assets.map(({ asset, weight }) => (
                  <View style={ui.between} key={asset.mint}>
                    <View style={{ flex: 1 }}>
                      <Text style={ui.label}>{asset.symbol}</Text>
                      <Text style={ui.small}>{money(asset.priceUsd)}</Text>
                    </View>
                    <Text style={ui.label}>{(weight / 100).toFixed(2)}%</Text>
                  </View>
                ))}
                {selected.missingSymbols.length ? (
                  <Text style={[ui.small, ui.negative]}>
                    Missing assets: {selected.missingSymbols.join(", ")}
                  </Text>
                ) : null}
                <View style={ui.divider} />
                <Text style={ui.label}>Amount in virtual USD</Text>
                <TextInput
                  accessibilityLabel="Paper basket amount in dollars"
                  style={ui.input}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.muted}
                />
                <Text style={ui.small}>
                  {money(account.cashUsd)} paper buying power
                </Text>
                {notice ? (
                  <Text
                    accessibilityRole="alert"
                    style={[ui.small, ui.positive]}
                  >
                    {notice}
                  </Text>
                ) : null}
                {error ? (
                  <Text
                    accessibilityRole="alert"
                    style={[ui.small, ui.negative]}
                  >
                    {error}
                  </Text>
                ) : null}
                <Button
                  label="Buy basket with paper funds"
                  onPress={buy}
                  disabled={
                    !ready ||
                    !selected.available ||
                    !Number.isFinite(Number(amount)) ||
                    Number(amount) <= 0
                  }
                />
                <Button
                  secondary
                  label="Create recurring paper plan"
                  onPress={() => {
                    setSelectedId(null);
                    onPlan(selected);
                  }}
                  disabled={!ready || !selected.available}
                />
              </View>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
