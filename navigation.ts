import { NavigatorScreenParams } from "@react-navigation/native";

export type TabParamList = {
  Today: undefined;
  Goals: undefined;
  Search: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  Goal: { goalId: string };
  NewGoal: undefined;
  Privacy: undefined;
  Instructions: undefined;
};
