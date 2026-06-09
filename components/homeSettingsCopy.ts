export const getAccountSettingsDescription = (
  cloudSyncEnabled: boolean,
): string =>
  cloudSyncEnabled
    ? "Signed in to sync and back up your goals with this account."
    : "Signed in. Any existing goals on this device stay local until you choose to import them for cloud backup.";

export const getPrivacySettingsDescription = (
  cloudSyncEnabled: boolean,
): string =>
  cloudSyncEnabled
    ? "Goals and completion history stay on this device and sync to your account for backup."
    : "Goals and completion history stay on this device until you choose to import them for account sync and backup.";
