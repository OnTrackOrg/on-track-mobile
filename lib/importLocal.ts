import { User } from "@supabase/supabase-js";
import { useStore } from "../store";
import { replaceRemoteGoalsForUser } from "./dataSync";

/**
 * The one import flow shared by both entry points (the first-login
 * ImportLocalDataScreen and Settings > Import local data). Explicit by
 * design: local-only history is only uploaded after the user says yes.
 * Reads the store at call time so it never flushes a stale render snapshot.
 */
export const importLocalDataToCloud = async (user: User): Promise<void> => {
  const s = useStore.getState();
  const revisionToSync = s.syncRevision;

  await replaceRemoteGoalsForUser(user, s.goals);
  s.setCloudSyncEnabled(true);
  s.markGoalsSynced(revisionToSync);
};
