import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  SafeAreaView,
  FlatList,
} from "react-native";
import {
  createPaperPlan,
  togglePaperPlan,
  type PaperFrequency,
} from "@kite/sdk";
import { Button, Chip, EmptyState, FilterRow } from "../components/Primitives";
import { useKite } from "../state/KiteProvider";
import { NativeRecurringPanel } from "../components/NativeRecurringPanel";
import { money, useTheme } from "../theme";

export type PlanTarget = {
  targetId: string;
  targetType: "asset" | "basket";
  name: string;
  mode?: "Paper" | "Actual";
};
const FREQUENCIES: { label: string; value: PaperFrequency }[] = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Every 2 weeks", value: "biweekly" },
  { label: "Monthly", value: "monthly" },
];

export function SipScreen({
  initialTarget,
}: {
  initialTarget: PlanTarget | null;
}) {
  const { colors, ui } = useTheme();
  const { account, market, ready, updateAccount } = useKite();
  const [mode, setMode] = useState(
    initialTarget?.mode === "Paper" ? "Paper" : "Devnet",
  );
  const [target, setTarget] = useState<PlanTarget | null>(initialTarget);
  const [frequency, setFrequency] = useState<PaperFrequency>("weekly");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(Boolean(initialTarget));
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState("");
  const targets: (PlanTarget & { available: boolean; subtitle: string })[] = [
    ...(market?.baskets ?? []).map((basket) => ({
      targetId: basket.id,
      targetType: "basket" as const,
      name: basket.name,
      available: basket.available,
      subtitle: `${basket.ticker} · Thematic basket`,
    })),
    ...(market?.assets ?? []).map((asset) => ({
      targetId: asset.mint,
      targetType: "asset" as const,
      name: asset.name,
      available: asset.priceUsd !== null && !asset.tradingHalted,
      subtitle: `${asset.symbol} · ${asset.issuer === "prestocks" ? "PreStocks" : asset.issuer === "backpack" ? "Backpack" : "xStocks"}`,
    })),
  ];
  const availableTarget = target
    ? targets.find(
        (item) =>
          item.targetId === target.targetId &&
          item.targetType === target.targetType,
      )
    : null;

  function createPlan() {
    if (!target) return;
    try {
      updateAccount((current) =>
        createPaperPlan(current, {
          ...target,
          amountUsd: Number(amount),
          frequency,
        }),
      );
      setError(null);
      setAmount("");
      setShowForm(false);
      setNotice(
        "Paper plan created. Due installments run while Kite is open with live prices. No actual transfer was authorized.",
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Your plan could not be created.",
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
      >
        <View style={ui.stack}>
          <Text style={ui.title}>Recurring</Text>
          <Text style={ui.body}>
            {mode === "Paper"
              ? "Put a recurring paper investment behind the ideas you believe in."
              : "Test a recurring stock or basket investment on Solana devnet."}
          </Text>
        </View>
        <FilterRow
          options={["Devnet", "Paper"]}
          selected={mode}
          onSelect={(value) => setMode(value === "Devnet" ? "Devnet" : "Paper")}
        />
        {mode === "Devnet" ? (
          <NativeRecurringPanel initialTarget={initialTarget} />
        ) : (
          <>
            <View style={ui.card}>
              <Chip label="Paper plans" selected />
              <Text style={ui.heading}>Practice a recurring investment</Text>
              <Text style={ui.body}>
                Plans use virtual funds and live mainnet prices. Due
                installments run when the app is open. Missed cycles are never
                filled with invented historical prices.
              </Text>
              <Button
                label={showForm ? "Close plan builder" : "Create a paper plan"}
                onPress={() => setShowForm((current) => !current)}
              />
            </View>
            {notice ? (
              <Text accessibilityRole="alert" style={[ui.body, ui.positive]}>
                {notice}
              </Text>
            ) : null}
            {!showForm && error ? (
              <Text accessibilityRole="alert" style={[ui.body, ui.negative]}>
                {error}
              </Text>
            ) : null}
            {showForm ? (
              <View style={ui.card}>
                <Text style={ui.heading}>Plan details</Text>
                <Text style={ui.label}>Your investment</Text>
                <Button
                  secondary
                  label={target?.name ?? "Choose an asset or basket"}
                  onPress={() => setPicker(true)}
                />
                <Text style={ui.label}>Schedule</Text>
                <FilterRow
                  options={FREQUENCIES.map((item) => item.label)}
                  selected={
                    FREQUENCIES.find((item) => item.value === frequency)
                      ?.label ?? "Weekly"
                  }
                  onSelect={(label) =>
                    setFrequency(
                      FREQUENCIES.find((item) => item.label === label)?.value ??
                        "weekly",
                    )
                  }
                />
                <Text style={ui.label}>Virtual USD per installment</Text>
                <TextInput
                  accessibilityLabel="Recurring paper investment amount"
                  style={ui.input}
                  keyboardType="decimal-pad"
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor={colors.muted}
                />
                <Text style={ui.small}>
                  Current virtual buying power: {money(account.cashUsd)}. The
                  first installment is due after one selected interval.
                </Text>
                {error ? (
                  <Text
                    accessibilityRole="alert"
                    style={[ui.small, ui.negative]}
                  >
                    {error}
                  </Text>
                ) : null}
                {target && !availableTarget?.available ? (
                  <Text style={[ui.small, ui.negative]}>
                    This investment needs available market prices before a plan
                    can be created.
                  </Text>
                ) : null}
                <Button
                  label="Create paper plan"
                  onPress={createPlan}
                  disabled={
                    !ready ||
                    !availableTarget?.available ||
                    !Number.isFinite(Number(amount)) ||
                    Number(amount) <= 0
                  }
                />
              </View>
            ) : null}
            <Text style={ui.heading}>Your plans</Text>
            {account.plans.length ? (
              account.plans.map((plan) => (
                <View key={plan.id} style={ui.card}>
                  <View style={ui.between}>
                    <View style={{ flex: 1, gap: 5 }}>
                      <Text style={ui.label}>{plan.name}</Text>
                      <Text style={ui.small}>
                        {
                          FREQUENCIES.find(
                            (item) => item.value === plan.frequency,
                          )?.label
                        }{" "}
                        · {money(plan.amountUsd)} virtual USD
                      </Text>
                    </View>
                    <Chip
                      label={plan.active ? "Active" : "Paused"}
                      selected={plan.active}
                    />
                  </View>
                  <Text style={ui.small}>
                    {plan.active ? "Next due" : "Scheduled date"}:{" "}
                    {new Date(plan.nextExecutionAt).toLocaleString()}
                  </Text>
                  {plan.lastError ? (
                    <Text style={[ui.small, ui.negative]}>
                      {plan.lastError} The plan will retry with fresh prices
                      while the app is open.
                    </Text>
                  ) : null}
                  <Button
                    secondary
                    label={plan.active ? "Pause plan" : "Resume plan"}
                    onPress={() => {
                      try {
                        updateAccount((current) =>
                          togglePaperPlan(current, plan.id),
                        );
                      } catch (failure) {
                        setError(
                          failure instanceof Error
                            ? failure.message
                            : "Try again.",
                        );
                      }
                    }}
                  />
                </View>
              ))
            ) : (
              <EmptyState
                title="No paper plans yet"
                description="Choose an asset or a basket, an amount and a cadence. Your recurring paper investments will live here."
              />
            )}
          </>
        )}
      </ScrollView>
      <Modal
        visible={picker}
        animationType="slide"
        onRequestClose={() => setPicker(false)}
      >
        <SafeAreaView style={ui.screen}>
          <View style={{ padding: 22, gap: 18 }}>
            <Button
              secondary
              label="Back to your plan"
              onPress={() => setPicker(false)}
            />
            <Text style={ui.heading}>Choose an investment.</Text>
            <TextInput
              accessibilityLabel="Search plan investments"
              style={ui.input}
              value={query}
              onChangeText={setQuery}
              placeholder="Search assets and baskets"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
            />
          </View>
          <FlatList
            contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 30 }}
            data={targets.filter((item) =>
              `${item.name} ${item.subtitle}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )}
            keyExtractor={(item) => `${item.targetType}-${item.targetId}`}
            renderItem={({ item }) => (
              <Pressable
                disabled={!item.available}
                accessibilityRole="button"
                accessibilityState={{ disabled: !item.available }}
                onPress={() => {
                  setTarget({
                    targetId: item.targetId,
                    targetType: item.targetType,
                    name: item.name,
                  });
                  setPicker(false);
                  setQuery("");
                }}
                style={{
                  paddingVertical: 18,
                  borderBottomWidth: 1,
                  borderColor: colors.line,
                  opacity: item.available ? 1 : 0.5,
                  gap: 5,
                }}
              >
                <Text style={ui.label}>{item.name}</Text>
                <Text style={ui.small}>
                  {item.subtitle}
                  {item.available ? "" : " · Price unavailable"}
                </Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <EmptyState
                title="No investments found."
                description="Try another search or wait for the live market connection."
              />
            }
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}
