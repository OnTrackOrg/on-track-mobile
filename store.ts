import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { persist, createJSONStorage } from "zustand/middleware";
import { Goal, Frequency, CustomFrequency, Task, UserAccount, FreezeDay } from "./types";
import { format, startOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, differenceInCalendarDays, addDays } from "date-fns";
import { normalizeAccountDraft } from "./account";

// Date utility functions
const normalizeDate = (date: Date): Date => startOfDay(date);
const dateToKey = (date: Date): string => format(normalizeDate(date), "yyyy-MM-dd");
const isSameDay = (date1: Date, date2: Date): boolean => 
  dateToKey(date1) === dateToKey(date2);

type PersistedTask = Omit<Task, "completions"> & {
  completions?: Array<Date | string>;
};

type PersistedGoal = Omit<Goal, "tasks"> & {
  tasks?: PersistedTask[];
  subGoals?: PersistedTask[];
};

type PersistedStoreSnapshot = {
  goals?: PersistedGoal[];
};

const normalizeTask = (task: PersistedTask): Task => ({
  ...task,
  completions: task.completions?.map((completion) =>
    typeof completion === "string" ? new Date(completion) : completion
  ) || [],
});

const normalizeGoal = (goal: PersistedGoal): Goal => ({
  ...goal,
  tasks: (goal.tasks ?? goal.subGoals ?? []).map(normalizeTask),
});

// Helper functions for custom frequency calculations
export const getCustomFrequencyProgress = (task: Task, referenceDate: Date = new Date()) => {
  if (task.frequency !== "custom" || !task.customFrequency) {
    return { completed: 0, target: 0, achieved: false };
  }

  const { type, target } = task.customFrequency;
  
  let periodStart: Date;
  let periodEnd: Date;
  
  if (type === "weekly") {
    periodStart = startOfWeek(referenceDate, { weekStartsOn: 0 }); // Sunday start
    periodEnd = endOfWeek(referenceDate, { weekStartsOn: 0 }); // Saturday end
  } else { // monthly
    periodStart = startOfMonth(referenceDate);
    periodEnd = endOfMonth(referenceDate);
  }
  
  const completionsInPeriod = task.completions.filter(date =>
    isWithinInterval(date, { start: periodStart, end: periodEnd })
  );
  
  const completed = completionsInPeriod.length;
  const achieved = completed >= target;
  
  return { completed, target, achieved, periodStart, periodEnd };
};

export const shouldShowCustomTask = (task: Task, referenceDate: Date = new Date()): boolean => {
  if (task.frequency !== "custom") return true;
  
  const completedToday = task.completions.some(date => isSameDay(date, referenceDate));
  const { achieved } = getCustomFrequencyProgress(task, referenceDate);
  return !completedToday && !achieved;
};

export const isOnceTaskCompletedOnDate = (task: Task, referenceDate: Date = new Date()): boolean => {
  if (task.frequency !== "once") {
    return false;
  }

  return task.completions.some((date) => isSameDay(date, referenceDate));
};

export const getGoalProgress = (goal: Goal, referenceDate: Date = new Date()) => {
  const relevantTasks = goal.tasks;

  if (relevantTasks.length === 0) {
    return { completed: 0, total: 0, percent: 0, isComplete: false };
  }

  const normalizedReferenceDate = normalizeDate(referenceDate);
  const selectedWeekStart = startOfWeek(normalizedReferenceDate, { weekStartsOn: 0 });
  const selectedWeekEnd = endOfWeek(normalizedReferenceDate, { weekStartsOn: 0 });

  const completed = relevantTasks.reduce((count, task) => {
    if (task.frequency === "daily") {
      return count + (task.completions.some((date) => isSameDay(date, normalizedReferenceDate)) ? 1 : 0);
    }

    if (task.frequency === "weekly") {
      return count + (task.completions.some((date) => {
        const normalizedDate = normalizeDate(date);
        return normalizedDate >= selectedWeekStart && normalizedDate <= selectedWeekEnd;
      }) ? 1 : 0);
    }

    if (task.frequency === "custom" && task.customFrequency) {
      const completedToday = task.completions.some((date) => isSameDay(date, normalizedReferenceDate));
      const { achieved } = getCustomFrequencyProgress(task, normalizedReferenceDate);
      return count + (completedToday || achieved ? 1 : 0);
    }

    if (task.frequency === "once") {
      return count + (task.completions.some((date) => normalizeDate(date) <= normalizedReferenceDate) ? 1 : 0);
    }

    return count;
  }, 0);

  const percent = completed / relevantTasks.length;
  return {
    completed,
    total: relevantTasks.length,
    percent,
    isComplete: percent >= 1,
  };
};

export const getCustomFrequencyAlert = (task: Task, referenceDate: Date = new Date()) => {
  if (task.frequency !== "custom" || !task.customFrequency) {
    return null;
  }

  const progress = getCustomFrequencyProgress(task, referenceDate);
  const completedToday = task.completions.some(date => isSameDay(date, referenceDate));
  const remainingNeeded = Math.max(progress.target - progress.completed, 0);

  if (remainingNeeded <= 0 || !progress.periodEnd) {
    return null;
  }

  const daysRemaining = differenceInCalendarDays(progress.periodEnd, normalizeDate(referenceDate)) + 1;

  if (remainingNeeded > daysRemaining) {
    return {
      tone: "error" as const,
      message: `You can no longer hit this ${task.customFrequency.type} target in the current period.`,
    };
  }

  if (!completedToday && remainingNeeded >= daysRemaining) {
    return {
      tone: "warning" as const,
      message: `Do this today or you will not be able to meet this ${task.customFrequency.type} target.`,
    };
  }

  if (remainingNeeded === daysRemaining - 1) {
    return {
      tone: "notice" as const,
      message: `${remainingNeeded} completion${remainingNeeded === 1 ? "" : "s"} left with ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining in this ${task.customFrequency.type} period.`,
    };
  }

  return null;
};

// Helper to calculate streak for any goal type
// frozenDays: pass the store's frozenDays array so frozen dates are skipped (not broken)
export const getGoalStreak = (task: Task, frozenDays: FreezeDay[] = []): number => {
  let streak = 0;
  let currentDate = new Date();

  // Build a Set of frozen date keys for O(1) lookup
  const frozenDateKeys = new Set(frozenDays.map((fd) => fd.date));
  const isDateKeyFrozen = (dateKey: string) => frozenDateKeys.has(dateKey);

  if (task.frequency === "custom" && task.customFrequency) {
    // For custom frequencies, check period achievements
    const { type } = task.customFrequency;
    
    // First check if current period is achieved (with freeze-adjusted target)
    let currentProgress = getCustomFrequencyProgress(task, currentDate);
    let frozenInCurrentPeriod = 0;
    if (currentProgress.periodStart && currentProgress.periodEnd) {
      let d = startOfDay(currentProgress.periodStart);
      while (d <= currentProgress.periodEnd) {
        if (isDateKeyFrozen(format(d, "yyyy-MM-dd"))) frozenInCurrentPeriod++;
        d = addDays(d, 1);
      }
    }
    const minTarget = Math.max(1, Math.ceil(currentProgress.target * 0.5));
    const adjustedTarget = Math.max(minTarget, currentProgress.target - frozenInCurrentPeriod);
    const currentAchieved = currentProgress.completed >= adjustedTarget;

    // If current period is achieved, start counting from it
    if (currentAchieved) {
      streak++;
      // Move to previous period
      if (type === "weekly") {
        currentDate.setDate(currentDate.getDate() - 7);
      } else {
        currentDate.setMonth(currentDate.getMonth() - 1);
      }
    } else {
      // If current period is not achieved, start from previous period
      if (type === "weekly") {
        currentDate.setDate(currentDate.getDate() - 7);
      } else {
        currentDate.setMonth(currentDate.getMonth() - 1);
      }
    }
    
    // Now count consecutive achieved periods going backwards
    while (true) {
      const progress = getCustomFrequencyProgress(task, currentDate);

      // Count frozen days in this period to reduce effective target
      let frozenInPeriod = 0;
      if (progress.periodStart && progress.periodEnd) {
        let d = startOfDay(progress.periodStart);
        while (d <= progress.periodEnd) {
          if (isDateKeyFrozen(format(d, "yyyy-MM-dd"))) frozenInPeriod++;
          d = addDays(d, 1);
        }
      }
      // Require at least 50% of original target (rounded up) to prevent
      // streaks from continuing with minimal effort when many days are frozen
      const minTarget = Math.max(1, Math.ceil(progress.target * 0.5));
      const adjustedTarget = Math.max(minTarget, progress.target - frozenInPeriod);
      const periodAchieved = progress.completed >= adjustedTarget;

      if (periodAchieved) {
        streak++;
        // Move to previous period
        if (type === "weekly") {
          currentDate.setDate(currentDate.getDate() - 7);
        } else {
          currentDate.setMonth(currentDate.getMonth() - 1);
        }
      } else {
        break; // Streak broken
      }
      
      // Safety check - don't go back more than 2 years
      if (streak > 104) break;
    }
  } else if (task.frequency === "daily") {
    // For daily tasks, check consecutive days; frozen days are skipped (neutral)
    while (true) {
      const dateStr = format(currentDate, "yyyy-MM-dd");
      const hasCompletion = task.completions.some(date => 
        format(date, "yyyy-MM-dd") === dateStr
      );
      
      if (hasCompletion) {
        streak++;
        // Move to previous day
        currentDate.setDate(currentDate.getDate() - 1);
      } else if (isDateKeyFrozen(dateStr)) {
        // Frozen day: skip without incrementing or breaking
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        break; // Streak broken
      }
      
      // Safety check - don't go back more than 365 days
      if (streak > 365) break;
    }
  } else if (task.frequency === "weekly") {
    // For weekly tasks, check consecutive weeks
    // A week is "frozen" if it has no completions but all 7 days are frozen
    while (true) {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 }); // Sunday
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 }); // Saturday
      
      const hasCompletionThisWeek = task.completions.some(date => 
        isWithinInterval(date, { start: weekStart, end: weekEnd })
      );

      if (hasCompletionThisWeek) {
        streak++;
        // Move to previous week
        currentDate.setDate(currentDate.getDate() - 7);
      } else {
        // Check if the entire week is frozen (all 7 days)
        let allFrozen = true;
        let d = startOfDay(weekStart);
        while (d <= weekEnd) {
          if (!isDateKeyFrozen(format(d, "yyyy-MM-dd"))) {
            allFrozen = false;
            break;
          }
          d = addDays(d, 1);
        }
        if (allFrozen) {
          // Skip this week without incrementing or breaking
          currentDate.setDate(currentDate.getDate() - 7);
        } else {
          break; // Streak broken
        }
      }
      
      // Safety check - don't go back more than 104 weeks (2 years)
      if (streak > 104) break;
    }
  }
  
  return streak;
};

// Helper to get all achieved goal periods for heatmap indicators
export const getAchievedGoalPeriods = (task: Task): Array<{ start: Date; end: Date; type: "weekly" | "monthly" }> => {
  if (task.frequency !== "custom" || !task.customFrequency) return [];
  
  const achievements: Array<{ start: Date; end: Date; type: "weekly" | "monthly" }> = [];
  const { type, target } = task.customFrequency;
  
  // Get date range to check (last 6 months for performance)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 6);
  
  // Check each period in the range
  let currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    const progress = getCustomFrequencyProgress(task, currentDate);
    
    if (progress.achieved && progress.periodStart && progress.periodEnd) {
      // Check if we already added this period
      const alreadyAdded = achievements.some(a => 
        a.start.getTime() === progress.periodStart!.getTime()
      );
      
      if (!alreadyAdded) {
        achievements.push({
          start: progress.periodStart,
          end: progress.periodEnd,
          type
        });
      }
    }
    
    // Move to next period
    if (type === "weekly") {
      currentDate.setDate(currentDate.getDate() + 7);
    } else {
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
  }
  
  return achievements;
};


// Debug function to inspect all stored data - console only for now
export const debugAsyncStorage = async () => {
    try {
        const timestamp = new Date().toISOString();
        
        console.log("=== AsyncStorage Debug ===");
        console.log(`Timestamp: ${timestamp}`);
        
        // Show current store mode
        console.log(`🏪 Current Mode: ${CURRENT_MODE}`);
        console.log(`🗄️  Active Storage: ${ACTIVE_STORAGE_KEY}`);
        console.log(`📝 Available Stores: DEV=${STORAGE_KEYS.DEV}, PROD=${STORAGE_KEYS.PROD}`);
        
        // Get all keys
        const allKeys = await AsyncStorage.getAllKeys();
        console.log("All AsyncStorage keys:", allKeys);
        
        // Get all OnTrack related keys
        const onTrackKeys = allKeys.filter(key => key.startsWith('ontrack'));
        console.log("OnTrack keys found:", onTrackKeys);
        
        // Get data for each OnTrack key
        for (const key of onTrackKeys) {
            try {
                const data = await AsyncStorage.getItem(key);
                console.log(`\n--- ${key} ---`);
                if (data) {
                    const parsed = JSON.parse(data) as PersistedStoreSnapshot;
                    console.log(`Goals count: ${parsed.goals?.length || 0}`);
                    console.log(`Data size: ${data.length} characters`);
                    console.log(`Created: ${new Date(parsed.goals?.[0]?.createdAt || Date.now()).toISOString()}`);
                    
                    // Show sample of each goal
                    parsed.goals?.forEach((goal, index) => {
                        console.log(`  Goal ${index + 1}: ${goal.title} (${goal.tasks?.length || goal.subGoals?.length || 0} tasks)`);
                    });
                } else {
                    console.log("No data found");
                }
            } catch (error) {
                console.log(`Error reading ${key}:`, error);
            }
        }
        
        console.log("=== End Debug ===");
        console.log("💡 To save to file, we'd need to fix FileSystem import issues");
        
    } catch (error) {
        console.log("Debug failed:", error);
    }
};



// Simple ID generator for MVP
function makeId() {
    return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

// Sample data for development/testing
export function getSampleGoals(): Goal[] {
    const today = normalizeDate(new Date());
    const daysAgo = (days: number) => normalizeDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - days));

    return [
        {
            id: makeId(),
            title: "Fitness Journey",
            target: "Get in shape",
            createdAt: Date.now() - (90 * 24 * 60 * 60 * 1000), // 90 days ago
            tasks: [
                {
                    id: makeId(),
                    title: "Morning workout",
                    frequency: "daily",
                    completions: [
                        today,
                        daysAgo(1),
                        daysAgo(2),
                        daysAgo(3),
                        daysAgo(4),
                        daysAgo(5),
                        daysAgo(6),
                        // Some earlier scattered completions
                        new Date(2025, 8, 20), new Date(2025, 8, 22), new Date(2025, 8, 24),
                        new Date(2025, 8, 15), new Date(2025, 8, 17), new Date(2025, 8, 19),
                        new Date(2025, 8, 10), new Date(2025, 8, 12), new Date(2025, 8, 14)
                    ]
                },
                {
                    id: makeId(),
                    title: "Drink protein shake",
                    frequency: "daily",
                    completions: [
                        new Date(2025, 6, 2), new Date(2025, 6, 4), new Date(2025, 6, 6), new Date(2025, 6, 9), new Date(2025, 6, 11),
                        new Date(2025, 7, 2), new Date(2025, 7, 5), new Date(2025, 7, 7), new Date(2025, 7, 10), new Date(2025, 7, 12),
                        new Date(2025, 7, 15), new Date(2025, 7, 17), new Date(2025, 7, 20), new Date(2025, 7, 22), new Date(2025, 7, 25),
                        new Date(2025, 8, 3), new Date(2025, 8, 5), new Date(2025, 8, 8), new Date(2025, 8, 10), new Date(2025, 8, 13)
                    ]
                },
                {
                    id: makeId(),
                    title: "Go to gym",
                    frequency: "custom",
                    customFrequency: { type: "weekly", target: 3 },
                    completions: [
                        today, daysAgo(2),
                        // Week 4 (Sept 23-29): 3/3 ✓
                        new Date(2025, 8, 23), new Date(2025, 8, 25), new Date(2025, 8, 27),
                        // Week 3 (Sept 16-22): 3/3 ✓
                        new Date(2025, 8, 16), new Date(2025, 8, 18), new Date(2025, 8, 20),
                        // Week 2 (Sept 9-15): 3/3 ✓
                        new Date(2025, 8, 9), new Date(2025, 8, 11), new Date(2025, 8, 13),
                        // Week 1 (Sept 2-8): 3/3 ✓ - This creates a 4-week streak!
                        new Date(2025, 8, 2), new Date(2025, 8, 4), new Date(2025, 8, 6)
                    ]
                },
                {
                    id: makeId(),
                    title: "Meal prep",
                    frequency: "custom",
                    customFrequency: { type: "weekly", target: 2 },
                    completions: [
                        // Current week: 1/2 so far
                        daysAgo(1),
                        // 3-week streak of hitting 2/week
                        new Date(2025, 8, 23), new Date(2025, 8, 26),
                        new Date(2025, 8, 16), new Date(2025, 8, 19),
                        new Date(2025, 8, 9), new Date(2025, 8, 12)
                    ]
                },
                {
                    id: makeId(),
                    title: "Clean house thoroughly",
                    frequency: "weekly",
                    completions: [
                        // 7-week streak! Each completion is one per week
                        daysAgo(3),
                        new Date(2025, 8, 21),  // Week of Sept 21-27
                        new Date(2025, 8, 14),  // Week of Sept 14-20
                        new Date(2025, 8, 7),   // Week of Sept 7-13
                        new Date(2025, 7, 31),  // Week of Aug 31-Sep 6
                        new Date(2025, 7, 24),  // Week of Aug 24-30
                        new Date(2025, 7, 17),  // Week of Aug 17-23
                    ]
                }
            ]
        },
        {
            id: makeId(),
            title: "Learning Spanish",
            target: "Conversational fluency",
            createdAt: Date.now() - (75 * 24 * 60 * 60 * 1000), // 75 days ago
            tasks: [
                {
                    id: makeId(),
                    title: "Duolingo practice",
                    frequency: "daily",
                    completions: [
                        today,
                        daysAgo(1),
                        daysAgo(2),
                        new Date(2025, 6, 15), new Date(2025, 6, 16), new Date(2025, 6, 17), new Date(2025, 6, 18), new Date(2025, 6, 19),
                        new Date(2025, 6, 20), new Date(2025, 6, 21), new Date(2025, 6, 22), new Date(2025, 6, 23), new Date(2025, 6, 24),
                        new Date(2025, 6, 25), new Date(2025, 6, 26), new Date(2025, 6, 27), new Date(2025, 6, 28), new Date(2025, 6, 29),
                        new Date(2025, 6, 30), new Date(2025, 6, 31), new Date(2025, 7, 1), new Date(2025, 7, 2), new Date(2025, 7, 3),
                        new Date(2025, 7, 4), new Date(2025, 7, 5), new Date(2025, 7, 6), new Date(2025, 7, 7), new Date(2025, 7, 8),
                        new Date(2025, 7, 9), new Date(2025, 7, 10), new Date(2025, 7, 11), new Date(2025, 7, 12), new Date(2025, 7, 13),
                        new Date(2025, 7, 14), new Date(2025, 7, 15), new Date(2025, 7, 16), new Date(2025, 7, 17), new Date(2025, 7, 18),
                        new Date(2025, 7, 19), new Date(2025, 7, 20), new Date(2025, 7, 21), new Date(2025, 7, 22), new Date(2025, 7, 23),
                        new Date(2025, 7, 24), new Date(2025, 7, 25), new Date(2025, 7, 26), new Date(2025, 7, 27), new Date(2025, 7, 28),
                        new Date(2025, 7, 29), new Date(2025, 7, 30), new Date(2025, 7, 31), new Date(2025, 8, 1), new Date(2025, 8, 2),
                        new Date(2025, 8, 3), new Date(2025, 8, 4), new Date(2025, 8, 5), new Date(2025, 8, 6), new Date(2025, 8, 7),
                        new Date(2025, 8, 8), new Date(2025, 8, 9), new Date(2025, 8, 10), new Date(2025, 8, 11), new Date(2025, 8, 12),
                        new Date(2025, 8, 13), new Date(2025, 8, 14), new Date(2025, 8, 15), new Date(2025, 8, 16), new Date(2025, 8, 17),
                        new Date(2025, 8, 18), new Date(2025, 8, 19), new Date(2025, 8, 20), new Date(2025, 8, 21), new Date(2025, 8, 22),
                        new Date(2025, 8, 23), new Date(2025, 8, 24), new Date(2025, 8, 25), new Date(2025, 8, 26), new Date(2025, 8, 27),
                        new Date(2025, 8, 28), new Date(2025, 8, 29), new Date(2025, 8, 30)
                    ]
                },
                {
                    id: makeId(),
                    title: "Watch Spanish Netflix",
                    frequency: "weekly",
                    completions: [
                        // 12-week streak! (July to current)
                        new Date("2025-07-13"), new Date("2025-07-20"), new Date("2025-07-27"), 
                        new Date("2025-08-03"), new Date("2025-08-10"), new Date("2025-08-17"), 
                        new Date("2025-08-24"), new Date("2025-08-31"), new Date("2025-09-07"), 
                        new Date("2025-09-14"), new Date("2025-09-21"), new Date("2025-09-28")
                    ]
                }
            ]
        },
        {
            id: makeId(),
            title: "Healthy Habits",
            target: "Better lifestyle",
            createdAt: Date.now() - (60 * 24 * 60 * 60 * 1000), // 60 days ago
            tasks: [
                {
                    id: makeId(),
                    title: "Drink 8 glasses of water",
                    frequency: "daily",
                    completions: [
                        today,
                        new Date("2025-08-02"), new Date("2025-08-15"), new Date("2025-09-01"), new Date("2025-09-20")
                    ]
                },
                {
                    id: makeId(),
                    title: "Meditate for 10 minutes",
                    frequency: "daily",
                    completions: [
                        daysAgo(1), new Date("2025-08-10"), new Date("2025-09-05")
                    ]
                },
                {
                    id: makeId(),
                    title: "Take vitamins",
                    frequency: "daily",
                    completions: [
                        new Date("2025-08-05"), new Date("2025-08-20"), new Date("2025-09-03")
                    ]
                }
            ]
        },
        {
            id: makeId(),
            title: "Side Project",
            target: "Launch mobile app",
            createdAt: Date.now() - (45 * 24 * 60 * 60 * 1000), // 45 days ago
            tasks: [
                {
                    id: makeId(),
                    title: "Code for 2 hours",
                    frequency: "daily",
                    completions: [
                        // 3-day streak ending today
                        today, daysAgo(1), daysAgo(2),
                        // Some scattered earlier dates
                        new Date("2025-09-25"), new Date("2025-09-26"), new Date("2025-09-28"),
                        new Date("2025-09-20"), new Date("2025-09-22"),
                        new Date("2025-09-15"), new Date("2025-09-17")
                    ]
                },
                {
                    id: makeId(),
                    title: "Write documentation",
                    frequency: "weekly",
                    completions: [
                        new Date("2025-08-18"), new Date("2025-08-25"), new Date("2025-09-01"), new Date("2025-09-08"), new Date("2025-09-15"), new Date("2025-09-22")
                    ]
                },
                {
                    id: makeId(),
                    title: "Test on device",
                    frequency: "weekly",
                    completions: [
                        new Date("2025-08-20"), new Date("2025-08-27"), new Date("2025-09-03"), new Date("2025-09-10"), new Date("2025-09-17")
                    ]
                }
            ]
        }
    ];
}

// Storage key configuration
const STORAGE_KEYS = {
    DEV: "ontrack-store-dev",
    PROD: "ontrack-store-prod"
} as const;

// Keep the app on the production store so local development does not reseed demo content.
const CURRENT_MODE = 'PROD' as 'DEV' | 'PROD';
const ACTIVE_STORAGE_KEY = CURRENT_MODE === 'DEV' ? STORAGE_KEYS.DEV : STORAGE_KEYS.PROD;

// Export current mode for UI indicator
export const getCurrentMode = () => CURRENT_MODE;




interface State {
    goals: Goal[];
    selectedDate: Date;
    account: UserAccount | null;
    cloudSyncEnabled: boolean;
    syncRevision: number;
    lastSyncedRevision: number;
    frozenDays: FreezeDay[];
    setGoals: (goals: Goal[]) => void;
    setCloudSyncEnabled: (enabled: boolean) => void;
    markGoalsSynced: (revision: number) => void;
    addGoal: (title: string, target?: string) => void;
    reorderGoals: (goalIdsInOrder: string[]) => void;
    setSelectedDate: (date: Date) => void;
    updateGoal: (goalId: string, updates: { title?: string; target?: string | null }) => void;
    addTask: (goalId: string, title: string, frequency: Frequency, customFrequency?: CustomFrequency) => void;
    updateTask: (goalId: string, taskId: string, updates: { title?: string; frequency?: Frequency; customFrequency?: CustomFrequency | undefined }) => void;
    reorderTasks: (goalId: string, taskIdsInOrder: string[]) => void;
    deleteTask: (goalId: string, taskId: string) => void;
    toggleTaskCompletion: (goalId: string, taskId: string, date?: Date) => void;
    freezeDay: (date: Date, reason: string) => boolean;
    unfreezeDay: (date: Date) => void;
    isDayFrozen: (date: Date) => boolean;
    getFreezeReason: (date: Date) => string | undefined;
    completionsByDate: () => Record<string, number>;
    deleteGoal: (goalId: string) => void;
    resetAppData: () => void;
    createAccount: (displayName: string, username?: string, email?: string) => void;
    setAccount: (account: UserAccount | null) => void;
}

// Get initial goals based on store mode
const getInitialGoals = (): Goal[] => {
    // If using dev mode, return sample data, otherwise empty
    return CURRENT_MODE === 'DEV' ? getSampleGoals() : [];
};

const reorderItemsByIds = <T extends { id: string }>(items: T[], idsInOrder: string[]): T[] => {
    const itemMap = new Map(items.map((item) => [item.id, item]));
    const reorderedItems = idsInOrder
        .map((id) => itemMap.get(id))
        .filter((item): item is T => Boolean(item));
    const remainingItems = items.filter((item) => !idsInOrder.includes(item.id));

    return [...reorderedItems, ...remainingItems];
};

const buildDirtyGoalState = (goals: Goal[], currentRevision: number) => ({
    goals,
    syncRevision: currentRevision + 1,
});

export const useStore = create<State>()(
    persist(
        (set, get) => ({
            goals: getInitialGoals(), // Dynamic initialization based on store mode
            selectedDate: normalizeDate(new Date()),
            account: null,
            cloudSyncEnabled: false,
            syncRevision: 0,
            lastSyncedRevision: 0,
            frozenDays: [],

            /**
             * This setter is the bridge between remote reads and the existing
             * local-first store. Once we hydrate remote data, Zustand persists
             * it back into AsyncStorage automatically, which keeps a durable
             * offline copy on the device.
             */
            setGoals: (goals) =>
                set({ goals }),

            /**
             * Cloud sync stays disabled for users who already had purely local
             * device data until we build the explicit import flow. That avoids
             * silently uploading existing offline history before the user says
             * yes. New cloud-first users can safely enable this immediately.
             */
            setCloudSyncEnabled: (enabled) =>
                set({ cloudSyncEnabled: enabled }),

            /**
             * The write path is revision-based instead of operation-based for
             * now. Every local goal/task mutation bumps `syncRevision`, and a
             * successful remote flush records the latest synced revision.
             *
             * That gives us a simple offline-first contract:
             * - local edits always win immediately in the UI
             * - AsyncStorage always has the freshest local copy
             * - Supabase catches up to the newest known revision in the
             *   background whenever cloud sync is enabled
             */
            markGoalsSynced: (revision) =>
                set((s) => ({
                    lastSyncedRevision: Math.max(s.lastSyncedRevision, revision),
                })),

            addGoal: (title, target) =>
                set((s) => ({
                    ...buildDirtyGoalState(
                        [
                            ...s.goals,
                            { id: makeId(), title, target, tasks: [], createdAt: Date.now() },
                        ],
                        s.syncRevision
                    ),
                })),
            reorderGoals: (goalIdsInOrder) =>
                set((s) => {
                    return buildDirtyGoalState(
                        reorderItemsByIds(s.goals, goalIdsInOrder),
                        s.syncRevision
                    );
                }),
            setSelectedDate: (date) =>
                set({
                    selectedDate: normalizeDate(date),
                }),
            updateGoal: (goalId, updates) =>
                set((s) => ({
                    ...buildDirtyGoalState(
                        s.goals.map((g) =>
                            g.id === goalId
                                ? {
                                    ...g,
                                    title: updates.title ?? g.title,
                                    target: updates.target === null
                                        ? undefined
                                        : updates.target !== undefined
                                          ? updates.target
                                          : g.target,
                                }
                                : g
                        ),
                        s.syncRevision
                    ),
                })),
            addTask: (goalId, title, frequency, customFrequency) =>
                set((s) => ({
                    ...buildDirtyGoalState(
                        s.goals.map((g) =>
                            g.id === goalId
                                ? {
                                    ...g,
                                    tasks: [
                                        ...g.tasks,
                                        { 
                                            id: makeId(), 
                                            title, 
                                            frequency, 
                                            customFrequency: frequency === "custom" ? customFrequency : undefined,
                                            completions: [] 
                                        },
                                    ],
                                }
                                : g
                        ),
                        s.syncRevision
                    ),
                })),
            updateTask: (goalId, taskId, updates) =>
                set((s) => ({
                    ...buildDirtyGoalState(
                        s.goals.map((g) =>
                            g.id === goalId
                                ? {
                                    ...g,
                                    tasks: g.tasks.map((task) =>
                                        task.id === taskId
                                            ? {
                                                ...task,
                                                title: updates.title ?? task.title,
                                                frequency: updates.frequency ?? task.frequency,
                                                customFrequency: (updates.frequency ?? task.frequency) === "custom"
                                                    ? (updates.customFrequency ?? task.customFrequency)
                                                    : undefined,
                                            }
                                            : task
                                    ),
                                }
                                : g
                        ),
                        s.syncRevision
                    ),
                })),
            reorderTasks: (goalId, taskIdsInOrder) =>
                set((s) => ({
                    ...buildDirtyGoalState(
                        s.goals.map((g) => {
                            if (g.id !== goalId) return g;

                            return {
                                ...g,
                                tasks: reorderItemsByIds(g.tasks, taskIdsInOrder),
                            };
                        }),
                        s.syncRevision
                    ),
                })),
            deleteTask: (goalId, taskId) =>
                set((s) => ({
                    ...buildDirtyGoalState(
                        s.goals.map((g) =>
                            g.id === goalId
                                ? {
                                    ...g,
                                    tasks: g.tasks.filter((task) => task.id !== taskId),
                                }
                                : g
                        ),
                        s.syncRevision
                    ),
                })),
            toggleTaskCompletion: (goalId, taskId, date = new Date()) =>
                set((s) => {
                    const normalizedDate = normalizeDate(date);
                    return buildDirtyGoalState(
                        s.goals.map((g) => {
                            if (g.id !== goalId) return g;
                            return {
                                ...g,
                                tasks: g.tasks.map((t) => {
                                    if (t.id !== taskId) return t;

                                    if (t.frequency === "once") {
                                        return {
                                            ...t,
                                            completions: t.completions.length > 0 ? [] : [normalizedDate],
                                        };
                                    }

                                    const hasCompletion = t.completions.some(completionDate => 
                                        isSameDay(completionDate, normalizedDate)
                                    );
                                    return {
                                        ...t,
                                        completions: hasCompletion
                                            ? t.completions.filter((x) => !isSameDay(x, normalizedDate))
                                            : [...t.completions, normalizedDate],
                                    };
                                }),
                            };
                        }),
                        s.syncRevision
                    );
                }),
            /**
             * Freeze a day with a required reason. Returns true on success,
             * false if the reason is empty/whitespace.
             * Upserting by date key means re-freezing the same day updates the reason.
             */
            freezeDay: (date, reason) => {
                const trimmedReason = reason.trim();
                if (!trimmedReason) return false;
                const dateKey = dateToKey(date);
                set((s) => ({
                    frozenDays: [
                        ...s.frozenDays.filter((fd) => fd.date !== dateKey),
                        { date: dateKey, reason: trimmedReason, createdAt: Date.now() },
                    ],
                    syncRevision: s.syncRevision + 1,
                }));
                return true;
            },

            unfreezeDay: (date) => {
                const dateKey = dateToKey(date);
                set((s) => ({
                    frozenDays: s.frozenDays.filter((fd) => fd.date !== dateKey),
                    syncRevision: s.syncRevision + 1,
                }));
            },

            isDayFrozen: (date) => {
                const dateKey = dateToKey(date);
                return get().frozenDays.some((fd) => fd.date === dateKey);
            },

            getFreezeReason: (date) => {
                const dateKey = dateToKey(date);
                return get().frozenDays.find((fd) => fd.date === dateKey)?.reason;
            },

            completionsByDate: () => {
                const map: Record<string, number> = {};
                for (const g of get().goals) {
                    for (const t of g.tasks) {
                        // Skip "once" frequency tasks - they shouldn't appear in heatmaps
                        if (t.frequency === "once") continue;
                        
                        for (const completionDate of t.completions) {
                            const dateKey = dateToKey(completionDate);
                            map[dateKey] = (map[dateKey] || 0) + 1;
                        }
                    }
                }
                return map;
            },
            deleteGoal: (goalId) => {
                set((s) => ({
                    ...buildDirtyGoalState(
                        s.goals.filter((g) => g.id !== goalId),
                        s.syncRevision
                    ),
                }));
            },
            resetAppData: () => {
                set((s) => ({
                    goals: getInitialGoals(),
                    selectedDate: normalizeDate(new Date()),
                    account: s.account,
                    syncRevision: s.syncRevision + 1,
                }));
            },
            createAccount: (displayName, username, email) => {
                const normalizedAccount = normalizeAccountDraft(displayName, username, email);

                if (!normalizedAccount.displayName) {
                    return;
                }

                set({
                    account: {
                        id: makeId(),
                        displayName: normalizedAccount.displayName,
                        username: normalizedAccount.username,
                        email: normalizedAccount.email,
                        createdAt: Date.now(),
                    },
                });
            },
            setAccount: (account) => {
                set({ account });
            },
        }),
        {
            name: ACTIVE_STORAGE_KEY, // Dynamic storage key based on CURRENT_MODE
            storage: createJSONStorage(() => AsyncStorage),
            // Custom onRehydrateStorage to convert ISO strings back to Date objects
            onRehydrateStorage: () => {
                return (state) => {
                    if (state?.goals) {
                        state.goals = state.goals.map((goal) => normalizeGoal(goal as PersistedGoal));
                    }

                    if (state?.selectedDate) {
                        state.selectedDate = typeof state.selectedDate === "string"
                            ? new Date(state.selectedDate)
                            : state.selectedDate;
                    } else if (state) {
                        state.selectedDate = normalizeDate(new Date());
                    }
                };
            },
        }
    )
);
