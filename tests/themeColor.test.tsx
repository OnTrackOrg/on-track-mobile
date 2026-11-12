import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ColorPicker from "../components/ColorPicker";
import {
  DEFAULT_ACCENT_COLOR,
  ThemeProvider,
  useTheme,
} from "../contexts/ThemeContext";
import { STORAGE_KEYS } from "../lib/persistence";

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("../utils/haptics", () => ({ haptics: { toggle: jest.fn() } }));

function Harness() {
  const { theme, isDark, setAccentColor, toggleTheme, resetThemePreference } =
    useTheme();
  const [visible, setVisible] = useState(false);
  return (
    <View>
      <Text testID="accent">{theme.primary}</Text>
      <Text testID="mode">{isDark ? "dark" : "light"}</Text>
      <Pressable onPress={() => setVisible(true)}>
        <Text>Choose theme</Text>
      </Pressable>
      <Pressable onPress={toggleTheme}>
        <Text>Toggle mode</Text>
      </Pressable>
      <Pressable onPress={resetThemePreference}>
        <Text>Reset preferences</Text>
      </Pressable>
      <ColorPicker
        visible={visible}
        title="Theme color"
        selected={theme.primary}
        autoColor={DEFAULT_ACCENT_COLOR}
        onSelect={(color) => setAccentColor(color ?? DEFAULT_ACCENT_COLOR)}
        onClose={() => setVisible(false)}
      />
    </View>
  );
}
const show = () =>
  render(
    <ThemeProvider>
      <Harness />
    </ThemeProvider>,
  );
beforeEach(async () => {
  await AsyncStorage.clear();
});

it.each([
  ["ocean", "#3b82f6"],
  ["tide", "#0d9488"],
  ["forest", "#059669"],
  ["honey", "#d97706"],
  ["sunset", "#f43f5e"],
  ["rose", "#ec4899"],
  ["lavender", "#8b5cf6"],
  ["graphite", "#475569"],
  ["#Ab12Ef", "#ab12ef"],
  ["invalid", DEFAULT_ACCENT_COLOR],
  ["toString", DEFAULT_ACCENT_COLOR],
])("loads saved color %s as %s", async (saved, expected) => {
  await AsyncStorage.setItem(STORAGE_KEYS.accentTheme, saved);
  const screen = show();
  await waitFor(() =>
    expect(screen.getByTestId("accent")).toHaveTextContent(expected),
  );
});

it("saves a custom color on Done and restores it after remounting in dark mode", async () => {
  await AsyncStorage.setItem(STORAGE_KEYS.themePreference, "dark");
  const screen = show();
  await waitFor(() =>
    expect(screen.getByTestId("mode")).toHaveTextContent("dark"),
  );
  fireEvent.press(screen.getByText("Choose theme"));
  fireEvent.press(screen.getByLabelText("Add custom color"));
  fireEvent(screen.getByLabelText("Hue"), "accessibilityAction", {
    nativeEvent: { actionName: "increment" },
  });
  const chosen = screen.getByLabelText("Hex color").props.value.toLowerCase();
  expect(chosen).not.toBe(DEFAULT_ACCENT_COLOR);
  expect(screen.getByTestId("accent")).toHaveTextContent(DEFAULT_ACCENT_COLOR);
  fireEvent.press(screen.getByText("Save color"));
  fireEvent.press(screen.getByText("Done"));
  await waitFor(() =>
    expect(AsyncStorage.getItem(STORAGE_KEYS.accentTheme)).resolves.toBe(
      chosen,
    ),
  );
  expect(screen.getByTestId("accent")).toHaveTextContent(chosen);
  screen.unmount();
  const restored = show();
  await waitFor(() =>
    expect(restored.getByTestId("accent")).toHaveTextContent(chosen),
  );
  expect(restored.getByTestId("mode")).toHaveTextContent("dark");
  fireEvent.press(restored.getByText("Toggle mode"));
  expect(restored.getByTestId("accent")).toHaveTextContent(chosen);
});

it("discards cancelled custom edits without changing the saved theme", async () => {
  await AsyncStorage.setItem(STORAGE_KEYS.accentTheme, "#ab12ef");
  const screen = show();
  await waitFor(() =>
    expect(screen.getByTestId("accent")).toHaveTextContent("#ab12ef"),
  );
  fireEvent.press(screen.getByText("Choose theme"));
  fireEvent.press(screen.getByLabelText("Add custom color"));
  fireEvent.changeText(screen.getByLabelText("Hex color"), "#12abef");
  fireEvent.press(screen.getByText("Cancel"));
  expect(screen.getByTestId("accent")).toHaveTextContent("#ab12ef");
  expect(await AsyncStorage.getItem(STORAGE_KEYS.accentTheme)).toBe("#ab12ef");
});

it("clears custom color and dark mode when preferences are reset", async () => {
  await AsyncStorage.multiSet([
    [STORAGE_KEYS.accentTheme, "#ab12ef"],
    [STORAGE_KEYS.themePreference, "dark"],
  ]);
  const screen = show();
  await waitFor(() =>
    expect(screen.getByTestId("accent")).toHaveTextContent("#ab12ef"),
  );
  fireEvent.press(screen.getByText("Reset preferences"));
  expect(screen.getByTestId("accent")).toHaveTextContent(DEFAULT_ACCENT_COLOR);
  expect(screen.getByTestId("mode")).toHaveTextContent("light");
  await waitFor(() =>
    expect(AsyncStorage.getItem(STORAGE_KEYS.accentTheme)).resolves.toBeNull(),
  );
  expect(await AsyncStorage.getItem(STORAGE_KEYS.themePreference)).toBeNull();
});
