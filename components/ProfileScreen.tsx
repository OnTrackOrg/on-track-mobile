import React, { useState } from "react";
import {
  Text,
  View,
  Pressable,
  ScrollView,
  Alert,
  Switch,
  Modal,
  Image,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { CompositeScreenProps, useFocusEffect } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useStore, getGoalLifecycleStatus, getGoalStreak } from "../store";
import { useTheme, THEME_OPTIONS } from "../contexts/ThemeContext";
import Avatar from "./Avatar";
import IconButton from "./IconButton";
import { card } from "./ui";
import { haptics } from "../utils/haptics";
import { mix, withAlpha } from "../utils/color";
import { STORAGE_KEYS } from "../lib/persistence";
import { RootStackParamList, TabParamList } from "../navigation";
import {
  deleteCurrentAccount,
  getPersistedSession,
  signOut,
} from "../lib/auth";
import { notifyAccountDeleted } from "../lib/accountDeleted";
import {
  acceptFriendRequest,
  declineFriendRequest,
  fetchSocialGraph,
  unfriend,
} from "../lib/social";
import { importLocalDataToCloud } from "../lib/importLocal";
import { uploadAvatarToProfile } from "../lib/avatar";
import { supabase } from "../lib/supabase";
import {
  APP_TOUR_STORAGE_KEY,
  LEGACY_ONBOARDING_STORAGE_KEY,
} from "../onboarding";
import { FriendProfile, FriendRequest } from "../types";

type ProfileProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "Profile">,
  NativeStackScreenProps<RootStackParamList>
>;

const SECTION_HEADER = {
  fontSize: 12,
  fontWeight: "700" as const,
  letterSpacing: 0.8,
};

export default function ProfileScreen({ navigation }: ProfileProps) {
  const goals = useStore((s) => s.goals);
  const sharedGoals = useStore((s) => s.sharedGoals);
  const friends = useStore((s) => s.friends);
  const friendRequests = useStore((s) => s.friendRequests);
  const account = useStore((s) => s.account);
  const cloudSyncEnabled = useStore((s) => s.cloudSyncEnabled);
  const setGoals = useStore((s) => s.setGoals);
  const setSharedGoals = useStore((s) => s.setSharedGoals);
  const setSocialGraph = useStore((s) => s.setSocialGraph);
  const setAccount = useStore((s) => s.setAccount);
  const setCloudSyncEnabled = useStore((s) => s.setCloudSyncEnabled);
  const { theme, isDark, toggleTheme, themeId, setThemeId } = useTheme();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  const accountId = account?.id;
  const allGoals = React.useMemo(
    () => [...goals, ...sharedGoals],
    [goals, sharedGoals],
  );
  const activeGoals = React.useMemo(
    () => allGoals.filter((goal) => getGoalLifecycleStatus(goal) === "active"),
    [allGoals],
  );
  const achievedGoals = React.useMemo(
    () => allGoals.filter((goal) => goal.completedAt !== undefined),
    [allGoals],
  );

  // Profile photo (redesign): stored locally as a data URI, like the mock.
  // Re-read on focus so a photo adopted from the profile (fresh install)
  // shows up without an app restart.
  useFocusEffect(
    React.useCallback(() => {
      AsyncStorage.getItem(STORAGE_KEYS.avatar)
        .then((value) => setAvatarUri(value))
        .catch(() => {});
    }, []),
  );

  const pickAvatar = async () => {
    void haptics.tap();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.4,
      base64: true,
    });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset) return;
    // Shrink to avatar size before it hits AsyncStorage, the profile row,
    // and every friend's social queries — full camera crops are megabytes.
    let uri: string;
    try {
      const resized = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 256, height: 256 } }],
        {
          compress: 0.7,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        },
      );
      if (!resized.base64) return;
      uri = `data:image/jpeg;base64,${resized.base64}`;
    } catch {
      if (!asset.base64) return;
      uri = `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`;
    }
    setAvatarUri(uri);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.avatar, uri);
    } catch {
      // Keep the in-memory photo even if persisting fails.
    }
    // Publish to the profile so friends see it too; offline picks are
    // reconciled on the next app launch.
    try {
      const session = await getPersistedSession();
      if (session?.user) {
        await uploadAvatarToProfile(session.user.id, uri);
      }
    } catch {
      // Best-effort; the launch reconcile retries.
    }
    void haptics.success();
  };
  const activeGoalCount = activeGoals.length;
  const bestStreak = React.useMemo(() => {
    let best = 0;
    for (const goal of allGoals) {
      for (const task of goal.tasks) {
        best = Math.max(best, getGoalStreak(task));
      }
    }
    return best;
  }, [allGoals]);

  const sharedGoalCountFor = (friendUserId: string): number =>
    allGoals.filter((goal) =>
      goal.members?.some((member) => member.userId === friendUserId),
    ).length;

  // Silent refresh whenever the tab gains focus; the persisted cache stays
  // until it works.
  useFocusEffect(
    React.useCallback(() => {
      if (!accountId) {
        return;
      }
      fetchSocialGraph(accountId)
        .then(
          ({
            friends: nextFriends,
            friendRequests: nextRequests,
            sentRequestUserIds,
          }) => setSocialGraph(nextFriends, nextRequests, sentRequestUserIds),
        )
        .catch(() => {});
    }, [accountId, setSocialGraph]),
  );

  const handleAcceptRequest = async (request: FriendRequest) => {
    void haptics.tap();
    try {
      await acceptFriendRequest(request.friendshipId);
      void haptics.success();
      const s = useStore.getState();
      setSocialGraph(
        [...s.friends, request.requester],
        s.friendRequests.filter((r) => r.friendshipId !== request.friendshipId),
      );
    } catch (error) {
      // A canceled request throws a plain-language Error; the next
      // tab-focus refetch clears it from the list.
      Alert.alert(
        "Could not accept",
        error instanceof Error
          ? error.message
          : "Check your connection and try again.",
      );
    }
  };

  const handleDeclineRequest = async (request: FriendRequest) => {
    void haptics.tap();
    try {
      await declineFriendRequest(request.friendshipId);
      const s = useStore.getState();
      setSocialGraph(
        s.friends,
        s.friendRequests.filter((r) => r.friendshipId !== request.friendshipId),
      );
    } catch {
      Alert.alert("Could not decline", "Check your connection and try again.");
    }
  };

  const performUnfriend = async (friend: FriendProfile) => {
    void haptics.destructive();
    try {
      // ponytail: the store keeps FriendProfile without the friendship row
      // id, so look it up here; have fetchSocialGraph carry it if more
      // callers need this.
      const { data, error } = await supabase
        .from("friendships")
        .select("id")
        .eq("status", "accepted")
        .or(
          `requester_user_id.eq.${friend.userId},addressee_user_id.eq.${friend.userId}`,
        )
        .limit(1);
      if (error) throw error;
      const friendshipId = (data?.[0] as { id: string } | undefined)?.id;
      if (friendshipId) {
        await unfriend(friendshipId);
      }
      const s = useStore.getState();
      setSocialGraph(
        s.friends.filter((f) => f.userId !== friend.userId),
        s.friendRequests,
      );
    } catch {
      Alert.alert("Could not unfriend", "Check your connection and try again.");
    }
  };

  const openFriendMenu = (friend: FriendProfile) => {
    void haptics.tap();
    Alert.alert(
      friend.displayName,
      friend.username ? `@${friend.username}` : undefined,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unfriend",
          style: "destructive",
          onPress: () => {
            void haptics.warning();
            Alert.alert(
              "Unfriend?",
              `Remove ${friend.displayName} from your friends. Shared goals stay until either of you leaves them.`,
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Unfriend",
                  style: "destructive",
                  onPress: () => void performUnfriend(friend),
                },
              ],
            );
          },
        },
      ],
    );
  };

  const handleImportLocalData = async () => {
    setIsImporting(true);
    try {
      const session = await getPersistedSession();
      if (!session?.user) {
        throw new Error("No session");
      }
      await importLocalDataToCloud(session.user);
      void haptics.success();
    } catch {
      Alert.alert(
        "Import failed",
        "We could not import this device's local data yet.",
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handleSignOut = () => {
    void haptics.warning();
    Alert.alert(
      "Sign out?",
      "Your goals stay in the cloud and a copy stays on this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            try {
              await signOut();
              // The photo belongs to the signed-out account; don't let the next
              // sign-in upload it to a different profile.
              await AsyncStorage.removeItem(STORAGE_KEYS.avatar).catch(
                () => {},
              );
              setSettingsVisible(false);
            } catch {
              Alert.alert("Error", "Failed to sign out. Please try again.");
            }
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    void haptics.warning();
    Alert.alert(
      "Delete account?",
      "This will sign you out, remove local app data, and delete the remote OnTrack data tied to this account.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: async () => {
            try {
              await haptics.destructive();
              await deleteCurrentAccount();
              await useStore.persist.clearStorage();
              await AsyncStorage.removeItem(APP_TOUR_STORAGE_KEY);
              await AsyncStorage.removeItem(LEGACY_ONBOARDING_STORAGE_KEY);
              setGoals([]);
              setSharedGoals([]);
              setSocialGraph([], [], []);
              setAccount(null);
              setCloudSyncEnabled(false);
              setSettingsVisible(false);
              notifyAccountDeleted();
            } catch (error) {
              console.error("Error deleting account:", error);
              Alert.alert(
                "Error",
                "Failed to delete this account. Please try again.",
              );
            }
          },
        },
      ],
    );
  };

  const settingsCardStyle = {
    backgroundColor: theme.background,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
  } as const;

  if (!account) {
    // ponytail: App currently gates the whole navigator behind a session, so
    // this renders only in the future local-only mode (social-model.md) or if
    // profile sync failed; Sign in drops the session so the existing
    // AuthScreen gate takes over.
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={{ flex: 1, padding: 16, justifyContent: "center" }}>
          <View
            style={{
              ...card(theme, isDark),
              padding: 20,
              alignItems: "center",
              gap: 8,
            }}
          >
            <Ionicons
              name="person-circle-outline"
              size={48}
              color={theme.textSecondary}
            />
            <Text
              style={{ fontSize: 18, fontWeight: "700", color: theme.text }}
            >
              You are not signed in
            </Text>
            <Text style={{ color: theme.textSecondary, textAlign: "center" }}>
              Sign in to add friends, share goals, and keep your progress backed
              up.
            </Text>
            <Pressable
              onPress={() => {
                void haptics.navigate();
                void signOut().catch(() => {});
              }}
              style={{
                marginTop: 8,
                paddingHorizontal: 24,
                paddingVertical: 10,
                borderRadius: 9999,
                backgroundColor: theme.primary,
              }}
            >
              <Text style={{ color: "#ffffff", fontWeight: "700" }}>
                Sign in
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ padding: 16, gap: 12 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text
              style={{ fontSize: 34, fontWeight: "800", color: theme.text }}
            >
              Profile
            </Text>
            <IconButton
              icon="settings-outline"
              size={20}
              circular
              onPress={() => {
                void haptics.tap();
                setSettingsVisible(true);
              }}
            />
          </View>

          <View style={{ alignItems: "center", gap: 4, marginTop: 4 }}>
            <Pressable onPress={() => void pickAvatar()}>
              {avatarUri ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={{ width: 72, height: 72, borderRadius: 36 }}
                />
              ) : (
                <Avatar
                  userId={account.id}
                  displayName={account.displayName}
                  size="lg"
                />
              )}
              <View
                style={{
                  position: "absolute",
                  right: -2,
                  bottom: -2,
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: theme.primary,
                  borderWidth: 2.5,
                  borderColor: theme.background,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="camera" size={13} color="#ffffff" />
              </View>
            </Pressable>
            <Text
              style={{
                fontSize: 22,
                fontWeight: "800",
                color: theme.text,
                marginTop: 8,
              }}
            >
              {account.displayName}
            </Text>
            <Text style={{ color: theme.textSecondary }}>
              @{account.username} · tap photo to change
            </Text>
          </View>

          {/* Stats */}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            {[
              { value: activeGoalCount, label: "Active goals" },
              { value: friends.length, label: "Friends" },
              // ponytail: streak units are mixed (days for daily tasks,
              // weeks otherwise), so no unit suffix despite the mock's "wks".
              { value: bestStreak, label: "Best streak" },
            ].map((stat) => (
              <View
                key={stat.label}
                style={{
                  ...card(theme, isDark),
                  flex: 1,
                  padding: 12,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{ fontSize: 20, fontWeight: "800", color: theme.text }}
                >
                  {stat.value}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.textSecondary,
                    marginTop: 2,
                  }}
                >
                  {stat.label}
                </Text>
              </View>
            ))}
          </View>

          {achievedGoals.length > 0 ? (
            <>
              <Text
                style={{
                  ...SECTION_HEADER,
                  color: theme.textSecondary,
                  marginTop: 8,
                }}
              >
                ACHIEVED
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
                {achievedGoals.map((goal) => (
                  <Pressable
                    key={goal.id}
                    onPress={() => {
                      void haptics.navigate();
                      navigation.navigate("Goal", { goalId: goal.id });
                    }}
                    style={{ alignItems: "center", gap: 5, width: 64 }}
                  >
                    <View
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 24,
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
                      <Ionicons name="trophy" size={20} color={theme.warning} />
                    </View>
                    <Text
                      numberOfLines={2}
                      style={{
                        fontSize: 10,
                        fontWeight: "600",
                        color: theme.text,
                        textAlign: "center",
                        lineHeight: 12,
                      }}
                    >
                      {goal.title}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {friendRequests.length > 0 && (
            <>
              <Text
                style={{
                  ...SECTION_HEADER,
                  color: theme.textSecondary,
                  marginTop: 8,
                }}
              >
                FRIEND REQUESTS ({friendRequests.length})
              </Text>
              {friendRequests.map((request) => (
                <View
                  key={request.friendshipId}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 12,
                    padding: 12,
                    backgroundColor: theme.surface,
                  }}
                >
                  <Avatar
                    userId={request.requester.userId}
                    avatarUri={request.requester.avatarUri}
                    displayName={request.requester.displayName}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "700", color: theme.text }}>
                      {request.requester.displayName}
                    </Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                      @{request.requester.username} · {request.mutualFriends}{" "}
                      mutual friend{request.mutualFriends === 1 ? "" : "s"}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => void handleAcceptRequest(request)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: theme.primary,
                    }}
                  >
                    <Ionicons name="checkmark" size={20} color="#ffffff" />
                  </Pressable>
                  <Pressable
                    onPress={() => void handleDeclineRequest(request)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: theme.background,
                      borderWidth: 1,
                      borderColor: theme.border,
                    }}
                  >
                    <Ionicons
                      name="close"
                      size={20}
                      color={theme.textSecondary}
                    />
                  </Pressable>
                </View>
              ))}
            </>
          )}

          <Text
            style={{
              ...SECTION_HEADER,
              color: theme.textSecondary,
              marginTop: 8,
            }}
          >
            FRIENDS
          </Text>
          {friends.length > 0 ? (
            friends.map((friend) => {
              const sharedCount = sharedGoalCountFor(friend.userId);
              return (
                <Pressable
                  key={friend.userId}
                  onLongPress={() => openFriendMenu(friend)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 12,
                    padding: 12,
                    backgroundColor: theme.surface,
                  }}
                >
                  <Avatar
                    userId={friend.userId}
                    avatarUri={friend.avatarUri}
                    displayName={friend.displayName}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "700", color: theme.text }}>
                      {friend.displayName}
                    </Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                      {sharedCount} shared goal{sharedCount === 1 ? "" : "s"}
                    </Text>
                  </View>
                  <IconButton
                    icon="ellipsis-horizontal"
                    size={18}
                    onPress={() => openFriendMenu(friend)}
                  />
                </Pressable>
              );
            })
          ) : (
            <View
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 12,
                padding: 14,
                backgroundColor: theme.surface,
              }}
            >
              <Text style={{ color: theme.text, fontWeight: "700" }}>
                No friends yet
              </Text>
              <Text style={{ color: theme.textSecondary, marginTop: 4 }}>
                Find people to share goals and keep each other on track.
              </Text>
            </View>
          )}

          <Pressable
            onPress={() => {
              void haptics.navigate();
              navigation.navigate("Search");
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: 12,
            }}
          >
            <Ionicons name="search" size={16} color={theme.primary} />
            <Text style={{ color: theme.primary, fontWeight: "700" }}>
              Find people
            </Text>
          </Pressable>

          <View style={{ height: 20 }} />
        </View>
      </ScrollView>

      {/* Settings Modal (ported from the old HomeScreen) */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={settingsVisible}
        onRequestClose={() => {
          void haptics.tap();
          setSettingsVisible(false);
        }}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
          }}
        >
          <View
            style={{
              backgroundColor: theme.surface,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
              paddingBottom: 40,
              borderTopWidth: 1,
              borderTopColor: theme.border,
              maxHeight: "85%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <Text
                style={{ fontSize: 18, fontWeight: "700", color: theme.text }}
              >
                Settings
              </Text>
              <Pressable
                onPress={() => {
                  void haptics.tap();
                  setSettingsVisible(false);
                }}
                style={{
                  padding: 8,
                  borderRadius: 8,
                  backgroundColor: theme.background,
                }}
              >
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Appearance: colour theme + dark mode (redesign) */}
              <View style={settingsCardStyle}>
                <Text
                  style={{ color: theme.text, fontWeight: "600", fontSize: 16 }}
                >
                  Appearance
                </Text>
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: 13,
                    marginTop: 2,
                  }}
                >
                  Colour theme
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    marginTop: 8,
                  }}
                >
                  {THEME_OPTIONS.map((option) => {
                    const selected = option.id === themeId;
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => {
                          void haptics.toggle();
                          setThemeId(option.id);
                        }}
                        style={{
                          width: "25%",
                          alignItems: "center",
                          gap: 3,
                          marginTop: 8,
                        }}
                      >
                        <View
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: 21,
                            borderWidth: 2,
                            borderColor: selected
                              ? option.accent
                              : "transparent",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <View
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 16,
                              backgroundColor: option.accent,
                            }}
                          />
                        </View>
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "600",
                            color: selected ? theme.text : theme.textSecondary,
                          }}
                        >
                          {option.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 14,
                    paddingTop: 12,
                    borderTopWidth: 1,
                    borderTopColor: theme.border,
                  }}
                >
                  <Text
                    style={{
                      color: theme.text,
                      fontWeight: "600",
                      fontSize: 15,
                    }}
                  >
                    Dark Mode
                  </Text>
                  <Switch
                    value={isDark}
                    onValueChange={() => {
                      void haptics.toggle();
                      toggleTheme();
                    }}
                    trackColor={{ false: theme.border, true: theme.primary }}
                    thumbColor={isDark ? theme.surface : theme.background}
                  />
                </View>
              </View>

              {/* Account */}
              <View style={settingsCardStyle}>
                <Text
                  style={{ color: theme.text, fontWeight: "600", fontSize: 16 }}
                >
                  Account
                </Text>
                <Pressable
                  onPress={() => void pickAvatar()}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    marginTop: 10,
                  }}
                >
                  {avatarUri ? (
                    <Image
                      source={{ uri: avatarUri }}
                      style={{ width: 36, height: 36, borderRadius: 18 }}
                    />
                  ) : (
                    <Avatar
                      userId={account.id}
                      displayName={account.displayName}
                      size="md"
                    />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: theme.text,
                        fontWeight: "600",
                        fontSize: 14,
                      }}
                    >
                      Avatar
                    </Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                      Upload a photo
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={theme.textSecondary}
                  />
                </Pressable>
                <Text style={{ color: theme.textSecondary, marginTop: 4 }}>
                  {account.displayName} @{account.username}
                </Text>
                {account.email ? (
                  <Text style={{ color: theme.textSecondary, marginTop: 2 }}>
                    {account.email}
                  </Text>
                ) : null}
                <Pressable
                  onPress={handleSignOut}
                  style={{
                    marginTop: 10,
                    paddingVertical: 8,
                    borderRadius: 9999,
                    borderWidth: 1,
                    borderColor: theme.border,
                    alignItems: "center",
                    backgroundColor: theme.surface,
                  }}
                >
                  <Text style={{ color: theme.text, fontWeight: "600" }}>
                    Sign out
                  </Text>
                </Pressable>
              </View>

              {/* Import local data (only while cloud sync is off with local goals) */}
              {!cloudSyncEnabled && goals.length > 0 ? (
                <Pressable
                  disabled={isImporting}
                  onPress={() => {
                    void haptics.tap();
                    void handleImportLocalData();
                  }}
                  style={{
                    ...settingsCardStyle,
                    opacity: isImporting ? 0.5 : 1,
                  }}
                >
                  <Text
                    style={{
                      color: theme.text,
                      fontWeight: "600",
                      fontSize: 16,
                    }}
                  >
                    {isImporting ? "Importing…" : "Import local data"}
                  </Text>
                  <Text style={{ color: theme.textSecondary, marginTop: 4 }}>
                    Upload this device&apos;s goals to your account and turn on
                    cloud sync.
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={() => {
                  void haptics.navigate();
                  setSettingsVisible(false);
                  navigation.navigate("Instructions");
                }}
                style={settingsCardStyle}
              >
                <Text
                  style={{ color: theme.text, fontWeight: "600", fontSize: 16 }}
                >
                  How It Works
                </Text>
                <Text style={{ color: theme.textSecondary, marginTop: 4 }}>
                  Learn goals, tasks, daily views, heatmaps, and streaks.
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  void haptics.navigate();
                  setSettingsVisible(false);
                  navigation.navigate("Privacy");
                }}
                style={{ ...settingsCardStyle, marginBottom: 20 }}
              >
                <Text
                  style={{ color: theme.text, fontWeight: "600", fontSize: 16 }}
                >
                  Privacy & Data
                </Text>
                <Text style={{ color: theme.textSecondary, marginTop: 4 }}>
                  Goals and completion history stay on this device.
                </Text>
              </Pressable>

              <Pressable
                onPress={handleDeleteAccount}
                style={{
                  backgroundColor: theme.danger,
                  padding: 12,
                  borderRadius: 10,
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <Text
                  style={{ color: "white", fontWeight: "600", fontSize: 16 }}
                >
                  Delete Account
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
