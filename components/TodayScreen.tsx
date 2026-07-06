import React from "react";
import { AppState, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { format } from "date-fns";
import { getTodayItems, useStore, TodayItem } from "../store";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";
import { TabParamList } from "../navigation";
import TrackingDateControls from "./TrackingDateControls";
import ProgressRing from "./ProgressRing";
import { AvatarStack } from "./Avatar";
import { card } from "./ui";
import { Task } from "../types";

type TodayProps = BottomTabScreenProps<TabParamList, "Today">;

const frequencyLabel = (task: Task): string => {
  if (task.frequency === "custom" && task.customFrequency) {
    return `${task.customFrequency.target} times per ${task.customFrequency.type}`;
  }
  return task.frequency;
};

export default function TodayScreen({ navigation }: TodayProps) {
  const goals = useStore((s) => s.goals);
  const sharedGoals = useStore((s) => s.sharedGoals);
  const selectedDate = useStore((s) => s.selectedDate);
  const setSelectedDate = useStore((s) => s.setSelectedDate);
  const isDayFrozen = useStore((s) => s.isDayFrozen);
  const toggleTaskCompletion = useStore((s) => s.toggleTaskCompletion);
  const toggleSharedTaskCompletion = useStore(
    (s) => s.toggleSharedTaskCompletion,
  );
  const { theme, isDark } = useTheme();

  // Reset to today on tab focus and app foreground (moved from old HomeScreen).
  useFocusEffect(
    React.useCallback(() => {
      setSelectedDate(new Date());
    }, [setSelectedDate]),
  );
  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        setSelectedDate(new Date());
      }
    });
    return () => subscription.remove();
  }, [setSelectedDate]);

  const frozen = isDayFrozen(selectedDate);

  const { todo, done, totals } = React.useMemo(
    () => getTodayItems(goals, sharedGoals, selectedDate, frozen),
    [goals, sharedGoals, selectedDate, frozen],
  );

  const dateKey = format(selectedDate, "yyyy-MM-dd");
  const hasCompletionsOnDate = React.useMemo(
    () =>
      [...goals, ...sharedGoals].some((goal) =>
        goal.tasks.some(
          (task) =>
            task.frequency !== "once" &&
            task.completions.some(
              (date) => format(date, "yyyy-MM-dd") === dateKey,
            ),
        ),
      ),
    [goals, sharedGoals, dateKey],
  );

  const toggleItem = (item: TodayItem, completing: boolean) => {
    void (completing ? haptics.success() : haptics.tap());
    if (item.isShared) {
      toggleSharedTaskCompletion(item.goal.id, item.task.id, selectedDate);
    } else {
      toggleTaskCompletion(item.goal.id, item.task.id, selectedDate);
    }
  };

  const renderRow = (item: TodayItem, isDone: boolean) => (
    <Pressable
      key={`${item.goal.id}:${item.task.id}`}
      onPress={() => toggleItem(item, !isDone)}
      style={{
        ...card(theme, isDark),
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 12,
        opacity: isDone ? 0.6 : 1,
      }}
    >
      <Ionicons
        name={isDone ? "checkmark-circle" : "ellipse-outline"}
        size={26}
        color={isDone ? theme.primary : theme.border}
      />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontWeight: "700",
            color: theme.text,
            textDecorationLine: isDone ? "line-through" : "none",
          }}
        >
          {item.task.title}
        </Text>
        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
          {item.goal.title} · {frequencyLabel(item.task)}
        </Text>
      </View>
      {item.isShared && item.goal.members && item.goal.members.length > 1 ? (
        <AvatarStack
          users={item.goal.members.map((member) => ({
            userId: member.userId,
            displayName: member.displayName,
          }))}
          size="sm"
          max={3}
        />
      ) : null}
    </Pressable>
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background }}
      edges={["top", "left", "right"]}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ fontSize: 34, fontWeight: "800", color: theme.text }}>
            Today
          </Text>
          <TrackingDateControls hasCompletions={hasCompletionsOnDate} />
        </View>

        {totals.total > 0 ? (
          <View
            style={{
              ...card(theme, isDark),
              flexDirection: "row",
              alignItems: "center",
              gap: 16,
              padding: 16,
            }}
          >
            <ProgressRing
              size={72}
              strokeWidth={8}
              percent={totals.done / totals.total}
            >
              <Text
                style={{ fontWeight: "800", fontSize: 15, color: theme.text }}
              >
                {totals.done}/{totals.total}
              </Text>
            </ProgressRing>
            <View style={{ flex: 1 }}>
              <Text
                style={{ fontSize: 18, fontWeight: "700", color: theme.text }}
              >
                {totals.done === totals.total ? "All done!" : "Keep it moving"}
              </Text>
              <Text style={{ color: theme.textSecondary, marginTop: 2 }}>
                {totals.done} of {totals.total} tasks across {totals.goalCount}{" "}
                goal{totals.goalCount === 1 ? "" : "s"}
              </Text>
            </View>
          </View>
        ) : !frozen ? (
          <View
            style={{
              ...card(theme, isDark),
              padding: 20,
              alignItems: "center",
              gap: 8,
            }}
          >
            <Text
              style={{ fontWeight: "700", fontSize: 16, color: theme.text }}
            >
              Nothing scheduled
            </Text>
            <Text style={{ color: theme.textSecondary, textAlign: "center" }}>
              No tasks are due on this day. Set up a goal to get started.
            </Text>
            <Pressable
              onPress={() => {
                void haptics.navigate();
                navigation.navigate("Goals");
              }}
              style={{
                marginTop: 4,
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 9999,
                backgroundColor: theme.primary,
              }}
            >
              <Text style={{ color: "#ffffff", fontWeight: "700" }}>
                Go to Goals
              </Text>
            </Pressable>
          </View>
        ) : null}

        {todo.length > 0 ? (
          <>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 8,
              }}
            >
              <Text
                style={{ fontSize: 18, fontWeight: "700", color: theme.text }}
              >
                To do
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                {todo.length} left
              </Text>
            </View>
            {todo.map((item) => renderRow(item, false))}
          </>
        ) : null}

        {done.length > 0 ? (
          <>
            <Text
              style={{
                marginTop: 8,
                fontSize: 12,
                fontWeight: "700",
                letterSpacing: 0.6,
                color: theme.textSecondary,
              }}
            >
              DONE ({done.length})
            </Text>
            {done.map((item) => renderRow(item, true))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
