import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DevnetRecurringClient,
  fromTokenAmount,
  type DevnetRecurringConfig,
  type DevnetRecurringPublicPlan,
} from "@kite/sdk";
import { Button, Chip, EmptyState, FilterRow } from "./Primitives";
import { API_BASE_URL, API_CONFIGURATION_ERROR } from "../lib/config";
import {
  connectMobileWallet,
  disconnectMobileWallet,
  restoreMobileWallet,
  signMobileTransactions,
  supportsMobileWallet,
  type MobileWalletAccount,
} from "../lib/mobile-wallet";
import {
  parsePendingRecurring,
  type NativePendingRecurring,
  type NativeRecurringReview,
} from "../lib/recurring-review";
import { useTheme } from "../theme";
import type { PlanTarget } from "../screens/SipScreen";
import { useMobileTrading } from "../state/MobileTradingProvider";

const cadence = [
  { label: "Daily", seconds: 86_400 },
  { label: "Weekly", seconds: 604_800 },
  { label: "Every 2 weeks", seconds: 1_209_600 },
  { label: "Every 30 days", seconds: 2_592_000 },
];
const pendingKey = (owner: string) => `kite.mobile.pending-devnet.v1.${owner}`;
const client = new DevnetRecurringClient({
  baseUrl: API_BASE_URL,
  allowInsecureHttp: __DEV__,
  fetcher: (input, init) => {
    if (API_CONFIGURATION_ERROR)
      return Promise.reject(new Error(API_CONFIGURATION_ERROR));
    return fetch(input, init);
  },
});

export function NativeRecurringPanel({
  initialTarget,
}: {
  initialTarget: PlanTarget | null;
}) {
  const { colors, ui } = useTheme();
  const { recordActivity } = useMobileTrading();
  const [config, setConfig] = useState<DevnetRecurringConfig | null>(null);
  const [account, setAccount] = useState<MobileWalletAccount | null>(null);
  const [plans, setPlans] = useState<DevnetRecurringPublicPlan[]>([]);
  const [review, setReview] = useState<NativeRecurringReview | null>(null);
  const [pending, setPending] = useState<NativePendingRecurring | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState("");
  const [amount, setAmount] = useState("10");
  const [period, setPeriod] = useState("Weekly");
  const [installments, setInstallments] = useState("12");
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState("");
  const accountRef = useRef(account);
  accountRef.current = account;
  const busyRef = useRef(false);
  const selectionRef = useRef(0);
  const locked = busy || Boolean(pending) || storageError;

  useEffect(() => {
    restoreMobileWallet("devnet")
      .then(setAccount)
      .catch(() => {
        setStorageError(true);
        setError(
          "The devnet wallet session could not be restored. Reopen the app before creating another plan.",
        );
      });
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    client
      .config(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setConfig(value);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Devnet availability could not be checked.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    if (!account) return;
    const owner = account.address;
    let active = true;
    setReview(null);
    setPending(null);
    setStorageError(true);
    AsyncStorage.getItem(pendingKey(owner))
      .then((raw) => {
        if (!active) return;
        setPending(raw ? parsePendingRecurring(raw, owner) : null);
        setStorageError(false);
      })
      .catch(() => {
        if (active)
          setError(
            "A saved devnet submission cannot be read. New plans are blocked; check your devnet wallet history before changing device storage.",
          );
      });
    return () => {
      active = false;
    };
  }, [account?.address]);
  useEffect(() => {
    setPlans([]);
    if (!account) return;
    const controller = new AbortController();
    client
      .plans(account.address, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setPlans(value);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Plans could not be loaded.",
          );
      });
    return () => controller.abort();
  }, [account?.address, revision]);
  useEffect(() => {
    selectionRef.current++;
    setReview(null);
  }, [selected, amount, period, installments, account?.address]);

  const targets = [
    ...(config?.baskets ?? []).map((item) => ({
      ...item,
      key: `basket:${item.id}`,
      kind: "basket" as const,
      symbol: item.ticker,
    })),
    ...(config?.stocks ?? []).map((item) => ({
      ...item,
      key: `stock:${item.id}`,
      kind: "stock" as const,
    })),
  ];
  const target = targets.find((item) => item.key === selected);
  const signingReady = account?.supportedTransactionVersions?.some(
    (v) => v === 0 || v === 1,
  );

  async function action(work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The devnet request could not be completed.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function prepare() {
    if (!account || !target || locked) return;
    const owner = account.address;
    const selection = selectionRef.current;
    await action(async () => {
      const seconds = cadence.find((item) => item.label === period)!.seconds;
      if (
        !Number.isInteger(Number(installments)) ||
        Number(installments) < 1 ||
        Number(installments) * seconds > 31_536_000
      )
        throw new Error(
          "Choose an installment count that ends within one year.",
        );
      const next = await client.prepare({
        schemaVersion: 1,
        owner,
        target: { type: target.kind, id: target.id },
        amount,
        periodSeconds: seconds,
        periods: Number(installments),
        supportedTransactionVersions:
          account.supportedTransactionVersions ?? [],
      });
      if (
        accountRef.current?.address !== owner ||
        selectionRef.current !== selection
      )
        throw new Error("Your selection changed. Review the plan again.");
      setReview(next);
    });
  }
  async function revoke(plan: DevnetRecurringPublicPlan) {
    if (!account || locked) return;
    const owner = account.address;
    await action(async () => {
      const next = await client.revoke({
        schemaVersion: 1,
        plan: plan.address,
        owner,
        supportedTransactionVersions:
          account.supportedTransactionVersions ?? [],
      });
      if (accountRef.current?.address !== owner)
        throw new Error("The wallet changed. Review cancellation again.");
      setReview(next);
    });
  }
  async function submit() {
    const order = pending?.order ?? review;
    if (!order || order.signer !== account?.address || storageError) return;
    await action(async () => {
      let record = pending;
      if (!record) {
        const signed = await signMobileTransactions({
          signer: order.signer,
          network: "devnet",
          transactionVersion: order.transactionVersion,
          transactions: [order.transaction],
          expiresAt: order.expiresAt,
        });
        if (accountRef.current?.address !== order.signer)
          throw new Error("The wallet changed. Nothing was submitted.");
        record = { order, signedTransaction: signed[0]! };
        // Reuse the exact signed payload after a lost HTTP response; never create a second plan.
        await AsyncStorage.setItem(
          pendingKey(order.signer),
          JSON.stringify(record),
        );
        setPending(record);
      }
      try {
        const result = await client.execute({
          authorization: order.authorization,
          signedTransaction: record.signedTransaction,
        });
        await recordActivity({
          id: `${order.operation}:${order.plan}`,
          walletAddress: order.signer,
          network: "devnet",
          title:
            order.operation === "close"
              ? "Subscription cancellation"
              : "Subscription created",
          status: result.status,
          createdAt: Date.now(),
          signatures: result.signature ? [result.signature] : [],
        });
        if (["confirmed", "failed", "expired"].includes(result.status)) {
          await AsyncStorage.removeItem(pendingKey(order.signer));
          setPending(null);
          setReview(null);
          setRevision((value) => value + 1);
        }
        setNotice(
          result.status === "confirmed"
            ? order.operation === "close"
              ? "Plan cancelled. Delegation revoked and available rent reclaimed."
              : "Your devnet subscription is confirmed."
            : result.status === "failed"
              ? "The transaction failed on devnet. Review before retrying."
              : result.status === "expired"
                ? "The transaction expired without confirmation. Prepare a fresh review."
                : "Confirmation is pending. Check this saved submission before creating another plan.",
        );
      } catch {
        setNotice(
          "Confirmation is unavailable. Your signed submission is saved. Check its status to reuse the exact transaction.",
        );
      }
    });
  }
  const displayedReview = pending?.order ?? review;
  return (
    <>
      <View style={ui.card}>
        <View style={ui.between}>
          <Text style={ui.heading}>Your rhythm. Your plan.</Text>
          <Chip label="Devnet" selected />
        </View>
        <Text style={ui.body}>
          Set an amount and cadence for a stock or basket. Review and approve on
          your Android wallet.
        </Text>
        <Text style={ui.small}>
          Test KUSD and valueless test stocks only. Mainnet wallet funds are
          never used for these subscriptions.
        </Text>
        {!supportsMobileWallet ? (
          <Text style={ui.small}>
            Native signing needs an Android development or release build with a
            compatible wallet. You can explore and use paper plans on this
            platform.
          </Text>
        ) : (
          <>
            <Button
              label={
                account ? "Reconnect devnet wallet" : "Connect devnet wallet"
              }
              loading={busy}
              disabled={Boolean(pending)}
              onPress={() => {
                void action(async () => {
                  setAccount(await connectMobileWallet("devnet"));
                });
              }}
            />
            {account ? (
              <Text selectable style={ui.small}>
                {account.label ?? "Devnet wallet"} ·{" "}
                {account.address.slice(0, 6)}…{account.address.slice(-6)}
              </Text>
            ) : null}
          </>
        )}
        {loading ? (
          <Text style={ui.small}>Checking devnet availability…</Text>
        ) : null}
        {config && !config.readyToPrepare
          ? config.reasons.map((reason) => (
              <Text key={reason} style={ui.small}>
                {reason}
              </Text>
            ))
          : null}
        {initialTarget && !selected ? (
          <Text style={ui.small}>
            Choose the supported devnet equivalent of {initialTarget.name}{" "}
            below.
          </Text>
        ) : null}
        <Text style={ui.label}>Investment</Text>
        <Button
          secondary
          label={
            target
              ? `${target.name} · ${target.symbol}`
              : "Choose a stock or basket"
          }
          disabled={locked || !config?.readyToPrepare}
          onPress={() => setPicker(true)}
        />
        <Text style={ui.label}>
          Amount per installment · {config?.fundingSymbol ?? "KUSD"}
        </Text>
        <TextInput
          accessibilityLabel="Test token amount per installment"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          editable={!locked}
          maxLength={21}
          style={ui.input}
          placeholderTextColor={colors.muted}
        />
        <Text style={ui.label}>Repeat</Text>
        <View pointerEvents={locked ? "none" : "auto"}>
          <FilterRow
            options={cadence.map((item) => item.label)}
            selected={period}
            onSelect={setPeriod}
          />
        </View>
        <Text style={ui.label}>Number of installments</Text>
        <TextInput
          accessibilityLabel="Number of installments"
          value={installments}
          onChangeText={setInstallments}
          keyboardType="number-pad"
          editable={!locked}
          maxLength={3}
          style={ui.input}
        />
        <Text style={ui.small}>
          Every 30 days is a fixed interval. The total plan must finish within
          one year.
        </Text>
        <Button
          label="Review subscription"
          loading={busy}
          disabled={
            locked ||
            !signingReady ||
            !target?.available ||
            !config?.readyToPrepare
          }
          onPress={() => {
            void prepare();
          }}
        />
        {account && !signingReady ? (
          <Text style={ui.small}>
            Reconnect to check the wallet’s supported transaction versions.
          </Text>
        ) : null}
      </View>
      {displayedReview ? (
        <View style={[ui.card, { borderColor: colors.accent }]}>
          <Text style={ui.heading}>
            {displayedReview.operation === "close"
              ? "Review cancellation"
              : "Review your subscription"}
          </Text>
          {displayedReview.terms ? (
            <>
              <Text style={ui.label}>
                {displayedReview.terms.amount}{" "}
                {displayedReview.terms.fundingSymbol} ×{" "}
                {displayedReview.terms.periods} installments
              </Text>
              <Text style={ui.small}>
                Every {displayedReview.terms.periodSeconds / 86_400} days ·
                starts{" "}
                {new Date(
                  displayedReview.terms.startsAt * 1000,
                ).toLocaleString()}
              </Text>
              {displayedReview.terms.outputs.map((output) => (
                <Text key={output.mint} style={ui.small}>
                  {output.symbol} · {output.weightBps / 100}% · minimum{" "}
                  {fromTokenAmount(output.minimumAmountOut, output.decimals)}
                </Text>
              ))}
              <Text style={ui.small}>
                {displayedReview.terms.minimumPolicy}
              </Text>
            </>
          ) : (
            <Text style={ui.body}>
              Cancel this subscription’s delegation and reclaim available
              account rent to your wallet. Completed installments stay in your
              wallet.
            </Text>
          )}
          <Text selectable style={ui.small}>
            Plan {displayedReview.plan}
          </Text>
          <Button
            label={
              pending
                ? "Check saved submission"
                : displayedReview.operation === "close"
                  ? "Approve cancellation in wallet"
                  : "Approve subscription in wallet"
            }
            loading={busy}
            disabled={busy || storageError}
            onPress={() => {
              void submit();
            }}
          />
          {!pending ? (
            <Button
              secondary
              label="Back to editing"
              disabled={busy}
              onPress={() => setReview(null)}
            />
          ) : null}
        </View>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={[ui.body, ui.negative]}>
          {error}
        </Text>
      ) : null}
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={ui.body}>
          {notice}
        </Text>
      ) : null}
      <View style={ui.between}>
        <Text style={ui.heading}>Your subscriptions</Text>
        <Button
          secondary
          label="Refresh"
          disabled={busy}
          onPress={() => setRevision((v) => v + 1)}
        />
      </View>
      {plans.length ? (
        plans.map((plan) => (
          <View key={plan.address} style={ui.card}>
            <View style={ui.between}>
              <Text style={ui.label}>
                {plan.outputs.length === 1
                  ? "Stock subscription"
                  : `${plan.outputs.length}-asset basket`}
              </Text>
              <Chip
                label={
                  plan.executedPeriods >= plan.periods
                    ? "Complete"
                    : plan.expiresAt * 1000 <= Date.now()
                      ? "Expired"
                      : plan.duePeriodIndex !== null
                        ? "Due"
                        : "Active"
                }
              />
            </View>
            <Text style={ui.body}>
              {fromTokenAmount(plan.fundingAmount, 6)} KUSD · every{" "}
              {plan.periodSeconds / 86_400} days
            </Text>
            <Text style={ui.small}>
              {plan.executedPeriods} of {plan.periods} installments · ends{" "}
              {new Date(plan.expiresAt * 1000).toLocaleDateString()}
            </Text>
            <Text selectable style={ui.small}>
              {plan.address}
            </Text>
            <Button
              secondary
              label="Review cancellation"
              disabled={locked || !signingReady}
              onPress={() => {
                void revoke(plan);
              }}
            />
          </View>
        ))
      ) : (
        <EmptyState
          title={account ? "No subscriptions loaded" : "Your plans live here"}
          description={
            account
              ? "Create a devnet subscription above, or refresh to load existing plans."
              : "Connect your devnet wallet to see its subscriptions and manage them here."
          }
        />
      )}
      {account ? (
        <Button
          secondary
          label="Disconnect devnet wallet"
          disabled={locked}
          onPress={() => {
            void action(async () => {
              await disconnectMobileWallet("devnet");
              setAccount(null);
              setPlans([]);
              setReview(null);
            });
          }}
        />
      ) : null}
      <Modal
        visible={picker}
        animationType="slide"
        onRequestClose={() => setPicker(false)}
      >
        <SafeAreaView style={ui.screen}>
          <View style={{ padding: 20, gap: 14 }}>
            <Button
              secondary
              label="Back to subscription"
              onPress={() => setPicker(false)}
            />
            <Text style={ui.heading}>Choose your investment</Text>
            <TextInput
              accessibilityLabel="Search devnet investments"
              value={query}
              onChangeText={setQuery}
              style={ui.input}
              placeholder="Search stocks and baskets…"
              placeholderTextColor={colors.muted}
            />
          </View>
          <FlatList
            data={targets.filter((item) =>
              `${item.name} ${item.symbol}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )}
            keyExtractor={(item) => item.key}
            contentContainerStyle={{ paddingHorizontal: 20 }}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  disabled: !item.available,
                  selected: selected === item.key,
                }}
                disabled={!item.available}
                onPress={() => {
                  setSelected(item.key);
                  setPicker(false);
                  setQuery("");
                }}
                style={{
                  paddingVertical: 18,
                  borderBottomWidth: 1,
                  borderColor: colors.line,
                  gap: 5,
                  opacity: item.available ? 1 : 0.5,
                }}
              >
                <Text style={ui.label}>{item.name}</Text>
                <Text style={ui.small}>
                  {item.symbol} · {item.kind === "basket" ? "Basket" : "Stock"}
                  {item.available ? "" : " · Unavailable"}
                </Text>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}
