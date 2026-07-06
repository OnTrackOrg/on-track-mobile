import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  Goal,
  Frequency,
  CustomFrequency,
  Task,
  UserAccount,
  FreezeDay,
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
 * `frozen` marks the day as a rest day: nothing is due, done stays as-is.
 */
export const getTaskBucketsForDate = (
  goal: Goal,
  date: Date,
  frozen = false,
): { pending: Task[]; completed: Task[] } => {
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

  const pending = frozen
    ? []
    : goal.tasks.filter((task) => {
        if (task.frequency === "custom")
          return shouldShowCustomTask(task, date);
        if (task.frequency === "daily") return !doneOnDate(task);
        if (task.frequency === "weekly") return !doneThisWeek(task);
        return task.completions.length === 0; // once
      });

  return { pending, completed };
};

export type TodayItem = { goal: Goal; task: Task; isShared: boolean };

export const getTodayItems = (
  goals: Goal[],
  sharedGoals: Goal[],
  date: Date,
  frozen = false,
): {
  todo: TodayItem[];
  done: TodayItem[];
  totals: { done: number; total: number; goalCount: number };
} => {
  const todo: TodayItem[] = [];
  const done: TodayItem[] = [];
  const goalIds = new Set<string>();

  const collect = (goal: Goal, isShared: boolean) => {
    if (goal.completedAt !== undefined) return;
    const { pending, completed } = getTaskBucketsForDate(goal, date, frozen);
    if (pending.length + completed.length > 0) goalIds.add(goal.id);
    for (const task of pending) todo.push({ goal, task, isShared });
    for (const task of completed) done.push({ goal, task, isShared });
  };

  goals.forEach((goal) => collect(goal, false));
  sharedGoals.forEach((goal) => collect(goal, true));

  return {
    todo,
    done,
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
  const ageDays =
    differenceInCalendarDays(end, normalizeDate(new Date(goal.createdAt))) + 1;
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
// frozenDays: pass the store's frozenDays array so frozen dates are skipped (not broken)
export const getGoalStreak = (
  task: Task,
  frozenDays: FreezeDay[] = [],
): number => {
  let streak = 0;
  let currentDate = new Date();

  // Build a Set of frozen date keys for O(1) lookup
  const frozenDateKeys = new Set(frozenDays.map((fd) => fd.date));
  const isDateKeyFrozen = (dateKey: string) => frozenDateKeys.has(dateKey);

  if (task.frequency === "custom" && task.customFrequency) {
    // For custom frequencies, check period achievements
    const { type } = task.customFrequency;

    // First check if current period is achieved (with freeze-adjusted target)
    let currentProgress = getCustomFrequencyProgress(task, currentDate);
    let frozenInCurrentPeriod = 0;
    if (currentProgress.periodStart && currentProgress.periodEnd) {
      let d = startOfDay(currentProgress.periodStart);
      while (d <= currentProgress.periodEnd) {
        if (isDateKeyFrozen(format(d, "yyyy-MM-dd"))) frozenInCurrentPeriod++;
        d = addDays(d, 1);
      }
    }
    const minTarget = Math.max(1, Math.ceil(currentProgress.target * 0.5));
    const adjustedTarget = Math.max(
      minTarget,
      currentProgress.target - frozenInCurrentPeriod,
    );
    const currentAchieved = currentProgress.completed >= adjustedTarget;

    // If current period is achieved, start counting from it
    if (currentAchieved) {
      streak++;
      // Move to previous period
      if (type === "weekly") {
        currentDate.setDate(currentDate.getDate() - 7);
      } else {
        currentDate.setMonth(currentDate.getMonth() - 1);
      }
    } else {
      // If current period is not achieved, start from previous period
      if (type === "weekly") {
        currentDate.setDate(currentDate.getDate() - 7);
      } else {
        currentDate.setMonth(currentDate.getMonth() - 1);
      }
    }

    // Now count consecutive achieved periods going backwards
    while (true) {
      const progress = getCustomFrequencyProgress(task, currentDate);

      // Count frozen days in this period to reduce effective target
      let frozenInPeriod = 0;
      if (progress.periodStart && progress.periodEnd) {
        let d = startOfDay(progress.periodStart);
        while (d <= progress.periodEnd) {
          if (isDateKeyFrozen(format(d, "yyyy-MM-dd"))) frozenInPeriod++;
          d = addDays(d, 1);
        }
      }
      // Require at least 50% of original target (rounded up) to prevent
      // streaks from continuing with minimal effort when many days are frozen
      const minTarget = Math.max(1, Math.ceil(progress.target * 0.5));
      const adjustedTarget = Math.max(
        minTarget,
        progress.target - frozenInPeriod,
      );
      const periodAchieved = progress.completed >= adjustedTarget;

      if (periodAchieved) {
        streak++;
        // Move to previous period
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
    // For daily tasks, check consecutive days; frozen days are skipped (neutral)
    while (true) {
      const dateStr = format(currentDate, "yyyy-MM-dd");
      const hasCompletion = task.completions.some(
        (date) => format(date, "yyyy-MM-dd") === dateStr,
      );

      if (hasCompletion) {
        streak++;
        // Move to previous day
        currentDate.setDate(currentDate.getDate() - 1);
      } else if (isDateKeyFrozen(dateStr)) {
        // Frozen day: skip without incrementing or breaking
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        break; // Streak broken
      }

      // Safety check - don't go back more than 365 days
      if (streak > 365) break;
    }
  } else if (task.frequency === "weekly") {
    // For weekly tasks, check consecutive weeks
    // A week is "frozen" if it has no completions but all 7 days are frozen
    while (true) {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 }); // Sunday
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 }); // Saturday

      const hasCompletionThisWeek = task.completions.some((date) =>
        isWithinInterval(date, { start: weekStart, end: weekEnd }),
      );

      if (hasCompletionThisWeek) {
        streak++;
        // Move to previous week
        currentDate.setDate(currentDate.getDate() - 7);
      } else {
        // Check if the entire week is frozen (all 7 days)
        let allFrozen = true;
        let d = startOfDay(weekStart);
        while (d <= weekEnd) {
          if (!isDateKeyFrozen(format(d, "yyyy-MM-dd"))) {
            allFrozen = false;
            break;
          }
          d = addDays(d, 1);
        }
        if (allFrozen) {
          // Skip this week without incrementing or breaking
          currentDate.setDate(currentDate.getDate() - 7);
        } else {
          break; // Streak broken
        }
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
  frozenDays: FreezeDay[];
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
  addGoal: (title: string, target?: string) => void;
  setSelectedDate: (date: Date) => void;
  updateGoal: (
    goalId: string,
    updates: { title?: string; target?: string | null },
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
  freezeDay: (date: Date, reason: string) => boolean;
  unfreezeDay: (date: Date) => void;
  isDayFrozen: (date: Date) => boolean;
  getFreezeReason: (date: Date) => string | undefined;
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
      frozenDays: [],

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

      addGoal: (title, target) =>
        set((s) => ({
          ...buildDirtyGoalState(
            [
              ...s.goals,
              { id: makeId(), title, target, tasks: [], createdAt: Date.now() },
            ],
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
       * Freeze a day with a required reason. Returns true on success,
       * false if the reason is empty/whitespace.
       * Upserting by date key means re-freezing the same day updates the reason.
       */
      freezeDay: (date, reason) => {
        const trimmedReason = reason.trim();
        if (!trimmedReason) return false;
        const dateKey = dateToKey(date);
        set((s) => ({
          frozenDays: [
            ...s.frozenDays.filter((fd) => fd.date !== dateKey),
            { date: dateKey, reason: trimmedReason, createdAt: Date.now() },
          ],
          syncRevision: s.syncRevision + 1,
        }));
        return true;
      },

      unfreezeDay: (date) => {
        const dateKey = dateToKey(date);
        set((s) => ({
          frozenDays: s.frozenDays.filter((fd) => fd.date !== dateKey),
          syncRevision: s.syncRevision + 1,
        }));
      },

      isDayFrozen: (date) => {
        const dateKey = dateToKey(date);
        return get().frozenDays.some((fd) => fd.date === dateKey);
      },

      getFreezeReason: (date) => {
        const dateKey = dateToKey(date);
        return get().frozenDays.find((fd) => fd.date === dateKey)?.reason;
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
