import {
  getDosesOnDate,
  getFullDays,
  getGoalProgress,
  getGoalStreak,
  getTaskBucketsForDate,
  getTodayItems,
  normalizeTaskTiming,
  remindersFromLegacyTimes,
  useStore,
} from "../store";
import { Goal, Task } from "../types";

const day = (d: number, hour = 9) => new Date(2026, 9, d, hour);

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "task-1",
  title: "Take creatine",
  frequency: "daily",
  completions: [],
  ...overrides,
});

const goal = (tasks: Task[]): Goal => ({
  id: "goal-1",
  title: "Get stronger",
  tasks,
  createdAt: new Date(2026, 8, 1).getTime(),
});

describe("normalizeTaskTiming", () => {
  it("drops every field for a plain untimed task", () => {
    expect(normalizeTaskTiming("daily", { timesPerDay: 1 })).toEqual({
      timesPerDay: undefined,
      reminders: undefined,
      onDay: undefined,
    });
  });

  it("keeps valid reminders sorted and de-duplicated, whatever the doses", () => {
    expect(
      normalizeTaskTiming("daily", {
        timesPerDay: 3,
        reminders: ["21:00", "08:00", "21:00", "25:00"],
      }).reminders,
    ).toEqual(["08:00", "21:00"]);
    expect(
      normalizeTaskTiming("daily", { reminders: [] }).reminders,
    ).toBeUndefined();
  });

  it("turns the retired times of day into reminders", () => {
    expect(
      remindersFromLegacyTimes(
        [
          { at: "08:00", remind: false },
          { at: "20:00", remind: true },
          { at: "00:05", remind: true },
        ],
        15,
      ),
    ).toEqual(["19:45", "00:00"]);
    expect(
      remindersFromLegacyTimes([{ at: "08:00", remind: false }]),
    ).toBeUndefined();
    expect(remindersFromLegacyTimes(null)).toBeUndefined();
  });

  it("gives one-offs a single dose and keeps their day", () => {
    expect(
      normalizeTaskTiming("once", { timesPerDay: 3, onDay: "2026-10-23" }),
    ).toMatchObject({ timesPerDay: undefined, onDay: "2026-10-23" });
    expect(
      normalizeTaskTiming("daily", { onDay: "2026-10-23" }).onDay,
    ).toBeUndefined();
  });
});

describe("multi-dose days", () => {
  it("counts a day as done only once every dose is logged", () => {
    const creatine = task({
      timesPerDay: 3,
      completions: [day(20), day(20), day(21), day(21), day(21)],
    });
    expect(getDosesOnDate(creatine, day(20))).toBe(2);
    expect(getFullDays(creatine).map((d) => d.getDate())).toEqual([21]);
  });

  it("keeps a partly logged task in To do until its last dose", () => {
    const partial = task({ timesPerDay: 3, completions: [day(20), day(20)] });
    const buckets = getTaskBucketsForDate(goal([partial]), day(20));
    expect(buckets.pending.map((t) => t.id)).toEqual(["task-1"]);
    expect(getGoalProgress(goal([partial]), day(20)).completed).toBe(0);

    const full = { ...partial, completions: [...partial.completions, day(20)] };
    expect(getTaskBucketsForDate(goal([full]), day(20)).completed).toHaveLength(
      1,
    );
  });

  it("only extends a streak on full days", () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const creatine = task({
      timesPerDay: 2,
      completions: [today, today, yesterday],
    });
    expect(getGoalStreak(creatine)).toBe(1);
  });

  it("counts Today's totals in doses", () => {
    const creatine = task({ timesPerDay: 3, completions: [day(20)] });
    const walk = task({ id: "task-2", title: "Walk", completions: [day(20)] });
    const { totals } = getTodayItems([goal([creatine, walk])], day(20));
    expect(totals).toMatchObject({ done: 2, total: 4 });
  });
});

describe("one-offs with a day", () => {
  it("are not due before their day and stay due after it", () => {
    const physio = task({
      frequency: "once",
      title: "Book physio",
      onDay: "2026-10-22",
    });
    const pendingOn = (d: number) =>
      getTaskBucketsForDate(goal([physio]), day(d)).pending.length;
    expect(pendingOn(21)).toBe(0);
    expect(pendingOn(22)).toBe(1);
    expect(pendingOn(24)).toBe(1);
    expect(getGoalProgress(goal([physio]), day(21)).total).toBe(0);
  });
});

describe("dose store actions", () => {
  const originalState = useStore.getState();

  beforeEach(() => {
    useStore.setState({
      goals: [goal([task({ timesPerDay: 2 })])],
    });
  });

  afterEach(() => {
    useStore.setState(originalState, true);
  });

  const doses = () =>
    getDosesOnDate(useStore.getState().goals[0].tasks[0], day(20));

  it("logs a dose per tap and takes one back from a full day", () => {
    const { toggleTaskCompletion } = useStore.getState();
    toggleTaskCompletion("goal-1", "task-1", day(20));
    toggleTaskCompletion("goal-1", "task-1", day(20));
    expect(doses()).toBe(2);
    toggleTaskCompletion("goal-1", "task-1", day(20));
    expect(doses()).toBe(1);
  });

  it("logTaskDose never logs past a full day", () => {
    const { logTaskDose } = useStore.getState();
    logTaskDose("goal-1", "task-1", day(20));
    logTaskDose("goal-1", "task-1", day(20));
    logTaskDose("goal-1", "task-1", day(20));
    expect(doses()).toBe(2);
  });

  it("removeTaskDose undoes one dose and bumps the sync revision", () => {
    const { logTaskDose, removeTaskDose } = useStore.getState();
    logTaskDose("goal-1", "task-1", day(20));
    logTaskDose("goal-1", "task-1", day(20));
    const revision = useStore.getState().syncRevision;
    removeTaskDose("goal-1", "task-1", day(20));
    expect(doses()).toBe(1);
    expect(useStore.getState().syncRevision).toBe(revision + 1);
  });

  it("saves timing from the editor through updateTask", () => {
    useStore.getState().updateTask("goal-1", "task-1", {
      timing: {
        timesPerDay: 2,
        reminders: ["20:00", "08:00"],
      },
    });
    const saved = useStore.getState().goals[0].tasks[0];
    expect(saved.reminders).toEqual(["08:00", "20:00"]);

    // Edits that leave timing out keep it.
    useStore.getState().updateTask("goal-1", "task-1", { title: "Creatine" });
    expect(useStore.getState().goals[0].tasks[0].reminders).toHaveLength(2);
  });
});
