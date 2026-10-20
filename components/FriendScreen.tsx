import React from "react";
import {
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { addDays, format, startOfDay } from "date-fns";
import { useTheme } from "../contexts/ThemeContext";
import { getFriendPublicGoals, wasRecentlyNudged } from "../lib/nudges";
import { describeTaskSchedule } from "../lib/taskSchedule";
import { RootStackParamList } from "../navigation";
import {
  getGoalProgress,
  getGoalStartDate,
  getTaskBucketsForDate,
  useStore,
} from "../store";
import { FriendProfile, Goal } from "../types";
import { haptics } from "../utils/haptics";
import { getGoalColor } from "../utils/goalColors";
import { mix, withAlpha } from "../utils/color";
import Avatar, { colorForUserId } from "./Avatar";
import NudgeButton from "./NudgeButton";
import { card } from "./ui";

type FriendScreenProps = NativeStackScreenProps<RootStackParamList, "Friend">;

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKS = 4;
const PAGE_GAP = 12;
const SIDE_PADDING = 16;
const AVATAR_SLOT = 58;
const AVATAR_GAP = 14;

const firstName = (friend: FriendProfile) =>
  friend.displayName.split(" ")[0] || friend.username;

/**
 * Friends page (Claude Design "Friend Public Goals", 2b): pick a friend at
 * the top, swipe through their public goals one card at a time, tap any day
 * in the last 4 weeks to see what they did, and nudge.
 */
export default function FriendScreen({ route }: FriendScreenProps) {
  const friends = useStore((s) => s.friends);
  const friendGoals = useStore((s) => s.friendGoals);
  const { theme, isDark } = useTheme();
  const { width: windowWidth } = useWindowDimensions();

  // The friend tapped on Profile leads; the rest follow in Profile order.
  const strip = React.useMemo(() => {
    const opened = route.params.friend;
    const rest = friends.filter((f) => f.userId !== opened.userId);
    const current = friends.find((f) => f.userId === opened.userId) ?? opened;
    return [current, ...rest];
  }, [friends, route.params.friend]);
  const [friendId, setFriendId] = React.useState(route.params.friend.userId);
  const friend = strip.find((f) => f.userId === friendId) ?? strip[0];

  const goals = React.useMemo(
    () => getFriendPublicGoals(friendGoals, friend.userId),
    [friendGoals, friend.userId],
  );

  const [page, setPage] = React.useState(0);
  const pagerRef = React.useRef<ScrollView>(null);
  const cardWidth = windowWidth - SIDE_PADDING * 2;
  const interval = cardWidth + PAGE_GAP;
  const activePage = Math.min(page, Math.max(0, goals.length - 1));
  const activeGoal: Goal | undefined = goals[activePage];

  // Selected day per goal, as days back from today (0 = today).
  const [daysBack, setDaysBack] = React.useState<Record<string, number>>({});
  // Bumped after a nudge so the card's "Nudged" chip appears right away.
  const [, setNudgeTick] = React.useState(0);

  const goToPage = (next: number) => {
    const clamped = Math.max(0, Math.min(goals.length - 1, next));
    if (clamped === activePage) {
      void haptics.warning();
      return;
    }
    void haptics.toggle();
    setPage(clamped);
    pagerRef.current?.scrollTo({ x: clamped * interval, animated: true });
  };

  const pickFriend = (next: FriendProfile) => {
    if (next.userId === friend.userId) return;
    void haptics.tap();
    setFriendId(next.userId);
    setPage(0);
    pagerRef.current?.scrollTo({ x: 0, animated: false });
  };

  const today = startOfDay(new Date());

  const renderGrid = (goal: Goal, color: string, selectedBack: number) => {
    const start = startOfDay(getGoalStartDate(goal));
    const todayWeekday = today.getDay();
    const rows = Array.from({ length: WEEKS }, (_, row) =>
      Array.from({ length: 7 }, (_, column) => {
        const back = todayWeekday + (WEEKS - 1 - row) * 7 - column;
        if (back < 0) {
          // Later this week: an empty dashed slot.
          return (
            <View
              key={column}
              style={{
                flex: 1,
                height: 34,
                borderRadius: 9,
                borderWidth: 1.5,
                borderStyle: "dashed",
                borderColor: theme.border,
              }}
            />
          );
        }
        const day = addDays(today, -back);
        const beforeStart = day < start;
        const ratio = beforeStart ? 0 : getGoalProgress(goal, day).percent;
        const isSelected = back === selectedBack;
        const isToday = back === 0;
        return (
          <Pressable
            key={column}
            onPress={() => {
              void haptics.tap();
              setDaysBack((prev) => ({ ...prev, [goal.id]: back }));
            }}
            style={{
              flex: 1,
              height: 34,
              borderRadius: 9,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: beforeStart
                ? withAlpha(theme.border, 0.35)
                : ratio <= 0
                  ? theme.border
                  : mix(color, 0.25 + ratio * 0.75, theme.surface),
              borderWidth: isSelected || isToday ? 2 : 0,
              borderColor: isSelected ? theme.text : theme.primary,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color:
                  ratio > 0.55
                    ? "#ffffff"
                    : beforeStart
                      ? theme.textSecondary
                      : theme.text,
              }}
            >
              {day.getDate()}
            </Text>
          </Pressable>
        );
      }),
    );
    return (
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {WEEKDAY_LETTERS.map((letter, index) => (
            <Text
              key={index}
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: 11,
                fontWeight: "600",
                color: theme.textSecondary,
              }}
            >
              {letter}
            </Text>
          ))}
        </View>
        {rows.map((cells, row) => (
          <View key={row} style={{ flexDirection: "row", gap: 6 }}>
            {cells}
          </View>
        ))}
      </View>
    );
  };

  const renderCard = (goal: Goal) => {
    const color = getGoalColor(goal);
    const back = daysBack[goal.id] ?? 0;
    const day = addDays(today, -back);
    const buckets = getTaskBucketsForDate(goal, day);
    const doneIds = new Set(buckets.completed.map((task) => task.id));
    // Their day as their own Today showed it, in goal order.
    const dayTasks = goal.tasks.filter(
      (task) =>
        doneIds.has(task.id) ||
        buckets.pending.some((pending) => pending.id === task.id),
    );
    const nudged = wasRecentlyNudged(friend.userId, goal.id);

    // Each page scrolls on its own when a goal has more tasks than fit.
    return (
      <ScrollView
        key={goal.id}
        style={{ width: cardWidth }}
        contentContainerStyle={{ paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            ...card(theme, isDark),
            borderRadius: 22,
            paddingTop: 24,
            paddingHorizontal: 20,
            paddingBottom: 18,
            gap: 20,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: 5,
              backgroundColor: color,
            }}
          />
          <View style={{ gap: 4 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Text
                style={{
                  flex: 1,
                  fontSize: 26,
                  fontWeight: "800",
                  letterSpacing: -0.3,
                  color: theme.text,
                }}
              >
                {goal.title}
              </Text>
              {nudged ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                    borderRadius: 9999,
                    backgroundColor: withAlpha(theme.textSecondary, 0.12),
                  }}
                >
                  <Ionicons
                    name="checkmark"
                    size={12}
                    color={theme.textSecondary}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: theme.textSecondary,
                    }}
                  >
                    Nudged
                  </Text>
                </View>
              ) : null}
            </View>
            {goal.target ? (
              <Text style={{ fontSize: 14, color: theme.textSecondary }}>
                {goal.target}
              </Text>
            ) : null}
          </View>

          <View style={{ gap: 8 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <Text style={sectionLabel(theme.textSecondary)}>
                LAST 4 WEEKS
              </Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                Tap a day
              </Text>
            </View>
            {renderGrid(goal, color, back)}
          </View>

          <View style={{ gap: 2 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "baseline",
                paddingBottom: 2,
              }}
            >
              <Text style={sectionLabel(theme.textSecondary)}>
                {back === 0 ? "TODAY" : format(day, "EEE, MMM d").toUpperCase()}
              </Text>
              {dayTasks.length > 0 ? (
                <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                  {doneIds.size} of {dayTasks.length} done
                </Text>
              ) : null}
            </View>
            {dayTasks.length > 0 ? (
              dayTasks.map((task) => {
                const done = doneIds.has(task.id);
                return (
                  <View
                    key={task.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      paddingVertical: 7,
                    }}
                  >
                    <Ionicons
                      name={done ? "checkmark-circle" : "ellipse-outline"}
                      size={20}
                      color={done ? theme.success : theme.textSecondary}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: "600",
                          color: theme.text,
                          textDecorationLine: done ? "line-through" : "none",
                          opacity: done ? 0.7 : 1,
                        }}
                      >
                        {task.title}
                      </Text>
                      <Text
                        style={{ fontSize: 12, color: theme.textSecondary }}
                      >
                        {describeTaskSchedule(task)}
                      </Text>
                    </View>
                  </View>
                );
              })
            ) : (
              <Text
                style={{
                  fontSize: 14,
                  color: theme.textSecondary,
                  paddingVertical: 8,
                }}
              >
                Nothing scheduled this day
              </Text>
            )}
          </View>
        </View>
      </ScrollView>
    );
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background }}
      edges={["bottom", "left", "right"]}
    >
      {/* Friend picker */}
      <View
        style={{
          backgroundColor: theme.surface,
          borderBottomWidth: 0.5,
          borderBottomColor: theme.border,
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            gap: AVATAR_GAP,
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 12,
          }}
        >
          {strip.map((person) => {
            const selected = person.userId === friend.userId;
            return (
              <Pressable
                key={person.userId}
                onPress={() => pickFriend(person)}
                accessibilityLabel={person.displayName}
                accessibilityState={{ selected }}
                style={{ width: AVATAR_SLOT, alignItems: "center", gap: 6 }}
              >
                <View
                  style={{
                    width: AVATAR_SLOT,
                    height: AVATAR_SLOT,
                    borderRadius: AVATAR_SLOT / 2,
                    borderWidth: 2.5,
                    borderColor: selected
                      ? colorForUserId(person.userId)
                      : "transparent",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Avatar
                    userId={person.userId}
                    displayName={person.displayName}
                    avatarUri={person.avatarUri}
                    size="picker"
                  />
                </View>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 12,
                    fontWeight: selected ? "700" : "500",
                    color: selected ? theme.text : theme.textSecondary,
                  }}
                >
                  {firstName(person)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {goals.length > 0 && activeGoal ? (
        <>
          <View style={{ flex: 1, paddingTop: 14, gap: 12 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 20,
              }}
            >
              <Text
                style={{ fontSize: 15, fontWeight: "700", color: theme.text }}
              >
                {firstName(friend)}&apos;s goals
              </Text>
              {goals.length > 1 ? (
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {goals.map((goal, index) => (
                    <View
                      key={goal.id}
                      style={{
                        width: index === activePage ? 18 : 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor:
                          index === activePage
                            ? getGoalColor(goal)
                            : theme.border,
                      }}
                    />
                  ))}
                </View>
              ) : null}
            </View>
            <ScrollView
              key={friend.userId}
              ref={pagerRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={interval}
              decelerationRate="fast"
              disableIntervalMomentum
              contentContainerStyle={{
                gap: PAGE_GAP,
                paddingHorizontal: SIDE_PADDING,
              }}
              onMomentumScrollEnd={(event) => {
                const next = Math.round(
                  event.nativeEvent.contentOffset.x / interval,
                );
                if (next !== activePage) {
                  void haptics.toggle();
                  setPage(next);
                }
              }}
            >
              {goals.map(renderCard)}
            </ScrollView>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 16,
              paddingTop: 14,
              paddingBottom: 10,
            }}
          >
            <Pressable
              onPress={() => goToPage(activePage - 1)}
              accessibilityLabel="Previous goal"
              style={{
                ...pagerButton(theme.surface),
                opacity: activePage > 0 ? 1 : 0.35,
              }}
            >
              <Ionicons name="chevron-back" size={20} color={theme.text} />
            </Pressable>
            <NudgeButton
              key={`${friend.userId}:${activeGoal.id}`}
              recipientUserId={friend.userId}
              recipientName={friend.displayName}
              goalId={activeGoal.id}
              color={getGoalColor(activeGoal)}
              onSent={() => setNudgeTick((tick) => tick + 1)}
            />
            <Pressable
              onPress={() => goToPage(activePage + 1)}
              accessibilityLabel="Next goal"
              style={{
                ...pagerButton(theme.surface),
                opacity: activePage < goals.length - 1 ? 1 : 0.35,
              }}
            >
              <Ionicons name="chevron-forward" size={20} color={theme.text} />
            </Pressable>
          </View>
        </>
      ) : (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 32,
            gap: 8,
          }}
        >
          <Ionicons
            name="eye-off-outline"
            size={28}
            color={theme.textSecondary}
          />
          <Text style={{ color: theme.text, fontWeight: "700" }}>
            No public goals yet
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const sectionLabel = (color: string) => ({
  fontSize: 12,
  fontWeight: "700" as const,
  letterSpacing: 0.8,
  color,
});

const pagerButton = (backgroundColor: string) => ({
  width: 50,
  height: 50,
  borderRadius: 25,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  backgroundColor,
  shadowColor: "#0f172a",
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
});
