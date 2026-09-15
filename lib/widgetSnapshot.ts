import { addDays, format, subDays } from "date-fns";
import { Goal } from "../types";
import {
  getGoalLifecycleStatus,
  getGoalProgress,
  getGoalStreak,
  getTodayItems,
} from "../store";
import { PersonalOrder, applyOrder } from "./personalOrder";
import { getGoalColor } from "../utils/goalColors";
import { FALLBACK_QUOTES, Quote } from "./quotes";

/**
 * Everything the iOS widgets render, precomputed by the app. Widgets cannot
 * run JS, so the app serialises this into the shared app group whenever the
 * store or accent theme changes (see lib/widgets.ts) and the Swift side in
 * targets/widgets/ only draws it. The shape is mirrored by `Snapshot.swift`;
 * bump `version` when changing it.
 *
 * Two days are included (today and tomorrow) so a widget can roll over at
 * midnight without the app being opened: the timeline shows `days[1]` from
 * midnight on, which is tomorrow's dues with nothing done yet.
 */
export const WIDGET_SNAPSHOT_VERSION = 1;

export interface WidgetGoal {
  id: string;
  title: string;
  /** #rrggbb goal accent (utils/goalColors). */
  color: string;
  /** 0..1 progress for the day, as on the Goals-tab card. */
  percent: number;
  /** "3 tasks · Due Dec 1, 2026", as on the Goals-tab card. */
  subtitle: string;
  /** Longest current streak across the goal's tasks. */
  streak: number;
  /** Tasks still due that day (drives the Auto ranking). */
  pending: number;
  /** 14 daily completion ratios, oldest first (the LAST 14 DAYS strip). */
  strip: number[];
}

export interface WidgetDay {
  /** "yyyy-MM-dd" local calendar day this entry is for. */
  dayKey: string;
  done: number;
  total: number;
  /** First undone task's title, for the lock-screen "Next:" line. */
  nextTask: string | null;
  quote: Quote;
  /** Active goals in the app's own order. */
  goals: WidgetGoal[];
  /** Goal ids ranked "needs you most" first (widget 2b's Auto goal). */
  autoOrder: string[];
}

export interface WidgetSnapshot {
  version: typeof WIDGET_SNAPSHOT_VERSION;
  /** The accent theme's colour (Settings › Appearance), #rrggbb. */
  accent: string;
  /** [today, tomorrow]. */
  days: WidgetDay[];
}

const dayKeyOf = (date: Date): string => format(date, "yyyy-MM-dd");

const dayKeyToDate = (dayKey: string): Date => {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(year, month - 1, day);
};

/**
 * The launch-screen quote pool, rotated once a day. Derived from the
 * calendar day so every device (and the app) agree on today's quote.
 */
export const quoteForDay = (dayKey: string): Quote => {
  const [year, month, day] = dayKey.split("-").map(Number);
  const daysSinceEpoch = Math.floor(
    Date.UTC(year, month - 1, day) / 86_400_000,
  );
  const index =
    ((daysSinceEpoch % FALLBACK_QUOTES.length) + FALLBACK_QUOTES.length) %
    FALLBACK_QUOTES.length;
  return FALLBACK_QUOTES[index];
};

/**
 * Which goal "needs you most": the one with the most undone work, ties
 * broken by the longest streak (the one with the most to lose), then the
 * app's own order. Goals with nothing left still rank, after the rest, so
 * the Auto widget always has something to show.
 */
export const rankGoalsNeedingYou = (goals: WidgetGoal[]): string[] =>
  goals
    .map((goal, index) => ({ goal, index }))
    .sort(
      (a, b) =>
        b.goal.pending - a.goal.pending ||
        b.goal.streak - a.goal.streak ||
        a.index - b.index,
    )
    .map(({ goal }) => goal.id);

const goalSubtitle = (goal: Goal): string =>
  [
    `${goal.tasks.length} task${goal.tasks.length === 1 ? "" : "s"}`,
    goal.target,
    goal.dueDay
      ? `Due ${format(dayKeyToDate(goal.dueDay), "MMM d, yyyy")}`
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

const buildWidgetGoal = (
  goal: Goal,
  day: Date,
  pending: number,
): WidgetGoal => ({
  id: goal.id,
  title: goal.title,
  color: getGoalColor(goal),
  percent: getGoalProgress(goal, day).percent,
  subtitle: goalSubtitle(goal),
  streak: goal.tasks.reduce(
    (best, task) => Math.max(best, getGoalStreak(task)),
    0,
  ),
  pending,
  strip: Array.from(
    { length: 14 },
    (_, index) => getGoalProgress(goal, subDays(day, 13 - index)).percent,
  ),
});

const buildWidgetDay = (
  goals: Goal[],
  sharedGoals: Goal[],
  postponedTasks: Record<string, string[]>,
  day: Date,
  order?: PersonalOrder,
): WidgetDay => {
  const dayKey = dayKeyOf(day);
  const postponedTaskIds = new Set(postponedTasks[dayKey] ?? []);
  const { todo, totals } = getTodayItems(
    goals,
    sharedGoals,
    day,
    postponedTaskIds,
    order,
  );
  const pendingByGoal = new Map<string, number>();
  for (const item of todo) {
    pendingByGoal.set(item.goal.id, (pendingByGoal.get(item.goal.id) ?? 0) + 1);
  }

  const widgetGoals = applyOrder([...goals, ...sharedGoals], order?.goals)
    .filter((goal) => getGoalLifecycleStatus(goal, day) === "active")
    .map((goal) => buildWidgetGoal(goal, day, pendingByGoal.get(goal.id) ?? 0));

  return {
    dayKey,
    done: totals.done,
    total: totals.total,
    nextTask: todo[0]?.task.title ?? null,
    quote: quoteForDay(dayKey),
    goals: widgetGoals,
    autoOrder: rankGoalsNeedingYou(widgetGoals),
  };
};

export const buildWidgetSnapshot = ({
  goals,
  sharedGoals,
  postponedTasks,
  accent,
  order,
  now = new Date(),
}: {
  goals: Goal[];
  sharedGoals: Goal[];
  postponedTasks: Record<string, string[]>;
  accent: string;
  /** The user's own goal/task order, so widgets match the app. */
  order?: PersonalOrder;
  now?: Date;
}): WidgetSnapshot => ({
  version: WIDGET_SNAPSHOT_VERSION,
  accent,
  days: [now, addDays(now, 1)].map((day) =>
    buildWidgetDay(goals, sharedGoals, postponedTasks, day, order),
  ),
});
