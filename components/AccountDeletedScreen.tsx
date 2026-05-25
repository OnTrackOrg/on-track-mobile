import React from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../contexts/ThemeContext";

export default function AccountDeletedScreen() {
  const { theme } = useTheme();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background }}
      edges={["bottom", "left", "right"]}
    >
      <View
        style={{
          flex: 1,
          padding: 24,
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <Text style={{ fontSize: 28, textAlign: "center" }}>🙁</Text>
        <Text
          style={{
            fontSize: 24,
            fontWeight: "800",
            color: theme.text,
            textAlign: "center",
          }}
        >
          Account deletion was successful.
        </Text>
        <Text
          style={{
            fontSize: 18,
            fontWeight: "600",
            color: theme.text,
            textAlign: "center",
          }}
        >
          You are now Off Track.
        </Text>
        <Text
          style={{
            color: theme.textSecondary,
            textAlign: "center",
            lineHeight: 22,
          }}
        >
          You can close the app whenever you’re ready. The next time you open
          it, you’ll start again from the intro slides and account setup.
        </Text>
      </View>
    </SafeAreaView>
  );
}
