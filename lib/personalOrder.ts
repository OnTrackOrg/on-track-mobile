import { Goal } from "../types";

/**
 * A user's private ordering of goals and of the tasks inside each goal.
 *
 * It is an overlay on top of the shared data, never a rewrite of it: ids
 * listed here come first, in this order, and anything not listed (a task a
 * friend just added, a goal created on another device) keeps its default
 * place after them. Ids that no longer exist are skipped, so a stale list can
 * never hide anything. Because it is an overlay, reordering never touches
 * `goals.position` / `tasks.position`, which are shared between the members
 * of a goal, so one member's order is invisible to the others.
 */
export type PersonalOrder = {
  /** Goal ids, top to bottom, across owned and shared goals. */
  goals: string[];
  /** Task ids, top to bottom, keyed by goal id. */
  tasks: Record<string, string[]>;
};

export const EMPTY_PERSONAL_ORDER: PersonalOrder = { goals: [], tasks: {} };

/** Items listed in `orderedIds` first, then the rest in their default order. */
export const applyOrder = <T extends { id: string }>(
  items: readonly T[],
  orderedIds: readonly string[] | undefined,
): T[] => {
  if (!orderedIds || orderedIds.length === 0 || items.length < 2) {
    return [...items];
  }
  const byId = new Map(items.map((item) => [item.id, item] as const));
  const placed = new Set<string>();
  const result: T[] = [];
  for (const id of orderedIds) {
    const item = byId.get(id);
    if (item && !placed.has(id)) {
      placed.add(id);
      result.push(item);
    }
  }
  for (const item of items) {
    if (!placed.has(item.id)) {
      result.push(item);
    }
  }
  return result;
};

/**
 * The goal with its tasks in the user's order. Returns the same object when
 * nothing moves so memoized consumers keep their identity checks.
 */
export const orderGoalTasks = (
  goal: Goal,
  order: PersonalOrder | undefined,
): Goal => {
  const ids = order?.tasks[goal.id];
  if (!ids || ids.length === 0) return goal;
  const tasks = applyOrder(goal.tasks, ids);
  const unchanged = tasks.every((task, index) => task === goal.tasks[index]);
  return unchanged ? goal : { ...goal, tasks };
};

/** Move the id at `from` to `to`, returning a new list. */
export const moveId = (
  ids: readonly string[],
  from: number,
  to: number,
): string[] => {
  const next = [...ids];
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= next.length ||
    to >= next.length
  ) {
    return next;
  }
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

export const isSameIdList = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length && left.every((id, index) => id === right[index]);

const toIdList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string")
    : [];

/**
 * Coerce anything persisted (AsyncStorage from an older build, a Supabase
 * jsonb column) into a well-formed order. Unknown shapes become empty.
 */
export const normalizePersonalOrder = (value: unknown): PersonalOrder => {
  if (!value || typeof value !== "object") return { goals: [], tasks: {} };
  const raw = value as { goals?: unknown; tasks?: unknown };
  const tasks: Record<string, string[]> = {};
  if (raw.tasks && typeof raw.tasks === "object" && !Array.isArray(raw.tasks)) {
    for (const [goalId, ids] of Object.entries(
      raw.tasks as Record<string, unknown>,
    )) {
      const list = toIdList(ids);
      if (list.length > 0) tasks[goalId] = list;
    }
  }
  return { goals: toIdList(raw.goals), tasks };
};
