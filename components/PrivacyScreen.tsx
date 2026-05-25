import React from "react";
import { Text, View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../contexts/ThemeContext";
import InfoSection from "./InfoSection";

export default function PrivacyScreen() {
  const { theme } = useTheme();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background }}
      edges={["bottom", "left", "right"]}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 16 }}
      >
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 24, fontWeight: "800", color: theme.text }}>
            Privacy & Data
          </Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            OnTrack stores your goals, tasks, and completion history locally on
            your device and syncs them to your account when cloud sync is
            enabled.
          </Text>
        </View>

        <InfoSection title="What the app stores">
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            Account profile details, goal titles, optional targets, task
            frequency settings, completion history, completed-goal status,
            freeze days, reminder preferences, and your theme preference.
          </Text>
        </InfoSection>

        <InfoSection title="What the app does">
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            OnTrack requires an account for cloud sync and backup. The app does
            not include advertising or sell your habit data.
          </Text>
        </InfoSection>

        <InfoSection title="Managing your data">
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            You can delete your account from Settings. That removes local app
            data, synced OnTrack data, and the Supabase Auth user tied to your
            email.
          </Text>
        </InfoSection>
      </ScrollView>
    </SafeAreaView>
  );
}
