import React, { useState } from 'react';
import { FlatList, RefreshControl, Text, TextInput, View } from 'react-native';
import type { MarketAsset } from '@kite/sdk';
import { AssetRow, MarketStatus } from '../components/Market';
import { EmptyState, FilterRow, Button } from '../components/Primitives';
import { useKite } from '../state/KiteProvider';
import { colors, ui } from '../theme';

const FILTERS = ['All assets', 'xStocks', 'PreStocks', 'ETFs'] as const;
export function ExploreScreen({ onAsset, onBaskets, watchlistOnly = false }: { onAsset: (asset: MarketAsset) => void; onBaskets: () => void; watchlistOnly?: boolean }) {
  const { market, watchlist, loading, refresh, error } = useKite();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All assets');
  const assets = (market?.assets ?? []).filter(asset => {
    if (watchlistOnly && !watchlist.includes(asset.mint)) return false;
    if (filter === 'xStocks' && asset.issuer !== 'xstocks') return false;
    if (filter === 'PreStocks' && asset.issuer !== 'prestocks') return false;
    if (filter === 'ETFs' && asset.kind !== 'etf') return false;
    return `${asset.symbol} ${asset.name} ${asset.underlyingSymbol} ${asset.mint}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  return <FlatList style={ui.screen} contentContainerStyle={{ padding: 22, paddingBottom: 36 }} data={assets} keyExtractor={asset => asset.mint}
    renderItem={({ item }) => <AssetRow asset={item} onPress={() => onAsset(item)} />}
    refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void refresh(); }} tintColor={colors.accent} />}
    ListHeaderComponent={<View style={{ gap: 20, paddingBottom: 10 }}>
      <View style={ui.stack}><Text style={ui.eyebrow}>{watchlistOnly ? 'YOUR RADAR' : 'IDEAS WITHOUT BORDERS'}</Text><Text style={ui.title}>{watchlistOnly ? 'Worth watching.' : 'Find your next conviction.'}</Text><Text style={ui.body}>{watchlistOnly ? 'A personal collection of the companies you are following.' : 'Public markets. Private frontiers. Tokenized on Solana.'}</Text></View>
      <TextInput accessibilityLabel="Search assets" style={ui.input} placeholder="Search companies, symbols or mints" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} clearButtonMode="while-editing" />
      <FilterRow options={FILTERS} selected={filter} onSelect={setFilter} />
      {!watchlistOnly ? <Button secondary label="Explore thematic baskets" onPress={onBaskets} /> : null}
      <MarketStatus />
      <View style={ui.between}><Text style={ui.eyebrow}>{filter.toUpperCase()}</Text><Text style={ui.small}>{assets.length} {assets.length === 1 ? 'asset' : 'assets'}</Text></View>
    </View>}
    ListEmptyComponent={<EmptyState title={loading ? 'Opening the market.' : watchlistOnly && !query ? 'Make room for your next idea.' : 'No assets to show.'} description={loading ? 'Fetching the latest issuer catalogs and available prices.' : error ? 'The live market connection is unavailable. Pull down to retry.' : watchlistOnly && !query ? 'Open any asset and save it to your watchlist.' : 'Try another search or filter. Assets appear only when supplied by the live catalog.'} />}
  />;
}
