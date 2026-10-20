import { Goal, Task } from "../types";
import {
  activeDays,
  completionsUpTo,
  getAchievedWindow,
  longestDailyStreak,
  taskCompletionCounts,
  totalCompletions,
  weeklyCompletionCounts,
} from "./achievedStats";

// Local calendar dates; noon keeps every day key stable across DST edges.
const on = (month: number, day: number): Date =>
  new Date(2026, month - 1, day, 12);

const task = (overrides: Partial<Task> & { id: string }): Task => ({
  title: overrides.id,
  frequency: "daily",
  completions: [],
  ...overrides,
});

// March 2026: the 1st is a Sunday, so the 2nd (startDay) is a Monday and
// the 15th (achieved) is a Sunday.
const daily = task({
  id: "daily",
  completions: [
    on(2, 27), // backfilled before the start day
    on(3, 2),
    on(3, 3),
    on(3, 4),
    on(3, 6),
    on(3, 8),
    on(3, 9),
    on(3, 10),
    on(3, 14),
    on(3, 16), // after the achieved day: never counted
  ],
});

// Pinned to Tue & Thu: four scheduled days in a row, Mar 3 → Mar 12.
const pinned = task({
  id: "pinned",
  frequency: "custom",
  customFrequency: { type: "weekly", target: 2, weekdays: [2, 4] },
  completions: [on(3, 3), on(3, 5), on(3, 10), on(3, 12)],
});

const weekly = task({
  id: "weekly",
  frequency: "weekly",
  completions: [on(3, 4), on(3, 11)],
});

const once = task({
  id: "once",
  frequency: "once",
  completions: [on(3, 7)],
});

const goal: Goal = {
  id: "goal-1",
  title: "Goal",
  tasks: [daily, pinned, weekly, once],
  createdAt: on(2, 20).getTime(),
  startDay: "2026-03-02",
  completedAt: on(3, 15).getTime(),
};

const window = getAchievedWindow(goal)!;

describe("getAchievedWindow", () => {
  it("spans the start day through the achieved day, inclusive", () => {
    expect(window).toEqual({
      startDay: "2026-03-02",
      endDay: "2026-03-15",
      days: 14,
    });
  });

  it("falls back to the creation day when the goal has no start day", () => {
    const { startDay, ...rest } = goal;
    void startDay;
    expect(getAchievedWindow(rest)).toEqual({
      startDay: "2026-02-20",
      endDay: "2026-03-15",
      days: 24,
    });
  });

  it("is a single day when achieved on the start day", () => {
    expect(
      getAchievedWindow({ ...goal, completedAt: on(3, 2).getTime() }),
    ).toEqual({ startDay: "2026-03-02", endDay: "2026-03-02", days: 1 });
  });

  it("is null for a goal that is not achieved", () => {
    const { completedAt, ...active } = goal;
    void completedAt;
    expect(getAchievedWindow(active)).toBeNull();
  });
});

describe("completionsUpTo", () => {
  it("keeps every completion on or before the end day, including backfilled ones", () => {
    const days = completionsUpTo(goal, window.endDay).map((date) =>
      date.getDate(),
    );
    expect(days).toContain(27);
    expect(days).not.toContain(16);
    expect(days).toHaveLength(16);
  });
});

describe("totalCompletions", () => {
  it("counts completions across every task", () => {
    expect(totalCompletions(goal, window)).toBe(16);
  });
});

describe("activeDays", () => {
  it("counts distinct days with at least one completion", () => {
    // Feb 27 + Mar 2–12 + Mar 14 (Mar 13 has nothing).
    expect(activeDays(goal, window)).toBe(13);
  });
});

describe("weeklyCompletionCounts", () => {
  it("buckets by Sunday-based week from the start day's week to the end day", () => {
    expect(weeklyCompletionCounts(goal, window)).toEqual([
      { weekStartDay: "2026-03-01", count: 8 },
      { weekStartDay: "2026-03-08", count: 7 },
      { weekStartDay: "2026-03-15", count: 0 },
    ]);
  });

  it("leaves every week at zero when all completions precede the first week", () => {
    const backfilled = task({
      id: "backfilled",
      completions: [on(2, 25), on(2, 26), on(2, 27)],
    });
    const early = { ...goal, tasks: [backfilled] };
    expect(totalCompletions(early, window)).toBe(3);
    expect(
      weeklyCompletionCounts(early, window).every(({ count }) => count === 0),
    ).toBe(true);
  });

  it("keeps a zero entry for every week of an empty goal", () => {
    expect(weeklyCompletionCounts({ ...goal, tasks: [] }, window)).toEqual([
      { weekStartDay: "2026-03-01", count: 0 },
      { weekStartDay: "2026-03-08", count: 0 },
      { weekStartDay: "2026-03-15", count: 0 },
    ]);
  });
});

describe("longestDailyStreak", () => {
  it("skips unscheduled days for weekday-pinned tasks", () => {
    expect(longestDailyStreak({ ...goal, tasks: [pinned] }, window)).toBe(4);
  });

  it("breaks a daily task's run on a missed day", () => {
    expect(longestDailyStreak({ ...goal, tasks: [daily] }, window)).toBe(3);
  });

  it("takes the best run across daily and pinned tasks", () => {
    expect(longestDailyStreak(goal, window)).toBe(4);
  });

  it("ignores completions outside the window", () => {
    const early = task({ id: "early", completions: [on(2, 27), on(2, 28)] });
    expect(longestDailyStreak({ ...goal, tasks: [early] }, window)).toBe(0);
  });

  it("is zero for weekly, once, or no tasks", () => {
    expect(longestDailyStreak({ ...goal, tasks: [weekly, once] }, window)).toBe(
      0,
    );
    expect(longestDailyStreak({ ...goal, tasks: [] }, window)).toBe(0);
  });
});

describe("taskCompletionCounts", () => {
  it("lists tasks with completions, most done first", () => {
    expect(
      taskCompletionCounts(goal, window).map(({ task, count }) => [
        task.id,
        count,
      ]),
    ).toEqual([
      ["daily", 9],
      ["pinned", 4],
      ["weekly", 2],
      ["once", 1],
    ]);
  });

  it("leaves out tasks with nothing done", () => {
    const idle = task({ id: "idle" });
    expect(taskCompletionCounts({ ...goal, tasks: [idle] }, window)).toEqual(
      [],
    );
  });
});
