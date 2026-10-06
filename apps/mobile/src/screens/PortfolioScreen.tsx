import React, { useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import {
  valuePaperAccount,
  type MainnetPortfolio,
  type MarketAsset,
} from "@kite/sdk";
import { AssetLogo, MarketStatus } from "../components/Market";
import { Button, Chip, EmptyState, FilterRow } from "../components/Primitives";
import { useKite } from "../state/KiteProvider";
import { useMobileTrading } from "../state/MobileTradingProvider";
import { kiteClient } from "../lib/config";
import { money, percentage, useTheme } from "../theme";

export function PortfolioScreen({
  onAsset,
  onExplore,
}: {
  onAsset(asset: MarketAsset): void;
  onExplore(): void;
}) {
  const { colors, ui } = useTheme();
  const { market, account, ready, loading, refresh } = useKite();
  const wallet = useMobileTrading();
  const [mode, setMode] = useState("Paper");
  const [portfolio, setPortfolio] = useState<MainnetPortfolio | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    setPortfolio(null);
    if (mode !== "Wallet" || !wallet.account) return;
    const controller = new AbortController();
    setWalletLoading(true);
    setError("");
    kiteClient
      .getPortfolio(wallet.account.address, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setPortfolio(value);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Wallet holdings could not be loaded.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setWalletLoading(false);
      });
    return () => controller.abort();
  }, [mode, wallet.account?.address, revision]);
  const assets = new Map(
    (market?.assets ?? []).map((asset) => [asset.mint, asset]),
  );
  const valuation = valuePaperAccount(account, market?.assets ?? []);
  const holdings =
    mode === "Wallet"
      ? (portfolio?.holdings ?? []).map((holding) => ({
          mint: holding.mint,
          symbol: holding.symbol,
          amount: holding.displayAmount ?? holding.amount,
          value: holding.valueUsd,
          detail: holding.valuationUnavailableReason ?? "Held in your wallet",
          asset: assets.get(holding.mint),
        }))
      : account.positions.map((position) => {
          const asset = assets.get(position.mint);
          const value =
            asset?.priceUsd == null ? null : asset.priceUsd * position.quantity;
          return {
            mint: position.mint,
            symbol: position.symbol,
            amount: position.quantity.toLocaleString(undefined, {
              maximumFractionDigits: 6,
            }),
            value,
            detail: `Cost basis ${money(position.costBasisUsd)}${value === null ? "" : ` · ${money(value - position.costBasisUsd)} unrealized`}`,
            asset,
          };
        });
  return (
    <FlatList
      style={ui.screen}
      contentContainerStyle={ui.content}
      data={holdings}
      keyExtractor={(item) => item.mint}
      refreshControl={
        <RefreshControl
          refreshing={mode === "Paper" ? loading : walletLoading}
          tintColor={colors.accent}
          onRefresh={() => {
            if (mode === "Paper") void refresh();
            else setRevision((value) => value + 1);
          }}
        />
      }
      ListHeaderComponent={
        <View style={ui.stack}>
          <Text accessibilityRole="header" style={ui.title}>
            Portfolio
          </Text>
          <FilterRow
            options={["Paper", "Wallet"]}
            selected={mode}
            onSelect={setMode}
          />
          {mode === "Paper" ? (
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
              <View style={ui.between}>
                <Text style={ui.small}>Virtual cash</Text>
                <Text style={ui.label}>{money(account.cashUsd)}</Text>
              </View>
              <View style={ui.between}>
                <Text style={ui.small}>Holdings value</Text>
                <Text style={ui.label}>{money(valuation.holdingsUsd)}</Text>
              </View>
              {valuation.unpricedMints.length ? (
                <Text style={ui.small}>
                  Some held assets have no available price. Total valuation
                  stays unavailable until prices return.
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={ui.card}>
              <View style={ui.between}>
                <Text style={ui.small}>Wallet holdings</Text>
                <Chip label="Mainnet" />
              </View>
              {wallet.account ? (
                <>
                  <Text style={ui.money}>
                    {walletLoading
                      ? "Loading…"
                      : portfolio
                        ? money(portfolio.pricedHoldingsValueUsd)
                        : "Unavailable"}
                  </Text>
                  <Text style={ui.small}>
                    {wallet.account.address.slice(0, 6)}…
                    {wallet.account.address.slice(-6)}
                    {portfolio
                      ? ` · Updated ${new Date(portfolio.observedAt).toLocaleTimeString()}`
                      : ""}
                  </Text>
                  {portfolio?.hasUnpricedHoldings ? (
                    <Text style={ui.small}>
                      Priced holdings only. Some assets are missing market
                      prices and are excluded from this value.
                    </Text>
                  ) : null}
                  {portfolio?.warnings?.map((warning) => (
                    <Text key={warning} style={ui.small}>
                      {warning}
                    </Text>
                  ))}
                </>
              ) : (
                <>
                  <Text style={ui.body}>
                    Connect your Android wallet to see the tokens you hold.
                  </Text>
                  {wallet.supported ? (
                    <Button
                      label="Connect wallet"
                      loading={wallet.busy}
                      disabled={!wallet.ready}
                      onPress={() => {
                        void wallet.connect();
                      }}
                    />
                  ) : (
                    <Text style={ui.small}>
                      Wallet signing is available in an Android development or
                      release build. Paper investing works on this platform.
                    </Text>
                  )}
                </>
              )}
            </View>
          )}
          {error || wallet.error ? (
            <Text accessibilityRole="alert" style={[ui.small, ui.negative]}>
              {error || wallet.error}
            </Text>
          ) : null}
          <MarketStatus />
          <Text style={ui.heading}>Holdings</Text>
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          title={walletLoading ? "Loading holdings…" : "No holdings to show"}
          description={
            mode === "Paper"
              ? "Your first paper investment will appear here. Choose a company or basket to begin."
              : wallet.account
                ? "Refresh to check wallet balances. Available tokens appear once the mainnet API responds."
                : "Connect your wallet above to load its mainnet balances."
          }
          action="Explore investments"
          onAction={onExplore}
        />
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          disabled={!item.asset}
          accessibilityState={{ disabled: !item.asset }}
          onPress={() => {
            if (item.asset) onAsset(item.asset);
          }}
          style={{
            paddingVertical: 18,
            gap: 10,
            borderBottomWidth: 1,
            borderColor: colors.line,
          }}
        >
          <View style={ui.between}>
            <View style={ui.row}>
              {item.asset ? <AssetLogo asset={item.asset} /> : null}
              <View>
                <Text style={ui.label}>{item.symbol}</Text>
                <Text style={ui.small}>{item.amount} units</Text>
              </View>
            </View>
            <Text style={ui.label}>{money(item.value)}</Text>
          </View>
          <Text style={ui.small}>{item.detail}</Text>
        </Pressable>
      )}
    />
  );
}
