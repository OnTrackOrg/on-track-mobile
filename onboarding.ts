import { STORAGE_KEYS } from "./lib/persistence";

export const ONBOARDING_STORAGE_KEY = STORAGE_KEYS.onboardingComplete;

export const shouldShowOnboarding = ({
  hasCompletedOnboarding,
  hasExistingGoals,
}: {
  hasCompletedOnboarding: boolean;
  hasExistingGoals: boolean;
}) => !hasCompletedOnboarding && !hasExistingGoals;
