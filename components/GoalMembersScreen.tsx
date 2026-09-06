import React from "react";
import { Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../contexts/ThemeContext";
import { getMemberAdherence, useStore } from "../store";
import {
  addMemberToGoal,
  inviteFriendToGoal,
  removeMember,
} from "../lib/social";
import { getPersistedSession } from "../lib/auth";
import { RootStackParamList } from "../navigation";
import { FriendProfile, GoalMember } from "../types";
import { haptics } from "../utils/haptics";
import { withAlpha } from "../utils/color";
import { getGoalColor } from "../utils/goalColors";
import Avatar from "./Avatar";
import NudgeButton from "./NudgeButton";
import { card } from "./ui";

type GoalMembersProps = NativeStackScreenProps<
  RootStackParamList,
  "GoalMembers"
>;

/**
 * "Doing this together" has its own page so the goal screen stays about
 * your own progress. Members, adherence bars, nudges, inviting, and
 * removing (long-press, owner only) all live here. Tapping a member who is
 * your friend opens their page for the day-by-day detail.
 */
export default function GoalMembersScreen({
  navigation,
  route,
}: GoalMembersProps) {
  const { goalId } = route.params;
  const goal = useStore(
    (s) =>
      s.goals.find((g) => g.id === goalId) ??
      s.sharedGoals.find((g) => g.id === goalId),
  );
  const account = useStore((s) => s.account);
  const friends = useStore((s) => s.friends);
  const setGoals = useStore((s) => s.setGoals);
  const { theme, isDark } = useTheme();
  const [isInviteOpen, setIsInviteOpen] = React.useState(false);
  const [invitingFriendId, setInvitingFriendId] = React.useState<string | null>(
    null,
  );

  if (!goal) return null;

  const color = getGoalColor(goal);
  const isOwner = !goal.ownerUserId || goal.ownerUserId === account?.id;
  const isGoalCompleted = goal.completedAt !== undefined;
  const members = goal.members ?? [];
  const orderedMembers = [
    ...members.filter((m) => m.userId === account?.id),
    ...members.filter((m) => m.userId !== account?.id),
  ];
  const memberIds = new Set(members.map((m) => m.userId));
  const invitableFriends = friends.filter((f) => !memberIds.has(f.userId));
  const friendFor = (userId: string): FriendProfile | undefined =>
    friends.find((f) => f.userId === userId);

  const confirmRemoveMember = (member: GoalMember) => {
    void haptics.warning();
    Alert.alert(
      "Remove member?",
      `${member.displayName} will lose access to "${goal.title}".`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await removeMember(goalId, member.userId);
                setGoals(
                  useStore.getState().goals.map((g) =>
                    g.id === goalId
                      ? {
                          ...g,
                          members: g.members?.filter(
                            (m) => m.userId !== member.userId,
                          ),
                          tasks: g.tasks.map((task) => {
                            if (!task.memberCompletions) return task;
                            const { [member.userId]: _removed, ...remaining } =
                              task.memberCompletions;
                            return { ...task, memberCompletions: remaining };
                          }),
                        }
                      : g,
                  ),
                );
                void haptics.destructive();
              } catch (error) {
                void haptics.error();
                Alert.alert(
                  "Couldn't remove member",
                  error instanceof Error
                    ? error.message
                    : "Try again once you're online.",
                );
              }
            })();
          },
        },
      ],
    );
  };

  const inviteFriend = async (friend: FriendProfile) => {
    if (invitingFriendId) return;
    setInvitingFriendId(friend.userId);
    void haptics.tap();

    try {
      const session = await getPersistedSession();
      const user = session?.user;
      if (!user) {
        throw new Error("You need to be signed in to invite friends.");
      }

      // Re-read from the store: tasks may have been edited since render.
      const current =
        useStore.getState().goals.find((g) => g.id === goalId) ?? goal;
      await inviteFriendToGoal(current, friend.userId, user);

      const owner = {
        userId: user.id,
        username: account?.username ?? "",
        displayName: account?.displayName ?? "You",
        isOwner: true,
      };

      // Merge the member into the CURRENT store goal (ids are stable UUIDs)
      // so completions toggled mid-invite survive.
      setGoals(
        useStore
          .getState()
          .goals.map((g) =>
            g.id === goalId ? addMemberToGoal(g, friend, owner) : g,
          ),
      );
      void haptics.success();
      setIsInviteOpen(false);
    } catch (error) {
      void haptics.error();
      Alert.alert(
        "Couldn't invite",
        error instanceof Error
          ? error.message
          : "Try again once you're online.",
      );
    } finally {
      setInvitingFriendId(null);
    }
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background }}
      edges={["bottom", "left", "right"]}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 2,
          }}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: color,
            }}
          />
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: 20,
              fontWeight: "800",
              color: theme.text,
            }}
          >
            {goal.title}
          </Text>
          {isOwner && account && !isGoalCompleted ? (
            <Pressable
              accessibilityLabel="Invite a friend"
              onPress={() => {
                void haptics.tap();
                setIsInviteOpen(true);
              }}
              hitSlop={6}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 9999,
                backgroundColor: withAlpha(theme.primary, 0.12),
              }}
            >
              <Ionicons
                name="person-add-outline"
                size={14}
                color={theme.primary}
              />
              <Text
                style={{
                  color: theme.primary,
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                Invite
              </Text>
            </Pressable>
          ) : null}
        </View>

        {members.length <= 1 ? (
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
            Goals are easier together. Invite a friend and keep each other on
            track.
          </Text>
        ) : null}

        {orderedMembers.map((member) => {
          const isMe = member.userId === account?.id;
          const percent = Math.round(
            getMemberAdherence(goal, member.userId) * 100,
          );
          const friend = friendFor(member.userId);
          const canOpen = !isMe && Boolean(friend);
          const canRemove = isOwner && !isMe;
          return (
            <Pressable
              key={member.userId}
              onPress={
                canOpen
                  ? () => {
                      void haptics.navigate();
                      navigation.navigate("Friend", { friend: friend! });
                    }
                  : undefined
              }
              onLongPress={
                canRemove ? () => confirmRemoveMember(member) : undefined
              }
              delayLongPress={400}
              style={{
                ...card(theme, isDark),
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <Avatar
                userId={member.userId}
                displayName={member.displayName}
                avatarUri={member.avatarUri}
                size="md"
              />
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={{ fontWeight: "600", color: theme.text }}>
                  {isMe ? "You" : member.displayName}
                  {member.isOwner ? (
                    <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                      {"  "}owner
                    </Text>
                  ) : null}
                </Text>
                <View
                  style={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: theme.border,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      width: `${percent}%`,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: color,
                    }}
                  />
                </View>
              </View>
              <Text
                style={{
                  color: theme.textSecondary,
                  fontWeight: "700",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {percent}%
              </Text>
              {!isMe && !isGoalCompleted ? (
                <NudgeButton
                  recipientUserId={member.userId}
                  recipientName={member.displayName}
                  goalId={goal.id}
                  color={color}
                />
              ) : null}
              {canOpen ? (
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={theme.textSecondary}
                />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={isInviteOpen}
        onRequestClose={() => setIsInviteOpen(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            padding: 24,
            backgroundColor: "rgba(15, 23, 42, 0.35)",
          }}
        >
          <Pressable
            onPress={() => {
              void haptics.tap();
              setIsInviteOpen(false);
            }}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
            }}
          />
          <View style={{ ...card(theme, isDark), padding: 16, gap: 12 }}>
            <Text
              style={{ fontWeight: "700", fontSize: 18, color: theme.text }}
            >
              Invite a friend
            </Text>
            {invitableFriends.length === 0 ? (
              <Text style={{ color: theme.textSecondary }}>
                {friends.length === 0
                  ? "Add friends from your profile first."
                  : "All of your friends are already in this goal."}
              </Text>
            ) : (
              invitableFriends.map((friend) => (
                <View
                  key={friend.userId}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Avatar
                    userId={friend.userId}
                    displayName={friend.displayName}
                    avatarUri={friend.avatarUri}
                    size="md"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "600", color: theme.text }}>
                      {friend.displayName}
                    </Text>
                    {friend.username ? (
                      <Text
                        style={{ color: theme.textSecondary, fontSize: 12 }}
                      >
                        @{friend.username}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => void inviteFriend(friend)}
                    disabled={invitingFriendId !== null}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 9999,
                      backgroundColor: theme.primary,
                      opacity:
                        invitingFriendId === null
                          ? 1
                          : invitingFriendId === friend.userId
                            ? 0.7
                            : 0.4,
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "700" }}>
                      {invitingFriendId === friend.userId
                        ? "Inviting…"
                        : "Invite"}
                    </Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
