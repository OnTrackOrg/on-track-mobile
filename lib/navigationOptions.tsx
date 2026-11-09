import React from "react";
import { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { ThemeColors } from "../contexts/ThemeContext";
import NavigationBackButton from "../components/NavigationBackButton";

export function getStackScreenOptions(
  theme: ThemeColors,
  navigation: { goBack: () => void },
): NativeStackNavigationOptions {
  return {
    headerStyle: { backgroundColor: theme.surface },
    headerTintColor: theme.text,
    headerTitleStyle: { color: theme.text },
    // screens 4.16's native back action can stop responding on newer iOS.
    // Dispatch through React Navigation instead, retaining the current tab
    // and its state rather than navigating to a new Tabs route.
    headerBackVisible: false,
    headerLeft: ({ canGoBack, tintColor }) =>
      canGoBack ? (
        <NavigationBackButton
          onPress={navigation.goBack}
          tintColor={tintColor}
        />
      ) : null,
  };
}
