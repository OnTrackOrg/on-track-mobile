import {
  applyOrder,
  isSameIdList,
  moveId,
  normalizePersonalOrder,
  orderGoalTasks,
} from "./personalOrder";
import { Goal } from "../types";

const item = (id: string) => ({ id });

describe("applyOrder", () => {
  it("returns the default order when no personal order exists", () => {
    expect(applyOrder([item("a"), item("b")], undefined)).toEqual([
      item("a"),
      item("b"),
    ]);
    expect(applyOrder([item("a"), item("b")], [])).toEqual([
      item("a"),
      item("b"),
    ]);
  });

  it("puts listed ids first and keeps unlisted items after them", () => {
    const items = [item("a"), item("b"), item("c"), item("d")];
    expect(applyOrder(items, ["c", "a"]).map((i) => i.id)).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });

  it("ignores ids that no longer exist and duplicates", () => {
    const items = [item("a"), item("b")];
    expect(applyOrder(items, ["zzz", "b", "b", "a"]).map((i) => i.id)).toEqual(
      ["b", "a"],
    );
  });

  it("never drops an item", () => {
    const items = [item("a"), item("b"), item("c")];
    expect(applyOrder(items, ["b"])).toHaveLength(3);
  });
});

describe("orderGoalTasks", () => {
  const goal: Goal = {
    id: "g1",
    title: "Run",
    createdAt: 0,
    tasks: [
      { id: "t1", title: "Stretch", frequency: "daily", completions: [] },
      { id: "t2", title: "Jog", frequency: "daily", completions: [] },
    ],
  };

  it("keeps the same object when nothing moves", () => {
    expect(orderGoalTasks(goal, { goals: [], tasks: {} })).toBe(goal);
    expect(orderGoalTasks(goal, { goals: [], tasks: { g1: ["t1"] } })).toBe(
      goal,
    );
  });

  it("reorders tasks without mutating the source goal", () => {
    const ordered = orderGoalTasks(goal, {
      goals: [],
      tasks: { g1: ["t2", "t1"] },
    });
    expect(ordered.tasks.map((t) => t.id)).toEqual(["t2", "t1"]);
    expect(goal.tasks.map((t) => t.id)).toEqual(["t1", "t2"]);
  });
});

describe("moveId / isSameIdList", () => {
  it("moves an id down and up", () => {
    expect(moveId(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveId(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("is a no-op for out-of-range or identical indexes", () => {
    expect(moveId(["a", "b"], 1, 1)).toEqual(["a", "b"]);
    expect(moveId(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });

  it("compares id lists", () => {
    expect(isSameIdList(["a", "b"], ["a", "b"])).toBe(true);
    expect(isSameIdList(["a", "b"], ["b", "a"])).toBe(false);
  });
});

describe("normalizePersonalOrder", () => {
  it("coerces bad shapes to an empty order", () => {
    expect(normalizePersonalOrder(undefined)).toEqual({ goals: [], tasks: {} });
    expect(normalizePersonalOrder("nope")).toEqual({ goals: [], tasks: {} });
    expect(normalizePersonalOrder({ goals: "x", tasks: [] })).toEqual({
      goals: [],
      tasks: {},
    });
  });

  it("keeps string ids and drops empty task lists", () => {
    expect(
      normalizePersonalOrder({
        goals: ["g1", 3, "g2"],
        tasks: { g1: ["t2", null, "t1"], g2: [] },
      }),
    ).toEqual({ goals: ["g1", "g2"], tasks: { g1: ["t2", "t1"] } });
  });
});
