import AsyncStorage from "@react-native-async-storage/async-storage";

export const STORAGE_KEYS = {
  onboardingComplete: "ontrack-onboarding-complete",
  storeDev: "ontrack-store-dev",
  storeProd: "ontrack-store-prod",
  themePreference: "ontrack-theme",
  legacyThemePreference: "theme",
  uiPreferences: "ontrack-ui-preferences",
  reminderSettings: "ontrack-reminder-settings",
  reminderNotificationId: "ontrack-reminder-notification-id",
} as const;

export type HomeRadarModePreference = "current" | "trend";
export type ConsistencyViewModePreference = "summary" | "tasks";

export type UiPreferences = {
  homeRadarMode?: HomeRadarModePreference;
  consistencyViewMode?: ConsistencyViewModePreference;
};

const readJson = async <T>(key: string): Promise<T | null> => {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const writeJson = async <T>(key: string, value: T): Promise<void> => {
  await AsyncStorage.setItem(key, JSON.stringify(value));
};

export const getUiPreferences = async (): Promise<UiPreferences> =>
  (await readJson<UiPreferences>(STORAGE_KEYS.uiPreferences)) ?? {};

export const updateUiPreferences = async (
  updates: UiPreferences,
): Promise<UiPreferences> => {
  const current = await getUiPreferences();
  const next = { ...current, ...updates };
  await writeJson(STORAGE_KEYS.uiPreferences, next);
  return next;
};
