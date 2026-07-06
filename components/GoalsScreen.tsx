import React from "react";
import { Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { format } from "date-fns";
import { useStore, getGoalProgress } from "../store";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";
import { Goal, FriendProfile } from "../types";
import { RootStackParamList } from "../navigation";
import Avatar, { AvatarStack } from "./Avatar";
import ProgressRing from "./ProgressRing";
import { addMemberToGoal, inviteFriendToGoal } from "../lib/social";
import { supabase } from "../lib/supabase";

// ponytail: drag-reorder for goals was dropped with the old HomeScreen;
// ordering survives via the stored goal order (position on flush) only.
export default function GoalsScreen() {
  const { theme } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const goals = useStore((s) => s.goals);
  const sharedGoals = useStore((s) => s.sharedGoals);
  const friends = useStore((s) => s.friends);
  const account = useStore((s) => s.account);
  const setGoals = useStore((s) => s.setGoals);

  const [inviteGoalId, setInviteGoalId] = React.useState<string | null>(null);
  const [invitingFriendId, setInvitingFriendId] = React.useState<string | null>(
    null,
  );

  const today = new Date();
  const activeOwned = goals.filter((g) => g.completedAt === undefined);
  const achieved = goals.filter((g) => g.completedAt !== undefined);
  const activeShared = sharedGoals.filter((g) => g.completedAt === undefined);

  const inviteGoal =
    inviteGoalId === null
      ? null
      : (goals.find((g) => g.id === inviteGoalId) ?? null);
  const inviteCandidates = inviteGoal
    ? friends.filter(
        (f) => !(inviteGoal.members ?? []).some((m) => m.userId === f.userId),
      )
    : [];

  const sendInvite = async (goal: Goal, friend: FriendProfile) => {
    setInvitingFriendId(friend.userId);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const user = data.session?.user;
      if (!user) throw new Error("You need to be signed in to invite friends.");

      await inviteFriendToGoal(goal, friend.userId, user);

      const owner = {
        userId: user.id,
        username: account?.username ?? "",
        displayName: account?.displayName ?? "You",
        isOwner: true,
      };

      // Merge the member into the CURRENT store goal (ids are stable UUIDs)
      // so the card updates now and mid-invite mutations survive.
      setGoals(
        useStore
          .getState()
          .goals.map((g) =>
            g.id === goal.id ? addMemberToGoal(g, friend, owner) : g,
          ),
      );
      void haptics.success();
    } catch (error) {
      void haptics.error();
      Alert.alert(
        "Could not invite",
        error instanceof Error
          ? error.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setInvitingFriendId(null);
    }
  };

  const renderGoalCard = (goal: Goal, isShared: boolean) => {
    const progress = getGoalProgress(goal, today);
    const members = goal.members ?? [];
    const subtitle = [
      `${goal.tasks.length} task${goal.tasks.length === 1 ? "" : "s"}`,
      goal.target,
    ]
      .filter(Boolean)
      .join(" · ");

    return (
      <Pressable
        key={goal.id}
        onPress={() => {
          void haptics.navigate();
          navigation.navigate("Goal", { goalId: goal.id });
        }}
        style={{
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: 12,
          padding: 12,
          backgroundColor: theme.surface,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <ProgressRing size={44} strokeWidth={5} percent={progress.percent}>
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
              style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}
            >
              {subtitle}
            </Text>
          </View>
        </View>
        {members.length > 1 || (!isShared && account) ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {members.length > 1 ? (
              <>
                <AvatarStack users={members} size="sm" />
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: 12,
                    flex: 1,
                  }}
                >
                  You +{members.length - 1}
                </Text>
              </>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            {!isShared && account ? (
              <Pressable
                onPress={() => {
                  void haptics.tap();
                  setInviteGoalId(goal.id);
                }}
                hitSlop={8}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 9999,
                  borderWidth: 1,
                  borderColor: theme.primary,
                  backgroundColor: theme.primary + "20",
                }}
              >
                <Ionicons
                  name="person-add-outline"
                  size={12}
                  color={theme.primary}
                />
                <Text
                  style={{
                    color: theme.primary,
                    fontWeight: "600",
                    fontSize: 12,
                  }}
                >
                  Invite
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
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
          <Text style={{ fontSize: 32, fontWeight: "800", color: theme.text }}>
            Goals
          </Text>
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
        </View>

        {activeOwned.length === 0 && activeShared.length === 0 ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 12,
              padding: 20,
              backgroundColor: theme.surface,
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
        ) : (
          <>
            {activeOwned.map((goal) => renderGoalCard(goal, false))}
            {activeShared.map((goal) => renderGoalCard(goal, true))}
          </>
        )}

        {achieved.length > 0 ? (
          <>
            <Text
              style={{
                fontWeight: "700",
                fontSize: 12,
                letterSpacing: 1,
                color: theme.textSecondary,
                marginTop: 8,
              }}
            >
              ACHIEVED
            </Text>
            {achieved.map((goal) => (
              <Pressable
                key={goal.id}
                onPress={() => {
                  void haptics.navigate();
                  navigation.navigate("Goal", { goalId: goal.id });
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 12,
                  padding: 12,
                  backgroundColor: theme.surface,
                  opacity: 0.85,
                }}
              >
                <Ionicons
                  name="trophy-outline"
                  size={18}
                  color={theme.warning}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "700", color: theme.text }}>
                    {goal.title}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                    Achieved{" "}
                    {format(new Date(goal.completedAt ?? 0), "MMM d, yyyy")}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={theme.textSecondary}
                />
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>

      <Modal
        animationType="fade"
        transparent={true}
        visible={inviteGoal !== null}
        onRequestClose={() => {
          void haptics.tap();
          setInviteGoalId(null);
        }}
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
              setInviteGoalId(null);
            }}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
            }}
          />
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 16,
              padding: 16,
              gap: 10,
              backgroundColor: theme.surface,
            }}
          >
            <Text
              style={{ fontWeight: "700", fontSize: 18, color: theme.text }}
            >
              Invite a friend
            </Text>
            {inviteGoal ? (
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                Friends you invite can complete tasks on &ldquo;{inviteGoal.title}&rdquo;
                with you.
              </Text>
            ) : null}
            {inviteCandidates.length === 0 ? (
              <Text style={{ color: theme.textSecondary }}>
                {friends.length === 0
                  ? "Add friends from the Search tab first."
                  : "All of your friends are already in this goal."}
              </Text>
            ) : (
              inviteCandidates.map((friend) => (
                <Pressable
                  key={friend.userId}
                  disabled={invitingFriendId !== null}
                  onPress={() => {
                    if (!inviteGoal) return;
                    void haptics.tap();
                    void sendInvite(inviteGoal, friend);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    padding: 10,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 10,
                    backgroundColor: theme.background,
                    opacity:
                      invitingFriendId !== null &&
                      invitingFriendId !== friend.userId
                        ? 0.5
                        : 1,
                  }}
                >
                  <Avatar
                    userId={friend.userId}
                    displayName={friend.displayName}
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
                  <Text
                    style={{
                      color: theme.primary,
                      fontWeight: "600",
                      fontSize: 12,
                    }}
                  >
                    {invitingFriendId === friend.userId
                      ? "Inviting..."
                      : "Invite"}
                  </Text>
                </Pressable>
              ))
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
