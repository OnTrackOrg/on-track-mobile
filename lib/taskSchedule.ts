import { format } from "date-fns";
import { Task, TaskTime } from "../types";
import { getTaskTimesPerDay, getTaskWeekdays } from "../store";

export const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"] as const;
export const WEEKDAY_SHORT = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

/** Sorted, de-duplicated, in-range weekday list (0 = Sunday … 6 = Saturday). */
export const normalizeWeekdays = (weekdays: number[]): number[] =>
  [...new Set(weekdays)]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b);

export const formatWeekdays = (weekdays: number[]): string => {
  const days = normalizeWeekdays(weekdays);
  if (days.length === 7) return "every day";
  const names = days.map((day) => WEEKDAY_SHORT[day]);
  if (names.length === 0) return "";
  if (names.length === 1) return `every ${names[0]}`;
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return names.join(", ");
};

// Times of day ----------------------------------------------------------------

export const MAX_TIMES_PER_DAY = 24;

/** Reminder lead times the Notify row cycles through, in minutes. */
export const REMINDER_LEADS = [0, 5, 15, 60] as const;

export const describeLead = (minutes: number): string =>
  minutes === 0
    ? "At time"
    : minutes % 60 === 0
      ? `${minutes / 60} hr before`
      : `${minutes} min before`;

/** Quick picks offered under each time row. */
export const QUICK_TIMES = [
  "07:00",
  "08:00",
  "09:00",
  "12:00",
  "13:00",
  "18:00",
  "20:00",
  "21:00",
] as const;

export const timeToMinutes = (at: string): number => {
  const [hours, minutes] = at.split(":").map(Number);
  return hours * 60 + minutes;
};

export const minutesToTime = (total: number): string => {
  const clamped = Math.min(23 * 60 + 59, Math.max(0, Math.round(total)));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

/**
 * `n` times spread evenly across 08:00–21:00 (one dose lands at 09:00),
 * snapped to the half hour, or the quarter hour past six a day.
 */
export const spreadTimes = (n: number): string[] => {
  if (n <= 1) return ["09:00"];
  const start = 8 * 60;
  const end = 21 * 60;
  const snap = n > 6 ? 15 : 30;
  return Array.from({ length: n }, (_, i) =>
    minutesToTime(
      Math.round((start + ((end - start) * i) / (n - 1)) / snap) * snap,
    ),
  );
};

/** "HH:mm" in the device's own clock style, e.g. "2:30 PM" or "14:30". */
export const formatClock = (at: string): string => {
  const [hours, minutes] = at.split(":").map(Number);
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
};

const describeTimes = (times: TaskTime[]): string =>
  times.length <= 3
    ? times.map((time) => formatClock(time.at)).join(", ")
    : `${times.length}× a day from ${formatClock(times[0].at)}`;

/** Bare cadence, e.g. "daily", "Tue & Thu", "3 times per week", "once". */
export const describeTaskCadence = (task: {
  frequency: Task["frequency"];
  customFrequency?: Task["customFrequency"];
}): string => {
  const weekdays = getTaskWeekdays(task);
  if (weekdays) {
    return formatWeekdays(weekdays);
  }
  if (task.frequency === "custom" && task.customFrequency) {
    const period = task.customFrequency.type === "weekly" ? "week" : "month";
    return `${task.customFrequency.target} times per ${period}`;
  }
  return task.frequency;
};

/**
 * One-line schedule label shared by Today rows, goal task rows, and the new
 * goal screen, so schedules read the same everywhere: the cadence, then a
 * one-off's day, then its times of day or doses per day.
 */
export const describeTaskSchedule = (
  task: Pick<
    Task,
    "frequency" | "customFrequency" | "timesPerDay" | "times" | "onDay"
  >,
): string => {
  const parts = [describeTaskCadence(task)];
  if (task.frequency === "once" && task.onDay) {
    parts.push(format(new Date(`${task.onDay}T00:00:00`), "EEE, MMM d"));
  }
  if (task.times?.length) {
    parts.push(describeTimes(task.times));
  } else if (getTaskTimesPerDay(task) > 1) {
    parts.push(`${getTaskTimesPerDay(task)}× a day`);
  }
  return parts.join(" · ");
};
