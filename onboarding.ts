import { STORAGE_KEYS } from "./lib/persistence";

/**
 * Completing (or skipping) the overlay app tour is remembered per device.
 * The key is versioned: bumping the suffix in STORAGE_KEYS.appTourComplete
 * re-runs the tour for every user, new or existing, on their next launch.
 */
export const APP_TOUR_STORAGE_KEY = STORAGE_KEYS.appTourComplete;

/** Flag written by the retired slide wizard; only cleaned up nowadays. */
export const LEGACY_ONBOARDING_STORAGE_KEY = STORAGE_KEYS.onboardingComplete;

/**
 * The tour shows for everyone who has not completed THIS version of it.
 * Deliberately no "already has goals" escape hatch — existing users go
 * through the overlay tour once too (issue #151).
 */
export const shouldShowAppTour = ({
  hasCompletedTour,
}: {
  hasCompletedTour: boolean;
}) => !hasCompletedTour;
