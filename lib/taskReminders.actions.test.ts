const mockListeners: ((response: unknown) => void)[] = [];
const mockSchedule = jest.fn(async (..._args: unknown[]) => "id");

jest.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: { DATE: "date", TIME_INTERVAL: "timeInterval" },
  AndroidImportance: { HIGH: 4 },
  setNotificationCategoryAsync: jest.fn(async () => null),
  setNotificationChannelAsync: jest.fn(async () => null),
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: (
    listener: (response: unknown) => void,
  ) => {
    mockListeners.push(listener);
    return { remove: jest.fn() };
  },
  getLastNotificationResponseAsync: jest.fn(async () => null),
  clearLastNotificationResponseAsync: jest.fn(async () => {}),
  getPermissionsAsync: jest.fn(async () => ({ status: "denied" })),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  scheduleNotificationAsync: (...args: unknown[]) => mockSchedule(...args),
}));

import { getDosesOnDate, useStore } from "../store";
import { initTaskReminders } from "./taskReminders";

const response = (actionIdentifier: string, date = 1) => ({
  actionIdentifier,
  notification: {
    date,
    request: {
      identifier: "task-reminder:task-1:2026-10-20:1",
      content: {
        title: "Take creatine",
        body: "2 of 3 · Get stronger · 2:30 PM",
        data: {
          kind: "task-reminder",
          goalId: "goal-1",
          taskId: "task-1",
          day: "2026-10-20",
          dose: 1,
        },
      },
    },
  },
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("reminder notification actions", () => {
  const originalState = useStore.getState();
  let cleanup: () => void;

  beforeEach(() => {
    mockListeners.length = 0;
    mockSchedule.mockClear();
    useStore.setState({
      goals: [
        {
          id: "goal-1",
          title: "Get stronger",
          createdAt: 0,
          tasks: [
            {
              id: "task-1",
              title: "Take creatine",
              frequency: "daily",
              timesPerDay: 3,
              completions: [new Date(2026, 9, 20)],
            },
          ],
        },
      ],
    });
    cleanup = initTaskReminders();
  });

  afterEach(() => {
    cleanup();
    useStore.setState(originalState, true);
  });

  const doses = () =>
    getDosesOnDate(
      useStore.getState().goals[0].tasks[0],
      new Date(2026, 9, 20),
    );

  it("Mark done logs the dose for the reminder's day, once per response", async () => {
    mockListeners[0](response("mark-done"));
    mockListeners[0](response("mark-done")); // same response delivered twice
    await flush();
    expect(doses()).toBe(2);
  });

  it("Snooze re-sends the same reminder in 15 minutes", async () => {
    mockListeners[0](response("snooze", 2));
    await flush();
    expect(mockSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: "task-snooze:task-1:2026-10-20:1",
        content: expect.objectContaining({ title: "Take creatine" }),
        trigger: expect.objectContaining({ seconds: 900 }),
      }),
    );
    expect(doses()).toBe(1);
  });

  it("ignores a plain tap and other apps' notifications", async () => {
    mockListeners[0](response("expo.modules.notifications.actions.DEFAULT", 3));
    mockListeners[0]({
      ...response("mark-done", 4),
      notification: {
        date: 4,
        request: { identifier: "nudge", content: { data: { kind: "nudge" } } },
      },
    });
    await flush();
    expect(doses()).toBe(1);
  });
});
