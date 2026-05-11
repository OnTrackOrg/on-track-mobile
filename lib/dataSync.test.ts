jest.mock("./supabase", () => ({
  supabase: {},
}));

import { __internal } from "./dataSync";

describe("dataSync mappers", () => {
  it("builds goals, tasks, and completion dates into store-friendly shapes", () => {
    const goals = __internal.buildGoals(
      [
        {
          id: "goal-1",
          title: "Fitness",
          target: "Move more",
          created_at: "2026-05-01T12:00:00.000Z",
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
          completed_day: "2026-05-03",
        },
      ]
    );

    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({
      id: "goal-1",
      title: "Fitness",
      target: "Move more",
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

  it("serializes completion dates from the local calendar day", () => {
    const completion = new Date(2026, 4, 3);

    expect(__internal.toCompletedDay(completion)).toBe("2026-05-03");
  });

  it("keeps tasks ordered by explicit position first", () => {
    const tasks = __internal.buildTasks(
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
      []
    );

    expect(tasks.map((task) => task.id)).toEqual(["task-1", "task-2"]);
  });

  it("remaps legacy local ids to UUIDs for import/sync", () => {
    const prepared = __internal.prepareGoalsForRemote([
      {
        id: "legacy-goal-id",
        title: "Fitness",
        createdAt: 1,
        tasks: [
          {
            id: "legacy-task-id",
            title: "Run",
            frequency: "daily",
            completions: [new Date("2026-05-03T00:00:00.000Z")],
          },
        ],
      },
    ]);

    expect(prepared.hadLegacyIds).toBe(true);
    expect(prepared.goals[0].id).not.toBe("legacy-goal-id");
    expect(prepared.goals[0].tasks[0].id).not.toBe("legacy-task-id");
    expect(prepared.goals[0].tasks[0].completions[0].toISOString()).toBe("2026-05-03T00:00:00.000Z");
  });

  it("preserves ids that are already UUIDs", () => {
    const prepared = __internal.prepareGoalsForRemote([
      {
        id: "75cfeb0f-8097-4bf2-9fa7-09c66d4d4aa7",
        title: "Fitness",
        createdAt: 1,
        tasks: [
          {
            id: "519c2b3d-88fc-471b-9e59-12fb35df4e31",
            title: "Run",
            frequency: "daily",
            completions: [],
          },
        ],
      },
    ]);

    expect(prepared.hadLegacyIds).toBe(false);
    expect(prepared.goals[0].id).toBe("75cfeb0f-8097-4bf2-9fa7-09c66d4d4aa7");
    expect(prepared.goals[0].tasks[0].id).toBe("519c2b3d-88fc-471b-9e59-12fb35df4e31");
  });
});
