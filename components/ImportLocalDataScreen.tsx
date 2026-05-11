import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";

type ImportLocalDataScreenProps = {
  goalCount: number;
  taskCount: number;
  isImporting?: boolean;
  errorMessage?: string | null;
  onImport: () => void;
  onSkip: () => void;
};

export default function ImportLocalDataScreen({
  goalCount,
  taskCount,
  isImporting = false,
  errorMessage,
  onImport,
  onSkip,
}: ImportLocalDataScreenProps) {
  const { theme } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: "center" }}>
        <View style={{ gap: 18 }}>
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.border,
              alignSelf: "center",
            }}
          >
            <Ionicons name="download-outline" size={42} color={theme.primary} />
          </View>

          <View style={{ gap: 10 }}>
            <Text style={{ color: theme.text, fontSize: 28, fontWeight: "800", textAlign: "center" }}>
              Import this device’s data?
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 15, lineHeight: 22, textAlign: "center" }}>
              You already have local OnTrack data on this device. Before cloud sync turns on, choose whether to copy it into your account.
            </Text>
          </View>

          <View
            style={{
              gap: 8,
              padding: 16,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.surface,
            }}
          >
            <Text style={{ color: theme.text, fontWeight: "700", fontSize: 16 }}>Local data found</Text>
            <Text style={{ color: theme.textSecondary, lineHeight: 20 }}>
              {goalCount} goal{goalCount === 1 ? "" : "s"} and {taskCount} task{taskCount === 1 ? "" : "s"} are stored only on this device right now.
            </Text>
            <Text style={{ color: theme.textSecondary, lineHeight: 20 }}>
              Importing will upload this local copy to Supabase so it can sync across devices.
            </Text>
          </View>

          {errorMessage ? (
            <View style={{ padding: 12, borderRadius: 10, backgroundColor: "#7f1d1d" }}>
              <Text style={{ color: "#fecaca", lineHeight: 20 }}>{errorMessage}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={onImport}
            disabled={isImporting}
            style={{
              backgroundColor: isImporting ? theme.border : theme.primary,
              borderRadius: 999,
              paddingHorizontal: 18,
              paddingVertical: 14,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 10,
            }}
          >
            {isImporting ? <ActivityIndicator color={theme.background} /> : null}
            <Text style={{ color: theme.background, fontWeight: "700", fontSize: 16 }}>Import local data</Text>
          </Pressable>

          <Pressable
            onPress={onSkip}
            disabled={isImporting}
            style={{
              borderRadius: 999,
              paddingHorizontal: 18,
              paddingVertical: 14,
              alignItems: "center",
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Text style={{ color: theme.text, fontWeight: "700", fontSize: 16 }}>Not now</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
