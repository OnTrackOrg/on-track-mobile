import { format, subDays } from "date-fns";
import { Goal, Task } from "../types";
import { FALLBACK_QUOTES } from "./quotes";
import {
  WidgetGoal,
  buildWidgetSnapshot,
  quoteForDay,
  rankGoalsNeedingYou,
} from "./widgetSnapshot";

const NOW = new Date(2026, 8, 6, 10, 0, 0); // Sun Sep 6, 2026

const task = (id: string, completions: Date[] = []): Task => ({
  id,
  title: `Task ${id}`,
  frequency: "daily",
  completions,
});

const goal = (id: string, tasks: Task[], extra: Partial<Goal> = {}): Goal => ({
  id,
  title: `Goal ${id}`,
  tasks,
  createdAt: subDays(NOW, 30).getTime(),
  color: "#10b981",
  ...extra,
});

const widgetGoal = (
  id: string,
  pending: number,
  streak: number,
): WidgetGoal => ({
  id,
  title: id,
  color: "#10b981",
  percent: 0,
  subtitle: "",
  streak,
  pending,
  strip: [],
});

describe("buildWidgetSnapshot", () => {
  const run = goal(
    "run",
    [
      task("r1", [NOW, subDays(NOW, 1), subDays(NOW, 2)]),
      task("r2", [subDays(NOW, 1)]),
    ],
    { dueDay: "2026-12-01", title: "Run club" },
  );
  const read = goal("read", [task("b1"), task("b2")], { target: "12 books" });

  it("summarises today and tomorrow", () => {
    const snapshot = buildWidgetSnapshot({
      goals: [run, read],
      sharedGoals: [],
      postponedTasks: {},
      accent: "#3b82f6",
      now: NOW,
    });

    expect(snapshot.version).toBe(1);
    expect(snapshot.accent).toBe("#3b82f6");
    expect(snapshot.days.map((day) => day.dayKey)).toEqual([
      "2026-09-06",
      "2026-09-07",
    ]);

    const [today, tomorrow] = snapshot.days;
    expect(today.done).toBe(1);
    expect(today.total).toBe(4);
    expect(today.nextTask).toBe("Task r2");
    expect(tomorrow.done).toBe(0);
    expect(tomorrow.total).toBe(4);
  });

  it("carries the Goals-tab card data for each active goal", () => {
    const [today] = buildWidgetSnapshot({
      goals: [run, read],
      sharedGoals: [],
      postponedTasks: {},
      accent: "#3b82f6",
      now: NOW,
    }).days;

    const runCard = today.goals.find((g) => g.id === "run")!;
    expect(runCard.title).toBe("Run club");
    expect(runCard.color).toBe("#10b981");
    expect(runCard.percent).toBe(0.5);
    expect(runCard.subtitle).toBe("2 tasks · Due Dec 1, 2026");
    expect(runCard.streak).toBe(3);
    expect(runCard.pending).toBe(1);
    expect(runCard.strip).toHaveLength(14);
    expect(runCard.strip[13]).toBe(0.5); // today
    expect(runCard.strip[12]).toBe(1); // yesterday
    expect(runCard.strip[0]).toBe(0);

    const readCard = today.goals.find((g) => g.id === "read")!;
    expect(readCard.subtitle).toBe("2 tasks · 12 books");
    expect(readCard.pending).toBe(2);
  });

  it("ranks the goal with the most undone work first", () => {
    const [today] = buildWidgetSnapshot({
      goals: [run, read],
      sharedGoals: [],
      postponedTasks: {},
      accent: "#3b82f6",
      now: NOW,
    }).days;
    expect(today.autoOrder).toEqual(["read", "run"]);
  });

  it("skips drafts, scheduled and achieved goals but keeps shared ones", () => {
    const draft = goal("draft", [task("d1")], { isDraft: true });
    const scheduled = goal("later", [task("l1")], { startDay: "2026-09-20" });
    const achieved = goal("won", [task("w1")], { completedAt: NOW.getTime() });
    const shared = goal("shared", [task("s1")]);

    const [today] = buildWidgetSnapshot({
      goals: [run, draft, scheduled, achieved],
      sharedGoals: [shared],
      postponedTasks: {},
      accent: "#3b82f6",
      now: NOW,
    }).days;

    expect(today.goals.map((g) => g.id)).toEqual(["run", "shared"]);
    expect(today.total).toBe(3);
  });

  it("leaves postponed tasks out of the day's total, like the Today tab", () => {
    const [today] = buildWidgetSnapshot({
      goals: [read],
      sharedGoals: [],
      postponedTasks: { [format(NOW, "yyyy-MM-dd")]: ["b1"] },
      accent: "#3b82f6",
      now: NOW,
    }).days;
    expect(today.total).toBe(1);
    expect(today.nextTask).toBe("Task b2");
    expect(today.goals[0].pending).toBe(1);
  });

  it("reports nothing due with no goals", () => {
    const [today] = buildWidgetSnapshot({
      goals: [],
      sharedGoals: [],
      postponedTasks: {},
      accent: "#3b82f6",
      now: NOW,
    }).days;
    expect(today).toMatchObject({
      done: 0,
      total: 0,
      nextTask: null,
      goals: [],
      autoOrder: [],
    });
  });
});

describe("rankGoalsNeedingYou", () => {
  it("orders by pending work, then streak at risk, then app order", () => {
    const ranked = rankGoalsNeedingYou([
      widgetGoal("a", 1, 2),
      widgetGoal("b", 2, 0),
      widgetGoal("c", 1, 9),
      widgetGoal("d", 0, 30),
      widgetGoal("e", 1, 9),
    ]);
    expect(ranked).toEqual(["b", "c", "e", "a", "d"]);
  });
});

describe("quoteForDay", () => {
  it("is stable for a day and drawn from the launch-screen pool", () => {
    const quote = quoteForDay("2026-09-06");
    expect(quoteForDay("2026-09-06")).toEqual(quote);
    expect(FALLBACK_QUOTES).toContainEqual(quote);
  });

  it("rotates day to day", () => {
    expect(quoteForDay("2026-09-07")).not.toEqual(quoteForDay("2026-09-06"));
  });
});
