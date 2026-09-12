import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';

export function SipScreen({ onBack }: { onBack: () => void }) {
  const [frequency, setFrequency] = useState('weekly');
  const [amount, setAmount] = useState('25');

  const handleActivate = () => {
    Alert.alert(
      'Automated SIP Activated',
      `Your $${amount} USDC ${frequency} DCA into MAG7 has been scheduled onchain.`
    );
  };

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backBtnText}>← Back to Watchlist</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Automated Mobile SIP</Text>
      <Text style={styles.subtitle}>
        Non-custodial recurring investment powered by Jupiter DCA on Solana.
      </Text>

      <View style={styles.formCard}>
        <Text style={styles.label}>Frequency</Text>
        <View style={styles.tabRow}>
          {['daily', 'weekly', 'monthly'].map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.tab, frequency === f && styles.tabActive]}
              onPress={() => setFrequency(f)}
            >
              <Text style={[styles.tabText, frequency === f && styles.tabTextActive]}>
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>USDC Amount per Cycle</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
          placeholder="25.00"
          placeholderTextColor="#64748B"
        />

        <TouchableOpacity style={styles.submitBtn} onPress={handleActivate}>
          <Text style={styles.submitBtnText}>Activate Recurring Plan</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0E14', padding: 16 },
  backBtn: { marginBottom: 12 },
  backBtnText: { color: '#60A5FA', fontSize: 13, fontWeight: '600' },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { color: '#94A3B8', fontSize: 13, marginBottom: 20 },
  formCard: {
    backgroundColor: '#151922',
    borderRadius: 14,
    padding: 16,
    borderColor: '#222834',
    borderWidth: 1,
  },
  label: { color: '#CBD5E1', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#0B0E14',
    borderRadius: 8,
    alignItems: 'center',
    borderColor: '#222834',
    borderWidth: 1,
  },
  tabActive: { borderColor: '#3B82F6', backgroundColor: '#1E293B' },
  tabText: { color: '#94A3B8', fontSize: 13, textTransform: 'capitalize' },
  tabTextActive: { color: '#60A5FA', fontWeight: 'bold' },
  input: {
    backgroundColor: '#0B0E14',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'monospace',
    borderColor: '#222834',
    borderWidth: 1,
    marginBottom: 20,
  },
  submitBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
});
