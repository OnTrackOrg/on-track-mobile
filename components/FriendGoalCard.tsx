import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { useTheme } from "../contexts/ThemeContext";
import { getGoalStartDate, getTaskBucketsForDate } from "../store";
import { Goal, Task } from "../types";
import { haptics } from "../utils/haptics";
import { mix, withAlpha } from "../utils/color";
import { getGoalColor } from "../utils/goalColors";
import {
  goalViewForMember,
  ratioHeatmapValues,
  taskHeatmapValues,
} from "../lib/heatmapValues";
import { describeTaskSchedule } from "../lib/taskSchedule";
import Heatmap from "./Heatmap";
import NudgeButton from "./NudgeButton";
import { card } from "./ui";

type FriendGoalCardProps = {
  goal: Goal;
  friendUserId: string;
  friendName: string;
  selectedDate: Date;
  adherence: number; // 0..1
  isPublicOnly: boolean;
};

/**
 * A friend's goal exactly as they see it: their tasks for the chosen day,
 * their heatmap, and the same tap-a-task-to-filter behaviour as the owner's
 * goal page. Read-only apart from the nudge.
 */
export default function FriendGoalCard({
  goal,
  friendUserId,
  friendName,
  selectedDate,
  adherence,
  isPublicOnly,
}: FriendGoalCardProps) {
  const { theme, isDark } = useTheme();
  const [heatmapTaskId, setHeatmapTaskId] = React.useState<string | null>(null);

  const color = getGoalColor(goal);
  const view = React.useMemo(
    () => goalViewForMember(goal, friendUserId),
    [goal, friendUserId],
  );
  const startDayKey = format(getGoalStartDate(goal), "yyyy-MM-dd");
  const buckets = getTaskBucketsForDate(view, selectedDate);
  const doneIds = new Set(buckets.completed.map((task) => task.id));
  const dueCount = buckets.completed.length + buckets.pending.length;
  const recurring = view.tasks.filter((task) => task.frequency !== "once");
  const heatmapTask = recurring.find((task) => task.id === heatmapTaskId);

  const renderTask = (task: Task) => {
    const done = doneIds.has(task.id);
    const selected = heatmapTaskId === task.id;
    const canFilter = task.frequency !== "once" && recurring.length > 1;
    return (
      <Pressable
        key={task.id}
        onPress={
          canFilter
            ? () => {
                void haptics.toggle();
                setHeatmapTaskId(selected ? null : task.id);
              }
            : undefined
        }
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: selected ? withAlpha(color, 0.55) : "transparent",
          backgroundColor: selected
            ? mix(color, 0.06, theme.surface)
            : "transparent",
        }}
      >
        <Ionicons
          name={done ? "checkmark-circle" : "ellipse-outline"}
          size={18}
          color={done ? theme.success : theme.textSecondary}
        />
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={{
              color: theme.text,
              fontWeight: "600",
              fontSize: 14,
              textDecorationLine: done ? "line-through" : "none",
              opacity: done ? 0.7 : 1,
            }}
          >
            {task.title}
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
            {describeTaskSchedule(task)}
          </Text>
        </View>
        {selected ? (
          <Ionicons name="stats-chart" size={12} color={color} />
        ) : null}
      </Pressable>
    );
  };

  return (
    <View style={{ ...card(theme, isDark), gap: 10, overflow: "hidden" }}>
      <View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          backgroundColor: color,
        }}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "800", fontSize: 17, color: theme.text }}>
            {goal.title}
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
            {isPublicOnly ? "Public" : "Shared with you"}
            {goal.target ? ` · ${goal.target}` : ""}
          </Text>
        </View>
        <Text
          style={{
            color: theme.textSecondary,
            fontWeight: "700",
            fontVariant: ["tabular-nums"],
          }}
        >
          {Math.round(adherence * 100)}%
        </Text>
        <NudgeButton
          recipientUserId={friendUserId}
          recipientName={friendName}
          goalId={goal.id}
          variant="pill"
          color={color}
        />
      </View>

      {/* Their day */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{
            fontSize: 12,
            fontWeight: "700",
            color: theme.textSecondary,
          }}
        >
          {format(selectedDate, "EEE, MMM d").toUpperCase()}
        </Text>
        <Text style={{ fontSize: 12, color: theme.textSecondary }}>
          {dueCount === 0
            ? "Nothing due"
            : `${buckets.completed.length}/${dueCount} done`}
        </Text>
      </View>
      <View style={{ gap: 2 }}>{view.tasks.map(renderTask)}</View>

      {/* Their history */}
      {recurring.length > 0 ? (
        <>
          <View
            style={{
              flexDirection: "row",
              alignItems: "baseline",
              gap: 8,
              marginTop: 2,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: theme.textSecondary,
              }}
            >
              HISTORY
            </Text>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                color: heatmapTask ? color : theme.textSecondary,
              }}
            >
              {heatmapTask
                ? `${heatmapTask.title} only`
                : recurring.length > 1
                  ? "All tasks · tap a task to filter"
                  : ""}
            </Text>
          </View>
          <Heatmap
            startOffsetDays={56}
            historyStartDay={startDayKey}
            values={
              heatmapTask
                ? taskHeatmapValues(heatmapTask)
                : ratioHeatmapValues(view.tasks)
            }
            valueMode={heatmapTask ? "count" : "ratio"}
            color={color}
            referenceDate={selectedDate}
          />
        </>
      ) : null}
    </View>
  );
}
