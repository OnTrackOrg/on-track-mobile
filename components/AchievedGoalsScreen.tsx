import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { format } from "date-fns";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useStore } from "../store";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";
import { getGoalColor } from "../utils/goalColors";
import { shouldPlayEntrance } from "../utils/entrance";
import { getAchievedWindow } from "../lib/achievedStats";
import { RootStackParamList } from "../navigation";
import AchievedGoalModal from "./AchievedGoalModal";
import { card } from "./ui";

type AchievedGoalsProps = NativeStackScreenProps<
  RootStackParamList,
  "AchievedGoals"
>;

/**
 * Every achieved goal, newest first. Tapping one opens the compressed
 * read-only sheet instead of the full goal page.
 */
export default function AchievedGoalsScreen({
  navigation,
}: AchievedGoalsProps) {
  const { theme, isDark } = useTheme();
  const goals = useStore((s) => s.goals);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [entranceOn] = React.useState(() => shouldPlayEntrance("achieved"));

  const achieved = React.useMemo(
    () =>
      goals
        .filter((g) => g.completedAt !== undefined)
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
    [goals],
  );

  // Nothing left to list (the last one was moved back or deleted): this
  // page has no empty state, so leave it.
  React.useEffect(() => {
    if (achieved.length === 0) navigation.goBack();
  }, [achieved.length, navigation]);

  return (
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {achieved.map((goal, index) => {
          const window = getAchievedWindow(goal);
          const subtitle = [
            `Achieved ${format(new Date(goal.completedAt ?? 0), "MMM d, yyyy")}`,
            window && window.days > 1 ? `${window.days} days` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <Animated.View
              key={goal.id}
              entering={
                entranceOn
                  ? FadeInDown.duration(550).delay(index * 70)
                  : undefined
              }
            >
              <Pressable
                onPress={() => {
                  void haptics.tap();
                  setSelected(goal.id);
                }}
                style={{
                  ...card(theme, isDark),
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingLeft: 18,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    position: "absolute",
                    left: 7,
                    top: 14,
                    bottom: 14,
                    width: 3,
                    borderRadius: 2,
                    backgroundColor: getGoalColor(goal),
                  }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontWeight: "700",
                      fontSize: 16,
                      color: theme.text,
                    }}
                  >
                    {goal.title}
                  </Text>
                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontSize: 12,
                      marginTop: 2,
                    }}
                  >
                    {subtitle}
                  </Text>
                </View>
                <Ionicons name="trophy" size={16} color={theme.warning} />
              </Pressable>
            </Animated.View>
          );
        })}
      </ScrollView>

      <AchievedGoalModal goalId={selected} onClose={() => setSelected(null)} />
    </SafeAreaView>
  );
}
