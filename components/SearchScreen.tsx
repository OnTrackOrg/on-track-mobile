import React from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useTheme } from "../contexts/ThemeContext";
import { useStore } from "../store";
import {
  searchPeople,
  sendFriendRequest,
  PersonSearchResult,
} from "../lib/social";
import { card } from "./ui";
import Avatar from "./Avatar";
import { haptics } from "../utils/haptics";
import { TabParamList } from "../navigation";

type Mode = "people" | "templates";

export default function SearchScreen({
  navigation,
}: BottomTabScreenProps<TabParamList, "Search">) {
  const { theme, isDark } = useTheme();
  const account = useStore((s) => s.account);
  const friends = useStore((s) => s.friends);
  const friendRequests = useStore((s) => s.friendRequests);
  const sentFriendRequestUserIds = useStore((s) => s.sentFriendRequestUserIds);
  const accountId = account?.id;

  const [mode, setMode] = React.useState<Mode>("people");
  const [query, setQuery] = React.useState("");

  // People search: debounced, latest response wins.
  const [people, setPeople] = React.useState<PersonSearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  const searchSeq = React.useRef(0);
  // Requests sent this session, for instant feedback; the store slice
  // (refreshed from the server) covers requests from previous sessions.
  const [sentRequestIds, setSentRequestIds] = React.useState<Set<string>>(
    new Set(),
  );

  React.useEffect(() => {
    if (mode !== "people" || !accountId) return;
    const q = query.trim();
    if (q.length < 2) {
      setPeople([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++searchSeq.current;
    const timer = setTimeout(() => {
      searchPeople(q)
        .then((results) => {
          if (searchSeq.current !== seq) return;
          setPeople(results);
          setSearching(false);
        })
        .catch(() => {
          // ponytail: transient search failures stay silent; retyping retries.
          if (searchSeq.current === seq) setSearching(false);
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [query, mode, accountId]);

  const relationshipFor = (
    userId: string,
  ): "friends" | "requested" | "none" => {
    if (friends.some((f) => f.userId === userId)) return "friends";
    if (
      sentRequestIds.has(userId) ||
      sentFriendRequestUserIds.includes(userId) ||
      friendRequests.some((r) => r.requester.userId === userId)
    ) {
      return "requested";
    }
    return "none";
  };

  const handleAddFriend = async (person: PersonSearchResult) => {
    void haptics.tap();
    setSentRequestIds((prev) => new Set(prev).add(person.userId));
    try {
      await sendFriendRequest(person.userId);
    } catch (error) {
      // Unique-pair violation means a request (either direction) already
      // exists; keep the optimistic "Requested" state instead of erroring.
      if ((error as { code?: string })?.code === "23505") return;
      setSentRequestIds((prev) => {
        const next = new Set(prev);
        next.delete(person.userId);
        return next;
      });
      void haptics.error();
      Alert.alert(
        "Couldn't send request",
        "Check your connection and try again.",
      );
    }
  };

  const cardStyle = { ...card(theme, isDark), padding: 12 };

  if (!account) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={{ flex: 1, padding: 16 }}>
          <Text style={{ fontSize: 34, fontWeight: "800", color: theme.text }}>
            Search
          </Text>
          <View style={{ ...cardStyle, marginTop: 16, alignItems: "center" }}>
            <Ionicons
              name="person-circle-outline"
              size={40}
              color={theme.textSecondary}
            />
            <Text
              style={{ marginTop: 8, fontWeight: "700", color: theme.text }}
            >
              Sign in to search
            </Text>
            <Text
              style={{
                marginTop: 4,
                color: theme.textSecondary,
                textAlign: "center",
              }}
            >
              People search needs an account.
            </Text>
            <Pressable
              onPress={() => {
                void haptics.navigate();
                navigation.navigate("Profile");
              }}
              style={{
                marginTop: 12,
                borderRadius: 9999,
                paddingHorizontal: 16,
                paddingVertical: 8,
                backgroundColor: theme.primary,
              }}
            >
              <Text style={{ color: "#ffffff", fontWeight: "700" }}>
                Go to Profile
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const trimmedQuery = query.trim();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 34, fontWeight: "800", color: theme.text }}>
          Search
        </Text>

        <View
          style={{
            marginTop: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            ...card(theme, isDark),
            padding: 0,
            paddingHorizontal: 12,
          }}
        >
          <Ionicons name="search" size={16} color={theme.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Find people..."
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            style={{ flex: 1, paddingVertical: 10, color: theme.text }}
          />
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          {(
            [
              ["people", "People"],
              ["templates", "Public goals"],
            ] as [Mode, string][]
          ).map(([value, label]) => {
            const active = mode === value;
            return (
              <Pressable
                key={value}
                onPress={() => {
                  void haptics.toggle();
                  setMode(value);
                }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 9999,
                  borderWidth: 1,
                  borderColor: active ? theme.primary : theme.border,
                  backgroundColor: active
                    ? theme.primary + "20"
                    : "transparent",
                }}
              >
                <Text
                  style={{
                    fontWeight: "600",
                    color: active ? theme.primary : theme.text,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {mode === "templates" ? (
          <View style={{ ...cardStyle, marginTop: 20, alignItems: "center" }}>
            <Ionicons
              name="rocket-outline"
              size={40}
              color={theme.textSecondary}
            />
            <Text
              style={{ marginTop: 8, fontWeight: "700", color: theme.text }}
            >
              Coming soon
            </Text>
            <Text
              style={{
                marginTop: 4,
                color: theme.textSecondary,
                textAlign: "center",
              }}
            >
              Public goals are on the way. For now, find friends in the People
              tab.
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: 20, gap: 10 }}>
            {trimmedQuery.length < 2 ? (
              <Text style={{ color: theme.textSecondary }}>
                Type at least 2 characters to find people.
              </Text>
            ) : searching ? (
              <ActivityIndicator
                color={theme.textSecondary}
                style={{ marginTop: 12 }}
              />
            ) : people.length === 0 ? (
              <Text style={{ color: theme.textSecondary }}>
                No people match &ldquo;{trimmedQuery}&rdquo;.
              </Text>
            ) : (
              people.map((person) => {
                const relationship = relationshipFor(person.userId);
                return (
                  <View
                    key={person.userId}
                    style={{
                      ...cardStyle,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <Avatar
                      userId={person.userId}
                      displayName={person.displayName}
                      avatarUri={person.avatarUri}
                      size="md"
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "700", color: theme.text }}>
                        {person.displayName}
                      </Text>
                      <Text
                        style={{ fontSize: 12, color: theme.textSecondary }}
                      >
                        @{person.username}
                        {person.mutualFriends > 0
                          ? ` · ${person.mutualFriends} mutual friend${
                              person.mutualFriends === 1 ? "" : "s"
                            }`
                          : ""}
                      </Text>
                    </View>
                    {relationship === "friends" ? (
                      <View
                        style={{
                          borderRadius: 9999,
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                          backgroundColor: theme.completedBackground,
                          borderWidth: 1,
                          borderColor: theme.completedBorder,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "700",
                            color: theme.textSecondary,
                          }}
                        >
                          Friends ✓
                        </Text>
                      </View>
                    ) : relationship === "requested" ? (
                      <View
                        style={{
                          borderRadius: 9999,
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                          borderWidth: 1,
                          borderColor: theme.primary,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "700",
                            color: theme.primary,
                          }}
                        >
                          Requested
                        </Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => void handleAddFriend(person)}
                        style={{
                          borderRadius: 9999,
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                          backgroundColor: theme.primary,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "700",
                            color: "#ffffff",
                          }}
                        >
                          Add friend
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
