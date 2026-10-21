import * as Notifications from "expo-notifications";
import { AppState, Platform } from "react-native";
import { addDays, format, startOfDay } from "date-fns";
import { Goal } from "../types";
import {
  getDosesOnDate,
  getTaskBucketsForDate,
  getTaskTimesPerDay,
  hasGoalStarted,
  useStore,
} from "../store";
import { timeToMinutes } from "./taskSchedule";

/**
 * Task reminders are local notifications, rebuilt from the store whenever
 * goals change: the soonest reminder times over the next week on days the
 * task still has doses open. Finishing the day (in the app, or from the
 * notification's own "Mark done" button) drops its reminders on the next
 * rebuild.
 */

const KIND = "task-reminder";
const REMINDER_PREFIX = `${KIND}:`;
const SNOOZE_PREFIX = "task-snooze:";
const CATEGORY = "task-reminder";
const ACTION_DONE = "mark-done";
const ACTION_SNOOZE = "snooze";
const ANDROID_CHANNEL = "reminders";
const SNOOZE_SECONDS = 15 * 60;
const HORIZON_DAYS = 7;
// iOS keeps at most 64 pending local notifications per app; leave room for
// snoozes.
const MAX_SCHEDULED = 56;

export type ReminderData = {
  kind: typeof KIND;
  goalId: string;
  taskId: string;
  day: string; // "yyyy-MM-dd" the reminder belongs to
  slot: number; // index into the task's reminders
};

export type PlannedReminder = {
  id: string;
  fireAt: Date;
  title: string;
  body: string;
  data: ReminderData;
};

const dayKeyToDate = (key: string): Date => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
};

/** Pure: which reminders should be pending right now. */
export const planTaskReminders = ({
  goals,
  postponedTasks,
  now,
  horizonDays = HORIZON_DAYS,
  limit = MAX_SCHEDULED,
}: {
  goals: Goal[];
  postponedTasks: Record<string, string[]>;
  now: Date;
  horizonDays?: number;
  limit?: number;
}): PlannedReminder[] => {
  const planned: PlannedReminder[] = [];
  const today = startOfDay(now);

  for (let offset = 0; offset < horizonDays; offset++) {
    const date = addDays(today, offset);
    const day = format(date, "yyyy-MM-dd");
    const postponed = new Set(postponedTasks[day] ?? []);

    for (const goal of goals) {
      if (goal.completedAt !== undefined || !hasGoalStarted(goal, date)) {
        continue;
      }
      // Only tasks still due that day: done, postponed, and off-days drop out.
      for (const task of getTaskBucketsForDate(goal, date, postponed).pending) {
        if (!task.reminders?.length) continue;
        const perDay = getTaskTimesPerDay(task);
        const left = perDay - getDosesOnDate(task, date);
        if (left <= 0) continue;

        task.reminders.forEach((at, slot) => {
          const fireAt = new Date(date);
          fireAt.setMinutes(timeToMinutes(at));
          if (fireAt <= now) return;
          planned.push({
            id: `${REMINDER_PREFIX}${task.id}:${day}:${slot}`,
            fireAt,
            title: task.title,
            body: [perDay > 1 ? `${left} of ${perDay} to go` : null, goal.title]
              .filter(Boolean)
              .join(" · "),
            data: { kind: KIND, goalId: goal.id, taskId: task.id, day, slot },
          });
        });
      }
    }
  }

  return planned
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())
    .slice(0, limit);
};

const isReminderData = (data: unknown): data is ReminderData =>
  typeof data === "object" &&
  data !== null &&
  (data as { kind?: unknown }).kind === KIND;

// Scheduling ------------------------------------------------------------------

let syncChain: Promise<void> = Promise.resolve();
let lastSignature: string | null = null;

const rebuild = async () => {
  const { status } = await Notifications.getPermissionsAsync();
  const state = useStore.getState();
  const plan =
    status === "granted"
      ? planTaskReminders({
          goals: state.goals,
          postponedTasks: state.postponedTasks,
          now: new Date(),
        })
      : [];
  const signature = plan
    .map((r) => `${r.id}@${r.fireAt.getTime()}|${r.title}|${r.body}`)
    .join("\n");

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  // A snooze outlives rebuilds until its day is done.
  const staleSnoozes = scheduled.filter((request) => {
    if (!request.identifier.startsWith(SNOOZE_PREFIX)) return false;
    const data = request.content.data;
    if (!isReminderData(data)) return true;
    const task = state.goals
      .find((goal) => goal.id === data.goalId)
      ?.tasks.find((item) => item.id === data.taskId);
    return (
      !task ||
      getDosesOnDate(task, dayKeyToDate(data.day)) >= getTaskTimesPerDay(task)
    );
  });
  await Promise.all(
    staleSnoozes.map((request) =>
      Notifications.cancelScheduledNotificationAsync(request.identifier),
    ),
  );

  if (signature === lastSignature) return;
  await Promise.all(
    scheduled
      .filter((request) => request.identifier.startsWith(REMINDER_PREFIX))
      .map((request) =>
        Notifications.cancelScheduledNotificationAsync(request.identifier),
      ),
  );
  for (const reminder of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: reminder.id,
      content: {
        title: reminder.title,
        body: reminder.body,
        data: reminder.data,
        sound: "default",
        categoryIdentifier: CATEGORY,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminder.fireAt,
        channelId: ANDROID_CHANNEL,
      },
    });
  }
  lastSignature = signature;
};

/** Rebuild pending reminders from the store; calls run one at a time. */
export const syncTaskReminders = (): Promise<void> => {
  if (Platform.OS === "web") return Promise.resolve();
  syncChain = syncChain.then(rebuild).catch((error) => {
    lastSignature = null; // retry everything next time
    console.warn("Could not schedule task reminders", error);
  });
  return syncChain;
};

/**
 * Ask for notification permission when the user turns a reminder on.
 * False when they declined (now or earlier).
 */
export const ensureReminderPermission = async (): Promise<boolean> => {
  if (Platform.OS === "web") return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.status === "granted") return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === "granted";
};

// Notification actions --------------------------------------------------------

const waitForHydration = (): Promise<void> =>
  useStore.persist.hasHydrated()
    ? Promise.resolve()
    : new Promise((resolve) => {
        const unsubscribe = useStore.persist.onFinishHydration(() => {
          unsubscribe();
          resolve();
        });
      });

const handledResponses = new Set<string>();

const handleResponse = async (
  response: Notifications.NotificationResponse,
): Promise<void> => {
  const { request } = response.notification;
  const data = request.content.data;
  if (!isReminderData(data)) return;
  const key = `${request.identifier}:${response.actionIdentifier}:${response.notification.date}`;
  if (handledResponses.has(key)) return;
  handledResponses.add(key);
  void Notifications.clearLastNotificationResponseAsync().catch(() => {});

  if (response.actionIdentifier === ACTION_DONE) {
    await waitForHydration();
    const state = useStore.getState();
    state.logTaskDose(data.goalId, data.taskId, dayKeyToDate(data.day));
  } else if (response.actionIdentifier === ACTION_SNOOZE) {
    await Notifications.scheduleNotificationAsync({
      identifier: `${SNOOZE_PREFIX}${data.taskId}:${data.day}:${data.slot}`,
      content: {
        title: request.content.title ?? "",
        body: request.content.body ?? "",
        data,
        sound: "default",
        categoryIdentifier: CATEGORY,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: SNOOZE_SECONDS,
        channelId: ANDROID_CHANNEL,
      },
    });
  }
};

/**
 * Wire reminders up once at app start: the actionable category, foreground
 * presentation, action handling (including one that arrived while the app
 * was not running), and rebuilds on every goal change and foreground.
 */
export const initTaskReminders = (): (() => void) => {
  if (Platform.OS === "web") return () => {};

  void Notifications.setNotificationCategoryAsync(CATEGORY, [
    {
      identifier: ACTION_DONE,
      buttonTitle: "Mark done",
      options: { opensAppToForeground: false },
    },
    {
      identifier: ACTION_SNOOZE,
      buttonTitle: "Snooze 15 min",
      options: { opensAppToForeground: false },
    },
  ]).catch(() => {});
  if (Platform.OS === "android") {
    void Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: "Task reminders",
      importance: Notifications.AndroidImportance.HIGH,
    }).catch(() => {});
  }

  // Reminders still show while the app is open; other pushes keep the
  // default of staying quiet in the foreground.
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const show = isReminderData(notification.request.content.data);
      return {
        shouldShowBanner: show,
        shouldShowList: show,
        shouldPlaySound: show,
        shouldSetBadge: false,
      };
    },
  });

  const responseSubscription =
    Notifications.addNotificationResponseReceivedListener((response) => {
      void handleResponse(response);
    });
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) void handleResponse(response);
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  const scheduleSync = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void syncTaskReminders();
    }, 400);
  };
  const unsubscribeStore = useStore.subscribe((state, previous) => {
    if (
      state.goals !== previous.goals ||
      state.postponedTasks !== previous.postponedTasks
    ) {
      scheduleSync();
    }
  });
  // New day, changed permission, or time zone: rebuild on every foreground.
  const appStateSubscription = AppState.addEventListener("change", (next) => {
    if (next === "active") scheduleSync();
  });
  void waitForHydration().then(scheduleSync);

  return () => {
    if (timer) clearTimeout(timer);
    responseSubscription.remove();
    unsubscribeStore();
    appStateSubscription.remove();
  };
};
