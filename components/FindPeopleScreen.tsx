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
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "../contexts/ThemeContext";
import { useStore } from "../store";
import {
  PersonSearchResult,
  searchPeople,
  sendFriendRequest,
} from "../lib/social";
import { RootStackParamList } from "../navigation";
import { card } from "./ui";
import Avatar from "./Avatar";
import { haptics } from "../utils/haptics";

type FindPeopleProps = NativeStackScreenProps<RootStackParamList, "FindPeople">;

/** People search, reached from the Friends section on Profile. */
export default function FindPeopleScreen(_props: FindPeopleProps) {
  const { theme, isDark } = useTheme();
  const account = useStore((s) => s.account);
  const friends = useStore((s) => s.friends);
  const friendRequests = useStore((s) => s.friendRequests);
  const sentFriendRequestUserIds = useStore((s) => s.sentFriendRequestUserIds);
  const accountId = account?.id;

  const [query, setQuery] = React.useState("");
  const [people, setPeople] = React.useState<PersonSearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  const searchSeq = React.useRef(0);
  // Requests sent this session, for instant feedback; the store slice
  // (refreshed from the server) covers requests from previous sessions.
  const [sentRequestIds, setSentRequestIds] = React.useState<Set<string>>(
    new Set(),
  );

  React.useEffect(() => {
    if (!accountId) return;
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
    }, 350);
    return () => clearTimeout(timer);
  }, [query, accountId]);

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
    void haptics.press();
    setSentRequestIds((prev) => new Set(prev).add(person.userId));
    try {
      await sendFriendRequest(person.userId);
      void haptics.success();
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

  const trimmedQuery = query.trim();
  const pill = (label: string, active: boolean, onPress?: () => void) => (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={{
        borderRadius: 9999,
        paddingHorizontal: 12,
        paddingVertical: 7,
        backgroundColor: active ? theme.primary : "transparent",
        borderWidth: active ? 0 : 1,
        borderColor: theme.border,
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: "700",
          color: active ? "#ffffff" : theme.textSecondary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background }}
      edges={["bottom", "left", "right"]}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            ...card(theme, isDark),
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 9999,
          }}
        >
          <Ionicons name="search" size={16} color={theme.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Name or @username"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="search"
            style={{ flex: 1, color: theme.text, fontSize: 16, padding: 0 }}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons
                name="close-circle"
                size={16}
                color={theme.textSecondary}
              />
            </Pressable>
          ) : null}
        </View>

        {trimmedQuery.length < 2 ? null : searching && people.length === 0 ? (
          <ActivityIndicator
            color={theme.textSecondary}
            style={{ marginTop: 12 }}
          />
        ) : people.length === 0 ? (
          <Text style={{ color: theme.textSecondary, marginTop: 8 }}>
            No one matches &ldquo;{trimmedQuery}&rdquo;.
          </Text>
        ) : (
          people.map((person) => {
            const relationship = relationshipFor(person.userId);
            return (
              <View
                key={person.userId}
                style={{
                  ...card(theme, isDark),
                  padding: 12,
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
                  <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                    @{person.username}
                    {person.mutualFriends > 0
                      ? ` · ${person.mutualFriends} mutual`
                      : ""}
                  </Text>
                </View>
                {relationship === "friends"
                  ? pill("Friends", false)
                  : relationship === "requested"
                    ? pill("Requested", false)
                    : pill("Add", true, () => void handleAddFriend(person))}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
