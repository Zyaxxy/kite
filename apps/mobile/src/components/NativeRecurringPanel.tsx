import React, { useEffect, useState } from "react";
import { Linking, Text, View } from "react-native";
import { Button, Chip } from "./Primitives";
import { API_BASE_URL, API_CONFIGURATION_ERROR, WEB_URL } from "../lib/config";
import { useTheme } from "../theme";
import type { PlanTarget } from "../screens/SipScreen";

import {
  parseDevnetRecurringConfig,
  type DevnetConfig,
} from "../lib/recurring-config";

/** Native spot trading retains its mainnet MWA session. Recurring signing has a separate devnet web flow. */
export function NativeRecurringPanel({
  initialTarget,
}: {
  initialTarget: PlanTarget | null;
}) {
  const { colors, ui } = useTheme();
  const [config, setConfig] = useState<DevnetConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setLoading(true);
    setError("");
    setConfig(null);
    async function read() {
      if (API_CONFIGURATION_ERROR) throw new Error(API_CONFIGURATION_ERROR);
      const response = await fetch(`${API_BASE_URL}/api/recurring/config`, {
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(
          "Devnet recurring configuration is unavailable. Try again shortly.",
        );
      return parseDevnetRecurringConfig(await response.json());
    }
    read()
      .then((value) => {
        if (active) setConfig(value);
      })
      .catch((failure) => {
        if (active)
          setError(
            controller.signal.aborted
              ? "Devnet availability check timed out. Refresh to try again."
              : failure instanceof Error
                ? failure.message
                : "Could not connect to devnet recurring.",
          );
      })
      .finally(() => {
        clearTimeout(timeout);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [revision]);
  async function open() {
    try {
      await Linking.openURL(`${WEB_URL}/sip`);
    } catch {
      setError(
        "Kite web could not open. Try again or open your configured Kite web address.",
      );
    }
  }
  return (
    <>
      <View style={[ui.card, { borderColor: colors.accent }]}>
        <View style={ui.between}>
          <Text style={ui.heading}>Build a recurring plan</Text>
          <Chip label="Devnet" selected />
        </View>
        <Text style={ui.body}>
          Choose a stock or basket, a test-token amount and a schedule. Review
          the plan with your devnet wallet on Kite web.
        </Text>
        {initialTarget ? (
          <View
            style={{
              borderLeftWidth: 2,
              borderColor: colors.accent,
              paddingLeft: 12,
              gap: 4,
            }}
          >
            <Text style={ui.small}>Your selected idea</Text>
            <Text style={ui.label}>{initialTarget.name}</Text>
            <Text style={ui.small}>
              Select its supported devnet equivalent in the web plan builder.
            </Text>
          </View>
        ) : null}
        <View style={ui.divider} />
        <View style={ui.between}>
          <Text style={ui.small}>Funding</Text>
          <Text style={ui.label}>KUSD test tokens</Text>
        </View>
        <View style={ui.between}>
          <Text style={ui.small}>Stock delivery</Text>
          <Text style={ui.label}>Devnet xStock test tokens</Text>
        </View>
        <Text style={ui.small}>
          No real shares or mainnet funds. Native spot trading keeps its
          separate mainnet wallet session.
        </Text>
        {loading ? (
          <Text style={ui.small}>Checking devnet configuration…</Text>
        ) : error ? (
          <Text accessibilityRole="alert" style={[ui.small, ui.negative]}>
            {error}
          </Text>
        ) : config ? (
          <View style={ui.stack}>
            <Text style={ui.label}>
              {config.readyToPrepare
                ? "Wallet simulation required"
                : "Setup is not available yet"}
            </Text>
            {config.reasons.map((reason) => (
              <Text key={reason} style={ui.small}>
                {reason}
              </Text>
            ))}
            {config.readyToPrepare ? (
              <Text style={ui.small}>
                A configured catalog does not verify execution. The web flow
                must simulate each transaction successfully before you can
                approve it.
              </Text>
            ) : null}
            <Text style={ui.small}>
              {config.stocks.filter((stock) => stock.available).length}{" "}
              configured stocks ·{" "}
              {config.baskets.filter((basket) => basket.available).length}{" "}
              configured baskets
            </Text>
          </View>
        ) : null}
        <Button
          label="Open devnet recurring on web"
          disabled={!WEB_URL || loading || !config?.readyToPrepare}
          onPress={() => {
            void open();
          }}
        />
        <Button
          secondary
          label="Refresh availability"
          loading={loading}
          onPress={() => setRevision((value) => value + 1)}
        />
      </View>
      <View style={ui.stack}>
        <Text style={ui.heading}>How it works</Text>
        {[
          [
            "01",
            "Choose your investment",
            "Pick a supported devnet stock or basket and review its allocation.",
          ],
          [
            "02",
            "Set your schedule",
            "Approve the test-token budget, cadence and duration with your devnet wallet.",
          ],
          [
            "03",
            "Check your submission",
            "Review the setup result and check a pending transaction’s status in the devnet web flow.",
          ],
        ].map(([step, title, detail]) => (
          <View
            key={step}
            style={{
              flexDirection: "row",
              gap: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderColor: colors.line,
            }}
          >
            <Text style={[ui.small, { color: colors.accent, paddingTop: 2 }]}>
              {step}
            </Text>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={ui.label}>{title}</Text>
              <Text style={ui.small}>{detail}</Text>
            </View>
          </View>
        ))}
      </View>
    </>
  );
}
