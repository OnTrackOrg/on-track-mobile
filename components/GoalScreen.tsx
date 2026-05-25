import React from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Text, View, Pressable, TextInput, Modal, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { NestableDraggableFlatList, NestableScrollContainer, RenderItemParams, ScaleDecorator } from "react-native-draggable-flatlist";
import { useStore, getCustomFrequencyProgress, getCustomFrequencyAlert, shouldShowCustomTask, isOnceTaskCompletedOnDate } from "../store";
import { useTheme } from "../contexts/ThemeContext";
import { format, startOfWeek, endOfWeek, isWithinInterval, isToday } from "date-fns";
import { Frequency, CustomFrequency } from "../types";
import { haptics } from "../utils/haptics";
import { RootStackParamList } from "../navigation";

type GoalProps = NativeStackScreenProps<RootStackParamList, "Goal">;

export default function GoalScreen({ navigation, route }: GoalProps) {
  const MAX_WEEKLY_CUSTOM_TARGET = 7;
  const MAX_MONTHLY_CUSTOM_TARGET = 31;
  const { goalId } = route.params;
  const goal = useStore((s) => s.goals.find((g) => g.id === goalId));
  const selectedDate = useStore((s) => s.selectedDate);
  const addTask = useStore((s) => s.addTask);
  const updateTask = useStore((s) => s.updateTask);
  const updateGoal = useStore((s) => s.updateGoal);
  const completeGoal = useStore((s) => s.completeGoal);
  const reactivateGoal = useStore((s) => s.reactivateGoal);
  const reorderTasks = useStore((s) => s.reorderTasks);
  const deleteTask = useStore((s) => s.deleteTask);
  const toggleTask = useStore((s) => s.toggleTaskCompletion);
  const { theme } = useTheme();

  const [taskTitle, setTaskTitle] = React.useState("");
  const [frequency, setFrequency] = React.useState<Frequency>("daily");
  const [customFrequency, setCustomFrequency] = React.useState<CustomFrequency>({ type: "weekly", target: 3 });
  const [isEditing, setIsEditing] = React.useState(false);
  const [editingTaskId, setEditingTaskId] = React.useState<string | null>(null);
  const [isEditingGoalDetails, setIsEditingGoalDetails] = React.useState(false);
  const [goalTitleDraft, setGoalTitleDraft] = React.useState(goal?.title ?? "");
  const [goalTargetDraft, setGoalTargetDraft] = React.useState(goal?.target ?? "");
  const [isReorderingTasks, setIsReorderingTasks] = React.useState(false);

  React.useEffect(() => {
    if (goal && !isEditingGoalDetails) {
      setGoalTitleDraft(goal.title);
      setGoalTargetDraft(goal.target ?? "");
    }
  }, [goal, isEditingGoalDetails]);

  if (!goal) return <Text>Not found</Text>;

  const isGoalCompleted = goal.completedAt !== undefined;
  const completedAtLabel = goal.completedAt
    ? `Achieved ${format(new Date(goal.completedAt), "MMM d, yyyy")}`
    : "Achieved";

  const saveGoalDetails = () => {
    const trimmedTitle = goalTitleDraft.trim();
    const trimmedTarget = goalTargetDraft.trim();

    if (!trimmedTitle) {
      void haptics.error();
      return;
    }

    updateGoal(goalId, {
      title: trimmedTitle,
      target: trimmedTarget ? trimmedTarget : null,
    });
    void haptics.success();
    setIsEditingGoalDetails(false);
  };

  const confirmCompleteGoal = () => {
    void haptics.warning();
    Alert.alert(
      "Complete goal?",
      `This moves "${goal.title}" to Completed Goals. Its tasks and consistency history stay saved.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Complete",
          onPress: () => {
            completeGoal(goalId);
            void haptics.success();
            navigation.navigate("CompletedGoals");
          },
        },
      ]
    );
  };

  const confirmReactivateGoal = () => {
    void haptics.warning();
    Alert.alert(
      "Move back to active goals?",
      `"${goal.title}" will appear on the home screen and radar chart again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Move back",
          onPress: () => {
            reactivateGoal(goalId);
            void haptics.success();
          },
        },
      ]
    );
  };

  const isCompletedToday = (dates: Date[], referenceDate: Date) =>
    dates.some(date => format(date, "yyyy-MM-dd") === format(referenceDate, "yyyy-MM-dd"));

  const getMaxCustomTarget = (type: CustomFrequency["type"]) =>
    type === "weekly" ? MAX_WEEKLY_CUSTOM_TARGET : MAX_MONTHLY_CUSTOM_TARGET;

  const taskActionButtonStyle = {
    alignSelf: "center" as const,
    borderRadius: 9999,
    paddingHorizontal: 4,
    paddingVertical: 4,
  };

  const normalizeCustomTarget = (target: number, type: CustomFrequency["type"]) =>
    Math.min(getMaxCustomTarget(type), Math.max(1, target));

  const adjustCustomTarget = (delta: number) => {
    const nextTarget = normalizeCustomTarget(customFrequency.target + delta, customFrequency.type);

    if (nextTarget === customFrequency.target) {
      void haptics.warning();
      return;
    }

    void haptics.toggle();
    setCustomFrequency((prev) => ({ ...prev, target: nextTarget }));
  };

  const resetTaskEditor = () => {
    setTaskTitle("");
    setFrequency("daily");
    setCustomFrequency({ type: "weekly", target: 3 });
    setEditingTaskId(null);
    setIsEditing(false);
  };

  const startEditingTask = (taskId: string) => {
    const task = goal.tasks.find((item) => item.id === taskId);

    if (!task) {
      void haptics.error();
      return;
    }

    setTaskTitle(task.title);
    setFrequency(task.frequency);
    setCustomFrequency(task.customFrequency ?? { type: "weekly", target: 3 });
    setEditingTaskId(task.id);
    setIsEditing(true);
    void haptics.tap();
  };

  const submitTaskEditor = () => {
    const trimmedTitle = taskTitle.trim();

    if (!trimmedTitle) {
      void haptics.error();
      return;
    }

    const normalizedCustomFrequency = frequency === "custom"
      ? {
          ...customFrequency,
          target: normalizeCustomTarget(customFrequency.target, customFrequency.type),
        }
      : undefined;

    if (editingTaskId) {
      updateTask(goalId, editingTaskId, {
        title: trimmedTitle,
        frequency,
        customFrequency: normalizedCustomFrequency,
      });
    } else {
      addTask(goalId, trimmedTitle, frequency, normalizedCustomFrequency);
    }

    void haptics.success();
    resetTaskEditor();
  };

  const confirmDeleteTask = (taskId: string, taskTitle: string) => {
    void haptics.warning();
    Alert.alert(
      "Delete task?",
      `This will remove "${taskTitle}" from this goal.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void haptics.destructive();
            deleteTask(goalId, taskId);
          }
        }
      ]
    );
  };

  const viewingToday = isToday(selectedDate);
  const selectedWeekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
  const selectedWeekEnd = endOfWeek(selectedDate, { weekStartsOn: 0 });
  const selectedDayLabel = viewingToday ? "today" : format(selectedDate, "MMM d");
  const incompleteDailyLabel = viewingToday ? "Done today: No" : `Done on ${selectedDayLabel}: No`;
  const completedDailyLabel = viewingToday ? "Done today: Yes ✓" : `Done on ${selectedDayLabel}: Yes ✓`;
  const customCompletionLabel = viewingToday ? "Done today ✓" : `Done on ${selectedDayLabel} ✓`;
  const weeklyContextLabel = `week of ${format(selectedWeekStart, "MMM d")}`;
  const getCustomPeriodLabel = (type: CustomFrequency["type"]) => {
    if (type === "weekly") {
      return viewingToday ? "this week" : weeklyContextLabel;
    }

    return viewingToday ? "this month" : format(selectedDate, "MMMM yyyy");
  };

  const pendingTasks = goal.tasks.filter(item => {
    if (item.frequency === "custom") {
      return shouldShowCustomTask(item, selectedDate);
    }

    if (item.frequency === "daily") {
      return !isCompletedToday(item.completions, selectedDate);
    }

    if (item.frequency === "weekly") {
      return !item.completions.some(date =>
        isWithinInterval(date, { start: selectedWeekStart, end: selectedWeekEnd })
      );
    }

    if (item.frequency === "once") {
      return item.completions.length === 0;
    }

    return true;
  });

  const completedTasks = goal.tasks.filter(item => {
    if (item.frequency === "custom") {
      const progress = getCustomFrequencyProgress(item, selectedDate);
      return isCompletedToday(item.completions, selectedDate) || progress.achieved;
    }

    if (item.frequency === "daily") {
      return isCompletedToday(item.completions, selectedDate);
    }

    if (item.frequency === "weekly") {
      return item.completions.some(date =>
        isWithinInterval(date, { start: selectedWeekStart, end: selectedWeekEnd })
      );
    }

    if (item.frequency === "once") {
      return isOnceTaskCompletedOnDate(item, selectedDate);
    }

    return false;
  });

  const renderTaskActionButtons = (item: typeof goal.tasks[number]) => (
    <View style={{ alignSelf: "center", gap: 6 }}>
      <Pressable
        onPress={() => startEditingTask(item.id)}
        hitSlop={8}
        style={{
          ...taskActionButtonStyle,
          opacity: 0.55,
        }}
      >
        <Ionicons name="create-outline" size={16} color={theme.textSecondary} />
      </Pressable>
      <Pressable
        onPress={() => confirmDeleteTask(item.id, item.title)}
        hitSlop={8}
        style={{
          ...taskActionButtonStyle,
          opacity: 0.35,
        }}
      >
        <Ionicons name="trash-outline" size={16} color={theme.textSecondary} />
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom', 'left', 'right']}>
      <NestableScrollContainer
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {isEditingGoalDetails ? (
            <>
              <TextInput
                value={goalTitleDraft}
                onChangeText={setGoalTitleDraft}
                style={{
                  flex: 1,
                  fontSize: 22,
                  fontWeight: "800",
                  color: theme.text,
                  borderWidth: 1,
                  borderColor: theme.primary,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: theme.surface,
                }}
                placeholder="Goal name"
                placeholderTextColor={theme.textSecondary}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveGoalDetails}
              />
              <Pressable
                onPress={saveGoalDetails}
                hitSlop={8}
                style={{ padding: 6 }}
              >
                <Ionicons name="checkmark-outline" size={20} color={theme.primary} />
              </Pressable>
              <Pressable
                onPress={() => {
                  void haptics.tap();
                  setGoalTitleDraft(goal.title);
                  setGoalTargetDraft(goal.target ?? "");
                  setIsEditingGoalDetails(false);
                }}
                hitSlop={8}
                style={{ padding: 6 }}
              >
                <Ionicons name="close-outline" size={20} color={theme.textSecondary} />
              </Pressable>
            </>
          ) : (
            <>
              <Text style={{ flex: 1, fontSize: 22, fontWeight: "800", color: theme.text }}>{goal.title}</Text>
              <Pressable
                onPress={() => {
                  void haptics.tap();
                  setGoalTitleDraft(goal.title);
                  setGoalTargetDraft(goal.target ?? "");
                  setIsEditingGoalDetails(true);
                }}
                hitSlop={8}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.surface,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Ionicons name="create-outline" size={16} color={theme.textSecondary} />
              </Pressable>
            </>
          )}
        </View>
        {isEditingGoalDetails ? (
          <View style={{ gap: 8 }}>
            <TextInput
              value={goalTargetDraft}
              onChangeText={setGoalTargetDraft}
              style={{
                fontSize: 15,
                color: theme.text,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: theme.surface,
              }}
              placeholder="Optional target"
              placeholderTextColor={theme.textSecondary}
              returnKeyType="done"
              onSubmitEditing={saveGoalDetails}
            />
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
              Leave blank to clear the target.
            </Text>
          </View>
        ) : goal.target ? (
          <Text style={{ color: theme.textSecondary }}>Target: {goal.target}</Text>
        ) : null}
        {isGoalCompleted ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              borderWidth: 1,
              borderColor: theme.warning + "55",
              borderRadius: 10,
              padding: 12,
              backgroundColor: theme.warning + "14",
            }}
          >
            <Ionicons name="trophy-outline" size={18} color={theme.warning} />
            <Text style={{ color: theme.text, fontWeight: "700" }}>{completedAtLabel}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Pressable
            onPress={() => {
              void haptics.navigate();
              navigation.navigate("Consistency", { goalId });
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.primary + "55",
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 9999,
            }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.primary + "20",
              }}
            >
              <Ionicons name="analytics-outline" size={14} color={theme.primary} />
            </View>
            <Text style={{ color: theme.text, fontWeight: "700" }}>See Consistency</Text>
            <Ionicons name="arrow-forward" size={14} color={theme.textSecondary} />
          </Pressable>
          <Pressable
            onPress={isGoalCompleted ? confirmReactivateGoal : confirmCompleteGoal}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: isGoalCompleted ? theme.border : theme.success + "55",
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 9999,
            }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isGoalCompleted ? theme.background : theme.success + "20",
              }}
            >
              <Ionicons
                name={isGoalCompleted ? "refresh-outline" : "trophy-outline"}
                size={14}
                color={isGoalCompleted ? theme.textSecondary : theme.success}
              />
            </View>
            <Text style={{ color: theme.text, fontWeight: "700" }}>
              {isGoalCompleted ? "Move Back" : "Complete Goal"}
            </Text>
          </Pressable>
        </View>

        {/* Pending Tasks Section */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          <Text style={{ fontWeight: "700", color: theme.text }}>Tasks</Text>
          {goal.tasks.length > 1 ? (
            <Pressable
              onPress={() => {
                setIsReorderingTasks((prev) => !prev);
                void haptics.tap();
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 9999,
                borderWidth: 1,
                borderColor: isReorderingTasks ? theme.primary : theme.border,
                backgroundColor: theme.surface,
              }}
            >
              <Ionicons name="reorder-three-outline" size={14} color={isReorderingTasks ? theme.primary : theme.textSecondary} />
              <Text style={{ color: isReorderingTasks ? theme.primary : theme.textSecondary, fontWeight: "600", fontSize: 12 }}>
                {isReorderingTasks ? "Done" : "Reorder"}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {isReorderingTasks ? (
          <View style={{ marginTop: 8, gap: 8 }}>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
              Long press and drag tasks to change their order.
            </Text>
            <NestableDraggableFlatList
              data={goal.tasks}
              keyExtractor={(item) => item.id}
              onDragEnd={({ data }) => {
                reorderTasks(goalId, data.map((task) => task.id));
                void haptics.success();
              }}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              renderItem={({ item, drag, isActive }: RenderItemParams<(typeof goal.tasks)[number]>) => (
                <ScaleDecorator>
                  <Pressable
                    onLongPress={drag}
                    delayLongPress={150}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      padding: 12,
                      borderWidth: 1,
                      borderColor: isActive ? theme.primary : theme.border,
                      borderRadius: 10,
                      backgroundColor: theme.surface,
                    }}
                  >
                    <Ionicons name="reorder-three-outline" size={18} color={theme.textSecondary} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "700", color: theme.text }}>{item.title}</Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                        {item.frequency === "custom" && item.customFrequency
                          ? `${item.customFrequency.target} times per ${item.customFrequency.type}`
                          : `Frequency: ${item.frequency}`}
                      </Text>
                    </View>
                  </Pressable>
                </ScaleDecorator>
              )}
            />
          </View>
        ) : pendingTasks.length === 0 ? (
          <View style={{
            padding: 20,
            borderRadius: 12,
            backgroundColor: theme.completionCard,
            borderWidth: 1,
            borderColor: theme.completionCardBorder,
            alignItems: "center",
            marginTop: 8
          }}>
            <Text style={{ fontWeight: "700", fontSize: 18, color: theme.success, marginBottom: 4 }}>
              {viewingToday ? "All done for today!" : `All done for ${selectedDayLabel}!`}
            </Text>
            <Text style={{ color: theme.success, textAlign: "center" }}>
              {viewingToday
                ? "You're right on track! All tasks completed."
                : `All tasks completed for ${format(selectedDate, "EEEE, MMM d, yyyy")}.`}
            </Text>
          </View>
        ) : (
          pendingTasks.map((item, index) => (
            <View key={item.id}>
              <Pressable
                onPress={() => {
                  void haptics.success();
                  toggleTask(goalId, item.id, selectedDate);
                }}
                style={{
                  padding: 12,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 10,
                  backgroundColor: theme.surface,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={{ fontWeight: "700", color: theme.text }}>{item.title}</Text>
                    {item.frequency === "custom" && item.customFrequency ? (() => {
                      const progress = getCustomFrequencyProgress(item, selectedDate);
                      const alert = getCustomFrequencyAlert(item, selectedDate);
                      return (
                        <View style={{ marginTop: 8 }}>
                          <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 4 }}>
                            {progress.completed}/{progress.target} times in {getCustomPeriodLabel(item.customFrequency.type)}
                          </Text>
                          <View style={{ flexDirection: "row", gap: 2 }}>
                            {Array.from({ length: progress.target }, (_, progressIndex) => (
                              <View
                                key={progressIndex}
                                style={{
                                  flex: 1,
                                  height: 6,
                                  backgroundColor: progressIndex < progress.completed ? theme.primary : theme.border,
                                  borderRadius: 3,
                                }}
                              />
                            ))}
                          </View>
                          {progress.target > progress.completed && (
                            <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 2 }}>
                              {progress.target - progress.completed} more to go
                            </Text>
                          )}
                          {alert ? (
                            <Text
                              style={{
                                color: alert.tone === "error"
                                  ? theme.danger
                                  : alert.tone === "warning"
                                    ? theme.warning ?? "#f59e0b"
                                    : theme.primary,
                                fontSize: 11,
                                marginTop: 4,
                                fontWeight: "600",
                              }}
                            >
                              {alert.message}
                            </Text>
                          ) : null}
                        </View>
                      );
                    })() : (() => {
                      if (item.frequency === "weekly") {
                        const completedThisWeek = item.completions.some(date =>
                          isWithinInterval(date, { start: selectedWeekStart, end: selectedWeekEnd })
                        );
                        return (
                          <>
                            <Text style={{ color: theme.textSecondary }}>Frequency: Weekly</Text>
                            <Text style={{ color: theme.textSecondary }}>
                              Done for {weeklyContextLabel}: {completedThisWeek ? "Yes" : "No"}
                            </Text>
                          </>
                        );
                      } else if (item.frequency === "daily") {
                        return (
                          <>
                            <Text style={{ color: theme.textSecondary }}>Frequency: Daily</Text>
                            <Text style={{ color: theme.textSecondary }}>{incompleteDailyLabel}</Text>
                          </>
                        );
                      } else if (item.frequency === "once") {
                        return (
                          <>
                            <Text style={{ color: theme.textSecondary }}>Frequency: Once</Text>
                            <Text style={{ color: theme.textSecondary }}>Status: Pending</Text>
                          </>
                        );
                      }
                      return (
                        <>
                          <Text style={{ color: theme.textSecondary }}>Frequency: {item.frequency}</Text>
                          <Text style={{ color: theme.textSecondary }}>Status: Pending</Text>
                        </>
                      );
                    })()}
                  </View>
                  {renderTaskActionButtons(item)}
                </View>
              </Pressable>
              {index < pendingTasks.length - 1 && <View style={{ height: 8 }} />}
            </View>
          ))
        )}

        {/* Completed Tasks Section */}
        {!isReorderingTasks && completedTasks.length > 0 ? (
          <>
            <Text style={{ fontWeight: "700", marginTop: 16, color: theme.textSecondary }}>Completed</Text>
            {completedTasks.map((item, index) => (
              <View key={item.id}>
                <Pressable
                  onPress={() => {
                    void haptics.tap();
                    toggleTask(goalId, item.id, selectedDate);
                  }}
                  style={{
                    padding: 12,
                    borderWidth: 1,
                    borderColor: theme.completedBorder,
                    borderRadius: 10,
                    backgroundColor: theme.completedBackground,
                    opacity: 0.7,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={{ fontWeight: "700", color: theme.textSecondary, textDecorationLine: "line-through" }}>{item.title}</Text>
                      {item.frequency === "custom" && item.customFrequency ? (() => {
                        const progress = getCustomFrequencyProgress(item, selectedDate);
                        const completedOnSelectedDate = isCompletedToday(item.completions, selectedDate);
                        return (
                          <View style={{ marginTop: 8 }}>
                            <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 4 }}>
                              {progress.completed}/{progress.target} times in {getCustomPeriodLabel(item.customFrequency.type)}
                            </Text>
                            <View style={{ flexDirection: "row", gap: 2 }}>
                              {Array.from({ length: progress.target }, (_, progressIndex) => (
                                <View
                                  key={progressIndex}
                                  style={{
                                    flex: 1,
                                    height: 6,
                                    backgroundColor: progressIndex < progress.completed ? theme.success : theme.border,
                                    borderRadius: 3,
                                  }}
                                />
                              ))}
                            </View>
                            <Text style={{ color: theme.success, fontSize: 11, marginTop: 2 }}>
                              {progress.achieved
                                ? "Goal achieved! ✓"
                                : completedOnSelectedDate
                                  ? customCompletionLabel
                                  : "Progress made ✓"}
                            </Text>
                          </View>
                        );
                      })() : (() => {
                        if (item.frequency === "weekly") {
                          return (
                            <>
                              <Text style={{ color: theme.textSecondary }}>Frequency: Weekly</Text>
                              <Text style={{ color: theme.success }}>Done for {weeklyContextLabel}: Yes ✓</Text>
                            </>
                          );
                        } else if (item.frequency === "daily") {
                          return (
                            <>
                              <Text style={{ color: theme.textSecondary }}>Frequency: Daily</Text>
                              <Text style={{ color: theme.success }}>{completedDailyLabel}</Text>
                            </>
                          );
                        } else if (item.frequency === "once") {
                          return (
                            <>
                              <Text style={{ color: theme.textSecondary }}>Frequency: Once</Text>
                              <Text style={{ color: theme.success }}>Completed ✓</Text>
                            </>
                          );
                        }
                        return (
                          <>
                            <Text style={{ color: theme.textSecondary }}>Frequency: {item.frequency}</Text>
                            <Text style={{ color: theme.success }}>Completed ✓</Text>
                          </>
                        );
                      })()}
                    </View>
                    {renderTaskActionButtons(item)}
                  </View>
                </Pressable>
                {index < completedTasks.length - 1 && <View style={{ height: 8 }} />}
              </View>
            ))}
          </>
        ) : null}

        <Pressable
          onPress={() => {
            void haptics.tap();
            if (isEditing) {
              resetTaskEditor();
            } else {
              setEditingTaskId(null);
              setTaskTitle("");
              setFrequency("daily");
              setCustomFrequency({ type: "weekly", target: 3 });
              setIsEditing(true);
            }
          }}
          style={{
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            padding: 12,
            borderRadius: 10,
            marginTop: 8
          }}
        >
          <Text
            style={{
              color: theme.textSecondary,
              textAlign: "center",
              fontWeight: "600"
            }}
          >
            + New Task
          </Text>
        </Pressable>

        <Modal
          animationType="fade"
          transparent={true}
          visible={isEditing}
          onRequestClose={() => {
            void haptics.tap();
            resetTaskEditor();
          }}
        >
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              padding: 24,
              backgroundColor: "rgba(15, 23, 42, 0.35)"
            }}
          >
            <Pressable
              onPress={() => {
                void haptics.tap();
                resetTaskEditor();
              }}
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0
              }}
            />
            <View
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 16,
                padding: 16,
                gap: 10,
                backgroundColor: theme.surface,
              }}
            >
              <Text style={{ fontWeight: "700", fontSize: 18, color: theme.text }}>{editingTaskId ? "Edit Task" : "New Task"}</Text>
              <TextInput
                placeholder="e.g., Take creatine"
                value={taskTitle}
                onChangeText={setTaskTitle}
                style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 10, backgroundColor: theme.background, color: theme.text }}
                placeholderTextColor={theme.textSecondary}
                autoFocus={true}
              />
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {(["once", "daily", "weekly", "custom"] as Frequency[]).map((f) => (
                  <Pressable
                    key={f}
                    onPress={() => {
                      void haptics.toggle();
                      setFrequency(f);
                    }}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: frequency === f ? theme.primary : theme.border,
                      backgroundColor: frequency === f ? theme.primary + "20" : "transparent",
                    }}
                  >
                    <Text style={{ fontWeight: "600", color: frequency === f ? theme.primary : theme.text }}>{f}</Text>
                  </Pressable>
                ))}
              </View>

              {frequency === "custom" && (
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <Pressable
                      onPress={() => {
                        adjustCustomTarget(-1);
                      }}
                      style={{
                        borderWidth: 1,
                        borderColor: theme.border,
                        borderRadius: 8,
                        padding: 8,
                        backgroundColor: theme.background,
                        width: 44,
                        height: 44,
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      <Ionicons name="remove" size={18} color={theme.text} />
                    </Pressable>
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: theme.border,
                        borderRadius: 8,
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        backgroundColor: theme.background,
                        minWidth: 84,
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      <Text style={{ color: theme.text, fontWeight: "700", fontSize: 16 }}>
                        {customFrequency.target}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        adjustCustomTarget(1);
                      }}
                      style={{
                        borderWidth: 1,
                        borderColor: theme.border,
                        borderRadius: 8,
                        padding: 8,
                        backgroundColor: theme.background,
                        width: 44,
                        height: 44,
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      <Ionicons name="add" size={18} color={theme.text} />
                    </Pressable>
                    <Text style={{ color: theme.text, alignSelf: "center" }}>times per</Text>
                  </View>

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {(["weekly", "monthly"] as const).map((type) => (
                      <Pressable
                        key={type}
                        onPress={() => {
                          void haptics.toggle();
                          const normalizedTarget = normalizeCustomTarget(customFrequency.target, type);
                          setCustomFrequency(prev => ({ ...prev, type, target: normalizedTarget }));
                        }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: customFrequency.type === type ? theme.primary : theme.border,
                          backgroundColor: customFrequency.type === type ? theme.primary + "20" : "transparent",
                        }}
                      >
                        <Text style={{ fontWeight: "600", color: customFrequency.type === type ? theme.primary : theme.text }}>
                          {type}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                <Pressable
                  onPress={() => {
                    void haptics.tap();
                    resetTaskEditor();
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: theme.background,
                    borderWidth: 1,
                    borderColor: theme.border,
                    padding: 10,
                    borderRadius: 8
                  }}
                >
                  <Text style={{ color: theme.textSecondary, textAlign: "center", fontWeight: "600" }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={submitTaskEditor}
                  style={{ flex: 1, backgroundColor: theme.primary, padding: 10, borderRadius: 8 }}
                >
                  <Text style={{ color: "white", textAlign: "center", fontWeight: "700" }}>{editingTaskId ? "Save" : "Add"}</Text>
                </Pressable>
              </View>
              {frequency === "custom" ? (
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  {customFrequency.type === "weekly"
                    ? `Choose from 1 to ${MAX_WEEKLY_CUSTOM_TARGET} times per week.`
                    : `Choose from 1 to ${MAX_MONTHLY_CUSTOM_TARGET} times per month.`}
                </Text>
              ) : null}
            </View>
          </View>
        </Modal>

      </NestableScrollContainer>
    </SafeAreaView>
  );
}
