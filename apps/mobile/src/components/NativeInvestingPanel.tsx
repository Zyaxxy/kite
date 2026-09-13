import React, { useEffect, useRef, useState } from "react";
import {
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  FlatList,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  MAINNET_SOL_MINT,
  fromTokenAmount,
  maxSwapAmount,
  nextScheduleOccurrence,
  parseUtcScheduleInput,
  recurringScheduleLabel,
  scheduleAt,
  utcScheduleInput,
  type RecurringInvestmentReceipt,
  type MainnetHolding,
  type RecurringInvestmentConfig,
  type RecurringInvestmentPlan,
  type RecurringInvestmentSchedule,
  type WalletTransactionOrder,
} from "@kite/sdk";
import { Button, FilterRow } from "./Primitives";
import { useKite } from "../state/KiteProvider";
import { useMobileTrading } from "../state/MobileTradingProvider";
import { kiteClient, WEB_URL } from "../lib/config";
import { colors, ui } from "../theme";
import type { PlanTarget } from "../screens/SipScreen";

const date = (seconds: number) =>
  new Date(seconds * 1000).toISOString().slice(0, 16).replace("T", " ") +
  " UTC";
const amountOf = (plan: RecurringInvestmentPlan, count = 1) =>
  fromTokenAmount(
    (BigInt(plan.amountUnits) * BigInt(count)).toString(),
    plan.fundingDecimals,
  );
const frequencies = [
  { label: "Daily", unit: "day" },
  { label: "Weekly", unit: "week" },
  { label: "Monthly", unit: "month" },
] as const;

export function NativeInvestingPanel({
  initialTarget,
}: {
  initialTarget: PlanTarget | null;
}) {
  const { market } = useKite();
  const wallet = useMobileTrading();
  const [target, setTarget] = useState(
    initialTarget
      ? `${initialTarget.targetType === "asset" ? "stock" : "basket"}:${initialTarget.targetId}`
      : "",
  );
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState("");
  const [holdings, setHoldings] = useState<MainnetHolding[]>([]);
  const [mint, setMint] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<RecurringInvestmentSchedule["unit"]>("day");
  const [interval, setIntervalValue] = useState("1");
  const [startsAt, setStartsAt] = useState(() =>
    utcScheduleInput(Math.floor(Date.now() / 1000) + 86400),
  );
  const [occurrences, setOccurrences] = useState("12");
  const [consent, setConsent] = useState(false);
  const [config, setConfig] = useState<RecurringInvestmentConfig | null>(null);
  const [plans, setPlans] = useState<RecurringInvestmentPlan[]>([]);
  const [receipts, setReceipts] = useState<RecurringInvestmentReceipt[]>([]);
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");
  const [configError, setConfigError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [review, setReview] = useState<{
    order: WalletTransactionOrder;
    plan: RecurringInvestmentPlan;
    revoke?: boolean;
  } | null>(null);
  const generation = useRef(0);
  const walletRef = useRef(wallet.account?.address);
  walletRef.current = wallet.account?.address;
  const disabled = busy || wallet.busy || Boolean(wallet.pending);
  const targets = [
    ...(market?.baskets ?? []).map((basket) => ({
      value: `basket:${basket.id}`,
      name: basket.name,
      description: "Thematic basket",
    })),
    ...(market?.assets ?? [])
      .filter((asset) => !asset.tradingHalted)
      .map((asset) => ({
        value: `stock:${asset.mint}`,
        name: asset.name,
        description: asset.symbol,
      })),
  ];
  const selected = targets.find((item) => item.value === target);
  const token = holdings.find((holding) => holding.mint === mint);
  const nameOf = (plan: RecurringInvestmentPlan) =>
    targets.find(
      (item) => item.value === `${plan.target.type}:${plan.target.id}`,
    )?.name ??
    plan.allocations[0]?.symbol ??
    "Investment";
  const openLink = (url: string) => {
    void Linking.openURL(url).catch(() =>
      setMessage("Unable to open the link. Please try again."),
    );
  };

  useEffect(() => {
    generation.current++;
    setReview(null);
    setConsent(false);
  }, [
    target,
    mint,
    amount,
    unit,
    interval,
    startsAt,
    occurrences,
    wallet.account?.address,
  ]);
  useEffect(() => {
    if (!review) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [review]);
  useEffect(() => {
    const controller = new AbortController();
    setConfigError("");
    kiteClient
      .getInvestmentConfig(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setConfig(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setConfig(null);
          setConfigError(
            error instanceof Error
              ? error.message
              : "Could not check recurring investing availability.",
          );
        }
      });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    setHoldings([]);
    setPlans([]);
    setReceipts([]);
    setMint("");
    setLoadError("");
    if (!wallet.account) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    Promise.all([
      kiteClient.getPortfolio(wallet.account.address, controller.signal),
      kiteClient.getInvestmentPlans(wallet.account.address, controller.signal),
    ])
      .then(([portfolio, result]) => {
        if (controller.signal.aborted) return;
        const funded = portfolio.holdings.filter(
          (holding) =>
            holding.mint !== MAINNET_SOL_MINT && maxSwapAmount(holding) !== "0",
        );
        setHoldings(funded);
        setMint(funded[0]?.mint ?? "");
        setPlans(result.plans);
        setReceipts(result.receipts);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setLoadError(
            error instanceof Error
              ? error.message
              : "Could not read your wallet and investments.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [wallet.account?.address, revision]);

  async function prepare(revoke?: RecurringInvestmentPlan) {
    if (!wallet.account || disabled || !wallet.canSignV1) return;
    const current = generation.current;
    setBusy(true);
    setReview(null);
    setMessage("");
    try {
      if (revoke) {
        const order = await kiteClient.revokeRecurringPayment(
          wallet.account.address,
          revoke.delegation,
          wallet.supportedTransactionVersions,
        );
        if (generation.current === current)
          setReview({ order, plan: revoke, revoke: true });
      } else {
        const [type, id] = target.split(":");
        if ((type !== "basket" && type !== "stock") || !id)
          throw new Error("Choose a basket or stock for this investment.");
        if (!token)
          throw new Error("Choose a funded SPL token from your wallet.");
        const result = await kiteClient.requestInvestmentPlan({
          action: "create",
          taker: wallet.account.address,
          target: { type, id },
          fundingMint: mint,
          amount,
          schedule: {
            unit,
            interval: Number(interval),
            startsAt: parseUtcScheduleInput(startsAt),
            occurrences: Number(occurrences),
          },
          slippageBps: 100,
          consent: true,
          supportedTransactionVersions: wallet.supportedTransactionVersions,
        });
        if (!config?.executor || result.plan.buyer !== config.executor)
          throw new Error(
            "The executor changed while preparing your plan. Check availability and review again.",
          );
        if (generation.current === current) setReview(result);
      }
    } catch (error) {
      if (generation.current === current)
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not prepare this investment. Your inputs are saved on this screen.",
        );
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (
      !review ||
      disabled ||
      (!review.revoke && (!consent || review.plan.buyer !== config?.executor))
    )
      return;
    const address = wallet.account?.address;
    setBusy(true);
    setMessage("");
    try {
      const result = await wallet.execute(review.order);
      if (walletRef.current !== address) return;
      if (result.signature) setSignature(result.signature);
      if (result.status === "Unknown")
        setMessage(
          "Confirmation is unknown. Check wallet activity before trying again.",
        );
      else if (result.status === "Failed")
        setMessage(
          result.error ?? "Transaction failed. Network fees may still apply.",
        );
      else {
        setMessage(
          review.revoke
            ? "Permission revoked. Future purchases are no longer authorized."
            : "Permission confirmed. Your plan activates after its onchain terms are verified. Refresh to check its status.",
        );
        setReview(null);
        setConsent(false);
        setRevision((value) => value + 1);
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not confirm this investment. Check your wallet before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <View style={ui.card}>
        <Text style={ui.eyebrow}>YOUR INVESTMENT, YOUR RHYTHM</Text>
        <Text style={ui.heading}>Make room for consistency.</Text>
        <Text style={ui.body}>
          Choose a basket or one stock. Decide how often to invest, when to
          start and when to stop.
        </Text>
        {!config && !configError ? (
          <Text style={ui.small}>Checking availability…</Text>
        ) : null}
        {configError || (config && !config.available) ? (
          <>
            <Text accessibilityRole="alert" style={ui.small}>
              {configError ||
                config?.reason ||
                "Recurring investing is not enabled for this deployment."}
            </Text>
            <Button
              secondary
              label="Check availability again"
              onPress={() => setRevision((value) => value + 1)}
            />
          </>
        ) : null}
        <Text style={ui.label}>Invest in</Text>
        <Button
          secondary
          label={selected?.name ?? "Choose a basket or stock"}
          disabled={disabled}
          onPress={() => setPicker(true)}
        />
        <Text style={ui.label}>Your rhythm</Text>
        <FilterRow
          options={frequencies.map((item) => item.label)}
          selected={
            frequencies.find((item) => item.unit === unit)?.label ?? "Daily"
          }
          onSelect={(label) => {
            if (!disabled)
              setUnit(
                frequencies.find((item) => item.label === label)?.unit ?? "day",
              );
          }}
        />
        <Text style={ui.label}>
          Repeat every (1–12{" "}
          {unit === "day" ? "days" : unit === "week" ? "weeks" : "months"})
        </Text>
        <TextInput
          accessibilityLabel="Repeat interval"
          keyboardType="number-pad"
          style={ui.input}
          value={interval}
          editable={!disabled}
          onChangeText={setIntervalValue}
        />
        <Text style={ui.label}>Start date (YYYY-MM-DD)</Text>
        <TextInput
          accessibilityLabel="First investment date, year month day"
          style={ui.input}
          value={startsAt.split("T")[0]}
          onChangeText={(value) =>
            setStartsAt(`${value}T${startsAt.split("T")[1] ?? "00:00"}`)
          }
          editable={!disabled}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.muted}
        />
        <Text style={ui.label}>Time (HH:mm UTC)</Text>
        <TextInput
          accessibilityLabel="First investment time in UTC, hour minute"
          style={ui.input}
          value={startsAt.split("T")[1] ?? ""}
          onChangeText={(value) =>
            setStartsAt(`${startsAt.split("T")[0]}T${value}`)
          }
          editable={!disabled}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="09:00"
          placeholderTextColor={colors.muted}
        />
        <Text style={ui.small}>
          Times use UTC. Monthly plans keep the same day, or the last day of a
          shorter month. Missed purchases are skipped after six hours.
        </Text>
        <Text style={ui.label}>Number of investments</Text>
        <TextInput
          accessibilityLabel="Number of investments"
          style={ui.input}
          keyboardType="number-pad"
          value={occurrences}
          onChangeText={setOccurrences}
          editable={!disabled}
        />
        {!wallet.supported ? (
          <>
            <Text style={ui.small}>
              This device uses Kite web for wallet signing. Your selected
              investment will carry over.
            </Text>
            <Button
              label="Continue in Kite web"
              onPress={() =>
                openLink(
                  `${WEB_URL}/sip?mode=actual${selected ? `&${target.startsWith("basket:") ? "basket" : "stock"}=${encodeURIComponent(target.split(":")[1])}` : ""}`,
                )
              }
            />
          </>
        ) : !wallet.account ? (
          <Button
            label="Connect wallet to continue"
            loading={wallet.busy}
            disabled={!wallet.ready}
            onPress={() => {
              void wallet.connect();
            }}
          />
        ) : (
          <>
            <Text style={ui.label}>Pay with tokens in your wallet</Text>
            {loading ? (
              <Text style={ui.small}>Reading funded tokens…</Text>
            ) : holdings.length ? (
              holdings.map((holding) => (
                <Button
                  key={holding.mint}
                  secondary={mint !== holding.mint}
                  label={`${holding.symbol} · ${holding.amount} available`}
                  disabled={disabled}
                  onPress={() => setMint(holding.mint)}
                />
              ))
            ) : (
              <Text style={ui.small}>
                A funded SPL token is needed. Native SOL cannot be delegated for
                recurring purchases.
              </Text>
            )}
            <Text style={ui.label}>
              Amount per investment{token ? ` (${token.symbol})` : ""}
            </Text>
            <TextInput
              accessibilityLabel="Funding token amount per investment"
              style={ui.input}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.muted}
              value={amount}
              editable={!disabled}
              onChangeText={setAmount}
            />
            <Text style={ui.small}>
              Up to 365 investments within one year. Maximum slippage is 1% on
              each swap. Keep enough funding tokens available for future runs.
            </Text>
            {!wallet.canSignV1 ? (
              <Text accessibilityRole="alert" style={ui.small}>
                Your wallet does not advertise V1 signing. Connect a wallet with
                V1 support to approve a plan.
              </Text>
            ) : null}
            <Button
              label="Review investment plan"
              loading={busy && !review}
              disabled={
                disabled ||
                !config?.available ||
                !wallet.canSignV1 ||
                !selected ||
                !token
              }
              onPress={() => {
                void prepare();
              }}
            />
          </>
        )}
        {review ? (
          <View style={ui.stack}>
            <Text style={ui.heading}>
              {review.revoke
                ? "End future purchases"
                : "Review your permission"}
            </Text>
            <Text style={ui.body}>
              {nameOf(review.plan)} · {amountOf(review.plan)}{" "}
              {review.plan.fundingSymbol} ·{" "}
              {recurringScheduleLabel(review.plan.schedule)}
            </Text>
            {review.revoke ? (
              <Text style={ui.small}>
                This stops future authorization. Completed purchases cannot be
                reversed.
              </Text>
            ) : (
              <>
                <Text style={ui.small}>
                  {review.plan.schedule.occurrences} purchases from{" "}
                  {date(review.plan.schedule.startsAt)} to{" "}
                  {date(
                    scheduleAt(
                      review.plan.schedule,
                      review.plan.schedule.occurrences - 1,
                    ),
                  )}
                  .
                </Text>
                <Text style={ui.label}>
                  Scheduled funding:{" "}
                  {amountOf(review.plan, review.plan.schedule.occurrences)}{" "}
                  {review.plan.fundingSymbol}
                </Text>
                <Text style={ui.label}>
                  Maximum authorized:{" "}
                  {amountOf(
                    review.plan,
                    review.plan.permission.maximumCollections,
                  )}{" "}
                  {review.plan.fundingSymbol}
                </Text>
                <Text style={ui.small}>
                  Up to {review.plan.permission.maximumCollections} withdrawals
                  until {date(review.plan.permission.expiresAt)}. The withdrawal
                  cap uses fixed periods; your investment schedule follows
                  calendar dates.
                </Text>
                <Text style={ui.small}>
                  The executor combines collection, swaps and delivery, but the
                  subscription program does not enforce stock delivery against a
                  malicious executor. Setup network fees and rent apply. Your
                  wallet address, plan terms and execution receipts are publicly
                  readable.
                </Text>
                <Button
                  secondary
                  label="Inspect executor wallet"
                  onPress={() =>
                    openLink(`https://solscan.io/account/${review.plan.buyer}`)
                  }
                />
                <View style={ui.between}>
                  <Text style={[ui.small, { flex: 1 }]}>
                    I trust this executor with the stated withdrawal limit and
                    understand that the program does not guarantee stock
                    delivery.
                  </Text>
                  <Switch
                    accessibilityLabel="Accept executor trust and maximum withdrawal limit"
                    value={consent}
                    onValueChange={setConsent}
                    disabled={disabled}
                    trackColor={{ true: colors.accent }}
                  />
                </View>
              </>
            )}
            <Button
              label={
                review.order.expiresAt <= now
                  ? "Review expired — prepare again"
                  : review.revoke
                    ? "Approve revocation"
                    : "Approve recurring investment"
              }
              disabled={
                disabled ||
                !wallet.canSignV1 ||
                review.order.expiresAt <= now ||
                (!review.revoke && !consent)
              }
              loading={wallet.busy}
              onPress={() => {
                void confirm();
              }}
            />
            <Button
              secondary
              label="Cancel review"
              disabled={disabled}
              onPress={() => setReview(null)}
            />
          </View>
        ) : null}
        {message || wallet.error ? (
          <Text accessibilityRole="alert" style={ui.small}>
            {message || wallet.error}
          </Text>
        ) : null}
        {signature ? (
          <Button
            secondary
            label="View transaction"
            onPress={() => openLink(`https://solscan.io/tx/${signature}`)}
          />
        ) : null}
        {wallet.pending && !wallet.busy ? (
          <>
            <Text style={ui.small}>
              A previous submission has an unresolved outcome. Check wallet
              activity before permitting another attempt.
            </Text>
            {wallet.account ? (
              <Button
                secondary
                label="Check wallet activity"
                onPress={() =>
                  openLink(
                    `https://solscan.io/account/${wallet.account?.address}`,
                  )
                }
              />
            ) : null}
            <Button
              secondary
              label="I checked the outcome — allow a new transaction"
              onPress={() => {
                void wallet
                  .acknowledgePending()
                  .catch(() =>
                    setMessage(
                      "Could not clear the pending record. Reopen Kite and try again.",
                    ),
                  );
              }}
            />
          </>
        ) : null}
      </View>
      <View style={ui.between}>
        <Text style={ui.heading}>Your investments</Text>
        <Button
          secondary
          label="Refresh"
          disabled={loading}
          onPress={() => setRevision((value) => value + 1)}
        />
      </View>
      {loadError ? (
        <Text accessibilityRole="alert" style={ui.small}>
          {loadError}
        </Text>
      ) : loading ? (
        <Text style={ui.small}>
          Reading plans and confirming their permissions…
        </Text>
      ) : !plans.length ? (
        <View style={ui.card}>
          <Text style={ui.heading}>
            {wallet.account
              ? "Your first plan starts here."
              : "Connect to see your plans."}
          </Text>
          <Text style={ui.small}>
            Upcoming investments and receipts appear after a plan is approved.
            Drafts are not active investments.
          </Text>
        </View>
      ) : (
        plans.map((plan) => (
          <View key={plan.id} style={ui.card}>
            <Text style={ui.heading}>{nameOf(plan)}</Text>
            <Text style={ui.label}>{plan.status.toUpperCase()}</Text>
            <Text style={ui.body}>
              {amountOf(plan)} {plan.fundingSymbol} ·{" "}
              {recurringScheduleLabel(plan.schedule)}
            </Text>
            <Text style={ui.small}>
              {plan.schedule.occurrences} investments starting{" "}
              {date(plan.schedule.startsAt)}.
            </Text>
            {plan.status === "active" ? (
              <Text style={ui.small}>
                {(() => {
                  const next = nextScheduleOccurrence(
                    plan.schedule,
                    Math.floor(Date.now() / 1000),
                    { inclusive: true },
                  );
                  return next
                    ? `Next scheduled: ${date(next.scheduledAt)}`
                    : "No future installments. Check receipts for the last run.";
                })()}
              </Text>
            ) : null}
            <Text style={ui.small}>
              Maximum authorized:{" "}
              {amountOf(plan, plan.permission.maximumCollections)}{" "}
              {plan.fundingSymbol}. Expires {date(plan.permission.expiresAt)}.
            </Text>
            <Button
              secondary
              label="View permission"
              onPress={() =>
                openLink(`https://solscan.io/account/${plan.delegation}`)
              }
            />
            {plan.status !== "draft" && plan.status !== "revoked" ? (
              <Button
                secondary
                label="Revoke plan"
                disabled={disabled || !wallet.canSignV1}
                onPress={() => {
                  void prepare(plan);
                }}
              />
            ) : null}
          </View>
        ))
      )}
      <Text style={ui.heading}>Purchase receipts</Text>
      {!receipts.length ? (
        <Text style={ui.small}>
          No recorded purchases yet. Receipts appear after the executor attempts
          an investment.
        </Text>
      ) : (
        receipts.map((receipt) => {
          const plan = plans.find((item) => item.id === receipt.planId);
          return (
            <View key={receipt.runId} style={ui.card}>
              <Text style={ui.heading}>
                {plan ? nameOf(plan) : "Investment execution"}
              </Text>
              <Text style={ui.label}>
                {receipt.status === "success" ? "Confirmed" : receipt.status}
              </Text>
              <Text style={ui.small}>
                Scheduled {date(receipt.scheduledAt)}
              </Text>
              {plan ? (
                <Text style={ui.small}>
                  {fromTokenAmount(receipt.amountUnits, plan.fundingDecimals)}{" "}
                  {plan.fundingSymbol} funding
                </Text>
              ) : null}
              {receipt.error ? (
                <Text style={ui.small}>{receipt.error}</Text>
              ) : null}
              {receipt.status === "pending" ? (
                <Text style={ui.small}>
                  Confirmation is still being checked. Do not repeat this
                  investment.
                </Text>
              ) : null}
              {receipt.status === "success"
                ? receipt.outputs?.map((output) => (
                    <Text key={output.mint} style={ui.small}>
                      Received{" "}
                      {fromTokenAmount(output.amountUnits, output.decimals)}{" "}
                      {output.symbol}
                    </Text>
                  ))
                : null}
              {receipt.signature ? (
                <Button
                  secondary
                  label="View purchase transaction"
                  onPress={() =>
                    openLink(`https://solscan.io/tx/${receipt.signature}`)
                  }
                />
              ) : null}
            </View>
          );
        })
      )}
      <Modal
        visible={picker}
        animationType="slide"
        onRequestClose={() => setPicker(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <FlatList
            contentContainerStyle={ui.content}
            keyboardShouldPersistTaps="handled"
            data={targets.filter((item) =>
              `${item.name} ${item.description}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )}
            keyExtractor={(item) => item.value}
            initialNumToRender={12}
            ListHeaderComponent={
              <View style={ui.stack}>
                <Button
                  secondary
                  label="Close investment picker"
                  onPress={() => setPicker(false)}
                />
                <TextInput
                  accessibilityLabel="Search baskets and stocks"
                  style={ui.input}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search baskets and stocks"
                  placeholderTextColor={colors.muted}
                  autoCorrect={false}
                />
              </View>
            }
            ListEmptyComponent={
              <Text style={ui.small}>
                No matching investment. Try another name or ticker.
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: target === item.value }}
                style={ui.card}
                onPress={() => {
                  setTarget(item.value);
                  setPicker(false);
                  setQuery("");
                }}
              >
                <Text style={ui.label}>{item.name}</Text>
                <Text style={ui.small}>{item.description}</Text>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}
