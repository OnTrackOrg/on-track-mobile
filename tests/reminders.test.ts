jest.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: {
    DATE: "date",
  },
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
}));

import {
  countUnfinishedDailyTasks,
  getNextReminderDate,
} from "../lib/reminders";
import { Goal } from "../types";

describe("reminder helpers", () => {
  it("counts unfinished daily tasks across active goals only", () => {
    const goals: Goal[] = [
      {
        id: "active-goal",
        title: "Active",
        createdAt: 1,
        tasks: [
          {
            id: "daily-done",
            title: "Done",
            frequency: "daily",
            completions: [new Date("2026-05-20T12:00:00.000Z")],
          },
          {
            id: "daily-open",
            title: "Open",
            frequency: "daily",
            completions: [],
          },
          {
            id: "weekly-open",
            title: "Weekly",
            frequency: "weekly",
            completions: [],
          },
        ],
      },
      {
        id: "completed-goal",
        title: "Completed",
        completedAt: 2,
        createdAt: 1,
        tasks: [
          {
            id: "completed-daily-open",
            title: "Completed open",
            frequency: "daily",
            completions: [],
          },
        ],
      },
    ];

    expect(
      countUnfinishedDailyTasks(goals, new Date("2026-05-20T18:00:00.000Z")),
    ).toBe(1);
  });

  it("schedules the next reminder today when the reminder time is still ahead", () => {
    const reminderDate = getNextReminderDate(
      { hour: 20, minute: 0 },
      new Date(2026, 4, 20, 18, 0, 0),
    );

    expect(reminderDate.getFullYear()).toBe(2026);
    expect(reminderDate.getMonth()).toBe(4);
    expect(reminderDate.getDate()).toBe(20);
    expect(reminderDate.getHours()).toBe(20);
    expect(reminderDate.getMinutes()).toBe(0);
  });

  it("rolls the next reminder to tomorrow when today's reminder time has passed", () => {
    const reminderDate = getNextReminderDate(
      { hour: 20, minute: 0 },
      new Date(2026, 4, 20, 21, 0, 0),
    );

    expect(reminderDate.getFullYear()).toBe(2026);
    expect(reminderDate.getMonth()).toBe(4);
    expect(reminderDate.getDate()).toBe(21);
    expect(reminderDate.getHours()).toBe(20);
    expect(reminderDate.getMinutes()).toBe(0);
  });
});
