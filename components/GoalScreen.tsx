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
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  useStore,
  getCustomFrequencyProgress,
  getGoalLifecycleStatus,
  getGoalProgress,
  getGoalStartDate,
  getGoalStreak,
  getMemberAdherence,
} from "../store";
import { useTheme } from "../contexts/ThemeContext";
import {
  addDays,
  differenceInCalendarDays,
  format,
  startOfWeek,
} from "date-fns";
import {
  CustomFrequency,
  FriendProfile,
  Frequency,
  GoalMember,
  Task,
} from "../types";
import { haptics } from "../utils/haptics";
import { goalColor } from "../utils/goalColors";
import { mix, withAlpha } from "../utils/color";
import { RootStackParamList } from "../navigation";
import TrackingDateControls from "./TrackingDateControls";
import Avatar from "./Avatar";
import DatePickerModal from "./DatePickerModal";
import Heatmap from "./Heatmap";
import { card } from "./ui";
import {
  addMemberToGoal,
  inviteFriendToGoal,
  leaveGoal,
  removeMember,
} from "../lib/social";
import { getPersistedSession } from "../lib/auth";

type GoalProps = NativeStackScreenProps<RootStackParamList, "Goal">;

export default function GoalScreen({ navigation, route }: GoalProps) {
  const MAX_WEEKLY_CUSTOM_TARGET = 7;
  const MAX_MONTHLY_CUSTOM_TARGET = 31;
  const { goalId } = route.params;
  const ownedGoal = useStore((s) => s.goals.find((g) => g.id === goalId));
  const sharedGoal = useStore((s) =>
    s.sharedGoals.find((g) => g.id === goalId),
  );
  const goal = ownedGoal ?? sharedGoal;
  const account = useStore((s) => s.account);
  const friends = useStore((s) => s.friends);
  const selectedDate = useStore((s) => s.selectedDate);
  const addTask = useStore((s) => s.addTask);
  const updateTask = useStore((s) => s.updateTask);
  const updateGoal = useStore((s) => s.updateGoal);
  const completeGoal = useStore((s) => s.completeGoal);
  const reactivateGoal = useStore((s) => s.reactivateGoal);
  const deleteTask = useStore((s) => s.deleteTask);
  const deleteGoal = useStore((s) => s.deleteGoal);
  const setGoals = useStore((s) => s.setGoals);
  const setSharedGoals = useStore((s) => s.setSharedGoals);
  const { theme, isDark } = useTheme();

  const isOwner =
    Boolean(ownedGoal) || (Boolean(goal) && account?.id === goal?.ownerUserId);

  const [taskTitle, setTaskTitle] = React.useState("");
  const [frequency, setFrequency] = React.useState<Frequency>("daily");
  const [customFrequency, setCustomFrequency] = React.useState<CustomFrequency>(
    { type: "weekly", target: 3 },
  );
  const [isEditing, setIsEditing] = React.useState(false);
  const [editingTaskId, setEditingTaskId] = React.useState<string | null>(null);
  const [isEditingGoalDetails, setIsEditingGoalDetails] = React.useState(false);
  const [goalTitleDraft, setGoalTitleDraft] = React.useState(goal?.title ?? "");
  const [goalTargetDraft, setGoalTargetDraft] = React.useState(
    goal?.target ?? "",
  );
  // Which task the "Last 8 weeks" heatmap is scoped to (null = whole goal).
  const [heatmapTaskId, setHeatmapTaskId] = React.useState<string | null>(null);
  const [isInviteOpen, setIsInviteOpen] = React.useState(false);
  const [invitingFriendId, setInvitingFriendId] = React.useState<string | null>(
    null,
  );
  const [isDuePickerOpen, setIsDuePickerOpen] = React.useState(false);

  React.useEffect(() => {
    if (goal && !isEditingGoalDetails) {
      setGoalTitleDraft(goal.title);
      setGoalTargetDraft(goal.target ?? "");
    }
  }, [goal, isEditingGoalDetails]);

  if (!goal) return <Text>Not found</Text>;

  const color = goalColor(goal.id);

  // Stat cards (redesign): best task streak, days fully done this week,
  // and 8-week adherence for the current user.
  const maxStreak = goal.tasks.reduce(
    (best, task) => Math.max(best, getGoalStreak(task)),
    0,
  );
  const now = new Date();
  const statWeekStart = startOfWeek(now, { weekStartsOn: 0 });
  let weekCompleteDays = 0;
  for (let i = 0; i < 7; i++) {
    const day = addDays(statWeekStart, i);
    if (day > now) break;
    if (getGoalProgress(goal, day).isComplete) weekCompleteDays++;
  }
  const adherencePct = Math.round(
    getMemberAdherence(goal, account?.id ?? "") * 100,
  );

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

  const confirmRemoveMember = (member: GoalMember) => {
    void haptics.warning();
    Alert.alert(
      "Remove member?",
      `${member.displayName} will lose access to "${goal.title}".`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await removeMember(goalId, member.userId);
                setGoals(
                  useStore.getState().goals.map((g) =>
                    g.id === goalId
                      ? {
                          ...g,
                          members: g.members?.filter(
                            (m) => m.userId !== member.userId,
                          ),
                          tasks: g.tasks.map((task) => {
                            if (!task.memberCompletions) return task;
                            const { [member.userId]: _removed, ...remaining } =
                              task.memberCompletions;
                            return { ...task, memberCompletions: remaining };
                          }),
                        }
                      : g,
                  ),
                );
                void haptics.destructive();
              } catch (error) {
                void haptics.error();
                Alert.alert(
                  "Couldn't remove member",
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

  const inviteFriend = async (friend: FriendProfile) => {
    if (invitingFriendId) return;
    setInvitingFriendId(friend.userId);
    void haptics.tap();

    try {
      const session = await getPersistedSession();
      const user = session?.user;
      if (!user) {
        throw new Error("You need to be signed in to invite friends.");
      }

      // Re-read from the store: tasks may have been edited since render.
      const current =
        useStore.getState().goals.find((g) => g.id === goalId) ?? goal;
      await inviteFriendToGoal(current, friend.userId, user);

      const owner = {
        userId: user.id,
        username: account?.username ?? "",
        displayName: account?.displayName ?? "You",
        isOwner: true,
      };

      // Merge the member into the CURRENT store goal (ids are stable UUIDs)
      // so completions toggled mid-invite survive.
      setGoals(
        useStore
          .getState()
          .goals.map((g) =>
            g.id === current.id ? addMemberToGoal(g, friend, owner) : g,
          ),
      );
      void haptics.success();
    } catch (error) {
      void haptics.error();
      Alert.alert(
        "Couldn't invite",
        error instanceof Error
          ? error.message
          : "Try again once you're online.",
      );
    } finally {
      setInvitingFriendId(null);
    }
  };

  const getMaxCustomTarget = (type: CustomFrequency["type"]) =>
    type === "weekly" ? MAX_WEEKLY_CUSTOM_TARGET : MAX_MONTHLY_CUSTOM_TARGET;

  // 32px visual + hitSlop 6 = 44px effective targets; the gap keeps the
  // edit/delete slop rects from overlapping so taps can't hit the wrong one.
  const taskActionButtonStyle = {
    alignSelf: "center" as const,
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 8,
  };

  const normalizeCustomTarget = (
    target: number,
    type: CustomFrequency["type"],
  ) => Math.min(getMaxCustomTarget(type), Math.max(1, target));

  const adjustCustomTarget = (delta: number) => {
    const nextTarget = normalizeCustomTarget(
      customFrequency.target + delta,
      customFrequency.type,
    );

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

    const normalizedCustomFrequency =
      frequency === "custom"
        ? {
            ...customFrequency,
            target: normalizeCustomTarget(
              customFrequency.target,
              customFrequency.type,
            ),
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
  const memberIds = new Set(members.map((m) => m.userId));
  const invitableFriends = friends.filter((f) => !memberIds.has(f.userId));

  // ponytail: heatmaps show MY completions only, even on shared goals —
  // same semantics as the old per-goal Consistency screen.
  const recurringTasks = goal.tasks.filter((t) => t.frequency !== "once");
  const heatmapTask =
    recurringTasks.find((t) => t.id === heatmapTaskId) ?? null;
  const taskHeatmapValues = (task: Task): Record<string, number> => {
    const values: Record<string, number> = {};
    for (const date of task.completions) {
      const key = format(date, "yyyy-MM-dd");
      values[key] = (values[key] || 0) + 1;
    }
    return values;
  };
  const goalHeatmapValues = (): Record<string, number> => {
    if (recurringTasks.length === 0) return {};
    const tasksByDate: Record<string, Set<string>> = {};
    for (const task of recurringTasks) {
      for (const date of task.completions) {
        const key = format(date, "yyyy-MM-dd");
        (tasksByDate[key] ??= new Set()).add(task.id);
      }
    }
    return Object.fromEntries(
      Object.entries(tasksByDate).map(([key, done]) => [
        key,
        done.size / recurringTasks.length,
      ]),
    );
  };

  const pillStyle = (active: boolean) => ({
    ...card(theme, isDark),
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9999,
    ...(active
      ? {
          borderWidth: 1,
          borderColor: theme.primary,
          backgroundColor: theme.primary + "20",
        }
      : {}),
  });

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
    if (task.frequency === "custom" && task.customFrequency) {
      const progress = getCustomFrequencyProgress(task, selectedDate);
      const period = task.customFrequency.type === "weekly" ? "week" : "month";
      return `${task.customFrequency.target} times per ${period} · ${progress.completed}/${progress.target} this ${period}`;
    }
    return task.frequency;
  };

  const renderTaskActionButtons = (item: Task) =>
    isOwner ? (
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
        {/* Action pill row: Invite + Complete (owner) or Leave (member) */}
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {isOwner && account ? (
            <Pressable
              onPress={() => {
                void haptics.tap();
                setIsInviteOpen(true);
              }}
              style={pillStyle(false)}
            >
              <Ionicons
                name="person-add-outline"
                size={16}
                color={theme.primary}
              />
              <Text style={{ color: theme.text, fontWeight: "700" }}>
                Invite
              </Text>
            </Pressable>
          ) : null}
          {isOwner ? (
            <Pressable
              onPress={
                isGoalCompleted ? confirmReactivateGoal : confirmCompleteGoal
              }
              style={{
                ...pillStyle(false),
                borderColor: isGoalCompleted
                  ? theme.border
                  : theme.success + "55",
              }}
            >
              {isGoalCompleted ? (
                <Ionicons
                  name="refresh-outline"
                  size={16}
                  color={theme.textSecondary}
                />
              ) : (
                <MaterialCommunityIcons
                  name="flag-checkered"
                  size={16}
                  color={theme.success}
                />
              )}
              <Text style={{ color: theme.text, fontWeight: "700" }}>
                {isGoalCompleted ? "Move Back" : "Complete"}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={confirmLeaveGoal}
              style={{
                ...pillStyle(false),
                borderColor: theme.danger + "55",
              }}
            >
              <Ionicons name="exit-outline" size={16} color={theme.danger} />
              <Text style={{ color: theme.text, fontWeight: "700" }}>
                Leave
              </Text>
            </Pressable>
          )}
        </View>

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
              {isOwner ? (
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
          <Text style={{ color: theme.textSecondary }}>
            Target: {goal.target}
          </Text>
        ) : null}

        {/* Due date chip: owners tap to set/change/clear (achieved goals
            keep their history without an overdue warning) */}
        {!isGoalCompleted && (dueLabel || isOwner) ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Pressable
              disabled={!isOwner}
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
            <Text style={{ color: theme.text, fontWeight: "700" }}>
              Draft — start it from the Goals tab
            </Text>
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
            <Text style={{ color: theme.text, fontWeight: "700" }}>
              Starts {format(goalStartDate, "MMM d, yyyy")}
            </Text>
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

        {/* Stat cards (redesign) */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View
            style={{
              ...card(theme, isDark),
              flex: 1,
              padding: 12,
              alignItems: "center",
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Ionicons name="flash" size={14} color={theme.streak} />
              <Text
                style={{ fontSize: 20, fontWeight: "800", color: theme.text }}
              >
                {maxStreak}
              </Text>
            </View>
            <Text
              style={{
                fontSize: 11,
                color: theme.textSecondary,
                marginTop: 2,
              }}
            >
              Streak
            </Text>
          </View>
          <View
            style={{
              ...card(theme, isDark),
              flex: 1,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Text
              style={{ fontSize: 20, fontWeight: "800", color: theme.text }}
            >
              {weekCompleteDays}/7
            </Text>
            <Text
              style={{
                fontSize: 11,
                color: theme.textSecondary,
                marginTop: 2,
              }}
            >
              This week
            </Text>
          </View>
          <View
            style={{
              ...card(theme, isDark),
              flex: 1,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Text
              style={{ fontSize: 20, fontWeight: "800", color: theme.text }}
            >
              {lifecycleStatus === "draft" || lifecycleStatus === "scheduled"
                ? "—"
                : `${adherencePct}%`}
            </Text>
            <Text
              style={{
                fontSize: 11,
                color: theme.textSecondary,
                marginTop: 2,
              }}
            >
              Adherence
            </Text>
          </View>
        </View>

        {/* Full history since the goal started (scroll back in the grid) */}
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

        {/* Doing this together */}
        {members.length > 1 ? (
          <View style={{ ...card(theme, isDark), gap: 12 }}>
            <Text style={{ fontWeight: "700", color: theme.text }}>
              Doing this together
            </Text>
            {orderedMembers.map((member) => {
              const isMe = member.userId === account?.id;
              const percent = Math.round(
                getMemberAdherence(goal, member.userId) * 100,
              );
              const canRemove = isOwner && !isMe;
              return (
                <Pressable
                  key={member.userId}
                  // ponytail: member removal is long-press only; a row menu
                  // can come later if this proves undiscoverable.
                  onLongPress={
                    canRemove ? () => confirmRemoveMember(member) : undefined
                  }
                  delayLongPress={400}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Avatar
                    userId={member.userId}
                    displayName={member.displayName}
                    avatarUri={member.avatarUri}
                    size="md"
                  />
                  <View style={{ flex: 1, gap: 5 }}>
                    <Text style={{ fontWeight: "600", color: theme.text }}>
                      {isMe ? "You" : member.displayName}
                      {member.isOwner ? (
                        <Text
                          style={{ color: theme.textSecondary, fontSize: 12 }}
                        >
                          {"  "}owner
                        </Text>
                      ) : null}
                    </Text>
                    <View
                      style={{
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: theme.border,
                        overflow: "hidden",
                      }}
                    >
                      <View
                        style={{
                          width: `${percent}%`,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: theme.primary,
                        }}
                      />
                    </View>
                  </View>
                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontWeight: "700",
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {percent}%
                  </Text>
                </Pressable>
              );
            })}
          </View>
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
          {recurringTasks.length > 1 ? (
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

        {isOwner ? (
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
            style={{ ...card(theme, isDark), padding: 12, marginTop: 8 }}
          >
            <Text
              style={{
                color: theme.textSecondary,
                textAlign: "center",
                fontWeight: "600",
              }}
            >
              + New Task
            </Text>
          </Pressable>
        ) : null}

        {isOwner ? (
          <Pressable
            onPress={confirmDeleteGoal}
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: theme.danger + "55",
              backgroundColor: theme.surface,
            }}
          >
            <Text
              style={{
                color: theme.danger,
                textAlign: "center",
                fontWeight: "600",
              }}
            >
              Delete goal
            </Text>
          </Pressable>
        ) : null}

        {/* Invite friends modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={isInviteOpen}
          onRequestClose={() => {
            void haptics.tap();
            setIsInviteOpen(false);
          }}
        >
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              padding: 24,
              backgroundColor: "rgba(15, 23, 42, 0.35)",
            }}
          >
            <Pressable
              onPress={() => {
                void haptics.tap();
                setIsInviteOpen(false);
              }}
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
              }}
            />
            <View style={{ ...card(theme, isDark), padding: 16, gap: 12 }}>
              <Text
                style={{ fontWeight: "700", fontSize: 18, color: theme.text }}
              >
                Invite a friend
              </Text>
              {invitableFriends.length === 0 ? (
                <Text style={{ color: theme.textSecondary }}>
                  {friends.length === 0
                    ? "Add friends from the Search tab first."
                    : "All of your friends are already in this goal."}
                </Text>
              ) : (
                invitableFriends.map((friend) => (
                  <View
                    key={friend.userId}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Avatar
                      userId={friend.userId}
                      displayName={friend.displayName}
                      avatarUri={friend.avatarUri}
                      size="md"
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "600", color: theme.text }}>
                        {friend.displayName}
                      </Text>
                      {friend.username ? (
                        <Text
                          style={{ color: theme.textSecondary, fontSize: 12 }}
                        >
                          @{friend.username}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={() => void inviteFriend(friend)}
                      disabled={invitingFriendId !== null}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 9999,
                        backgroundColor: theme.primary,
                        opacity:
                          invitingFriendId === null
                            ? 1
                            : invitingFriendId === friend.userId
                              ? 0.7
                              : 0.4,
                      }}
                    >
                      <Text style={{ color: "white", fontWeight: "700" }}>
                        {invitingFriendId === friend.userId
                          ? "Inviting…"
                          : "Invite"}
                      </Text>
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          </View>
        </Modal>

        {/* Task editor modal */}
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
              backgroundColor: "rgba(15, 23, 42, 0.35)",
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
                left: 0,
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
              <Text
                style={{ fontWeight: "700", fontSize: 18, color: theme.text }}
              >
                {editingTaskId ? "Edit Task" : "New Task"}
              </Text>
              <TextInput
                placeholder="e.g., Take creatine"
                value={taskTitle}
                onChangeText={setTaskTitle}
                style={{
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 8,
                  padding: 10,
                  backgroundColor: theme.background,
                  color: theme.text,
                }}
                placeholderTextColor={theme.textSecondary}
                autoFocus={true}
              />
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {(["once", "daily", "weekly", "custom"] as Frequency[]).map(
                  (f) => (
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
                        borderColor:
                          frequency === f ? theme.primary : theme.border,
                        backgroundColor:
                          frequency === f
                            ? theme.primary + "20"
                            : "transparent",
                      }}
                    >
                      <Text
                        style={{
                          fontWeight: "600",
                          color: frequency === f ? theme.primary : theme.text,
                        }}
                      >
                        {f}
                      </Text>
                    </Pressable>
                  ),
                )}
              </View>

              {frequency === "custom" && (
                <View style={{ gap: 8 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
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
                        justifyContent: "center",
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
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: theme.text,
                          fontWeight: "700",
                          fontSize: 16,
                        }}
                      >
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
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name="add" size={18} color={theme.text} />
                    </Pressable>
                    <Text style={{ color: theme.text, alignSelf: "center" }}>
                      times per
                    </Text>
                  </View>

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {(["weekly", "monthly"] as const).map((type) => (
                      <Pressable
                        key={type}
                        onPress={() => {
                          void haptics.toggle();
                          const normalizedTarget = normalizeCustomTarget(
                            customFrequency.target,
                            type,
                          );
                          setCustomFrequency((prev) => ({
                            ...prev,
                            type,
                            target: normalizedTarget,
                          }));
                        }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor:
                            customFrequency.type === type
                              ? theme.primary
                              : theme.border,
                          backgroundColor:
                            customFrequency.type === type
                              ? theme.primary + "20"
                              : "transparent",
                        }}
                      >
                        <Text
                          style={{
                            fontWeight: "600",
                            color:
                              customFrequency.type === type
                                ? theme.primary
                                : theme.text,
                          }}
                        >
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
                    borderRadius: 8,
                  }}
                >
                  <Text
                    style={{
                      color: theme.textSecondary,
                      textAlign: "center",
                      fontWeight: "600",
                    }}
                  >
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={submitTaskEditor}
                  style={{
                    flex: 1,
                    backgroundColor: theme.primary,
                    padding: 10,
                    borderRadius: 8,
                  }}
                >
                  <Text
                    style={{
                      color: "white",
                      textAlign: "center",
                      fontWeight: "700",
                    }}
                  >
                    {editingTaskId ? "Save" : "Add"}
                  </Text>
                </Pressable>
              </View>
              {frequency === "custom" ? (
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  {customFrequency.type === "weekly"
                    ? `Choose from 1 to ${MAX_WEEKLY_CUSTOM_TARGET} times per week.`
                    : `Choose from 1 to ${MAX_MONTHLY_CUSTOM_TARGET} times per month.`}
                </Text>
              ) : null}
              {editingTaskId ? (
                <Pressable
                  onPress={() => {
                    const task = goal.tasks.find((t) => t.id === editingTaskId);
                    resetTaskEditor();
                    if (task) confirmDeleteTask(task.id, task.title);
                  }}
                  style={{ paddingVertical: 8 }}
                >
                  <Text
                    style={{
                      color: theme.danger,
                      textAlign: "center",
                      fontWeight: "600",
                    }}
                  >
                    Delete task
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}
