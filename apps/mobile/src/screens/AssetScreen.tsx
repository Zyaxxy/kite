import React, { useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { executePaperOrder, type MarketAsset } from '@kite/sdk';
import { AssetLogo, MarketStatus } from '../components/Market';
import { Button, Chip, FilterRow } from '../components/Primitives';
import { useKite } from '../state/KiteProvider';
import { WEB_URL } from '../lib/config';
import { colors, money, percentage, ui } from '../theme';

export function AssetScreen({ asset, onClose, onPlan }: { asset: MarketAsset; onClose: () => void; onPlan: (asset: MarketAsset) => void }) {
  const { account, watchlist, toggleWatch, updateAccount, loading, refresh, ready } = useKite();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const held = account.positions.find(position => position.mint === asset.mint);
  const numericAmount = Number(amount);
  const canTrade = ready && asset.priceUsd !== null && !asset.tradingHalted;

  function trade() {
    try {
      updateAccount(current => executePaperOrder(current, asset, side, numericAmount));
      setAmount(''); setError(null);
      Alert.alert('Paper order filled', `${side === 'buy' ? 'Bought' : 'Sold'} ${money(numericAmount)} of ${asset.symbol} using virtual funds. View the fill in Portfolio.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'This paper order could not be placed.'); }
  }

  async function openActual() {
    if (!WEB_URL) return;
    try { await Linking.openURL(`${WEB_URL}/stock/${encodeURIComponent(asset.mint)}?mode=actual`); }
    catch { setError('Kite web could not be opened. Check your web URL.'); }
  }

  return <ScrollView style={ui.screen} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void refresh(); }} tintColor={colors.accent} />}>
    <Button secondary label="Back to exploring" onPress={onClose} />
    <View style={ui.between}><AssetLogo asset={asset} large /><Chip label={watchlist.includes(asset.mint) ? 'Saved to watchlist' : 'Add to watchlist'} selected={watchlist.includes(asset.mint)} onPress={() => toggleWatch(asset.mint)} /></View>
    <View style={ui.stack}><Text style={ui.eyebrow}>{asset.issuer === 'prestocks' ? 'PRIVATE FRONTIERS · PRESTOCKS' : `${asset.kind === 'etf' ? 'ETF' : asset.kind === 'equity' ? 'EQUITY' : 'TOKENIZED ASSET'} · XSTOCKS`}</Text><Text style={ui.title}>{asset.name}</Text><Text style={ui.body}>{asset.symbol}</Text></View>
    <View style={ui.stack}><Text style={ui.money}>{money(asset.priceUsd)}</Text><Text style={[ui.label, asset.change24hPct != null && (asset.change24hPct >= 0 ? ui.positive : ui.negative)]}>{percentage(asset.change24hPct)}{asset.change24hPct != null ? ' past 24h' : ''}</Text></View>
    <MarketStatus />
    <View style={ui.card}><Text style={ui.eyebrow}>LIVE MARKET SNAPSHOT</Text>
      <View style={ui.between}><Text style={ui.body}>24h traded volume</Text><Text style={ui.label}>{money(asset.volume24hUsd, 0)}</Text></View>
      <View style={ui.between}><Text style={ui.body}>Liquidity</Text><Text style={ui.label}>{money(asset.liquidityUsd, 0)}</Text></View>
      <View style={ui.between}><Text style={ui.body}>Token market cap</Text><Text style={ui.label}>{money(asset.marketCapUsd, 0)}</Text></View>
      <View style={ui.divider} /><Text style={ui.small}>This is the token's observed market price. Reference prices are indicative; your executable quote may differ.</Text>
      {asset.priceObservedAt ? <Text style={ui.small}>Price observed {new Date(asset.priceObservedAt).toLocaleString()}</Text> : null}
    </View>
    <View style={ui.card}><View style={ui.between}><Text style={ui.heading}>Your next move.</Text><Chip label="Paper trade" selected /></View>
      <FilterRow options={['Buy', 'Sell']} selected={side === 'buy' ? 'Buy' : 'Sell'} onSelect={value => { setSide(value === 'Buy' ? 'buy' : 'sell'); setError(null); }} />
      <Text style={ui.small}>{side === 'buy' ? `${money(account.cashUsd)} virtual buying power` : `${(held?.quantity ?? 0).toLocaleString('en-US', { maximumFractionDigits: 6 })} ${asset.symbol} paper units held`}</Text>
      <Text style={ui.label}>Amount in virtual USD</Text><TextInput accessibilityLabel="Paper trade amount in dollars" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.muted} style={[ui.input, { fontSize: 30 }]} />
      <View style={ui.between}><Text style={ui.body}>Estimated units</Text><Text style={ui.label}>{asset.priceUsd && numericAmount > 0 ? (numericAmount / asset.priceUsd).toLocaleString('en-US', { maximumFractionDigits: 6 }) : '—'}</Text></View>
      {error ? <Text accessibilityRole="alert" style={[ui.small, ui.negative]}>{error}</Text> : null}
      {!canTrade ? <Text style={[ui.small, ui.negative]}>{!ready ? 'Paper account is not ready.' : asset.tradingHalted ? asset.tradingNotice || 'Trading is currently halted for this asset.' : 'A live price is required to place a paper trade.'}</Text> : null}
      <Button label={`Paper ${side} ${asset.symbol}`} onPress={trade} disabled={!canTrade || !Number.isFinite(numericAmount) || numericAmount <= 0} />
      <Text style={ui.small}>Simulated fill at the observed price. No tokens move and no wallet signature is requested. Real execution may include fees and slippage.</Text>
    </View>
    <View style={ui.card}><Text style={ui.heading}>Build a rhythm.</Text><Text style={ui.body}>Turn this idea into a recurring paper investment.</Text><Button secondary label="Create a paper plan" onPress={() => onPlan(asset)} disabled={!canTrade} /></View>
    <View style={ui.card}><Text style={ui.eyebrow}>ACTUAL TRADING</Text><Text style={ui.body}>Continue on Kite web with Privy to review a real mainnet trade from your own wallet.</Text><Button secondary label="Open actual trading on web" onPress={openActual} disabled={!WEB_URL} />{!WEB_URL ? <Text style={ui.small}>Configure a Kite web address to use Privy sign-in.</Text> : null}</View>
    <View style={ui.card}><Text style={ui.eyebrow}>KNOW WHAT YOU OWN</Text><Text style={ui.body}>Tokenized exposure has issuer-specific terms, restrictions and risks. Review the issuer before placing a real trade.</Text><Text selectable style={ui.small}>Solana mint{ '\n' }{asset.mint}</Text><Button secondary label="Read issuer information" onPress={() => { void Linking.openURL(asset.sourceUrl).catch(() => setError('The issuer page could not be opened.')); }} /></View>
  </ScrollView>;
}
