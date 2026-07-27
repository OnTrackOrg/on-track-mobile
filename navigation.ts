import { NavigatorScreenParams } from "@react-navigation/native";
import { FriendProfile } from "./types";

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
  Friend: { friend: FriendProfile };
  Privacy: undefined;
  Instructions: undefined;
};
