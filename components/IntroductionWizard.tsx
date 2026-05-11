import React from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AppIntroSlider from "react-native-app-intro-slider";
import { useTheme } from "../contexts/ThemeContext";

type Slide = {
  key: string;
  title: string;
  text: string;
  icon: keyof typeof Ionicons.glyphMap;
};

type IntroductionWizardProps = {
  onDone: () => void;
};

const slides: Slide[] = [
  {
    key: "welcome",
    title: "Welcome! Let’s get you On Track",
    text: "This quick walkthrough will show you how goals, tasks, and consistency tracking work so you can start fresh with your own data.",
    icon: "rocket-outline",
  },
  {
    key: "goals",
    title: "Goals are the big picture",
    text: "Each goal is something you care about improving. Under each goal, add small repeatable tasks that actually move it forward.",
    icon: "flag-outline",
  },
  {
    key: "frequencies",
    title: "Tasks can repeat in different ways",
    text: "Daily, weekly, custom weekly or monthly targets, and one-off tasks all behave differently so the app matches real life habits.",
    icon: "repeat-outline",
  },
  {
    key: "consistency",
    title: "Consistency builds over time",
    text: "Your charts and consistency views will start empty, then fill in naturally as you log real completions for your own goals.",
    icon: "sparkles-outline",
  },
  {
    key: "start",
    title: "Start with a clean slate",
    text: "After the walkthrough and account setup, the app opens empty so you can add your own goals right away instead of clearing example data first.",
    icon: "checkmark-circle-outline",
  },
];

export default function IntroductionWizard({ onDone }: IntroductionWizardProps) {
  const { theme } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <AppIntroSlider
        data={slides}
        onDone={onDone}
        renderItem={({ item }) => (
          <View style={{ flex: 1, padding: 24, justifyContent: "center", alignItems: "center", gap: 24 }}>
            <View
              style={{
                width: 96,
                height: 96,
                borderRadius: 48,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Ionicons name={item.icon} size={42} color={theme.primary} />
            </View>

            <View style={{ gap: 12, alignItems: "center" }}>
              <Text style={{ color: theme.text, fontSize: 28, fontWeight: "800", textAlign: "center" }}>{item.title}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 16, lineHeight: 24, textAlign: "center" }}>{item.text}</Text>
            </View>
          </View>
        )}
        activeDotStyle={{ backgroundColor: theme.primary, width: 24 }}
        dotStyle={{ backgroundColor: theme.border }}
        renderNextButton={() => (
          <View style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
            <Text style={{ color: theme.primary, fontWeight: "700" }}>Next</Text>
          </View>
        )}
        renderDoneButton={() => (
          <Pressable
            onPress={onDone}
            style={{
              backgroundColor: theme.primary,
              borderRadius: 999,
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: theme.background, fontWeight: "700" }}>Open OnTrack</Text>
          </Pressable>
        )}
        showSkipButton
        renderSkipButton={() => (
          <View style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
            <Text style={{ color: theme.textSecondary, fontWeight: "600" }}>Skip</Text>
          </View>
        )}
        onSkip={onDone}
      />
    </SafeAreaView>
  );
}
