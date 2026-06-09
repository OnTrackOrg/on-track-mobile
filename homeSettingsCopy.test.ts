import {
  getAccountSettingsDescription,
  getPrivacySettingsDescription,
} from "./components/homeSettingsCopy";

describe("home settings copy", () => {
  it("describes active cloud sync without implying it is still future work", () => {
    expect(getAccountSettingsDescription(true)).toBe(
      "Signed in to sync and back up your goals with this account.",
    );
    expect(getPrivacySettingsDescription(true)).toBe(
      "Goals and completion history stay on this device and sync to your account for backup.",
    );
  });

  it("describes pending local-data import when cloud sync is not on yet", () => {
    expect(getAccountSettingsDescription(false)).toBe(
      "Signed in. Any existing goals on this device stay local until you choose to import them for cloud backup.",
    );
    expect(getPrivacySettingsDescription(false)).toBe(
      "Goals and completion history stay on this device until you choose to import them for account sync and backup.",
    );
  });
});
