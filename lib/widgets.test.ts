import { Platform } from "react-native";
import {
  WIDGET_APP_GROUP,
  WIDGET_SNAPSHOT_KEY,
  publishWidgetSnapshot,
  resetWidgetPublishCache,
} from "./widgets";
import { WidgetSnapshot } from "./widgetSnapshot";

const mockSetSnapshot = jest.fn(() => true);
const mockReloadWidgets = jest.fn();
let mockNativeAvailable = true;

jest.mock("./widgetNative", () => ({
  getWidgetNativeModule: () =>
    mockNativeAvailable
      ? { setSnapshot: mockSetSnapshot, reloadWidgets: mockReloadWidgets }
      : null,
}));

const snapshot: WidgetSnapshot = { version: 1, accent: "#3b82f6", days: [] };

const setPlatform = (os: string) =>
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });

describe("publishWidgetSnapshot", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetSnapshot.mockReturnValue(true);
    mockNativeAvailable = true;
    resetWidgetPublishCache();
    setPlatform("ios");
  });

  it("writes the snapshot into the app group and reloads the widgets", () => {
    expect(publishWidgetSnapshot(snapshot)).toBe(true);
    expect(mockSetSnapshot).toHaveBeenCalledWith(
      WIDGET_APP_GROUP,
      WIDGET_SNAPSHOT_KEY,
      JSON.stringify(snapshot),
    );
    expect(mockReloadWidgets).toHaveBeenCalledTimes(1);
  });

  it("skips an unchanged snapshot", () => {
    publishWidgetSnapshot(snapshot);
    expect(publishWidgetSnapshot({ ...snapshot })).toBe(false);
    expect(mockSetSnapshot).toHaveBeenCalledTimes(1);
    expect(publishWidgetSnapshot({ ...snapshot, accent: "#0d9488" })).toBe(
      true,
    );
    expect(mockSetSnapshot).toHaveBeenCalledTimes(2);
  });

  it("does not remember a write the app group refused", () => {
    mockSetSnapshot.mockReturnValueOnce(false);
    expect(publishWidgetSnapshot(snapshot)).toBe(false);
    expect(mockReloadWidgets).not.toHaveBeenCalled();
    expect(publishWidgetSnapshot(snapshot)).toBe(true);
  });

  it("does nothing without the native module (Expo Go)", () => {
    mockNativeAvailable = false;
    expect(publishWidgetSnapshot(snapshot)).toBe(false);
  });

  it("does nothing off iOS", () => {
    setPlatform("android");
    expect(publishWidgetSnapshot(snapshot)).toBe(false);
    expect(mockSetSnapshot).not.toHaveBeenCalled();
  });
});
