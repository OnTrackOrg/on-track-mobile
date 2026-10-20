import { Goal, Task } from "../types";
import { planTaskReminders } from "./taskReminders";

const NOW = new Date(2026, 9, 20, 10, 0); // Tue Oct 20, 10:00

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "task-1",
  title: "Take creatine",
  frequency: "daily",
  timesPerDay: 3,
  times: [
    { at: "08:00", remind: true },
    { at: "14:30", remind: true },
    { at: "21:00", remind: false },
  ],
  completions: [],
  ...overrides,
});

const goal = (tasks: Task[], overrides: Partial<Goal> = {}): Goal => ({
  id: "goal-1",
  title: "Get stronger",
  tasks,
  createdAt: new Date(2026, 8, 1).getTime(),
  ...overrides,
});

const plan = (goals: Goal[], postponedTasks = {}) =>
  planTaskReminders({
    goals,
    postponedTasks,
    now: NOW,
    horizonDays: 2,
  });

describe("planTaskReminders", () => {
  it("schedules belled times still ahead, skipping past and bell-less ones", () => {
    const reminders = plan([goal([task()])]);
    expect(reminders.map((r) => r.id)).toEqual([
      "task-reminder:task-1:2026-10-20:1",
      "task-reminder:task-1:2026-10-21:0",
      "task-reminder:task-1:2026-10-21:1",
    ]);
    expect(reminders[0].fireAt).toEqual(new Date(2026, 9, 20, 14, 30));
    expect(reminders[0].title).toBe("Take creatine");
    expect(reminders[0].body).toMatch(/^2 of 3 · Get stronger · /);
    expect(reminders[0].data).toEqual({
      kind: "task-reminder",
      goalId: "goal-1",
      taskId: "task-1",
      day: "2026-10-20",
      dose: 1,
    });
  });

  it("fires the lead time early", () => {
    const [first] = plan([goal([task({ reminderLeadMin: 15 })])]);
    expect(first.fireAt).toEqual(new Date(2026, 9, 20, 14, 15));
  });

  it("drops doses already logged that day", () => {
    const twoLogged = task({
      completions: [new Date(2026, 9, 20), new Date(2026, 9, 20)],
    });
    expect(
      plan([goal([twoLogged])]).filter((r) => r.data.day === "2026-10-20"),
    ).toEqual([]);
  });

  it("skips postponed tasks, achieved goals, and drafts", () => {
    expect(
      plan([goal([task()])], { "2026-10-20": ["task-1"] }).some(
        (r) => r.data.day === "2026-10-20",
      ),
    ).toBe(false);
    expect(plan([goal([task()], { completedAt: NOW.getTime() })])).toEqual([]);
    expect(plan([goal([task()], { isDraft: true })])).toEqual([]);
  });

  it("only reminds weekday-pinned tasks on their days", () => {
    const wednesdays = task({
      frequency: "custom",
      customFrequency: { type: "weekly", target: 1, weekdays: [3] },
    });
    expect(new Set(plan([goal([wednesdays])]).map((r) => r.data.day))).toEqual(
      new Set(["2026-10-21"]),
    );
  });

  it("reminds a one-off only from its day", () => {
    const physio = task({
      frequency: "once",
      timesPerDay: undefined,
      times: [{ at: "14:30", remind: true }],
      onDay: "2026-10-21",
    });
    const reminders = plan([goal([physio])]);
    expect(reminders.map((r) => r.data.day)).toEqual(["2026-10-21"]);
    expect(reminders[0].body).toMatch(/^Get stronger · /);
  });

  it("keeps only the soonest reminders up to the limit", () => {
    const reminders = planTaskReminders({
      goals: [goal([task()])],
      postponedTasks: {},
      now: NOW,
      horizonDays: 7,
      limit: 2,
    });
    expect(reminders.map((r) => r.data.day)).toEqual([
      "2026-10-20",
      "2026-10-21",
    ]);
  });
});
