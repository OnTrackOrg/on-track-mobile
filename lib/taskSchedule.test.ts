import { Task } from "../types";
import {
  describeTaskSchedule,
  formatWeekdays,
  normalizeWeekdays,
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
