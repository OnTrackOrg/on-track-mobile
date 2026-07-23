import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "../lib/persistence";
import { mix } from "../utils/color";

export interface ThemeColors {
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  primary: string;
  success: string;
  warning: string;
  danger: string;
  streak: string;
  completedBackground: string;
  completedBorder: string;
  completionCard: string;
  completionCardBorder: string;
}

// Accent themes from the redesign mockups (Settings > Appearance).
export interface ThemeOption {
  id: string;
  name: string;
  accent: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { id: "ocean", name: "Ocean", accent: "#3b82f6" },
  { id: "tide", name: "Tidepool", accent: "#0d9488" },
  { id: "forest", name: "Forest", accent: "#059669" },
  { id: "honey", name: "Honey", accent: "#d97706" },
  { id: "sunset", name: "Sunset", accent: "#f43f5e" },
  { id: "rose", name: "Rose", accent: "#ec4899" },
  { id: "lavender", name: "Lavender", accent: "#8b5cf6" },
  { id: "graphite", name: "Graphite", accent: "#475569" },
];

const DEFAULT_THEME_ID = "ocean";

// The whole palette is tinted toward the accent, mirroring the mockups'
// color-mix() derivations. 6-digit hex only: call sites build #rrggbbaa via
// `theme.success + "55"`.
const buildTheme = (accent: string, isDark: boolean): ThemeColors =>
  isDark
    ? {
        background: mix(accent, 0.09, "#0c1017"),
        surface: mix(accent, 0.06, "#171d28"),
        text: "#f5f7fa",
        textSecondary: "#9aa4b5",
        border: mix(accent, 0.12, "#2a3140"),
        primary: accent,
        success: "#2cd756",
        warning: "#f59e0b",
        danger: "#ef4444",
        streak: "#fb923c",
        completedBackground: mix(accent, 0.08, "#222a38"),
        completedBorder: mix(accent, 0.12, "#3a4354"),
        completionCard: mix(accent, 0.09, "#0c1017"),
        completionCardBorder: mix(accent, 0.12, "#2a3140"),
      }
    : {
        background: mix(accent, 0.06, "#f4f5f8"),
        surface: mix(accent, 0.02, "#ffffff"),
        text: "#111827",
        textSecondary: "#6b7280",
        border: mix(accent, 0.08, "#e5e7eb"),
        primary: accent,
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
        streak: "#f97316",
        completedBackground: mix(accent, 0.02, "#f9fafb"),
        completedBorder: mix(accent, 0.06, "#d1d5db"),
        completionCard: "#f0fdf4",
        completionCardBorder: "#bbf7d0",
      };

interface ThemeContextType {
  theme: ThemeColors;
  isDark: boolean;
  themeId: string;
  setThemeId: (id: string) => void;
  toggleTheme: () => void;
  resetThemePreference: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isDark, setIsDark] = useState(false);
  const [themeId, setThemeIdState] = useState(DEFAULT_THEME_ID);

  useEffect(() => {
    // Load theme preference from storage
    const loadTheme = async () => {
      try {
        const savedTheme =
          (await AsyncStorage.getItem(STORAGE_KEYS.themePreference)) ??
          (await AsyncStorage.getItem(STORAGE_KEYS.legacyThemePreference));
        if (savedTheme) {
          setIsDark(savedTheme === "dark");
        }
        const savedAccent = await AsyncStorage.getItem(
          STORAGE_KEYS.accentTheme,
        );
        if (
          savedAccent &&
          THEME_OPTIONS.some((option) => option.id === savedAccent)
        ) {
          setThemeIdState(savedAccent);
        }
      } catch (error) {
        console.log("Error loading theme:", error);
      }
    };
    loadTheme();
  }, []);

  const toggleTheme = async () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.themePreference,
        newIsDark ? "dark" : "light",
      );
      await AsyncStorage.removeItem(STORAGE_KEYS.legacyThemePreference);
    } catch (error) {
      console.log("Error saving theme:", error);
    }
  };

  const setThemeId = async (id: string) => {
    if (!THEME_OPTIONS.some((option) => option.id === id)) return;
    setThemeIdState(id);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.accentTheme, id);
    } catch (error) {
      console.log("Error saving theme:", error);
    }
  };

  const resetThemePreference = async () => {
    setIsDark(false);
    setThemeIdState(DEFAULT_THEME_ID);
    try {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.themePreference,
        STORAGE_KEYS.legacyThemePreference,
        STORAGE_KEYS.accentTheme,
      ]);
    } catch (error) {
      console.log("Error resetting theme:", error);
    }
  };

  const accent =
    THEME_OPTIONS.find((option) => option.id === themeId)?.accent ??
    THEME_OPTIONS[0].accent;
  const theme = React.useMemo(
    () => buildTheme(accent, isDark),
    [accent, isDark],
  );

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark,
        themeId,
        setThemeId,
        toggleTheme,
        resetThemePreference,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
