const mockFrom = jest.fn();

jest.mock("./supabase", () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

import type { User } from "@supabase/supabase-js";
import { Goal } from "../types";
import { __internal, replaceRemoteGoalsForUser } from "./dataSync";

const ME = "00000000-0000-4000-8000-0000000000aa";
const FRIEND = "00000000-0000-4000-8000-0000000000bb";

type QueryLog = {
  table: string;
  steps: Array<{ method: string; args: unknown[] }>;
};

// Minimal supabase query-builder stub: every method chains and records its
// args; awaiting the chain resolves with the next queued response (queued in
// `from()` call order).
const setupSupabaseQueries = (
  responses: Array<{ data?: unknown; error?: unknown }>,
): QueryLog[] => {
  const log: QueryLog[] = [];
  let queryIndex = 0;

  mockFrom.mockImplementation((table: string) => {
    const entry: QueryLog = { table, steps: [] };
    log.push(entry);
    const response = responses[queryIndex++] ?? {};

    const chain: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown) =>
        resolve({ data: null, error: null, ...response }),
    };
    for (const method of [
      "select",
      "in",
      "eq",
      "order",
      "upsert",
      "insert",
      "delete",
    ]) {
      chain[method] = (...args: unknown[]) => {
        entry.steps.push({ method, args });
        return chain;
      };
    }
    return chain;
  });

  return log;
};

describe("dataSync mappers", () => {
  it("builds goals, tasks, and completion dates into store-friendly shapes", () => {
    const goals = __internal.buildGoals(
      [
        {
          id: "goal-1",
          owner_user_id: ME,
          title: "Fitness",
          target: "Move more",
          created_at: "2026-05-01T12:00:00.000Z",
          completed_at: "2026-05-20T12:00:00.000Z",
        },
      ],
      [
        {
          id: "task-1",
          goal_id: "goal-1",
          title: "Run",
          frequency: "custom",
          custom_type: "weekly",
          custom_target: 3,
          position: 1,
          created_at: "2026-05-01T12:05:00.000Z",
        },
      ],
      [
        {
          task_id: "task-1",
          completed_by_user_id: ME,
          completed_day: "2026-05-03",
        },
      ],
    );

    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({
      id: "goal-1",
      title: "Fitness",
      target: "Move more",
      ownerUserId: ME,
      completedAt: new Date("2026-05-20T12:00:00.000Z").getTime(),
    });
    expect(goals[0].tasks).toHaveLength(1);
    expect(goals[0].tasks[0]).toMatchObject({
      id: "task-1",
      title: "Run",
      frequency: "custom",
      customFrequency: {
        type: "weekly",
        target: 3,
      },
    });
    const completion = goals[0].tasks[0].completions[0];
    expect(completion).toBeInstanceOf(Date);
    expect(completion.getFullYear()).toBe(2026);
    expect(completion.getMonth()).toBe(4);
    expect(completion.getDate()).toBe(3);
  });

  it("gives each goal only its owner's completions", () => {
    const goals = __internal.buildGoals(
      [
        {
          id: "goal-1",
          owner_user_id: FRIEND,
          title: "Run club",
          created_at: "2026-05-01T12:00:00.000Z",
        },
      ],
      [
        {
          id: "task-1",
          goal_id: "goal-1",
          title: "Run",
          frequency: "daily",
          position: 0,
          created_at: "2026-05-01T12:05:00.000Z",
        },
      ],
      [
        // A stray row from before shared goals were retired.
        {
          task_id: "task-1",
          completed_by_user_id: ME,
          completed_day: "2026-05-03",
        },
        {
          task_id: "task-1",
          completed_by_user_id: FRIEND,
          completed_day: "2026-05-04",
        },
      ],
    );

    expect(goals[0].ownerUserId).toBe(FRIEND);
    const task = goals[0].tasks[0];
    expect(task.completions).toHaveLength(1);
    expect(task.completions[0].getDate()).toBe(4);
  });

  it("serializes completion dates from the local calendar day", () => {
    const completion = new Date(2026, 4, 3);

    expect(__internal.toCompletedDay(completion)).toBe("2026-05-03");
  });

  it("keeps tasks ordered by explicit position first", () => {
    const tasks = __internal.buildTasks(
      ME,
      [
        {
          id: "task-2",
          goal_id: "goal-1",
          title: "Second",
          frequency: "daily",
          position: 2,
          created_at: "2026-05-01T12:10:00.000Z",
        },
        {
          id: "task-1",
          goal_id: "goal-1",
          title: "First",
          frequency: "daily",
          position: 1,
          created_at: "2026-05-01T12:09:00.000Z",
        },
      ],
      [],
    );

    expect(tasks.map((task) => task.id)).toEqual(["task-1", "task-2"]);
  });
});

describe("multi-dose sync", () => {
  it("writes one completion row per dose, numbered within each day", () => {
    const day = new Date(2026, 9, 20);
    const rows = __internal.buildCompletionPayload(
      [
        {
          id: "task-1",
          title: "Creatine",
          frequency: "daily",
          timesPerDay: 3,
          completions: [day, day, new Date(2026, 9, 21)],
        },
      ],
      ME,
    );
    expect(rows.map((row) => [row.completed_day, row.occurrence])).toEqual([
      ["2026-10-20", 0],
      ["2026-10-20", 1],
      ["2026-10-21", 0],
    ]);
  });

  it("reads timing columns and every dose row back", () => {
    const [goal] = __internal.buildGoals(
      [{ id: "goal-1", owner_user_id: ME, title: "Strength" }],
      [
        {
          id: "task-1",
          goal_id: "goal-1",
          title: "Creatine",
          frequency: "daily",
          times_per_day: 2,
          times: [
            { at: "20:00", remind: true },
            { at: "08:00", remind: false },
          ],
          reminder_lead_min: 15,
          once_day: "2026-10-23",
        },
      ],
      [
        {
          task_id: "task-1",
          completed_by_user_id: ME,
          completed_day: "2026-10-20",
        },
        {
          task_id: "task-1",
          completed_by_user_id: ME,
          completed_day: "2026-10-20",
        },
      ],
    );
    expect(goal.tasks[0]).toMatchObject({
      timesPerDay: 2,
      times: [
        { at: "08:00", remind: false },
        { at: "20:00", remind: true },
      ],
      reminderLeadMin: 15,
      onDay: undefined, // only one-offs keep a day
    });
    expect(goal.tasks[0].completions).toHaveLength(2);
  });
});

describe("replaceRemoteGoalsForUser", () => {
  afterEach(() => {
    mockFrom.mockReset();
  });

  it("replaces my completion rows on my tasks and deletes what's gone locally", async () => {
    const GOAL = "11111111-1111-4111-8111-111111111111";
    const TASK = "22222222-2222-4222-8222-222222222222";
    const REMOVED_TASK = "33333333-3333-4333-8333-333333333333";

    const goals: Goal[] = [
      {
        id: GOAL,
        title: "Fitness",
        createdAt: 1,
        tasks: [
          {
            id: TASK,
            title: "Run",
            frequency: "daily",
            completions: [new Date(2026, 4, 3)],
          },
        ],
      },
    ];

    // Responses in from() call order:
    const log = setupSupabaseQueries([
      { data: [{ id: GOAL }] }, // goals select (existing remote graph)
      { data: [{ id: TASK }, { id: REMOVED_TASK }] }, // tasks select
      {}, // goals upsert
      {}, // tasks upsert
      {}, // task_completions delete
      {}, // task_completions insert
      {}, // tasks delete
    ]);

    await replaceRemoteGoalsForUser({ id: ME } as User, goals);

    const [deleteQuery, insertQuery] = log.filter(
      (query) => query.table === "task_completions",
    );
    // Only my rows, on every task of mine the server or device knows.
    expect(deleteQuery.steps).toEqual([
      { method: "delete", args: [] },
      { method: "eq", args: ["completed_by_user_id", ME] },
      { method: "in", args: ["task_id", [TASK, REMOVED_TASK]] },
    ]);
    const insertedRows = insertQuery.steps[0].args[0] as {
      task_id: string;
      completed_by_user_id: string;
      completed_day: string;
    }[];
    expect(insertedRows.map((row) => [row.task_id, row.completed_day])).toEqual(
      [[TASK, "2026-05-03"]],
    );
    expect(insertedRows.every((row) => row.completed_by_user_id === ME)).toBe(
      true,
    );

    const taskDelete = log.find(
      (query) => query.table === "tasks" && query.steps[0]?.method === "delete",
    );
    expect(taskDelete?.steps[1]).toEqual({
      method: "in",
      args: ["id", [REMOVED_TASK]],
    });
  });
});
