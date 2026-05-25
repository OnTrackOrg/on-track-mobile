import React from "react";
import { Text, View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../contexts/ThemeContext";
import InfoSection from "./InfoSection";

export default function InstructionsScreen() {
  const { theme } = useTheme();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background }}
      edges={["bottom", "left", "right"]}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 28 }}
      >
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 24, fontWeight: "800", color: theme.text }}>
            How OnTrack Works
          </Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            OnTrack is built around goals and tasks. You create a goal, add
            tasks underneath it, and then track your progress over time with
            daily views, heatmaps, and radar summaries.
          </Text>
        </View>

        <InfoSection title="1. Build a goal from tasks">
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            A goal is the outcome you care about, like fitness, recovery, or
            learning. Tasks are the actions that support it.
          </Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            Example: a Fitness goal might include Daily water, Workout 3 times a
            week, and a 10k run once a month.
          </Text>
        </InfoSection>

        <InfoSection title="2. Pick the date you want to view">
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            The date card on the home screen controls the app’s current tracking
            day. Tap it to open the calendar, switch to a past day, and then
            mark tasks for that day.
          </Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            This is useful for backfilling missed check-ins or logging progress
            from before you installed the app.
          </Text>
        </InfoSection>

        <InfoSection title="3. Understand task frequencies">
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            Daily tasks can be completed once per day. Weekly tasks need one
            completion during the current Sunday-to-Saturday week. Custom tasks
            use calendar-based weekly or monthly targets, such as 3 times per
            week or once per month.
          </Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            Custom targets are minimums. If you complete a 3-times-per-week task
            4 times, OnTrack keeps the extra completion in your history.
          </Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            One-off tasks are different: they are single completions, so they
            appear separately from recurring consistency habits.
          </Text>
        </InfoSection>

        <InfoSection title="4. Read the heatmaps">
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            Heatmaps show when completions happened over time. More highlighted
            days means you showed up more consistently.
          </Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            Open a goal and tap See Consistency to view task-level heatmaps.
            Recurring tasks each get their own heatmap, while one-off tasks are
            grouped into a single combined heatmap at the bottom of the page.
          </Text>
        </InfoSection>

        <InfoSection title="5. Read the radar chart">
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            The radar chart on the home screen gives a high-level comparison
            across goals. Bigger values mean that goal has been completed more
            consistently relative to its task expectations.
          </Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            Current mode focuses on the selected week or period. All-time trend
            compares long-term consistency from the first recurring completion
            through the selected date.
          </Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            Completed goals leave the active radar and move to the Completed
            Goals page, where their consistency history stays available.
          </Text>
        </InfoSection>

        <InfoSection title="6. Freeze a day when life gets in the way">
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            On the date card, tap ❄️ Freeze This Day to pause tracking for that
            day. You must enter a reason, this keeps you accountable while
            protecting your streaks.
          </Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            Frozen days are shown with a snowflake on heatmaps and in the date
            card. They do not count toward your streak, but they also do not
            break it. Tap the frozen pill to unfreeze at any time.
          </Text>
        </InfoSection>

        <InfoSection title="7. Start with your own goals">
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            After onboarding and account setup, OnTrack starts empty. Add your
            own goals and tasks to build a consistency history that reflects
            your real routine.
          </Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
            If you ever want to clear your local history on this device and
            start over, open Settings and use Reset App Data.
          </Text>
        </InfoSection>
      </ScrollView>
    </SafeAreaView>
  );
}
