import React from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../contexts/ThemeContext";
import { getNudgeCandidates, NudgeCandidate, sendNudge } from "../lib/nudges";
import { RootStackParamList } from "../navigation";
import { getGoalLifecycleStatus, useStore } from "../store";
import { haptics } from "../utils/haptics";
import { mix, withAlpha } from "../utils/color";
import Avatar from "./Avatar";
import { card } from "./ui";

type FriendScreenProps = NativeStackScreenProps<RootStackParamList, "Friend">;

const ACCOLADE_TIERS = [
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
] as const;

const percentage = (value: number) => `${Math.round(value * 100)}%`;

export default function FriendScreen({ route, navigation }: FriendScreenProps) {
  const goals = useStore((s) => s.goals);
  const sharedGoals = useStore((s) => s.sharedGoals);
  const friends = useStore((s) => s.friends);
  const { theme, isDark } = useTheme();
  const [sendingGoalId, setSendingGoalId] = React.useState<string | null>(null);

  const friend = React.useMemo(
    () =>
      friends.find(
        (candidate) => candidate.userId === route.params.friend.userId,
      ) ?? route.params.friend,
    [friends, route.params.friend],
  );

  const visibleGoals = React.useMemo(
    () =>
      [...goals, ...sharedGoals].filter((goal) =>
        goal.members?.some((member) => member.userId === friend.userId),
      ),
    [friend.userId, goals, sharedGoals],
  );
  const activeSharedGoals = React.useMemo(
    () =>
      visibleGoals.filter((goal) => getGoalLifecycleStatus(goal) === "active"),
    [visibleGoals],
  );
  const achievedGoals = React.useMemo(
    () => visibleGoals.filter((goal) => goal.completedAt !== undefined),
    [visibleGoals],
  );
  const candidates = React.useMemo(
    () => getNudgeCandidates([...goals, ...sharedGoals], friend.userId),
    [friend.userId, goals, sharedGoals],
  );

  const bio = friend.bio?.trim();
  const occupation = friend.occupation?.trim();
  const panel = { ...card(theme, isDark), padding: 16 };
  const statCard = {
    ...card(theme, isDark),
    flex: 1,
    padding: 12,
    alignItems: "center" as const,
  };

  const sendGoalNudge = async (candidate: NudgeCandidate) => {
    setSendingGoalId(candidate.goal.id);
    try {
      await sendNudge(friend.userId, candidate.goal.id);
      void haptics.success();
      Alert.alert(
        "Nudge sent",
        `${friend.displayName} will receive a reminder about ${candidate.goal.title}.`,
      );
    } catch (error) {
      void haptics.error();
      Alert.alert(
        "Couldn't send nudge",
        error instanceof Error
          ? error.message
          : "Check your connection and try again.",
      );
    } finally {
      setSendingGoalId(null);
    }
  };

  const confirmNudge = (candidate: NudgeCandidate) => {
    void haptics.tap();
    Alert.alert(
      `Nudge ${friend.displayName}?`,
      `Send a push notification about “${candidate.goal.title}”?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send nudge",
          onPress: () => void sendGoalNudge(candidate),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        style={{ flex: 1 }}
      >
        <View style={{ alignItems: "center", marginTop: 8 }}>
          <Avatar
            userId={friend.userId}
            displayName={friend.displayName}
            avatarUri={friend.avatarUri}
            size="lg"
          />
          <Text
            style={{
              color: theme.text,
              fontSize: 24,
              fontWeight: "800",
              marginTop: 12,
            }}
          >
            {friend.displayName}
          </Text>
          {friend.username ? (
            <Text style={{ color: theme.textSecondary, marginTop: 4 }}>
              @{friend.username}
            </Text>
          ) : null}
        </View>

        <View style={{ ...panel, marginTop: 24, gap: 14 }}>
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: 12,
              fontWeight: "700",
              letterSpacing: 0.8,
            }}
          >
            ABOUT
          </Text>
          <View style={{ gap: 12 }}>
            <View>
              <Text
                style={{
                  color: theme.textSecondary,
                  fontSize: 12,
                  fontWeight: "700",
                  letterSpacing: 0.5,
                }}
              >
                WHAT THEY DO
              </Text>
              <Text
                style={{
                  color: theme.text,
                  lineHeight: 21,
                  marginTop: 4,
                }}
              >
                {occupation ?? "They have not added what they do yet."}
              </Text>
            </View>
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: theme.border,
                paddingTop: 12,
              }}
            >
              <Text
                style={{
                  color: theme.textSecondary,
                  fontSize: 12,
                  fontWeight: "700",
                  letterSpacing: 0.5,
                }}
              >
                BIO
              </Text>
              <Text
                style={{
                  color: theme.text,
                  lineHeight: 21,
                  marginTop: 4,
                }}
              >
                {bio ?? "They have not added a short bio yet."}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
          {[
            { value: activeSharedGoals.length, label: "Active shared" },
            { value: achievedGoals.length, label: "Achieved" },
            { value: candidates.length, label: "Needs nudge" },
          ].map((stat) => (
            <View key={stat.label} style={statCard}>
              <Text
                style={{ color: theme.text, fontSize: 20, fontWeight: "800" }}
              >
                {stat.value}
              </Text>
              <Text
                style={{
                  color: theme.textSecondary,
                  fontSize: 12,
                  marginTop: 2,
                }}
              >
                {stat.label}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ ...panel, marginTop: 16, gap: 14 }}>
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: 12,
                fontWeight: "700",
                letterSpacing: 0.8,
              }}
            >
              ACCOLADES
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
              Coming soon
            </Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {ACCOLADE_TIERS.map((tier) => (
              <View
                key={tier}
                style={{
                  borderColor: theme.border,
                  borderRadius: 9999,
                  borderWidth: 1,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: theme.background,
                }}
              >
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  {tier}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ ...panel, marginTop: 16 }}>
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: 12,
                fontWeight: "700",
                letterSpacing: 0.8,
              }}
            >
              ACHIEVED GOALS
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
              {achievedGoals.length}
            </Text>
          </View>

          {achievedGoals.length > 0 ? (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 14,
                marginTop: 16,
              }}
            >
              {achievedGoals.map((goal) => (
                <Pressable
                  key={goal.id}
                  onPress={() => {
                    void haptics.navigate();
                    navigation.navigate("Goal", { goalId: goal.id });
                  }}
                  style={{ alignItems: "center", gap: 5, width: 72 }}
                >
                  <View
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 26,
                      backgroundColor: mix(theme.warning, 0.14, theme.surface),
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
                      color: theme.text,
                      fontSize: 10,
                      fontWeight: "600",
                      lineHeight: 12,
                      textAlign: "center",
                    }}
                  >
                    {goal.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View
              style={{
                alignItems: "center",
                paddingHorizontal: 8,
                paddingVertical: 24,
              }}
            >
              <Ionicons
                name="trophy-outline"
                size={30}
                color={theme.textSecondary}
              />
              <Text
                style={{
                  color: theme.text,
                  fontWeight: "700",
                  marginTop: 8,
                }}
              >
                No achieved goals yet
              </Text>
              <Text
                style={{
                  color: theme.textSecondary,
                  lineHeight: 20,
                  marginTop: 4,
                  textAlign: "center",
                }}
              >
                Achieved goals you can both see will appear here.
              </Text>
            </View>
          )}
        </View>

        <View style={{ ...panel, marginTop: 16 }}>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Ionicons
              name="megaphone-outline"
              size={22}
              color={theme.primary}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: "800" }}>
                Nudge {friend.displayName}
              </Text>
              <Text
                style={{
                  color: theme.textSecondary,
                  lineHeight: 20,
                  marginTop: 4,
                }}
              >
                Encourage progress on a shared goal that could use a boost.
              </Text>
            </View>
          </View>

          {candidates.length > 0 ? (
            <View style={{ gap: 10, marginTop: 16 }}>
              {candidates.map((candidate) => {
                const isSending = sendingGoalId === candidate.goal.id;
                return (
                  <View
                    key={candidate.goal.id}
                    style={{
                      borderColor: theme.border,
                      borderRadius: 12,
                      borderWidth: 1,
                      padding: 12,
                    }}
                  >
                    <View
                      style={{
                        alignItems: "center",
                        flexDirection: "row",
                        gap: 10,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontWeight: "700" }}>
                          {candidate.goal.title}
                        </Text>
                        <Text
                          style={{
                            color: theme.textSecondary,
                            fontSize: 13,
                            marginTop: 3,
                          }}
                        >
                          {percentage(candidate.adherence)} recent adherence
                        </Text>
                      </View>
                      <Pressable
                        accessibilityLabel={`Nudge ${friend.displayName} about ${candidate.goal.title}`}
                        disabled={isSending}
                        onPress={() => confirmNudge(candidate)}
                        style={{
                          alignItems: "center",
                          backgroundColor: theme.primary,
                          borderRadius: 9999,
                          flexDirection: "row",
                          gap: 6,
                          justifyContent: "center",
                          minWidth: 100,
                          paddingHorizontal: 12,
                          paddingVertical: 9,
                          opacity: isSending ? 0.7 : 1,
                        }}
                      >
                        {isSending ? (
                          <ActivityIndicator color="#ffffff" size="small" />
                        ) : (
                          <Ionicons
                            name="megaphone"
                            size={15}
                            color="#ffffff"
                          />
                        )}
                        <Text style={{ color: "#ffffff", fontWeight: "700" }}>
                          Nudge
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View
              style={{
                alignItems: "center",
                paddingHorizontal: 8,
                paddingVertical: 24,
              }}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={30}
                color={theme.textSecondary}
              />
              <Text
                style={{
                  color: theme.text,
                  fontWeight: "700",
                  marginTop: 8,
                }}
              >
                Nothing needs a nudge
              </Text>
              <Text
                style={{
                  color: theme.textSecondary,
                  lineHeight: 20,
                  marginTop: 4,
                  textAlign: "center",
                }}
              >
                Shared goals that fall below 70% recent adherence appear here.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
