"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Moon, Sun } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ThemeMode = "light" | "dark";
interface ThemeContextValue {
  theme: ThemeMode;
  isReady: boolean;
  setTheme: (theme: ThemeMode) => void;
}
const STORAGE_KEY = "kite-theme";
const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  isReady: false,
  setTheme: () => {},
});

function normalizeTheme(value: string | null): ThemeMode | null {
  return value === "light" || value === "dark" ? value : null;
}
function storedTheme(): ThemeMode | null {
  try {
    return normalizeTheme(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}
function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Keep server and first client render identical; the head script sets first-paint colors.
  const [theme, setThemeState] = useState<ThemeMode>("dark");
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const next = storedTheme() ?? (media.matches ? "dark" : "light");
      applyTheme(next);
      setThemeState(next);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) sync();
    };
    sync();
    setIsReady(true);
    media.addEventListener("change", sync);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    applyTheme(next);
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Theme switching still works for this visit when device storage is blocked.
    }
  }, []);
  const value = useMemo(
    () => ({ theme, isReady, setTheme }),
    [theme, isReady, setTheme],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeToggle() {
  const { theme, isReady, setTheme } = useTheme();
  return (
    <ToggleGroup
      className="theme-toggle"
      aria-label="Color theme"
      value={isReady ? [theme] : []}
      disabled={!isReady}
      onValueChange={(values) => {
        const next = normalizeTheme(values[0] ?? null);
        if (next) setTheme(next);
      }}
    >
      <Toggle
        value="light"
        className="theme-option"
        aria-label="Light theme"
        title="Light theme"
      >
        <Sun size={15} aria-hidden="true" />
      </Toggle>
      <Toggle
        value="dark"
        className="theme-option"
        aria-label="Dark theme"
        title="Dark theme"
      >
        <Moon size={15} aria-hidden="true" />
      </Toggle>
    </ToggleGroup>
  );
}
