import React, { useState, useLayoutEffect } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Text, View, Pressable, ScrollView, Alert, Switch, Modal, AppState } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from '@expo/vector-icons';
import { addDays, isToday, startOfDay, subDays } from "date-fns";
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from "react-native-draggable-flatlist";
import { useStore, debugAsyncStorage, getCurrentMode, getGoalProgress } from "../store";
import { useTheme } from "../contexts/ThemeContext";
import RadarChart from "./RadarChart";
import DateContextCard from "./DateContextCard";
import CalendarModal from "./CalendarModal";
import { haptics } from "../utils/haptics";
import { RootStackParamList } from "../navigation";
import { RadarChartMode } from "./RadarChart";

type HomeProps = NativeStackScreenProps<RootStackParamList, "Home">;

export default function HomeScreen({ navigation }: HomeProps) {
  const goals = useStore((s) => s.goals);
  const selectedDate = useStore((s) => s.selectedDate);
  const account = useStore((s) => s.account);
  const setSelectedDate = useStore((s) => s.setSelectedDate);
  const reorderGoals = useStore((s) => s.reorderGoals);
  const resetAppData = useStore((s) => s.resetAppData);
  const deleteGoal = useStore((s) => s.deleteGoal);
  const currentMode = getCurrentMode();
  const { theme, isDark, toggleTheme, resetThemePreference } = useTheme();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [isReorderingGoals, setIsReorderingGoals] = useState(false);
  const [radarMode, setRadarMode] = useState<RadarChartMode>("current");
  const isDevToolsVisible = currentMode === "DEV";
  const canReorderGoals = goals.length > 1;

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

  const renderGoalCard = (
    item: (typeof goals)[number],
    options?: { drag?: () => void; isActive?: boolean; showDragHandle?: boolean }
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
            : { width: `${Math.max(progress.percent * 100, progress.percent > 0 ? 8 : 0)}%` }),
          backgroundColor: progress.isComplete ? theme.textSecondary + "30" : theme.primary + "18",
        }}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {options?.showDragHandle ? (
          <Pressable
            onLongPress={options.drag}
            delayLongPress={150}
            style={{ paddingVertical: 4, paddingRight: 2 }}
          >
            <Ionicons name="reorder-three-outline" size={18} color={theme.textSecondary} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => {
            void haptics.navigate();
            navigation.navigate("Goal", { goalId: item.id });
          }}
          style={{ flex: 1 }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text }}>{item.title}</Text>
          {item.target && <Text style={{ color: theme.textSecondary }}>Target: {item.target}</Text>}
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
                  }
                }
              ]
            );
          }}
          style={{
            alignSelf: "center",
            borderRadius: 9999,
            paddingHorizontal: 8,
            paddingVertical: 4,
            opacity: 0.35
          }}
        >
          <Ionicons name="trash-outline" size={16} color={theme.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom', 'left', 'right']}>
      <ScrollView style={{ flex: 1, backgroundColor: theme.background }} showsVerticalScrollIndicator={false}>
        <View style={{ padding: 16, gap: 12 }}>
          <DateContextCard
            selectedDate={selectedDate}
            onPress={() => {
              void haptics.tap();
              setCalendarVisible(true);
            }}
            onPreviousDay={() => {
              void haptics.tap();
              setSelectedDate(subDays(selectedDate, 1));
            }}
            onNextDay={() => {
              if (isToday(selectedDate)) {
                void haptics.warning();
                return;
              }

              void haptics.tap();
              const nextDate = addDays(selectedDate, 1);
              const today = startOfDay(new Date());
              setSelectedDate(nextDate > today ? today : nextDate);
            }}
          />

          <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text }}>Consistency Overview</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {([
              { key: "current", label: "Current" },
              { key: "trend", label: "All-time trend" },
            ] as const).map((option) => (
              <Pressable
                key={option.key}
                onPress={() => {
                  setRadarMode(option.key);
                  void haptics.tap();
                }}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 9999,
                  borderWidth: 1,
                  borderColor: radarMode === option.key ? theme.primary : theme.border,
                  backgroundColor: radarMode === option.key ? theme.primary + "20" : theme.surface,
                }}
              >
                <Text style={{ color: radarMode === option.key ? theme.primary : theme.textSecondary, fontWeight: "600", fontSize: 12 }}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <RadarChart goals={goals} size={250} referenceDate={selectedDate} mode={radarMode} />

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text }}>Goals</Text>
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
                  color={isReorderingGoals ? theme.primary : theme.textSecondary}
                />
                <Text style={{ color: isReorderingGoals ? theme.primary : theme.textSecondary, fontWeight: "600", fontSize: 12 }}>
                  {isReorderingGoals ? "Done" : "Reorder"}
                </Text>
              </Pressable>
            ) : null}
          </View>
          
          {/* Goals list */}
          {goals.length > 0 ? (
            <>
              {isReorderingGoals ? (
                <View style={{ gap: 8 }}>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                    Long press and drag goals to reorder them.
                  </Text>
                  <DraggableFlatList
                    data={goals}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                    onDragEnd={({ data }) => {
                      reorderGoals(data.map((goal) => goal.id));
                      void haptics.success();
                    }}
                    ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                    renderItem={({ item, drag, isActive }: RenderItemParams<(typeof goals)[number]>) => (
                      <ScaleDecorator>
                        {renderGoalCard(item, { drag, isActive, showDragHandle: true })}
                      </ScaleDecorator>
                    )}
                  />
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {goals.map((goal) => (
                    <View key={goal.id}>
                      {renderGoalCard(goal)}
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : null}

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
            <Text style={{ color: theme.textSecondary, fontWeight: "600", textAlign: "center" }}>+ New Goal</Text>
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
        <View style={{ 
          flex: 1, 
          justifyContent: 'flex-end',
          backgroundColor: 'rgba(0, 0, 0, 0.5)' 
        }}>
          <View style={{ 
            backgroundColor: theme.surface,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 20,
            paddingBottom: 40,
            borderTopWidth: 1,
            borderTopColor: theme.border
          }}>
            {/* Modal Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text }}>Settings</Text>
              <Pressable
                onPress={() => {
                  void haptics.tap();
                  setSettingsVisible(false);
                }}
                style={{ 
                  padding: 8, 
                  borderRadius: 8,
                  backgroundColor: theme.background
                }}
              >
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>

            {/* Dark Mode Toggle */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <Text style={{ color: theme.text, fontWeight: "600", fontSize: 16 }}>Dark Mode</Text>
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
                <Text style={{ color: theme.text, fontWeight: "600", fontSize: 16 }}>Account</Text>
                <Text style={{ color: theme.textSecondary, marginTop: 4 }}>
                  {account.displayName} @{account.username}
                </Text>
                <Text style={{ color: theme.textSecondary, marginTop: 4 }}>
                  This profile will be used for future sync and communication features.
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
                borderColor: theme.border
              }}
            >
              <Text style={{ color: theme.text, fontWeight: "600", fontSize: 16 }}>How It Works</Text>
              <Text style={{ color: theme.textSecondary, marginTop: 4 }}>
                Learn goals, tasks, dates, heatmaps, radar charts, and example data.
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
                borderColor: theme.border
              }}
            >
              <Text style={{ color: theme.text, fontWeight: "600", fontSize: 16 }}>Privacy & Data</Text>
              <Text style={{ color: theme.textSecondary, marginTop: 4 }}>
                Goals and completion history stay on this device.
              </Text>
            </Pressable>

            {isDevToolsVisible && (
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <Text style={{ color: theme.text, fontWeight: "600", fontSize: 16 }}>Store Mode</Text>
                  <Text style={{ 
                    fontSize: 12, 
                    color: theme.warning, 
                    fontFamily: 'monospace',
                    letterSpacing: 0.5,
                    backgroundColor: theme.background,
                    padding: 6,
                    borderRadius: 6
                  }}>
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
                    alignItems: 'center',
                    marginBottom: 12
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "600", fontSize: 16 }}>Debug Storage</Text>
                </Pressable>
              </>
            )}

            {/* Clear Stores Button */}
            <Pressable
              onPress={() => {
                void haptics.warning();
                Alert.alert(
                  "Reset app data?",
                  "This will permanently delete all goals, tasks, and completion history stored on this device.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Reset", 
                      style: "destructive", 
                      onPress: async () => {
                        try {
                          await haptics.destructive();

                          resetAppData();
                          await resetThemePreference();
                          setSettingsVisible(false);

                          Alert.alert(
                            "App data reset",
                            "Your local data has been removed.",
                            [{ text: "OK" }]
                          );
                        } catch (error) {
                          console.error('Error resetting storage:', error);
                          Alert.alert("Error", "Failed to reset app data. Please try again.");
                        }
                      }
                    }
                  ]
                );
              }}
              style={{ 
                backgroundColor: theme.warning, 
                padding: 12, 
                borderRadius: 10,
                alignItems: 'center'
              }}
            >
              <Text style={{ color: "white", fontWeight: "600", fontSize: 16 }}>Reset App Data</Text>
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
