import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../contexts/ThemeContext";
import {
  getNudgeCandidates,
  NudgeCandidate,
  wasRecentlyNudged,
} from "../lib/nudges";
import { RootStackParamList } from "../navigation";
import { useStore } from "../store";
import { haptics } from "../utils/haptics";
import { withAlpha } from "../utils/color";
import Avatar from "./Avatar";
import NudgeModal from "./NudgeModal";
import { card } from "./ui";

type FriendScreenProps = NativeStackScreenProps<RootStackParamList, "Friend">;

const percentage = (value: number) => `${Math.round(value * 100)}%`;

export default function FriendScreen({ route }: FriendScreenProps) {
  const { friend } = route.params;
  const goals = useStore((s) => s.goals);
  const sharedGoals = useStore((s) => s.sharedGoals);
  const { theme, isDark } = useTheme();
  // Candidate whose NudgeModal is open (issue #165).
  const [nudging, setNudging] = React.useState<NudgeCandidate | null>(null);

  const candidates = React.useMemo(
    () => getNudgeCandidates([...goals, ...sharedGoals], friend.userId),
    [friend.userId, goals, sharedGoals],
  );

  const panel = { ...card(theme, isDark), padding: 16 };

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

        <View style={{ ...panel, marginTop: 24 }}>
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
                const nudgedRecently = wasRecentlyNudged(
                  friend.userId,
                  candidate.goal.id,
                );
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
                        disabled={nudgedRecently}
                        onPress={() => {
                          void haptics.tap();
                          setNudging(candidate);
                        }}
                        style={{
                          alignItems: "center",
                          backgroundColor: nudgedRecently
                            ? withAlpha(theme.success, 0.15)
                            : theme.primary,
                          borderRadius: 9999,
                          flexDirection: "row",
                          gap: 6,
                          justifyContent: "center",
                          minWidth: 100,
                          paddingHorizontal: 12,
                          paddingVertical: 9,
                        }}
                      >
                        <Ionicons
                          name={nudgedRecently ? "checkmark" : "megaphone"}
                          size={15}
                          color={nudgedRecently ? theme.success : "#ffffff"}
                        />
                        <Text
                          style={{
                            color: nudgedRecently ? theme.success : "#ffffff",
                            fontWeight: "700",
                          }}
                        >
                          {nudgedRecently ? "Nudged" : "Nudge"}
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
      {nudging ? (
        <NudgeModal
          visible
          recipient={friend}
          goal={nudging.goal}
          adherence={nudging.adherence}
          onClose={() => setNudging(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}
