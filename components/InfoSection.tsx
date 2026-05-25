import React from "react";
import { Text, View } from "react-native";
import { useTheme } from "../contexts/ThemeContext";

type InfoSectionProps = {
  title: string;
  children: React.ReactNode;
};

export default function InfoSection({ title, children }: InfoSectionProps) {
  const { theme } = useTheme();

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 12,
        padding: 14,
        backgroundColor: theme.surface,
        gap: 8,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text }}>
        {title}
      </Text>
      {children}
    </View>
  );
}
