import React from "react";
import { Text, View, ViewStyle } from "react-native";
import { useTheme } from "../contexts/ThemeContext";

// Fixed palette (saturated mid-tones, readable with white text in both themes).
const PALETTE = [
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

const colorForUserId = (userId: string): string => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
};

const initialsFor = (displayName: string): string => {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
};

const SIZES = { sm: 24, md: 36, lg: 72 } as const;

export type AvatarSize = keyof typeof SIZES;

type AvatarUser = { userId: string; displayName: string };

export default function Avatar({
  userId,
  displayName,
  size = "md",
  style,
}: AvatarUser & { size?: AvatarSize; style?: ViewStyle }) {
  const px = SIZES[size];
  return (
    <View
      style={[
        {
          width: px,
          height: px,
          borderRadius: px / 2,
          backgroundColor: colorForUserId(userId),
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Text
        style={{ color: "#ffffff", fontWeight: "700", fontSize: px * 0.38 }}
      >
        {initialsFor(displayName)}
      </Text>
    </View>
  );
}

export function AvatarStack({
  users,
  size = "sm",
  max = 4,
}: {
  users: AvatarUser[];
  size?: AvatarSize;
  max?: number;
}) {
  const { theme } = useTheme();
  const px = SIZES[size];
  const visible = users.slice(0, max);
  const overflow = users.length - visible.length;

  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {visible.map((user, index) => (
        <Avatar
          key={user.userId}
          userId={user.userId}
          displayName={user.displayName}
          size={size}
          style={{
            marginLeft: index === 0 ? 0 : -px / 3,
            borderWidth: 2,
            borderColor: theme.surface,
          }}
        />
      ))}
      {overflow > 0 && (
        <View
          style={{
            width: px,
            height: px,
            borderRadius: px / 2,
            marginLeft: visible.length > 0 ? -px / 3 : 0,
            backgroundColor: theme.border,
            borderWidth: 2,
            borderColor: theme.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{ color: theme.text, fontWeight: "700", fontSize: px * 0.34 }}
          >
            +{overflow}
          </Text>
        </View>
      )}
    </View>
  );
}
