import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { STORAGE_KEYS } from "./persistence";

// ponytail: one fixed 8 PM check-in; add a time picker if anyone asks.
const REMINDER_ID = "daily-check-in";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const isDailyReminderEnabled = async (): Promise<boolean> =>
  (await AsyncStorage.getItem(STORAGE_KEYS.dailyReminder)) === "1";

/**
 * Turns the 8 PM daily check-in on or off. Returns the resulting state: a
 * declined notification permission leaves the reminder off.
 */
export const setDailyReminderEnabled = async (
  enabled: boolean,
): Promise<boolean> => {
  if (!enabled) {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
    await AsyncStorage.setItem(STORAGE_KEYS.dailyReminder, "0");
    return false;
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") {
    await AsyncStorage.setItem(STORAGE_KEYS.dailyReminder, "0");
    return false;
  }
  // Same identifier every time, so re-scheduling replaces rather than stacks.
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: "End-of-day check-in",
      body: "Did you finish today's tasks? Tick them off before the day ends.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 20,
      minute: 0,
    },
  });
  await AsyncStorage.setItem(STORAGE_KEYS.dailyReminder, "1");
  return true;
};
