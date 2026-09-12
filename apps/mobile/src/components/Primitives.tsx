import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, ui } from '../theme';

export function Button({ label, onPress, secondary = false, disabled = false, loading = false, style }: {
  label: string; onPress: () => void; secondary?: boolean; disabled?: boolean; loading?: boolean; style?: ViewStyle;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || loading }} disabled={disabled || loading} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondary, (disabled || loading) && styles.disabled, pressed && styles.pressed, style]}>
    {loading ? <ActivityIndicator color={secondary ? colors.accent : colors.accentInk} /> : <Text style={[styles.buttonText, secondary && { color: colors.ink }]}>{label}</Text>}
  </Pressable>;
}

export function Chip({ label, selected = false, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return <Pressable accessibilityRole={onPress ? 'button' : 'text'} accessibilityState={{ selected }} onPress={onPress} disabled={!onPress}
    style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && { color: colors.accent }]}>{label}</Text></Pressable>;
}

export function EmptyState({ title, description, action, onAction }: { title: string; description: string; action?: string; onAction?: () => void }) {
  return <View style={[ui.card, { alignItems: 'flex-start', paddingVertical: 26 }]}>
    <View style={styles.emptyMark}><View style={styles.emptyDiamond} /></View>
    <Text style={ui.heading}>{title}</Text><Text style={ui.body}>{description}</Text>
    {action && onAction ? <Button secondary label={action} onPress={onAction} /> : null}
  </View>;
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <View style={ui.between}><Text style={ui.heading}>{title}</Text>{action && onAction ? <Pressable accessibilityRole="button" hitSlop={12} onPress={onAction}><Text style={styles.link}>{action}</Text></Pressable> : null}</View>;
}

export function FilterRow({ options, selected, onSelect }: { options: readonly string[]; selected: string; onSelect: (option: string) => void }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
    {options.map(option => <Chip key={option} label={option} selected={selected === option} onPress={() => onSelect(option)} />)}
  </ScrollView>;
}

export function OrbitArt({ small = false }: { small?: boolean }) {
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.art, small && { width: 90, height: 90 }]}>
    <View style={[styles.orbit, small && { width: 77, height: 77 }]} />
    <View style={[styles.orbit, styles.orbitInner, small && { width: 57, height: 57 }]} />
    <View style={[styles.kite, small && { width: 26, height: 26 }]} />
    <View style={styles.orbitDot} />
  </View>;
}

const styles = StyleSheet.create({
  button: { backgroundColor: colors.accent, borderRadius: 12, minHeight: 48, paddingHorizontal: 18, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: colors.accentInk, fontSize: 14, fontWeight: '700' },
  secondary: { backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.line },
  disabled: { opacity: 0.45 }, pressed: { opacity: 0.8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: colors.line, borderRadius: 40, backgroundColor: colors.surface },
  chipSelected: { borderColor: colors.accent, backgroundColor: colors.raised },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  link: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  emptyMark: { width: 36, height: 36, backgroundColor: colors.raised, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  emptyDiamond: { width: 11, height: 11, borderWidth: 1, borderColor: colors.accent, transform: [{ rotate: '45deg' }] },
  art: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center' },
  orbit: { width: 130, height: 130, borderRadius: 100, borderColor: '#82944D', borderWidth: 1, position: 'absolute', transform: [{ scaleX: 0.68 }, { rotate: '35deg' }] },
  orbitInner: { width: 100, height: 100, transform: [{ scaleX: 0.68 }, { rotate: '-35deg' }] },
  kite: { width: 43, height: 43, backgroundColor: colors.accent, transform: [{ rotate: '45deg' }, { skewX: '-15deg' }, { skewY: '-15deg' }] },
  orbitDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, position: 'absolute', top: '23%', right: '20%' },
});
