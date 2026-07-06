import { User } from "@supabase/supabase-js";
import { Goal, GoalMember, Task } from "../types";
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
  completed_by_user_id: string;
  completed_day: string;
};

type MembershipRow = {
  goal_id: string;
  user_id: string;
};

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
};

type ExistingRemoteGraph = {
  goalIds: string[];
  taskIds: string[];
};

export type ReplaceRemoteGoalsResult = {
  // Shared-goal task ids the flush skipped because they are no longer
  // accessible (owner deleted the task, or we were removed from the goal).
  // The caller prunes these locally per social-model.md invariant 2.
  droppedTaskIds: string[];
};

export type AccessibleGoals = {
  owned: Goal[];
  shared: Goal[];
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

const buildTasks = (
  currentUserId: string,
  otherMemberIds: string[],
  taskRows: TaskRow[],
  completionRows: CompletionRow[],
): Task[] => {
  const myCompletionsByTaskId = new Map<string, Date[]>();
  const memberDayKeysByTaskId = new Map<string, Record<string, string[]>>();

  for (const completion of completionRows) {
    if (completion.completed_by_user_id === currentUserId) {
      const existingDates = myCompletionsByTaskId.get(completion.task_id) ?? [];
      existingDates.push(toDate(completion.completed_day));
      myCompletionsByTaskId.set(completion.task_id, existingDates);
    } else {
      const byUser = memberDayKeysByTaskId.get(completion.task_id) ?? {};
      (byUser[completion.completed_by_user_id] ??= []).push(
        completion.completed_day,
      );
      memberDayKeysByTaskId.set(completion.task_id, byUser);
    }
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
          }
        : undefined,
    completions: myCompletionsByTaskId.get(task.id) ?? [],
    // Every other member gets an entry (even when empty) so goalAsSeenBy can
    // distinguish "member with no completions" from "the current user".
    memberCompletions:
      otherMemberIds.length === 0
        ? undefined
        : Object.fromEntries(
            otherMemberIds.map((userId) => [
              userId,
              memberDayKeysByTaskId.get(task.id)?.[userId] ?? [],
            ]),
          ),
  }));
};

const buildGoals = (
  currentUserId: string,
  goalRows: GoalRow[],
  taskRows: TaskRow[],
  completionRows: CompletionRow[],
  membershipRows: MembershipRow[] = [],
  profileRows: ProfileRow[] = [],
): Goal[] => {
  const profilesById = new Map(profileRows.map((row) => [row.id, row]));

  const memberIdsByGoalId = new Map<string, string[]>();
  for (const membership of membershipRows) {
    const existing = memberIdsByGoalId.get(membership.goal_id) ?? [];
    existing.push(membership.user_id);
    memberIdsByGoalId.set(membership.goal_id, existing);
  }

  const tasksByGoalId = new Map<string, TaskRow[]>();
  for (const task of taskRows) {
    const existingTasks = tasksByGoalId.get(task.goal_id) ?? [];
    existingTasks.push(task);
    tasksByGoalId.set(task.goal_id, existingTasks);
  }

  return [...goalRows].sort(byPositionThenCreated).map((goal) => {
    const memberIds = [
      goal.owner_user_id,
      ...(memberIdsByGoalId.get(goal.id) ?? []).filter(
        (userId) => userId !== goal.owner_user_id,
      ),
    ];

    const members: GoalMember[] = memberIds.map((userId) => {
      const profile = profilesById.get(userId);
      return {
        userId,
        username: profile?.username ?? "",
        displayName: profile?.display_name ?? "Member",
        isOwner: userId === goal.owner_user_id,
      };
    });

    const otherMemberIds = memberIds.filter(
      (userId) => userId !== currentUserId,
    );

    return {
      id: goal.id,
      title: goal.title,
      target: goal.target ?? undefined,
      createdAt: toTimestamp(goal.created_at),
      completedAt: toOptionalTimestamp(goal.completed_at),
      ownerUserId: goal.owner_user_id,
      members,
      tasks: buildTasks(
        currentUserId,
        otherMemberIds,
        tasksByGoalId.get(goal.id) ?? [],
        completionRows,
      ),
    };
  });
};

type CompletionInsertRow = {
  id: string;
  task_id: string;
  completed_by_user_id: string;
  completed_at: string;
  completed_day: string;
};

// One row per (task, day); local toggles can transiently hold duplicates.
const buildCompletionPayload = (
  tasks: Task[],
  userId: string,
): CompletionInsertRow[] => {
  const byTaskAndDay = new Map<string, CompletionInsertRow>();

  for (const task of tasks) {
    for (const completion of task.completions) {
      const completedDay = toCompletedDay(completion);
      const completionKey = `${task.id}:${completedDay}`;

      if (!byTaskAndDay.has(completionKey)) {
        byTaskAndDay.set(completionKey, {
          id: makeUuid(),
          task_id: task.id,
          completed_by_user_id: userId,
          completed_at: toCompletedAt(completion),
          completed_day: completedDay,
        });
      }
    }
  }

  return [...byTaskAndDay.values()];
};

/**
 * Read path: one fetch for everything this user can see under RLS (owned
 * goals + goals they are a member of), normalized into the owned/shared
 * split the store keeps. My completion rows become Date[] `completions`;
 * other members' rows become `memberCompletions` day-key maps.
 */
export const fetchAccessibleGoals = async (
  user: User,
): Promise<AccessibleGoals> => {
  const { data: goalRows, error: goalsError } = await supabase
    .from("goals")
    .select(
      "id, owner_user_id, title, target, position, created_at, completed_at",
    )
    .order("created_at", { ascending: true });

  if (goalsError) {
    throw goalsError;
  }

  const typedGoalRows = (goalRows ?? []) as GoalRow[];

  if (typedGoalRows.length === 0) {
    return { owned: [], shared: [] };
  }

  const goalIds = typedGoalRows.map((goal) => goal.id);

  const typedTaskRows = await inChunks(goalIds, async (chunk) => {
    const { data: taskRows, error: tasksError } = await supabase
      .from("tasks")
      .select(
        "id, goal_id, title, frequency, custom_type, custom_target, position, created_at",
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

  const typedMembershipRows = await inChunks(goalIds, async (chunk) => {
    const { data: membershipRows, error: membershipsError } = await supabase
      .from("goal_memberships")
      .select("goal_id, user_id")
      .in("goal_id", chunk);

    if (membershipsError) {
      throw membershipsError;
    }

    return (membershipRows ?? []) as MembershipRow[];
  });

  const profileIds = Array.from(
    new Set([
      ...typedGoalRows.map((goal) => goal.owner_user_id),
      ...typedMembershipRows.map((membership) => membership.user_id),
    ]),
  );

  const typedProfileRows = await inChunks(profileIds, async (chunk) => {
    const { data: profileRows, error: profilesError } = await supabase
      .from("public_profiles")
      .select("id, username, display_name")
      .in("id", chunk);

    if (profilesError) {
      throw profilesError;
    }

    return (profileRows ?? []) as ProfileRow[];
  });

  const allGoals = buildGoals(
    user.id,
    typedGoalRows,
    typedTaskRows,
    typedCompletionRows,
    typedMembershipRows,
    typedProfileRows,
  );

  return {
    owned: allGoals.filter((goal) => goal.ownerUserId === user.id),
    shared: allGoals.filter((goal) => goal.ownerUserId !== user.id),
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
 * Write path per social-model.md invariants 1-2:
 * - goal/task upserts and orphan deletes are scoped to goals OWNED by me
 * - my completion rows are flushed (delete + reinsert) for my tasks AND for
 *   shared-goal tasks; other members' rows are never touched
 * - a pre-insert accessibility check drops completion writes for tasks I can
 *   no longer see, so the flush never wedges on FK/RLS errors; those ids are
 *   returned as droppedTaskIds for local pruning
 */
export const replaceRemoteGoalsForUser = async (
  user: User,
  goals: Goal[],
  sharedGoals: Goal[] = [],
): Promise<ReplaceRemoteGoalsResult> => {
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
  }));

  const taskPayload = goals.flatMap((goal) =>
    goal.tasks.map((task, index) => ({
      id: task.id,
      goal_id: goal.id,
      title: task.title,
      frequency: task.frequency,
      custom_type: task.customFrequency?.type ?? null,
      custom_target: task.customFrequency?.target ?? null,
      position: index,
    })),
  );

  const sharedTasks = sharedGoals.flatMap((goal) => goal.tasks);
  const completionSourceTasks = [
    ...goals.flatMap((goal) => goal.tasks),
    ...sharedTasks,
  ];

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
  const sharedTaskIds = sharedTasks.map((task) => task.id);
  const candidateTaskIds = Array.from(
    new Set([...existingGraph.taskIds, ...localTaskIds, ...sharedTaskIds]),
  );

  // Pre-insert accessibility filter (invariant 2): a select tells us which
  // candidate tasks still exist and are visible under RLS.
  const accessibleTaskIds = new Set(
    (
      await inChunks(candidateTaskIds, async (chunk) => {
        const { data: accessibleRows, error: accessibleError } = await supabase
          .from("tasks")
          .select("id")
          .in("id", chunk);

        if (accessibleError) {
          throw accessibleError;
        }

        return (accessibleRows ?? []) as Array<{ id: string }>;
      })
    ).map((row) => row.id),
  );

  const droppedTaskIds = [
    ...new Set([...localTaskIds, ...sharedTaskIds]),
  ].filter((taskId) => !accessibleTaskIds.has(taskId));

  const deleteScopeTaskIds = candidateTaskIds.filter((taskId) =>
    accessibleTaskIds.has(taskId),
  );
  const completionPayload = buildCompletionPayload(
    completionSourceTasks,
    user.id,
  ).filter((row) => accessibleTaskIds.has(row.task_id));

  await inChunks(deleteScopeTaskIds, async (chunk) => {
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

  return { droppedTaskIds };
};

/**
 * Completions-only flush for users whose owned-goal cloud sync is off
 * (they skipped the import prompt): my completion toggles on shared-goal
 * tasks still have to reach the server (invariant 1) without ever uploading
 * the owned goals the user declined to import. Same delete+reinsert and
 * invariant-2 accessibility filter as the full flush.
 */
export const flushSharedCompletionsForUser = async (
  user: User,
  sharedGoals: Goal[],
): Promise<void> => {
  const sharedTasks = sharedGoals.flatMap((goal) => goal.tasks);
  if (sharedTasks.length === 0) {
    return;
  }

  const taskIds = sharedTasks.map((task) => task.id);
  const accessibleTaskIds = new Set(
    (
      await inChunks(taskIds, async (chunk) => {
        const { data, error } = await supabase
          .from("tasks")
          .select("id")
          .in("id", chunk);
        if (error) {
          throw error;
        }
        return (data ?? []) as Array<{ id: string }>;
      })
    ).map((row) => row.id),
  );

  await inChunks(
    taskIds.filter((taskId) => accessibleTaskIds.has(taskId)),
    async (chunk) => {
      const { error } = await supabase
        .from("task_completions")
        .delete()
        .eq("completed_by_user_id", user.id)
        .in("task_id", chunk);
      if (error) {
        throw error;
      }
      return [];
    },
  );

  const completionPayload = buildCompletionPayload(
    sharedTasks.filter((task) => accessibleTaskIds.has(task.id)),
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
};

export const deleteRemoteAccountDataForUser = async (
  user: User,
): Promise<void> => {
  /**
   * Every user-scoped table (goals -> tasks -> completions, friendships,
   * goal_memberships, template_commitments, plus my completion rows on other
   * people's goals) references profiles(id) with ON DELETE CASCADE, so one
   * profile delete removes the whole graph.
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
