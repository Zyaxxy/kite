import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { valuePaperAccount, type MarketAsset } from '@kite/sdk';
import { AssetRow, MarketStatus } from '../components/Market';
import { Button, EmptyState, OrbitArt, SectionTitle } from '../components/Primitives';
import type { Screen } from '../components/Navigation';
import { useKite } from '../state/KiteProvider';
import { colors, money, percentage, ui } from '../theme';

export function HomeScreen({ onNavigate, onAsset }: { onNavigate: (screen: Screen) => void; onAsset: (asset: MarketAsset) => void }) {
  const { account, market, loading, ready, refresh, watchlist } = useKite();
  const valuation = valuePaperAccount(account, market?.assets ?? []);
  const watched = market?.assets.filter(asset => watchlist.includes(asset.mint)) ?? [];
  return <ScrollView style={ui.screen} contentContainerStyle={ui.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void refresh(); }} tintColor={colors.accent} />}>
    <View style={ui.stack}><Text style={ui.eyebrow}>A NEW WAY TO OWN WHAT'S NEXT</Text><Text style={ui.title}>Big ideas.{ '\n' }Smaller starting points.</Text><Text style={ui.body}>Explore tokenized companies and build your own point of view.</Text></View>
    <View style={styles.balanceCard}>
      <View style={ui.between}><Text style={[ui.eyebrow, { color: colors.accentInk }]}>YOUR PAPER PORTFOLIO</Text><Text style={styles.virtualLabel}>VIRTUAL USD</Text></View>
      <Text style={[ui.money, { color: colors.accentInk }]}>{ready ? money(valuation.totalUsd) : 'Loading…'}</Text>
      <Text style={styles.balanceNote}>{account.orders.length ? `${money(valuation.profitLossUsd)} · ${percentage(valuation.profitLossPct)} all time` : `${money(account.startingCashUsd)} in virtual funds. Your first move is yours.`}</Text>
      <View style={styles.balanceDivider} />
      <View style={ui.between}><Text style={styles.balanceNote}>Buying power</Text><Text style={styles.balanceAmount}>{money(account.cashUsd)}</Text></View>
      <Button secondary label="Explore investments" onPress={() => onNavigate('explore')} />
    </View>
    <View style={ui.card}>
      <View style={ui.between}><View style={{ flex: 1, gap: 10 }}><Text style={ui.eyebrow}>CURATED CONVICTION</Text><Text style={ui.heading}>One idea.{ '\n' }A whole basket.</Text></View><OrbitArt small /></View>
      <Text style={ui.body}>From the intelligence layer to private frontiers. Discover thematic allocations built from live mainnet assets.</Text>
      <Button secondary label="Discover baskets" onPress={() => onNavigate('baskets')} />
    </View>
    <MarketStatus />
    <View style={ui.stack}><SectionTitle title="On your radar" action="Watchlist" onAction={() => onNavigate('watchlist')} />
      {watched.length ? <View>{watched.slice(0, 4).map(asset => <AssetRow key={asset.mint} asset={asset} onPress={() => onAsset(asset)} />)}</View> : <EmptyState title="Keep your next idea close." description="Save assets to your watchlist as you explore. Your picks will appear here." action="Find an asset" onAction={() => onNavigate('explore')} />}
    </View>
    {market?.assets.length ? <View style={ui.stack}><SectionTitle title="Across the market" action="View all" onAction={() => onNavigate('explore')} />
      {market.assets.slice(0, 4).map(asset => <AssetRow key={asset.mint} asset={asset} onPress={() => onAsset(asset)} />)}
    </View> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  balanceCard: { backgroundColor: colors.accent, borderRadius: 22, padding: 22, gap: 14 },
  virtualLabel: { color: colors.accentInk, fontSize: 8, letterSpacing: 1, borderWidth: 1, borderColor: '#9DB656', borderRadius: 5, padding: 4 },
  balanceNote: { color: '#42512B', fontSize: 12, lineHeight: 19 },
  balanceAmount: { color: colors.accentInk, fontSize: 16, fontWeight: '600' },
  balanceDivider: { height: 1, backgroundColor: '#B4D15F', marginTop: 4 },
});
