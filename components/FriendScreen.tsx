import React from "react";
import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../contexts/ThemeContext";
import { getNudgeCandidates } from "../lib/nudges";
import { RootStackParamList } from "../navigation";
import { startOfDay } from "date-fns";
import { useStore } from "../store";
import Avatar from "./Avatar";
import FriendGoalCard from "./FriendGoalCard";
import TrackingDateControls from "./TrackingDateControls";

type FriendScreenProps = NativeStackScreenProps<RootStackParamList, "Friend">;

/**
 * A friend's page mirrors what they see on their own goals: every goal you
 * share plus their public goals, each with their tasks for the chosen day
 * and their full heatmap. The date stepper here is screen-local so browsing
 * their yesterday never moves your Today tab.
 */
export default function FriendScreen({ route }: FriendScreenProps) {
  const { friend } = route.params;
  const goals = useStore((s) => s.goals);
  const sharedGoals = useStore((s) => s.sharedGoals);
  const friendGoals = useStore((s) => s.friendGoals);
  const account = useStore((s) => s.account);
  const { theme } = useTheme();
  const [selectedDate, setSelectedDate] = React.useState(() =>
    startOfDay(new Date()),
  );

  const candidates = React.useMemo(
    () =>
      getNudgeCandidates(
        [...goals, ...sharedGoals, ...friendGoals],
        friend.userId,
        new Date(),
        account?.id,
      ),
    [account?.id, friend.userId, friendGoals, goals, sharedGoals],
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background }}
      edges={["bottom", "left", "right"]}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            marginBottom: 4,
          }}
        >
          <Avatar
            userId={friend.userId}
            displayName={friend.displayName}
            avatarUri={friend.avatarUri}
            size="lg"
          />
          <View style={{ flex: 1 }}>
            <Text
              style={{ color: theme.text, fontSize: 22, fontWeight: "800" }}
            >
              {friend.displayName}
            </Text>
            {friend.username ? (
              <Text style={{ color: theme.textSecondary, marginTop: 2 }}>
                @{friend.username}
              </Text>
            ) : null}
          </View>
        </View>

        {candidates.length > 0 ? (
          <>
            <TrackingDateControls
              value={selectedDate}
              onChange={(date) => setSelectedDate(startOfDay(date))}
            />
            {candidates.map((candidate) => (
              <FriendGoalCard
                key={candidate.goal.id}
                goal={candidate.goal}
                friendUserId={friend.userId}
                friendName={friend.displayName}
                selectedDate={selectedDate}
                adherence={candidate.adherence}
                isPublicOnly={candidate.isPublicOnly}
              />
            ))}
          </>
        ) : (
          <View
            style={{
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 40,
              gap: 8,
            }}
          >
            <Ionicons
              name="eye-off-outline"
              size={28}
              color={theme.textSecondary}
            />
            <Text style={{ color: theme.text, fontWeight: "700" }}>
              Nothing to see yet
            </Text>
            <Text
              style={{
                color: theme.textSecondary,
                textAlign: "center",
                lineHeight: 20,
              }}
            >
              Goals you share and {friend.displayName}’s public goals show up
              here.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
