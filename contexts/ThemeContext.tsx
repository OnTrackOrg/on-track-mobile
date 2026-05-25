import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "../lib/persistence";

interface ThemeColors {
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  primary: string;
  success: string;
  warning: string;
  danger: string;
  completedBackground: string;
  completedBorder: string;
  completionCard: string;
  completionCardBorder: string;
}

const lightTheme: ThemeColors = {
  background: "#ffffff",
  surface: "#ffffff",
  text: "#111827",
  textSecondary: "#6b7280",
  border: "#e5e7eb",
  primary: "#3b82f6",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  completedBackground: "#f9fafb",
  completedBorder: "#d1d5db",
  completionCard: "#f0fdf4",
  completionCardBorder: "#bbf7d0",
};

const darkTheme: ThemeColors = {
  background: "#0f172a",
  surface: "#1e293b",
  text: "#f8fafc",
  textSecondary: "#94a3b8",
  border: "#334155",
  primary: "#3b82f6",
  success: "#2cd756ff",
  warning: "#f59e0b",
  danger: "#ef4444",
  completedBackground: "#334155",
  completedBorder: "#475569",
  completionCard: "#0f172a",
  completionCardBorder: "#334155",
};

interface ThemeContextType {
  theme: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
  resetThemePreference: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isDark, setIsDark] = useState(false);

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

  const resetThemePreference = async () => {
    setIsDark(false);
    try {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.themePreference,
        STORAGE_KEYS.legacyThemePreference,
      ]);
    } catch (error) {
      console.log("Error resetting theme:", error);
    }
  };

  const theme = isDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider
      value={{ theme, isDark, toggleTheme, resetThemePreference }}
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
