import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type {
  MarketAsset,
  ResearchFundamental,
  StockResearch as StockResearchData,
} from "@kite/sdk";
import { apiGet } from "../lib/config";
import { Button, FilterRow } from "./Primitives";
import { colors, ui } from "../theme";

const TABS = [
  "Overview",
  "Technicals",
  "Fundamentals",
  "News",
  "Events",
] as const;
type ResearchTab = (typeof TABS)[number];

function number(value: number | null | undefined, digits = 2): string {
  return value == null || !Number.isFinite(value)
    ? "Unavailable"
    : value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function date(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "Date unavailable";
}

function fundamentalValue(fact: ResearchFundamental): string {
  const absolute = Math.abs(fact.value);
  const divisor =
    absolute >= 1e12 ? 1e12 : absolute >= 1e9 ? 1e9 : absolute >= 1e6 ? 1e6 : 1;
  const suffix =
    divisor === 1e12 ? "T" : divisor === 1e9 ? "B" : divisor === 1e6 ? "M" : "";
  return `${number(fact.value / divisor)}${suffix} ${fact.unit}`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={ui.small}>{label}</Text>
      <Text style={ui.label}>{value}</Text>
    </View>
  );
}

function Link({
  label,
  url,
  onError,
}: {
  label: string;
  url: string;
  onError: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => {
        if (!/^https:\/\//i.test(url)) {
          onError();
          return;
        }
        void Linking.openURL(url).catch(onError);
      }}
      style={styles.link}
    >
      <Text style={[ui.small, { color: colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

/** Native research uses the same sourced response as the web, without provider keys. */
export function StockResearch({
  asset,
  refreshKey = 0,
}: {
  asset: MarketAsset;
  refreshKey?: number;
}) {
  const [tab, setTab] = useState<ResearchTab>("Overview");
  const [result, setResult] = useState<StockResearchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const research = result?.mint === asset.mint ? result : null;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 60_000);
    setLoading(true);
    setError(null);
    setResult(null);
    void apiGet<StockResearchData>(
      `/api/research?mint=${encodeURIComponent(asset.mint)}`,
      controller.signal,
    )
      .then((response) => {
        if (
          response.mint !== asset.mint ||
          !Array.isArray(response.bars) ||
          !Array.isArray(response.fundamentals) ||
          !Array.isArray(response.news) ||
          !Array.isArray(response.events) ||
          !Array.isArray(response.sources) ||
          !Array.isArray(response.warnings)
        )
          throw new Error("Company research returned an invalid response.");
        if (active) setResult(response);
      })
      .catch((failure) => {
        if (active && (!controller.signal.aborted || timedOut))
          setError(
            timedOut
              ? "Company research took too long to respond. Please retry."
              : failure instanceof Error
                ? failure.message
                : "Company research is temporarily unavailable.",
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
  }, [asset.mint, refreshKey, retry]);

  const technicals = research?.technicals;
  const latestFundamentals = [
    ...(research?.fundamentals ?? [])
      .reduce((latest, fact) => {
        if (
          !latest.has(fact.id) ||
          latest.get(fact.id)!.periodEnd < fact.periodEnd
        )
          latest.set(fact.id, fact);
        return latest;
      }, new Map<string, ResearchFundamental>())
      .values(),
  ];
  const currency = research?.profile?.currency;
  const price = (value: number | null | undefined): string =>
    value == null
      ? "Unavailable"
      : `${number(value)}${currency ? ` ${currency}` : ""}`;
  const onLinkError = () =>
    setError("The source could not be opened on this device.");

  return (
    <View style={ui.stack}>
      <View style={ui.stack}>
        <Text style={ui.eyebrow}>THE COMPANY BEHIND THE TOKEN</Text>
        <Text style={ui.heading}>Make room for research.</Text>
        <Text style={ui.small}>
          Company fundamentals and exchange-traded share history are separate
          from the Solana token market.
        </Text>
      </View>
      <FilterRow
        options={TABS}
        selected={tab}
        onSelect={(value) => setTab(value as ResearchTab)}
      />
      <View style={ui.card}>
        {loading ? (
          <View style={ui.row}>
            <ActivityIndicator color={colors.accent} />
            <Text style={ui.body}>Gathering company research…</Text>
          </View>
        ) : null}
        {error ? (
          <View style={ui.stack}>
            <Text accessibilityRole="alert" style={[ui.small, ui.negative]}>
              {error}
            </Text>
            <Button
              secondary
              label="Retry research"
              onPress={() => setRetry((value) => value + 1)}
            />
          </View>
        ) : null}
        {!loading && !error && research?.status === "unavailable" ? (
          <Text style={ui.body}>
            Company research is currently unavailable from the public providers.
          </Text>
        ) : null}

        {research && tab === "Overview" ? (
          <View style={ui.stack}>
            <Text style={ui.heading}>
              {research.profile?.name ?? asset.name}
            </Text>
            {research.profile?.description ? (
              <Text style={ui.body}>{research.profile.description}</Text>
            ) : (
              <Text style={ui.body}>
                A company description is not currently available. Explore the
                verified information below or visit the issuer.
              </Text>
            )}
            <View style={styles.grid}>
              <Metric
                label="Exchange"
                value={research.profile?.exchange ?? "Not available"}
              />
              <Metric
                label="Sector"
                value={research.profile?.sector ?? "Not available"}
              />
              <Metric
                label="Industry"
                value={research.profile?.industry ?? "Not available"}
              />
              <Metric
                label="Share currency"
                value={currency ?? "Not available"}
              />
            </View>
            {technicals ? (
              <View style={styles.inset}>
                <Text style={ui.small}>
                  Latest underlying daily bar · {date(technicals.asOf)}
                </Text>
                <Text style={ui.heading}>{price(technicals.close)}</Text>
                <Text style={ui.small}>
                  The latest session may still be in progress. This is not an
                  executable token quote.
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {research && tab === "Technicals" ? (
          technicals ? (
            <View style={ui.stack}>
              <Text style={ui.heading}>Read the underlying trend.</Text>
              <Text style={ui.small}>
                Daily share data through {date(technicals.asOf)} ·{" "}
                {research.bars.length} observed sessions
              </Text>
              <View style={styles.grid}>
                <Metric
                  label="20-session average"
                  value={price(technicals.sma20)}
                />
                <Metric
                  label="50-session average"
                  value={price(technicals.sma50)}
                />
                <Metric
                  label="200-session average"
                  value={price(technicals.sma200)}
                />
                <Metric
                  label="RSI · 14 sessions"
                  value={number(technicals.rsi14, 1)}
                />
                <Metric label="52-week low" value={price(technicals.low52w)} />
                <Metric
                  label="52-week high"
                  value={price(technicals.high52w)}
                />
                <Metric
                  label="Average volume · 20 sessions"
                  value={`${number(technicals.averageVolume20, 0)}${technicals.averageVolume20 === null ? "" : " shares"}`}
                />
              </View>
              <View style={ui.divider} />
              <Text style={ui.body}>
                {technicals.trend === "above-50-day"
                  ? "The latest underlying close is above its 50-session average."
                  : technicals.trend === "below-50-day"
                    ? "The latest underlying close is below its 50-session average."
                    : technicals.trend === "at-50-day"
                      ? "The latest underlying close equals its 50-session average."
                      : "More observed sessions are needed to calculate the trend."}
              </Text>
              <Text style={ui.small}>
                Simple moving averages and Wilder RSI are calculated from
                observed daily closes. Indicators describe past prices and do
                not predict returns.
              </Text>
            </View>
          ) : (
            <Text style={ui.body}>
              No public underlying share history is available for this asset.
              Technical indicators stay unavailable until real data is returned.
            </Text>
          )
        ) : null}

        {research && tab === "Fundamentals" ? (
          research.fundamentals.length ? (
            <View style={ui.stack}>
              <Text style={ui.heading}>Behind the business.</Text>
              <Text style={ui.small}>
                Reported company values, with the period and currency supplied
                by the provider.
              </Text>
              {(["annual", "quarterly"] as const).map((period) => {
                const facts = latestFundamentals.filter(
                  (fact) => fact.period === period,
                );
                return facts.length ? (
                  <View style={ui.stack} key={period}>
                    <Text style={ui.eyebrow}>
                      {period === "annual"
                        ? "ANNUAL RESULTS"
                        : "LATEST QUARTER"}
                    </Text>
                    {facts.map((fact) => (
                      <View key={fact.id} style={styles.fact}>
                        <View style={{ flex: 1, gap: 3 }}>
                          <Text style={ui.label}>{fact.label}</Text>
                          <Text style={ui.small}>
                            Period ended {date(fact.periodEnd)}
                          </Text>
                        </View>
                        <Text selectable style={[ui.label, styles.factValue]}>
                          {fundamentalValue(fact)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null;
              })}
            </View>
          ) : (
            <Text style={ui.body}>
              {asset.kind === "etf"
                ? "Operating-company financial statements do not apply to this fund."
                : "No reported company financial statements were returned. Financial values are not estimated from token prices."}
            </Text>
          )
        ) : null}

        {research && tab === "News" ? (
          <View style={ui.stack}>
            <Text style={ui.heading}>Keep the context close.</Text>
            {research.news.length ? (
              research.news.map((article) => (
                <View key={article.url} style={styles.article}>
                  <Text style={ui.small}>
                    {article.publisher ?? "News source"}
                    {article.publishedAt
                      ? ` · ${date(article.publishedAt)}`
                      : ""}
                  </Text>
                  <Text style={ui.label}>{article.title}</Text>
                  <Link
                    label="Read article"
                    url={article.url}
                    onError={onLinkError}
                  />
                </View>
              ))
            ) : (
              <Text style={ui.body}>
                No related company articles are available right now.
              </Text>
            )}
          </View>
        ) : null}

        {research && tab === "Events" ? (
          <View style={ui.stack}>
            <Text style={ui.heading}>Recent corporate actions.</Text>
            <Text style={ui.small}>
              Observed underlying-company dividends and splits. Token treatment
              follows each issuer's terms.
            </Text>
            {research.events.length ? (
              research.events.map((event) => (
                <View key={event.id} style={styles.article}>
                  <Text style={ui.eyebrow}>{date(event.date)}</Text>
                  <Text style={ui.label}>{event.title}</Text>
                  <Text style={ui.body}>{event.detail}</Text>
                  <Link
                    label="View source"
                    url={event.sourceUrl}
                    onError={onLinkError}
                  />
                </View>
              ))
            ) : (
              <Text style={ui.body}>
                No corporate actions were returned for the available history.
                Upcoming dates are not estimated.
              </Text>
            )}
          </View>
        ) : null}

        {research && !loading ? (
          <View style={ui.stack}>
            <View style={ui.divider} />
            {research.warnings.length ? (
              <Text style={ui.small}>{research.warnings.join(" ")}</Text>
            ) : null}
            <Text style={ui.small}>
              Research retrieved {new Date(research.asOf).toLocaleString()}
            </Text>
            {research.sources.length ? (
              <View style={styles.sources}>
                {research.sources.map((source) => (
                  <Link
                    key={source.url}
                    label={source.name}
                    url={source.url}
                    onError={onLinkError}
                  />
                ))}
              </View>
            ) : null}
            <Button
              secondary
              label="Refresh research"
              onPress={() => setRetry((value) => value + 1)}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metric: {
    minWidth: 115,
    flexBasis: "45%",
    flexGrow: 1,
    gap: 5,
    paddingVertical: 6,
  },
  inset: {
    backgroundColor: colors.raised,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  fact: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  factValue: {
    flexShrink: 1,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  article: {
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  sources: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  link: { minHeight: 36, justifyContent: "center" },
});
