import React from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { useTheme } from "../contexts/ThemeContext";
import { RootStackParamList } from "../navigation";
import { useStore } from "../store";
import { Goal } from "../types";
import { haptics } from "../utils/haptics";

type CompletedGoalsProps = NativeStackScreenProps<RootStackParamList, "CompletedGoals">;

const getCompletedLabel = (goal: Goal) => {
  if (!goal.completedAt) {
    return "Achieved";
  }

  return `Achieved ${format(new Date(goal.completedAt), "MMM d, yyyy")}`;
};

export default function CompletedGoalsScreen({ navigation }: CompletedGoalsProps) {
  const goals = useStore((s) => s.goals);
  const reactivateGoal = useStore((s) => s.reactivateGoal);
  const { theme } = useTheme();
  const completedGoals = React.useMemo(
    () =>
      goals
        .filter((goal) => goal.completedAt !== undefined)
        .sort((left, right) => (right.completedAt ?? 0) - (left.completedAt ?? 0)),
    [goals]
  );

  const confirmReactivateGoal = (goal: Goal) => {
    void haptics.warning();
    Alert.alert(
      "Move back to active goals?",
      `"${goal.title}" will appear on the home screen and radar chart again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Move back",
          onPress: () => {
            reactivateGoal(goal.id);
            void haptics.success();
            navigation.navigate("Goal", { goalId: goal.id });
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={["bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <View>
          <Text style={{ fontSize: 22, fontWeight: "800", color: theme.text }}>Completed Goals</Text>
          <Text style={{ color: theme.textSecondary, marginTop: 4 }}>{completedGoals.length} achieved</Text>
        </View>

        {completedGoals.length === 0 ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 10,
              padding: 18,
              backgroundColor: theme.surface,
              alignItems: "center",
              gap: 8,
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.warning + "20",
              }}
            >
              <Ionicons name="trophy-outline" size={24} color={theme.warning} />
            </View>
            <Text style={{ color: theme.text, fontWeight: "700", fontSize: 16 }}>No completed goals yet</Text>
          </View>
        ) : (
          completedGoals.map((goal) => (
            <View
              key={goal.id}
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 10,
                padding: 12,
                backgroundColor: theme.surface,
                gap: 10,
              }}
            >
              <Pressable
                onPress={() => {
                  void haptics.navigate();
                  navigation.navigate("Consistency", { goalId: goal.id });
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 21,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: theme.warning + "20",
                  }}
                >
                  <Ionicons name="trophy-outline" size={22} color={theme.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: "800", fontSize: 16 }}>{goal.title}</Text>
                  {goal.target ? (
                    <Text style={{ color: theme.textSecondary, marginTop: 2 }}>Target: {goal.target}</Text>
                  ) : null}
                  <Text style={{ color: theme.textSecondary, marginTop: 2 }}>{getCompletedLabel(goal)}</Text>
                </View>
                <Ionicons name="analytics-outline" size={18} color={theme.textSecondary} />
              </Pressable>

              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                  {goal.tasks.length} task{goal.tasks.length === 1 ? "" : "s"}
                </Text>
                <Pressable
                  onPress={() => confirmReactivateGoal(goal)}
                  hitSlop={8}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 9999,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    backgroundColor: theme.background,
                  }}
                >
                  <Ionicons name="refresh-outline" size={14} color={theme.textSecondary} />
                  <Text style={{ color: theme.textSecondary, fontWeight: "700", fontSize: 12 }}>Move back</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
