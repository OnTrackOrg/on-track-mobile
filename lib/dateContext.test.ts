import { startOfDay } from "date-fns";
import { getNextTrackingDate, getPreviousTrackingDate } from "./dateContext";

describe("dateContext helpers", () => {
  it("moves to the previous day", () => {
    const result = getPreviousTrackingDate(new Date("2026-05-13T12:00:00.000Z"));

    expect(result).toEqual(new Date("2026-05-12T12:00:00.000Z"));
  });

  it("moves to the next day when still in the past", () => {
    const result = getNextTrackingDate(
      new Date("2026-05-11T12:00:00.000Z"),
      new Date("2026-05-13T18:00:00.000Z")
    );

    expect(result).toEqual(new Date("2026-05-12T12:00:00.000Z"));
  });

  it("clamps forward navigation to today instead of allowing a future date", () => {
    const today = new Date("2026-05-13T18:00:00.000Z");
    const result = getNextTrackingDate(new Date("2026-05-13T00:00:00.000Z"), today);

    expect(result).toEqual(startOfDay(today));
  });

  it("returns today when the selected date is already today", () => {
    const today = new Date("2026-05-13T18:00:00.000Z");
    const result = getNextTrackingDate(startOfDay(today), today);

    expect(result).toEqual(startOfDay(today));
  });
});
