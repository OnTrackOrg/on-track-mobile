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
          custom_frequency_type: "weekly",
          custom_frequency_target: 3,
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
    expect(goals[0].tasks[0].completions[0]).toBeInstanceOf(Date);
    expect(goals[0].tasks[0].completions[0].toISOString()).toBe("2026-05-03T00:00:00.000Z");
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
});
