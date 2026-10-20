import { Task } from "../types";
import {
  describeLead,
  describeTaskSchedule,
  formatClock,
  formatWeekdays,
  minutesToTime,
  normalizeWeekdays,
  spreadTimes,
  timeToMinutes,
} from "./taskSchedule";

const task = (overrides: Partial<Task>): Task => ({
  id: "task-1",
  title: "Task",
  frequency: "daily",
  completions: [],
  ...overrides,
});

describe("normalizeWeekdays", () => {
  it("sorts, dedupes, and drops out-of-range days", () => {
    expect(normalizeWeekdays([4, 2, 2, 9, -1, 0])).toEqual([0, 2, 4]);
  });
});

describe("formatWeekdays", () => {
  it("names one day", () => {
    expect(formatWeekdays([1])).toBe("every Mon");
  });

  it("joins two days with an ampersand", () => {
    expect(formatWeekdays([4, 2])).toBe("Tue & Thu");
  });

  it("lists three or more days", () => {
    expect(formatWeekdays([1, 3, 5])).toBe("Mon, Wed, Fri");
  });

  it("collapses all seven days", () => {
    expect(formatWeekdays([0, 1, 2, 3, 4, 5, 6])).toBe("every day");
  });
});

describe("describeTaskSchedule", () => {
  it("shows weekday names for weekday-pinned tasks", () => {
    expect(
      describeTaskSchedule(
        task({
          frequency: "custom",
          customFrequency: { type: "weekly", target: 2, weekdays: [2, 4] },
        }),
      ),
    ).toBe("Tue & Thu");
  });

  it("keeps the times-per-period label for floating custom tasks", () => {
    expect(
      describeTaskSchedule(
        task({
          frequency: "custom",
          customFrequency: { type: "weekly", target: 3 },
        }),
      ),
    ).toBe("3 times per week");
  });

  it("passes plain frequencies through", () => {
    expect(describeTaskSchedule(task({ frequency: "daily" }))).toBe("daily");
  });
});

describe("times of day", () => {
  it("spreads doses across the day", () => {
    expect(spreadTimes(1)).toEqual(["09:00"]);
    expect(spreadTimes(3)).toEqual(["08:00", "14:30", "21:00"]);
    expect(spreadTimes(8)).toHaveLength(8);
  });

  it("converts between minutes and HH:mm, clamped to the day", () => {
    expect(timeToMinutes("14:30")).toBe(870);
    expect(minutesToTime(870)).toBe("14:30");
    expect(minutesToTime(-15)).toBe("00:00");
    expect(minutesToTime(24 * 60)).toBe("23:59");
  });

  it("labels lead times", () => {
    expect(describeLead(0)).toBe("At time");
    expect(describeLead(15)).toBe("15 min before");
    expect(describeLead(60)).toBe("1 hr before");
  });
});

describe("describeTaskSchedule with timing", () => {
  it("adds doses per day when there are no times", () => {
    expect(describeTaskSchedule(task({ timesPerDay: 3 }))).toBe(
      "daily · 3× a day",
    );
  });

  it("lists a few times and summarizes many", () => {
    const at = (...times: string[]) =>
      times.map((time) => ({ at: time, remind: false }));
    expect(
      describeTaskSchedule(
        task({ timesPerDay: 2, times: at("08:00", "21:00") }),
      ),
    ).toBe(`daily · ${formatClock("08:00")}, ${formatClock("21:00")}`);
    expect(
      describeTaskSchedule(
        task({ timesPerDay: 4, times: at("08:00", "12:00", "16:00", "20:00") }),
      ),
    ).toBe(`daily · 4× a day from ${formatClock("08:00")}`);
  });

  it("shows a one-off's day", () => {
    expect(
      describeTaskSchedule(task({ frequency: "once", onDay: "2026-10-23" })),
    ).toBe("once · Fri, Oct 23");
  });
});
