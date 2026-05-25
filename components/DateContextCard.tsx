import React from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { format, isToday, isFuture } from "date-fns";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";
import IconButton from "./IconButton";
import FreezeDayModal from "./FreezeDayModal";

interface DateContextCardProps {
  selectedDate: Date;
  isFrozen: boolean;
  freezeReason?: string;
  hasCompletions: boolean;
  onPress: () => void;
  onPreviousDay: () => void;
  onNextDay: () => void;
  onFreezeDay: (reason: string) => void;
  onUnfreezeDay: () => void;
}

export default function DateContextCard({
  selectedDate,
  isFrozen,
  freezeReason,
  hasCompletions,
  onPress,
  onPreviousDay,
  onNextDay,
  onFreezeDay,
  onUnfreezeDay,
}: DateContextCardProps) {
  const { theme, isDark } = useTheme();
  const viewingToday = isToday(selectedDate);
  const isFutureDate = isFuture(selectedDate);
  const [showFreezeModal, setShowFreezeModal] = React.useState(false);

  // Theme-aware frozen colors
  const frozenBorderColor = isDark ? "#3b82f6" + "60" : "#60a5fa" + "60";
  const frozenBgColor = isDark ? "#1e3a5f" + "20" : "#eff6ff" + "20";
  const frozenIconBg = isDark ? "#3b82f6" + "25" : "#60a5fa" + "25";
  const frozenTextColor = isDark ? "#93c5fd" : "#60a5fa";

  const handleFreezePress = () => {
    void haptics.tap();
    setShowFreezeModal(true);
  };

  const handleFreezeConfirm = (reason: string) => {
    setShowFreezeModal(false);
    onFreezeDay(reason);
  };

  const handleFreezeCancel = () => {
    setShowFreezeModal(false);
  };

  const handleUnfreezePress = () => {
    void haptics.warning();
    Alert.alert(
      "Unfreeze this day?",
      freezeReason
        ? `Reason: "${freezeReason}"\n\nRemoving the freeze will allow this day to affect your streaks again.`
        : "Removing the freeze will allow this day to affect your streaks again.",
      [
        { text: "Keep Frozen", style: "cancel" },
        {
          text: "Unfreeze",
          style: "destructive",
          onPress: () => {
            void haptics.destructive();
            onUnfreezeDay();
          },
        },
      ],
    );
  };

  return (
    <>
      <View
        style={{
          borderWidth: 1,
          borderColor: isFrozen ? frozenBorderColor : theme.primary + "40",
          borderRadius: 14,
          padding: 14,
          backgroundColor: isFrozen ? frozenBgColor : theme.surface,
          gap: 12,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              flex: 1,
            }}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isFrozen ? frozenIconBg : theme.primary + "15",
              }}
            >
              {isFrozen ? (
                <Text style={{ fontSize: 20 }}>❄️</Text>
              ) : (
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color={theme.primary}
                />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: theme.textSecondary,
                  fontSize: 12,
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                }}
              >
                {isFrozen ? "Frozen Day" : "Tracking Date"}
              </Text>
              <Text
                style={{
                  color: theme.text,
                  fontSize: 16,
                  fontWeight: "700",
                  marginTop: 2,
                }}
              >
                {format(selectedDate, "EEEE, MMM d, yyyy")}
              </Text>
              {isFrozen && freezeReason ? (
                <Text
                  style={{ color: frozenTextColor, marginTop: 2, fontSize: 13 }}
                  numberOfLines={2}
                >
                  {freezeReason}
                </Text>
              ) : (
                <Text style={{ color: theme.textSecondary, marginTop: 2 }}>
                  {viewingToday
                    ? "Tap to switch days"
                    : "Viewing and editing this day"}
                </Text>
              )}
            </View>
          </View>
          <IconButton icon="calendar-outline" onPress={onPress} padded />
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={onPreviousDay}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              backgroundColor: theme.background,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 10,
              paddingVertical: 10,
            }}
          >
            <Ionicons name="chevron-back" size={16} color={theme.text} />
            <Text style={{ color: theme.text, fontWeight: "700" }}>
              Previous
            </Text>
          </Pressable>

          <Pressable
            onPress={onNextDay}
            disabled={viewingToday}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              backgroundColor: theme.background,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 10,
              paddingVertical: 10,
              opacity: viewingToday ? 0.45 : 1,
            }}
          >
            <Text style={{ color: theme.text, fontWeight: "700" }}>Next</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.text} />
          </Pressable>
        </View>

        {/* Freeze / Unfreeze row - only for today or past dates without completions */}
        {!isFutureDate &&
          (isFrozen ? (
            <Pressable
              onPress={handleUnfreezePress}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                backgroundColor: theme.background,
                borderWidth: 1,
                borderColor: frozenBorderColor,
                borderRadius: 10,
                paddingVertical: 10,
              }}
            >
              <Text style={{ fontSize: 16 }}>❄️</Text>
              <Text style={{ color: frozenTextColor, fontWeight: "700" }}>
                Day Frozen — Tap to Unfreeze
              </Text>
            </Pressable>
          ) : !hasCompletions ? (
            <Pressable
              onPress={handleFreezePress}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                backgroundColor: theme.background,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 10,
                paddingVertical: 10,
              }}
            >
              <Text style={{ fontSize: 16 }}>❄️</Text>
              <Text style={{ color: theme.textSecondary, fontWeight: "600" }}>
                Freeze This Day
              </Text>
            </Pressable>
          ) : null)}
      </View>

      <FreezeDayModal
        visible={showFreezeModal}
        date={selectedDate}
        onFreeze={handleFreezeConfirm}
        onCancel={handleFreezeCancel}
      />
    </>
  );
}
