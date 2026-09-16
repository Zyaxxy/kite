import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Appearance, Platform, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const darkColors = {
  background: "#101311",
  surface: "#181D19",
  raised: "#202720",
  line: "#30392F",
  ink: "#F4F6EF",
  muted: "#9AA795",
  accent: "#D5F478",
  accentInk: "#202917",
  up: "#B9DE83",
  down: "#F3A59B",
};

export type ThemeColors = typeof darkColors;
const lightColors: ThemeColors = {
  background: "#F5F6F2",
  surface: "#FDFEFB",
  raised: "#EDF2EA",
  line: "#D8DFD4",
  ink: "#202722",
  muted: "#5E675B",
  accent: "#426C2F",
  accentInk: "#FFFFFF",
  up: "#287448",
  down: "#B43F3C",
};
const fontFamily = Platform.select({
  ios: "System",
  android: "sans-serif",
  web: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
});
function createUi(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: {
      width: "100%",
      maxWidth: 760,
      alignSelf: "center",
      padding: 20,
      paddingTop: 24,
      paddingBottom: 32,
      gap: 24,
    },
    row: { flexDirection: "row", alignItems: "center", gap: 12 },
    between: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    stack: { gap: 12 },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 16,
      padding: 20,
      gap: 16,
    },
    eyebrow: {
      fontFamily,
      color: colors.muted,
      fontSize: 10,
      fontWeight: "600",
      letterSpacing: 1.5,
      textTransform: "uppercase",
    },
    title: {
      fontFamily,
      color: colors.ink,
      fontSize: 30,
      lineHeight: 36,
      fontWeight: "600",
      letterSpacing: -1.2,
    },
    heading: {
      fontFamily,
      color: colors.ink,
      fontSize: 20,
      fontWeight: "600",
      letterSpacing: -0.5,
    },
    body: { fontFamily, color: colors.muted, fontSize: 14, lineHeight: 21 },
    label: { fontFamily, color: colors.ink, fontSize: 14, fontWeight: "600" },
    small: { fontFamily, color: colors.muted, fontSize: 12, lineHeight: 18 },
    money: {
      fontFamily,
      color: colors.ink,
      fontSize: 38,
      lineHeight: 44,
      fontWeight: "500",
      letterSpacing: -1.4,
      fontVariant: ["tabular-nums"],
    },
    input: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      backgroundColor: colors.background,
      fontFamily,
      color: colors.ink,
      padding: 15,
      fontSize: 16,
    },
    divider: { height: 1, backgroundColor: colors.line },
    positive: { fontFamily, color: colors.up },
    negative: { fontFamily, color: colors.down },
  });
}
const ui = createUi(darkColors);
type ThemeMode = "light" | "dark";
const ThemeContext = createContext({
  mode: "dark" as ThemeMode,
  colors: darkColors,
  ui,
  setMode: (_mode: ThemeMode) => {},
});
const THEME_KEY = "kite.mobile.theme.v1";
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, updateMode] = useState<ThemeMode>(
    Appearance.getColorScheme() === "light" ? "light" : "dark",
  );
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(THEME_KEY)
      .then((saved) => {
        if (active && (saved === "light" || saved === "dark"))
          updateMode(saved);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined")
      document.documentElement.setAttribute("data-kite-theme", mode);
  }, [mode]);
  const setMode = useCallback((next: ThemeMode) => {
    updateMode(next);
    void AsyncStorage.setItem(THEME_KEY, next).catch(() => {});
  }, []);
  const value = useMemo(() => {
    const colors = mode === "light" ? lightColors : darkColors;
    return { mode, colors, ui: createUi(colors), setMode };
  }, [mode, setMode]);
  // Waiting for local preferences avoids flashing the wrong appearance on launch.
  if (!loaded) return null;
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
export function useTheme() {
  return useContext(ThemeContext);
}

export function money(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function percentage(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value)
    ? "No change data"
    : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}
