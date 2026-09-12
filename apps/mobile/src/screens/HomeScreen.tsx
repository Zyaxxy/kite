import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';

interface StockItem {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  category: string;
  sentiment: string;
}

const LIVE_STOCKS: StockItem[] = [
  { symbol: 'dNVDA', name: 'Nvidia Corp.', price: 218.29, changePct: 3.82, category: 'AI & Foundry', sentiment: 'Very Bullish' },
  { symbol: 'dAAPL', name: 'Apple Inc.', price: 228.15, changePct: -0.45, category: 'Consumer Tech', sentiment: 'Neutral' },
  { symbol: 'dMSFT', name: 'Microsoft Corp.', price: 432.90, changePct: 1.15, category: 'Cloud Tech', sentiment: 'Bullish' },
  { symbol: 'dTSLA', name: 'Tesla Inc.', price: 215.80, changePct: -2.10, category: 'Automotive & AI', sentiment: 'Bearish' },
  { symbol: 'dAMZN', name: 'Amazon.com Inc.', price: 186.20, changePct: 0.85, category: 'E-Commerce', sentiment: 'Bullish' },
  { symbol: 'dGOOGL', name: 'Alphabet Inc.', price: 162.40, changePct: -0.30, category: 'Hyperscaler', sentiment: 'Neutral' },
  { symbol: 'dMETA', name: 'Meta Platforms Inc.', price: 512.10, changePct: 2.10, category: 'Social / AI', sentiment: 'Bullish' },
  { symbol: 'preOPENAI', name: 'OpenAI Pre-Stock', price: 157.50, changePct: 2.45, category: 'Frontier AI', sentiment: 'Very Bullish' },
  { symbol: 'preSPACEX', name: 'SpaceX Pre-Stock', price: 212.00, changePct: 1.80, category: 'Aerospace', sentiment: 'Bullish' },
];

export function HomeScreen({ onNavigate }: { onNavigate: (screen: string) => void }) {
  const [paperBalance, setPaperBalance] = useState<number>(50000.00);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Top Header Ticker */}
      <View style={styles.tickerRibbon}>
        <View style={styles.tickerPill}>
          <View style={styles.pulseDot} />
          <Text style={styles.tickerText}>Solana L1 Live</Text>
        </View>
        <Text style={styles.tickerSecondary}>Pyth Latency: 180ms</Text>
      </View>

      {/* Hero Card: Net Asset Value & Quick Allocation (Stitch Obsidian Theme) */}
      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <Text style={styles.heroSubtitle}>Paper Portfolio NAV</Text>
          <View style={styles.gainPill}>
            <Text style={styles.gainPillText}>+$1,245.30 (+2.49%)</Text>
          </View>
        </View>

        <Text style={styles.heroPrice}>${paperBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
        <Text style={styles.heroDesc}>
          Non-custodial trading on Solana. Real-time Pyth feeds with sub-second execution.
        </Text>

        <View style={styles.ctaRow}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => onNavigate('baskets')}>
            <Text style={styles.primaryBtnText}>Thematic Baskets</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => onNavigate('sip')}>
            <Text style={styles.secondaryBtnText}>Automated SIP</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Section: Market Watchlist */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Tokenized US Equities</Text>
        <Text style={styles.sectionBadge}>24/7 SPL Markets</Text>
      </View>

      {LIVE_STOCKS.map((stock) => {
        const isPositive = stock.changePct >= 0;
        return (
          <View key={stock.symbol} style={styles.stockCard}>
            <View style={styles.stockLeft}>
              <View style={styles.stockAvatar}>
                <Text style={styles.stockAvatarText}>{stock.symbol.replace(/^d/, '').replace(/^pre/, '').slice(0, 2)}</Text>
              </View>
              <View>
                <View style={styles.symbolRow}>
                  <Text style={styles.stockName}>{stock.name}</Text>
                  <View style={styles.tokenTag}>
                    <Text style={styles.tokenTagText}>{stock.symbol}</Text>
                  </View>
                </View>
                <Text style={styles.stockCategory}>{stock.category}</Text>
              </View>
            </View>

            <View style={styles.stockRight}>
              <Text style={styles.stockPrice}>${stock.price.toFixed(2)}</Text>
              <View style={[styles.changeBadge, isPositive ? styles.changeBadgeUp : styles.changeBadgeDown]}>
                <Text style={[styles.changeText, isPositive ? styles.changeTextUp : styles.changeTextDown]}>
                  {isPositive ? '+' : ''}{stock.changePct.toFixed(2)}%
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0F12' },
  content: { padding: 16, paddingBottom: 40 },
  tickerRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingVertical: 4,
  },
  tickerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 208, 156, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 208, 156, 0.25)',
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00D09C',
    marginRight: 6,
  },
  tickerText: { color: '#00D09C', fontSize: 11, fontFamily: 'monospace', fontWeight: 'bold' },
  tickerSecondary: { color: '#64748B', fontSize: 11, fontFamily: 'monospace' },
  heroCard: {
    backgroundColor: '#12151A',
    borderRadius: 18,
    padding: 20,
    marginBottom: 24,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  heroSubtitle: { color: '#94A3B8', fontSize: 12, fontFamily: 'monospace', textTransform: 'uppercase' },
  gainPill: {
    backgroundColor: 'rgba(0, 208, 156, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 208, 156, 0.25)',
  },
  gainPillText: { color: '#00D09C', fontSize: 11, fontFamily: 'monospace', fontWeight: 'bold' },
  heroPrice: { color: '#F8FAFC', fontSize: 32, fontWeight: 'bold', marginBottom: 6, fontFamily: 'monospace' },
  heroDesc: { color: '#94A3B8', fontSize: 12, lineHeight: 17, marginBottom: 18 },
  ctaRow: { flexDirection: 'row', gap: 10 },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#00D09C',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#0D0F12', fontWeight: 'bold', fontSize: 13 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: '#181C24',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
  },
  secondaryBtnText: { color: '#F8FAFC', fontWeight: '600', fontSize: 13 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { color: '#F8FAFC', fontSize: 17, fontWeight: 'bold' },
  sectionBadge: { color: '#64748B', fontSize: 11, fontFamily: 'monospace' },
  stockCard: {
    backgroundColor: '#12151A',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stockLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stockAvatar: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#181C24',
    borderWidth: 1,
    borderColor: '#2A3142',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stockAvatarText: { color: '#00D09C', fontWeight: 'bold', fontSize: 13, fontFamily: 'monospace' },
  symbolRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stockName: { color: '#F8FAFC', fontSize: 14, fontWeight: 'bold' },
  tokenTag: {
    backgroundColor: '#181C24',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  tokenTagText: { color: '#00D09C', fontSize: 10, fontFamily: 'monospace', fontWeight: 'bold' },
  stockCategory: { color: '#64748B', fontSize: 11, marginTop: 2 },
  stockRight: { alignItems: 'flex-end' },
  stockPrice: { color: '#F8FAFC', fontSize: 15, fontWeight: 'bold', fontFamily: 'monospace' },
  changeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    marginTop: 3,
  },
  changeBadgeUp: { backgroundColor: 'rgba(0, 208, 156, 0.12)' },
  changeBadgeDown: { backgroundColor: 'rgba(255, 82, 82, 0.12)' },
  changeText: { fontSize: 11, fontFamily: 'monospace', fontWeight: 'bold' },
  changeTextUp: { color: '#00D09C' },
  changeTextDown: { color: '#FF5252' },
});
