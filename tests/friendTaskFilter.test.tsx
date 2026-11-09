import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { format } from "date-fns";
import FriendScreen from "../components/FriendScreen";
import { ThemeProvider } from "../contexts/ThemeContext";
import { useStore } from "../store";
import { FriendProfile, Goal } from "../types";

jest.mock("../components/NudgeButton", () => () => null);
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("../lib/supabase", () => ({ supabase: {} }));
jest.mock("../components/Avatar", () => ({
  __esModule: true,
  default: () => null,
  colorForUserId: () => "#123456",
}));
jest.mock("../utils/haptics", () => ({
  haptics: { tap: jest.fn(), toggle: jest.fn(), warning: jest.fn() },
}));

const today = new Date(2026, 10, 9, 12);
const yesterday = new Date(2026, 10, 8, 12);
const friend: FriendProfile = {
  userId: "friend-1",
  displayName: "Alex",
  username: "alex",
};
const makeGoal = (id = "goal-1"): Goal => ({
  id,
  title: `Goal ${id}`,
  ownerUserId: friend.userId,
  isPublic: true,
  createdAt: new Date(2026, 9, 1).getTime(),
  tasks: [
    { id: "run", title: "Run", frequency: "daily", completions: [today] },
    {
      id: "water",
      title: "Drink water",
      frequency: "daily",
      timesPerDay: 2,
      completions: [yesterday, yesterday, today],
    },
  ],
});
const dateLabel = (day: Date) => format(day, "EEEE, MMMM d, yyyy");
const showScreen = async () => {
  const screen = render(
    <ThemeProvider>
      <FriendScreen
        route={{ key: "friend", name: "Friend", params: { friend } }}
        navigation={{} as never}
      />
    </ThemeProvider>,
  );
  await act(async () => {});
  return screen;
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(today);
  useStore.setState({ friends: [friend], friendGoals: [makeGoal()] });
});
afterEach(() => jest.useRealTimers());

it("filters to actual task dates, switches tasks, and toggles back without changing completions", async () => {
  const screen = await showScreen();
  const goalsBefore = useStore.getState().friendGoals;
  const original = screen.getByLabelText(dateLabel(yesterday)).props
    .accessibilityValue;

  fireEvent.press(screen.getByLabelText("Run"));
  expect(screen.getByLabelText("Run")).toHaveAccessibilityState({
    selected: true,
  });
  expect(screen.getByLabelText(dateLabel(yesterday))).toHaveAccessibilityValue({
    text: "0% complete",
  });
  expect(screen.getByLabelText(dateLabel(today))).toHaveAccessibilityValue({
    text: "100% complete",
  });

  fireEvent.press(screen.getByLabelText("Drink water"));
  expect(screen.getByLabelText("Run")).toHaveAccessibilityState({
    selected: false,
  });
  expect(screen.getByLabelText(dateLabel(yesterday))).toHaveAccessibilityValue({
    text: "100% complete",
  });
  expect(screen.getByLabelText(dateLabel(today))).toHaveAccessibilityValue({
    text: "50% complete",
  });

  fireEvent.press(screen.getByLabelText("Drink water"));
  expect(screen.queryByLabelText("Show all tasks")).toBeNull();
  expect(
    screen.getByLabelText(dateLabel(yesterday)).props.accessibilityValue,
  ).toEqual(original);
  expect(useStore.getState().friendGoals).toBe(goalsBefore);
});

it("can clear a filter after selecting a day where the task row is absent", async () => {
  const goal = makeGoal();
  goal.tasks[0] = {
    ...goal.tasks[0],
    frequency: "once",
    onDay: "2026-11-09",
    completions: [],
  };
  useStore.setState({ friendGoals: [goal] });
  const screen = await showScreen();
  fireEvent.press(screen.getByLabelText("Run"));
  fireEvent.press(screen.getByLabelText(dateLabel(yesterday)));
  expect(screen.queryByLabelText("Run")).toBeNull();
  fireEvent.press(screen.getByLabelText("Show all tasks"));
  expect(screen.queryByLabelText("Show all tasks")).toBeNull();
});

it("keeps task filters separate for each goal, even with matching task IDs", async () => {
  useStore.setState({ friendGoals: [makeGoal(), makeGoal("goal-2")] });
  const screen = await showScreen();
  const secondBefore = screen.getAllByLabelText(dateLabel(yesterday))[1].props
    .accessibilityValue;
  fireEvent.press(screen.getAllByLabelText("Run")[0]);
  expect(
    screen.getAllByLabelText(dateLabel(yesterday))[0],
  ).toHaveAccessibilityValue({ text: "0% complete" });
  expect(
    screen.getAllByLabelText(dateLabel(yesterday))[1].props.accessibilityValue,
  ).toEqual(secondBefore);
  expect(screen.getAllByLabelText("Run")[1]).toHaveAccessibilityState({
    selected: false,
  });
});
