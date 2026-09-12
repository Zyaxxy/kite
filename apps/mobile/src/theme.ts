import { StyleSheet } from 'react-native';

export const colors = {
  background: '#101311', surface: '#181D19', raised: '#202720', line: '#30392F',
  ink: '#F4F6EF', muted: '#9AA795', accent: '#D5F478', accentInk: '#202917',
  up: '#B9DE83', down: '#F3A59B',
};

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 22, paddingBottom: 40, gap: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stack: { gap: 12 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 20, gap: 14 },
  eyebrow: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.8, textTransform: 'uppercase' },
  title: { color: colors.ink, fontSize: 34, lineHeight: 39, fontWeight: '600', letterSpacing: -1.2 },
  heading: { color: colors.ink, fontSize: 21, fontWeight: '600', letterSpacing: -0.5 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  small: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  money: { color: colors.ink, fontSize: 39, lineHeight: 45, fontWeight: '500', letterSpacing: -1.4, fontVariant: ['tabular-nums'] },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.background, color: colors.ink, padding: 15, fontSize: 16 },
  divider: { height: 1, backgroundColor: colors.line },
  positive: { color: colors.up },
  negative: { color: colors.down },
});

export function money(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return 'Unavailable';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function percentage(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? 'No change data' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}
