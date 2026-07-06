import { User } from "@supabase/supabase-js";
import { useStore } from "../store";
import { replaceRemoteGoalsForUser } from "./dataSync";

/**
 * Tasks the flush reported as inaccessible (removed from the goal, or the
 * owner deleted them) are pruned from the shared slice so they stop
 * rendering and stop riding future flushes (social-model.md invariant 2).
 */
export const pruneDroppedTaskIds = (droppedTaskIds: string[]): void => {
  if (droppedTaskIds.length === 0) {
    return;
  }
  const dropped = new Set(droppedTaskIds);
  useStore.setState((s) => ({
    sharedGoals: s.sharedGoals.map((goal) => ({
      ...goal,
      tasks: goal.tasks.filter((task) => !dropped.has(task.id)),
    })),
  }));
};

/**
 * The one import flow shared by both entry points (the first-login
 * ImportLocalDataScreen and Settings > Import local data). Explicit by
 * design: local-only history is only uploaded after the user says yes.
 * Reads the store at call time so it never flushes a stale render snapshot.
 */
export const importLocalDataToCloud = async (user: User): Promise<void> => {
  const s = useStore.getState();
  const revisionToSync = s.syncRevision;

  const { droppedTaskIds } = await replaceRemoteGoalsForUser(
    user,
    s.goals,
    s.sharedGoals,
  );

  pruneDroppedTaskIds(droppedTaskIds);
  s.setCloudSyncEnabled(true);
  s.markGoalsSynced(revisionToSync);
};
