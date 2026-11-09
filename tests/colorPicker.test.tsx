import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
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

const setup = (selected?: string) => {
  const props = {
    visible: true,
    selected,
    autoColor: "#ec4899",
    onSelect: jest.fn(),
    onClose: jest.fn(),
  };
  const screen = render(<GoalColorPicker {...props} />);
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
  return { ...screen, props, layout, touch };
};

it("previews tap and drag selections and only saves the final color on Done", () => {
  const screen = setup("#ff0000");
  screen.layout("Hue", 360, 44);
  screen.touch("Hue", "responderGrant", 120, 22);
  screen.layout("Color saturation and brightness", 300, 200);
  screen.touch("Color saturation and brightness", "responderGrant", 150, 100);
  expect(screen.getByText("#408040")).toBeTruthy();
  // iOS can retain the initial local coordinates as the finger moves.
  fireEvent(
    screen.getByLabelText("Color saturation and brightness"),
    "responderMove",
    {
      nativeEvent: { locationX: 150, locationY: 100, pageX: 340, pageY: 200 },
    },
  );
  expect(screen.getByText("#00FF00")).toBeTruthy();
  expect(screen.props.onSelect).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText("Done"));
  expect(screen.props.onSelect).toHaveBeenCalledWith("#00ff00");
  expect(screen.props.onClose).toHaveBeenCalledTimes(1);
});

it("clamps drags outside the field and discards them when dismissed", () => {
  const screen = setup("#ff0000");
  screen.layout("Color saturation and brightness", 300, 200);
  screen.touch("Color saturation and brightness", "responderGrant", 150, 100);
  screen.touch("Color saturation and brightness", "responderMove", -50, -20);
  expect(screen.getByText("#FFFFFF")).toBeTruthy();
  screen.touch("Color saturation and brightness", "responderMove", 500, 300);
  expect(screen.getByText("#000000")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Close color picker"));
  expect(screen.props.onSelect).not.toHaveBeenCalled();
  screen.rerender(<GoalColorPicker {...screen.props} visible={false} />);
  screen.rerender(<GoalColorPicker {...screen.props} />);
  expect(screen.getByText("#FF0000")).toBeTruthy();
});

it("can restore automatic color and adjust hue and brightness accessibly", () => {
  const screen = setup("#ff0000");
  fireEvent(screen.getByLabelText("Hue"), "accessibilityAction", {
    nativeEvent: { actionName: "increment" },
  });
  expect(screen.getByText("#FF1500")).toBeTruthy();
  fireEvent(
    screen.getByLabelText("Color saturation and brightness"),
    "accessibilityAction",
    { nativeEvent: { actionName: "darker" } },
  );
  expect(screen.getByText("#F21400")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Use automatic goal color"));
  expect(screen.getByText("#EC4899")).toBeTruthy();
  fireEvent.press(screen.getByText("Done"));
  expect(screen.props.onSelect).toHaveBeenCalledWith(null);
});
