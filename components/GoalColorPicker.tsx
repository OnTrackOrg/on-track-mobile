import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";
import { GOAL_PALETTE } from "../utils/goalColors";
import { card } from "./ui";

type GoalColorPickerProps = {
  visible: boolean;
  // The explicit pick (undefined = auto).
  selected?: string;
  // What "auto" resolves to, so the swatch previews it.
  autoColor: string;
  onSelect: (color: string | null) => void;
  onClose: () => void;
};

/** Palette grid behind "Change color". Null = back to the auto color. */
export default function GoalColorPicker({
  visible,
  selected,
  autoColor,
  onSelect,
  onClose,
}: GoalColorPickerProps) {
  const { theme, isDark } = useTheme();
  const current = selected?.toLowerCase();

  const pick = (color: string | null) => {
    void haptics.toggle();
    onSelect(color);
    onClose();
  };

  const swatch = (color: string, active: boolean, auto = false) => (
    <Pressable
      key={auto ? "auto" : color}
      accessibilityLabel={auto ? "Automatic color" : color}
      onPress={() => pick(auto ? null : color)}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 3,
        borderColor: active ? theme.text : "transparent",
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: color,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {auto ? (
          <Ionicons name="color-wand-outline" size={15} color="#ffffff" />
        ) : active ? (
          <Ionicons name="checkmark" size={16} color="#ffffff" />
        ) : null}
      </View>
    </Pressable>
  );

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          padding: 24,
          backgroundColor: "rgba(15, 23, 42, 0.35)",
        }}
      >
        <Pressable
          onPress={onClose}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
        />
        <View style={{ ...card(theme, isDark), padding: 16, gap: 12 }}>
          <Text style={{ fontWeight: "700", fontSize: 16, color: theme.text }}>
            Goal color
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {swatch(autoColor, current === undefined, true)}
            {GOAL_PALETTE.map((color) => swatch(color, current === color))}
          </View>
        </View>
      </View>
    </Modal>
  );
}
