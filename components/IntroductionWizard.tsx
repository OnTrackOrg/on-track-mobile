import React from "react";
import { View, Text, Pressable, Image, ImageSourcePropType, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AppIntroSlider from "react-native-app-intro-slider";
import { useTheme } from "../contexts/ThemeContext";

type SlideImage = {
  source: ImageSourcePropType;
  aspectRatio: number;
  compact?: boolean;
};

type Slide = {
  key: string;
  title: string;
  text: string;
  icon: keyof typeof Ionicons.glyphMap;
  image?: SlideImage;
};

type IntroductionWizardProps = {
  onDone: () => void;
};

const slides: Slide[] = [
  {
    key: "welcome",
    title: "Welcome! Let’s get you On Track",
    text: "Set goals, log tasks, and watch your consistency build day by day.",
    icon: "rocket-outline",
  },
  {
    key: "goals",
    title: "Setting Goals",
    text: "Start with a few categories you care about, then add small tasks under each one.",
    icon: "flag-outline",
  },
  {
    key: "frequencies",
    title: "Tasks can repeat in different ways",
    text: "Daily, weekly, custom targets, and one-off tasks let each habit match real life.",
    icon: "repeat-outline",
  },
  {
    key: "radar-overview",
    title: "See progress at a glance",
    text: "The home chart gives you a quick read on how your goals are trending.",
    icon: "analytics-outline",
    image: {
      source: require("../assets/radar-chart-example.png"),
      aspectRatio: 955 / 911,
    },
  },
  {
    key: "consistency-entry",
    title: "Find consistency views",
    text: "Open a goal, then tap Consistency to view heatmaps and streaks for that goal.",
    icon: "map-outline",
    image: {
      source: require("../assets/consistency-page-button.png"),
      aspectRatio: 332 / 89,
      compact: true,
    },
  },
  {
    key: "heatmap-history",
    title: "Heatmaps fill in over time",
    text: "Each highlighted day reflects completed work, making your patterns easier to see.",
    icon: "calendar-outline",
    image: {
      source: require("../assets/heatmap-example-1.png"),
      aspectRatio: 912 / 611,
    },
  },
  {
    key: "heatmap-streaks",
    title: "Review your consistency",
    text: "Streaks and history help you spot momentum without digging through each task.",
    icon: "sparkles-outline",
    image: {
      source: require("../assets/heatmap-example-2.png"),
      aspectRatio: 903 / 614,
    },
  },
  {
    key: "start",
    title: "Choose how you want to begin",
    text: "At the end of onboarding, you can explore demo goals first or start fresh with your own goals right away.",
    icon: "checkmark-circle-outline",
  },
];

export default function IntroductionWizard({ onDone }: IntroductionWizardProps) {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();

  const renderImage = (image: SlideImage) => {
    const maxImageWidth = image.compact ? Math.min(width - 64, 300) : Math.min(width - 48, 360);
    const maxImageHeight = image.compact ? 110 : Math.min(height * 0.38, 320);
    const imageWidth = Math.min(maxImageWidth, maxImageHeight * image.aspectRatio);
    const imageHeight = imageWidth / image.aspectRatio;

    return (
      <View
        style={{
          width: imageWidth,
          height: imageHeight,
          borderRadius: image.compact ? 16 : 22,
          overflow: "hidden",
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: theme.border,
        }}
      >
        <Image
          source={image.source}
          resizeMode="cover"
          style={{
            width: "100%",
            height: "100%",
            borderRadius: image.compact ? 16 : 22,
          }}
        />
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <AppIntroSlider
        data={slides}
        onDone={onDone}
        renderItem={({ item }) => (
          <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 96, justifyContent: "center", alignItems: "center", gap: 24 }}>
            {item.image ? (
              renderImage(item.image)
            ) : (
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
            )}

            <View style={{ gap: 12, alignItems: "center", width: "100%", maxWidth: 360 }}>
              <Text style={{ color: theme.text, fontSize: 26, lineHeight: 32, fontWeight: "800", textAlign: "center" }}>{item.title}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 16, lineHeight: 23, textAlign: "center" }}>{item.text}</Text>
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
            <Text style={{ color: theme.background, fontWeight: "700" }}>Choose a starting point</Text>
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
