import React from "react";
import { AppState, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { format } from "date-fns";
import Animated, {
  Easing,
  FadeInDown,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { getTodayItems, useStore, TodayItem } from "../store";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";
import { goalColor } from "../utils/goalColors";
import { mix } from "../utils/color";
import { shouldPlayEntrance } from "../utils/entrance";
import { TabParamList } from "../navigation";
import TrackingDateControls from "./TrackingDateControls";
import ProgressRing from "./ProgressRing";
import Confetti from "./Confetti";
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

  // Entrance rise-in plays once per session for this tab.
  const [entranceOn] = React.useState(() => shouldPlayEntrance("today"));
  const entering = (index: number) =>
    entranceOn ? FadeInDown.duration(550).delay(index * 70) : undefined;

  // All-done celebration: ring pop + confetti burst (mockup 1e).
  const [celebrateKey, setCelebrateKey] = React.useState(0);
  const ringScale = useSharedValue(1);
  const ringPopStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
  }));
  const celebrate = () => {
    setCelebrateKey((key) => key + 1);
    ringScale.value = withSequence(
      withTiming(1.16, { duration: 310, easing: Easing.out(Easing.quad) }),
      withTiming(0.95, { duration: 190 }),
      withTiming(1, { duration: 200 }),
    );
  };

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
  const allDone = totals.total > 0 && totals.done === totals.total;

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
    const completesDay = completing && todo.length === 1;
    if (completesDay) {
      void haptics.success();
      celebrate();
    } else {
      void (completing ? haptics.toggle() : haptics.tap());
    }
    if (item.isShared) {
      toggleSharedTaskCompletion(item.goal.id, item.task.id, selectedDate);
    } else {
      toggleTaskCompletion(item.goal.id, item.task.id, selectedDate);
    }
  };

  const renderRow = (item: TodayItem, isDone: boolean, index: number) => {
    const color = goalColor(item.goal.id);
    return (
      <Animated.View
        key={`${item.goal.id}:${item.task.id}`}
        entering={entering(index)}
      >
        <Pressable
          onPress={() => toggleItem(item, !isDone)}
          style={{
            ...card(theme, isDark),
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            padding: 12,
            paddingLeft: 18,
            opacity: isDone ? 0.62 : 1,
            overflow: "hidden",
          }}
        >
          {/* Goal colour edge (mockup 1b) */}
          <View
            style={{
              position: "absolute",
              left: 7,
              top: 12,
              bottom: 12,
              width: 3,
              borderRadius: 2,
              backgroundColor: color,
            }}
          />
          {isDone ? (
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: color,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="checkmark" size={16} color="#ffffff" />
            </View>
          ) : (
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                borderWidth: 2,
                borderColor: mix(color, 0.5, theme.surface),
              }}
            />
          )}
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontWeight: "700",
                fontSize: 14,
                color: theme.text,
                textDecorationLine: isDone ? "line-through" : "none",
              }}
            >
              {item.task.title}
            </Text>
            <Text
              style={{ color: theme.textSecondary, fontSize: 12, marginTop: 1 }}
            >
              <Text style={{ color, fontWeight: "600" }}>
                {item.goal.title}
              </Text>{" "}
              · {frequencyLabel(item.task)}
            </Text>
          </View>
          {item.isShared &&
          item.goal.members &&
          item.goal.members.length > 1 ? (
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
      </Animated.View>
    );
  };

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
          <Animated.View
            entering={entering(0)}
            style={{
              ...card(theme, isDark),
              flexDirection: "row",
              alignItems: "center",
              gap: 16,
              padding: 16,
            }}
          >
            <Animated.View style={ringPopStyle}>
              <ProgressRing
                size={72}
                strokeWidth={8}
                percent={totals.done / totals.total}
                trackColor={mix(theme.primary, 0.18, theme.background)}
              >
                <Text
                  style={{ fontWeight: "800", fontSize: 15, color: theme.text }}
                >
                  {totals.done}/{totals.total}
                </Text>
              </ProgressRing>
              {celebrateKey > 0 ? (
                <Confetti key={celebrateKey} size={72} />
              ) : null}
            </Animated.View>
            <View style={{ flex: 1 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Text
                  style={{ fontSize: 18, fontWeight: "700", color: theme.text }}
                >
                  {allDone ? "All done" : "Keep it moving"}
                </Text>
                {allDone ? (
                  <Animated.View
                    entering={ZoomIn.springify().delay(150)}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: theme.primary + "26",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="trophy" size={12} color={theme.primary} />
                  </Animated.View>
                ) : null}
              </View>
              <Text
                style={{
                  color: theme.textSecondary,
                  marginTop: 2,
                  fontSize: 14,
                }}
              >
                {allDone
                  ? "Every goal touched today — see you tomorrow"
                  : `${totals.done} of ${totals.total} tasks across ${totals.goalCount} goal${totals.goalCount === 1 ? "" : "s"}`}
              </Text>
            </View>
          </Animated.View>
        ) : !frozen ? (
          <Animated.View
            entering={entering(0)}
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
          </Animated.View>
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
            {todo.map((item, index) => renderRow(item, false, index + 1))}
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
            {done.map((item, index) =>
              renderRow(item, true, todo.length + index + 1),
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
