import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { CURATED_BASKETS } from '@kite/sdk';

export function BasketsScreen({ onBack }: { onBack: () => void }) {
  const [selectedBasket, setSelectedBasket] = useState(CURATED_BASKETS[0]);

  const handleBuy = () => {
    Alert.alert(
      'Transaction Initiated',
      `Executing 1-click atomic swap into ${selectedBasket.name} via Jupiter on Solana.`
    );
  };

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backBtnText}>← Back to Watchlist</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Thematic Baskets</Text>
      <Text style={styles.subtitle}>
        Own equal-weighted stock baskets in a single atomic transaction.
      </Text>

      {CURATED_BASKETS.map((basket) => (
        <TouchableOpacity
          key={basket.id}
          style={[styles.card, selectedBasket.id === basket.id && styles.cardSelected]}
          onPress={() => setSelectedBasket(basket)}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardIcon}>{basket.icon}</Text>
            <View>
              <Text style={styles.cardTitle}>{basket.name}</Text>
              <Text style={styles.cardTicker}>{basket.ticker}</Text>
            </View>
          </View>
          <Text style={styles.cardDesc}>{basket.description}</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={styles.buyBtn} onPress={handleBuy}>
        <Text style={styles.buyBtnText}>1-Click Buy {selectedBasket.ticker} with USDC</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0E14', padding: 16 },
  backBtn: { marginBottom: 12 },
  backBtnText: { color: '#60A5FA', fontSize: 13, fontWeight: '600' },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { color: '#94A3B8', fontSize: 13, marginBottom: 20 },
  card: {
    backgroundColor: '#151922',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderColor: '#222834',
    borderWidth: 1,
  },
  cardSelected: { borderColor: '#3B82F6', backgroundColor: '#1A2232' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  cardIcon: { fontSize: 24, marginRight: 10 },
  cardTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  cardTicker: { color: '#60A5FA', fontSize: 12, fontWeight: '600' },
  cardDesc: { color: '#94A3B8', fontSize: 13, lineHeight: 18 },
  buyBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 40,
  },
  buyBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
});
