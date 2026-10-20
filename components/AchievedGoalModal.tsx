import React from "react";
import { Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { useStore } from "../store";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";
import { getGoalColor } from "../utils/goalColors";
import { withAlpha } from "../utils/color";
import { ratioHeatmapValues } from "../lib/heatmapValues";
import { describeTaskSchedule } from "../lib/taskSchedule";
import {
  activeDays,
  getAchievedWindow,
  longestDailyStreak,
  taskCompletionCounts,
  totalCompletions,
  weeklyCompletionCounts,
} from "../lib/achievedStats";
import Heatmap from "./Heatmap";
import IconButton from "./IconButton";
import { card } from "./ui";

const dayKeyToDate = (key: string): Date => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
};

/**
 * The compressed, read-only view of an achieved goal: its heat map plus the
 * few numbers its history actually supports. Every block renders only when
 * it has data; the ⋯ menu holds the rare actions (move back, delete, leave).
 */
export default function AchievedGoalModal({
  goalId,
  onClose,
}: {
  goalId: string | null;
  onClose: () => void;
}) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  // The last goal shown stays rendered while the sheet slides away.
  const [shownGoalId, setShownGoalId] = React.useState<string | null>(goalId);
  React.useEffect(() => {
    if (goalId !== null) setShownGoalId(goalId);
  }, [goalId]);
  const resolvedId = goalId ?? shownGoalId;

  const goal = useStore((s) => s.goals.find((g) => g.id === resolvedId));
  const reactivateGoal = useStore((s) => s.reactivateGoal);
  const deleteGoal = useStore((s) => s.deleteGoal);
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const stats = React.useMemo(() => {
    if (!goal) return null;
    const window = getAchievedWindow(goal);
    if (!window) return null;
    return {
      window,
      endDate: dayKeyToDate(window.endDay),
      heatmapValues: ratioHeatmapValues(goal.tasks),
      recurringTaskCount: goal.tasks.filter((t) => t.frequency !== "once")
        .length,
      completions: totalCompletions(goal, window),
      days: activeDays(goal, window),
      streak: longestDailyStreak(goal, window),
      weeks: weeklyCompletionCounts(goal, window),
      taskCounts: taskCompletionCounts(goal, window),
    };
  }, [goal]);

  const visible = goalId !== null && goal !== undefined && stats !== null;

  const close = () => {
    setIsMenuOpen(false);
    onClose();
  };

  const confirmReactivateGoal = () => {
    if (!goal) return;
    void haptics.warning();
    Alert.alert(
      "Move back to active goals?",
      `"${goal.title}" will show up with your active goals again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Move back",
          onPress: () => {
            reactivateGoal(goal.id);
            void haptics.success();
            close();
          },
        },
      ],
    );
  };

  const confirmDeleteGoal = () => {
    if (!goal) return;
    void haptics.warning();
    Alert.alert(
      "Delete goal?",
      `This permanently removes "${goal.title}", its tasks, and its history.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void haptics.destructive();
            deleteGoal(goal.id);
            close();
          },
        },
      ],
    );
  };

  const renderMenuItem = (
    icon: React.ReactNode,
    label: string,
    onPress: () => void,
    danger = false,
  ) => (
    <Pressable
      key={label}
      onPress={() => {
        setIsMenuOpen(false);
        onPress();
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      {icon}
      <Text
        style={{
          color: danger ? theme.danger : theme.text,
          fontWeight: "600",
          fontSize: 14,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );

  const captionStyle = {
    fontSize: 11,
    fontWeight: "600" as const,
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
    color: theme.textSecondary,
  };

  const renderChip = (label: string, value: number) => (
    <View key={label} style={{ ...card(theme, isDark), flex: 1, gap: 2 }}>
      <Text style={{ fontSize: 18, fontWeight: "800", color: theme.text }}>
        {value}
      </Text>
      <Text style={captionStyle}>{label}</Text>
    </View>
  );

  const renderBody = () => {
    if (!goal || !stats) return null;
    const color = getGoalColor(goal);
    const { window } = stats;
    const chips = [
      stats.completions > 0
        ? renderChip("Completions", stats.completions)
        : null,
      stats.days > 0 ? renderChip("Active days", stats.days) : null,
      stats.streak > 0 ? renderChip("Best streak", stats.streak) : null,
    ].filter(Boolean);
    const maxWeek = stats.weeks.reduce((best, w) => Math.max(best, w.count), 0);
    // Gate on the charted weeks themselves: completions backfilled before the
    // first week count toward the totals but never land in a bar.
    const showWeeks = stats.weeks.length >= 3 && maxWeek > 0;
    const subtitle = [
      `Achieved ${format(stats.endDate, "MMM d, yyyy")}`,
      window.days > 1
        ? `${format(dayKeyToDate(window.startDay), "MMM d")} → ${format(
            stats.endDate,
            "MMM d",
          )} · ${window.days} days`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return (
      <>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginBottom: 6,
          }}
        >
          <Text
            numberOfLines={2}
            style={{
              flex: 1,
              fontSize: 20,
              fontWeight: "800",
              color: theme.text,
            }}
          >
            {goal.title}
          </Text>
          <IconButton
            icon="ellipsis-horizontal"
            circular
            onPress={() => setIsMenuOpen(true)}
          />
          <IconButton icon="close" circular onPress={close} />
        </View>
        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
          {subtitle}
        </Text>
        {goal.target ? (
          <Text
            style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}
          >
            {goal.target}
          </Text>
        ) : null}

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingTop: 16 }}
        >
          {Object.keys(stats.heatmapValues).length > 0 ? (
            <View style={{ ...card(theme, isDark), gap: 8 }}>
              {stats.recurringTaskCount > 1 ? (
                <Text style={captionStyle}>All tasks</Text>
              ) : null}
              <Heatmap
                startOffsetDays={27}
                historyStartDay={window.startDay}
                endDate={stats.endDate}
                referenceDate={stats.endDate}
                values={stats.heatmapValues}
                valueMode="ratio"
                color={color}
              />
            </View>
          ) : null}

          {chips.length > 0 ? (
            <View style={{ flexDirection: "row", gap: 8 }}>{chips}</View>
          ) : null}

          {showWeeks ? (
            <View style={{ ...card(theme, isDark), gap: 8 }}>
              <Text style={captionStyle}>Completions per week</Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-end",
                  gap: 2,
                  height: 48,
                }}
              >
                {stats.weeks.map((week) => (
                  <View
                    key={week.weekStartDay}
                    style={{
                      flex: 1,
                      borderRadius: 2,
                      height: week.count > 0 ? (48 * week.count) / maxWeek : 2,
                      backgroundColor:
                        week.count > 0
                          ? color
                          : withAlpha(theme.textSecondary, 0.14),
                    }}
                  />
                ))}
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ fontSize: 10, color: theme.textSecondary }}>
                  {format(dayKeyToDate(stats.weeks[0].weekStartDay), "MMM d")}
                </Text>
                <Text style={{ fontSize: 10, color: theme.textSecondary }}>
                  {format(
                    dayKeyToDate(
                      stats.weeks[stats.weeks.length - 1].weekStartDay,
                    ),
                    "MMM d",
                  )}
                </Text>
              </View>
            </View>
          ) : null}

          {stats.taskCounts.length > 0 ? (
            <View style={{ ...card(theme, isDark), gap: 10 }}>
              {stats.taskCounts.map(({ task, count }) => (
                <View
                  key={task.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontWeight: "600",
                        fontSize: 15,
                        color: theme.text,
                      }}
                    >
                      {task.title}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                      {describeTaskSchedule(task)}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontWeight: "700",
                      fontSize: 14,
                      color: theme.text,
                    }}
                  >
                    {count} done
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>

        {/* ⋯ menu: an overlay inside the sheet (no nested Modal), anchored
            under the header like GoalScreen's. */}
        {isMenuOpen ? (
          <Pressable
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: "rgba(15, 23, 42, 0.2)",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
            }}
            onPress={() => {
              void haptics.tap();
              setIsMenuOpen(false);
            }}
          >
            <View
              style={{
                position: "absolute",
                top: 64,
                right: 16,
                minWidth: 220,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.surface,
                paddingVertical: 4,
                shadowColor: "#0f172a",
                shadowOpacity: 0.15,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 6 },
                elevation: 6,
              }}
            >
              {renderMenuItem(
                <Ionicons
                  name="refresh-outline"
                  size={17}
                  color={theme.textSecondary}
                />,
                "Move back to active",
                confirmReactivateGoal,
              )}
              <View
                style={{
                  height: 1,
                  backgroundColor: theme.border,
                  marginVertical: 4,
                }}
              />
              {renderMenuItem(
                <Ionicons
                  name="trash-outline"
                  size={17}
                  color={theme.danger}
                />,
                "Delete goal",
                confirmDeleteGoal,
                true,
              )}
            </View>
          </Pressable>
        ) : null}
      </>
    );
  };

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={() => {
        void haptics.tap();
        close();
      }}
    >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
          }}
          onPress={() => {
            void haptics.tap();
            close();
          }}
        />
        <View
          style={{
            backgroundColor: theme.surface,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            borderTopWidth: 1,
            borderTopColor: theme.border,
            padding: 20,
            paddingBottom: insets.bottom + 20,
            maxHeight: "88%",
          }}
        >
          {renderBody()}
        </View>
      </View>
    </Modal>
  );
}
