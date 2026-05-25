import React from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";

type OnboardingChoiceScreenProps = {
  onExploreDemo: () => void;
  onStartFresh: () => void;
};

export default function OnboardingChoiceScreen({ onExploreDemo, onStartFresh }: OnboardingChoiceScreenProps) {
  const { theme } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flex: 1, padding: 24, justifyContent: "center", gap: 18 }}>
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            alignSelf: "center",
          }}
        >
          <Ionicons name="sparkles-outline" size={40} color={theme.primary} />
        </View>

        <View style={{ gap: 10 }}>
          <Text style={{ color: theme.text, fontSize: 28, fontWeight: "800", textAlign: "center" }}>
            How do you want to start?
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 16, lineHeight: 24, textAlign: "center" }}>
            You can explore OnTrack with sample goals first, or begin with a clean slate and add your own goals right away.
          </Text>
        </View>

        <Pressable
          onPress={onExploreDemo}
          style={{
            borderRadius: 18,
            padding: 18,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            gap: 8,
          }}
        >
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Explore demo goals</Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            Start with example goals and sample history so you can look around before creating your own routine.
          </Text>
        </Pressable>

        <Pressable
          onPress={onStartFresh}
          style={{
            borderRadius: 18,
            padding: 18,
            backgroundColor: theme.primary,
            gap: 8,
          }}
        >
          <Text style={{ color: theme.background, fontSize: 18, fontWeight: "700" }}>Start with my own goals</Text>
          <Text style={{ color: theme.background, lineHeight: 22, opacity: 0.9 }}>
            Clear any sample data and head into OnTrack ready to build your own setup from scratch.
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
