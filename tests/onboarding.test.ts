import { shouldShowAppTour } from "../onboarding";
import { TOUR_STEPS } from "../components/tour/tourSteps";

describe("shouldShowAppTour", () => {
  it("shows the tour when this version has not been completed", () => {
    expect(shouldShowAppTour({ hasCompletedTour: false })).toBe(true);
  });

  it("skips the tour once this version was completed or skipped", () => {
    expect(shouldShowAppTour({ hasCompletedTour: true })).toBe(false);
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
