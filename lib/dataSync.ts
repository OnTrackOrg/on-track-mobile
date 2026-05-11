import { User } from "@supabase/supabase-js";
import { Goal, Task } from "../types";
import { supabase } from "./supabase";

type GoalRow = {
  id: string;
  title: string;
  target?: string | null;
  position?: number | null;
  created_at?: string | null;
};

type TaskRow = {
  id: string;
  goal_id: string;
  title: string;
  frequency: Task["frequency"];
  custom_type?: "weekly" | "monthly" | null;
  custom_target?: number | null;
  position?: number | null;
  created_at?: string | null;
};

type CompletionRow = {
  task_id: string;
  completed_day: string;
};

type ExistingRemoteGraph = {
  goalIds: string[];
  taskIds: string[];
};

type PreparedGoalGraph = {
  goals: Goal[];
  hadLegacyIds: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const toTimestamp = (value?: string | null): number => {
  if (!value) {
    return Date.now();
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? Date.now() : parsed;
};

const isUuid = (value: string): boolean => UUID_PATTERN.test(value);

const makeUuid = (): string => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  /**
   * Fallback for environments where `crypto.randomUUID()` is unavailable.
   * This keeps import-time id upgrades working in tests and older runtimes.
   */
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const randomNibble = Math.floor(Math.random() * 16);
    const value = character === "x" ? randomNibble : (randomNibble & 0x3) | 0x8;
    return value.toString(16);
  });
};

const toCompletedAt = (completion: Date): string => (
  Number.isNaN(completion.getTime()) ? new Date().toISOString() : completion.toISOString()
);

const toDate = (value: string): Date => {
  /**
   * Supabase stores completion days as day-only values. Appending `Z` keeps the
   * conversion stable across local machine time zones, which matters both in
   * tests and when users travel between time zones.
   */
  return new Date(`${value}T00:00:00.000Z`);
};

const buildTasks = (taskRows: TaskRow[], completionRows: CompletionRow[]): Task[] => {
  const completionsByTaskId = new Map<string, Date[]>();

  for (const completion of completionRows) {
    const existingDates = completionsByTaskId.get(completion.task_id) ?? [];
    existingDates.push(toDate(completion.completed_day));
    completionsByTaskId.set(completion.task_id, existingDates);
  }

  return [...taskRows]
    .sort((left, right) => {
      const leftPosition = left.position ?? Number.MAX_SAFE_INTEGER;
      const rightPosition = right.position ?? Number.MAX_SAFE_INTEGER;

      if (leftPosition !== rightPosition) {
        return leftPosition - rightPosition;
      }

      return toTimestamp(left.created_at) - toTimestamp(right.created_at);
    })
    .map((task) => ({
      id: task.id,
      title: task.title,
      frequency: task.frequency,
      customFrequency: task.frequency === "custom" && task.custom_type && task.custom_target
        ? {
            type: task.custom_type,
            target: task.custom_target,
          }
        : undefined,
      completions: completionsByTaskId.get(task.id) ?? [],
    }));
};

const buildGoals = (goalRows: GoalRow[], taskRows: TaskRow[], completionRows: CompletionRow[]): Goal[] => {
  const tasksByGoalId = new Map<string, TaskRow[]>();

  for (const task of taskRows) {
    const existingTasks = tasksByGoalId.get(task.goal_id) ?? [];
    existingTasks.push(task);
    tasksByGoalId.set(task.goal_id, existingTasks);
  }

  return [...goalRows]
    .sort((left, right) => {
      const leftPosition = left.position ?? Number.MAX_SAFE_INTEGER;
      const rightPosition = right.position ?? Number.MAX_SAFE_INTEGER;

      if (leftPosition !== rightPosition) {
        return leftPosition - rightPosition;
      }

      return toTimestamp(left.created_at) - toTimestamp(right.created_at);
    })
    .map((goal) => ({
      id: goal.id,
      title: goal.title,
      target: goal.target ?? undefined,
      createdAt: toTimestamp(goal.created_at),
      tasks: buildTasks(tasksByGoalId.get(goal.id) ?? [], completionRows),
    }));
};

/**
 * Older local-only builds used a short custom id format instead of UUIDs.
 * Supabase now expects UUID primary keys, so any legacy graph must be remapped
 * before it can be uploaded. We do the rewrite here in one pass so the import
 * flow can transparently upgrade existing device-only data.
 */
const prepareGoalsForRemote = (goals: Goal[]): PreparedGoalGraph => {
  const goalIdMap = new Map<string, string>();
  const taskIdMap = new Map<string, string>();
  let hadLegacyIds = false;

  for (const goal of goals) {
    const nextGoalId = isUuid(goal.id) ? goal.id : makeUuid();
    if (nextGoalId !== goal.id) {
      hadLegacyIds = true;
    }
    goalIdMap.set(goal.id, nextGoalId);

    for (const task of goal.tasks) {
      const nextTaskId = isUuid(task.id) ? task.id : makeUuid();
      if (nextTaskId !== task.id) {
        hadLegacyIds = true;
      }
      taskIdMap.set(task.id, nextTaskId);
    }
  }

  return {
    hadLegacyIds,
    goals: goals.map((goal) => ({
      ...goal,
      id: goalIdMap.get(goal.id) ?? goal.id,
      tasks: goal.tasks.map((task) => ({
        ...task,
        id: taskIdMap.get(task.id) ?? task.id,
      })),
    })),
  };
};

/**
 * Read path, phase 1:
 * - fetch the user's remote goal graph from Supabase
 * - normalize it into the exact Goal/Task shape the app already uses
 * - hand that shape back to the Zustand store so AsyncStorage remains the
 *   local offline copy after the store persists the update
 *
 * We intentionally fetch each table separately instead of relying on nested
 * relationship selects. That keeps this slice easier to reason about while the
 * schema is still settling, and it makes later write-queue work simpler because
 * each table will already have its own mapping layer.
 */
export const fetchRemoteGoalsForUser = async (user: User): Promise<Goal[]> => {
  const { data: goalRows, error: goalsError } = await supabase
    .from("goals")
    .select("id, title, target, position, created_at")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: true });

  if (goalsError) {
    throw goalsError;
  }

  const typedGoalRows = (goalRows ?? []) as GoalRow[];

  if (typedGoalRows.length === 0) {
    return [];
  }

  const goalIds = typedGoalRows.map((goal) => goal.id);

  const { data: taskRows, error: tasksError } = await supabase
    .from("tasks")
    .select("id, goal_id, title, frequency, custom_type, custom_target, position, created_at")
    .in("goal_id", goalIds)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (tasksError) {
    throw tasksError;
  }

  const typedTaskRows = (taskRows ?? []) as TaskRow[];
  const taskIds = typedTaskRows.map((task) => task.id);

  const typedCompletionRows = taskIds.length === 0
    ? []
    : await (async () => {
        const { data: completionRows, error: completionsError } = await supabase
          .from("task_completions")
          .select("task_id, completed_day")
          .in("task_id", taskIds)
          .eq("completed_by_user_id", user.id)
          .order("completed_day", { ascending: true });

        if (completionsError) {
          throw completionsError;
        }

        return (completionRows ?? []) as CompletionRow[];
      })();

  return buildGoals(typedGoalRows, typedTaskRows, typedCompletionRows);
};

const loadExistingRemoteGraph = async (user: User): Promise<ExistingRemoteGraph> => {
  const { data: goalRows, error: goalsError } = await supabase
    .from("goals")
    .select("id")
    .eq("owner_user_id", user.id);

  if (goalsError) {
    throw goalsError;
  }

  const goalIds = (goalRows ?? []).map((goal) => goal.id as string);

  if (goalIds.length === 0) {
    return { goalIds: [], taskIds: [] };
  }

  const { data: taskRows, error: tasksError } = await supabase
    .from("tasks")
    .select("id")
    .in("goal_id", goalIds);

  if (tasksError) {
    throw tasksError;
  }

  return {
    goalIds,
    taskIds: (taskRows ?? []).map((task) => task.id as string),
  };
};

/**
 * Write path, phase 1:
 * - treat the local Zustand goal graph as the latest known truth for this user
 * - upsert current goals/tasks into Supabase
 * - rewrite completion rows for the current user's tasks
 * - delete any remote goals/tasks/completions that no longer exist locally
 *
 * This is intentionally a coarse "replace remote graph" strategy. Since Adam
 * explicitly chose last-write-wins, this gives us a reliable first sync model
 * without introducing per-entity conflict resolution yet. Later slices can
 * make the queue more granular once the end-to-end behavior is stable.
 */
export const replaceRemoteGoalsForUser = async (user: User, goals: Goal[]): Promise<PreparedGoalGraph> => {
  const preparedGraph = prepareGoalsForRemote(goals);
  const preparedGoals = preparedGraph.goals;
  const existingGraph = await loadExistingRemoteGraph(user);

  const goalPayload = preparedGoals.map((goal, index) => ({
    id: goal.id,
    owner_user_id: user.id,
    title: goal.title,
    target: goal.target ?? null,
    visibility: "private",
    position: index,
    created_at: new Date(goal.createdAt).toISOString(),
  }));

  const taskPayload = preparedGoals.flatMap((goal) =>
    goal.tasks.map((task, index) => ({
      id: task.id,
      goal_id: goal.id,
      title: task.title,
      frequency: task.frequency,
      custom_type: task.customFrequency?.type ?? null,
      custom_target: task.customFrequency?.target ?? null,
      position: index,
    }))
  );

  const completionPayload = preparedGoals.flatMap((goal) =>
    goal.tasks.flatMap((task) =>
      task.completions.map((completion) => ({
        id: makeUuid(),
        task_id: task.id,
        completed_by_user_id: user.id,
        completed_at: toCompletedAt(completion),
        completed_day: completion.toISOString().slice(0, 10),
      }))
    )
  );

  const localGoalIds = preparedGoals.map((goal) => goal.id);
  const localTaskIds = taskPayload.map((task) => task.id);
  const relevantTaskIds = Array.from(new Set([...existingGraph.taskIds, ...localTaskIds]));

  if (goalPayload.length > 0) {
    const { error } = await supabase.from("goals").upsert(goalPayload, { onConflict: "id" });
    if (error) {
      throw error;
    }
  }

  if (taskPayload.length > 0) {
    const { error } = await supabase.from("tasks").upsert(taskPayload, { onConflict: "id" });
    if (error) {
      throw error;
    }
  }

  if (relevantTaskIds.length > 0) {
    const { error: deleteCompletionsError } = await supabase
      .from("task_completions")
      .delete()
      .eq("completed_by_user_id", user.id)
      .in("task_id", relevantTaskIds);

    if (deleteCompletionsError) {
      throw deleteCompletionsError;
    }
  }

  if (completionPayload.length > 0) {
    const { error } = await supabase.from("task_completions").insert(completionPayload);
    if (error) {
      throw error;
    }
  }

  const remoteTaskIdsToDelete = existingGraph.taskIds.filter((taskId) => !localTaskIds.includes(taskId));
  if (remoteTaskIdsToDelete.length > 0) {
    const { error } = await supabase.from("tasks").delete().in("id", remoteTaskIdsToDelete);
    if (error) {
      throw error;
    }
  }

  const remoteGoalIdsToDelete = existingGraph.goalIds.filter((goalId) => !localGoalIds.includes(goalId));
  if (remoteGoalIdsToDelete.length > 0) {
    const { error } = await supabase.from("goals").delete().in("id", remoteGoalIdsToDelete);
    if (error) {
      throw error;
    }
  }

  if (preparedGoals.length === 0 && existingGraph.goalIds.length > 0) {
    /**
     * When the local graph becomes empty, the deletion blocks above remove the
     * entire remote graph. This branch exists only as explanatory scaffolding,
     * because the meaningful work was already done by the targeted deletes.
     */
    return preparedGraph;
  }

  return preparedGraph;
};

export const __internal = {
  buildGoals,
  buildTasks,
  loadExistingRemoteGraph,
  prepareGoalsForRemote,
  replaceRemoteGoalsForUser,
  toDate,
  toTimestamp,
};
