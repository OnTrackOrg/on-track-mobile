import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import OverviewScreen from "./components/OverviewScreen";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: "Svg",
  Circle: "Circle",
}));

jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

jest.mock("./components/Heatmap", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return function MockHeatmap(props: {
    valueMode?: string;
    values?: Record<string, number>;
  }) {
    return (
      <Text testID="heatmap">
        {JSON.stringify({
          valueMode: props.valueMode ?? "count",
          values: props.values ?? {},
        })}
      </Text>
    );
  };
});

jest.mock("./contexts/ThemeContext", () => ({
  useTheme: () => ({
    theme: {
      background: "#000",
      surface: "#111",
      text: "#fff",
      textSecondary: "#aaa",
      border: "#333",
      primary: "#0af",
    },
  }),
}));

jest.mock("./lib/persistence", () => ({
  getUiPreferences: jest.fn(async () => ({})),
  updateUiPreferences: jest.fn(async () => ({})),
}));

const mockState = {
  selectedDate: new Date("2026-05-06T12:00:00.000Z"),
  frozenDays: [] as Array<{ date: string; reason: string; createdAt: number }>,
  setSelectedDate: jest.fn(),
  freezeDay: jest.fn(),
  unfreezeDay: jest.fn(),
  isDayFrozen: jest.fn(() => false),
  getFreezeReason: jest.fn(() => undefined),
  goals: [
    {
      id: "goal-1",
      title: "Fitness",
      createdAt: Date.now(),
      tasks: [
        {
          id: "recurring-1",
          title: "Walk",
          frequency: "daily" as const,
          completions: [new Date("2026-05-05T12:00:00.000Z")],
        },
        {
          id: "recurring-2",
          title: "Stretch",
          frequency: "daily" as const,
          completions: [],
        },
        {
          id: "once-1",
          title: "Buy shoes",
          frequency: "once" as const,
          completions: [new Date("2026-05-04T12:00:00.000Z")],
        },
        {
          id: "once-2",
          title: "Book physio",
          frequency: "once" as const,
          completions: [new Date("2026-05-03T12:00:00.000Z")],
        },
      ],
    },
  ],
};

jest.mock("./store", () => ({
  useStore: (selector: (state: typeof mockState) => unknown) =>
    selector(mockState),
  getCustomFrequencyProgress: () => ({
    completed: 0,
    target: 1,
    achieved: false,
  }),
  getGoalStreak: () => 0,
}));

describe("OverviewScreen", () => {
  it("lets users switch to a goal-level summary heatmap", () => {
    const { getByText, getAllByTestId, queryByText } = render(
      <OverviewScreen
        navigation={{} as never}
        route={
          {
            key: "Consistency-1",
            name: "Consistency",
            params: { goalId: "goal-1" },
          } as never
        }
      />,
    );

    expect(getByText("Per-task")).toBeTruthy();
    expect(getByText("Summary")).toBeTruthy();
    expect(queryByText("Goal summary heatmap")).toBeNull();

    fireEvent.press(getByText("Summary"));

    expect(getByText("Goal summary heatmap")).toBeTruthy();
    expect(
      getByText(/what percentage of this goal’s recurring tasks/i),
    ).toBeTruthy();
    expect(getByText("Completion scale")).toBeTruthy();
    expect(getByText("1-24%")).toBeTruthy();
    expect(getByText("25-49%")).toBeTruthy();
    expect(getByText("50-74%")).toBeTruthy();
    expect(getByText("75-99%")).toBeTruthy();
    expect(getByText("100%")).toBeTruthy();
    expect(getAllByTestId("heatmap")).toHaveLength(1);
    expect(getByText(/"valueMode":"ratio"/)).toBeTruthy();
    expect(getByText(/"2026-05-05":0.5/)).toBeTruthy();
    expect(queryByText("Walk")).toBeNull();
    expect(queryByText("One-off task history")).toBeNull();
  });

  it("renders one combined heatmap for all one-off tasks in a goal", () => {
    const { getAllByTestId, getByText, queryByText } = render(
      <OverviewScreen
        navigation={{} as never}
        route={
          {
            key: "Consistency-1",
            name: "Consistency",
            params: { goalId: "goal-1" },
          } as never
        }
      />,
    );

    expect(getByText("One-off task history")).toBeTruthy();
    expect(getByText(/Once tasks in this goal:/i)).toBeTruthy();
    expect(getAllByTestId("heatmap")).toHaveLength(3);
    expect(getByText("Walk")).toBeTruthy();
    expect(getByText("Stretch")).toBeTruthy();
    expect(queryByText("Buy shoes")).toBeNull();
    expect(queryByText("Book physio")).toBeNull();
  });
});
