import {
  addDays,
  differenceInCalendarDays,
  format,
  startOfWeek,
} from "date-fns";
import { Goal, Task } from "../types";
import { getGoalStartDate, getTaskWeekdays } from "../store";

/**
 * Read-only numbers for an achieved goal's compressed view. Everything is
 * keyed by local calendar day ("yyyy-MM-dd"), never UTC, and bounded by the
 * day the goal was achieved so the summary never moves after the fact.
 */

export type AchievedWindow = {
  startDay: string; // "yyyy-MM-dd" the goal's history begins
  endDay: string; // "yyyy-MM-dd" the goal was achieved
  days: number; // inclusive calendar days from startDay to endDay (≥ 1)
};

export type WeeklyCount = { weekStartDay: string; count: number };

export type TaskCount = { task: Task; count: number };

const toDayKey = (date: Date): string => format(date, "yyyy-MM-dd");

const dayKeyToDate = (key: string): Date => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day); // local calendar day, not UTC
};

const weekStartKey = (date: Date): string =>
  toDayKey(startOfWeek(date, { weekStartsOn: 0 })); // 0 = Sunday

export const getAchievedWindow = (goal: Goal): AchievedWindow | null => {
  if (goal.completedAt === undefined) return null;
  const startDay = toDayKey(getGoalStartDate(goal));
  const endDay = toDayKey(new Date(goal.completedAt));
  const days =
    differenceInCalendarDays(dayKeyToDate(endDay), dayKeyToDate(startDay)) + 1;
  return { startDay, endDay, days: Math.max(1, days) };
};

/**
 * Every completion across the goal's tasks dated on or before `endDay`.
 * Completions backfilled before the start day are real data and count.
 */
export const completionsUpTo = (goal: Goal, endDay: string): Date[] =>
  goal.tasks.flatMap((task) =>
    task.completions.filter((date) => toDayKey(date) <= endDay),
  );

export const totalCompletions = (goal: Goal, window: AchievedWindow): number =>
  completionsUpTo(goal, window.endDay).length;

/** Distinct calendar days (≤ endDay) with at least one completion. */
export const activeDays = (goal: Goal, window: AchievedWindow): number =>
  new Set(completionsUpTo(goal, window.endDay).map(toDayKey)).size;

/**
 * Completion counts per Sunday-based week, one entry for every week from
 * the week containing startDay through the week containing endDay (weeks
 * with nothing done stay in as zeros so bars keep their spacing).
 * Completions before the first week fall outside the chart and are not
 * bucketed.
 */
export const weeklyCompletionCounts = (
  goal: Goal,
  window: AchievedWindow,
): WeeklyCount[] => {
  const end = dayKeyToDate(window.endDay);
  const counts = new Map<string, number>();
  for (
    let week = startOfWeek(dayKeyToDate(window.startDay), { weekStartsOn: 0 });
    week <= end;
    week = addDays(week, 7)
  ) {
    counts.set(toDayKey(week), 0);
  }
  for (const date of completionsUpTo(goal, window.endDay)) {
    const key = weekStartKey(date);
    const current = counts.get(key);
    if (current !== undefined) counts.set(key, current + 1);
  }
  return [...counts.entries()].map(([weekStartDay, count]) => ({
    weekStartDay,
    count,
  }));
};

/**
 * Longest run of consecutive scheduled days, each with a completion, for
 * daily and weekday-pinned tasks inside the window. Days a pinned task is
 * not scheduled on neither extend nor break its run. 0 when the goal has
 * no such tasks.
 */
export const longestDailyStreak = (
  goal: Goal,
  window: AchievedWindow,
): number => {
  const start = dayKeyToDate(window.startDay);
  const end = dayKeyToDate(window.endDay);
  let best = 0;
  for (const task of goal.tasks) {
    const weekdays = getTaskWeekdays(task);
    if (task.frequency !== "daily" && weekdays === null) continue;
    const doneDays = new Set(task.completions.map(toDayKey));
    let run = 0;
    for (let day = start; day <= end; day = addDays(day, 1)) {
      if (weekdays && !weekdays.includes(day.getDay())) continue;
      if (doneDays.has(toDayKey(day))) {
        run += 1;
        best = Math.max(best, run);
      } else {
        run = 0;
      }
    }
  }
  return best;
};

/** Completions (≤ endDay) per task, most done first; tasks at zero are left out. */
export const taskCompletionCounts = (
  goal: Goal,
  window: AchievedWindow,
): TaskCount[] =>
  goal.tasks
    .map((task) => ({
      task,
      count: task.completions.filter((date) => toDayKey(date) <= window.endDay)
        .length,
    }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count);
