import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  fromTokenAmount,
  ROUTE_HEALTH_LABELS,
  routeHealthGuidance,
  type BasketRouteHealth,
  type BasketRouteHealthRequest,
} from "@kite/sdk";
import { kiteClient } from "../lib/config";
import { useTheme } from "../theme";

export function useNativeRouteHealth(input: BasketRouteHealthRequest | null) {
  const key = input ? JSON.stringify(input) : "";
  const [state, setState] = useState<{
    key: string;
    value: BasketRouteHealth | null;
    message: string;
    loading: boolean;
  }>({ key: "", value: null, message: "", loading: false });
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    setState({
      key,
      value: null,
      message: "Checking stock routes…",
      loading: true,
    });
    const timer = setTimeout(() => {
      kiteClient
        .requestBasketRouteHealth(JSON.parse(key), controller.signal)
        .then((value) => {
          if (!controller.signal.aborted)
            setState({ key, value, message: "", loading: false });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setState({
              key,
              value: null,
              message:
                "Route availability is unknown. Exact review can check again.",
              loading: false,
            });
        });
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key]);
  return state.key === key && key
    ? { value: state.value, loading: state.loading, message: state.message }
    : {
        value: null,
        loading: Boolean(key),
        message: key ? "Checking stock routes…" : "",
      };
}

export function NativeRouteHealth({
  input,
}: {
  input: BasketRouteHealthRequest | null;
}) {
  const state = useNativeRouteHealth(input);
  return <NativeRouteHealthReport input={input} {...state} />;
}

export function NativeRouteHealthReport({
  input,
  value,
  loading,
  message,
}: {
  input: BasketRouteHealthRequest | null;
  value: BasketRouteHealth | null;
  loading: boolean;
  message: string;
}) {
  const { ui } = useTheme();
  const [expanded, setExpanded] = useState(false);
  if (!input) return null;
  const guidance = routeHealthGuidance(value);
  return (
    <View style={ui.stack}>
      <Text style={ui.label}>Mainnet route availability</Text>
      {value ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onPress={() => setExpanded((old) => !old)}
          >
            <Text style={ui.body}>
              {value.legs.filter((leg) => leg.status === "routable").length}/
              {value.legs.length} stocks with observed routes from{" "}
              {value.inputSymbol}
              {value.legs.some((leg) => leg.expiresAt <= Date.now())
                ? " · stale"
                : ""}{" "}
              · {expanded ? "Hide" : "Details"}
            </Text>
          </Pressable>
          {expanded &&
            value.legs.map((leg) => (
              <View key={leg.mint} style={ui.stack}>
                <Text style={ui.label}>
                  {leg.symbol} · {ROUTE_HEALTH_LABELS[leg.status]}
                </Text>
                <Text style={ui.small}>{leg.detail}</Text>
                <Text style={ui.small}>
                  Probe: {fromTokenAmount(leg.probeAmount, value.inputDecimals)}{" "}
                  {value.inputSymbol} ·{" "}
                  {new Date(leg.checkedAt).toLocaleTimeString()}
                  {leg.expiresAt <= Date.now() ? " · stale" : ""}
                </Text>
              </View>
            ))}
          <Text style={ui.small}>
            Cached amount-band checks. Exact routes and complete basket fit are
            checked at review.
          </Text>
          {guidance && <Text style={ui.small}>{guidance}</Text>}
        </>
      ) : (
        <Text style={ui.small}>
          {loading
            ? "Checking stock routes… Wait for this check before purchase review."
            : message}
        </Text>
      )}
    </View>
  );
}
