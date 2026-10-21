import React from "react";
import {
  Alert,
  AppState,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
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
import ReanimatedSwipeable, {
  SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import {
  canPostponeTask,
  getDosesOnDate,
  getTaskPeriodProgress,
  getTaskTimesPerDay,
  getTaskWeekdays,
  getTodayItems,
  useStore,
  TodayItem,
} from "../store";
import {
  describeTaskSchedule,
  formatClock,
  timeToMinutes,
} from "../lib/taskSchedule";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";
import { getGoalColor } from "../utils/goalColors";
import { mix, withAlpha } from "../utils/color";
import { shouldPlayEntrance } from "../utils/entrance";
import TrackingDateControls from "./TrackingDateControls";
import ProgressRing from "./ProgressRing";
import { TourAnchor } from "./tour/TourAnchor";
import Confetti from "./Confetti";
import { card } from "./ui";
import DoseRing from "./DoseRing";
import { Task } from "../types";

// Pips beside the title stop at this many doses; the ring still shows all.
const MAX_PIPS = 8;

/** The task's next reminder on `date` that is still ahead, if any. */
const nextReminder = (task: Task, date: Date): string | undefined => {
  const now = new Date();
  return task.reminders?.find((at) => {
    const fireAt = new Date(date);
    fireAt.setHours(0, timeToMinutes(at), 0, 0);
    return fireAt > now;
  });
};

const postponeBlockReason = (task: Task): string => {
  if (task.frequency === "daily") {
    return "Daily tasks are due every day — skipping one breaks the goal.";
  }
  if (getTaskWeekdays(task)) {
    return "This task is scheduled for specific days — it's due today.";
  }
  if (task.frequency === "once") {
    return "The goal is due today — this one-off can't be pushed past it.";
  }
  return "There aren't enough days left in this period to make it up. Skipping today would fail the goal.";
};

type TaskRowProps = {
  item: TodayItem;
  isDone: boolean;
  date: Date;
  entering?: ReturnType<typeof FadeInDown.duration>;
  isTourTask?: boolean;
  swipeable: boolean;
  postponeAllowed: boolean;
  onToggle: () => void;
  onUndoDose: () => void;
  onPostpone: () => void;
};

function TaskRow({
  item,
  isDone,
  date,
  entering,
  isTourTask,
  swipeable,
  postponeAllowed,
  onToggle,
  onUndoDose,
  onPostpone,
}: TaskRowProps) {
  const { theme, isDark } = useTheme();
  const swipeRef = React.useRef<SwipeableMethods>(null);
  const color = getGoalColor(item.goal);
  // Per-week / per-month tasks: once the target is met on other days the
  // row stays in Done but its check becomes a "+" — tap to log one more.
  const period = getTaskPeriodProgress(item.task, date);
  const canLogExtra = isDone && period !== null && !period.doneOnDate;
  const beyondTarget = period !== null && period.completed > period.target;
  // Multi-dose tasks stay in To do until their last dose (mockup 1e).
  const perDay = getTaskTimesPerDay(item.task);
  const logged = Math.min(getDosesOnDate(item.task, date), perDay);
  const isPartial = !isDone && perDay > 1;
  const reminderAt = isDone ? undefined : nextReminder(item.task, date);
  const subtitle = isPartial
    ? `${logged}/${perDay} today`
    : describeTaskSchedule(item.task);

  const handleSwipeOpen = () => {
    if (!postponeAllowed) {
      void haptics.tap();
      swipeRef.current?.close();
      Alert.alert("Needed today", postponeBlockReason(item.task));
      return;
    }
    void haptics.toggle();
    onPostpone();
  };

  const row = (
    <Pressable
      onPress={onToggle}
      // Take back one dose of a partly logged day.
      onLongPress={isPartial && logged > 0 ? onUndoDose : undefined}
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
          <Ionicons
            name={canLogExtra ? "add" : "checkmark"}
            size={canLogExtra ? 18 : 16}
            color="#ffffff"
          />
        </View>
      ) : isPartial ? (
        <DoseRing
          total={perDay}
          logged={logged}
          color={color}
          trackColor={mix(color, 0.5, theme.surface)}
        />
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
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              fontWeight: "700",
              fontSize: 14,
              color: theme.text,
              textDecorationLine: isDone ? "line-through" : "none",
            }}
          >
            {item.task.title}
          </Text>
          {isPartial && perDay <= MAX_PIPS ? (
            <View style={{ flexDirection: "row", gap: 3 }}>
              {Array.from({ length: perDay }, (_, i) => (
                <View
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor:
                      i < logged ? color : mix(color, 0.3, theme.surface),
                  }}
                />
              ))}
            </View>
          ) : null}
        </View>
        <Text
          style={{ color: theme.textSecondary, fontSize: 12, marginTop: 1 }}
        >
          <Text style={{ color, fontWeight: "600" }}>{item.goal.title}</Text> ·{" "}
          {period && !isPartial ? (
            <>
              <Text
                style={
                  beyondTarget
                    ? { color: theme.streak, fontWeight: "700" }
                    : undefined
                }
              >
                {period.completed}/{period.target}
              </Text>
              {` this ${period.period}`}
            </>
          ) : (
            subtitle
          )}
        </Text>
      </View>
      {reminderAt ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 9999,
            backgroundColor: withAlpha(theme.primary, 0.12),
          }}
        >
          <Ionicons name="notifications" size={11} color={theme.primary} />
          <Text
            style={{
              color: theme.primary,
              fontWeight: "700",
              fontSize: 12,
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatClock(reminderAt)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );

  const body = swipeable ? (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={2}
      rightThreshold={64}
      overshootRight={false}
      onSwipeableWillOpen={handleSwipeOpen}
      renderRightActions={() => (
        <View
          style={{
            justifyContent: "center",
            alignItems: "flex-end",
            paddingLeft: 12,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 9999,
              backgroundColor: postponeAllowed
                ? withAlpha(theme.primary, 0.16)
                : withAlpha(theme.textSecondary, 0.14),
            }}
          >
            <Ionicons
              name={postponeAllowed ? "moon" : "lock-closed"}
              size={14}
              color={postponeAllowed ? theme.primary : theme.textSecondary}
            />
            <Text
              style={{
                fontWeight: "700",
                fontSize: 13,
                color: postponeAllowed ? theme.primary : theme.textSecondary,
              }}
            >
              {postponeAllowed ? "Not today" : "Needed today"}
            </Text>
          </View>
        </View>
      )}
    >
      {row}
    </ReanimatedSwipeable>
  ) : (
    row
  );

  return (
    <Animated.View entering={entering}>
      {isTourTask ? (
        // The tour spotlights the first to-do row when one exists.
        <TourAnchor anchorKey="today-task">{body}</TourAnchor>
      ) : (
        body
      )}
    </Animated.View>
  );
}

export default function TodayScreen() {
  const goals = useStore((s) => s.goals);
  const selectedDate = useStore((s) => s.selectedDate);
  const setSelectedDate = useStore((s) => s.setSelectedDate);
  const postponedTasks = useStore((s) => s.postponedTasks);
  // Today follows the user's own goal + task order (set on Goals / goal page).
  const personalOrder = useStore((s) => s.personalOrder);
  const postponeTask = useStore((s) => s.postponeTask);
  const undoPostponeTask = useStore((s) => s.undoPostponeTask);
  const toggleTaskCompletion = useStore((s) => s.toggleTaskCompletion);
  const removeTaskDose = useStore((s) => s.removeTaskDose);
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

  const dateKey = format(selectedDate, "yyyy-MM-dd");
  const postponedTaskIds = React.useMemo(
    () => new Set(postponedTasks[dateKey] ?? []),
    [postponedTasks, dateKey],
  );

  const { todo, done, postponed, totals } = React.useMemo(
    () => getTodayItems(goals, selectedDate, postponedTaskIds, personalOrder),
    [goals, selectedDate, postponedTaskIds, personalOrder],
  );
  const allDone = totals.total > 0 && totals.done === totals.total;
  // "Not today" only makes sense on the actual current day.
  const isViewingToday = dateKey === format(new Date(), "yyyy-MM-dd");

  const hasCompletionsOnDate = React.useMemo(
    () =>
      goals.some((goal) =>
        goal.tasks.some(
          (task) =>
            task.frequency !== "once" &&
            task.completions.some(
              (date) => format(date, "yyyy-MM-dd") === dateKey,
            ),
        ),
      ),
    [goals, dateKey],
  );

  const toggleItem = (item: TodayItem, completing: boolean) => {
    // A multi-dose row only leaves To do on its last dose.
    const finishesTask =
      completing &&
      getDosesOnDate(item.task, selectedDate) + 1 >=
        getTaskTimesPerDay(item.task);
    const completesDay = finishesTask && todo.length === 1;
    const period = getTaskPeriodProgress(item.task, selectedDate);
    // A Done row whose target was met on other days logs an extra for this
    // day instead of un-checking anything.
    const loggingExtra = !completing && period !== null && !period.doneOnDate;
    if (completesDay) {
      // Rising haptic burst timed with the confetti.
      void haptics.celebrate();
      celebrate();
    } else if (loggingExtra) {
      void haptics.success();
    } else {
      // Completing lands harder than un-checking.
      void (completing ? haptics.press() : haptics.tap());
    }
    toggleTaskCompletion(item.goal.id, item.task.id, selectedDate);
  };

  const undoDose = (item: TodayItem) => {
    void haptics.tap();
    removeTaskDose(item.goal.id, item.task.id, selectedDate);
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
          <TourAnchor anchorKey="today-summary">
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
                    style={{
                      fontWeight: "800",
                      fontSize: 15,
                      color: theme.text,
                    }}
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
                    style={{
                      fontSize: 18,
                      fontWeight: "700",
                      color: theme.text,
                    }}
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
                {allDone ? (
                  <Text
                    style={{
                      color: theme.textSecondary,
                      marginTop: 2,
                      fontSize: 14,
                    }}
                  >
                    Every goal touched today — see you tomorrow
                  </Text>
                ) : null}
              </View>
            </Animated.View>
          </TourAnchor>
        ) : (
          <TourAnchor anchorKey="today-summary">
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
                {postponed.length > 0 ? "Day cleared" : "Nothing scheduled"}
              </Text>
              {postponed.length > 0 ? (
                <Text
                  style={{ color: theme.textSecondary, textAlign: "center" }}
                >
                  Everything left was pushed off to another day.
                </Text>
              ) : null}
            </Animated.View>
          </TourAnchor>
        )}

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
            {todo.map((item, index) => (
              <TaskRow
                key={`${item.goal.id}:${item.task.id}`}
                item={item}
                isDone={false}
                entering={entering(index + 1)}
                isTourTask={index === 0}
                swipeable={isViewingToday}
                postponeAllowed={canPostponeTask(
                  item.goal,
                  item.task,
                  selectedDate,
                )}
                date={selectedDate}
                onToggle={() => toggleItem(item, true)}
                onUndoDose={() => undoDose(item)}
                onPostpone={() => postponeTask(item.task.id, selectedDate)}
              />
            ))}
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
            {done.map((item, index) => (
              <TaskRow
                key={`${item.goal.id}:${item.task.id}`}
                item={item}
                isDone
                date={selectedDate}
                entering={entering(todo.length + index + 1)}
                swipeable={false}
                postponeAllowed={false}
                onToggle={() => toggleItem(item, false)}
                onUndoDose={() => {}}
                onPostpone={() => {}}
              />
            ))}
          </>
        ) : null}

        {postponed.length > 0 ? (
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
              NOT TODAY ({postponed.length})
            </Text>
            {postponed.map((item) => (
              <Pressable
                key={`${item.goal.id}:${item.task.id}`}
                onPress={() => {
                  void haptics.tap();
                  undoPostponeTask(item.task.id, selectedDate);
                }}
                style={{
                  ...card(theme, isDark),
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  paddingLeft: 18,
                  opacity: 0.55,
                }}
              >
                <Ionicons name="moon" size={18} color={theme.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontWeight: "700",
                      fontSize: 14,
                      color: theme.text,
                    }}
                  >
                    {item.task.title}
                  </Text>
                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontSize: 12,
                      marginTop: 1,
                    }}
                  >
                    {item.goal.title} · tap to bring back
                  </Text>
                </View>
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
