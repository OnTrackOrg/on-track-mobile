import { format } from "date-fns";
import { Task } from "../types";
import { getFullDays } from "../store";

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
 * mode). Works for friends' goals too, whose completions are the owner's.
 */
export const ratioHeatmapValues = (tasks: Task[]): Record<string, number> => {
  const recurring = tasks.filter((t) => t.frequency !== "once");
  if (recurring.length === 0) return {};
  const tasksByDate: Record<string, Set<string>> = {};
  for (const task of recurring) {
    // A multi-dose task only counts on days every dose was logged.
    for (const date of getFullDays(task)) {
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
