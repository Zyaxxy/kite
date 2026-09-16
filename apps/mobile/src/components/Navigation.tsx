import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme";

export type Screen =
  | "home"
  | "explore"
  | "baskets"
  | "portfolio"
  | "plans"
  | "watchlist"
  | "settings";
const tabs: {
  screen: Screen;
  label: string;
  shape: "diamond" | "search" | "stack" | "plan";
}[] = [
  { screen: "home", label: "Discover", shape: "search" },
  { screen: "baskets", label: "Baskets", shape: "diamond" },
  { screen: "plans", label: "Recurring", shape: "plan" },
  { screen: "portfolio", label: "Portfolio", shape: "stack" },
];

function NavIcon({
  shape,
  active,
}: {
  shape: (typeof tabs)[number]["shape"];
  active: boolean;
}) {
  const { colors, ui } = useTheme();
  const styles = useStyles();
  const color = active ? colors.accent : colors.muted;
  return (
    <View style={styles.iconBox} accessibilityElementsHidden>
      {shape === "diamond" ? (
        <View style={[styles.diamond, { borderColor: color }]} />
      ) : null}
      {shape === "search" ? (
        <>
          <View style={[styles.search, { borderColor: color }]} />
          <View style={[styles.handle, { backgroundColor: color }]} />
        </>
      ) : null}
      {shape === "stack" ? (
        <>
          <View style={[styles.stack, { borderColor: color }]} />
          <View style={[styles.stackBottom, { borderColor: color }]} />
        </>
      ) : null}
      {shape === "plan" ? (
        <View style={[styles.plan, { borderColor: color }]}>
          <View style={[styles.planLine, { backgroundColor: color }]} />
          <View style={[styles.planDot, { backgroundColor: color }]} />
        </View>
      ) : null}
    </View>
  );
}

export function BottomNav({
  current,
  onNavigate,
}: {
  current: Screen;
  onNavigate: (screen: Screen) => void;
}) {
  const { colors, ui } = useTheme();
  const styles = useStyles();
  const activeScreen =
    current === "explore" || current === "watchlist" ? "home" : current;
  return (
    <View style={styles.nav}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.screen}
          accessibilityRole="tab"
          accessibilityLabel={tab.label}
          accessibilityState={{ selected: activeScreen === tab.screen }}
          onPress={() => onNavigate(tab.screen)}
          style={styles.tab}
        >
          <NavIcon shape={tab.shape} active={activeScreen === tab.screen} />
          <Text
            style={[
              styles.tabLabel,
              activeScreen === tab.screen && { color: colors.accent },
            ]}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Header({
  onNavigate,
  current,
}: {
  onNavigate: (screen: Screen) => void;
  current: Screen;
}) {
  const { colors, ui } = useTheme();
  const styles = useStyles();
  const { mode, setMode } = useTheme();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Kite home"
        onPress={() => onNavigate("home")}
        style={styles.brand}
      >
        <View style={styles.brandMark} />
        <Text style={styles.wordmark}>kite</Text>
      </Pressable>
      <View style={styles.right}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search stocks"
          onPress={() => onNavigate("explore")}
          style={styles.headerAction}
        >
          <NavIcon shape="search" active={false} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Switch to ${mode === "dark" ? "light" : "dark"} theme`}
          onPress={() => setMode(mode === "dark" ? "light" : "dark")}
          style={styles.headerAction}
        >
          <Text style={{ color: colors.ink, fontSize: 21 }}>
            {mode === "dark" ? "☼" : "☾"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          accessibilityState={{ selected: current === "settings" }}
          onPress={() => onNavigate("settings")}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>K</Text>
        </Pressable>
      </View>
    </View>
  );
}

function useStyles() {
  const { colors } = useTheme();
  return StyleSheet.create({
    header: {
      paddingHorizontal: 20,
      paddingVertical: 6,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: 1,
      borderColor: colors.line,
    },
    brand: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    brandMark: {
      height: 17,
      width: 17,
      backgroundColor: colors.accent,
      transform: [
        { rotate: "45deg" },
        { skewX: "-15deg" },
        { skewY: "-15deg" },
      ],
    },
    wordmark: {
      fontSize: 26,
      fontWeight: "600",
      letterSpacing: -1.5,
      color: colors.ink,
    },
    right: { flexDirection: "row", alignItems: "center", gap: 4 },
    headerAction: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      marginLeft: 6,
      backgroundColor: colors.raised,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { color: colors.ink, fontSize: 12, fontWeight: "600" },
    nav: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderColor: colors.line,
      paddingTop: 10,
      paddingBottom: 8,
    },
    tab: { flex: 1, alignItems: "center", gap: 6, minHeight: 46 },
    tabLabel: { color: colors.muted, fontSize: 10, fontWeight: "600" },
    iconBox: {
      height: 22,
      width: 24,
      alignItems: "center",
      justifyContent: "center",
    },
    diamond: {
      width: 14,
      height: 14,
      borderWidth: 1.5,
      transform: [{ rotate: "45deg" }],
    },
    search: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 1.5,
      position: "absolute",
      top: 1,
      left: 2,
    },
    handle: {
      width: 7,
      height: 1.5,
      position: "absolute",
      bottom: 4,
      right: 2,
      transform: [{ rotate: "45deg" }],
    },
    stack: {
      width: 19,
      height: 13,
      borderWidth: 1.5,
      borderRadius: 3,
      position: "absolute",
      top: 2,
    },
    stackBottom: {
      width: 17,
      height: 7,
      borderWidth: 1.5,
      borderTopWidth: 0,
      borderBottomLeftRadius: 3,
      borderBottomRightRadius: 3,
      position: "absolute",
      bottom: 2,
    },
    plan: { width: 18, height: 18, borderWidth: 1.5, borderRadius: 4 },
    planLine: { height: 1, width: 15, position: "absolute", top: 4 },
    planDot: {
      width: 4,
      height: 4,
      borderRadius: 1,
      position: "absolute",
      bottom: 3,
      right: 3,
    },
  });
}
