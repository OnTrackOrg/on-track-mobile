import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getUiPreferences,
  updateUiPreferences,
  STORAGE_KEYS,
} from "../lib/persistence";

describe("UI preference persistence", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("stores home radar and consistency view preferences together", async () => {
    await updateUiPreferences({ homeRadarMode: "trend" });
    await updateUiPreferences({ consistencyViewMode: "summary" });

    await expect(getUiPreferences()).resolves.toEqual({
      homeRadarMode: "trend",
      consistencyViewMode: "summary",
    });
    await expect(
      AsyncStorage.getItem(STORAGE_KEYS.uiPreferences),
    ).resolves.toContain("trend");
  });
});
