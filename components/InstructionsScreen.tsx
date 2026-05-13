import React from "react";
import { Text, View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../contexts/ThemeContext";

const sectionStyle = {
  borderWidth: 1,
  borderRadius: 12,
  padding: 14,
  gap: 8,
} as const;

export default function InstructionsScreen() {
  const { theme } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={["bottom", "left", "right"]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 28 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 24, fontWeight: "800", color: theme.text }}>How OnTrack Works</Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            OnTrack is built around goals and tasks. You create a goal, add tasks underneath it, and then track your progress over time with daily views, heatmaps, and radar summaries.
          </Text>
        </View>

        <View style={{ ...sectionStyle, borderColor: theme.border, backgroundColor: theme.surface }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text }}>1. Build a goal from tasks</Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            A goal is the outcome you care about, like fitness, recovery, or learning. Tasks are the actions that support it.
          </Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            Example: a Fitness goal might include Daily water, Workout 3 times a week, and a 10k run once a month.
          </Text>
        </View>

        <View style={{ ...sectionStyle, borderColor: theme.border, backgroundColor: theme.surface }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text }}>2. Pick the date you want to view</Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            The date card on the home screen controls the app’s current tracking day. Tap it to open the calendar, switch to a past day, and then mark tasks for that day.
          </Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            This is useful for backfilling missed check-ins or logging progress from before you installed the app.
          </Text>
        </View>

        <View style={{ ...sectionStyle, borderColor: theme.border, backgroundColor: theme.surface }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text }}>3. Understand task frequencies</Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            Daily tasks can be completed once per day. Weekly tasks need one completion during the current Sunday-to-Saturday week. Custom tasks use calendar-based weekly or monthly targets, such as 3 times per week or once per month.
          </Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            One-off tasks are different: they are single completions, so they appear separately from recurring consistency habits.
          </Text>
        </View>

        <View style={{ ...sectionStyle, borderColor: theme.border, backgroundColor: theme.surface }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text }}>4. Read the heatmaps</Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            Heatmaps show when completions happened over time. More highlighted days means you showed up more consistently.
          </Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            Open a goal and tap See Consistency to view task-level heatmaps. Recurring tasks each get their own heatmap, while one-off tasks are grouped into a single combined heatmap at the bottom of the page.
          </Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            You can also save a short local note for the selected day to explain a blank or unusual day without creating a fake completion.
          </Text>
        </View>

        <View style={{ ...sectionStyle, borderColor: theme.border, backgroundColor: theme.surface }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text }}>5. Read the radar chart</Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            The radar chart on the home screen gives a high-level comparison across goals. Bigger values mean that goal has been completed more consistently relative to its task expectations.
          </Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            It is useful for spotting which areas of your life are strong and which goals are falling behind.
          </Text>
        </View>

        <View style={{ ...sectionStyle, borderColor: theme.border, backgroundColor: theme.surface }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text }}>6. Start with your own goals</Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            After onboarding and account setup, OnTrack starts empty. Add your own goals and tasks to build a consistency history that reflects your real routine.
          </Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            If you ever want to clear your local history on this device and start over, open Settings and use Reset App Data.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
