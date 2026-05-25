import React from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { format } from "date-fns";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";

interface FreezeDayModalProps {
  visible: boolean;
  date: Date;
  onFreeze: (reason: string) => void;
  onCancel: () => void;
}

const MIN_REASON_LENGTH = 3;
const MAX_REASON_LENGTH = 120;

export default function FreezeDayModal({
  visible,
  date,
  onFreeze,
  onCancel,
}: FreezeDayModalProps) {
  const { theme } = useTheme();
  const [reason, setReason] = React.useState("");

  // Reset reason when modal opens
  React.useEffect(() => {
    if (visible) setReason("");
  }, [visible]);

  const trimmedReason = reason.trim();
  const isValid = trimmedReason.length >= MIN_REASON_LENGTH;
  const charsLeft = MAX_REASON_LENGTH - reason.length;

  const handleFreeze = () => {
    if (!isValid) {
      void haptics.error();
      return;
    }
    void haptics.success();
    onFreeze(trimmedReason);
  };

  const handleCancel = () => {
    void haptics.tap();
    onCancel();
  };

  const dateLabel = format(date, "EEEE, MMM d");

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={handleCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            padding: 24,
            backgroundColor: "rgba(15, 23, 42, 0.45)",
          }}
        >
          {/* Backdrop tap to dismiss */}
          <Pressable
            onPress={handleCancel}
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
              padding: 20,
              gap: 14,
              backgroundColor: theme.surface,
            }}
          >
            {/* Header */}
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <Text style={{ fontSize: 22 }}>❄️</Text>
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: 18, fontWeight: "800", color: theme.text }}
                >
                  Freeze {dateLabel}
                </Text>
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: 13,
                    marginTop: 2,
                  }}
                >
                  Frozen days won&apos;t break your streaks.
                </Text>
              </View>
            </View>

            {/* Reason input */}
            <View style={{ gap: 6 }}>
              <Text
                style={{ color: theme.text, fontWeight: "600", fontSize: 14 }}
              >
                Why are you freezing this day?
              </Text>
              <TextInput
                value={reason}
                onChangeText={(text) =>
                  setReason(text.slice(0, MAX_REASON_LENGTH))
                }
                placeholder="e.g., Family emergency, travel day, illness…"
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={3}
                style={{
                  borderWidth: 1,
                  borderColor:
                    charsLeft === 0
                      ? (theme.danger ?? "#ef4444")
                      : isValid
                        ? theme.primary
                        : theme.border,
                  borderRadius: 10,
                  padding: 12,
                  backgroundColor: theme.background,
                  color: theme.text,
                  fontSize: 15,
                  minHeight: 80,
                  textAlignVertical: "top",
                }}
                autoFocus
              />
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  {!isValid && trimmedReason.length > 0
                    ? `At least ${MIN_REASON_LENGTH} characters required`
                    : charsLeft === 0
                      ? "Character limit reached"
                      : "A reason helps you stay accountable."}
                </Text>
                <Text
                  style={{
                    color:
                      charsLeft < 20
                        ? (theme.danger ?? "#ef4444")
                        : theme.textSecondary,
                    fontSize: 12,
                  }}
                >
                  {charsLeft}
                </Text>
              </View>
            </View>

            {/* Action buttons */}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <Pressable
                onPress={handleCancel}
                style={{
                  flex: 1,
                  backgroundColor: theme.background,
                  borderWidth: 1,
                  borderColor: theme.border,
                  padding: 12,
                  borderRadius: 10,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: theme.textSecondary, fontWeight: "600" }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleFreeze}
                disabled={!isValid}
                style={{
                  flex: 1,
                  backgroundColor: isValid ? theme.primary : theme.border,
                  padding: 12,
                  borderRadius: 10,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <Text style={{ fontSize: 16 }}>❄️</Text>
                <Text
                  style={{
                    color: isValid ? "white" : theme.textSecondary,
                    fontWeight: "700",
                  }}
                >
                  Freeze Day
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
