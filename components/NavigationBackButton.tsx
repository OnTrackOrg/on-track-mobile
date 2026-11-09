import React from "react";
import { TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { haptics } from "../utils/haptics";

type NavigationBackButtonProps = {
  onPress: () => void;
  tintColor?: string;
  accessibilityLabel?: string;
};

export default function NavigationBackButton({
  onPress,
  tintColor,
  accessibilityLabel = "Back",
}: NavigationBackButtonProps) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        void haptics.navigate();
        onPress();
      }}
      style={{ width: 44, height: 44, justifyContent: "center" }}
    >
      <Ionicons name="chevron-back" size={24} color={tintColor} />
    </TouchableOpacity>
  );
}
