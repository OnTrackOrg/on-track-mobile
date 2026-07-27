import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";
import { withAlpha } from "../utils/color";
import { card } from "./ui";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const keyToDate = (key: string): Date => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
};

type DatePickerModalProps = {
  visible: boolean;
  title: string;
  /** "yyyy-MM-dd" the calendar opens on; defaults to today/minDay. */
  initialDay?: string;
  /** Days before this are not selectable. */
  minDay?: string;
  /** Days after this are not selectable (e.g. a goal's due day). */
  maxDay?: string;
  /** Shows a "Clear" action (e.g. to remove a due date). */
  allowClear?: boolean;
  onSelect: (day: string) => void;
  onClear?: () => void;
  onClose: () => void;
};

/**
 * Month-grid calendar picker (no native dependency). Used for picking a
 * goal's start day and due day.
 */
export default function DatePickerModal({
  visible,
  title,
  initialDay,
  minDay,
  maxDay,
  allowClear,
  onSelect,
  onClear,
  onClose,
}: DatePickerModalProps) {
  const { theme, isDark } = useTheme();
  const todayKey = format(new Date(), "yyyy-MM-dd");

  // Anchor on a month with selectable days: an initial day earlier than
  // minDay (e.g. an already-overdue due date) would open a dead month.
  const anchorDay = React.useMemo(() => {
    const preferred = initialDay ?? minDay ?? todayKey;
    return minDay && preferred < minDay ? minDay : preferred;
  }, [initialDay, minDay, todayKey]);

  const [monthCursor, setMonthCursor] = React.useState(() =>
    startOfMonth(keyToDate(anchorDay)),
  );

  React.useEffect(() => {
    if (visible) {
      setMonthCursor(startOfMonth(keyToDate(anchorDay)));
    }
    // Re-anchor the calendar every time the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const gridDays = React.useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(monthCursor), { weekStartsOn: 0 }),
        end: endOfWeek(endOfMonth(monthCursor), { weekStartsOn: 0 }),
      }),
    [monthCursor],
  );

  const pick = (day: Date) => {
    void haptics.tap();
    onSelect(format(day, "yyyy-MM-dd"));
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: withAlpha("#020617", 0.55),
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{ ...card(theme, isDark), padding: 18, gap: 12 }}
        >
          <Text style={{ fontSize: 17, fontWeight: "800", color: theme.text }}>
            {title}
          </Text>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Pressable
              onPress={() => {
                void haptics.tap();
                setMonthCursor((current) => addMonths(current, -1));
              }}
              hitSlop={8}
              style={{ padding: 6 }}
            >
              <Ionicons name="chevron-back" size={18} color={theme.text} />
            </Pressable>
            <Text style={{ fontWeight: "700", color: theme.text }}>
              {format(monthCursor, "MMMM yyyy")}
            </Text>
            <Pressable
              onPress={() => {
                void haptics.tap();
                setMonthCursor((current) => addMonths(current, 1));
              }}
              hitSlop={8}
              style={{ padding: 6 }}
            >
              <Ionicons name="chevron-forward" size={18} color={theme.text} />
            </Pressable>
          </View>

          <View style={{ flexDirection: "row" }}>
            {WEEKDAY_LABELS.map((label, index) => (
              <Text
                key={`${label}-${index}`}
                style={{
                  flex: 1,
                  textAlign: "center",
                  fontSize: 11,
                  fontWeight: "700",
                  color: theme.textSecondary,
                }}
              >
                {label}
              </Text>
            ))}
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {gridDays.map((day) => {
              const dayKey = format(day, "yyyy-MM-dd");
              const inMonth = isSameMonth(day, monthCursor);
              const disabled =
                (minDay !== undefined && dayKey < minDay) ||
                (maxDay !== undefined && dayKey > maxDay);
              const isToday = dayKey === todayKey;
              const isInitial = dayKey === initialDay;
              return (
                <Pressable
                  key={dayKey}
                  disabled={disabled}
                  onPress={() => pick(day)}
                  style={{
                    width: `${100 / 7}%`,
                    aspectRatio: 1.15,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isInitial
                        ? theme.primary
                        : isToday
                          ? withAlpha(theme.primary, 0.15)
                          : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: isToday || isInitial ? "700" : "500",
                        color: isInitial
                          ? "#ffffff"
                          : disabled
                            ? withAlpha(theme.textSecondary, 0.35)
                            : inMonth
                              ? theme.text
                              : theme.textSecondary,
                      }}
                    >
                      {format(day, "d")}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 2,
            }}
          >
            {allowClear ? (
              <Pressable
                onPress={() => {
                  void haptics.tap();
                  onClear?.();
                  onClose();
                }}
                style={{ paddingVertical: 6, paddingHorizontal: 4 }}
              >
                <Text style={{ color: theme.danger, fontWeight: "600" }}>
                  Clear
                </Text>
              </Pressable>
            ) : (
              <View />
            )}
            <Pressable
              onPress={onClose}
              style={{ paddingVertical: 6, paddingHorizontal: 4 }}
            >
              <Text style={{ color: theme.textSecondary, fontWeight: "600" }}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
