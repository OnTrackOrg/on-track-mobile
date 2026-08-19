import React from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";
import { CustomFrequency, Frequency } from "../types";
import { WEEKDAY_LETTERS, normalizeWeekdays } from "../lib/taskSchedule";

export type TaskEditorValue = {
  title: string;
  frequency: Frequency;
  customFrequency?: CustomFrequency;
};

const MAX_WEEKLY_CUSTOM_TARGET = 7;
const MAX_MONTHLY_CUSTOM_TARGET = 31;

// How the custom frequency is being edited: a floating per-period target or
// explicit weekdays (issue #162).
type CustomMode = "weekly" | "monthly" | "weekdays";

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

/**
 * Shared task editor used by GoalScreen (add/edit) and NewGoalScreen (draft
 * tasks), so schedules — including weekday pinning — behave identically in
 * both places.
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

  const [title, setTitle] = React.useState("");
  const [frequency, setFrequency] = React.useState<Frequency>("daily");
  const [customMode, setCustomMode] = React.useState<CustomMode>("weekly");
  const [customTarget, setCustomTarget] = React.useState(3);
  const [weekdays, setWeekdays] = React.useState<number[]>([]);

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
  }, [initial, visible]);

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

    onSubmit({ title: trimmedTitle, frequency, customFrequency });
  };

  const close = () => {
    void haptics.tap();
    onClose();
  };

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
        style={{
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: active ? theme.primary : theme.border,
          backgroundColor: active ? theme.primary + "20" : "transparent",
        }}
      >
        <Text
          style={{
            fontWeight: "600",
            color: active ? theme.primary : theme.text,
          }}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={close}
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
          onPress={close}
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
          <Text style={{ fontWeight: "700", fontSize: 18, color: theme.text }}>
            {heading}
          </Text>
          <TextInput
            placeholder="e.g., Take creatine"
            value={title}
            onChangeText={setTitle}
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
                  backgroundColor:
                    frequency === f ? theme.primary + "20" : "transparent",
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
            ))}
          </View>

          {frequency === "custom" && (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {modePill("weekly", "per week")}
                {modePill("monthly", "per month")}
                {modePill("weekdays", "specific days")}
              </View>

              {customMode === "weekdays" ? (
                <>
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
                            maxWidth: 44,
                            borderRadius: 9999,
                            borderWidth: 1,
                            borderColor: selected
                              ? theme.primary
                              : theme.border,
                            backgroundColor: selected
                              ? theme.primary
                              : theme.background,
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
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                    Due on each selected day, e.g. every Tuesday and Thursday.
                  </Text>
                </>
              ) : (
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
                      {customTarget}
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
                    times per {customMode === "weekly" ? "week" : "month"}
                  </Text>
                </View>
              )}
            </View>
          )}

          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            <Pressable
              onPress={close}
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
              onPress={submit}
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
                {submitLabel}
              </Text>
            </Pressable>
          </View>
          {frequency === "custom" && customMode !== "weekdays" ? (
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
              {customMode === "weekly"
                ? `Choose from 1 to ${MAX_WEEKLY_CUSTOM_TARGET} times per week.`
                : `Choose from 1 to ${MAX_MONTHLY_CUSTOM_TARGET} times per month.`}
            </Text>
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
        </View>
      </View>
    </Modal>
  );
}
