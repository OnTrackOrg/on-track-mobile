import React from "react";
import { Text, TextInput, View } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import {
  CommonActions,
  NavigationContainer,
  createNavigationContainerRef,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider, useTheme } from "../contexts/ThemeContext";
import { RootStackParamList, TabParamList } from "../navigation";
import { getStackScreenOptions } from "../lib/navigationOptions";
import NewGoalScreen from "../components/NewGoalScreen";

jest.mock(
  "react-native-safe-area-context",
  () => require("react-native-safe-area-context/jest/mock").default,
);
jest.mock("@expo/vector-icons", () => ({ Ionicons: "Icon" }));
jest.mock("../utils/haptics", () => ({
  haptics: { navigate: jest.fn(), tap: jest.fn(), press: jest.fn() },
}));
jest.mock("../components/TaskEditorModal", () => () => null);
jest.mock("../components/DatePickerModal", () => () => null);
jest.mock("../components/GoalColorPicker", () => () => null);

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();
const friend = { userId: "friend", username: "friend", displayName: "Friend" };
const destinations = [
  ["Friend", { friend }],
  ["Goal", { goalId: "goal" }],
  ["AchievedGoals", undefined],
  ["FindPeople", undefined],
  ["Privacy", undefined],
  ["Instructions", undefined],
] as const;

function TabContent() {
  const [value, setValue] = React.useState("");
  return (
    <TextInput
      accessibilityLabel="Preserved tab state"
      value={value}
      onChangeText={setValue}
    />
  );
}

function Tabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, animation: "none" }}>
      <Tab.Screen name="Today" component={TabContent} />
      <Tab.Screen name="Goals" component={TabContent} />
      <Tab.Screen name="Profile" component={TabContent} />
    </Tab.Navigator>
  );
}

function Detail() {
  return (
    <View>
      <Text>Detail screen</Text>
    </View>
  );
}

function Harness({
  navigationRef,
}: {
  navigationRef: ReturnType<
    typeof createNavigationContainerRef<RootStackParamList>
  >;
}) {
  const { theme } = useTheme();
  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        screenOptions={({ navigation }) => ({
          ...getStackScreenOptions(theme, navigation),
          animation: "none",
        })}
      >
        <Stack.Screen
          name="Tabs"
          component={Tabs}
          options={{ headerShown: false }}
        />
        {destinations.map(([name]) => (
          <Stack.Screen key={name} name={name} component={Detail} />
        ))}
        <Stack.Screen name="NewGoal" component={NewGoalScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

async function setup() {
  const navigationRef = createNavigationContainerRef<RootStackParamList>();
  const ui = render(
    <ThemeProvider>
      <SafeAreaProvider>
        <Harness navigationRef={navigationRef} />
      </SafeAreaProvider>
    </ThemeProvider>,
  );
  await waitFor(() => expect(navigationRef.isReady()).toBe(true));
  return { ...ui, navigationRef };
}

describe("stack header navigation", () => {
  it.each(destinations)(
    "returns from %s to the same Profile tab and state, repeatedly",
    async (name, params) => {
      const ui = await setup();
      act(() => ui.navigationRef.navigate("Tabs", { screen: "Profile" }));
      fireEvent.changeText(
        ui.getByLabelText("Preserved tab state"),
        "Keep this state",
      );

      for (let visit = 0; visit < 2; visit += 1) {
        act(() => {
          ui.navigationRef.dispatch(CommonActions.navigate(name, params));
        });
        await waitFor(() =>
          expect(ui.navigationRef.getCurrentRoute()?.name).toBe(name),
        );
        fireEvent.press(ui.getByRole("button", { name: "Back" }));
        await waitFor(() =>
          expect(ui.navigationRef.getCurrentRoute()?.name).toBe("Profile"),
        );
        expect(ui.getByLabelText("Preserved tab state").props.value).toBe(
          "Keep this state",
        );
        expect(ui.navigationRef.getRootState().routes).toHaveLength(1);
      }
    },
  );

  it("pops just one screen when a detail screen was opened from another screen", async () => {
    const ui = await setup();
    act(() => ui.navigationRef.navigate("Friend", { friend }));
    act(() => ui.navigationRef.navigate("Goal", { goalId: "goal" }));
    fireEvent.press(ui.getByRole("button", { name: "Back" }));
    await waitFor(() =>
      expect(ui.navigationRef.getCurrentRoute()?.name).toBe("Friend"),
    );
    expect(ui.navigationRef.getRootState().routes).toHaveLength(2);
  });

  it("keeps bottom tab presses working", async () => {
    const ui = await setup();
    for (const tab of ["Goals", "Profile", "Today"]) {
      fireEvent.press(ui.getByText(tab));
      await waitFor(() =>
        expect(ui.navigationRef.getCurrentRoute()?.name).toBe(tab),
      );
    }
    expect(ui.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("steps back through New Goal without losing the title, then leaves from step one", async () => {
    const ui = await setup();
    act(() => ui.navigationRef.navigate("NewGoal"));
    fireEvent.changeText(ui.getByDisplayValue(""), "Remember this title");
    fireEvent.press(ui.getByText("Next"));
    fireEvent.press(ui.getByRole("button", { name: "Previous step" }));
    expect(ui.navigationRef.getCurrentRoute()?.name).toBe("NewGoal");
    expect(ui.getByDisplayValue("Remember this title")).toBeTruthy();
    fireEvent.press(ui.getByRole("button", { name: "Back" }));
    await waitFor(() =>
      expect(ui.navigationRef.getCurrentRoute()?.name).toBe("Today"),
    );
  });
});
