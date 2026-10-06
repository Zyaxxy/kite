"use client";
import { useEffect, useState } from "react";
import type {
  BasketRouteHealth,
  BasketRouteHealthRequest,
  BasketRouteCoverage,
} from "@kite/sdk";
import { kiteClient } from "./api-client";

export function useRouteHealth(input: BasketRouteHealthRequest | null) {
  const key = input ? JSON.stringify(input) : "";
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    value: BasketRouteHealth | null;
    loading: boolean;
    error: string;
  }>({ key: "", value: null, loading: false, error: "" });
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const request = JSON.parse(key) as BasketRouteHealthRequest;
    setState({ key, value: null, loading: true, error: "" });
    const timer = setTimeout(() => {
      kiteClient
        .requestBasketRouteHealth(request, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted)
            setState({ key, value, loading: false, error: "" });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setState({
              key,
              value: null,
              loading: false,
              error:
                "Route availability is unknown. Try the exact purchase review.",
            });
        });
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, revision]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        !state.loading &&
        state.key === key &&
        state.value?.legs.some((leg) => leg.expiresAt <= Date.now())
      )
        setRevision((value) => value + 1);
    }, 30_000);
    return () => clearInterval(timer);
  }, [state, key]);
  // Request identity stays inside the hook; `key` is reserved by React JSX.
  return state.key === key
    ? { value: state.value, loading: state.loading, error: state.error }
    : { value: null, loading: Boolean(key), error: "" };
}

let coverage: BasketRouteCoverage[] = [];
let coverageExpires = 0;
let pending: Promise<BasketRouteCoverage[]> | null = null;
const listeners = new Set<() => void>();
function refreshCoverage() {
  if (
    document.visibilityState === "hidden" ||
    pending ||
    coverageExpires > Date.now()
  )
    return;
  pending = kiteClient
    .getBasketRouteCoverage()
    .then((value) => {
      coverage = value;
      coverageExpires = Date.now() + 60_000;
      for (const listener of listeners) listener();
      return value;
    })
    .catch(() => {
      coverageExpires = Date.now() + 30_000;
      coverage = coverage.map((basket) => {
        const funding = basket.funding.map((value) => ({
          ...value,
          stale:
            value.stale ||
            value.checkedAt === null ||
            value.checkedAt + 300_000 <= Date.now(),
        }));
        return {
          ...basket,
          funding,
          featured: basket.featured && funding.every((value) => !value.stale),
        };
      });
      for (const listener of listeners) listener();
      return coverage;
    })
    .finally(() => {
      pending = null;
    });
}
export function useRouteCoverage() {
  const [value, setValue] = useState(coverage);
  useEffect(() => {
    const listener = () => setValue(coverage);
    listeners.add(listener);
    refreshCoverage();
    document.addEventListener("visibilitychange", refreshCoverage);
    const timer = setInterval(refreshCoverage, 60_000);
    return () => {
      listeners.delete(listener);
      document.removeEventListener("visibilitychange", refreshCoverage);
      clearInterval(timer);
    };
  }, []);
  return value;
}
