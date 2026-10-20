import { shouldShowAppTour } from "../onboarding";
import { TOUR_STEPS } from "../components/tour/tourSteps";

describe("shouldShowAppTour", () => {
  it("shows the tour for a first-time user on a fresh device", () => {
    expect(
      shouldShowAppTour({ hasCompletedTour: false, hasExistingData: false }),
    ).toBe(true);
  });

  it("skips the tour once this device completed or skipped it", () => {
    expect(
      shouldShowAppTour({ hasCompletedTour: true, hasExistingData: false }),
    ).toBe(false);
    expect(
      shouldShowAppTour({ hasCompletedTour: true, hasExistingData: true }),
    ).toBe(false);
  });

  it("skips the tour for an account that already has goals", () => {
    expect(
      shouldShowAppTour({ hasCompletedTour: false, hasExistingData: true }),
    ).toBe(false);
  });
});

describe("TOUR_STEPS", () => {
  it("opens and closes with centered steps (no anchors)", () => {
    expect(TOUR_STEPS[0].anchors).toBeUndefined();
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].anchors).toBeUndefined();
  });

  it("covers both goals and tasks", () => {
    const allText = TOUR_STEPS.map((s) => `${s.title} ${s.text}`)
      .join(" ")
      .toLowerCase();
    expect(allText).toContain("goal");
    expect(allText).toContain("task");
  });

  it("provides empty-state copy for every data-dependent anchor step", () => {
    const dataDependent = TOUR_STEPS.filter((s) =>
      s.anchors?.some((a) => a === "goals-card" || a === "today-task"),
    );
    expect(dataDependent.length).toBeGreaterThan(0);
    for (const step of dataDependent) {
      expect(step.textWhenEmpty).toBeTruthy();
    }
  });
});
