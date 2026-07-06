import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { format, isToday, isFuture } from "date-fns";
import { useStore } from "../store";
import {
  getNextTrackingDate,
  getPreviousTrackingDate,
} from "../lib/dateContext";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";
import { card, circleButton } from "./ui";
import CalendarModal from "./CalendarModal";
import FreezeDayModal from "./FreezeDayModal";

type TrackingDateControlsProps = {
  hasCompletions: boolean;
};

// Compact date control from the turn-3 mockups: ‹ [📅 Jul 5] ›.
// Tap the pill for the calendar; long-press it to freeze/unfreeze the day
// (the old freeze banner was cut, the feature was not).
export default function TrackingDateControls({
  hasCompletions,
}: TrackingDateControlsProps) {
  const { theme, isDark } = useTheme();
  const selectedDate = useStore((s) => s.selectedDate);
  const setSelectedDate = useStore((s) => s.setSelectedDate);
  const freezeDay = useStore((s) => s.freezeDay);
  const unfreezeDay = useStore((s) => s.unfreezeDay);
  const isDayFrozen = useStore((s) => s.isDayFrozen);
  const [calendarVisible, setCalendarVisible] = React.useState(false);
  const [freezeVisible, setFreezeVisible] = React.useState(false);

  const viewingToday = isToday(selectedDate);
  const frozen = isDayFrozen(selectedDate);
  const canFreeze = !isFuture(selectedDate) && !hasCompletions;

  const onLongPressPill = () => {
    if (frozen) {
      void haptics.warning();
      unfreezeDay(selectedDate);
      return;
    }
    if (!canFreeze) return;
    void haptics.tap();
    setFreezeVisible(true);
  };

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable
          onPress={() => {
            void haptics.tap();
            setSelectedDate(getPreviousTrackingDate(selectedDate));
          }}
          hitSlop={6}
          style={circleButton(theme, isDark)}
        >
          <Ionicons name="chevron-back" size={18} color={theme.text} />
        </Pressable>

        <Pressable
          onPress={() => {
            void haptics.tap();
            setCalendarVisible(true);
          }}
          onLongPress={onLongPressPill}
          style={{
            ...card(theme, isDark),
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 9999,
          }}
        >
          {frozen ? (
            <Text style={{ fontSize: 14 }}>❄️</Text>
          ) : (
            <Ionicons name="calendar-outline" size={16} color={theme.primary} />
          )}
          <Text style={{ color: theme.text, fontWeight: "700", fontSize: 15 }}>
            {format(selectedDate, "MMM d")}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            if (viewingToday) {
              void haptics.warning();
              return;
            }
            void haptics.tap();
            setSelectedDate(getNextTrackingDate(selectedDate));
          }}
          hitSlop={6}
          style={{
            ...circleButton(theme, isDark),
            opacity: viewingToday ? 0.45 : 1,
          }}
        >
          <Ionicons
            name="chevron-forward"
            size={18}
            color={viewingToday ? theme.textSecondary : theme.text}
          />
        </Pressable>
      </View>

      <CalendarModal
        visible={calendarVisible}
        selectedDate={selectedDate}
        onClose={() => setCalendarVisible(false)}
        onSelectDate={(date) => setSelectedDate(date)}
      />
      <FreezeDayModal
        visible={freezeVisible}
        date={selectedDate}
        onFreeze={(reason) => {
          setFreezeVisible(false);
          freezeDay(selectedDate, reason);
        }}
        onCancel={() => setFreezeVisible(false)}
      />
    </>
  );
}
