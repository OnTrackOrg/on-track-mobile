import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";
import IconButton from "./IconButton";

interface CalendarModalProps {
  visible: boolean;
  selectedDate: Date;
  onClose: () => void;
  onSelectDate: (date: Date) => void;
}

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export default function CalendarModal({
  visible,
  selectedDate,
  onClose,
  onSelectDate,
}: CalendarModalProps) {
  const { theme } = useTheme();
  const today = startOfDay(new Date());
  const [displayMonth, setDisplayMonth] = React.useState(
    startOfMonth(selectedDate),
  );

  React.useEffect(() => {
    if (visible) {
      setDisplayMonth(startOfMonth(selectedDate));
    }
  }, [selectedDate, visible]);

  const calendarStart = startOfWeek(startOfMonth(displayMonth), {
    weekStartsOn: 0,
  });
  const calendarEnd = endOfWeek(endOfMonth(displayMonth), { weekStartsOn: 0 });
  const days: Date[] = [];

  for (
    let current = calendarStart;
    current <= calendarEnd;
    current = addDays(current, 1)
  ) {
    days.push(current);
  }

  const canGoForward =
    startOfMonth(displayMonth).getTime() < startOfMonth(today).getTime();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          padding: 24,
          backgroundColor: "rgba(15, 23, 42, 0.4)",
        }}
      >
        <Pressable
          onPress={() => {
            void haptics.tap();
            onClose();
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
            borderRadius: 18,
            padding: 16,
            backgroundColor: theme.surface,
            gap: 14,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View>
              <Text
                style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}
              >
                Choose a date
              </Text>
              <Text style={{ color: theme.textSecondary, marginTop: 2 }}>
                Past days and today are editable.
              </Text>
            </View>
            <IconButton
              icon="close-outline"
              size={22}
              onPress={() => {
                void haptics.tap();
                onClose();
              }}
              padded
            />
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <IconButton
              icon="chevron-back"
              onPress={() => {
                void haptics.tap();
                setDisplayMonth((current) => subMonths(current, 1));
              }}
              circular
            />

            <Text
              style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}
            >
              {format(displayMonth, "MMMM yyyy")}
            </Text>

            <IconButton
              icon="chevron-forward"
              onPress={() => {
                if (!canGoForward) {
                  void haptics.warning();
                  return;
                }

                void haptics.tap();
                setDisplayMonth((current) => addMonths(current, 1));
              }}
              circular
              disabled={!canGoForward}
            />
          </View>

          <View style={{ flexDirection: "row" }}>
            {WEEKDAY_LABELS.map((label, index) => (
              <View
                key={`${label}-${index}`}
                style={{ flex: 1, alignItems: "center", paddingVertical: 4 }}
              >
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  {label}
                </Text>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {days.map((day) => {
              const isDisabled = isAfter(startOfDay(day), today);
              const isSelected = isSameDay(day, selectedDate);
              const isCurrentMonth = isSameMonth(day, displayMonth);
              const isCurrentDay = isSameDay(day, today);

              return (
                <View
                  key={day.toISOString()}
                  style={{
                    width: "14.2857%",
                    paddingVertical: 4,
                    alignItems: "center",
                  }}
                >
                  <Pressable
                    disabled={isDisabled}
                    onPress={() => {
                      void haptics.tap();
                      onSelectDate(startOfDay(day));
                      onClose();
                    }}
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isSelected
                        ? theme.primary
                        : "transparent",
                      borderWidth: isCurrentDay ? 1 : 0,
                      borderColor: isCurrentDay ? theme.primary : "transparent",
                      opacity: isDisabled ? 0.2 : isCurrentMonth ? 1 : 0.45,
                    }}
                  >
                    <Text
                      style={{
                        color: isSelected ? "#ffffff" : theme.text,
                        fontWeight: isSelected || isCurrentDay ? "700" : "500",
                      }}
                    >
                      {format(day, "d")}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => {
                void haptics.tap();
                onSelectDate(today);
                onClose();
              }}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: theme.background,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Text style={{ color: theme.text, fontWeight: "700" }}>
                Today
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void haptics.tap();
                onClose();
              }}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: theme.primary,
              }}
            >
              <Text style={{ color: "#ffffff", fontWeight: "700" }}>Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
