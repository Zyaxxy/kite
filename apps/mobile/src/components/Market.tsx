import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MarketAsset } from '@kite/sdk';
import { colors, money, percentage, ui } from '../theme';
import { useKite } from '../state/KiteProvider';

export function AssetLogo({ asset, large = false }: { asset: MarketAsset; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const size = large ? 64 : 42;
  return <View style={[styles.logo, { width: size, height: size, borderRadius: large ? 20 : 14 }]}>
    {asset.logoUrl && !failed ? <Image accessibilityLabel={`${asset.name} logo`} accessibilityIgnoresInvertColors source={{ uri: asset.logoUrl }} style={{ width: size - 14, height: size - 14, borderRadius: 9 }} onError={() => setFailed(true)} /> : <Text style={[styles.initial, large && { fontSize: 21 }]}>{asset.underlyingSymbol.slice(0, 2).toUpperCase()}</Text>}
  </View>;
}

export function AssetRow({ asset, onPress, detail }: { asset: MarketAsset; onPress: () => void; detail?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${asset.name}, ${money(asset.priceUsd)}, view asset`} onPress={onPress} style={({ pressed }) => [styles.assetRow, pressed && { opacity: 0.7 }]}>
    <AssetLogo asset={asset} />
    <View style={{ flex: 1, gap: 4 }}><Text style={ui.label} numberOfLines={1}>{asset.symbol}</Text><Text style={ui.small} numberOfLines={1}>{detail || asset.name}</Text></View>
    <View style={{ alignItems: 'flex-end', gap: 4 }}><Text style={ui.label}>{money(asset.priceUsd)}</Text>
      <Text style={[ui.small, asset.change24hPct != null && (asset.change24hPct >= 0 ? ui.positive : ui.negative)]}>{percentage(asset.change24hPct)}</Text>
    </View>
  </Pressable>;
}

export function MarketStatus() {
  const { market, loading, error, storageError, refresh } = useKite();
  const issue = storageError || error;
  if (issue) return <Pressable accessibilityRole="button" onPress={() => { void refresh(); }} style={styles.notice}><Text style={[ui.small, { color: colors.down }]}>{issue}</Text><Text style={[ui.small, { color: colors.accent }]}>Refresh connection</Text></Pressable>;
  if (market?.warnings.length) return <View style={styles.notice}><Text style={ui.small}>{market.warnings.join(' ')}</Text>{market.refreshing ? <Text style={ui.small}>Updating mainnet prices…</Text> : null}</View>;
  return <View style={ui.between}><View style={ui.row}><View style={styles.liveDot} /><Text style={ui.eyebrow}>MARKET DATA</Text></View>
    <Text style={ui.small}>{loading || market?.refreshing ? 'Refreshing…' : market ? `Updated ${new Date(market.asOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Connecting…'}</Text>
  </View>;
}

const styles = StyleSheet.create({
  logo: { backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  assetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.line, minHeight: 75 },
  notice: { borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.raised, padding: 14, gap: 6 },
  liveDot: { width: 5, height: 5, borderRadius: 4, backgroundColor: colors.accent },
});
