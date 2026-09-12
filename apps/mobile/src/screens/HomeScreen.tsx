import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { MOCK_MARKET_INSIGHTS } from '@kite/sdk';

export function HomeScreen({ onNavigate }: { onNavigate: (screen: string) => void }) {
  const stocks = Object.values(MOCK_MARKET_INSIGHTS);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroBadge}>⚡ Solana Tokenized Equities</Text>
        <Text style={styles.heroTitle}>Kite Neo-Brokerage</Text>
        <Text style={styles.heroSubtitle}>
          Invest in US Stocks & Thematic Baskets directly from your mobile wallet.
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

      <Text style={styles.sectionTitle}>Market Watchlist</Text>
      {stocks.map((stock) => (
        <View key={stock.symbol} style={styles.stockCard}>
          <View style={styles.stockHeader}>
            <Text style={styles.stockSymbol}>{stock.symbol}</Text>
            <Text style={[styles.stockChange, { color: stock.change24h >= 0 ? '#10B981' : '#EF4444' }]}>
              {stock.change24h >= 0 ? `+${stock.change24h}%` : `${stock.change24h}%`}
            </Text>
          </View>
          <View style={styles.stockBody}>
            <Text style={styles.stockPrice}>${stock.price.toFixed(2)}</Text>
            <Text style={styles.sentimentLabel}>{stock.sentimentLabel}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0E14', padding: 16 },
  hero: {
    backgroundColor: '#151922',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderColor: '#222834',
    borderWidth: 1,
  },
  heroBadge: { color: '#60A5FA', fontSize: 12, fontWeight: 'bold', marginBottom: 8 },
  heroTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: 'bold', marginBottom: 6 },
  heroSubtitle: { color: '#94A3B8', fontSize: 13, lineHeight: 18, marginBottom: 16 },
  ctaRow: { flexDirection: 'row', gap: 10 },
  primaryBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  secondaryBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderColor: '#334155',
    borderWidth: 1,
  },
  secondaryBtnText: { color: '#E2E8F0', fontWeight: '600', fontSize: 13 },
  sectionTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  stockCard: {
    backgroundColor: '#151922',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderColor: '#222834',
    borderWidth: 1,
  },
  stockHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  stockSymbol: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  stockChange: { fontSize: 14, fontWeight: '600' },
  stockBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stockPrice: { color: '#F8FAFC', fontSize: 20, fontWeight: 'bold' },
  sentimentLabel: { color: '#94A3B8', fontSize: 12, backgroundColor: '#0B0E14', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
});
