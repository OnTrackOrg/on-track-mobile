import React from "react";
import { AppState } from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { useStore } from "../store";
import { publishWidgetSnapshot } from "./widgets";
import { buildWidgetSnapshot } from "./widgetSnapshot";

/**
 * Keep the iOS widgets in step with the app: republish the snapshot whenever
 * goals, "Not Today" postponements or the accent theme change, and on every
 * return to the foreground (so a new calendar day is picked up). Waits for
 * the persisted store to hydrate so the widgets never flash empty.
 */
export const useWidgetSync = (enabled: boolean) => {
  const goals = useStore((s) => s.goals);
  const sharedGoals = useStore((s) => s.sharedGoals);
  const postponedTasks = useStore((s) => s.postponedTasks);
  const personalOrder = useStore((s) => s.personalOrder);
  const { theme } = useTheme();
  const [foregroundCount, setForegroundCount] = React.useState(0);

  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        setForegroundCount((count) => count + 1);
      }
    });
    return () => subscription.remove();
  }, []);

  React.useEffect(() => {
    if (!enabled) return;
    publishWidgetSnapshot(
      buildWidgetSnapshot({
        goals,
        sharedGoals,
        postponedTasks,
        accent: theme.primary,
        order: personalOrder,
      }),
    );
  }, [
    enabled,
    goals,
    sharedGoals,
    postponedTasks,
    personalOrder,
    theme.primary,
    foregroundCount,
  ]);
};
