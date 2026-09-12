import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';

const MOBILE_BASKETS = [
  {
    id: 'sol-ai-infra',
    ticker: 'dAI-TITAN',
    name: 'AI Infrastructure Titans',
    description: 'Foundry, silicon, and compute foundation powering generative intelligence (NVDA, MSFT, TSM, ASML).',
    navPrice: 114.20,
    return1Y: '+48.60%',
    assetsCount: 5,
  },
  {
    id: 'sol-mag7',
    ticker: 'MAG7',
    name: 'Magnificent 7 Tech',
    description: 'Equal-weighted exposure to Apple, Microsoft, Nvidia, Amazon, Alphabet, Meta, and Tesla.',
    navPrice: 248.50,
    return1Y: '+49.20%',
    assetsCount: 7,
  },
  {
    id: 'sol-pre-stocks',
    ticker: 'PRE-TECH',
    name: 'Pre-IPO Tech Giants',
    description: 'Secondary pre-market tokenized shares of private technology leaders (OpenAI, SpaceX, Stripe).',
    navPrice: 185.00,
    return1Y: '+28.40%',
    assetsCount: 3,
  },
];

export function BasketsScreen({ onBack }: { onBack: () => void }) {
  const [selectedBasket, setSelectedBasket] = useState(MOBILE_BASKETS[0]);

  const handleBuy = () => {
    Alert.alert(
      'Atomic Swap Initiated',
      `Allocated $500 USDC into ${selectedBasket.ticker} (${selectedBasket.name}) via Jupiter on Solana. Zero custody vault required.`
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backBtnText}>Back to Watchlist</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Thematic Stock Baskets</Text>
      <Text style={styles.subtitle}>
        Own diversified index baskets in a single atomic Solana transaction.
      </Text>

      {MOBILE_BASKETS.map((basket) => {
        const isSelected = selectedBasket.id === basket.id;
        return (
          <TouchableOpacity
            key={basket.id}
            style={[styles.card, isSelected && styles.cardSelected]}
            onPress={() => setSelectedBasket(basket)}
            activeOpacity={0.8}
          >
            <View style={styles.cardHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{basket.ticker.slice(0, 2)}</Text>
              </View>
              <View style={styles.headerText}>
                <View style={styles.titleRow}>
                  <Text style={styles.cardTitle}>{basket.name}</Text>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{basket.ticker}</Text>
                  </View>
                </View>
                <Text style={styles.assetsCount}>{basket.assetsCount} Constituent Stocks</Text>
              </View>
            </View>

            <Text style={styles.cardDesc}>{basket.description}</Text>

            <View style={styles.cardFooter}>
              <View>
                <Text style={styles.footerLabel}>ESTIMATED NAV</Text>
                <Text style={styles.footerVal}>${basket.navPrice.toFixed(2)}</Text>
              </View>
              <View style={styles.footerRight}>
                <Text style={styles.footerLabel}>1Y RETURN</Text>
                <Text style={styles.returnVal}>{basket.return1Y}</Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity style={styles.buyBtn} onPress={handleBuy} activeOpacity={0.85}>
        <Text style={styles.buyBtnText}>1-Click Buy {selectedBasket.ticker} ($500 USDC)</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0F12' },
  content: { padding: 16, paddingBottom: 40 },
  backBtn: { marginBottom: 14 },
  backBtnText: { color: '#00D09C', fontSize: 12, fontFamily: 'monospace', fontWeight: 'bold' },
  title: { color: '#F8FAFC', fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { color: '#94A3B8', fontSize: 13, marginBottom: 20, lineHeight: 18 },
  card: {
    backgroundColor: '#12151A',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
  },
  cardSelected: {
    borderColor: '#00D09C',
    backgroundColor: '#181C24',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 12 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#181C24',
    borderWidth: 1,
    borderColor: '#2A3142',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#00D09C', fontWeight: 'bold', fontSize: 13, fontFamily: 'monospace' },
  headerText: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: 'bold' },
  badge: {
    backgroundColor: '#181C24',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  badgeText: { color: '#00D09C', fontSize: 10, fontFamily: 'monospace', fontWeight: 'bold' },
  assetsCount: { color: '#64748B', fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
  cardDesc: { color: '#94A3B8', fontSize: 12, lineHeight: 17, marginBottom: 14 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  footerLabel: { color: '#64748B', fontSize: 10, fontFamily: 'monospace', textTransform: 'uppercase' },
  footerVal: { color: '#F8FAFC', fontSize: 15, fontWeight: 'bold', fontFamily: 'monospace', marginTop: 2 },
  footerRight: { alignItems: 'flex-end' },
  returnVal: { color: '#00D09C', fontSize: 15, fontWeight: 'bold', fontFamily: 'monospace', marginTop: 2 },
  buyBtn: {
    backgroundColor: '#00D09C',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 30,
  },
  buyBtnText: { color: '#0D0F12', fontWeight: 'bold', fontSize: 14 },
});
