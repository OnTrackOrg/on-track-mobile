import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { differenceInCalendarDays, format, subDays } from "date-fns";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import {
  useStore,
  getGoalLifecycleStatus,
  getGoalProgress,
  getGoalStartDate,
  getGoalStreak,
} from "../store";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";
import { goalColor } from "../utils/goalColors";
import { mix, withAlpha } from "../utils/color";
import { shouldPlayEntrance } from "../utils/entrance";
import { Goal } from "../types";
import { RootStackParamList } from "../navigation";
import DatePickerModal from "./DatePickerModal";
import ProgressRing from "./ProgressRing";
import { TourAnchor } from "./tour/TourAnchor";
import { card } from "./ui";

const getDayDate = (dayKey: string): Date => {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(year, month - 1, day);
};

// ponytail: drag-reorder for goals was dropped with the old HomeScreen;
// ordering survives via the stored goal order (position on flush) only.
export default function GoalsScreen() {
  const { theme, isDark } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const goals = useStore((s) => s.goals);
  const sharedGoals = useStore((s) => s.sharedGoals);
  const startGoal = useStore((s) => s.startGoal);

  const [achievedOpen, setAchievedOpen] = React.useState(false);
  // Goal whose "start on..." date picker is open.
  const [startingGoalId, setStartingGoalId] = React.useState<string | null>(
    null,
  );

  // Entrance rise-in plays once per session for this tab.
  const [entranceOn] = React.useState(() => shouldPlayEntrance("goals"));
  const entering = (index: number) =>
    entranceOn ? FadeInDown.duration(550).delay(index * 70) : undefined;

  const today = new Date();
  const statusOf = (g: Goal) => getGoalLifecycleStatus(g, today);
  const activeOwned = goals.filter((g) => statusOf(g) === "active");
  // Shared drafts stay visible to invited members too (start is owner-only).
  const drafts = [...goals, ...sharedGoals].filter(
    (g) => statusOf(g) === "draft",
  );
  const scheduled = [...goals, ...sharedGoals].filter(
    (g) => statusOf(g) === "scheduled",
  );
  const achieved = goals.filter((g) => g.completedAt !== undefined);
  const activeShared = sharedGoals.filter((g) => statusOf(g) === "active");

  // Last-14-days consistency strip in the goal's colour (redesign mockup).
  const renderStrip = (goal: Goal, color: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 3, flex: 1 }}>
        {Array.from({ length: 14 }, (_, dayIndex) => {
          const day = subDays(today, 13 - dayIndex);
          const ratio = getGoalProgress(goal, day).percent;
          return (
            <View
              key={dayIndex}
              style={{
                flex: 1,
                height: 14,
                borderRadius: 4,
                backgroundColor:
                  ratio <= 0
                    ? withAlpha(theme.textSecondary, 0.14)
                    : mix(color, 0.3 + ratio * 0.7, theme.surface),
              }}
            />
          );
        })}
      </View>
      <Text
        style={{
          color: theme.textSecondary,
          fontSize: 10,
          fontWeight: "600",
          letterSpacing: 0.4,
        }}
      >
        LAST 14 DAYS
      </Text>
    </View>
  );

  const renderGoalCard = (goal: Goal, index: number) => {
    const progress = getGoalProgress(goal, today);
    const color = goalColor(goal.id);
    const maxStreak = goal.tasks.reduce(
      (best, task) => Math.max(best, getGoalStreak(task)),
      0,
    );
    const subtitle = [
      `${goal.tasks.length} task${goal.tasks.length === 1 ? "" : "s"}`,
      goal.target,
      goal.dueDay
        ? `Due ${format(getDayDate(goal.dueDay), "MMM d, yyyy")}`
        : undefined,
    ]
      .filter(Boolean)
      .join(" · ");

    const goalCard = (
      <Pressable
        onPress={() => {
          void haptics.navigate();
          navigation.navigate("Goal", { goalId: goal.id });
        }}
        style={{
          ...card(theme, isDark),
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
            backgroundColor: color,
          }}
        />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <ProgressRing
            size={46}
            strokeWidth={5}
            percent={progress.percent}
            color={color}
            trackColor={mix(theme.primary, 0.15, theme.background)}
          >
            <Text
              style={{ color: theme.text, fontWeight: "700", fontSize: 11 }}
            >
              {Math.round(progress.percent * 100)}%
            </Text>
          </ProgressRing>
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontWeight: "700", fontSize: 16, color: theme.text }}
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
          {maxStreak > 0 ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 2,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 9999,
                backgroundColor: theme.streak + "1f",
              }}
            >
              <Ionicons name="flash" size={12} color={theme.streak} />
              <Text
                style={{
                  color: theme.streak,
                  fontWeight: "800",
                  fontSize: 12,
                }}
              >
                {maxStreak}
              </Text>
            </View>
          ) : null}
        </View>
        {renderStrip(goal, color)}
      </Pressable>
    );

    return (
      <Animated.View key={goal.id} entering={entering(index)}>
        {index === 1 ? (
          // The tour spotlights the first goal card on the list.
          <TourAnchor anchorKey="goals-card">{goalCard}</TourAnchor>
        ) : (
          goalCard
        )}
      </Animated.View>
    );
  };

  const sectionHeaderStyle = {
    fontWeight: "700" as const,
    fontSize: 12,
    letterSpacing: 1,
    color: theme.textSecondary,
    marginTop: 8,
    paddingHorizontal: 2,
  };

  const lifecycleSubtitle = (goal: Goal): string =>
    [
      `${goal.tasks.length} task${goal.tasks.length === 1 ? "" : "s"}`,
      goal.target,
      goal.dueDay
        ? `Due ${format(getDayDate(goal.dueDay), "MMM d, yyyy")}`
        : undefined,
    ]
      .filter(Boolean)
      .join(" · ");

  // Draft cards: dashed outline, no progress chrome, a Start action.
  const renderDraftCard = (goal: Goal) => {
    const color = goalColor(goal.id);
    const isOwned = goals.some((g) => g.id === goal.id);
    return (
      <Pressable
        key={goal.id}
        onPress={() => {
          void haptics.navigate();
          navigation.navigate("Goal", { goalId: goal.id });
        }}
        style={{
          ...card(theme, isDark),
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingLeft: 18,
          overflow: "hidden",
          borderWidth: 1.5,
          borderStyle: "dashed",
          borderColor: withAlpha(theme.textSecondary, 0.35),
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
            backgroundColor: withAlpha(color, 0.45),
          }}
        />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text
              style={{ fontWeight: "700", fontSize: 16, color: theme.text }}
            >
              {goal.title}
            </Text>
            <View
              style={{
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 6,
                backgroundColor: withAlpha(theme.textSecondary, 0.15),
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "800",
                  letterSpacing: 0.6,
                  color: theme.textSecondary,
                }}
              >
                DRAFT
              </Text>
            </View>
          </View>
          <Text
            style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}
          >
            {lifecycleSubtitle(goal)}
          </Text>
        </View>
        {isOwned ? (
          <Pressable
            onPress={() => {
              void haptics.tap();
              setStartingGoalId(goal.id);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 9999,
              backgroundColor: theme.primary,
            }}
          >
            <Ionicons name="play" size={12} color="#ffffff" />
            <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 13 }}>
              Start
            </Text>
          </Pressable>
        ) : null}
      </Pressable>
    );
  };

  // Scheduled cards: start-date badge; owners can tap it to reschedule.
  const renderScheduledCard = (goal: Goal) => {
    const color = goalColor(goal.id);
    const isOwned = goals.some((g) => g.id === goal.id);
    const startDate = getGoalStartDate(goal);
    const daysUntil = differenceInCalendarDays(startDate, today);
    return (
      <Pressable
        key={goal.id}
        onPress={() => {
          void haptics.navigate();
          navigation.navigate("Goal", { goalId: goal.id });
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
            backgroundColor: color,
          }}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "700", fontSize: 16, color: theme.text }}>
            {goal.title}
          </Text>
          <Text
            style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}
          >
            {lifecycleSubtitle(goal)}
          </Text>
        </View>
        <Pressable
          disabled={!isOwned}
          onPress={() => {
            void haptics.tap();
            setStartingGoalId(goal.id);
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 9999,
            backgroundColor: withAlpha(theme.primary, 0.14),
          }}
        >
          <Ionicons name="calendar-outline" size={12} color={theme.primary} />
          <Text
            style={{ color: theme.primary, fontWeight: "700", fontSize: 12 }}
          >
            {daysUntil <= 1
              ? "Starts tomorrow"
              : `Starts ${format(startDate, "MMM d")}`}
          </Text>
        </Pressable>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ fontSize: 34, fontWeight: "800", color: theme.text }}>
            Goals
          </Text>
          <TourAnchor anchorKey="goals-new-button">
            <Pressable
              onPress={() => {
                void haptics.navigate();
                navigation.navigate("NewGoal");
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 9999,
                backgroundColor: theme.primary,
              }}
            >
              <Ionicons name="add" size={16} color="#ffffff" />
              <Text style={{ color: "#ffffff", fontWeight: "700" }}>New</Text>
            </Pressable>
          </TourAnchor>
        </View>

        {activeOwned.length === 0 &&
        activeShared.length === 0 &&
        drafts.length === 0 &&
        scheduled.length === 0 ? (
          <TourAnchor anchorKey="goals-card">
            <View
              style={{
                ...card(theme, isDark),
                padding: 20,
                alignItems: "center",
              }}
            >
              <Text style={{ fontWeight: "700", color: theme.text }}>
                No goals yet
              </Text>
              <Text
                style={{
                  color: theme.textSecondary,
                  marginTop: 4,
                  textAlign: "center",
                }}
              >
                Tap &ldquo;+ New&rdquo; to create your first goal.
              </Text>
            </View>
          </TourAnchor>
        ) : (
          <>
            {activeOwned.map((goal, index) => renderGoalCard(goal, index + 1))}
            {activeShared.map((goal, index) =>
              renderGoalCard(goal, activeOwned.length + index + 1),
            )}
          </>
        )}

        {scheduled.length > 0 ? (
          <>
            <Text style={sectionHeaderStyle}>SCHEDULED</Text>
            {scheduled.map((goal) => renderScheduledCard(goal))}
          </>
        ) : null}

        {drafts.length > 0 ? (
          <>
            <Text style={sectionHeaderStyle}>DRAFTS</Text>
            {drafts.map((goal) => renderDraftCard(goal))}
          </>
        ) : null}

        {achieved.length > 0 ? (
          <>
            {/* Collapsed achieved badges (redesign mockup) */}
            <Pressable
              onPress={() => {
                void haptics.tap();
                setAchievedOpen((open) => !open);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginTop: 8,
                paddingVertical: 4,
                paddingHorizontal: 2,
              }}
            >
              <Text
                style={{
                  fontWeight: "700",
                  fontSize: 12,
                  letterSpacing: 1,
                  color: theme.textSecondary,
                }}
              >
                ACHIEVED
              </Text>
              <View
                style={{
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  paddingHorizontal: 5,
                  backgroundColor: withAlpha(theme.textSecondary, 0.15),
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: 11,
                    fontWeight: "700",
                  }}
                >
                  {achieved.length}
                </Text>
              </View>
              <View style={{ flex: 1 }} />
              <Ionicons
                name={achievedOpen ? "chevron-up" : "chevron-down"}
                size={14}
                color={theme.textSecondary}
              />
            </Pressable>
            {achievedOpen ? (
              <Animated.View
                entering={FadeInUp.duration(300)}
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 16,
                  paddingHorizontal: 2,
                  paddingBottom: 8,
                }}
              >
                {achieved.map((goal) => (
                  <Pressable
                    key={goal.id}
                    onPress={() => {
                      void haptics.navigate();
                      navigation.navigate("Goal", { goalId: goal.id });
                    }}
                    style={{ alignItems: "center", gap: 6, width: 72 }}
                  >
                    <View
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 26,
                        backgroundColor: mix(
                          theme.warning,
                          0.14,
                          theme.surface,
                        ),
                        borderWidth: 1.5,
                        borderColor: withAlpha(theme.warning, 0.45),
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name="trophy" size={22} color={theme.warning} />
                    </View>
                    <Text
                      numberOfLines={2}
                      style={{
                        fontSize: 11,
                        fontWeight: "600",
                        color: theme.text,
                        textAlign: "center",
                        lineHeight: 13,
                      }}
                    >
                      {goal.title}
                    </Text>
                    <Text
                      style={{
                        fontSize: 10,
                        color: theme.textSecondary,
                        marginTop: -3,
                      }}
                    >
                      {format(new Date(goal.completedAt ?? 0), "MMM d")}
                    </Text>
                  </Pressable>
                ))}
              </Animated.View>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <DatePickerModal
        visible={startingGoalId !== null}
        title="Start this goal on…"
        initialDay={format(today, "yyyy-MM-dd")}
        minDay={format(today, "yyyy-MM-dd")}
        onSelect={(day) => {
          if (startingGoalId) {
            startGoal(startingGoalId, day);
            void haptics.success();
          }
        }}
        onClose={() => setStartingGoalId(null)}
      />
    </SafeAreaView>
  );
}
