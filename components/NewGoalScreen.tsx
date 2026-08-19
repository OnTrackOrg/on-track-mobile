import React from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  ActivityIndicator,
  Text,
  View,
  Pressable,
  TextInput,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { addDays, format } from "date-fns";
import { useStore } from "../store";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";
import { withAlpha } from "../utils/color";
import { RootStackParamList } from "../navigation";
import LabeledTextField from "./LabeledTextField";
import Avatar from "./Avatar";
import DatePickerModal from "./DatePickerModal";
import TaskEditorModal, { TaskEditorValue } from "./TaskEditorModal";
import { CustomFrequency, Frequency } from "../types";
import { addMemberToGoal, inviteFriendToGoal } from "../lib/social";
import { getPersistedSession } from "../lib/auth";
import { describeTaskSchedule } from "../lib/taskSchedule";
import { generateGoalDraft } from "../lib/goalDraft";

type NewGoalProps = NativeStackScreenProps<RootStackParamList, "NewGoal">;

type DraftTask = {
  key: string;
  title: string;
  frequency: Frequency;
  customFrequency?: CustomFrequency;
};

export default function NewGoalScreen({ navigation }: NewGoalProps) {
  const addGoal = useStore((s) => s.addGoal);
  const addTask = useStore((s) => s.addTask);
  const setGoals = useStore((s) => s.setGoals);
  const account = useStore((s) => s.account);
  const friends = useStore((s) => s.friends);
  const { theme } = useTheme();

  const [title, setTitle] = React.useState("");
  const [target, setTarget] = React.useState("");
  const [draftTasks, setDraftTasks] = React.useState<DraftTask[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = React.useState<string[]>(
    [],
  );
  const [isAddingTask, setIsAddingTask] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);

  // AI-assisted drafting (issue #161): describe an outcome, get an editable
  // pre-filled form. Nothing is saved until the user taps Create/Save.
  const [aiDescription, setAiDescription] = React.useState("");
  const [isDrafting, setIsDrafting] = React.useState(false);
  const [draftSource, setDraftSource] = React.useState<"ai" | "offline" | null>(
    null,
  );

  // Goal lifecycle: start immediately, on a chosen day, or park as a draft.
  const [startMode, setStartMode] = React.useState<
    "now" | "scheduled" | "draft"
  >("now");
  const [startDay, setStartDay] = React.useState<string | null>(null);
  const [dueDay, setDueDay] = React.useState<string | null>(null);
  const [isStartPickerOpen, setIsStartPickerOpen] = React.useState(false);
  const [isDuePickerOpen, setIsDuePickerOpen] = React.useState(false);
  const todayKey = format(new Date(), "yyyy-MM-dd");

  const canCreate = title.trim().length > 0 && !isCreating;
  const showFriendPicker = Boolean(account) && friends.length > 0;

  const submitTaskEditor = (value: TaskEditorValue) => {
    setDraftTasks((prev) => [
      ...prev,
      { key: `${Date.now()}-${prev.length}`, ...value },
    ]);
    void haptics.success();
    setIsAddingTask(false);
  };

  const removeDraftTask = (key: string) => {
    void haptics.destructive();
    setDraftTasks((prev) => prev.filter((task) => task.key !== key));
  };

  const generateDraft = async () => {
    const description = aiDescription.trim();
    if (description.length < 3 || isDrafting) {
      void haptics.error();
      return;
    }

    setIsDrafting(true);
    try {
      const draft = await generateGoalDraft(description);
      setTitle(draft.title);
      setTarget(draft.target ?? "");
      if (draft.durationDays) {
        setDueDay(
          format(addDays(new Date(), draft.durationDays), "yyyy-MM-dd"),
        );
      }
      setDraftTasks(
        draft.tasks.map((task, index) => ({
          key: `ai-${Date.now()}-${index}`,
          ...task,
        })),
      );
      setDraftSource(draft.source);
      void haptics.success();
    } finally {
      setIsDrafting(false);
    }
  };

  const discardDraft = () => {
    void haptics.destructive();
    setTitle("");
    setTarget("");
    setDueDay(null);
    setDraftTasks([]);
    setDraftSource(null);
  };

  const toggleFriend = (userId: string) => {
    void haptics.toggle();
    setSelectedFriendIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  const frequencyLabel = (task: DraftTask) => describeTaskSchedule(task);

  const inviteSelectedFriends = async (createdGoalId: string) => {
    const session = await getPersistedSession();
    const user = session?.user;
    if (!user) {
      throw new Error("You need to be signed in to invite friends.");
    }

    const localGoal = useStore
      .getState()
      .goals.find((g) => g.id === createdGoalId);
    if (!localGoal) return;

    // Ids are UUIDs from birth, so the concurrent background flush and these
    // upserts write the same rows idempotently; nothing gets remapped.
    for (const friendId of selectedFriendIds) {
      await inviteFriendToGoal(localGoal, friendId, user);
    }

    const invitedFriends = friends.filter((f) =>
      selectedFriendIds.includes(f.userId),
    );
    const owner = {
      userId: user.id,
      username: account?.username ?? "",
      displayName: account?.displayName ?? "You",
      isOwner: true,
    };

    // Merge the members into the CURRENT store goal (not a snapshot) so
    // nothing mutated during the invites gets reverted.
    setGoals(
      useStore
        .getState()
        .goals.map((g) =>
          g.id === createdGoalId
            ? invitedFriends.reduce(
                (acc, friend) => addMemberToGoal(acc, friend, owner),
                g,
              )
            : g,
        ),
    );
  };

  const createGoal = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || isCreating) {
      void haptics.error();
      return;
    }

    setIsCreating(true);

    // addGoal returns void, so grab the freshly appended goal from the store.
    addGoal(trimmedTitle, target.trim() || undefined, {
      isDraft: startMode === "draft",
      startDay:
        startMode === "scheduled" && startDay && startDay > todayKey
          ? startDay
          : undefined,
      dueDay: dueDay ?? undefined,
    });
    const created = useStore.getState().goals.at(-1);
    if (!created) {
      setIsCreating(false);
      return;
    }
    for (const draft of draftTasks) {
      addTask(created.id, draft.title, draft.frequency, draft.customFrequency);
    }

    if (selectedFriendIds.length > 0) {
      try {
        await inviteSelectedFriends(created.id);
      } catch (error) {
        // The goal stays; inviting is an online one-shot the user can retry.
        Alert.alert(
          "Goal created, invites failed",
          error instanceof Error
            ? `${error.message} You can invite friends from the goal once you're back online.`
            : "You can invite friends from the goal once you're back online.",
        );
      }
    }

    void haptics.success();
    navigation.goBack();
  };

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
        {/* AI drafting (issue #161): optional — the manual form below works
            exactly as before without it. */}
        <View
          style={{
            borderWidth: 1,
            borderColor: withAlpha(theme.primary, 0.35),
            borderRadius: 12,
            backgroundColor: withAlpha(theme.primary, 0.06),
            padding: 12,
            gap: 10,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="sparkles" size={15} color={theme.primary} />
            <Text style={{ fontWeight: "700", color: theme.text }}>
              Draft it for me
            </Text>
          </View>
          <TextInput
            placeholder="Describe what you want to achieve, e.g. 'get ready for a 10k in October'"
            placeholderTextColor={theme.textSecondary}
            value={aiDescription}
            onChangeText={setAiDescription}
            multiline
            style={{
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 10,
              padding: 10,
              minHeight: 56,
              textAlignVertical: "top",
              backgroundColor: theme.surface,
              color: theme.text,
            }}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => void generateDraft()}
              disabled={isDrafting || aiDescription.trim().length < 3}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                backgroundColor: theme.primary,
                paddingVertical: 10,
                borderRadius: 10,
                opacity:
                  isDrafting || aiDescription.trim().length < 3 ? 0.5 : 1,
              }}
            >
              {isDrafting ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Ionicons name="sparkles-outline" size={14} color="#ffffff" />
              )}
              <Text style={{ color: "#ffffff", fontWeight: "700" }}>
                {isDrafting
                  ? "Drafting…"
                  : draftSource
                    ? "Draft again"
                    : "Generate draft"}
              </Text>
            </Pressable>
            {draftSource ? (
              <Pressable
                onPress={discardDraft}
                style={{
                  paddingHorizontal: 14,
                  justifyContent: "center",
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: theme.border,
                  backgroundColor: theme.surface,
                }}
              >
                <Text style={{ color: theme.textSecondary, fontWeight: "700" }}>
                  Discard
                </Text>
              </Pressable>
            ) : null}
          </View>
          {draftSource ? (
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
              {draftSource === "ai"
                ? "Draft ready — everything below is editable before you save."
                : "You're offline, so this draft came from a built-in template. Everything below is editable."}
            </Text>
          ) : null}
        </View>

        <LabeledTextField
          label="Goal Title"
          placeholder="e.g., Run a half marathon"
          value={title}
          onChangeText={setTitle}
        />

        <LabeledTextField
          label="Target (optional)"
          placeholder="e.g., 200 lbs, 10% BF"
          value={target}
          onChangeText={setTarget}
        />

        <Text
          style={{
            fontWeight: "700",
            fontSize: 12,
            letterSpacing: 0.6,
            color: theme.textSecondary,
            marginTop: 4,
          }}
        >
          DUE DATE (OPTIONAL)
        </Text>
        <Pressable
          onPress={() => {
            void haptics.tap();
            setIsDuePickerOpen(true);
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            padding: 12,
            borderWidth: 1,
            borderColor: dueDay ? theme.primary : theme.border,
            borderRadius: 10,
            backgroundColor: theme.surface,
          }}
        >
          <Ionicons
            name="flag-outline"
            size={16}
            color={dueDay ? theme.primary : theme.textSecondary}
          />
          <Text
            style={{
              flex: 1,
              fontWeight: "600",
              color: dueDay ? theme.text : theme.textSecondary,
            }}
          >
            {dueDay
              ? `Reach it by ${format(new Date(`${dueDay}T00:00:00`), "MMM d, yyyy")}`
              : "Pick a date to reach it by"}
          </Text>
          {dueDay ? (
            <Pressable
              onPress={() => {
                void haptics.tap();
                setDueDay(null);
              }}
              hitSlop={8}
            >
              <Ionicons
                name="close-circle"
                size={18}
                color={theme.textSecondary}
              />
            </Pressable>
          ) : null}
        </Pressable>

        <Text
          style={{
            fontWeight: "700",
            fontSize: 12,
            letterSpacing: 0.6,
            color: theme.textSecondary,
            marginTop: 4,
          }}
        >
          WHEN TO START
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(
            [
              { mode: "now", label: "Now", icon: "play" },
              {
                mode: "scheduled",
                label: "On a date",
                icon: "calendar-outline",
              },
              { mode: "draft", label: "Draft", icon: "document-outline" },
            ] as const
          ).map(({ mode, label, icon }) => {
            const active = startMode === mode;
            return (
              <Pressable
                key={mode}
                onPress={() => {
                  void haptics.toggle();
                  setStartMode(mode);
                  if (mode === "scheduled") {
                    setIsStartPickerOpen(true);
                  }
                }}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  paddingVertical: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: active ? theme.primary : theme.border,
                  backgroundColor: active
                    ? withAlpha(theme.primary, 0.12)
                    : theme.surface,
                }}
              >
                <Ionicons
                  name={icon}
                  size={14}
                  color={active ? theme.primary : theme.textSecondary}
                />
                <Text
                  style={{
                    fontWeight: "700",
                    fontSize: 13,
                    color: active ? theme.primary : theme.textSecondary,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {startMode === "scheduled" ? (
          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
            {startDay && startDay > todayKey
              ? `Tasks become due on ${format(new Date(`${startDay}T00:00:00`), "MMM d, yyyy")}.`
              : "Pick a day — until then the goal waits in Scheduled."}
          </Text>
        ) : startMode === "draft" ? (
          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
            Drafts sit on the Goals tab until you start them.
          </Text>
        ) : null}

        <Text
          style={{
            fontWeight: "700",
            fontSize: 12,
            letterSpacing: 0.6,
            color: theme.textSecondary,
            marginTop: 4,
          }}
        >
          TASKS
        </Text>
        {draftTasks.map((task) => (
          <View
            key={task.key}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              padding: 12,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 10,
              backgroundColor: theme.surface,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "700", color: theme.text }}>
                {task.title}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                {frequencyLabel(task)}
              </Text>
            </View>
            <Pressable
              onPress={() => removeDraftTask(task.key)}
              hitSlop={8}
              style={{ padding: 4, opacity: 0.5 }}
            >
              <Ionicons
                name="trash-outline"
                size={16}
                color={theme.textSecondary}
              />
            </Pressable>
          </View>
        ))}
        <Pressable
          onPress={() => {
            void haptics.tap();
            setIsAddingTask(true);
          }}
          style={{
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            padding: 12,
            borderRadius: 10,
          }}
        >
          <Text
            style={{
              color: theme.textSecondary,
              textAlign: "center",
              fontWeight: "600",
            }}
          >
            + Add Task
          </Text>
        </Pressable>

        {showFriendPicker ? (
          <>
            <Text
              style={{
                fontWeight: "700",
                fontSize: 12,
                letterSpacing: 0.6,
                color: theme.textSecondary,
                marginTop: 4,
              }}
            >
              DO IT WITH FRIENDS
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingVertical: 4 }}
            >
              {friends.map((friend) => {
                const selected = selectedFriendIds.includes(friend.userId);
                return (
                  <Pressable
                    key={friend.userId}
                    onPress={() => toggleFriend(friend.userId)}
                    style={{ alignItems: "center", gap: 4, width: 64 }}
                  >
                    <View
                      style={{
                        borderWidth: 2,
                        borderColor: selected ? theme.primary : "transparent",
                        borderRadius: 24,
                        padding: 2,
                      }}
                    >
                      <Avatar
                        userId={friend.userId}
                        displayName={friend.displayName}
                        avatarUri={friend.avatarUri}
                        size="md"
                      />
                    </View>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 11,
                        fontWeight: selected ? "700" : "500",
                        color: selected ? theme.primary : theme.textSecondary,
                      }}
                    >
                      {friend.displayName}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : null}

        <Pressable
          onPress={() => void createGoal()}
          style={{
            backgroundColor: theme.primary,
            padding: 12,
            borderRadius: 10,
            marginTop: 8,
            opacity: canCreate ? 1 : 0.5,
          }}
        >
          <Text
            style={{ color: "white", textAlign: "center", fontWeight: "700" }}
          >
            {isCreating
              ? "Creating…"
              : startMode === "draft"
                ? "Save Draft"
                : "Create Goal"}
          </Text>
        </Pressable>
      </ScrollView>

      <DatePickerModal
        visible={isDuePickerOpen}
        title="Reach this goal by…"
        initialDay={dueDay ?? undefined}
        minDay={startDay && startDay > todayKey ? startDay : todayKey}
        allowClear={Boolean(dueDay)}
        onSelect={(day) => setDueDay(day)}
        onClear={() => setDueDay(null)}
        onClose={() => setIsDuePickerOpen(false)}
      />
      <DatePickerModal
        visible={isStartPickerOpen}
        title="Start this goal on…"
        initialDay={startDay ?? undefined}
        minDay={todayKey}
        maxDay={dueDay ?? undefined}
        onSelect={(day) => setStartDay(day)}
        onClose={() => {
          setIsStartPickerOpen(false);
          // Backing out without a (future) day just means "start now" —
          // reflect that in the mode so the UI never over-promises.
          setStartDay((current) => {
            const kept = current && current > todayKey ? current : null;
            if (!kept) {
              setStartMode("now");
            }
            return kept;
          });
        }}
      />

      <TaskEditorModal
        visible={isAddingTask}
        heading="New Task"
        submitLabel="Add"
        onSubmit={submitTaskEditor}
        onClose={() => {
          void haptics.tap();
          setIsAddingTask(false);
        }}
      />
    </SafeAreaView>
  );
}
