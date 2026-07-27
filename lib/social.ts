import { User } from "@supabase/supabase-js";
import { FriendProfile, FriendRequest, Goal, GoalMember } from "../types";
import { supabase } from "./supabase";

/**
 * Social actions are online one-shots (social-model.md invariant 6): no
 * queues, no retries. Every call either resolves with data or throws; the
 * UI shows the error and the user tries again.
 */

type PublicProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_uri?: string | null;
  bio?: string | null;
  occupation?: string | null;
};

type FriendshipRow = {
  id: string;
  requester_user_id: string;
  addressee_user_id: string;
  status: string;
  created_at: string;
};

const toFriendProfile = (row: PublicProfileRow): FriendProfile => {
  const bio = row.bio?.trim() || undefined;
  const occupation = row.occupation?.trim() || undefined;

  return {
    userId: row.id,
    username: row.username ?? "",
    displayName: row.display_name ?? "Member",
    avatarUri: row.avatar_uri ?? undefined,
    ...(bio ? { bio } : {}),
    ...(occupation ? { occupation } : {}),
  };
};

const fallbackProfile = (userId: string): FriendProfile => ({
  userId,
  username: "",
  displayName: "Member",
});

const requireUserId = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const userId = data.session?.user.id;
  if (!userId) throw new Error("You need to be signed in to do that.");
  return userId;
};

export const fetchSocialGraph = async (
  userId: string,
): Promise<{
  friends: FriendProfile[];
  friendRequests: FriendRequest[];
  sentRequestUserIds: string[];
}> => {
  // RLS already scopes friendships to rows I participate in.
  const { data, error } = await supabase
    .from("friendships")
    .select("id, requester_user_id, addressee_user_id, status, created_at");
  if (error) throw error;

  const rows = (data ?? []) as FriendshipRow[];
  const friendIds = rows
    .filter((row) => row.status === "accepted")
    .map((row) =>
      row.requester_user_id === userId
        ? row.addressee_user_id
        : row.requester_user_id,
    );
  const pendingIncoming = rows.filter(
    (row) => row.status === "pending" && row.addressee_user_id === userId,
  );
  // Outgoing pendings so Search can keep showing "Requested" after restart.
  const sentRequestUserIds = rows
    .filter(
      (row) => row.status === "pending" && row.requester_user_id === userId,
    )
    .map((row) => row.addressee_user_id);

  const profileIds = Array.from(
    new Set([
      ...friendIds,
      ...pendingIncoming.map((row) => row.requester_user_id),
    ]),
  );
  const profilesById = new Map<string, FriendProfile>();
  if (profileIds.length > 0) {
    const { data: profileRows, error: profilesError } = await supabase
      .from("public_profiles")
      .select("id, username, display_name, avatar_uri, bio, occupation")
      .in("id", profileIds);
    if (profilesError) throw profilesError;
    for (const row of (profileRows ?? []) as PublicProfileRow[]) {
      profilesById.set(row.id, toFriendProfile(row));
    }
  }

  const friendRequests = await Promise.all(
    pendingIncoming.map(async (row): Promise<FriendRequest> => {
      const { data: mutual, error: mutualError } = await supabase.rpc(
        "mutual_friends_count",
        { other_id: row.requester_user_id },
      );
      if (mutualError) throw mutualError;
      return {
        friendshipId: row.id,
        requester:
          profilesById.get(row.requester_user_id) ??
          fallbackProfile(row.requester_user_id),
        mutualFriends: typeof mutual === "number" ? mutual : 0,
        createdAt: new Date(row.created_at).getTime(),
      };
    }),
  );

  return {
    friends: friendIds.map((id) => profilesById.get(id) ?? fallbackProfile(id)),
    friendRequests,
    sentRequestUserIds,
  };
};

export const sendFriendRequest = async (addresseeId: string): Promise<void> => {
  const requesterId = await requireUserId();
  const { error } = await supabase.from("friendships").insert({
    requester_user_id: requesterId,
    addressee_user_id: addresseeId,
    status: "pending",
  });
  if (error) throw error;
};

export const acceptFriendRequest = async (
  friendshipId: string,
): Promise<void> => {
  const { data, error } = await supabase
    .from("friendships")
    .update({ status: "accepted" })
    .eq("id", friendshipId)
    .select("id");
  if (error) throw error;
  // Zero rows means the requester canceled (or it was already handled);
  // PostgREST reports that as success, so check instead of ghost-accepting.
  if ((data ?? []).length === 0) {
    throw new Error("This request is no longer available.");
  }
};

// Decline, cancel, and unfriend are all row deletion; no tombstone state.
export const declineFriendRequest = async (
  friendshipId: string,
): Promise<void> => {
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId);
  if (error) throw error;
};

export const unfriend = (friendshipId: string): Promise<void> =>
  declineFriendRequest(friendshipId);

export type PersonSearchResult = FriendProfile & { mutualFriends: number };

export const searchPeople = async (
  q: string,
): Promise<PersonSearchResult[]> => {
  const { data, error } = await supabase.rpc("search_people", {
    search_text: q,
  });
  if (error) throw error;

  type SearchRow = PublicProfileRow & { mutual_friends: number | null };
  return ((data ?? []) as SearchRow[]).map((row) => ({
    ...toFriendProfile(row),
    mutualFriends: row.mutual_friends ?? 0,
  }));
};

/**
 * Invite an existing friend to a goal I own. The goal + tasks are upserted
 * first so invites from a never-synced goal work; the membership insert then
 * cannot hit a missing goal. Goal/task ids are UUIDs from birth, so nothing
 * is remapped and the caller's local copy stays valid; adopt the new member
 * locally with `addMemberToGoal`.
 */
export const inviteFriendToGoal = async (
  goal: Goal,
  friendUserId: string,
  user: User,
): Promise<void> => {
  // Same field mapping as the sync flush; position omitted so an existing
  // row keeps its ordering (new rows get the column default until the next
  // full flush).
  const { error: goalError } = await supabase.from("goals").upsert(
    {
      id: goal.id,
      owner_user_id: user.id,
      title: goal.title,
      target: goal.target ?? null,
      created_at: new Date(goal.createdAt).toISOString(),
      completed_at: goal.completedAt
        ? new Date(goal.completedAt).toISOString()
        : null,
      is_draft: goal.isDraft ?? false,
      start_day: goal.startDay ?? null,
      due_day: goal.dueDay ?? null,
    },
    { onConflict: "id" },
  );
  if (goalError) throw goalError;

  if (goal.tasks.length > 0) {
    const { error: tasksError } = await supabase.from("tasks").upsert(
      goal.tasks.map((task, index) => ({
        id: task.id,
        goal_id: goal.id,
        title: task.title,
        frequency: task.frequency,
        custom_type: task.customFrequency?.type ?? null,
        custom_target: task.customFrequency?.target ?? null,
        position: index,
      })),
      { onConflict: "id" },
    );
    if (tasksError) throw tasksError;
  }

  const { error: membershipError } = await supabase
    .from("goal_memberships")
    .insert({ goal_id: goal.id, user_id: friendUserId, role: "editor" });
  if (membershipError) {
    // Recoverable edge states get plain language, not raw Postgres/RLS text.
    if (membershipError.code === "23505") {
      throw new Error("They're already in this goal.");
    }
    if (membershipError.code === "42501") {
      throw new Error("You can only invite friends.");
    }
    throw membershipError;
  }
};

/**
 * Merge a just-invited friend into the local copy of an owned goal: append
 * the member (seeding the owner entry when the goal was never shared) and
 * give the friend an empty memberCompletions entry on every task —
 * goalAsSeenBy relies on that entry existing. Apply this to the CURRENT
 * store goal so completions toggled while the invite was in flight survive.
 */
export const addMemberToGoal = (
  goal: Goal,
  friend: FriendProfile,
  owner: GoalMember,
): Goal => ({
  ...goal,
  ownerUserId: goal.ownerUserId ?? owner.userId,
  members: [
    ...(goal.members?.length ? goal.members : [owner]),
    {
      userId: friend.userId,
      username: friend.username,
      displayName: friend.displayName,
      isOwner: false,
      avatarUri: friend.avatarUri,
    },
  ],
  tasks: goal.tasks.map((task) => ({
    ...task,
    memberCompletions: {
      ...task.memberCompletions,
      [friend.userId]: task.memberCompletions?.[friend.userId] ?? [],
    },
  })),
});

export const removeMember = async (
  goalId: string,
  userId: string,
): Promise<void> => {
  const { error } = await supabase
    .from("goal_memberships")
    .delete()
    .eq("goal_id", goalId)
    .eq("user_id", userId);
  if (error) throw error;
};

export const leaveGoal = (goalId: string, myUserId: string): Promise<void> =>
  removeMember(goalId, myUserId);
