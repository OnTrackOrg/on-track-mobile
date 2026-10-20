import React from "react";
import { ActivityIndicator, Alert, Pressable, Text } from "react-native";
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
  color?: string;
  // Fires once a nudge goes out, so a parent can mark the goal as nudged.
  onSent?: () => void;
};

type Status = "idle" | "sending" | "sent" | "limited";

const formatWait = (minutes: number) =>
  minutes >= 60 ? "1h" : `${Math.max(1, minutes)}m`;

/**
 * The friend page's full-width "Nudge Maya" button. One tap sends the
 * nudge — no composer, no confirmation. It turns into "Nudged Maya" once
 * sent and into a wait time if the hourly limit is hit; both are the only
 * explanation the user gets.
 */
export default function NudgeButton({
  recipientUserId,
  recipientName,
  goalId,
  color,
  onSent,
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
      onSent?.();
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
  const firstName = recipientName.split(" ")[0];
  return (
    <Pressable
      accessibilityLabel={`Nudge ${recipientName}`}
      onPress={() => void send()}
      style={{
        flex: 1,
        height: 50,
        borderRadius: 9999,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: done ? withAlpha(theme.textSecondary, 0.12) : accent,
      }}
    >
      {status === "sending" ? (
        <ActivityIndicator size="small" color="#ffffff" />
      ) : (
        <Ionicons
          name={iconName}
          size={18}
          color={done ? theme.textSecondary : "#ffffff"}
        />
      )}
      <Text
        style={{
          fontSize: 16,
          fontWeight: "700",
          color: done ? theme.textSecondary : "#ffffff",
        }}
      >
        {status === "sent"
          ? `Nudged ${firstName}`
          : status === "limited"
            ? `Nudge again in ${formatWait(waitMinutes)}`
            : `Nudge ${firstName}`}
      </Text>
    </Pressable>
  );
}
