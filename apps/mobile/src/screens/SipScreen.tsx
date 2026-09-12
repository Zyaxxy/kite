import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';

const SIP_TARGETS = [
  { symbol: 'dAI-TITAN', name: 'AI Infrastructure Titans' },
  { symbol: 'MAG7', name: 'Magnificent 7 Tech' },
  { symbol: 'dNVDA', name: 'Nvidia Corp.' },
  { symbol: 'dAAPL', name: 'Apple Inc.' },
];

export function SipScreen({ onBack }: { onBack: () => void }) {
  const [selectedSymbol, setSelectedSymbol] = useState('dAI-TITAN');
  const [frequency, setFrequency] = useState('weekly');
  const [amount, setAmount] = useState('100');

  const handleActivate = () => {
    Alert.alert(
      'Automated DCA Activated',
      `Scheduled a ${frequency} non-custodial recurring investment of $${amount} USDC into ${selectedSymbol} via Solana streaming contracts.`
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backBtnText}>Back to Watchlist</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Automated Mobile SIP</Text>
      <Text style={styles.subtitle}>
        Non-custodial recurring accumulation powered by Solana streaming execution.
      </Text>

      {/* Target Asset Picker */}
      <View style={styles.formCard}>
        <Text style={styles.label}>Target Asset or Basket</Text>
        <View style={styles.targetGrid}>
          {SIP_TARGETS.map((t) => (
            <TouchableOpacity
              key={t.symbol}
              style={[styles.targetChip, selectedSymbol === t.symbol && styles.targetChipActive]}
              onPress={() => setSelectedSymbol(t.symbol)}
            >
              <Text style={[styles.targetText, selectedSymbol === t.symbol && styles.targetTextActive]}>
                {t.symbol}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recurrence Frequency */}
        <Text style={styles.label}>DCA Frequency</Text>
        <View style={styles.tabRow}>
          {['daily', 'weekly', 'bi-weekly', 'monthly'].map((f) => (
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

        {/* Amount Input */}
        <Text style={styles.label}>USDC Amount per Cycle</Text>
        <View style={styles.inputContainer}>
          <Text style={styles.inputPrefix}>$</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
            placeholder="100.00"
            placeholderTextColor="#64748B"
          />
          <Text style={styles.inputSuffix}>USDC</Text>
        </View>

        {/* Projection Box */}
        <View style={styles.projectionBox}>
          <Text style={styles.projTitle}>Estimated 1Y Investment</Text>
          <Text style={styles.projVal}>
            ${(Number(amount || 0) * (frequency === 'weekly' ? 52 : frequency === 'daily' ? 365 : 12)).toLocaleString()} USDC
          </Text>
          <Text style={styles.projNote}>Zero management fees • Non-custodial</Text>
        </View>

        {/* Primary CTA */}
        <TouchableOpacity style={styles.submitBtn} onPress={handleActivate} activeOpacity={0.85}>
          <Text style={styles.submitBtnText}>Activate {frequency} SIP Plan</Text>
        </TouchableOpacity>
      </View>
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
  formCard: {
    backgroundColor: '#12151A',
    borderRadius: 16,
    padding: 18,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    gap: 14,
  },
  label: { color: '#94A3B8', fontSize: 11, fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: -6 },
  targetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  targetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#181C24',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  targetChipActive: {
    borderColor: '#00D09C',
    backgroundColor: 'rgba(0, 208, 156, 0.12)',
  },
  targetText: { color: '#94A3B8', fontSize: 12, fontFamily: 'monospace', fontWeight: '600' },
  targetTextActive: { color: '#00D09C', fontWeight: 'bold' },
  tabRow: { flexDirection: 'row', gap: 6 },
  tab: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#181C24',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  tabActive: {
    borderColor: '#00D09C',
    backgroundColor: 'rgba(0, 208, 156, 0.12)',
  },
  tabText: { color: '#94A3B8', fontSize: 11, textTransform: 'capitalize', fontFamily: 'monospace' },
  tabTextActive: { color: '#00D09C', fontWeight: 'bold' },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181C24',
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  inputPrefix: { color: '#64748B', fontSize: 16, fontFamily: 'monospace', marginRight: 4 },
  input: {
    flex: 1,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 16,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  inputSuffix: { color: '#00D09C', fontSize: 11, fontFamily: 'monospace', fontWeight: 'bold' },
  projectionBox: {
    backgroundColor: '#0D0F12',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  projTitle: { color: '#64748B', fontSize: 10, fontFamily: 'monospace', textTransform: 'uppercase' },
  projVal: { color: '#F8FAFC', fontSize: 16, fontWeight: 'bold', fontFamily: 'monospace', marginVertical: 2 },
  projNote: { color: '#00D09C', fontSize: 10, fontFamily: 'monospace' },
  submitBtn: {
    backgroundColor: '#00D09C',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnText: { color: '#0D0F12', fontWeight: 'bold', fontSize: 14 },
});
