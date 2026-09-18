import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { useTheme } from "../theme";
import { IconChevronRight } from "./Icons";
import { KiteLogo } from "./KiteLogo";

export function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
  loading = false,
  style,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const { colors, ui } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={secondary ? colors.accent : colors.accentInk}
        />
      ) : (
        <Text style={[styles.buttonText, secondary && { color: colors.ink }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const { colors, ui } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityState={{ selected }}
      onPress={onPress}
      disabled={!onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && { color: colors.accent }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function EmptyState({
  title,
  description,
  action,
  onAction,
}: {
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  const { colors, ui } = useTheme();
  const styles = useStyles();
  return (
    <View style={[ui.card, { alignItems: "flex-start", paddingVertical: 26 }]}>
      <View style={styles.emptyMark}>
        <KiteLogo size={18} />
      </View>
      <Text style={ui.heading}>{title}</Text>
      <Text style={ui.body}>{description}</Text>
      {action && onAction ? (
        <Button secondary label={action} onPress={onAction} />
      ) : null}
    </View>
  );
}

export function SectionTitle({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const { colors, ui } = useTheme();
  const styles = useStyles();
  const cleanAction = action ? action.replace(/[→↗]/g, "").trim() : "";
  return (
    <View style={ui.between}>
      <Text style={ui.heading}>{title}</Text>
      {action && onAction ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={12}
          onPress={onAction}
          style={styles.sectionAction}
        >
          <Text style={styles.link}>{cleanAction}</Text>
          <IconChevronRight color={colors.accent} size={14} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function FilterRow({
  options,
  selected,
  onSelect,
}: {
  options: readonly string[];
  selected: string;
  onSelect: (option: string) => void;
}) {
  const { colors, ui } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
    >
      {options.map((option) => (
        <Chip
          key={option}
          label={option}
          selected={selected === option}
          onPress={() => onSelect(option)}
        />
      ))}
    </ScrollView>
  );
}

function useStyles() {
  const { colors } = useTheme();
  return StyleSheet.create({
    button: {
      backgroundColor: colors.accent,
      borderRadius: 12,
      minHeight: 48,
      paddingHorizontal: 18,
      paddingVertical: 13,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonText: { color: colors.accentInk, fontSize: 14, fontWeight: "600" },
    secondary: {
      backgroundColor: colors.raised,
      borderWidth: 1,
      borderColor: colors.line,
    },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.8 },
    chip: {
      minHeight: 48,
      justifyContent: "center",
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 24,
      backgroundColor: colors.surface,
    },
    chipSelected: {
      borderColor: colors.accent,
      backgroundColor: colors.raised,
    },
    chipText: { fontSize: 13, fontWeight: "600", color: colors.muted },
    link: { color: colors.accent, fontSize: 13, fontWeight: "600" },
    sectionAction: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      minHeight: 44,
      paddingVertical: 6,
    },
    emptyMark: {
      width: 36,
      height: 36,
      backgroundColor: colors.raised,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 2,
    },
  });
}
