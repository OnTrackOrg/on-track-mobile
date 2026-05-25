import AsyncStorage from "@react-native-async-storage/async-storage";
import { addDays, format, startOfDay } from "date-fns";
import * as Notifications from "expo-notifications";
import { Goal } from "../types";
import { STORAGE_KEYS } from "./persistence";

export type ReminderSettings = {
  enabled: boolean;
  hour: number;
  minute: number;
};

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  hour: 20,
  minute: 0,
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const isValidReminderSettings = (value: unknown): value is ReminderSettings => {
  const settings = value as ReminderSettings;
  return (
    typeof settings?.enabled === "boolean" &&
    Number.isInteger(settings.hour) &&
    settings.hour >= 0 &&
    settings.hour <= 23 &&
    Number.isInteger(settings.minute) &&
    settings.minute >= 0 &&
    settings.minute <= 59
  );
};

export const getReminderSettings = async (): Promise<ReminderSettings> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.reminderSettings);

  if (!raw) {
    return DEFAULT_REMINDER_SETTINGS;
  }

  try {
    const parsed = JSON.parse(raw);
    return isValidReminderSettings(parsed) ? parsed : DEFAULT_REMINDER_SETTINGS;
  } catch {
    return DEFAULT_REMINDER_SETTINGS;
  }
};

export const saveReminderSettings = async (
  settings: ReminderSettings,
): Promise<void> => {
  await AsyncStorage.setItem(
    STORAGE_KEYS.reminderSettings,
    JSON.stringify(settings),
  );
};

export const requestReminderPermissions = async (): Promise<boolean> => {
  const current = await Notifications.getPermissionsAsync();
  const currentPermission = current as { granted?: boolean; status?: string };

  if (currentPermission.granted || currentPermission.status === "granted") {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  const requestedPermission = requested as {
    granted?: boolean;
    status?: string;
  };
  return Boolean(
    requestedPermission.granted || requestedPermission.status === "granted",
  );
};

export const countUnfinishedDailyTasks = (
  goals: Goal[],
  referenceDate: Date,
): number => {
  const dateKey = format(startOfDay(referenceDate), "yyyy-MM-dd");

  return goals
    .filter((goal) => goal.completedAt === undefined)
    .reduce((count, goal) => {
      const unfinishedDailyTasks = goal.tasks.filter((task) => {
        if (task.frequency !== "daily") {
          return false;
        }

        return !task.completions.some(
          (completion) =>
            format(startOfDay(completion), "yyyy-MM-dd") === dateKey,
        );
      });

      return count + unfinishedDailyTasks.length;
    }, 0);
};

export const getNextReminderDate = (
  settings: Pick<ReminderSettings, "hour" | "minute">,
  now: Date = new Date(),
): Date => {
  const reminderDate = new Date(now);
  reminderDate.setHours(settings.hour, settings.minute, 0, 0);

  return reminderDate.getTime() > now.getTime()
    ? reminderDate
    : addDays(reminderDate, 1);
};

const cancelStoredReminder = async () => {
  const existingId = await AsyncStorage.getItem(
    STORAGE_KEYS.reminderNotificationId,
  );

  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId);
    await AsyncStorage.removeItem(STORAGE_KEYS.reminderNotificationId);
  }
};

export const syncDailyReminder = async (
  goals: Goal[],
  settings: ReminderSettings,
  now: Date = new Date(),
): Promise<void> => {
  await cancelStoredReminder();

  if (!settings.enabled) {
    return;
  }

  const reminderDate = getNextReminderDate(settings, now);
  const remainingTaskCount = countUnfinishedDailyTasks(goals, reminderDate);

  if (remainingTaskCount === 0) {
    return;
  }

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: "OnTrack reminder",
      body:
        remainingTaskCount === 1
          ? "You have 1 daily task left today."
          : `You have ${remainingTaskCount} daily tasks left today.`,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminderDate,
    },
  });

  await AsyncStorage.setItem(STORAGE_KEYS.reminderNotificationId, identifier);
};
