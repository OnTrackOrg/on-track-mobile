import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCustomColors } from "../lib/customColors";
import { STORAGE_KEYS } from "../lib/persistence";
import GoalColorPicker from "../components/GoalColorPicker";
import { hexToHsv, hsvToHex } from "../utils/color";

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("../contexts/ThemeContext", () => ({
  useTheme: () => ({
    theme: {
      text: "#111827",
      surface: "#ffffff",
      textSecondary: "#6b7280",
      border: "#e5e7eb",
      primary: "#3b82f6",
    },
    isDark: false,
  }),
}));
jest.mock("../utils/haptics", () => ({ haptics: { toggle: jest.fn() } }));

it.each([
  "#000000",
  "#ffffff",
  "#808080",
  "#ff0000",
  "#00ff00",
  "#0000ff",
  "#ec4899",
  "#992758",
])("preserves %s when opening a saved color", (hex) => {
  expect(hsvToHex(hexToHsv(hex))).toBe(hex);
});

beforeEach(async () => {
  await AsyncStorage.clear();
  useCustomColors.setState({ colors: [] });
});

const setup = (selected = "#ff0000") => {
  const props = {
    visible: true,
    selected,
    autoColor: "#ec4899",
    onSelect: jest.fn(),
    onClose: jest.fn(),
  };
  const screen = render(<GoalColorPicker {...props} />);
  const openEditor = () =>
    fireEvent.press(screen.getByLabelText("Add custom color"));
  const layout = (label: string, width: number, height: number) =>
    fireEvent(screen.getByLabelText(label), "layout", {
      nativeEvent: { layout: { width, height } },
    });
  const touch = (label: string, event: string, x: number, y: number) =>
    fireEvent(screen.getByLabelText(label), event, {
      nativeEvent: {
        locationX: x,
        locationY: y,
        pageX: x + 40,
        pageY: y + 200,
      },
    });
  return { ...screen, props, openEditor, layout, touch };
};

it("shows presets and plus without tabs, Automatic, or Paste", () => {
  const screen = setup("#3b82f6");
  expect(screen.getByLabelText("#3b82f6")).toHaveAccessibilityState({
    selected: true,
  });
  expect(screen.queryByRole("tab")).toBeNull();
  expect(screen.queryByText("Automatic")).toBeNull();
  expect(screen.queryByText("Paste")).toBeNull();
  fireEvent.press(screen.getByLabelText("#ec4899"));
  expect(screen.props.onSelect).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText("Done"));
  expect(screen.props.onSelect).toHaveBeenCalledWith("#ec4899");
});

it("previews tap and drag selections, saves a reusable swatch, and applies only on Done", () => {
  const screen = setup();
  screen.openEditor();
  screen.layout("Hue", 360, 44);
  screen.touch("Hue", "responderGrant", 120, 22);
  screen.layout("Color saturation and brightness", 300, 200);
  screen.touch("Color saturation and brightness", "responderGrant", 150, 100);
  expect(screen.getByDisplayValue("#408040")).toBeTruthy();
  fireEvent(
    screen.getByLabelText("Color saturation and brightness"),
    "responderMove",
    { nativeEvent: { locationX: 150, locationY: 100, pageX: 340, pageY: 200 } },
  );
  expect(screen.getByDisplayValue("#00FF00")).toBeTruthy();
  fireEvent.press(screen.getByText("Done"));
  expect(screen.props.onSelect).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText("Save color"));
  expect(screen.getByLabelText("#00ff00")).toHaveAccessibilityState({
    selected: true,
  });
  expect(useCustomColors.getState().colors).toEqual(["#00ff00"]);
  expect(screen.props.onSelect).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText("Done"));
  expect(screen.props.onSelect).toHaveBeenCalledWith("#00ff00");
});

it("clamps drags and discards editor changes on Cancel", () => {
  const screen = setup();
  screen.openEditor();
  screen.layout("Color saturation and brightness", 300, 200);
  screen.touch("Color saturation and brightness", "responderGrant", 150, 100);
  screen.touch("Color saturation and brightness", "responderMove", -50, -20);
  expect(screen.getByDisplayValue("#FFFFFF")).toBeTruthy();
  screen.touch("Color saturation and brightness", "responderMove", 500, 300);
  expect(screen.getByDisplayValue("#000000")).toBeTruthy();
  fireEvent.press(screen.getByText("Cancel"));
  expect(useCustomColors.getState().colors).toEqual([]);
  fireEvent.press(
    screen.getByLabelText("Cancel color selection", {
      includeHiddenElements: true,
    }),
  );
  expect(screen.props.onSelect).not.toHaveBeenCalled();
  screen.rerender(<GoalColorPicker {...screen.props} visible={false} />);
  screen.rerender(<GoalColorPicker {...screen.props} />);
  screen.openEditor();
  expect(screen.getByDisplayValue("#FF0000")).toBeTruthy();
});

it("validates hex, supports native pasted text, expands shorthand, and deduplicates saved colors", async () => {
  const screen = setup();
  screen.openEditor();
  fireEvent.changeText(screen.getByLabelText("Hex color"), "12");
  expect(screen.getByText("Save color")).toBeDisabled();
  fireEvent.press(screen.getByText("Save color"));
  expect(useCustomColors.getState().colors).toEqual([]);
  fireEvent.changeText(screen.getByLabelText("Hex color"), "  #aBc  ");
  fireEvent.press(screen.getByText("Save color"));
  expect(useCustomColors.getState().colors).toEqual(["#aabbcc"]);
  screen.openEditor();
  fireEvent.changeText(screen.getByLabelText("Hex color"), "AABBCC");
  fireEvent.press(screen.getByText("Save color"));
  expect(useCustomColors.getState().colors).toEqual(["#aabbcc"]);
  await waitFor(() =>
    expect(AsyncStorage.getItem(STORAGE_KEYS.customColors)).resolves.toContain(
      "#aabbcc",
    ),
  );
});

it("restores persisted colors, rejects corrupt values, and keeps colors added during hydration", async () => {
  useCustomColors.getState().addColor("#112233");
  await AsyncStorage.setItem(
    STORAGE_KEYS.customColors,
    JSON.stringify({
      state: { colors: ["#ABCDEF", "bad", "#abcdef", 3] },
      version: 0,
    }),
  );
  await useCustomColors.persist.rehydrate();
  expect(useCustomColors.getState().colors).toEqual(["#abcdef", "#112233"]);
  const screen = setup("#3b82f6");
  fireEvent.press(screen.getByLabelText("#abcdef"));
  fireEvent.press(screen.getByText("Done"));
  expect(screen.props.onSelect).toHaveBeenCalledWith("#abcdef");
});

it("supports accessible hue and brightness adjustments", () => {
  const screen = setup();
  screen.openEditor();
  fireEvent(screen.getByLabelText("Hue"), "accessibilityAction", {
    nativeEvent: { actionName: "increment" },
  });
  expect(screen.getByDisplayValue("#FF1500")).toBeTruthy();
  fireEvent(
    screen.getByLabelText("Color saturation and brightness"),
    "accessibilityAction",
    { nativeEvent: { actionName: "darker" } },
  );
  expect(screen.getByDisplayValue("#F21400")).toBeTruthy();
});
