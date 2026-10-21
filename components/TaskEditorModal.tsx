import React from "react";
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  SlideInDown,
  useAnimatedKeyboard,
  useAnimatedStyle,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addDays, format } from "date-fns";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";
import { CustomFrequency, Frequency, TaskTiming } from "../types";
import {
  MAX_TIMES_PER_DAY,
  QUICK_TIMES,
  WEEKDAY_LETTERS,
  describeTaskCadence,
  formatClock,
  minutesToTime,
  normalizeWeekdays,
  spreadTimes,
  timeToMinutes,
} from "../lib/taskSchedule";
import { ensureReminderPermission } from "../lib/taskReminders";
import DatePickerModal from "./DatePickerModal";

export type TaskEditorValue = {
  title: string;
  frequency: Frequency;
  customFrequency?: CustomFrequency;
  timing: TaskTiming;
};

const MAX_WEEKLY_CUSTOM_TARGET = 7;
const MAX_MONTHLY_CUSTOM_TARGET = 31;
const NUDGE_MINUTES = 15;

// How the custom frequency is being edited: a floating per-period target or
// explicit weekdays (issue #162).
type CustomMode = "weekly" | "monthly" | "weekdays";

type IconName = keyof typeof Ionicons.glyphMap;

type TaskEditorModalProps = {
  visible: boolean;
  heading: string;
  submitLabel: string;
  initial?: TaskEditorValue;
  onSubmit: (value: TaskEditorValue) => void;
  onClose: () => void;
  onDelete?: () => void;
};

const getMaxCustomTarget = (type: CustomFrequency["type"]) =>
  type === "weekly" ? MAX_WEEKLY_CUSTOM_TARGET : MAX_MONTHLY_CUSTOM_TARGET;

const normalizeCustomTarget = (target: number, type: CustomFrequency["type"]) =>
  Math.min(getMaxCustomTarget(type), Math.max(1, target));

const sortTimes = (times: string[]) => [...times].sort();

const describeDay = (day: string): string => {
  const today = new Date();
  if (day === format(today, "yyyy-MM-dd")) return "Today";
  if (day === format(addDays(today, 1), "yyyy-MM-dd")) return "Tomorrow";
  return format(new Date(`${day}T00:00:00`), "EEE, MMM d");
};

/**
 * Shared task editor used by GoalScreen (add/edit) and NewGoalScreen (draft
 * tasks), so schedules — weekday pinning, doses per day and reminders —
 * behave identically in both places.
 */
export default function TaskEditorModal({
  visible,
  heading,
  submitLabel,
  initial,
  onSubmit,
  onClose,
  onDelete,
}: TaskEditorModalProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  // KeyboardAvoidingView never lifts this sheet inside the Modal on iOS, so
  // the keyboard covered the whole editor. Track the keyboard frame directly;
  // the sheet's home-indicator padding can tuck behind the keyboard.
  const keyboard = useAnimatedKeyboard();
  const keyboardLift = useAnimatedStyle(() => ({
    paddingBottom:
      Platform.OS === "ios"
        ? Math.max(keyboard.height.value - insets.bottom, 0)
        : 0,
  }));

  const [title, setTitle] = React.useState("");
  const [frequency, setFrequency] = React.useState<Frequency>("daily");
  const [customMode, setCustomMode] = React.useState<CustomMode>("weekly");
  const [customTarget, setCustomTarget] = React.useState(3);
  const [weekdays, setWeekdays] = React.useState<number[]>([]);
  const [perDay, setPerDay] = React.useState(1);
  const [reminders, setReminders] = React.useState<string[]>([]);
  const [onDay, setOnDay] = React.useState<string | null>(null);
  const [isRepeatOpen, setIsRepeatOpen] = React.useState(false);
  const [openReminder, setOpenReminder] = React.useState<number | null>(null);
  const [isDayPickerOpen, setIsDayPickerOpen] = React.useState(false);

  // Re-seed the fields each time the modal opens for a (possibly different)
  // task.
  React.useEffect(() => {
    if (!visible) return;
    setTitle(initial?.title ?? "");
    setFrequency(initial?.frequency ?? "daily");
    const custom = initial?.customFrequency;
    const initialWeekdays =
      custom?.weekdays && custom.weekdays.length > 0
        ? normalizeWeekdays(custom.weekdays)
        : [];
    if (initialWeekdays.length > 0) {
      setCustomMode("weekdays");
    } else {
      setCustomMode(custom?.type ?? "weekly");
    }
    setCustomTarget(custom?.target ?? 3);
    setWeekdays(initialWeekdays);
    const timing = initial?.timing;
    setPerDay(timing?.timesPerDay ?? 1);
    setReminders(timing?.reminders ?? []);
    setOnDay(timing?.onDay ?? null);
    setIsRepeatOpen(false);
    setOpenReminder(null);
  }, [initial, visible]);

  const isOnce = frequency === "once";
  const doses = isOnce ? 1 : perDay;

  const stepperType: CustomFrequency["type"] =
    customMode === "monthly" ? "monthly" : "weekly";

  const adjustCustomTarget = (delta: number) => {
    const nextTarget = normalizeCustomTarget(customTarget + delta, stepperType);
    if (nextTarget === customTarget) {
      void haptics.warning();
      return;
    }
    void haptics.toggle();
    setCustomTarget(nextTarget);
  };

  const toggleWeekday = (day: number) => {
    void haptics.toggle();
    setWeekdays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : normalizeWeekdays([...prev, day]),
    );
  };

  const selectFrequency = (next: Frequency) => {
    void haptics.toggle();
    setFrequency(next);
    // Custom keeps its sub-options visible; the rest close the row.
    if (next !== "custom") setIsRepeatOpen(false);
  };

  const adjustPerDay = (delta: number) => {
    const next = Math.min(MAX_TIMES_PER_DAY, Math.max(1, perDay + delta));
    if (next === perDay) {
      void haptics.warning();
      return;
    }
    void haptics.toggle();
    setPerDay(next);
  };

  const allowReminders = async (): Promise<boolean> => {
    if (await ensureReminderPermission()) return true;
    void haptics.warning();
    Alert.alert(
      "Notifications are off",
      "Allow notifications for OnTrack in Settings to get reminders.",
      [
        { text: "Not now", style: "cancel" },
        { text: "Open Settings", onPress: () => void Linking.openSettings() },
      ],
    );
    return false;
  };

  // First reminder(s): one per dose, spread across the day.
  const turnOnReminders = async () => {
    if (!(await allowReminders())) return;
    void haptics.toggle();
    const seeded = spreadTimes(doses);
    setReminders(seeded);
    setOpenReminder(seeded.length === 1 ? 0 : null);
  };

  const turnOffReminders = () => {
    void haptics.toggle();
    setReminders([]);
    setOpenReminder(null);
  };

  // Another reminder an hour after the latest, opened for picking a time.
  const addReminder = () => {
    if (reminders.length >= MAX_TIMES_PER_DAY) {
      void haptics.warning();
      return;
    }
    void haptics.toggle();
    const latest = reminders.length
      ? timeToMinutes(reminders[reminders.length - 1])
      : 8 * 60;
    const next = sortTimes([...reminders, minutesToTime(latest + 60)]);
    setReminders(next);
    setOpenReminder(next.length - 1);
  };

  const removeReminder = (index: number) => {
    void haptics.toggle();
    setReminders((prev) => prev.filter((_, i) => i !== index));
    setOpenReminder(null);
  };

  const toggleReminderRow = (index: number) => {
    void haptics.tap();
    // Settle the order when a row closes so times read top to bottom.
    setReminders(sortTimes);
    setOpenReminder((current) => (current === index ? null : index));
  };

  const pickQuickTime = (index: number, at: string) => {
    void haptics.toggle();
    setReminders((prev) =>
      sortTimes(prev.map((time, i) => (i === index ? at : time))),
    );
    setOpenReminder(null);
  };

  const nudgeReminder = (index: number, delta: number) => {
    const minutes = timeToMinutes(reminders[index]) + delta;
    if (minutes < 0 || minutes > 23 * 60 + 59) {
      void haptics.warning();
      return;
    }
    void haptics.toggle();
    setReminders((prev) =>
      prev.map((time, i) => (i === index ? minutesToTime(minutes) : time)),
    );
  };

  const submit = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      void haptics.error();
      return;
    }

    let customFrequency: CustomFrequency | undefined;
    if (frequency === "custom") {
      if (customMode === "weekdays") {
        if (weekdays.length === 0) {
          void haptics.error();
          setIsRepeatOpen(true);
          return;
        }
        customFrequency = {
          type: "weekly",
          target: weekdays.length,
          weekdays: normalizeWeekdays(weekdays),
        };
      } else {
        customFrequency = {
          type: customMode,
          target: normalizeCustomTarget(customTarget, customMode),
        };
      }
    }

    onSubmit({
      title: trimmedTitle,
      frequency,
      customFrequency,
      timing: {
        timesPerDay: doses,
        reminders: reminders.length > 0 ? sortTimes(reminders) : undefined,
        onDay: isOnce ? (onDay ?? undefined) : undefined,
      },
    });
  };

  const close = () => {
    void haptics.tap();
    onClose();
  };

  const pillStyle = (active: boolean) => ({
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: active ? theme.primary : theme.border,
    backgroundColor: active ? theme.primary + "20" : "transparent",
  });

  const pillText = (active: boolean) => ({
    fontWeight: "600" as const,
    color: active ? theme.primary : theme.text,
  });

  const modePill = (mode: CustomMode, label: string) => {
    const active = customMode === mode;
    return (
      <Pressable
        key={mode}
        onPress={() => {
          void haptics.toggle();
          setCustomMode(mode);
          if (mode !== "weekdays") {
            setCustomTarget((current) => normalizeCustomTarget(current, mode));
          }
        }}
        style={pillStyle(active)}
      >
        <Text style={pillText(active)}>{label}</Text>
      </Pressable>
    );
  };

  const divider = (
    <View
      style={{ height: 1, backgroundColor: theme.border, marginLeft: 42 }}
    />
  );

  const rowIcon = (name: IconName) => (
    <Ionicons name={name} size={18} color={theme.primary} />
  );

  // Segmented − value + control (the design's "Per day" stepper).
  const stepper = (value: string, onChange: (delta: number) => void) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: theme.border,
        borderRadius: 9,
        padding: 2,
      }}
    >
      <Pressable
        onPress={() => onChange(-1)}
        hitSlop={4}
        style={{
          width: 32,
          height: 28,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="remove" size={16} color={theme.text} />
      </Pressable>
      <View
        style={{
          minWidth: 44,
          paddingHorizontal: 8,
          paddingVertical: 5,
          borderRadius: 7,
          backgroundColor: theme.surface,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontWeight: "700",
            fontSize: 13,
            color: theme.text,
            fontVariant: ["tabular-nums"],
          }}
        >
          {value}
        </Text>
      </View>
      <Pressable
        onPress={() => onChange(1)}
        hitSlop={4}
        style={{
          width: 32,
          height: 28,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="add" size={16} color={theme.text} />
      </Pressable>
    </View>
  );

  const repeatLabel = (() => {
    if (frequency === "custom") {
      if (customMode === "weekdays") {
        return weekdays.length > 0
          ? describeTaskCadence({
              frequency,
              customFrequency: { type: "weekly", target: 0, weekdays },
            })
          : "Pick days";
      }
      return `${customTarget}× per ${customMode === "weekly" ? "week" : "month"}`;
    }
    return frequency[0].toUpperCase() + frequency.slice(1);
  })();

  const renderCustomOptions = () => (
    <View
      style={{ gap: 8, paddingLeft: 42, paddingRight: 14, paddingBottom: 12 }}
    >
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {modePill("weekly", "per week")}
        {modePill("monthly", "per month")}
        {modePill("weekdays", "specific days")}
      </View>
      {customMode === "weekdays" ? (
        <View style={{ flexDirection: "row", gap: 6 }}>
          {WEEKDAY_LETTERS.map((letter, day) => {
            const selected = weekdays.includes(day);
            return (
              <Pressable
                key={day}
                onPress={() => toggleWeekday(day)}
                style={{
                  flex: 1,
                  aspectRatio: 1,
                  maxWidth: 40,
                  borderRadius: 9999,
                  borderWidth: 1,
                  borderColor: selected ? theme.primary : theme.border,
                  backgroundColor: selected ? theme.primary : theme.surface,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontWeight: "700",
                    color: selected ? "#ffffff" : theme.text,
                  }}
                >
                  {letter}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {stepper(String(customTarget), adjustCustomTarget)}
          <Text style={{ color: theme.text }}>
            times per {customMode === "weekly" ? "week" : "month"}
          </Text>
        </View>
      )}
    </View>
  );

  const renderReminderRow = (time: string, index: number) => {
    const isOpen = openReminder === index;
    return (
      <View
        key={index}
        style={{
          borderTopWidth: index === 0 ? 0 : 1,
          borderTopColor: theme.border,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingHorizontal: 14,
            paddingVertical: 8,
          }}
        >
          {rowIcon("notifications-outline")}
          <Pressable
            onPress={() => toggleReminderRow(index)}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingVertical: 4,
            }}
          >
            <Text
              style={{
                fontSize: 17,
                fontWeight: "700",
                color: theme.text,
                fontVariant: ["tabular-nums"],
              }}
            >
              {formatClock(time)}
            </Text>
            <Ionicons
              name={isOpen ? "chevron-up" : "chevron-down"}
              size={14}
              color={theme.textSecondary}
            />
          </Pressable>
          <Pressable
            onPress={() => removeReminder(index)}
            accessibilityLabel="Remove reminder"
            hitSlop={6}
            style={{
              width: 36,
              height: 36,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name="close-circle"
              size={20}
              color={theme.textSecondary}
            />
          </Pressable>
        </View>
        {isOpen ? (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 6,
              paddingLeft: 42,
              paddingRight: 14,
              paddingBottom: 12,
            }}
          >
            {QUICK_TIMES.map((at) => {
              const active = at === time;
              return (
                <Pressable
                  key={at}
                  onPress={() => pickQuickTime(index, at)}
                  style={{
                    ...pillStyle(active),
                    paddingHorizontal: 9,
                    paddingVertical: 5,
                  }}
                >
                  <Text
                    style={{
                      ...pillText(active),
                      fontSize: 13,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {formatClock(at)}
                  </Text>
                </Pressable>
              );
            })}
            {[-NUDGE_MINUTES, NUDGE_MINUTES].map((delta) => (
              <Pressable
                key={delta}
                onPress={() => nudgeReminder(index, delta)}
                accessibilityLabel={
                  delta < 0 ? "15 minutes earlier" : "15 minutes later"
                }
                style={{
                  ...pillStyle(false),
                  paddingHorizontal: 9,
                  paddingVertical: 5,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                <Ionicons
                  name={delta < 0 ? "remove" : "add"}
                  size={13}
                  color={theme.text}
                />
                <Text style={{ ...pillText(false), fontSize: 13 }}>15m</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  const todayKey = format(new Date(), "yyyy-MM-dd");

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={close}
    >
      <Animated.View
        style={[
          {
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(15, 23, 42, 0.35)",
          },
          keyboardLift,
        ]}
      >
        <Pressable
          onPress={close}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
          }}
        />
        <Animated.View
          entering={SlideInDown.duration(260)}
          style={{
            maxHeight: "92%",
            backgroundColor: theme.surface,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingTop: 8,
            paddingHorizontal: 16,
            paddingBottom: Math.max(insets.bottom, 16) + 8,
            gap: 12,
          }}
        >
          <View
            style={{
              width: 36,
              height: 5,
              borderRadius: 3,
              backgroundColor: theme.border,
              alignSelf: "center",
            }}
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Pressable onPress={close} hitSlop={10}>
              <Text
                style={{
                  fontWeight: "600",
                  fontSize: 15,
                  color: theme.textSecondary,
                }}
              >
                Cancel
              </Text>
            </Pressable>
            <Text
              style={{ fontWeight: "700", fontSize: 17, color: theme.text }}
            >
              {heading}
            </Text>
            <Pressable onPress={submit} hitSlop={10}>
              <Text
                style={{
                  fontWeight: "700",
                  fontSize: 15,
                  color: theme.primary,
                }}
              >
                {submitLabel}
              </Text>
            </Pressable>
          </View>
          <TextInput
            placeholder="Task name"
            value={title}
            onChangeText={setTitle}
            style={{
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 8,
              padding: 10,
              backgroundColor: theme.background,
              color: theme.text,
              fontSize: 14,
            }}
            placeholderTextColor={theme.textSecondary}
            autoFocus={!initial?.title}
            returnKeyType="done"
          />

          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ gap: 12 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View
              style={{
                backgroundColor: theme.background,
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <Pressable
                onPress={() => {
                  void haptics.tap();
                  setIsRepeatOpen((open) => !open);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                }}
              >
                {rowIcon("repeat")}
                <Text
                  style={{
                    flex: 1,
                    fontSize: 15,
                    fontWeight: "600",
                    color: theme.text,
                  }}
                >
                  Repeat
                </Text>
                <Text style={{ fontSize: 15, color: theme.textSecondary }}>
                  {repeatLabel}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={theme.textSecondary}
                  style={{
                    transform: [{ rotate: isRepeatOpen ? "90deg" : "0deg" }],
                  }}
                />
              </Pressable>
              {isRepeatOpen ? (
                <>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 8,
                      flexWrap: "wrap",
                      paddingLeft: 42,
                      paddingRight: 14,
                      paddingBottom: 12,
                    }}
                  >
                    {(["once", "daily", "weekly", "custom"] as Frequency[]).map(
                      (f) => (
                        <Pressable
                          key={f}
                          onPress={() => selectFrequency(f)}
                          style={pillStyle(frequency === f)}
                        >
                          <Text style={pillText(frequency === f)}>{f}</Text>
                        </Pressable>
                      ),
                    )}
                  </View>
                  {frequency === "custom" ? renderCustomOptions() : null}
                </>
              ) : null}
              {divider}
              {isOnce ? (
                <Pressable
                  onPress={() => {
                    void haptics.tap();
                    setIsDayPickerOpen(true);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                  }}
                >
                  {rowIcon("calendar-outline")}
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 15,
                      fontWeight: "600",
                      color: theme.text,
                    }}
                  >
                    Date
                  </Text>
                  <Text style={{ fontSize: 15, color: theme.textSecondary }}>
                    {onDay ? describeDay(onDay) : "Any day"}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={theme.textSecondary}
                  />
                </Pressable>
              ) : (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                  }}
                >
                  {rowIcon("layers-outline")}
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 15,
                      fontWeight: "600",
                      color: theme.text,
                    }}
                  >
                    Per day
                  </Text>
                  {stepper(`${perDay}×`, adjustPerDay)}
                </View>
              )}
              {reminders.length > 0 ? null : (
                <>
                  {divider}
                  <Pressable
                    onPress={() => void turnOnReminders()}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                    }}
                  >
                    {rowIcon("notifications-outline")}
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 15,
                        fontWeight: "600",
                        color: theme.text,
                      }}
                    >
                      Remind me
                    </Text>
                    <Text style={{ fontSize: 15, color: theme.textSecondary }}>
                      Off
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={theme.textSecondary}
                    />
                  </Pressable>
                </>
              )}
            </View>

            {reminders.length > 0 ? (
              <>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 2,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      letterSpacing: 0.6,
                      color: theme.textSecondary,
                    }}
                  >
                    REMIND ME
                  </Text>
                  <Pressable onPress={turnOffReminders} hitSlop={8}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: theme.primary,
                      }}
                    >
                      Off
                    </Text>
                  </Pressable>
                </View>
                <View
                  style={{
                    backgroundColor: theme.background,
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  {reminders.map(renderReminderRow)}
                  {reminders.length < MAX_TIMES_PER_DAY ? (
                    <Pressable
                      onPress={addReminder}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        borderTopWidth: 1,
                        borderTopColor: theme.border,
                      }}
                    >
                      {rowIcon("add")}
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: "600",
                          color: theme.primary,
                        }}
                      >
                        Add reminder
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </>
            ) : null}

            {onDelete ? (
              <Pressable
                onPress={() => {
                  onDelete();
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
          </ScrollView>
        </Animated.View>
      </Animated.View>
      <DatePickerModal
        visible={isDayPickerOpen}
        title="Do this on…"
        initialDay={onDay ?? undefined}
        minDay={onDay && onDay < todayKey ? onDay : todayKey}
        allowClear={Boolean(onDay)}
        onSelect={(day) => setOnDay(day)}
        onClear={() => setOnDay(null)}
        onClose={() => setIsDayPickerOpen(false)}
      />
    </Modal>
  );
}
