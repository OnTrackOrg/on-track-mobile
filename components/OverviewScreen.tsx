import React from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Text, View, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import { useStore, getCustomFrequencyProgress, getGoalStreak } from "../store";
import { useTheme } from "../contexts/ThemeContext";
import Heatmap from "./Heatmap";
import { format } from "date-fns";
import { RootStackParamList } from "../navigation";

type OverviewProps = NativeStackScreenProps<RootStackParamList, "Consistency">;

export default function OverviewScreen({ navigation, route }: OverviewProps) {
  const streakBadgeSize = 24;
  const streakRingSize = 32;
  const streakRingStrokeWidth = 3;
  const streakRingRadius = (streakRingSize - streakRingStrokeWidth) / 2;
  const streakRingCircumference = 2 * Math.PI * streakRingRadius;
  const { goalId } = route.params;
  const goal = useStore((s) => s.goals.find((g) => g.id === goalId)!);
  const selectedDate = useStore((s) => s.selectedDate);
  const { theme } = useTheme();
  const [viewMode, setViewMode] = React.useState<"summary" | "tasks">("tasks");

  if (!goal) return <Text>Goal not found</Text>;

  const getHeatmapData = (taskCompletions: Date[]) => {
    const heatmapData: Record<string, number> = {};
    taskCompletions.forEach(date => {
      const dateKey = format(date, "yyyy-MM-dd");
      heatmapData[dateKey] = (heatmapData[dateKey] || 0) + 1;
    });
    return heatmapData;
  };

  const recurringTasks = goal.tasks.filter((task) => task.frequency !== "once");
  const onceTasks = goal.tasks.filter((task) => task.frequency === "once");
  const recurringGoalSummaryHeatmapData = getHeatmapData(recurringTasks.flatMap((task) => task.completions));
  const onceTaskHeatmapData = getHeatmapData(onceTasks.flatMap((task) => task.completions));
  const onceTaskCompletionCount = Object.values(onceTaskHeatmapData).reduce((sum, count) => sum + count, 0);
  const hasOnceTaskHistory = onceTaskCompletionCount > 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <View>
          <Text style={{ fontSize: 22, fontWeight: "800", color: theme.text }}>{goal.title} - Consistency</Text>
          <Text style={{ color: theme.textSecondary, marginTop: 4 }}>
            {viewMode === "summary" ? "Goal-level consistency summary" : "Recurring task heatmaps and streaks"}
          </Text>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {([
            { key: "summary", label: "Summary" },
            { key: "tasks", label: "Per-task" },
          ] as const).map((option) => (
            <Pressable
              key={option.key}
              onPress={() => setViewMode(option.key)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 9999,
                borderWidth: 1,
                borderColor: viewMode === option.key ? theme.primary : theme.border,
                backgroundColor: viewMode === option.key ? theme.primary + "20" : theme.surface,
              }}
            >
              <Text style={{ color: viewMode === option.key ? theme.primary : theme.textSecondary, fontWeight: "600", fontSize: 12 }}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {viewMode === "summary" ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 10,
              padding: 12,
              backgroundColor: theme.surface,
              gap: 10,
            }}
          >
            <View>
              <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text }}>Goal summary heatmap</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20 }}>
                Each day shows how many recurring tasks in this goal were completed on that date.
              </Text>
            </View>

            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
              Recurring tasks in this goal: {recurringTasks.length} • Total recurring completions: {Object.values(recurringGoalSummaryHeatmapData).reduce((sum, count) => sum + count, 0)}
            </Text>

            <Heatmap
              startOffsetDays={180}
              values={recurringGoalSummaryHeatmapData}
              referenceDate={selectedDate}
            />
          </View>
        ) : null}

        {viewMode === "tasks" && recurringTasks.length === 0 ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 10,
              padding: 14,
              backgroundColor: theme.surface,
              gap: 8,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text }}>No recurring tasks yet</Text>
            <Text style={{ color: theme.textSecondary, lineHeight: 22 }}>
              Recurring charts apply to daily, weekly, and custom tasks. One-off tasks are shown separately below in a combined support-work heatmap when they exist.
            </Text>
          </View>
        ) : null}

        {viewMode === "tasks" && recurringTasks.map((task, index) => (
          <View key={task.id}>
            <View style={{ 
              borderWidth: 1, 
              borderColor: theme.border, 
              borderRadius: 10, 
              padding: 12,
              backgroundColor: theme.surface
            }}>
              <View style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text }}>{task.title}</Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
                      Frequency: {task.frequency === "custom" && task.customFrequency 
                        ? `${task.customFrequency.target} times per ${task.customFrequency.type.slice(0, -2)}`
                        : task.frequency
                      } • Completions: {task.completions.length}
                    </Text>
                  </View>
                  
                  {/* Fire Streak Indicator - Always Show */}
                  {(() => {
                    const streak = getGoalStreak(task);
                    const hasStreak = streak > 0;
                    const customProgress = task.frequency === "custom" && task.customFrequency
                      ? getCustomFrequencyProgress(task, new Date())
                      : null;
                    const progressRatio = customProgress
                      ? Math.min(customProgress.completed / customProgress.target, 1)
                      : 0;
                    const progressOffset = streakRingCircumference * (1 - progressRatio);
                    
                    return (
                      <View style={{ alignItems: "center", marginLeft: 12 }}>
                        <View style={{ position: "relative" }}>
                          <Ionicons 
                            name="flame" 
                            size={28} 
                            color={hasStreak ? "#FF6B35" : theme.textSecondary}
                            style={{ opacity: hasStreak ? 1 : 0.5 }}
                          />
                          <View style={{
                            position: "absolute",
                            top: -10,
                            right: -14,
                            width: streakRingSize,
                            height: streakRingSize,
                            justifyContent: "center",
                            alignItems: "center",
                          }}>
                            {customProgress ? (
                              <Svg
                                width={streakRingSize}
                                height={streakRingSize}
                                style={{ position: "absolute" }}
                              >
                                <Circle
                                  cx={streakRingSize / 2}
                                  cy={streakRingSize / 2}
                                  r={streakRingRadius}
                                  stroke={theme.border}
                                  strokeWidth={streakRingStrokeWidth}
                                  fill="none"
                                  opacity={0.45}
                                />
                                <Circle
                                  cx={streakRingSize / 2}
                                  cy={streakRingSize / 2}
                                  r={streakRingRadius}
                                  stroke="#FF8A3D"
                                  strokeWidth={streakRingStrokeWidth}
                                  fill="none"
                                  strokeDasharray={`${streakRingCircumference} ${streakRingCircumference}`}
                                  strokeDashoffset={progressOffset}
                                  strokeLinecap="round"
                                  transform={`rotate(-90 ${streakRingSize / 2} ${streakRingSize / 2})`}
                                />
                              </Svg>
                            ) : null}
                            <View style={{
                              backgroundColor: hasStreak ? theme.primary : theme.textSecondary,
                              borderRadius: streakBadgeSize / 2,
                              minWidth: streakBadgeSize,
                              height: streakBadgeSize,
                              justifyContent: "center",
                              alignItems: "center",
                              paddingHorizontal: 6,
                              borderWidth: 2,
                              borderColor: theme.surface,
                              opacity: hasStreak ? 1 : 0.6,
                            }}>
                              <Text style={{
                                color: "white",
                                fontSize: 11,
                                fontWeight: "bold",
                              }}>
                                {streak}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <Text style={{ 
                          fontSize: 10, 
                          color: hasStreak ? theme.textSecondary : theme.textSecondary, 
                          marginTop: 2,
                          fontWeight: "600",
                          opacity: hasStreak ? 1 : 0.6,
                        }}>
                          {streak} streak
                        </Text>
                      </View>
                    );
                  })()}
                </View>
              </View>
              
              <Heatmap 
                startOffsetDays={180} 
                values={getHeatmapData(task.completions)}
                referenceDate={selectedDate}
              />
            </View>
            {index < recurringTasks.length - 1 && <View style={{ height: 16 }} />}
          </View>
        ))}

        {viewMode === "tasks" && onceTasks.length > 0 ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 10,
              padding: 12,
              backgroundColor: theme.surface,
              gap: 10,
            }}
          >
            <View>
              <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text }}>One-off task history</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20 }}>
                One-off tasks
              </Text>
            </View>

            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
              Once tasks in this goal: {onceTasks.length} • Completed one-off tasks: {onceTaskCompletionCount}
            </Text>

            {hasOnceTaskHistory ? (
              <Heatmap
                startOffsetDays={180}
                values={onceTaskHeatmapData}
                referenceDate={selectedDate}
              />
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 10,
                  padding: 12,
                  backgroundColor: theme.background,
                }}
              >
                <Text style={{ color: theme.textSecondary, lineHeight: 20 }}>
                  No completed one-off tasks yet for this goal.
                </Text>
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
