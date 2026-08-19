import React from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";
import { useStore } from "../store";
import { sendNudge, wasRecentlyNudged } from "../lib/nudges";
import { withAlpha } from "../utils/color";
import Avatar from "./Avatar";
import { card } from "./ui";
import { Goal } from "../types";

export type NudgeRecipient = {
  userId: string;
  displayName: string;
  username?: string;
  avatarUri?: string;
};

type NudgeModalProps = {
  visible: boolean;
  recipient: NudgeRecipient;
  goal: Goal;
  // The friend's recent adherence on this goal (0..1), when known.
  adherence?: number;
  onClose: () => void;
};

const MESSAGE_PRESETS = [
  "You've got this — one small step today!",
  "Cheering you on. Let's keep this going together!",
  "No pressure, just a friendly boost from me.",
];

/**
 * Nudge flow (issue #165): one modal shared by the friend profile and the
 * shared-goal widget. Shows who is nudging whom and about what, lets the
 * sender pick a supportive message, confirms in place after sending, and
 * blocks duplicate sends via the session cooldown in lib/nudges.
 */
export default function NudgeModal({
  visible,
  recipient,
  goal,
  adherence,
  onClose,
}: NudgeModalProps) {
  const { theme, isDark } = useTheme();
  const account = useStore((s) => s.account);

  const [status, setStatus] = React.useState<"idle" | "sending" | "sent">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [messageIndex, setMessageIndex] = React.useState(0);

  const alreadyNudged =
    status !== "sent" && wasRecentlyNudged(recipient.userId, goal.id);

  React.useEffect(() => {
    if (visible) {
      setStatus("idle");
      setErrorMessage(null);
      setMessageIndex(0);
    }
  }, [visible]);

  const close = () => {
    void haptics.tap();
    onClose();
  };

  const send = async () => {
    if (status !== "idle" || alreadyNudged) return;
    setStatus("sending");
    setErrorMessage(null);
    try {
      await sendNudge(recipient.userId, goal.id, MESSAGE_PRESETS[messageIndex]);
      void haptics.success();
      setStatus("sent");
    } catch (error) {
      void haptics.error();
      setStatus("idle");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Check your connection and try again.",
      );
    }
  };

  const adherenceLine =
    adherence !== undefined
      ? adherence >= 0.7
        ? `${recipient.displayName} is at ${Math.round(adherence * 100)}% on this goal over the last 8 weeks — cheer them on to keep it rolling.`
        : `${recipient.displayName} is at ${Math.round(adherence * 100)}% on this goal over the last 8 weeks — a friendly boost could help.`
      : "A friendly boost could help them keep going.";

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={close}
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
          onPress={close}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
          }}
        />
        <View style={{ ...card(theme, isDark), padding: 20, gap: 14 }}>
          {status === "sent" ? (
            <View style={{ alignItems: "center", gap: 10, paddingVertical: 8 }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: withAlpha(theme.success, 0.16),
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="checkmark" size={30} color={theme.success} />
              </View>
              <Text
                style={{ fontWeight: "800", fontSize: 18, color: theme.text }}
              >
                Nudge sent
              </Text>
              <Text
                style={{
                  color: theme.textSecondary,
                  textAlign: "center",
                  lineHeight: 20,
                }}
              >
                {recipient.displayName} will get a supportive push from you
                about &ldquo;{goal.title}&rdquo;.
              </Text>
              <Pressable
                onPress={close}
                style={{
                  marginTop: 6,
                  paddingHorizontal: 24,
                  paddingVertical: 10,
                  borderRadius: 9999,
                  backgroundColor: theme.primary,
                }}
              >
                <Text style={{ color: "#ffffff", fontWeight: "700" }}>
                  Done
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text
                style={{ fontWeight: "800", fontSize: 18, color: theme.text }}
              >
                Send a nudge
              </Text>

              {/* Sender → recipient, so it's clear who's nudging whom. */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                }}
              >
                <View style={{ alignItems: "center", gap: 4 }}>
                  <Avatar
                    userId={account?.id ?? "me"}
                    displayName={account?.displayName ?? "You"}
                    size="md"
                  />
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                    You
                  </Text>
                </View>
                <Ionicons
                  name="arrow-forward"
                  size={18}
                  color={theme.textSecondary}
                />
                <View style={{ alignItems: "center", gap: 4 }}>
                  <Avatar
                    userId={recipient.userId}
                    displayName={recipient.displayName}
                    avatarUri={recipient.avatarUri}
                    size="md"
                  />
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                    {recipient.displayName}
                  </Text>
                </View>
              </View>

              {/* Shared-goal context */}
              <View
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: theme.border,
                  backgroundColor: theme.background,
                  padding: 12,
                  gap: 4,
                }}
              >
                <Text style={{ fontWeight: "700", color: theme.text }}>
                  {goal.title}
                </Text>
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: 13,
                    lineHeight: 18,
                  }}
                >
                  {adherenceLine}
                </Text>
              </View>

              {alreadyNudged ? (
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    alignItems: "center",
                    borderRadius: 10,
                    padding: 12,
                    backgroundColor: withAlpha(theme.warning, 0.12),
                  }}
                >
                  <Ionicons
                    name="time-outline"
                    size={18}
                    color={theme.warning}
                  />
                  <Text style={{ flex: 1, color: theme.text, lineHeight: 19 }}>
                    You nudged {recipient.displayName} about this goal recently.
                    Give it a little time before nudging again.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <Text
                    style={{
                      fontWeight: "700",
                      fontSize: 12,
                      letterSpacing: 0.6,
                      color: theme.textSecondary,
                    }}
                  >
                    ADD A SUPPORTIVE MESSAGE
                  </Text>
                  {MESSAGE_PRESETS.map((preset, index) => {
                    const selected = messageIndex === index;
                    return (
                      <Pressable
                        key={preset}
                        onPress={() => {
                          void haptics.toggle();
                          setMessageIndex(index);
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: selected ? theme.primary : theme.border,
                          backgroundColor: selected
                            ? withAlpha(theme.primary, 0.1)
                            : "transparent",
                          padding: 10,
                        }}
                      >
                        <Ionicons
                          name={
                            selected ? "radio-button-on" : "radio-button-off"
                          }
                          size={16}
                          color={selected ? theme.primary : theme.textSecondary}
                        />
                        <Text
                          style={{ flex: 1, color: theme.text, fontSize: 13 }}
                        >
                          {preset}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {errorMessage ? (
                <Text style={{ color: theme.danger, fontSize: 13 }}>
                  {errorMessage}
                </Text>
              ) : null}

              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={close}
                  style={{
                    flex: 1,
                    backgroundColor: theme.background,
                    borderWidth: 1,
                    borderColor: theme.border,
                    padding: 12,
                    borderRadius: 10,
                  }}
                >
                  <Text
                    style={{
                      color: theme.textSecondary,
                      textAlign: "center",
                      fontWeight: "600",
                    }}
                  >
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void send()}
                  disabled={status === "sending" || alreadyNudged}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 6,
                    backgroundColor: theme.primary,
                    padding: 12,
                    borderRadius: 10,
                    opacity: status === "sending" || alreadyNudged ? 0.5 : 1,
                  }}
                >
                  {status === "sending" ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Ionicons name="megaphone" size={15} color="#ffffff" />
                  )}
                  <Text style={{ color: "#ffffff", fontWeight: "700" }}>
                    {status === "sending" ? "Sending…" : "Send nudge"}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
