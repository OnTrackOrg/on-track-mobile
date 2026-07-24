export const STORAGE_KEYS = {
  // Legacy slide-wizard flag, superseded by appTourComplete below.
  onboardingComplete: "ontrack-onboarding-complete",
  // Versioned on purpose: bumping the suffix re-runs the tour for everyone.
  appTourComplete: "ontrack-app-tour-complete-v1",
  storeDev: "ontrack-store-dev",
  storeProd: "ontrack-store-prod",
  themePreference: "ontrack-theme",
  accentTheme: "ontrack-accent-theme",
  avatar: "ontrack-avatar",
  legacyThemePreference: "theme",
} as const;
