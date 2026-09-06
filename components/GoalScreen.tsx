import React from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  Text,
  View,
  Pressable,
  TextInput,
  Modal,
  Alert,
  ScrollView,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  useStore,
  getCustomFrequencyProgress,
  getGoalLifecycleStatus,
  getGoalStartDate,
  getGoalStreak,
  getMemberAdherence,
  getTaskWeekdays,
} from "../store";
import { useTheme } from "../contexts/ThemeContext";
import { differenceInCalendarDays, format } from "date-fns";
import { Task } from "../types";
import { describeTaskSchedule } from "../lib/taskSchedule";
import { haptics } from "../utils/haptics";
import { getGoalColor, goalColor } from "../utils/goalColors";
import { mix, withAlpha } from "../utils/color";
import { RootStackParamList } from "../navigation";
import TrackingDateControls from "./TrackingDateControls";
import Avatar from "./Avatar";
import DatePickerModal from "./DatePickerModal";
import Heatmap from "./Heatmap";
import GoalColorPicker from "./GoalColorPicker";
import PrivacyLock from "./PrivacyLock";
import { ratioHeatmapValues, taskHeatmapValues } from "../lib/heatmapValues";
import TaskEditorModal, { TaskEditorValue } from "./TaskEditorModal";
import { card } from "./ui";
import { leaveGoal } from "../lib/social";

type GoalProps = NativeStackScreenProps<RootStackParamList, "Goal">;

export default function GoalScreen({ navigation, route }: GoalProps) {
  const { goalId } = route.params;
  const ownedGoal = useStore((s) => s.goals.find((g) => g.id === goalId));
  const sharedGoal = useStore((s) =>
    s.sharedGoals.find((g) => g.id === goalId),
  );
  const goal = ownedGoal ?? sharedGoal;
  const account = useStore((s) => s.account);
  const selectedDate = useStore((s) => s.selectedDate);
  const addTask = useStore((s) => s.addTask);
  const updateTask = useStore((s) => s.updateTask);
  const updateGoal = useStore((s) => s.updateGoal);
  const completeGoal = useStore((s) => s.completeGoal);
  const reactivateGoal = useStore((s) => s.reactivateGoal);
  const startGoal = useStore((s) => s.startGoal);
  const deleteTask = useStore((s) => s.deleteTask);
  const deleteGoal = useStore((s) => s.deleteGoal);
  const setSharedGoals = useStore((s) => s.setSharedGoals);
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const isOwner =
    Boolean(ownedGoal) || (Boolean(goal) && account?.id === goal?.ownerUserId);

  // Generic edit mode (issue #167): goal/task management actions stay hidden
  // until the owner opens it.
  const [isManaging, setIsManaging] = React.useState(false);
  // The ⋯ actions menu holding Edit / Complete / Delete (or Leave).
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [editingTaskId, setEditingTaskId] = React.useState<string | null>(null);
  const [isEditingGoalDetails, setIsEditingGoalDetails] = React.useState(false);
  const [goalTitleDraft, setGoalTitleDraft] = React.useState(goal?.title ?? "");
  const [goalTargetDraft, setGoalTargetDraft] = React.useState(
    goal?.target ?? "",
  );
  // Which task the "Last 8 weeks" heatmap is scoped to (null = whole goal).
  const [heatmapTaskId, setHeatmapTaskId] = React.useState<string | null>(null);
  const [isColorPickerOpen, setIsColorPickerOpen] = React.useState(false);
  const [isDuePickerOpen, setIsDuePickerOpen] = React.useState(false);
  // Draft/scheduled goals can be started right from this page (issue #163).
  const [isStartPickerOpen, setIsStartPickerOpen] = React.useState(false);
  React.useEffect(() => {
    if (goal && !isEditingGoalDetails) {
      setGoalTitleDraft(goal.title);
      setGoalTargetDraft(goal.target ?? "");
    }
  }, [goal, isEditingGoalDetails]);

  if (!goal) return <Text>Not found</Text>;

  const color = getGoalColor(goal);
  // The round 34pt buttons that appear beside the title in edit mode.
  const editControlStyle = {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  };

  const isGoalCompleted = goal.completedAt !== undefined;
  const completedAtLabel = goal.completedAt
    ? `Achieved ${format(new Date(goal.completedAt), "MMM d, yyyy")}`
    : "Achieved";

  const lifecycleStatus = getGoalLifecycleStatus(goal);
  const goalStartDate = getGoalStartDate(goal);
  const goalStartDayKey = format(goalStartDate, "yyyy-MM-dd");
  const dueDate = goal.dueDay
    ? (() => {
        const [year, month, day] = goal.dueDay.split("-").map(Number);
        return new Date(year, month - 1, day);
      })()
    : null;
  const daysUntilDue = dueDate
    ? differenceInCalendarDays(dueDate, new Date())
    : null;
  const dueLabel = dueDate
    ? daysUntilDue !== null && daysUntilDue < 0
      ? `Due ${format(dueDate, "MMM d, yyyy")} · ${-daysUntilDue}d overdue`
      : `Due ${format(dueDate, "MMM d, yyyy")} · ${daysUntilDue}d left`
    : null;

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

  const confirmVisibilityChange = () => {
    void haptics.warning();
    const makingPublic = !goal.isPublic;
    Alert.alert(
      makingPublic ? "Make this goal public?" : "Make this goal private?",
      makingPublic
        ? "All of your friends will be able to see this goal, follow your progress, and nudge you."
        : "Only you and the people in this goal will be able to see it.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: makingPublic ? "Make public" : "Make private",
          onPress: () => {
            updateGoal(goalId, { isPublic: makingPublic });
            void haptics.success();
          },
        },
      ],
    );
  };

  const confirmCompleteGoal = () => {
    void haptics.warning();
    Alert.alert(
      "Complete goal?",
      `This moves "${goal.title}" to your achieved goals. Its tasks and consistency history stay saved.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Complete",
          onPress: () => {
            completeGoal(goalId);
            void haptics.success();
            navigation.goBack();
          },
        },
      ],
    );
  };

  const confirmReactivateGoal = () => {
    void haptics.warning();
    Alert.alert(
      "Move back to active goals?",
      `"${goal.title}" will show up with your active goals again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Move back",
          onPress: () => {
            reactivateGoal(goalId);
            void haptics.success();
          },
        },
      ],
    );
  };

  const confirmDeleteGoal = () => {
    void haptics.warning();
    Alert.alert(
      "Delete goal?",
      `This permanently removes "${goal.title}", its tasks, and everyone's history for it.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void haptics.destructive();
            deleteGoal(goalId);
            navigation.goBack();
          },
        },
      ],
    );
  };

  const confirmLeaveGoal = () => {
    if (!account) return;
    void haptics.warning();
    Alert.alert(
      "Leave goal?",
      `"${goal.title}" will disappear from your goals. The owner keeps the goal.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await leaveGoal(goalId, account.id);
                setSharedGoals(
                  useStore
                    .getState()
                    .sharedGoals.filter((g) => g.id !== goalId),
                );
                void haptics.success();
                navigation.goBack();
              } catch (error) {
                void haptics.error();
                Alert.alert(
                  "Couldn't leave goal",
                  error instanceof Error
                    ? error.message
                    : "Try again once you're online.",
                );
              }
            })();
          },
        },
      ],
    );
  };

  // 32px visual + hitSlop 6 = 44px effective targets; the gap keeps the
  // edit/delete slop rects from overlapping so taps can't hit the wrong one.
  const taskActionButtonStyle = {
    alignSelf: "center" as const,
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 8,
  };

  const resetTaskEditor = () => {
    setEditingTaskId(null);
    setIsEditing(false);
  };

  const startEditingTask = (taskId: string) => {
    const task = goal.tasks.find((item) => item.id === taskId);

    if (!task) {
      void haptics.error();
      return;
    }

    setEditingTaskId(task.id);
    setIsEditing(true);
    void haptics.tap();
  };

  const editingTask = editingTaskId
    ? goal.tasks.find((item) => item.id === editingTaskId)
    : undefined;
  const editorInitial: TaskEditorValue | undefined = editingTask
    ? {
        title: editingTask.title,
        frequency: editingTask.frequency,
        customFrequency: editingTask.customFrequency,
      }
    : undefined;

  const submitTaskEditor = (value: TaskEditorValue) => {
    if (editingTaskId) {
      updateTask(goalId, editingTaskId, value);
    } else {
      addTask(goalId, value.title, value.frequency, value.customFrequency);
    }

    void haptics.success();
    resetTaskEditor();
  };

  const confirmDeleteTask = (taskId: string, title: string) => {
    void haptics.warning();
    Alert.alert("Delete task?", `This will remove "${title}" from this goal.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void haptics.destructive();
          deleteTask(goalId, taskId);
        },
      },
    ]);
  };

  const hasCompletionsOnSelectedDate = goal.tasks.some(
    (task) =>
      task.frequency !== "once" &&
      task.completions.some(
        (date) =>
          format(date, "yyyy-MM-dd") === format(selectedDate, "yyyy-MM-dd"),
      ),
  );

  const members = goal.members ?? [];
  const orderedMembers = [
    ...members.filter((m) => m.userId === account?.id),
    ...members.filter((m) => m.userId !== account?.id),
  ];
  // ponytail: heatmaps show MY completions only, even on shared goals —
  // same semantics as the old per-goal Consistency screen.
  const recurringTasks = goal.tasks.filter((t) => t.frequency !== "once");
  const heatmapTask =
    recurringTasks.find((t) => t.id === heatmapTaskId) ?? null;
  const goalHeatmapValues = (): Record<string, number> =>
    ratioHeatmapValues(goal.tasks);

  // ⋯ menu rows: close the menu first so confirm alerts don't stack on it.
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

  const renderStreakChip = (task: Task) => {
    if (task.frequency === "once") return null;
    const streak = getGoalStreak(task);
    if (streak <= 0) return null;
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 3,
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 9999,
          backgroundColor: theme.streak + "1f",
          alignSelf: "flex-start",
        }}
      >
        <Ionicons name="flash" size={11} color={theme.streak} />
        <Text style={{ color: theme.streak, fontSize: 11, fontWeight: "700" }}>
          {streak}
        </Text>
      </View>
    );
  };

  // Compact frequency line for the redesign task rows; completion state now
  // lives on the Today tab only.
  const taskSubtitle = (task: Task): string => {
    const base = describeTaskSchedule(task);
    if (
      task.frequency === "custom" &&
      task.customFrequency &&
      !getTaskWeekdays(task)
    ) {
      const progress = getCustomFrequencyProgress(task, selectedDate);
      const period = task.customFrequency.type === "weekly" ? "week" : "month";
      return `${base} · ${progress.completed}/${progress.target} this ${period}`;
    }
    return base;
  };

  // Task management is tucked behind the generic Edit control (issue #167).
  const renderTaskActionButtons = (item: Task) =>
    isOwner && isManaging ? (
      <Pressable
        onPress={() => startEditingTask(item.id)}
        hitSlop={6}
        style={{ ...taskActionButtonStyle, opacity: 0.55 }}
      >
        <Ionicons name="create-outline" size={16} color={theme.textSecondary} />
      </Pressable>
    ) : null;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background }}
      edges={["bottom", "left", "right"]}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header row: title + one compact actions entry point. Edit,
            Complete, and Delete/Leave live in the ⋯ menu so the page opens
            with content, not controls. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {isEditingGoalDetails ? (
            <>
              <TextInput
                value={goalTitleDraft}
                onChangeText={setGoalTitleDraft}
                style={{
                  flex: 1,
                  fontSize: 26,
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
                <Ionicons
                  name="checkmark-outline"
                  size={20}
                  color={theme.primary}
                />
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
                <Ionicons
                  name="close-outline"
                  size={20}
                  color={theme.textSecondary}
                />
              </Pressable>
            </>
          ) : (
            <>
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: color,
                }}
              />
              <Text
                style={{
                  flex: 1,
                  fontSize: 26,
                  fontWeight: "800",
                  color: theme.text,
                }}
              >
                {goal.title}
              </Text>
              {/* Private / public, Instagram-style: a padlock next to the
                  title. In edit mode it becomes the toggle, with a confirm
                  so a tap never silently exposes (or hides) a goal. */}
              <Pressable
                accessibilityLabel={
                  goal.isPublic ? "Public goal" : "Private goal"
                }
                disabled={!(isOwner && isManaging)}
                onPress={confirmVisibilityChange}
                hitSlop={8}
                style={
                  isOwner && isManaging
                    ? {
                        ...editControlStyle,
                        backgroundColor: goal.isPublic
                          ? withAlpha(theme.primary, 0.16)
                          : theme.surface,
                        borderColor: goal.isPublic
                          ? withAlpha(theme.primary, 0.5)
                          : theme.border,
                      }
                    : { paddingHorizontal: 2 }
                }
              >
                <PrivacyLock
                  open={Boolean(goal.isPublic)}
                  size={isOwner && isManaging ? 19 : 16}
                  color={
                    goal.isPublic && isOwner && isManaging
                      ? theme.primary
                      : theme.textSecondary
                  }
                />
              </Pressable>
              {isOwner && isManaging ? (
                <Pressable
                  accessibilityLabel="Change color"
                  onPress={() => {
                    void haptics.tap();
                    setIsColorPickerOpen(true);
                  }}
                  hitSlop={8}
                  style={editControlStyle}
                >
                  <View
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      backgroundColor: color,
                    }}
                  />
                </Pressable>
              ) : null}
              {isOwner && isManaging ? (
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
                  <Ionicons
                    name="create-outline"
                    size={16}
                    color={theme.textSecondary}
                  />
                </Pressable>
              ) : null}
              {isManaging ? (
                <Pressable
                  onPress={() => {
                    void haptics.toggle();
                    setIsManaging(false);
                  }}
                  hitSlop={8}
                  style={{
                    height: 34,
                    paddingHorizontal: 14,
                    borderRadius: 17,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: theme.primary,
                  }}
                >
                  <Text
                    style={{
                      color: "#ffffff",
                      fontWeight: "700",
                      fontSize: 13,
                    }}
                  >
                    Done
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityLabel="Goal actions"
                  onPress={() => {
                    void haptics.tap();
                    setIsMenuOpen(true);
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
                  <Ionicons
                    name="ellipsis-horizontal"
                    size={16}
                    color={theme.textSecondary}
                  />
                </Pressable>
              )}
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
        ) : goal.target || (!isGoalCompleted && dueLabel) ? (
          /* One quiet meta line: target and due date together, instead of a
             text row plus a chip row. */
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
            {goal.target ? `Target: ${goal.target}` : null}
            {goal.target && !isGoalCompleted && dueLabel ? "  ·  " : null}
            {!isGoalCompleted && dueLabel ? (
              <Text
                style={{
                  color:
                    daysUntilDue !== null && daysUntilDue < 0
                      ? theme.danger
                      : theme.textSecondary,
                }}
              >
                {dueLabel}
              </Text>
            ) : null}
          </Text>
        ) : null}

        {/* Due date chip: editing-only affordance (achieved goals keep
            their history without an overdue warning) */}
        {!isGoalCompleted && isOwner && isManaging ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Pressable
              onPress={() => {
                void haptics.tap();
                setIsDuePickerOpen(true);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 9999,
                backgroundColor:
                  daysUntilDue !== null && daysUntilDue < 0
                    ? theme.danger + "1c"
                    : withAlpha(theme.primary, 0.12),
              }}
            >
              <Ionicons
                name="flag-outline"
                size={14}
                color={
                  daysUntilDue !== null && daysUntilDue < 0
                    ? theme.danger
                    : theme.primary
                }
              />
              <Text
                style={{
                  fontWeight: "700",
                  fontSize: 13,
                  color:
                    daysUntilDue !== null && daysUntilDue < 0
                      ? theme.danger
                      : theme.primary,
                }}
              >
                {dueLabel ?? "Add due date"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <TrackingDateControls hasCompletions={hasCompletionsOnSelectedDate} />

        {lifecycleStatus === "draft" ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 10,
              padding: 12,
              backgroundColor: withAlpha(theme.textSecondary, 0.08),
            }}
          >
            <Ionicons
              name="document-outline"
              size={18}
              color={theme.textSecondary}
            />
            <Text style={{ flex: 1, color: theme.text, fontWeight: "700" }}>
              Draft — not started yet
            </Text>
            {isOwner ? (
              <Pressable
                onPress={() => {
                  void haptics.tap();
                  setIsStartPickerOpen(true);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 9999,
                  backgroundColor: theme.primary,
                }}
              >
                <Ionicons name="play" size={12} color="#ffffff" />
                <Text
                  style={{ color: "#ffffff", fontWeight: "700", fontSize: 13 }}
                >
                  Start
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {lifecycleStatus === "scheduled" && goal.startDay ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              borderWidth: 1,
              borderColor: withAlpha(theme.primary, 0.35),
              borderRadius: 10,
              padding: 12,
              backgroundColor: withAlpha(theme.primary, 0.1),
            }}
          >
            <Ionicons name="calendar-outline" size={18} color={theme.primary} />
            <Text style={{ flex: 1, color: theme.text, fontWeight: "700" }}>
              Starts {format(goalStartDate, "MMM d, yyyy")}
            </Text>
            {isOwner ? (
              <Pressable
                onPress={() => {
                  void haptics.tap();
                  setIsStartPickerOpen(true);
                }}
                hitSlop={6}
              >
                <Text style={{ color: theme.primary, fontWeight: "700" }}>
                  Change
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <DatePickerModal
          visible={isDuePickerOpen}
          title="Due date"
          initialDay={goal.dueDay}
          minDay={
            goal.startDay && goal.startDay > format(new Date(), "yyyy-MM-dd")
              ? goal.startDay
              : format(new Date(), "yyyy-MM-dd")
          }
          allowClear={Boolean(goal.dueDay)}
          onSelect={(day) => {
            updateGoal(goalId, { dueDay: day });
            void haptics.success();
          }}
          onClear={() => updateGoal(goalId, { dueDay: null })}
          onClose={() => setIsDuePickerOpen(false)}
        />
        <DatePickerModal
          visible={isStartPickerOpen}
          title="Start this goal on…"
          initialDay={format(new Date(), "yyyy-MM-dd")}
          minDay={format(new Date(), "yyyy-MM-dd")}
          maxDay={goal.dueDay}
          onSelect={(day) => {
            startGoal(goalId, day);
            void haptics.success();
          }}
          onClose={() => setIsStartPickerOpen(false)}
        />
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
            <Text style={{ color: theme.text, fontWeight: "700" }}>
              {completedAtLabel}
            </Text>
          </View>
        ) : null}

        {/* Full history since the goal started (scroll back in the grid).
            The old streak / this-week / adherence stat cards were dropped
            from the primary view (issue #167). */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            gap: 8,
            marginTop: 4,
          }}
        >
          <Text style={{ fontWeight: "700", color: theme.text }}>
            {lifecycleStatus === "draft" || lifecycleStatus === "scheduled"
              ? "History"
              : `History since ${format(goalStartDate, "MMM d, yyyy")}`}
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
              : recurringTasks.length > 1
                ? "All tasks"
                : ""}
          </Text>
        </View>
        {lifecycleStatus === "draft" || lifecycleStatus === "scheduled" ? (
          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
            History starts when the goal does.
          </Text>
        ) : recurringTasks.length === 0 ? (
          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
            Add a repeating task to see its history here.
          </Text>
        ) : (
          <View style={card(theme, isDark)}>
            <Heatmap
              startOffsetDays={56}
              historyStartDay={goalStartDayKey}
              values={
                heatmapTask
                  ? taskHeatmapValues(heatmapTask)
                  : goalHeatmapValues()
              }
              valueMode={heatmapTask ? "count" : "ratio"}
              color={color}
              referenceDate={selectedDate}
            />
          </View>
        )}

        {/* Doing this together lives on its own page so this screen stays
            about your own progress; this row is just the doorway. */}
        {members.length > 1 || (isOwner && account && !isGoalCompleted) ? (
          <Pressable
            onPress={() => {
              void haptics.navigate();
              navigation.navigate("GoalMembers", { goalId });
            }}
            style={{
              ...card(theme, isDark),
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingVertical: 10,
            }}
          >
            {members.length > 1 ? (
              <View style={{ flexDirection: "row" }}>
                {orderedMembers.slice(0, 4).map((member, index) => (
                  <View
                    key={member.userId}
                    style={{
                      marginLeft: index === 0 ? 0 : -10,
                      borderWidth: 2,
                      borderColor: theme.surface,
                      borderRadius: 999,
                    }}
                  >
                    <Avatar
                      userId={member.userId}
                      displayName={member.displayName}
                      avatarUri={member.avatarUri}
                      size="sm"
                    />
                  </View>
                ))}
              </View>
            ) : (
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: withAlpha(theme.primary, 0.12),
                }}
              >
                <Ionicons
                  name="person-add-outline"
                  size={15}
                  color={theme.primary}
                />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "700", color: theme.text }}>
                {members.length > 1 ? "Doing this together" : "Invite a friend"}
              </Text>
              {members.length > 1 ? (
                <Text
                  numberOfLines={1}
                  style={{ color: theme.textSecondary, fontSize: 12 }}
                >
                  {orderedMembers
                    .filter((m) => m.userId !== account?.id)
                    .map(
                      (m) =>
                        `${m.displayName.split(" ")[0]} ${Math.round(
                          getMemberAdherence(goal, m.userId) * 100,
                        )}%`,
                    )
                    .join(" · ")}
                </Text>
              ) : null}
            </View>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={theme.textSecondary}
            />
          </Pressable>
        ) : null}

        {/* Tasks */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 4,
          }}
        >
          <Text style={{ fontWeight: "700", color: theme.text }}>Tasks</Text>
          {isOwner && isManaging ? (
            <Pressable
              onPress={() => {
                void haptics.tap();
                setEditingTaskId(null);
                setIsEditing(true);
              }}
              hitSlop={6}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 3,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 9999,
                backgroundColor: withAlpha(theme.primary, 0.12),
              }}
            >
              <Ionicons name="add" size={14} color={theme.primary} />
              <Text
                style={{
                  color: theme.primary,
                  fontWeight: "700",
                  fontSize: 12,
                }}
              >
                Add task
              </Text>
            </Pressable>
          ) : recurringTasks.length > 1 ? (
            <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
              Tap a task to filter the heatmap
            </Text>
          ) : null}
        </View>
        {goal.tasks.map((item) => {
          const selected = heatmapTaskId === item.id;
          const canFilter = item.frequency !== "once";
          return (
            <Pressable
              key={item.id}
              onPress={
                canFilter
                  ? () => {
                      void haptics.toggle();
                      setHeatmapTaskId(selected ? null : item.id);
                    }
                  : undefined
              }
              style={{
                ...card(theme, isDark),
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
                ...(selected
                  ? {
                      borderWidth: 1.5,
                      borderColor: withAlpha(color, 0.55),
                      backgroundColor: mix(color, 0.06, theme.surface),
                    }
                  : {}),
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: color,
                }}
              />
              <View style={{ flex: 1 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Text
                    style={{
                      fontWeight: "700",
                      color: theme.text,
                      fontSize: 14,
                      flexShrink: 1,
                    }}
                  >
                    {item.title}
                  </Text>
                  {renderStreakChip(item)}
                </View>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  {taskSubtitle(item)}
                </Text>
              </View>
              {selected ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 9999,
                    backgroundColor: withAlpha(color, 0.14),
                  }}
                >
                  <Ionicons name="stats-chart" size={10} color={color} />
                  <Text style={{ color, fontSize: 10, fontWeight: "700" }}>
                    SHOWING
                  </Text>
                </View>
              ) : null}
              {renderTaskActionButtons(item)}
            </Pressable>
          );
        })}

        {/* Goal actions menu (⋯): everything rare or destructive lives here
            instead of taking permanent space on the page. */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={isMenuOpen}
          onRequestClose={() => setIsMenuOpen(false)}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: "rgba(15, 23, 42, 0.2)" }}
            onPress={() => setIsMenuOpen(false)}
          >
            <View
              style={{
                position: "absolute",
                top: insets.top + 56,
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
              {isOwner
                ? [
                    renderMenuItem(
                      <Ionicons
                        name="create-outline"
                        size={17}
                        color={theme.textSecondary}
                      />,
                      "Edit goal & tasks",
                      () => {
                        void haptics.toggle();
                        setIsManaging(true);
                      },
                    ),
                    renderMenuItem(
                      isGoalCompleted ? (
                        <Ionicons
                          name="refresh-outline"
                          size={17}
                          color={theme.textSecondary}
                        />
                      ) : (
                        <MaterialCommunityIcons
                          name="flag-checkered"
                          size={17}
                          color={theme.success}
                        />
                      ),
                      isGoalCompleted ? "Move back to active" : "Complete goal",
                      isGoalCompleted
                        ? confirmReactivateGoal
                        : confirmCompleteGoal,
                    ),
                    <View
                      key="divider"
                      style={{
                        height: 1,
                        backgroundColor: theme.border,
                        marginVertical: 4,
                      }}
                    />,
                    renderMenuItem(
                      <Ionicons
                        name="trash-outline"
                        size={17}
                        color={theme.danger}
                      />,
                      "Delete goal",
                      confirmDeleteGoal,
                      true,
                    ),
                  ]
                : renderMenuItem(
                    <Ionicons
                      name="exit-outline"
                      size={17}
                      color={theme.danger}
                    />,
                    "Leave goal",
                    confirmLeaveGoal,
                    true,
                  )}
            </View>
          </Pressable>
        </Modal>

        <TaskEditorModal
          visible={isEditing}
          heading={editingTaskId ? "Edit Task" : "New Task"}
          submitLabel={editingTaskId ? "Save" : "Add"}
          initial={editorInitial}
          onSubmit={submitTaskEditor}
          onClose={() => {
            void haptics.tap();
            resetTaskEditor();
          }}
          onDelete={
            editingTaskId
              ? () => {
                  const task = goal.tasks.find((t) => t.id === editingTaskId);
                  resetTaskEditor();
                  if (task) confirmDeleteTask(task.id, task.title);
                }
              : undefined
          }
        />

        <GoalColorPicker
          visible={isColorPickerOpen}
          selected={goal.color}
          autoColor={goalColor(goal.id)}
          onSelect={(picked) => updateGoal(goalId, { color: picked })}
          onClose={() => setIsColorPickerOpen(false)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
