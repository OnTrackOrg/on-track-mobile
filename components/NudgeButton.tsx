import React from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";
import {
  NudgeRateLimitError,
  nudgeRetryMinutes,
  sendNudge,
  wasRecentlyNudged,
} from "../lib/nudges";
import { withAlpha } from "../utils/color";

type NudgeButtonProps = {
  recipientUserId: string;
  recipientName: string;
  goalId: string;
  // "icon" is the 30pt circle used in member rows; "pill" adds a label.
  variant?: "icon" | "pill";
  color?: string;
};

type Status = "idle" | "sending" | "sent" | "limited";

const formatWait = (minutes: number) =>
  minutes >= 60 ? "1h" : `${Math.max(1, minutes)}m`;

/**
 * One tap sends the nudge — no composer, no confirmation. The button turns
 * into a checkmark once sent and into a wait time if the hourly limit is
 * hit; both are the only explanation the user gets.
 */
export default function NudgeButton({
  recipientUserId,
  recipientName,
  goalId,
  variant = "icon",
  color,
}: NudgeButtonProps) {
  const { theme } = useTheme();
  const accent = color ?? theme.primary;
  const initial = (): Status =>
    wasRecentlyNudged(recipientUserId, goalId) ? "sent" : "idle";
  const [status, setStatus] = React.useState<Status>(initial);
  const [waitMinutes, setWaitMinutes] = React.useState(() =>
    nudgeRetryMinutes(recipientUserId, goalId),
  );

  React.useEffect(() => {
    setStatus(initial());
    setWaitMinutes(nudgeRetryMinutes(recipientUserId, goalId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientUserId, goalId]);

  const send = async () => {
    if (status !== "idle") {
      void haptics.warning();
      return;
    }
    void haptics.press();
    setStatus("sending");
    try {
      await sendNudge(recipientUserId, goalId);
      void haptics.success();
      setStatus("sent");
    } catch (error) {
      if (error instanceof NudgeRateLimitError) {
        void haptics.warning();
        setWaitMinutes(error.retryAfterMinutes);
        setStatus("limited");
        return;
      }
      void haptics.error();
      setStatus("idle");
      Alert.alert(
        `Couldn't nudge ${recipientName}`,
        error instanceof Error
          ? error.message
          : "Check your connection and try again.",
      );
    }
  };

  const done = status === "sent" || status === "limited";
  const iconName =
    status === "sent"
      ? "checkmark"
      : status === "limited"
        ? "time-outline"
        : "megaphone-outline";
  const iconColor = done ? theme.textSecondary : accent;
  const label =
    status === "sent"
      ? "Nudged"
      : status === "limited"
        ? formatWait(waitMinutes)
        : "Nudge";

  if (variant === "pill") {
    return (
      <Pressable
        accessibilityLabel={`Nudge ${recipientName}`}
        onPress={() => void send()}
        hitSlop={6}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 9999,
          backgroundColor: done
            ? withAlpha(theme.textSecondary, 0.12)
            : withAlpha(accent, 0.14),
        }}
      >
        {status === "sending" ? (
          <ActivityIndicator size="small" color={accent} />
        ) : (
          <Ionicons name={iconName} size={14} color={iconColor} />
        )}
        <Text
          style={{
            color: done ? theme.textSecondary : accent,
            fontWeight: "700",
            fontSize: 13,
          }}
        >
          {label}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={{ alignItems: "center", gap: 2 }}>
      <Pressable
        accessibilityLabel={`Nudge ${recipientName}`}
        onPress={() => void send()}
        hitSlop={6}
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: done
            ? withAlpha(theme.textSecondary, 0.12)
            : withAlpha(accent, 0.14),
        }}
      >
        {status === "sending" ? (
          <ActivityIndicator size="small" color={accent} />
        ) : (
          <Ionicons name={iconName} size={15} color={iconColor} />
        )}
      </Pressable>
      {status === "limited" ? (
        <Text
          style={{
            fontSize: 9,
            fontWeight: "700",
            color: theme.textSecondary,
            position: "absolute",
            top: 31,
          }}
        >
          {formatWait(waitMinutes)}
        </Text>
      ) : null}
    </View>
  );
}
