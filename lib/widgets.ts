import { Platform } from "react-native";
import { getWidgetNativeModule } from "./widgetNative";
import { WidgetSnapshot } from "./widgetSnapshot";

/**
 * Bridge to the iOS home/lock-screen widgets (targets/widgets). The app
 * writes the snapshot JSON into the shared app group's UserDefaults through
 * the local native module in modules/ontrack-widgets and asks WidgetKit to
 * redraw. Both constants are mirrored in `Snapshot.swift`.
 *
 * Only a development/production build carries the native module; in Expo Go,
 * on Android, and in Jest this is a silent no-op.
 */
export const WIDGET_APP_GROUP = "group.com.adamlincodesexpo.ontrack";
export const WIDGET_SNAPSHOT_KEY = "widgetSnapshot";

let lastPublishedJson: string | null = null;

/**
 * Persist the snapshot for the widgets and reload them. Skips the (fairly
 * expensive) reload when nothing changed since the last publish. Returns
 * whether a write happened.
 */
export const publishWidgetSnapshot = (snapshot: WidgetSnapshot): boolean => {
  if (Platform.OS !== "ios") return false;
  const json = JSON.stringify(snapshot);
  if (json === lastPublishedJson) return false;
  const native = getWidgetNativeModule();
  if (!native) return false;
  try {
    if (!native.setSnapshot(WIDGET_APP_GROUP, WIDGET_SNAPSHOT_KEY, json)) {
      return false;
    }
    native.reloadWidgets();
  } catch (error) {
    console.warn("Widget snapshot publish failed", error);
    return false;
  }
  lastPublishedJson = json;
  return true;
};

/** Test seam: forget the last publish so the next call always writes. */
export const resetWidgetPublishCache = () => {
  lastPublishedJson = null;
};
