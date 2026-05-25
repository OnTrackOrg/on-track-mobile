import { endOfDay } from "date-fns";
import {
  getCurrentModeTaskScore,
  getCustomTrendScore,
  getDailyTrendScore,
  getWeeklyTrendScore,
} from "../components/RadarChart";
import { Task } from "../types";

// Reference week: Sun 2026-04-19 – Sat 2026-04-25
// Reference date: Wed 2026-04-22 (mid-week)
const REFERENCE_DATE = endOfDay(new Date("2026-04-22T12:00:00.000Z"));

const inWeek = (isoString: string) => new Date(isoString);

const makeTask = (
  frequency: Task["frequency"],
  customFrequency?: Task["customFrequency"],
): Task => ({
  id: "t1",
  title: "Task",
  frequency,
  customFrequency,
  completions: [],
});

describe("getCurrentModeTaskScore — daily frequency", () => {
  it("scores 1/7 after one completion this week", () => {
    const completions = [inWeek("2026-04-20T12:00:00.000Z")];
    const score = getCurrentModeTaskScore(
      makeTask("daily"),
      completions,
      REFERENCE_DATE,
    );
    expect(score).toBeCloseTo(1 / 7);
  });

  it("scores 4/7 after four completions this week", () => {
    const completions = [
      inWeek("2026-04-19T12:00:00.000Z"),
      inWeek("2026-04-20T12:00:00.000Z"),
      inWeek("2026-04-21T12:00:00.000Z"),
      inWeek("2026-04-22T12:00:00.000Z"),
    ];
    const score = getCurrentModeTaskScore(
      makeTask("daily"),
      completions,
      REFERENCE_DATE,
    );
    expect(score).toBeCloseTo(4 / 7);
  });

  it("scores 1.0 after seven completions this week", () => {
    const completions = [
      inWeek("2026-04-19T12:00:00.000Z"),
      inWeek("2026-04-20T12:00:00.000Z"),
      inWeek("2026-04-21T12:00:00.000Z"),
      inWeek("2026-04-22T12:00:00.000Z"),
      inWeek("2026-04-23T12:00:00.000Z"),
      inWeek("2026-04-24T12:00:00.000Z"),
      inWeek("2026-04-25T12:00:00.000Z"),
    ];
    const score = getCurrentModeTaskScore(
      makeTask("daily"),
      completions,
      REFERENCE_DATE,
    );
    expect(score).toBe(1);
  });

  it("scores 0 when completions exist only in a prior week", () => {
    const completions = [inWeek("2026-04-18T12:00:00.000Z")]; // Saturday before the week
    const score = getCurrentModeTaskScore(
      makeTask("daily"),
      completions,
      REFERENCE_DATE,
    );
    expect(score).toBe(0);
  });
});

describe("getCurrentModeTaskScore — weekly frequency", () => {
  it("scores 1.0 after one completion this week", () => {
    const completions = [inWeek("2026-04-20T12:00:00.000Z")];
    const score = getCurrentModeTaskScore(
      makeTask("weekly"),
      completions,
      REFERENCE_DATE,
    );
    expect(score).toBe(1);
  });

  it("scores 0 when completed only in a prior week", () => {
    const completions = [inWeek("2026-04-12T12:00:00.000Z")]; // Previous week
    const score = getCurrentModeTaskScore(
      makeTask("weekly"),
      completions,
      REFERENCE_DATE,
    );
    expect(score).toBe(0);
  });
});

describe("getCurrentModeTaskScore — daily vs custom consistency", () => {
  it("daily completed once equals custom 7x/week completed once", () => {
    const completions = [inWeek("2026-04-20T12:00:00.000Z")];

    const dailyScore = getCurrentModeTaskScore(
      makeTask("daily"),
      completions,
      REFERENCE_DATE,
    );

    // getCustomFrequencyProgress reads task.completions directly, so populate them on the task
    const customTask: Task = {
      ...makeTask("custom", { type: "weekly", target: 7 }),
      completions,
    };
    const customScore = getCurrentModeTaskScore(
      customTask,
      completions,
      REFERENCE_DATE,
    );

    expect(dailyScore).toBeCloseTo(customScore);
  });

  it("custom 1x/week completed once scores 1.0, same as weekly", () => {
    const completions = [inWeek("2026-04-20T12:00:00.000Z")];

    const weeklyScore = getCurrentModeTaskScore(
      makeTask("weekly"),
      completions,
      REFERENCE_DATE,
    );

    const customTask: Task = {
      ...makeTask("custom", { type: "weekly", target: 1 }),
      completions,
    };
    const customScore = getCurrentModeTaskScore(
      customTask,
      completions,
      REFERENCE_DATE,
    );

    expect(customScore).toBe(1);
    expect(weeklyScore).toBe(1);
  });
});

describe("trend score helpers", () => {
  it("daily trend uses the active span from first completion through reference date", () => {
    const completions = [
      new Date("2026-04-20T12:00:00.000Z"),
      new Date("2026-04-22T12:00:00.000Z"),
    ];

    const score = getDailyTrendScore(
      completions,
      new Date("2026-04-20T12:00:00.000Z"),
      endOfDay(new Date("2026-04-22T12:00:00.000Z")),
    );

    expect(score).toBeCloseTo(2 / 3);
  });

  it("weekly trend treats a partial first week as one expected week", () => {
    const completions = [new Date("2026-04-22T12:00:00.000Z")];

    const score = getWeeklyTrendScore(
      completions,
      new Date("2026-04-22T12:00:00.000Z"),
      endOfDay(new Date("2026-04-22T12:00:00.000Z")),
    );

    expect(score).toBe(1);
  });

  it("weekly trend expands expected weeks after crossing into a second week", () => {
    const completions = [
      new Date("2026-04-22T12:00:00.000Z"),
      new Date("2026-04-29T12:00:00.000Z"),
    ];

    const score = getWeeklyTrendScore(
      completions,
      new Date("2026-04-22T12:00:00.000Z"),
      endOfDay(new Date("2026-04-30T12:00:00.000Z")),
    );

    expect(score).toBe(1);
  });

  it("custom weekly trend uses target times expected weeks", () => {
    const completions = [
      new Date("2026-04-22T12:00:00.000Z"),
      new Date("2026-04-24T12:00:00.000Z"),
      new Date("2026-04-29T12:00:00.000Z"),
    ];

    const score = getCustomTrendScore(
      completions,
      2,
      "weekly",
      new Date("2026-04-22T12:00:00.000Z"),
      endOfDay(new Date("2026-04-30T12:00:00.000Z")),
    );

    expect(score).toBeCloseTo(3 / 4);
  });

  it("custom monthly trend returns 0 when target is invalid", () => {
    const score = getCustomTrendScore(
      [new Date("2026-04-22T12:00:00.000Z")],
      0,
      "monthly",
      new Date("2026-04-22T12:00:00.000Z"),
      endOfDay(new Date("2026-04-30T12:00:00.000Z")),
    );

    expect(score).toBe(0);
  });
});
