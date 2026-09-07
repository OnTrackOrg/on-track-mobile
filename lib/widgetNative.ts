import { requireOptionalNativeModule } from "expo-modules-core";

/**
 * The native half of the widget bridge, implemented by the local Expo module
 * in modules/ontrack-widgets. Present only in development/production builds
 * of the iOS app; null in Expo Go, on Android and in Jest.
 */
export interface WidgetNativeModule {
  /** Store the snapshot JSON under `key` in the app group's UserDefaults. */
  setSnapshot(appGroup: string, key: string, json: string): boolean;
  /** Ask WidgetKit to rebuild every OnTrack widget timeline. */
  reloadWidgets(): void;
}

export const getWidgetNativeModule = (): WidgetNativeModule | null => {
  try {
    return requireOptionalNativeModule<WidgetNativeModule>("OnTrackWidgets");
  } catch {
    return null;
  }
};
