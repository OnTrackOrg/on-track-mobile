import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  Goal,
  Frequency,
  CustomFrequency,
  Task,
  UserAccount,
  FriendProfile,
  FriendRequest,
} from "./types";
import {
  format,
  startOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
  differenceInCalendarDays,
  addDays,
} from "date-fns";
import { normalizeAccountDraft } from "./account";
import { isUuid, makeUuid } from "./lib/ids";
import { STORAGE_KEYS } from "./lib/persistence";

// Date utility functions
const normalizeDate = (date: Date): Date => startOfDay(date);
const dateToKey = (date: Date): string =>
  format(normalizeDate(date), "yyyy-MM-dd");
const isSameDay = (date1: Date, date2: Date): boolean =>
  dateToKey(date1) === dateToKey(date2);

type PersistedTask = Omit<Task, "completions"> & {
  completions?: Array<Date | string>;
};

type PersistedGoal = Omit<Goal, "tasks" | "completedAt"> & {
  tasks?: PersistedTask[];
  subGoals?: PersistedTask[];
  completedAt?: number | string | null;
};

const normalizeTask = (task: PersistedTask): Task => ({
  ...task,
  completions:
    task.completions?.map((completion) =>
      typeof completion === "string" ? new Date(completion) : completion,
    ) || [],
});

const normalizeOptionalTimestamp = (
  value?: number | string | null,
): number | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? undefined : parsed;
};

const normalizeGoal = (goal: PersistedGoal): Goal => ({
  ...goal,
  completedAt: normalizeOptionalTimestamp(goal.completedAt),
  tasks: (goal.tasks ?? goal.subGoals ?? []).map(normalizeTask),
});

// Goal lifecycle -------------------------------------------------------------

export type GoalLifecycleStatus = "draft" | "scheduled" | "active" | "achieved";

export const getGoalLifecycleStatus = (
  goal: Goal,
  referenceDate: Date = new Date(),
): GoalLifecycleStatus => {
  if (goal.completedAt !== undefined) return "achieved";
  if (goal.isDraft) return "draft";
  if (goal.startDay && goal.startDay > dateToKey(referenceDate)) {
    return "scheduled";
  }
  return "active";
};

/** True once the goal's tasks can be due (started on or before this day). */
export const hasGoalStarted = (
  goal: Goal,
  referenceDate: Date = new Date(),
): boolean => {
  if (goal.isDraft) return false;
  return !goal.startDay || goal.startDay <= dateToKey(referenceDate);
};

/** The calendar day the goal's history begins (start day, else creation). */
export const getGoalStartDate = (goal: Goal): Date => {
  if (goal.startDay) {
    const [year, month, day] = goal.startDay.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return normalizeDate(new Date(goal.createdAt));
};

// Helper functions for custom frequency calculations
export const getCustomFrequencyProgress = (
  task: Task,
  referenceDate: Date = new Date(),
) => {
  if (task.frequency !== "custom" || !task.customFrequency) {
    return { completed: 0, target: 0, achieved: false };
  }

  const { type, target } = task.customFrequency;

  let periodStart: Date;
  let periodEnd: Date;

  if (type === "weekly") {
    periodStart = startOfWeek(referenceDate, { weekStartsOn: 0 }); // Sunday start
    periodEnd = endOfWeek(referenceDate, { weekStartsOn: 0 }); // Saturday end
  } else {
    // monthly
    periodStart = startOfMonth(referenceDate);
    periodEnd = endOfMonth(referenceDate);
  }

  const completionsInPeriod = task.completions.filter((date) =>
    isWithinInterval(date, { start: periodStart, end: periodEnd }),
  );

  const completed = completionsInPeriod.length;
  const achieved = completed >= target;

  return { completed, target, achieved, periodStart, periodEnd };
};

export const shouldShowCustomTask = (
  task: Task,
  referenceDate: Date = new Date(),
): boolean => {
  if (task.frequency !== "custom") return true;

  const completedToday = task.completions.some((date) =>
    isSameDay(date, referenceDate),
  );
  const { achieved } = getCustomFrequencyProgress(task, referenceDate);
  return !completedToday && !achieved;
};

export const isOnceTaskCompletedOnDate = (
  task: Task,
  referenceDate: Date = new Date(),
): boolean => {
  if (task.frequency !== "once") {
    return false;
  }

  return task.completions.some((date) => isSameDay(date, referenceDate));
};

export const getGoalProgress = (
  goal: Goal,
  referenceDate: Date = new Date(),
) => {
  const relevantTasks = goal.tasks;

  if (relevantTasks.length === 0) {
    return { completed: 0, total: 0, percent: 0, isComplete: false };
  }

  const normalizedReferenceDate = normalizeDate(referenceDate);
  const selectedWeekStart = startOfWeek(normalizedReferenceDate, {
    weekStartsOn: 0,
  });
  const selectedWeekEnd = endOfWeek(normalizedReferenceDate, {
    weekStartsOn: 0,
  });

  const completed = relevantTasks.reduce((count, task) => {
    if (task.frequency === "daily") {
      return (
        count +
        (task.completions.some((date) =>
          isSameDay(date, normalizedReferenceDate),
        )
          ? 1
          : 0)
      );
    }

    if (task.frequency === "weekly") {
      return (
        count +
        (task.completions.some((date) => {
          const normalizedDate = normalizeDate(date);
          return (
            normalizedDate >= selectedWeekStart &&
            normalizedDate <= selectedWeekEnd
          );
        })
          ? 1
          : 0)
      );
    }

    if (task.frequency === "custom" && task.customFrequency) {
      const completedToday = task.completions.some((date) =>
        isSameDay(date, normalizedReferenceDate),
      );
      const { achieved } = getCustomFrequencyProgress(
        task,
        normalizedReferenceDate,
      );
      return count + (completedToday || achieved ? 1 : 0);
    }

    if (task.frequency === "once") {
      return (
        count +
        (task.completions.some(
          (date) => normalizeDate(date) <= normalizedReferenceDate,
        )
          ? 1
          : 0)
      );
    }

    return count;
  }, 0);

  const percent = completed / relevantTasks.length;
  return {
    completed,
    total: relevantTasks.length,
    percent,
    isComplete: percent >= 1,
  };
};

/**
 * Per-frequency pending/done split for one goal on one calendar day. Lifted
 * from GoalScreen so Today and GoalDetail share the exact same semantics.
 * Tasks in `postponedTaskIds` ("Not Today") move out of pending into their
 * own bucket: not due, not done.
 */
export const getTaskBucketsForDate = (
  goal: Goal,
  date: Date,
  postponedTaskIds?: ReadonlySet<string>,
): { pending: Task[]; completed: Task[]; postponed: Task[] } => {
  const weekStart = startOfWeek(date, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(date, { weekStartsOn: 0 });
  const doneOnDate = (task: Task) =>
    task.completions.some((completion) => isSameDay(completion, date));
  const doneThisWeek = (task: Task) =>
    task.completions.some((completion) =>
      isWithinInterval(completion, { start: weekStart, end: weekEnd }),
    );

  const completed = goal.tasks.filter((task) => {
    if (task.frequency === "custom") {
      return (
        doneOnDate(task) || getCustomFrequencyProgress(task, date).achieved
      );
    }
    if (task.frequency === "daily") return doneOnDate(task);
    if (task.frequency === "weekly") return doneThisWeek(task);
    return isOnceTaskCompletedOnDate(task, date);
  });

  const due = goal.tasks.filter((task) => {
    if (task.frequency === "custom") return shouldShowCustomTask(task, date);
    if (task.frequency === "daily") return !doneOnDate(task);
    if (task.frequency === "weekly") return !doneThisWeek(task);
    return task.completions.length === 0; // once
  });

  const pending = due.filter((task) => !postponedTaskIds?.has(task.id));
  const postponed = due.filter((task) => postponedTaskIds?.has(task.id));

  return { pending, completed, postponed };
};

/**
 * Whether a pending task can be pushed off to another day without making the
 * goal unmeetable. Daily tasks can never move. Repeating tasks need at least
 * as many days left in their period (after `date`, clamped to the goal's due
 * day) as completions still owed. One-off tasks only block on the goal's
 * final day.
 */
export const canPostponeTask = (
  goal: Goal,
  task: Task,
  date: Date = new Date(),
): boolean => {
  const day = normalizeDate(date);
  const dayKey = dateToKey(day);

  if (task.frequency === "daily") return false;

  if (task.frequency === "once") {
    return !goal.dueDay || dayKey < goal.dueDay;
  }

  // weekly behaves like a custom weekly target of 1
  const target =
    task.frequency === "weekly" ? 1 : (task.customFrequency?.target ?? 0);
  if (target <= 0) return true;

  let periodEnd: Date;
  let completedInPeriod: number;
  if (task.frequency === "weekly") {
    const weekStart = startOfWeek(day, { weekStartsOn: 0 });
    const weekEnd = endOfWeek(day, { weekStartsOn: 0 });
    periodEnd = weekEnd;
    completedInPeriod = task.completions.some((completion) =>
      isWithinInterval(completion, { start: weekStart, end: weekEnd }),
    )
      ? 1
      : 0;
  } else {
    const progress = getCustomFrequencyProgress(task, day);
    if (!progress.periodEnd) return true;
    periodEnd = progress.periodEnd;
    completedInPeriod = progress.completed;
  }

  const remainingNeeded = target - completedInPeriod;
  if (remainingNeeded <= 0) return true; // quota already met

  // Days still usable after today: the rest of the period, cut short by the
  // goal's due day when that lands inside the period.
  let lastUsableDay = normalizeDate(periodEnd);
  if (goal.dueDay) {
    const [year, month, dd] = goal.dueDay.split("-").map(Number);
    const due = new Date(year, month - 1, dd);
    if (due < lastUsableDay) lastUsableDay = due;
  }
  const daysLeftAfterToday = differenceInCalendarDays(lastUsableDay, day);

  return remainingNeeded <= daysLeftAfterToday;
};

export type TodayItem = { goal: Goal; task: Task; isShared: boolean };

export const getTodayItems = (
  goals: Goal[],
  sharedGoals: Goal[],
  date: Date,
  postponedTaskIds?: ReadonlySet<string>,
): {
  todo: TodayItem[];
  done: TodayItem[];
  postponed: TodayItem[];
  totals: { done: number; total: number; goalCount: number };
} => {
  const todo: TodayItem[] = [];
  const done: TodayItem[] = [];
  const postponed: TodayItem[] = [];
  const goalIds = new Set<string>();

  const collect = (goal: Goal, isShared: boolean) => {
    if (goal.completedAt !== undefined) return;
    if (!hasGoalStarted(goal, date)) return; // drafts + scheduled starts
    const buckets = getTaskBucketsForDate(goal, date, postponedTaskIds);
    if (buckets.pending.length + buckets.completed.length > 0) {
      goalIds.add(goal.id);
    }
    for (const task of buckets.pending) todo.push({ goal, task, isShared });
    for (const task of buckets.completed) done.push({ goal, task, isShared });
    for (const task of buckets.postponed)
      postponed.push({ goal, task, isShared });
  };

  goals.forEach((goal) => collect(goal, false));
  sharedGoals.forEach((goal) => collect(goal, true));

  return {
    todo,
    done,
    postponed,
    totals: {
      done: done.length,
      total: todo.length + done.length,
      goalCount: goalIds.size,
    },
  };
};

/**
 * View a goal through a member's eyes: their day keys become the tasks'
 * `completions`, so every existing selector works unchanged. Identity for
 * the current user (whose completions already live on `completions` and who
 * never has a memberCompletions entry).
 */
export const goalAsSeenBy = (goal: Goal, userId: string): Goal => {
  const isOtherMember = goal.tasks.some(
    (task) => task.memberCompletions && userId in task.memberCompletions,
  );
  if (!isOtherMember) return goal;

  return {
    ...goal,
    tasks: goal.tasks.map((task) => ({
      ...task,
      completions: (task.memberCompletions?.[userId] ?? []).map((key) => {
        const [year, month, day] = key.split("-").map(Number);
        return new Date(year, month - 1, day); // local calendar day, not UTC
      }),
    })),
  };
};

/**
 * 8-week adherence per docs/social-model.md: mean of the member's daily
 * getGoalProgress percent over the last `windowDays` days, clamped to the
 * goal's age (minimum 1 day).
 */
export const getMemberAdherence = (
  goal: Goal,
  userId: string,
  referenceDate: Date = new Date(),
  windowDays = 56,
): number => {
  const view = goalAsSeenBy(goal, userId);
  const end = normalizeDate(referenceDate);
  const ageDays = differenceInCalendarDays(end, getGoalStartDate(goal)) + 1;
  const days = Math.max(1, Math.min(windowDays, ageDays));

  let sum = 0;
  for (let i = 0; i < days; i++) {
    sum += getGoalProgress(view, addDays(end, -i)).percent;
  }
  return sum / days;
};

export const getCustomFrequencyAlert = (
  task: Task,
  referenceDate: Date = new Date(),
) => {
  if (task.frequency !== "custom" || !task.customFrequency) {
    return null;
  }

  const progress = getCustomFrequencyProgress(task, referenceDate);
  const completedToday = task.completions.some((date) =>
    isSameDay(date, referenceDate),
  );
  const remainingNeeded = Math.max(progress.target - progress.completed, 0);

  if (remainingNeeded <= 0 || !progress.periodEnd) {
    return null;
  }

  const daysRemaining =
    differenceInCalendarDays(progress.periodEnd, normalizeDate(referenceDate)) +
    1;

  if (remainingNeeded > daysRemaining) {
    return {
      tone: "error" as const,
      message: `You can no longer hit this ${task.customFrequency.type} target in the current period.`,
    };
  }

  if (!completedToday && remainingNeeded >= daysRemaining) {
    return {
      tone: "warning" as const,
      message: `Do this today or you will not be able to meet this ${task.customFrequency.type} target.`,
    };
  }

  if (remainingNeeded === daysRemaining - 1) {
    return {
      tone: "notice" as const,
      message: `${remainingNeeded} completion${remainingNeeded === 1 ? "" : "s"} left with ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining in this ${task.customFrequency.type} period.`,
    };
  }

  return null;
};

// Helper to calculate streak for any goal type
export const getGoalStreak = (task: Task): number => {
  let streak = 0;
  const currentDate = new Date();

  if (task.frequency === "custom" && task.customFrequency) {
    // For custom frequencies, count consecutive achieved periods
    const { type } = task.customFrequency;

    const currentProgress = getCustomFrequencyProgress(task, currentDate);
    if (currentProgress.completed >= currentProgress.target) {
      streak++;
    }
    // Whether or not the current period is achieved yet, keep counting from
    // the previous period backwards.
    if (type === "weekly") {
      currentDate.setDate(currentDate.getDate() - 7);
    } else {
      currentDate.setMonth(currentDate.getMonth() - 1);
    }

    while (true) {
      const progress = getCustomFrequencyProgress(task, currentDate);
      if (progress.completed >= progress.target) {
        streak++;
        if (type === "weekly") {
          currentDate.setDate(currentDate.getDate() - 7);
        } else {
          currentDate.setMonth(currentDate.getMonth() - 1);
        }
      } else {
        break; // Streak broken
      }

      // Safety check - don't go back more than 2 years
      if (streak > 104) break;
    }
  } else if (task.frequency === "daily") {
    // For daily tasks, check consecutive days
    while (true) {
      const dateStr = format(currentDate, "yyyy-MM-dd");
      const hasCompletion = task.completions.some(
        (date) => format(date, "yyyy-MM-dd") === dateStr,
      );

      if (hasCompletion) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        break; // Streak broken
      }

      // Safety check - don't go back more than 365 days
      if (streak > 365) break;
    }
  } else if (task.frequency === "weekly") {
    // For weekly tasks, check consecutive weeks
    while (true) {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 }); // Sunday
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 }); // Saturday

      const hasCompletionThisWeek = task.completions.some((date) =>
        isWithinInterval(date, { start: weekStart, end: weekEnd }),
      );

      if (hasCompletionThisWeek) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 7);
      } else {
        break; // Streak broken
      }

      // Safety check - don't go back more than 104 weeks (2 years)
      if (streak > 104) break;
    }
  }

  return streak;
};

// Every id is a real UUID so goals/tasks are born server-compatible and
// sync/invite never have to remap ids (which is how invites used to race).
function makeId() {
  return makeUuid();
}

/**
 * One-time upgrade at rehydrate: goals persisted by pre-UUID builds get
 * their legacy ids rewritten in place. The revision bump makes the next
 * flush upload the rewritten graph.
 */
export const upgradeLegacyIds = (
  goals: Goal[],
): { goals: Goal[]; upgraded: boolean } => {
  const hasLegacy = goals.some(
    (goal) => !isUuid(goal.id) || goal.tasks.some((task) => !isUuid(task.id)),
  );
  if (!hasLegacy) {
    return { goals, upgraded: false };
  }

  return {
    upgraded: true,
    goals: goals.map((goal) => ({
      ...goal,
      id: isUuid(goal.id) ? goal.id : makeUuid(),
      tasks: goal.tasks.map((task) =>
        isUuid(task.id) ? task : { ...task, id: makeUuid() },
      ),
    })),
  };
};

// Sample data for development/testing
export function getSampleGoals(): Goal[] {
  const today = normalizeDate(new Date());
  const daysAgo = (days: number) =>
    normalizeDate(
      new Date(today.getFullYear(), today.getMonth(), today.getDate() - days),
    );

  return [
    {
      id: makeId(),
      title: "Fitness Journey",
      target: "Get in shape",
      createdAt: Date.now() - 90 * 24 * 60 * 60 * 1000, // 90 days ago
      tasks: [
        {
          id: makeId(),
          title: "Morning workout",
          frequency: "daily",
          completions: [
            today,
            daysAgo(1),
            daysAgo(2),
            daysAgo(3),
            daysAgo(4),
            daysAgo(5),
            daysAgo(6),
            // Some earlier scattered completions
            new Date(2025, 8, 20),
            new Date(2025, 8, 22),
            new Date(2025, 8, 24),
            new Date(2025, 8, 15),
            new Date(2025, 8, 17),
            new Date(2025, 8, 19),
            new Date(2025, 8, 10),
            new Date(2025, 8, 12),
            new Date(2025, 8, 14),
          ],
        },
        {
          id: makeId(),
          title: "Drink protein shake",
          frequency: "daily",
          completions: [
            new Date(2025, 6, 2),
            new Date(2025, 6, 4),
            new Date(2025, 6, 6),
            new Date(2025, 6, 9),
            new Date(2025, 6, 11),
            new Date(2025, 7, 2),
            new Date(2025, 7, 5),
            new Date(2025, 7, 7),
            new Date(2025, 7, 10),
            new Date(2025, 7, 12),
            new Date(2025, 7, 15),
            new Date(2025, 7, 17),
            new Date(2025, 7, 20),
            new Date(2025, 7, 22),
            new Date(2025, 7, 25),
            new Date(2025, 8, 3),
            new Date(2025, 8, 5),
            new Date(2025, 8, 8),
            new Date(2025, 8, 10),
            new Date(2025, 8, 13),
          ],
        },
        {
          id: makeId(),
          title: "Go to gym",
          frequency: "custom",
          customFrequency: { type: "weekly", target: 3 },
          completions: [
            today,
            daysAgo(2),
            // Week 4 (Sept 23-29): 3/3 ✓
            new Date(2025, 8, 23),
            new Date(2025, 8, 25),
            new Date(2025, 8, 27),
            // Week 3 (Sept 16-22): 3/3 ✓
            new Date(2025, 8, 16),
            new Date(2025, 8, 18),
            new Date(2025, 8, 20),
            // Week 2 (Sept 9-15): 3/3 ✓
            new Date(2025, 8, 9),
            new Date(2025, 8, 11),
            new Date(2025, 8, 13),
            // Week 1 (Sept 2-8): 3/3 ✓ - This creates a 4-week streak!
            new Date(2025, 8, 2),
            new Date(2025, 8, 4),
            new Date(2025, 8, 6),
          ],
        },
        {
          id: makeId(),
          title: "Meal prep",
          frequency: "custom",
          customFrequency: { type: "weekly", target: 2 },
          completions: [
            // Current week: 1/2 so far
            daysAgo(1),
            // 3-week streak of hitting 2/week
            new Date(2025, 8, 23),
            new Date(2025, 8, 26),
            new Date(2025, 8, 16),
            new Date(2025, 8, 19),
            new Date(2025, 8, 9),
            new Date(2025, 8, 12),
          ],
        },
        {
          id: makeId(),
          title: "Clean house thoroughly",
          frequency: "weekly",
          completions: [
            // 7-week streak! Each completion is one per week
            daysAgo(3),
            new Date(2025, 8, 21), // Week of Sept 21-27
            new Date(2025, 8, 14), // Week of Sept 14-20
            new Date(2025, 8, 7), // Week of Sept 7-13
            new Date(2025, 7, 31), // Week of Aug 31-Sep 6
            new Date(2025, 7, 24), // Week of Aug 24-30
            new Date(2025, 7, 17), // Week of Aug 17-23
          ],
        },
      ],
    },
    {
      id: makeId(),
      title: "Learning Spanish",
      target: "Conversational fluency",
      createdAt: Date.now() - 75 * 24 * 60 * 60 * 1000, // 75 days ago
      tasks: [
        {
          id: makeId(),
          title: "Duolingo practice",
          frequency: "daily",
          completions: [
            today,
            daysAgo(1),
            daysAgo(2),
            new Date(2025, 6, 15),
            new Date(2025, 6, 16),
            new Date(2025, 6, 17),
            new Date(2025, 6, 18),
            new Date(2025, 6, 19),
            new Date(2025, 6, 20),
            new Date(2025, 6, 21),
            new Date(2025, 6, 22),
            new Date(2025, 6, 23),
            new Date(2025, 6, 24),
            new Date(2025, 6, 25),
            new Date(2025, 6, 26),
            new Date(2025, 6, 27),
            new Date(2025, 6, 28),
            new Date(2025, 6, 29),
            new Date(2025, 6, 30),
            new Date(2025, 6, 31),
            new Date(2025, 7, 1),
            new Date(2025, 7, 2),
            new Date(2025, 7, 3),
            new Date(2025, 7, 4),
            new Date(2025, 7, 5),
            new Date(2025, 7, 6),
            new Date(2025, 7, 7),
            new Date(2025, 7, 8),
            new Date(2025, 7, 9),
            new Date(2025, 7, 10),
            new Date(2025, 7, 11),
            new Date(2025, 7, 12),
            new Date(2025, 7, 13),
            new Date(2025, 7, 14),
            new Date(2025, 7, 15),
            new Date(2025, 7, 16),
            new Date(2025, 7, 17),
            new Date(2025, 7, 18),
            new Date(2025, 7, 19),
            new Date(2025, 7, 20),
            new Date(2025, 7, 21),
            new Date(2025, 7, 22),
            new Date(2025, 7, 23),
            new Date(2025, 7, 24),
            new Date(2025, 7, 25),
            new Date(2025, 7, 26),
            new Date(2025, 7, 27),
            new Date(2025, 7, 28),
            new Date(2025, 7, 29),
            new Date(2025, 7, 30),
            new Date(2025, 7, 31),
            new Date(2025, 8, 1),
            new Date(2025, 8, 2),
            new Date(2025, 8, 3),
            new Date(2025, 8, 4),
            new Date(2025, 8, 5),
            new Date(2025, 8, 6),
            new Date(2025, 8, 7),
            new Date(2025, 8, 8),
            new Date(2025, 8, 9),
            new Date(2025, 8, 10),
            new Date(2025, 8, 11),
            new Date(2025, 8, 12),
            new Date(2025, 8, 13),
            new Date(2025, 8, 14),
            new Date(2025, 8, 15),
            new Date(2025, 8, 16),
            new Date(2025, 8, 17),
            new Date(2025, 8, 18),
            new Date(2025, 8, 19),
            new Date(2025, 8, 20),
            new Date(2025, 8, 21),
            new Date(2025, 8, 22),
            new Date(2025, 8, 23),
            new Date(2025, 8, 24),
            new Date(2025, 8, 25),
            new Date(2025, 8, 26),
            new Date(2025, 8, 27),
            new Date(2025, 8, 28),
            new Date(2025, 8, 29),
            new Date(2025, 8, 30),
          ],
        },
        {
          id: makeId(),
          title: "Watch Spanish Netflix",
          frequency: "weekly",
          completions: [
            // 12-week streak! (July to current)
            new Date("2025-07-13"),
            new Date("2025-07-20"),
            new Date("2025-07-27"),
            new Date("2025-08-03"),
            new Date("2025-08-10"),
            new Date("2025-08-17"),
            new Date("2025-08-24"),
            new Date("2025-08-31"),
            new Date("2025-09-07"),
            new Date("2025-09-14"),
            new Date("2025-09-21"),
            new Date("2025-09-28"),
          ],
        },
      ],
    },
    {
      id: makeId(),
      title: "Healthy Habits",
      target: "Better lifestyle",
      createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000, // 60 days ago
      tasks: [
        {
          id: makeId(),
          title: "Drink 8 glasses of water",
          frequency: "daily",
          completions: [
            today,
            new Date("2025-08-02"),
            new Date("2025-08-15"),
            new Date("2025-09-01"),
            new Date("2025-09-20"),
          ],
        },
        {
          id: makeId(),
          title: "Meditate for 10 minutes",
          frequency: "daily",
          completions: [
            daysAgo(1),
            new Date("2025-08-10"),
            new Date("2025-09-05"),
          ],
        },
        {
          id: makeId(),
          title: "Take vitamins",
          frequency: "daily",
          completions: [
            new Date("2025-08-05"),
            new Date("2025-08-20"),
            new Date("2025-09-03"),
          ],
        },
      ],
    },
    {
      id: makeId(),
      title: "Side Project",
      target: "Launch mobile app",
      createdAt: Date.now() - 45 * 24 * 60 * 60 * 1000, // 45 days ago
      tasks: [
        {
          id: makeId(),
          title: "Code for 2 hours",
          frequency: "daily",
          completions: [
            // 3-day streak ending today
            today,
            daysAgo(1),
            daysAgo(2),
            // Some scattered earlier dates
            new Date("2025-09-25"),
            new Date("2025-09-26"),
            new Date("2025-09-28"),
            new Date("2025-09-20"),
            new Date("2025-09-22"),
            new Date("2025-09-15"),
            new Date("2025-09-17"),
          ],
        },
        {
          id: makeId(),
          title: "Write documentation",
          frequency: "weekly",
          completions: [
            new Date("2025-08-18"),
            new Date("2025-08-25"),
            new Date("2025-09-01"),
            new Date("2025-09-08"),
            new Date("2025-09-15"),
            new Date("2025-09-22"),
          ],
        },
        {
          id: makeId(),
          title: "Test on device",
          frequency: "weekly",
          completions: [
            new Date("2025-08-20"),
            new Date("2025-08-27"),
            new Date("2025-09-03"),
            new Date("2025-09-10"),
            new Date("2025-09-17"),
          ],
        },
      ],
    },
  ];
}

// Keep the app on the production store so local development does not reseed demo content.
const CURRENT_MODE = "PROD" as "DEV" | "PROD";
const ACTIVE_STORAGE_KEY =
  CURRENT_MODE === "DEV" ? STORAGE_KEYS.storeDev : STORAGE_KEYS.storeProd;

// Export current mode for UI indicator
export const getCurrentMode = () => CURRENT_MODE;

interface State {
  goals: Goal[];
  sharedGoals: Goal[];
  friends: FriendProfile[];
  friendRequests: FriendRequest[];
  // Outgoing pending friend requests (addressee user ids), so Search keeps
  // showing "Requested" across app restarts.
  sentFriendRequestUserIds: string[];
  // The account id the persisted goals/social slices belong to; null until
  // the first sign-in claims pre-account local data.
  dataOwnerUserId: string | null;
  selectedDate: Date;
  account: UserAccount | null;
  cloudSyncEnabled: boolean;
  syncRevision: number;
  lastSyncedRevision: number;
  // "Not Today" swipes: taskIds postponed per "yyyy-MM-dd" day key.
  postponedTasks: Record<string, string[]>;
  setGoals: (goals: Goal[]) => void;
  setSharedGoals: (sharedGoals: Goal[]) => void;
  setSocialGraph: (
    friends: FriendProfile[],
    friendRequests: FriendRequest[],
    sentFriendRequestUserIds?: string[],
  ) => void;
  claimLocalData: (userId: string) => void;
  toggleSharedTaskCompletion: (
    goalId: string,
    taskId: string,
    date?: Date,
  ) => void;
  setCloudSyncEnabled: (enabled: boolean) => void;
  markGoalsSynced: (revision: number) => void;
  addGoal: (
    title: string,
    target?: string,
    lifecycle?: { isDraft?: boolean; startDay?: string; dueDay?: string },
  ) => void;
  startGoal: (goalId: string, startDay: string) => void;
  setSelectedDate: (date: Date) => void;
  updateGoal: (
    goalId: string,
    updates: {
      title?: string;
      target?: string | null;
      dueDay?: string | null;
      startDay?: string | null;
    },
  ) => void;
  completeGoal: (goalId: string, completedAt?: number) => void;
  reactivateGoal: (goalId: string) => void;
  addTask: (
    goalId: string,
    title: string,
    frequency: Frequency,
    customFrequency?: CustomFrequency,
  ) => void;
  updateTask: (
    goalId: string,
    taskId: string,
    updates: {
      title?: string;
      frequency?: Frequency;
      customFrequency?: CustomFrequency | undefined;
    },
  ) => void;
  deleteTask: (goalId: string, taskId: string) => void;
  toggleTaskCompletion: (goalId: string, taskId: string, date?: Date) => void;
  postponeTask: (taskId: string, date?: Date) => void;
  undoPostponeTask: (taskId: string, date?: Date) => void;
  completionsByDate: () => Record<string, number>;
  deleteGoal: (goalId: string) => void;
  resetAppData: () => void;
  createAccount: (
    displayName: string,
    username?: string,
    email?: string,
  ) => void;
  setAccount: (account: UserAccount | null) => void;
}

// Get initial goals based on store mode
const getInitialGoals = (): Goal[] => {
  // If using dev mode, return sample data, otherwise empty
  return CURRENT_MODE === "DEV" ? getSampleGoals() : [];
};

const normalizeCompletionsForFrequencyChange = (
  task: Task,
  nextFrequency: Frequency,
): Date[] => {
  if (nextFrequency !== "once" || task.frequency === "once") {
    return task.completions;
  }

  if (task.completions.length === 0) {
    return [];
  }

  const latestCompletion = task.completions.reduce((latest, completion) =>
    completion.getTime() > latest.getTime() ? completion : latest,
  );

  return [normalizeDate(latestCompletion)];
};

const buildDirtyGoalState = (goals: Goal[], currentRevision: number) => ({
  goals,
  syncRevision: currentRevision + 1,
});

// Shared by toggleTaskCompletion (owned) and toggleSharedTaskCompletion:
// only ever mutates the current user's `completions`.
const toggleCompletionInGoals = (
  goals: Goal[],
  goalId: string,
  taskId: string,
  normalizedDate: Date,
): Goal[] =>
  goals.map((g) => {
    if (g.id !== goalId) return g;
    return {
      ...g,
      tasks: g.tasks.map((t) => {
        if (t.id !== taskId) return t;

        if (t.frequency === "once") {
          return {
            ...t,
            completions: t.completions.length > 0 ? [] : [normalizedDate],
          };
        }

        const hasCompletion = t.completions.some((completionDate) =>
          isSameDay(completionDate, normalizedDate),
        );
        return {
          ...t,
          completions: hasCompletion
            ? t.completions.filter((x) => !isSameDay(x, normalizedDate))
            : [...t.completions, normalizedDate],
        };
      }),
    };
  });

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      goals: getInitialGoals(), // Dynamic initialization based on store mode
      sharedGoals: [],
      friends: [],
      friendRequests: [],
      sentFriendRequestUserIds: [],
      dataOwnerUserId: null,
      selectedDate: normalizeDate(new Date()),
      account: null,
      cloudSyncEnabled: false,
      syncRevision: 0,
      lastSyncedRevision: 0,
      postponedTasks: {},

      /**
       * This setter is the bridge between remote reads and the existing
       * local-first store. Once we hydrate remote data, Zustand persists
       * it back into AsyncStorage automatically, which keeps a durable
       * offline copy on the device.
       */
      setGoals: (goals) => set({ goals }),

      // Server-authoritative slice: replaced wholesale by fetches, mutated
      // locally only through toggleSharedTaskCompletion.
      setSharedGoals: (sharedGoals) => set({ sharedGoals }),

      // Omitting sentFriendRequestUserIds keeps the current list (local
      // accept/decline updates don't know about outgoing requests).
      setSocialGraph: (friends, friendRequests, sentFriendRequestUserIds) =>
        set((s) => ({
          friends,
          friendRequests,
          sentFriendRequestUserIds:
            sentFriendRequestUserIds ?? s.sentFriendRequestUserIds,
        })),

      /**
       * The persisted goals/social slices belong to one account. Signing in
       * as a different account wipes them so the new user never sees (or
       * imports) the previous user's data. A null owner means pre-account
       * local data, which the signing-in user claims via the import flow.
       */
      claimLocalData: (userId) =>
        set((s) =>
          s.dataOwnerUserId === null || s.dataOwnerUserId === userId
            ? { dataOwnerUserId: userId }
            : {
                dataOwnerUserId: userId,
                goals: [],
                sharedGoals: [],
                friends: [],
                friendRequests: [],
                sentFriendRequestUserIds: [],
                postponedTasks: {},
                syncRevision: 0,
                lastSyncedRevision: 0,
              },
        ),

      /**
       * My completions on shared-goal tasks ride the same revision flush as
       * owned goals (social-model.md invariant 1), hence the revision bump.
       */
      toggleSharedTaskCompletion: (goalId, taskId, date = new Date()) =>
        set((s) => ({
          sharedGoals: toggleCompletionInGoals(
            s.sharedGoals,
            goalId,
            taskId,
            normalizeDate(date),
          ),
          syncRevision: s.syncRevision + 1,
        })),

      /**
       * Cloud sync stays disabled for users who already had purely local
       * device data until we build the explicit import flow. That avoids
       * silently uploading existing offline history before the user says
       * yes. New cloud-first users can safely enable this immediately.
       */
      setCloudSyncEnabled: (enabled) => set({ cloudSyncEnabled: enabled }),

      /**
       * The write path is revision-based instead of operation-based for
       * now. Every local goal/task mutation bumps `syncRevision`, and a
       * successful remote flush records the latest synced revision.
       *
       * That gives us a simple offline-first contract:
       * - local edits always win immediately in the UI
       * - AsyncStorage always has the freshest local copy
       * - Supabase catches up to the newest known revision in the
       *   background whenever cloud sync is enabled
       */
      markGoalsSynced: (revision) =>
        set((s) => ({
          lastSyncedRevision: Math.max(s.lastSyncedRevision, revision),
        })),

      addGoal: (title, target, lifecycle) =>
        set((s) => ({
          ...buildDirtyGoalState(
            [
              ...s.goals,
              {
                id: makeId(),
                title,
                target,
                tasks: [],
                createdAt: Date.now(),
                isDraft: lifecycle?.isDraft || undefined,
                startDay: lifecycle?.isDraft ? undefined : lifecycle?.startDay,
                dueDay: lifecycle?.dueDay,
              },
            ],
            s.syncRevision,
          ),
        })),
      /** Take a goal out of draft (or reschedule it) to begin on `startDay`. */
      startGoal: (goalId, startDay) =>
        set((s) => ({
          ...buildDirtyGoalState(
            s.goals.map((g) =>
              g.id === goalId ? { ...g, isDraft: undefined, startDay } : g,
            ),
            s.syncRevision,
          ),
        })),
      setSelectedDate: (date) =>
        set({
          selectedDate: normalizeDate(date),
        }),
      updateGoal: (goalId, updates) =>
        set((s) => ({
          ...buildDirtyGoalState(
            s.goals.map((g) =>
              g.id === goalId
                ? {
                    ...g,
                    title: updates.title ?? g.title,
                    target:
                      updates.target === null
                        ? undefined
                        : updates.target !== undefined
                          ? updates.target
                          : g.target,
                    dueDay:
                      updates.dueDay === null
                        ? undefined
                        : updates.dueDay !== undefined
                          ? updates.dueDay
                          : g.dueDay,
                    startDay:
                      updates.startDay === null
                        ? undefined
                        : updates.startDay !== undefined
                          ? updates.startDay
                          : g.startDay,
                  }
                : g,
            ),
            s.syncRevision,
          ),
        })),
      completeGoal: (goalId, completedAt = Date.now()) =>
        set((s) => ({
          ...buildDirtyGoalState(
            s.goals.map((g) =>
              g.id === goalId
                ? {
                    ...g,
                    completedAt,
                  }
                : g,
            ),
            s.syncRevision,
          ),
        })),
      reactivateGoal: (goalId) =>
        set((s) => ({
          ...buildDirtyGoalState(
            s.goals.map((g) => {
              if (g.id !== goalId) {
                return g;
              }

              const { completedAt, ...activeGoal } = g;
              return activeGoal;
            }),
            s.syncRevision,
          ),
        })),
      addTask: (goalId, title, frequency, customFrequency) =>
        set((s) => ({
          ...buildDirtyGoalState(
            s.goals.map((g) =>
              g.id === goalId
                ? {
                    ...g,
                    tasks: [
                      ...g.tasks,
                      {
                        id: makeId(),
                        title,
                        frequency,
                        customFrequency:
                          frequency === "custom" ? customFrequency : undefined,
                        completions: [],
                      },
                    ],
                  }
                : g,
            ),
            s.syncRevision,
          ),
        })),
      updateTask: (goalId, taskId, updates) =>
        set((s) => ({
          ...buildDirtyGoalState(
            s.goals.map((g) =>
              g.id === goalId
                ? {
                    ...g,
                    tasks: g.tasks.map((task) => {
                      if (task.id !== taskId) {
                        return task;
                      }

                      const nextFrequency = updates.frequency ?? task.frequency;

                      return {
                        ...task,
                        title: updates.title ?? task.title,
                        frequency: nextFrequency,
                        customFrequency:
                          nextFrequency === "custom"
                            ? (updates.customFrequency ?? task.customFrequency)
                            : undefined,
                        completions: normalizeCompletionsForFrequencyChange(
                          task,
                          nextFrequency,
                        ),
                      };
                    }),
                  }
                : g,
            ),
            s.syncRevision,
          ),
        })),
      deleteTask: (goalId, taskId) =>
        set((s) => ({
          ...buildDirtyGoalState(
            s.goals.map((g) =>
              g.id === goalId
                ? {
                    ...g,
                    tasks: g.tasks.filter((task) => task.id !== taskId),
                  }
                : g,
            ),
            s.syncRevision,
          ),
        })),
      toggleTaskCompletion: (goalId, taskId, date = new Date()) =>
        set((s) =>
          buildDirtyGoalState(
            toggleCompletionInGoals(
              s.goals,
              goalId,
              taskId,
              normalizeDate(date),
            ),
            s.syncRevision,
          ),
        ),
      /**
       * "Not Today": hide a due task from one calendar day's list. Purely a
       * personal view preference, so it stays local (no sync). Entries older
       * than a week are pruned on every write to keep the map tiny.
       */
      postponeTask: (taskId, date = new Date()) => {
        const dateKey = dateToKey(date);
        const cutoff = dateToKey(addDays(normalizeDate(new Date()), -7));
        set((s) => {
          const next: Record<string, string[]> = {};
          for (const [key, ids] of Object.entries(s.postponedTasks)) {
            // The day being written always survives the prune.
            if (key >= cutoff || key === dateKey) next[key] = ids;
          }
          const existing = next[dateKey] ?? [];
          if (!existing.includes(taskId)) {
            next[dateKey] = [...existing, taskId];
          }
          return { postponedTasks: next };
        });
      },

      undoPostponeTask: (taskId, date = new Date()) => {
        const dateKey = dateToKey(date);
        set((s) => {
          const ids = s.postponedTasks[dateKey];
          if (!ids?.includes(taskId)) return s;
          const remaining = ids.filter((id) => id !== taskId);
          const next = { ...s.postponedTasks };
          if (remaining.length > 0) {
            next[dateKey] = remaining;
          } else {
            delete next[dateKey];
          }
          return { postponedTasks: next };
        });
      },

      completionsByDate: () => {
        const map: Record<string, number> = {};
        for (const g of get().goals) {
          for (const t of g.tasks) {
            // Skip "once" frequency tasks - they shouldn't appear in heatmaps
            if (t.frequency === "once") continue;

            for (const completionDate of t.completions) {
              const dateKey = dateToKey(completionDate);
              map[dateKey] = (map[dateKey] || 0) + 1;
            }
          }
        }
        return map;
      },
      deleteGoal: (goalId) => {
        set((s) => ({
          ...buildDirtyGoalState(
            s.goals.filter((g) => g.id !== goalId),
            s.syncRevision,
          ),
        }));
      },
      resetAppData: () => {
        set((s) => ({
          goals: getInitialGoals(),
          selectedDate: normalizeDate(new Date()),
          account: s.account,
          postponedTasks: {},
          syncRevision: s.syncRevision + 1,
        }));
      },
      createAccount: (displayName, username, email) => {
        const normalizedAccount = normalizeAccountDraft(
          displayName,
          username,
          email,
        );

        if (!normalizedAccount.displayName) {
          return;
        }

        set({
          account: {
            id: makeId(),
            displayName: normalizedAccount.displayName,
            username: normalizedAccount.username,
            email: normalizedAccount.email,
            createdAt: Date.now(),
          },
        });
      },
      setAccount: (account) => {
        set({ account });
      },
    }),
    {
      name: ACTIVE_STORAGE_KEY, // Dynamic storage key based on CURRENT_MODE
      storage: createJSONStorage(() => AsyncStorage),
      // v1 strips the retired freeze-days feature from persisted state.
      version: 1,
      migrate: (persisted) => {
        if (persisted && typeof persisted === "object") {
          delete (persisted as Record<string, unknown>).frozenDays;
        }
        return persisted;
      },
      // Custom onRehydrateStorage to convert ISO strings back to Date objects
      onRehydrateStorage: () => {
        return (state) => {
          if (state?.goals) {
            state.goals = state.goals.map((goal) =>
              normalizeGoal(goal as PersistedGoal),
            );

            const { goals, upgraded } = upgradeLegacyIds(state.goals);
            if (upgraded) {
              state.goals = goals;
              state.syncRevision = (state.syncRevision ?? 0) + 1;
            }
          }

          if (state?.sharedGoals) {
            state.sharedGoals = state.sharedGoals.map((goal) =>
              normalizeGoal(goal as PersistedGoal),
            );
          }

          if (state?.selectedDate) {
            state.selectedDate =
              typeof state.selectedDate === "string"
                ? new Date(state.selectedDate)
                : state.selectedDate;
          } else if (state) {
            state.selectedDate = normalizeDate(new Date());
          }
        };
      },
    },
  ),
);
