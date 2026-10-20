import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";
import { withAlpha } from "../utils/color";

type IconName = keyof typeof Ionicons.glyphMap;

export type OptionPairOption<T extends string> = {
  value: T;
  label: string;
  icon?: IconName;
};

type OptionPairProps<T extends string> = {
  options: readonly OptionPairOption<T>[];
  value: T;
  /**
   * Fires on every press, selected or not, so a caller can reopen a picker
   * behind an already-selected option. `wasSelected` tells the two apart.
   */
  onSelect: (value: T, wasSelected: boolean) => void;
};

/**
 * Side-by-side choice buttons (Private / Public, Today / On a date). The
 * selected one is tinted in the accent; the rest sit on the surface.
 */
export default function OptionPair<T extends string>({
  options,
  value,
  onSelect,
}: OptionPairProps<T>) {
  const { theme } = useTheme();

  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              void (active ? haptics.tap() : haptics.toggle());
              onSelect(option.value, active);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              paddingVertical: 10,
              paddingHorizontal: 8,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: active ? theme.primary : theme.border,
              backgroundColor: active
                ? withAlpha(theme.primary, 0.12)
                : theme.surface,
            }}
          >
            {option.icon ? (
              <Ionicons
                name={option.icon}
                size={14}
                color={active ? theme.primary : theme.textSecondary}
              />
            ) : null}
            <Text
              numberOfLines={1}
              style={{
                fontWeight: "700",
                fontSize: 13,
                color: active ? theme.primary : theme.textSecondary,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
