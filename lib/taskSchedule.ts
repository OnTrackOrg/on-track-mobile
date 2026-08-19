import { Task } from "../types";
import { getTaskWeekdays } from "../store";

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

/**
 * One-line schedule label shared by Today rows, goal task rows, and the new
 * goal screen, so weekday-pinned tasks read the same everywhere.
 */
export const describeTaskSchedule = (task: {
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
