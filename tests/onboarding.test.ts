import { shouldShowOnboarding } from "../onboarding";

describe("shouldShowOnboarding", () => {
  it("shows onboarding for a true first launch", () => {
    expect(
      shouldShowOnboarding({
        hasCompletedOnboarding: false,
        hasExistingGoals: false,
      }),
    ).toBe(true);
  });

  it("skips onboarding after the walkthrough was already completed", () => {
    expect(
      shouldShowOnboarding({
        hasCompletedOnboarding: true,
        hasExistingGoals: false,
      }),
    ).toBe(false);
  });

  it("skips onboarding for users who already have persisted goals", () => {
    expect(
      shouldShowOnboarding({
        hasCompletedOnboarding: false,
        hasExistingGoals: true,
      }),
    ).toBe(false);
  });
});
