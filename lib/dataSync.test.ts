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
      ME,
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

  it("splits my completions from other members' day-key maps", () => {
    const goals = __internal.buildGoals(
      ME,
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
      [{ goal_id: "goal-1", user_id: ME }],
      [
        { id: FRIEND, username: "friend", display_name: "Friend Person" },
        { id: ME, username: "me", display_name: "Me" },
      ],
    );

    expect(goals[0].ownerUserId).toBe(FRIEND);
    expect(goals[0].members).toEqual([
      {
        userId: FRIEND,
        username: "friend",
        displayName: "Friend Person",
        isOwner: true,
      },
      { userId: ME, username: "me", displayName: "Me", isOwner: false },
    ]);

    const task = goals[0].tasks[0];
    // My rows become local Dates on completions...
    expect(task.completions).toHaveLength(1);
    expect(task.completions[0].getDate()).toBe(3);
    // ...the friend's rows become day keys, with an entry even for members
    // who have no completions.
    expect(task.memberCompletions).toEqual({ [FRIEND]: ["2026-05-04"] });
  });

  it("serializes completion dates from the local calendar day", () => {
    const completion = new Date(2026, 4, 3);

    expect(__internal.toCompletedDay(completion)).toBe("2026-05-03");
  });

  it("keeps tasks ordered by explicit position first", () => {
    const tasks = __internal.buildTasks(
      ME,
      [],
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

describe("replaceRemoteGoalsForUser accessibility filter", () => {
  afterEach(() => {
    mockFrom.mockReset();
  });

  it("scopes the completion delete+insert to accessible tasks and reports dropped ids", async () => {
    const OWNED_GOAL = "11111111-1111-4111-8111-111111111111";
    const OWNED_TASK = "22222222-2222-4222-8222-222222222222";
    const SHARED_GOAL = "33333333-3333-4333-8333-333333333333";
    const SHARED_TASK_A = "44444444-4444-4444-8444-444444444444";
    const SHARED_TASK_B = "55555555-5555-4555-8555-555555555555";

    const ownedGoals: Goal[] = [
      {
        id: OWNED_GOAL,
        title: "Fitness",
        createdAt: 1,
        tasks: [
          {
            id: OWNED_TASK,
            title: "Run",
            frequency: "daily",
            completions: [new Date(2026, 4, 3)],
          },
        ],
      },
    ];
    const sharedGoals: Goal[] = [
      {
        id: SHARED_GOAL,
        title: "Run club",
        createdAt: 1,
        ownerUserId: FRIEND,
        tasks: [
          {
            id: SHARED_TASK_A,
            title: "Log run",
            frequency: "daily",
            completions: [new Date(2026, 4, 4)],
          },
          {
            // Owner deleted this task (or we lost access): it will be
            // missing from the accessibility select below.
            id: SHARED_TASK_B,
            title: "Gone",
            frequency: "daily",
            completions: [new Date(2026, 4, 5)],
          },
        ],
      },
    ];

    // Responses in from() call order:
    const log = setupSupabaseQueries([
      { data: [] }, // goals select (existing remote graph: empty)
      {}, // goals upsert
      {}, // tasks upsert
      // accessibility select: SHARED_TASK_B is no longer visible
      { data: [{ id: OWNED_TASK }, { id: SHARED_TASK_A }] },
      {}, // task_completions delete
      {}, // task_completions insert
    ]);

    const result = await replaceRemoteGoalsForUser(
      { id: ME } as User,
      ownedGoals,
      sharedGoals,
    );

    expect(result.droppedTaskIds).toEqual([SHARED_TASK_B]);

    // The accessibility probe asked about every candidate task.
    const accessibilityQuery = log.find(
      (query) => query.table === "tasks" && query.steps[0]?.method === "select",
    );
    expect(accessibilityQuery?.steps[1]).toEqual({
      method: "in",
      args: ["id", [OWNED_TASK, SHARED_TASK_A, SHARED_TASK_B]],
    });

    const completionQueries = log.filter(
      (query) => query.table === "task_completions",
    );
    expect(completionQueries).toHaveLength(2);
    const [deleteQuery, insertQuery] = completionQueries;

    // Delete: only my rows, only for tasks still accessible.
    expect(deleteQuery.steps).toEqual([
      { method: "delete", args: [] },
      { method: "eq", args: ["completed_by_user_id", ME] },
      { method: "in", args: ["task_id", [OWNED_TASK, SHARED_TASK_A]] },
    ]);

    // Insert: the dropped task's completion row never gets written.
    const insertedRows = insertQuery.steps[0].args[0] as Array<{
      task_id: string;
      completed_by_user_id: string;
      completed_day: string;
    }>;
    expect(insertedRows.map((row) => [row.task_id, row.completed_day])).toEqual(
      [
        [OWNED_TASK, "2026-05-03"],
        [SHARED_TASK_A, "2026-05-04"],
      ],
    );
    expect(insertedRows.every((row) => row.completed_by_user_id === ME)).toBe(
      true,
    );
  });
});
