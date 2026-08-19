import React from "react";
import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";

type IconName = keyof typeof Ionicons.glyphMap;

type IconButtonProps = {
  icon: IconName;
  onPress: () => void;
  size?: number;
  hitSlop?: number;
  padded?: boolean;
  circular?: boolean;
  disabled?: boolean;
};

export default function IconButton({
  icon,
  onPress,
  size = 18,
  hitSlop = 8,
  padded = false,
  circular = false,
  disabled = false,
}: IconButtonProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={() => {
        void haptics.tap();
        onPress();
      }}
      disabled={disabled}
      hitSlop={hitSlop}
      style={{
        padding: padded ? 4 : 0,
        width: circular ? 36 : undefined,
        height: circular ? 36 : undefined,
        borderRadius: circular ? 18 : undefined,
        alignItems: circular ? "center" : undefined,
        justifyContent: circular ? "center" : undefined,
        backgroundColor: circular ? theme.background : undefined,
        borderWidth: circular ? 1 : 0,
        borderColor: circular ? theme.border : undefined,
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <Ionicons name={icon} size={size} color={theme.textSecondary} />
    </Pressable>
  );
}
