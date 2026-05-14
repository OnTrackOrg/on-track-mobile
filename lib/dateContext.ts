import { addDays, isToday, startOfDay, subDays } from "date-fns";

export const getPreviousTrackingDate = (selectedDate: Date): Date => subDays(selectedDate, 1);

export const getNextTrackingDate = (selectedDate: Date, today: Date = new Date()): Date => {
  if (isToday(selectedDate)) {
    return startOfDay(today);
  }

  const nextDate = addDays(selectedDate, 1);
  const normalizedToday = startOfDay(today);

  return nextDate > normalizedToday ? normalizedToday : nextDate;
};
