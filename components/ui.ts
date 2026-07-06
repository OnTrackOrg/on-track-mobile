import { ViewStyle } from "react-native";
import { ThemeColors } from "../contexts/ThemeContext";

// The turn-3 mockups float white rounded cards on a soft gray canvas with a
// faint shadow instead of hard 1px borders. Shadows vanish on dark surfaces,
// so dark mode keeps a hairline border instead.
export const card = (theme: ThemeColors, isDark: boolean): ViewStyle => ({
  backgroundColor: theme.surface,
  borderRadius: 16,
  padding: 14,
  ...(isDark
    ? { borderWidth: 1, borderColor: theme.border }
    : {
        shadowColor: "#0f172a",
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      }),
});

// Small circular icon button (the date chevrons and gear in the mockups).
export const circleButton = (
  theme: ThemeColors,
  isDark: boolean,
  size = 40,
): ViewStyle => ({
  width: size,
  height: size,
  borderRadius: size / 2,
  alignItems: "center",
  justifyContent: "center",
  ...card(theme, isDark),
  padding: 0,
});
