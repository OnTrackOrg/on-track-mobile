import React from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TextStyle,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import Animated, { FadeInRight, FadeOutLeft } from "react-native-reanimated";
import { useStore } from "../store";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";
import { withAlpha } from "../utils/color";
import { RootStackParamList } from "../navigation";
import DatePickerModal from "./DatePickerModal";
import TaskEditorModal, { TaskEditorValue } from "./TaskEditorModal";
import GoalColorPicker from "./GoalColorPicker";
import OptionPair from "./OptionPair";
import { GOAL_PALETTE } from "../utils/goalColors";
import { describeTaskSchedule } from "../lib/taskSchedule";

type NewGoalProps = NativeStackScreenProps<RootStackParamList, "NewGoal">;

type DraftTask = TaskEditorValue & { key: string };

// One question per step: title, target, dates, visibility, tasks.
const STEP_COUNT = 5;
const LAST_STEP = STEP_COUNT - 1;
// Steps past this one have no text field, so the keyboard should go away.
const LAST_TYPING_STEP = 1;
// The native header is the status bar plus the standard iOS nav bar.
const IOS_NAV_BAR_HEIGHT = 44;

const formatDay = (day: string) =>
  format(new Date(`${day}T00:00:00`), "MMM d, yyyy");

export default function NewGoalScreen({ navigation }: NewGoalProps) {
  const addGoal = useStore((s) => s.addGoal);
  const addTask = useStore((s) => s.addTask);
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [step, setStep] = React.useState(0);
  const [title, setTitle] = React.useState("");
  const [target, setTarget] = React.useState("");
  const [dueDay, setDueDay] = React.useState<string | null>(null);
  const [startDay, setStartDay] = React.useState<string | null>(null);
  // Who can see it: private (default) or public to all friends.
  const [isPublic, setIsPublic] = React.useState(false);
  const [color, setColor] = React.useState<string | null>(null);
  const [draftTasks, setDraftTasks] = React.useState<DraftTask[]>([]);
  const [isCreating, setIsCreating] = React.useState(false);
  const [isDuePickerOpen, setIsDuePickerOpen] = React.useState(false);
  const [isStartPickerOpen, setIsStartPickerOpen] = React.useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = React.useState(false);
  const [isAddingTask, setIsAddingTask] = React.useState(false);
  // Draft row being edited in the task editor; null while adding a new one.
  const [editingTaskKey, setEditingTaskKey] = React.useState<string | null>(
    null,
  );
  // Flipped right before the final goBack so the step guard lets it through.
  const leavingRef = React.useRef(false);

  const todayKey = format(new Date(), "yyyy-MM-dd");
  // Before the goal exists there is no id to derive "auto" from; preview
  // the auto swatch with the first palette color.
  const autoColorPreview = GOAL_PALETTE[0];
  const hasTitle = title.trim().length > 0;
  const futureStartDay = startDay && startDay > todayKey ? startDay : null;

  const goToStep = (next: number) => {
    if (next > LAST_TYPING_STEP) {
      Keyboard.dismiss();
    }
    setStep(next);
  };

  const advance = () => {
    if (step < LAST_STEP) {
      goToStep(step + 1);
    }
  };

  // Header chevron: previous step while mid-flow, otherwise leave the screen.
  // The swipe-back gesture is off past step 0 so it cannot drop progress.
  React.useEffect(() => {
    const onBack = () => {
      if (step > 0) {
        void haptics.navigate();
        goToStep(step - 1);
      } else {
        navigation.goBack();
      }
    };
    navigation.setOptions({
      title: "New Goal",
      gestureEnabled: step === 0,
      headerLeft: () => (
        <Pressable
          onPress={onBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={step > 0 ? "Previous step" : "Back"}
        >
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
      ),
    });
  }, [navigation, step, theme.text]);

  // The Android hardware back button dispatches GO_BACK; treat it like the
  // header chevron so it steps backwards instead of popping the screen.
  React.useEffect(
    () =>
      navigation.addListener("beforeRemove", (event) => {
        if (step === 0 || leavingRef.current) return;
        const type = event.data.action.type;
        if (type !== "GO_BACK" && type !== "POP") return;
        event.preventDefault();
        void haptics.navigate();
        goToStep(step - 1);
      }),
    [navigation, step],
  );

  const editingDraft = editingTaskKey
    ? draftTasks.find((task) => task.key === editingTaskKey)
    : undefined;

  const closeTaskEditor = () => {
    setIsAddingTask(false);
    setEditingTaskKey(null);
  };

  const submitTaskEditor = (value: TaskEditorValue) => {
    if (editingTaskKey) {
      setDraftTasks((prev) =>
        prev.map((task) =>
          task.key === editingTaskKey ? { key: task.key, ...value } : task,
        ),
      );
    } else {
      setDraftTasks((prev) => [
        ...prev,
        { key: `${Date.now()}-${prev.length}`, ...value },
      ]);
    }
    void haptics.success();
    closeTaskEditor();
  };

  const removeDraftTask = (key: string) => {
    void haptics.destructive();
    setDraftTasks((prev) => prev.filter((task) => task.key !== key));
  };

  const createGoal = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || isCreating) {
      void haptics.error();
      return;
    }

    setIsCreating(true);

    // addGoal returns void, so grab the freshly appended goal from the store.
    addGoal(trimmedTitle, target.trim() || undefined, {
      startDay: futureStartDay ?? undefined,
      dueDay: dueDay ?? undefined,
      color: color ?? undefined,
      isPublic,
    });
    const created = useStore.getState().goals.at(-1);
    if (!created) {
      setIsCreating(false);
      return;
    }
    for (const draft of draftTasks) {
      addTask(
        created.id,
        draft.title,
        draft.frequency,
        draft.customFrequency,
        draft.timing,
      );
    }

    void haptics.success();
    leavingRef.current = true;
    navigation.goBack();
  };

  // The one button for the current step. Null means nothing is rendered —
  // never a greyed-out button.
  const primaryAction = ((): { label: string; onPress: () => void } | null => {
    switch (step) {
      case 0:
        return hasTitle ? { label: "Next", onPress: advance } : null;
      case 1:
        return { label: target.trim() ? "Next" : "Skip", onPress: advance };
      case 2:
        return {
          label: dueDay || futureStartDay ? "Next" : "Skip",
          onPress: advance,
        };
      case 3:
        return { label: "Next", onPress: advance };
      default:
        return {
          label: isCreating ? "Creating…" : "Create goal",
          onPress: createGoal,
        };
    }
  })();

  const headline: TextStyle = {
    fontSize: 26,
    fontWeight: "800",
    color: theme.text,
  };
  const hint: TextStyle = { fontSize: 15, color: theme.textSecondary };
  const sectionLabel: TextStyle = {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: theme.textSecondary,
  };
  const bigInput: TextStyle = {
    fontSize: 22,
    fontWeight: "600",
    color: theme.text,
    paddingVertical: 8,
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <>
            <Text style={headline}>What&apos;s the goal?</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              autoFocus
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => {
                if (!hasTitle) {
                  void haptics.warning();
                  return;
                }
                void haptics.navigate();
                advance();
              }}
              keyboardAppearance={isDark ? "dark" : "light"}
              selectionColor={theme.primary}
              style={bigInput}
            />
          </>
        );
      case 1:
        return (
          <>
            <Text style={headline}>What&apos;s the target?</Text>
            <Text style={hint}>Optional</Text>
            <TextInput
              value={target}
              onChangeText={setTarget}
              autoFocus
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => {
                void haptics.navigate();
                advance();
              }}
              keyboardAppearance={isDark ? "dark" : "light"}
              selectionColor={theme.primary}
              style={bigInput}
            />
          </>
        );
      case 2:
        return (
          <>
            <Text style={headline}>When should it be done?</Text>
            <View style={{ gap: 8 }}>
              <Text style={sectionLabel}>STARTS</Text>
              <OptionPair
                options={[
                  { value: "today", label: "Today", icon: "play-outline" },
                  {
                    value: "date",
                    label: futureStartDay
                      ? formatDay(futureStartDay)
                      : "On a date",
                    icon: "calendar-outline",
                  },
                ]}
                value={futureStartDay ? "date" : "today"}
                onSelect={(value) => {
                  if (value === "today") {
                    setStartDay(null);
                    return;
                  }
                  setIsStartPickerOpen(true);
                }}
              />
            </View>
            <View style={{ gap: 8 }}>
              <Text style={sectionLabel}>DUE</Text>
              <OptionPair
                options={[
                  {
                    value: "open",
                    label: "Open-ended",
                    icon: "infinite-outline",
                  },
                  {
                    value: "date",
                    label: dueDay ? formatDay(dueDay) : "By a date",
                    icon: "flag-outline",
                  },
                ]}
                value={dueDay ? "date" : "open"}
                onSelect={(value) => {
                  if (value === "open") {
                    setDueDay(null);
                    return;
                  }
                  setIsDuePickerOpen(true);
                }}
              />
            </View>
          </>
        );
      case 3:
        return (
          <>
            <Text style={headline}>Who can see it?</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <OptionPair
                  options={[
                    {
                      value: "private",
                      label: "Private",
                      icon: "lock-closed-outline",
                    },
                    { value: "public", label: "Public", icon: "globe-outline" },
                  ]}
                  value={isPublic ? "public" : "private"}
                  onSelect={(value) => setIsPublic(value === "public")}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Goal color"
                onPress={() => {
                  void haptics.tap();
                  setIsColorPickerOpen(true);
                }}
                style={{
                  width: 44,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: theme.border,
                  backgroundColor: theme.surface,
                }}
              >
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: color ?? autoColorPreview,
                    borderWidth: color ? 0 : 2,
                    borderColor: theme.border,
                  }}
                />
              </Pressable>
            </View>
            {isPublic ? (
              <Text style={hint}>Friends can follow along and nudge you.</Text>
            ) : null}
          </>
        );
      default:
        return (
          <>
            <Text style={headline}>Add tasks</Text>
            <Text style={hint}>
              The repeating steps that move this goal forward.
            </Text>
            {draftTasks.map((task) => (
              <Pressable
                key={task.key}
                onPress={() => {
                  void haptics.tap();
                  setEditingTaskKey(task.key);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${task.title}`}
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
                    {describeTaskSchedule({ ...task, ...task.timing })}
                  </Text>
                </View>
                <Pressable
                  onPress={() => removeDraftTask(task.key)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${task.title}`}
                  style={{ padding: 4, opacity: 0.5 }}
                >
                  <Ionicons
                    name="trash-outline"
                    size={16}
                    color={theme.textSecondary}
                  />
                </Pressable>
              </Pressable>
            ))}
            <Pressable
              onPress={() => {
                void haptics.tap();
                setIsAddingTask(true);
              }}
              accessibilityRole="button"
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
                + Add task
              </Text>
            </Pressable>
          </>
        );
    }
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background }}
      edges={["bottom", "left", "right"]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        // Only this screen's own fields should lift the layout. Later steps
        // have none, and the task editor's keyboard must not shift the dimmed
        // screen behind its modal.
        enabled={step <= LAST_TYPING_STEP}
        keyboardVerticalOffset={
          Platform.OS === "ios" ? insets.top + IOS_NAV_BAR_HEIGHT : 0
        }
      >
        <View
          style={{
            flexDirection: "row",
            gap: 6,
            paddingHorizontal: 20,
            marginTop: 12,
          }}
        >
          {Array.from({ length: STEP_COUNT }, (_, index) => (
            <View
              key={index}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                backgroundColor:
                  index <= step
                    ? theme.primary
                    : withAlpha(theme.textSecondary, 0.18),
              }}
            />
          ))}
        </View>

        <Animated.View
          key={step}
          entering={FadeInRight.duration(220)}
          exiting={FadeOutLeft.duration(160)}
          style={{ flex: 1 }}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, gap: 16 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {renderStep()}
          </ScrollView>
        </Animated.View>

        {primaryAction ? (
          <View style={{ padding: 20, paddingTop: 8 }}>
            <Pressable
              onPress={() => {
                void haptics.press();
                primaryAction.onPress();
              }}
              accessibilityRole="button"
              style={({ pressed }) => ({
                backgroundColor: theme.primary,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: "center",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text
                style={{ color: "#ffffff", fontWeight: "700", fontSize: 16 }}
              >
                {primaryAction.label}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <DatePickerModal
        visible={isDuePickerOpen}
        title="Reach this goal by…"
        initialDay={dueDay ?? undefined}
        minDay={futureStartDay ?? todayKey}
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
          // Backing out without a future day just means "start today".
          setStartDay((current) =>
            current && current > todayKey ? current : null,
          );
        }}
      />

      <GoalColorPicker
        visible={isColorPickerOpen}
        selected={color ?? undefined}
        autoColor={autoColorPreview}
        onSelect={setColor}
        onClose={() => setIsColorPickerOpen(false)}
      />

      <TaskEditorModal
        visible={isAddingTask || editingTaskKey !== null}
        heading={editingTaskKey ? "Edit Task" : "New Task"}
        submitLabel={editingTaskKey ? "Save" : "Add"}
        initial={editingDraft}
        onSubmit={submitTaskEditor}
        onClose={() => {
          void haptics.tap();
          closeTaskEditor();
        }}
      />
    </SafeAreaView>
  );
}
