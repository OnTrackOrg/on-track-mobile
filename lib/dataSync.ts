import { User } from "@supabase/supabase-js";
import { Goal, Task } from "../types";
import {
  LegacyTaskTime,
  normalizeTaskTiming,
  remindersFromLegacyTimes,
} from "../store";
import { makeUuid } from "./ids";
import { supabase } from "./supabase";

type GoalRow = {
  id: string;
  owner_user_id: string;
  title: string;
  target?: string | null;
  position?: number | null;
  created_at?: string | null;
  completed_at?: string | null;
  is_draft?: boolean | null;
  start_day?: string | null;
  due_day?: string | null;
  color?: string | null;
  visibility?: string | null;
};

type TaskRow = {
  id: string;
  goal_id: string;
  title: string;
  frequency: Task["frequency"];
  custom_type?: "weekly" | "monthly" | null;
  custom_target?: number | null;
  custom_weekdays?: number[] | null;
  times_per_day?: number | null;
  // Reminders, stored in the shape of the retired times of day so older
  // builds keep reading them: every entry belled, lead always 0.
  times?: LegacyTaskTime[] | null;
  reminder_lead_min?: number | null;
  once_day?: string | null;
  position?: number | null;
  created_at?: string | null;
};

type CompletionRow = {
  task_id: string;
  completed_by_user_id: string;
  completed_day: string;
};

type ExistingRemoteGraph = {
  goalIds: string[];
  taskIds: string[];
};

export type AccessibleGoals = {
  owned: Goal[];
  // Friends' public goals: read-only, follow + nudge.
  friendsPublic: Goal[];
};

// ponytail: .in() id lists ride the request URL; 150 ids ≈ 6KB keeps every
// query safely under edge URL limits no matter how many tasks accumulate.
const IN_CHUNK_SIZE = 150;

const inChunks = async <R>(
  ids: string[],
  run: (chunk: string[]) => Promise<R[]>,
): Promise<R[]> => {
  const results: R[] = [];
  for (let index = 0; index < ids.length; index += IN_CHUNK_SIZE) {
    results.push(...(await run(ids.slice(index, index + IN_CHUNK_SIZE))));
  }
  return results;
};

const toTimestamp = (value?: string | null): number => {
  if (!value) {
    return Date.now();
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? Date.now() : parsed;
};

const toOptionalTimestamp = (value?: string | null): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? undefined : parsed;
};

const toCompletedAt = (completion: Date): string =>
  Number.isNaN(completion.getTime())
    ? new Date().toISOString()
    : completion.toISOString();

const toCompletedDay = (completion: Date): string => {
  if (Number.isNaN(completion.getTime())) {
    return toCompletedDay(new Date());
  }

  const year = completion.getFullYear();
  const month = String(completion.getMonth() + 1).padStart(2, "0");
  const day = String(completion.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const toDate = (value: string): Date => {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return new Date(value);
  }

  /**
   * Supabase stores completion days as calendar dates without a timezone. Keep
   * them as local calendar days in the app, otherwise users west of UTC see a
   * completion shift to the previous day after rehydrating from the server.
   */
  return new Date(year, month - 1, day);
};

const byPositionThenCreated = (
  left: { position?: number | null; created_at?: string | null },
  right: { position?: number | null; created_at?: string | null },
): number => {
  const leftPosition = left.position ?? Number.MAX_SAFE_INTEGER;
  const rightPosition = right.position ?? Number.MAX_SAFE_INTEGER;

  if (leftPosition !== rightPosition) {
    return leftPosition - rightPosition;
  }

  return toTimestamp(left.created_at) - toTimestamp(right.created_at);
};

// A goal's task list with its OWNER's completions: mine on my goals, my
// friend's on theirs. Nobody else can log on a goal.
const buildTasks = (
  ownerUserId: string,
  taskRows: TaskRow[],
  completionRows: CompletionRow[],
): Task[] => {
  const completionsByTaskId = new Map<string, Date[]>();

  for (const completion of completionRows) {
    if (completion.completed_by_user_id !== ownerUserId) continue;
    const existingDates = completionsByTaskId.get(completion.task_id) ?? [];
    existingDates.push(toDate(completion.completed_day));
    completionsByTaskId.set(completion.task_id, existingDates);
  }

  return [...taskRows].sort(byPositionThenCreated).map((task) => ({
    id: task.id,
    title: task.title,
    frequency: task.frequency,
    customFrequency:
      task.frequency === "custom" && task.custom_type && task.custom_target
        ? {
            type: task.custom_type,
            target: task.custom_target,
            weekdays:
              task.custom_type === "weekly" &&
              task.custom_weekdays &&
              task.custom_weekdays.length > 0
                ? task.custom_weekdays
                : undefined,
          }
        : undefined,
    ...normalizeTaskTiming(task.frequency, {
      timesPerDay: task.times_per_day ?? undefined,
      reminders: remindersFromLegacyTimes(
        task.times,
        task.reminder_lead_min ?? 0,
      ),
      onDay: task.once_day ?? undefined,
    }),
    completions: completionsByTaskId.get(task.id) ?? [],
  }));
};

const buildGoals = (
  goalRows: GoalRow[],
  taskRows: TaskRow[],
  completionRows: CompletionRow[],
): Goal[] => {
  const tasksByGoalId = new Map<string, TaskRow[]>();
  for (const task of taskRows) {
    const existingTasks = tasksByGoalId.get(task.goal_id) ?? [];
    existingTasks.push(task);
    tasksByGoalId.set(task.goal_id, existingTasks);
  }

  return [...goalRows].sort(byPositionThenCreated).map((goal) => ({
    id: goal.id,
    title: goal.title,
    target: goal.target ?? undefined,
    createdAt: toTimestamp(goal.created_at),
    completedAt: toOptionalTimestamp(goal.completed_at),
    isDraft: goal.is_draft ? true : undefined,
    startDay: goal.start_day ?? undefined,
    dueDay: goal.due_day ?? undefined,
    color: goal.color ?? undefined,
    isPublic: goal.visibility === "public" ? true : undefined,
    ownerUserId: goal.owner_user_id,
    tasks: buildTasks(
      goal.owner_user_id,
      tasksByGoalId.get(goal.id) ?? [],
      completionRows,
    ),
  }));
};

type CompletionInsertRow = {
  id: string;
  task_id: string;
  completed_by_user_id: string;
  completed_at: string;
  completed_day: string;
  occurrence: number;
};

/** The schedule columns of a tasks row, shared by every task upsert. */
export const taskScheduleColumns = (task: Task) => ({
  frequency: task.frequency,
  custom_type: task.customFrequency?.type ?? null,
  custom_target: task.customFrequency?.target ?? null,
  custom_weekdays: task.customFrequency?.weekdays ?? null,
  times_per_day: task.timesPerDay ?? 1,
  times: task.reminders?.map((at) => ({ at, remind: true })) ?? null,
  reminder_lead_min: 0,
  once_day: task.onDay ?? null,
});

// One row per logged dose: (task, day, occurrence), occurrences numbered
// from 0 within each day.
const buildCompletionPayload = (
  tasks: Task[],
  userId: string,
): CompletionInsertRow[] => {
  const rows: CompletionInsertRow[] = [];
  const dosesByTaskAndDay = new Map<string, number>();

  for (const task of tasks) {
    for (const completion of task.completions) {
      const completedDay = toCompletedDay(completion);
      const completionKey = `${task.id}:${completedDay}`;
      const occurrence = dosesByTaskAndDay.get(completionKey) ?? 0;
      dosesByTaskAndDay.set(completionKey, occurrence + 1);
      rows.push({
        id: makeUuid(),
        task_id: task.id,
        completed_by_user_id: userId,
        completed_at: toCompletedAt(completion),
        completed_day: completedDay,
        occurrence,
      });
    }
  }

  return rows;
};

/**
 * Read path: one fetch for everything this user can see under RLS (owned
 * goals + friends' public goals), split into the store's two slices. Each
 * goal's tasks carry its owner's completions.
 */
export const fetchAccessibleGoals = async (
  user: User,
): Promise<AccessibleGoals> => {
  const { data: goalRows, error: goalsError } = await supabase
    .from("goals")
    .select(
      "id, owner_user_id, title, target, position, created_at, completed_at, is_draft, start_day, due_day, color, visibility",
    )
    .order("created_at", { ascending: true });

  if (goalsError) {
    throw goalsError;
  }

  const typedGoalRows = (goalRows ?? []) as GoalRow[];

  if (typedGoalRows.length === 0) {
    return { owned: [], friendsPublic: [] };
  }

  const goalIds = typedGoalRows.map((goal) => goal.id);

  const typedTaskRows = await inChunks(goalIds, async (chunk) => {
    const { data: taskRows, error: tasksError } = await supabase
      .from("tasks")
      .select(
        "id, goal_id, title, frequency, custom_type, custom_target, custom_weekdays, times_per_day, times, reminder_lead_min, once_day, position, created_at",
      )
      .in("goal_id", chunk)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (tasksError) {
      throw tasksError;
    }

    return (taskRows ?? []) as TaskRow[];
  });
  const taskIds = typedTaskRows.map((task) => task.id);

  const typedCompletionRows = await inChunks(taskIds, async (chunk) => {
    const { data: completionRows, error: completionsError } = await supabase
      .from("task_completions")
      .select("task_id, completed_by_user_id, completed_day")
      .in("task_id", chunk)
      .order("completed_day", { ascending: true });

    if (completionsError) {
      throw completionsError;
    }

    return (completionRows ?? []) as CompletionRow[];
  });

  const allGoals = buildGoals(
    typedGoalRows,
    typedTaskRows,
    typedCompletionRows,
  );

  return {
    owned: allGoals.filter((goal) => goal.ownerUserId === user.id),
    friendsPublic: allGoals.filter((goal) => goal.ownerUserId !== user.id),
  };
};

const loadExistingRemoteGraph = async (
  user: User,
): Promise<ExistingRemoteGraph> => {
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

  const taskRows = await inChunks(goalIds, async (chunk) => {
    const { data, error: tasksError } = await supabase
      .from("tasks")
      .select("id")
      .in("goal_id", chunk);

    if (tasksError) {
      throw tasksError;
    }

    return (data ?? []) as Array<{ id: string }>;
  });

  return {
    goalIds,
    taskIds: taskRows.map((task) => task.id),
  };
};

/**
 * Write path: upsert my goals and tasks, replace my completion rows on them
 * (delete + reinsert), then delete my remote tasks and goals that no longer
 * exist locally. Everything is scoped to goals I own.
 */
export const replaceRemoteGoalsForUser = async (
  user: User,
  goals: Goal[],
): Promise<void> => {
  const existingGraph = await loadExistingRemoteGraph(user);

  const goalPayload = goals.map((goal, index) => ({
    id: goal.id,
    owner_user_id: user.id,
    title: goal.title,
    target: goal.target ?? null,
    position: index,
    created_at: new Date(goal.createdAt).toISOString(),
    completed_at: goal.completedAt
      ? new Date(goal.completedAt).toISOString()
      : null,
    is_draft: goal.isDraft ?? false,
    start_day: goal.startDay ?? null,
    due_day: goal.dueDay ?? null,
    color: goal.color ?? null,
    visibility: goal.isPublic ? "public" : "private",
  }));

  const taskPayload = goals.flatMap((goal) =>
    goal.tasks.map((task, index) => ({
      id: task.id,
      goal_id: goal.id,
      title: task.title,
      ...taskScheduleColumns(task),
      position: index,
    })),
  );

  if (goalPayload.length > 0) {
    const { error } = await supabase
      .from("goals")
      .upsert(goalPayload, { onConflict: "id" });
    if (error) {
      throw error;
    }
  }

  if (taskPayload.length > 0) {
    const { error } = await supabase
      .from("tasks")
      .upsert(taskPayload, { onConflict: "id" });
    if (error) {
      throw error;
    }
  }

  const localTaskIds = taskPayload.map((task) => task.id);
  const completionScopeTaskIds = Array.from(
    new Set([...existingGraph.taskIds, ...localTaskIds]),
  );

  await inChunks(completionScopeTaskIds, async (chunk) => {
    const { error: deleteCompletionsError } = await supabase
      .from("task_completions")
      .delete()
      .eq("completed_by_user_id", user.id)
      .in("task_id", chunk);

    if (deleteCompletionsError) {
      throw deleteCompletionsError;
    }

    return [];
  });

  const completionPayload = buildCompletionPayload(
    goals.flatMap((goal) => goal.tasks),
    user.id,
  );
  if (completionPayload.length > 0) {
    const { error } = await supabase
      .from("task_completions")
      .insert(completionPayload);
    if (error) {
      throw error;
    }
  }

  const remoteTaskIdsToDelete = existingGraph.taskIds.filter(
    (taskId) => !localTaskIds.includes(taskId),
  );
  await inChunks(remoteTaskIdsToDelete, async (chunk) => {
    const { error } = await supabase.from("tasks").delete().in("id", chunk);
    if (error) {
      throw error;
    }
    return [];
  });

  const localGoalIds = goals.map((goal) => goal.id);
  const remoteGoalIdsToDelete = existingGraph.goalIds.filter(
    (goalId) => !localGoalIds.includes(goalId),
  );
  await inChunks(remoteGoalIdsToDelete, async (chunk) => {
    const { error } = await supabase.from("goals").delete().in("id", chunk);
    if (error) {
      throw error;
    }
    return [];
  });
};

export const deleteRemoteAccountDataForUser = async (
  user: User,
): Promise<void> => {
  /**
   * Every user-scoped table (goals -> tasks -> completions, friendships,
   * template_commitments) references profiles(id) with ON DELETE CASCADE,
   * so one profile delete removes the whole graph.
   */
  const { error: deleteProfileError } = await supabase
    .from("profiles")
    .delete()
    .eq("id", user.id);

  if (deleteProfileError) {
    throw deleteProfileError;
  }
};

export const __internal = {
  buildCompletionPayload,
  buildGoals,
  buildTasks,
  deleteRemoteAccountDataForUser,
  fetchAccessibleGoals,
  loadExistingRemoteGraph,
  replaceRemoteGoalsForUser,
  toDate,
  toCompletedDay,
  toTimestamp,
};
