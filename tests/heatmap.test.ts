import { getHeatmapInitialScrollX } from "../components/Heatmap";

describe("getHeatmapInitialScrollX", () => {
  const days = Array.from(
    { length: 21 },
    (_, index) => `2026-05-${String(index + 1).padStart(2, "0")}`,
  );

  it("scrolls toward the column containing the selected reference date", () => {
    expect(
      getHeatmapInitialScrollX({
        days,
        referenceDateKey: "2026-05-20",
        cell: 14,
        gap: 2,
        trailingColumns: 1,
      }),
    ).toBe(16);
  });

  it("returns null when the selected reference date is outside the heatmap range", () => {
    expect(
      getHeatmapInitialScrollX({
        days,
        referenceDateKey: "2026-06-01",
        cell: 14,
        gap: 2,
      }),
    ).toBeNull();
  });
});
