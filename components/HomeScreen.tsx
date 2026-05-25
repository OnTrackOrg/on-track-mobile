import React, { useState, useLayoutEffect } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  Text,
  View,
  Pressable,
  ScrollView,
  Alert,
  Switch,
  Modal,
  AppState,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { isToday } from "date-fns";
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import {
  useStore,
  debugAsyncStorage,
  getCurrentMode,
  getGoalProgress,
} from "../store";
import { useTheme } from "../contexts/ThemeContext";
import RadarChart, { RadarChartMode } from "./RadarChart";
import DateContextCard from "./DateContextCard";
import CalendarModal from "./CalendarModal";
import { haptics } from "../utils/haptics";
import { RootStackParamList } from "../navigation";
import {
  getNextTrackingDate,
  getPreviousTrackingDate,
} from "../lib/dateContext";
import { deleteCurrentAccount } from "../lib/auth";
import { ONBOARDING_STORAGE_KEY } from "../onboarding";
import { Goal } from "../types";
import { getUiPreferences, updateUiPreferences } from "../lib/persistence";
import {
  DEFAULT_REMINDER_SETTINGS,
  ReminderSettings,
  getReminderSettings,
  requestReminderPermissions,
  saveReminderSettings,
  syncDailyReminder,
} from "../lib/reminders";

type HomeProps = NativeStackScreenProps<RootStackParamList, "Home">;

type HomeScreenProps = HomeProps & {
  onAccountDeleted?: () => void;
};

export default function HomeScreen({
  navigation,
  onAccountDeleted,
}: HomeScreenProps) {
  const goals = useStore((s) => s.goals);
  const selectedDate = useStore((s) => s.selectedDate);
  const account = useStore((s) => s.account);
  const setSelectedDate = useStore((s) => s.setSelectedDate);
  const reorderGoals = useStore((s) => s.reorderGoals);
  const deleteGoal = useStore((s) => s.deleteGoal);
  const setGoals = useStore((s) => s.setGoals);
  const setAccount = useStore((s) => s.setAccount);
  const setCloudSyncEnabled = useStore((s) => s.setCloudSyncEnabled);
  const freezeDay = useStore((s) => s.freezeDay);
  const unfreezeDay = useStore((s) => s.unfreezeDay);
  const isDayFrozen = useStore((s) => s.isDayFrozen);
  const getFreezeReason = useStore((s) => s.getFreezeReason);
  const currentMode = getCurrentMode();
  const { theme, isDark, toggleTheme } = useTheme();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [isReorderingGoals, setIsReorderingGoals] = useState(false);
  const [radarMode, setRadarMode] = useState<RadarChartMode>("current");
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>(
    DEFAULT_REMINDER_SETTINGS,
  );
  const activeGoals = React.useMemo(
    () => goals.filter((goal) => goal.completedAt === undefined),
    [goals],
  );
  const completedGoals = React.useMemo(
    () => goals.filter((goal) => goal.completedAt !== undefined),
    [goals],
  );
  const isDevToolsVisible = currentMode === "DEV";
  const canReorderGoals = activeGoals.length > 1;

  // Check if any recurring tasks have completions on the selected date
  const hasCompletionsOnDate = React.useMemo(() => {
    const dateKey = selectedDate.toISOString().split("T")[0];
    return activeGoals.some((goal) =>
      goal.tasks.some(
        (task) =>
          task.frequency !== "once" &&
          task.completions.some(
            (date) => date.toISOString().split("T")[0] === dateKey,
          ),
      ),
    );
  }, [activeGoals, selectedDate]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => {
            void haptics.tap();
            setSettingsVisible(true);
          }}
          style={{ padding: 8 }}
        >
          <Ionicons name="settings-outline" size={20} color={theme.text} />
        </Pressable>
      ),
    });
  }, [navigation, theme.text]);

  React.useEffect(() => {
    let isMounted = true;

    void getUiPreferences().then((preferences) => {
      if (!isMounted) {
        return;
      }

      if (
        preferences.homeRadarMode === "current" ||
        preferences.homeRadarMode === "trend"
      ) {
        setRadarMode(preferences.homeRadarMode);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    let isMounted = true;

    void getReminderSettings().then((settings) => {
      if (isMounted) {
        setReminderSettings(settings);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    void syncDailyReminder(activeGoals, reminderSettings).catch((error) => {
      console.error("Failed to sync daily reminder", error);
    });
  }, [activeGoals, reminderSettings]);

  React.useEffect(() => {
    const resetDateContextToToday = () => {
      setSelectedDate(new Date());
    };

    resetDateContextToToday();

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        resetDateContextToToday();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [setSelectedDate]);

  React.useEffect(() => {
    if (!canReorderGoals && isReorderingGoals) {
      setIsReorderingGoals(false);
    }
  }, [canReorderGoals, isReorderingGoals]);

  const renderGoalCard = (
    item: Goal,
    options?: {
      drag?: () => void;
      isActive?: boolean;
      showDragHandle?: boolean;
    },
  ) => {
    const progress = getGoalProgress(item, selectedDate);

    return (
      <View
        style={{
          borderWidth: 1,
          borderColor: options?.isActive ? theme.primary : theme.border,
          borderRadius: 10,
          padding: 12,
          backgroundColor: theme.surface,
          overflow: "hidden",
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            ...(progress.isComplete
              ? { right: 0 }
              : {
                  width: `${Math.max(progress.percent * 100, progress.percent > 0 ? 8 : 0)}%`,
                }),
            backgroundColor: progress.isComplete
              ? theme.textSecondary + "30"
              : theme.primary + "18",
          }}
        />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {options?.showDragHandle ? (
            <Pressable
              onLongPress={options.drag}
              delayLongPress={150}
              style={{ paddingVertical: 4, paddingRight: 2 }}
            >
              <Ionicons
                name="reorder-three-outline"
                size={18}
                color={theme.textSecondary}
              />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => {
              void haptics.navigate();
              navigation.navigate("Goal", { goalId: item.id });
            }}
            style={{ flex: 1 }}
          >
            <Text
              style={{ fontSize: 16, fontWeight: "700", color: theme.text }}
            >
              {item.title}
            </Text>
            {item.target && (
              <Text style={{ color: theme.textSecondary }}>
                Target: {item.target}
              </Text>
            )}
            <Text style={{ color: theme.textSecondary }}>
              {progress.total > 0
                ? `${Math.round(progress.percent * 100)}% complete, ${progress.completed.toFixed(0)}/${progress.total} complete for this day`
                : `Tasks: ${item.tasks.length}`}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              void haptics.warning();
              Alert.alert(
                "Delete goal?",
                `This will remove "${item.title}" and all its tasks.`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => {
                      void haptics.destructive();
                      deleteGoal(item.id);
                    },
                  },
                ],
              );
            }}
            style={{
              alignSelf: "center",
              borderRadius: 9999,
              paddingHorizontal: 8,
              paddingVertical: 4,
              opacity: 0.35,
            }}
          >
            <Ionicons
              name="trash-outline"
              size={16}
              color={theme.textSecondary}
            />
          </Pressable>
        </View>
      </View>
    );
  };

  const updateReminderSettings = async (nextSettings: ReminderSettings) => {
    setReminderSettings(nextSettings);
    await saveReminderSettings(nextSettings);
    await syncDailyReminder(activeGoals, nextSettings);
  };

  const toggleReminders = async (enabled: boolean) => {
    if (!enabled) {
      await updateReminderSettings({ ...reminderSettings, enabled: false });
      return;
    }

    const hasPermission = await requestReminderPermissions();

    if (!hasPermission) {
      Alert.alert(
        "Notifications are off",
        "Enable notifications for OnTrack in system settings to use daily reminders.",
      );
      return;
    }

    await updateReminderSettings({ ...reminderSettings, enabled: true });
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background }}
      edges={["bottom", "left", "right"]}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ padding: 16, gap: 12 }}>
          <DateContextCard
            selectedDate={selectedDate}
            isFrozen={isDayFrozen(selectedDate)}
            freezeReason={getFreezeReason(selectedDate)}
            hasCompletions={hasCompletionsOnDate}
            onPress={() => {
              void haptics.tap();
              setCalendarVisible(true);
            }}
            onPreviousDay={() => {
              void haptics.tap();
              setSelectedDate(getPreviousTrackingDate(selectedDate));
            }}
            onNextDay={() => {
              if (isToday(selectedDate)) {
                void haptics.warning();
                return;
              }

              void haptics.tap();
              setSelectedDate(getNextTrackingDate(selectedDate));
            }}
            onFreezeDay={(reason) => {
              freezeDay(selectedDate, reason);
            }}
            onUnfreezeDay={() => {
              unfreezeDay(selectedDate);
            }}
          />

          <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text }}>
            Consistency Overview
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {(
              [
                { key: "current", label: "Current" },
                { key: "trend", label: "All-time trend" },
              ] as const
            ).map((option) => (
              <Pressable
                key={option.key}
                onPress={() => {
                  setRadarMode(option.key);
                  void updateUiPreferences({ homeRadarMode: option.key });
                  void haptics.tap();
                }}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 9999,
                  borderWidth: 1,
                  borderColor:
                    radarMode === option.key ? theme.primary : theme.border,
                  backgroundColor:
                    radarMode === option.key
                      ? theme.primary + "20"
                      : theme.surface,
                }}
              >
                <Text
                  style={{
                    color:
                      radarMode === option.key
                        ? theme.primary
                        : theme.textSecondary,
                    fontWeight: "600",
                    fontSize: 12,
                  }}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <RadarChart
            goals={activeGoals}
            size={250}
            referenceDate={selectedDate}
            mode={radarMode}
            emptyTitle={goals.length > 0 ? "No active goals" : undefined}
            emptyHelperText={
              goals.length > 0
                ? "Complete or add a goal to compare active progress"
                : undefined
            }
          />

          <Pressable
            onPress={() => {
              void haptics.navigate();
              navigation.navigate("CompletedGoals");
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.border,
              padding: 12,
              borderRadius: 10,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.warning + "20",
              }}
            >
              <Ionicons name="trophy-outline" size={18} color={theme.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: theme.text, fontWeight: "700", fontSize: 16 }}
              >
                Completed Goals
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                {completedGoals.length} achieved
              </Text>
            </View>
            <Ionicons
              name="arrow-forward"
              size={16}
              color={theme.textSecondary}
            />
          </Pressable>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 8,
            }}
          >
            <Text
              style={{ fontSize: 18, fontWeight: "700", color: theme.text }}
            >
              Goals
            </Text>
            {canReorderGoals ? (
              <Pressable
                onPress={() => {
                  setIsReorderingGoals((prev) => !prev);
                  void haptics.tap();
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 9999,
                  borderWidth: 1,
                  borderColor: isReorderingGoals ? theme.primary : theme.border,
                  backgroundColor: theme.surface,
                }}
              >
                <Ionicons
                  name="reorder-three-outline"
                  size={14}
                  color={
                    isReorderingGoals ? theme.primary : theme.textSecondary
                  }
                />
                <Text
                  style={{
                    color: isReorderingGoals
                      ? theme.primary
                      : theme.textSecondary,
                    fontWeight: "600",
                    fontSize: 12,
                  }}
                >
                  {isReorderingGoals ? "Done" : "Reorder"}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* Goals list */}
          {activeGoals.length > 0 ? (
            <>
              {isReorderingGoals ? (
                <View style={{ gap: 8 }}>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                    Long press and drag goals to reorder them.
                  </Text>
                  <DraggableFlatList
                    data={activeGoals}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                    onDragEnd={({ data }) => {
                      reorderGoals(data.map((goal) => goal.id));
                      void haptics.success();
                    }}
                    ItemSeparatorComponent={() => (
                      <View style={{ height: 8 }} />
                    )}
                    renderItem={({
                      item,
                      drag,
                      isActive,
                    }: RenderItemParams<Goal>) => (
                      <ScaleDecorator>
                        {renderGoalCard(item, {
                          drag,
                          isActive,
                          showDragHandle: true,
                        })}
                      </ScaleDecorator>
                    )}
                  />
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {activeGoals.map((goal) => (
                    <View key={goal.id}>{renderGoalCard(goal)}</View>
                  ))}
                </View>
              )}
            </>
          ) : (
            <View
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 10,
                padding: 14,
                backgroundColor: theme.surface,
              }}
            >
              <Text style={{ color: theme.text, fontWeight: "700" }}>
                No active goals
              </Text>
              <Text style={{ color: theme.textSecondary, marginTop: 4 }}>
                Add a goal when you are ready for the next thing.
              </Text>
            </View>
          )}

          <Pressable
            onPress={() => {
              void haptics.navigate();
              navigation.navigate("NewGoal");
            }}
            style={{
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.border,
              padding: 12,
              borderRadius: 10,
              marginTop: 4,
            }}
          >
            <Text
              style={{
                color: theme.textSecondary,
                fontWeight: "600",
                textAlign: "center",
              }}
            >
              + New Goal
            </Text>
          </Pressable>

          {/* Add bottom padding so content doesn't get cut off */}
          <View style={{ height: 20 }} />
        </View>
      </ScrollView>

      {/* Settings Modal */}
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
            }}
          >
            {/* Modal Header */}
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

            {/* Dark Mode Toggle */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <Text
                style={{ color: theme.text, fontWeight: "600", fontSize: 16 }}
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

            <View
              style={{
                backgroundColor: theme.background,
                padding: 12,
                borderRadius: 10,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: theme.border,
                gap: 10,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: theme.text,
                      fontWeight: "600",
                      fontSize: 16,
                    }}
                  >
                    Daily Reminder
                  </Text>
                  <Text style={{ color: theme.textSecondary, marginTop: 4 }}>
                    Notify me when daily tasks are still unfinished.
                  </Text>
                </View>
                <Switch
                  value={reminderSettings.enabled}
                  onValueChange={(enabled) => {
                    void haptics.toggle();
                    void toggleReminders(enabled);
                  }}
                  trackColor={{ false: theme.border, true: theme.primary }}
                  thumbColor={
                    reminderSettings.enabled ? theme.surface : theme.background
                  }
                />
              </View>

              <View style={{ flexDirection: "row", gap: 8 }}>
                {(
                  [
                    { label: "6 PM", hour: 18 },
                    { label: "8 PM", hour: 20 },
                    { label: "10 PM", hour: 22 },
                  ] as const
                ).map((option) => {
                  const active = reminderSettings.hour === option.hour;

                  return (
                    <Pressable
                      key={option.hour}
                      onPress={() => {
                        void haptics.tap();
                        void updateReminderSettings({
                          ...reminderSettings,
                          hour: option.hour,
                          minute: 0,
                        });
                      }}
                      style={{
                        flex: 1,
                        alignItems: "center",
                        paddingVertical: 8,
                        borderRadius: 9999,
                        borderWidth: 1,
                        borderColor: active ? theme.primary : theme.border,
                        backgroundColor: active
                          ? theme.primary + "20"
                          : theme.surface,
                      }}
                    >
                      <Text
                        style={{
                          color: active ? theme.primary : theme.textSecondary,
                          fontWeight: "700",
                          fontSize: 12,
                        }}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {account ? (
              <View
                style={{
                  backgroundColor: theme.background,
                  padding: 12,
                  borderRadius: 10,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Text
                  style={{ color: theme.text, fontWeight: "600", fontSize: 16 }}
                >
                  Account
                </Text>
                <Text style={{ color: theme.textSecondary, marginTop: 4 }}>
                  {account.displayName} @{account.username}
                </Text>
                <Text style={{ color: theme.textSecondary, marginTop: 4 }}>
                  This profile will be used for future sync and communication
                  features.
                </Text>
              </View>
            ) : null}

            <Pressable
              onPress={() => {
                void haptics.navigate();
                setSettingsVisible(false);
                navigation.navigate("Instructions");
              }}
              style={{
                backgroundColor: theme.background,
                padding: 12,
                borderRadius: 10,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Text
                style={{ color: theme.text, fontWeight: "600", fontSize: 16 }}
              >
                How It Works
              </Text>
              <Text style={{ color: theme.textSecondary, marginTop: 4 }}>
                Learn goals, tasks, dates, heatmaps, radar charts, and example
                data.
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                void haptics.navigate();
                setSettingsVisible(false);
                navigation.navigate("Privacy");
              }}
              style={{
                backgroundColor: theme.background,
                padding: 12,
                borderRadius: 10,
                marginBottom: 20,
                borderWidth: 1,
                borderColor: theme.border,
              }}
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

            {isDevToolsVisible && (
              <>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <Text
                    style={{
                      color: theme.text,
                      fontWeight: "600",
                      fontSize: 16,
                    }}
                  >
                    Store Mode
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: theme.warning,
                      fontFamily: "monospace",
                      letterSpacing: 0.5,
                      backgroundColor: theme.background,
                      padding: 6,
                      borderRadius: 6,
                    }}
                  >
                    ● DEV STORE
                  </Text>
                </View>

                <Pressable
                  onPress={() => {
                    void haptics.tap();
                    debugAsyncStorage();
                    setSettingsVisible(false);
                  }}
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
                    Debug Storage
                  </Text>
                </Pressable>
              </>
            )}

            <Pressable
              onPress={() => {
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
                          await AsyncStorage.removeItem(ONBOARDING_STORAGE_KEY);
                          setGoals([]);
                          setAccount(null);
                          setCloudSyncEnabled(false);
                          setSettingsVisible(false);
                          onAccountDeleted?.();
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
              }}
              style={{
                backgroundColor: theme.danger,
                padding: 12,
                borderRadius: 10,
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <Text style={{ color: "white", fontWeight: "600", fontSize: 16 }}>
                Delete Account
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <CalendarModal
        visible={calendarVisible}
        selectedDate={selectedDate}
        onClose={() => setCalendarVisible(false)}
        onSelectDate={(date) => setSelectedDate(date)}
      />
    </SafeAreaView>
  );
}
