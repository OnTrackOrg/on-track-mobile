import React from "react";
import { Text, View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../contexts/ThemeContext";

export default function PrivacyScreen() {
  const { theme } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={["bottom", "left", "right"]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 24, fontWeight: "800", color: theme.text }}>Privacy & Data</Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            OnTrack stores your goals, tasks, and completion history locally on your device so the app can work offline.
          </Text>
        </View>

        <View style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 14, backgroundColor: theme.surface, gap: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text }}>What the app stores</Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            Goal titles, optional targets, task frequency settings, completion history, optional local day notes, and your theme preference.
          </Text>
        </View>

        <View style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 14, backgroundColor: theme.surface, gap: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text }}>What the app does not do</Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            OnTrack does not require an account, does not include advertising, and does not send your goal data to a server from this app build.
          </Text>
        </View>

        <View style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 14, backgroundColor: theme.surface, gap: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text }}>Managing your data</Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            You can remove the data stored by the app at any time from Settings by using Reset App Data.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
