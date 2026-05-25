import React from "react";
import { isToday } from "date-fns";
import { useStore } from "../store";
import {
  getNextTrackingDate,
  getPreviousTrackingDate,
} from "../lib/dateContext";
import { haptics } from "../utils/haptics";
import CalendarModal from "./CalendarModal";
import DateContextCard from "./DateContextCard";

type TrackingDateControlsProps = {
  hasCompletions: boolean;
};

export default function TrackingDateControls({
  hasCompletions,
}: TrackingDateControlsProps) {
  const selectedDate = useStore((s) => s.selectedDate);
  const setSelectedDate = useStore((s) => s.setSelectedDate);
  const freezeDay = useStore((s) => s.freezeDay);
  const unfreezeDay = useStore((s) => s.unfreezeDay);
  const isDayFrozen = useStore((s) => s.isDayFrozen);
  const getFreezeReason = useStore((s) => s.getFreezeReason);
  const [calendarVisible, setCalendarVisible] = React.useState(false);

  return (
    <>
      <DateContextCard
        selectedDate={selectedDate}
        isFrozen={isDayFrozen(selectedDate)}
        freezeReason={getFreezeReason(selectedDate)}
        hasCompletions={hasCompletions}
        onPress={() => {
          void haptics.tap();
          setCalendarVisible(true);
        }}
        onPreviousDay={() => {
          void haptics.tap();
          setSelectedDate(getPreviousTrackingDate(selectedDate));
        }}
        onNextDay={() => {
          if (isToday(selectedDate)) {
            void haptics.warning();
            return;
          }

          void haptics.tap();
          setSelectedDate(getNextTrackingDate(selectedDate));
        }}
        onFreezeDay={(reason) => {
          freezeDay(selectedDate, reason);
        }}
        onUnfreezeDay={() => {
          unfreezeDay(selectedDate);
        }}
      />

      <CalendarModal
        visible={calendarVisible}
        selectedDate={selectedDate}
        onClose={() => setCalendarVisible(false)}
        onSelectDate={(date) => setSelectedDate(date)}
      />
    </>
  );
}
