import { format } from "date-fns";
import { Goal, Task } from "../types";

/** Per-day completion counts for one task (heatmap "count" mode). */
export const taskHeatmapValues = (task: Task): Record<string, number> => {
  const values: Record<string, number> = {};
  for (const date of task.completions) {
    const key = format(date, "yyyy-MM-dd");
    values[key] = (values[key] || 0) + 1;
  }
  return values;
};

/**
 * Ratio of repeating tasks done per day across a task list (heatmap "ratio"
 * mode). Works for any view of a goal, including goalAsSeenBy() member
 * views, so friend heatmaps reuse it unchanged.
 */
export const ratioHeatmapValues = (tasks: Task[]): Record<string, number> => {
  const recurring = tasks.filter((t) => t.frequency !== "once");
  if (recurring.length === 0) return {};
  const tasksByDate: Record<string, Set<string>> = {};
  for (const task of recurring) {
    for (const date of task.completions) {
      const key = format(date, "yyyy-MM-dd");
      (tasksByDate[key] ??= new Set()).add(task.id);
    }
  }
  return Object.fromEntries(
    Object.entries(tasksByDate).map(([key, done]) => [
      key,
      done.size / recurring.length,
    ]),
  );
};

const dayKeyToDate = (key: string): Date => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day); // local calendar day, not UTC
};

/**
 * A goal as one member sees it: their day keys become `completions`, so
 * every selector works unchanged. Unlike store.goalAsSeenBy this never
 * falls back to MY completions — a member with no data shows as empty.
 */
export const goalViewForMember = (goal: Goal, userId: string): Goal => ({
  ...goal,
  tasks: goal.tasks.map((task) => ({
    ...task,
    completions: (task.memberCompletions?.[userId] ?? []).map(dayKeyToDate),
  })),
});
