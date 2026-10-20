import { STORAGE_KEYS } from "./lib/persistence";

/**
 * Completing (or skipping) the overlay app tour is remembered per device.
 * The key is versioned: bumping the suffix in STORAGE_KEYS.appTourComplete
 * re-evaluates the tour for everyone on their next launch.
 */
export const APP_TOUR_STORAGE_KEY = STORAGE_KEYS.appTourComplete;

/** Flag written by the retired slide wizard; only cleaned up nowadays. */
export const LEGACY_ONBOARDING_STORAGE_KEY = STORAGE_KEYS.onboardingComplete;

/**
 * The tour is for first-time users only. It shows when this device has not
 * completed it AND the signed-in account has no existing data.
 *
 * Existing data = any goal (achieved or not) known after
 * the session's first sync, or already persisted locally for this account.
 * So an established account that reinstalls or moves to a new device skips
 * the tour; App.tsx then writes the device flag so later launches do not
 * wait for a sync before deciding. (This reverses the issue #151 choice of
 * walking existing users through the tour once.)
 */
export const shouldShowAppTour = ({
  hasCompletedTour,
  hasExistingData,
}: {
  hasCompletedTour: boolean;
  hasExistingData: boolean;
}) => !hasCompletedTour && !hasExistingData;
