# Social model (Turn 3)

How OnTrack's social features work: friends, shared goals, public goal
templates, and the sync rules that keep multi-user data safe. This supersedes
the single-owner model described in `account-sync-foundation.md`.

## Concepts

- **Friendship**: one row per pair in `friendships`. `pending` (request) or
  `accepted`. Decline, cancel, and unfriend are all row deletion; there is no
  denied/tombstone state. Accepting can only flip `status` (column-level
  grant), never the participants.
- **Shared goal**: a normal goal plus `goal_memberships` rows. Only existing
  friends can be invited, and inviting adds the member immediately (no
  invite/accept handshake). Members complete tasks; only the owner edits the
  goal/tasks or completes/deletes the goal. Members can leave; owners can
  remove members.
- **Public goal template**: a curated row in `goal_templates` (title,
  tagline, author, jsonb task snapshots). Not a goal row: browsing templates
  can never expose anyone's activity, and templates never enter a device's
  sync graph. Committing copies the template into a normal private goal on
  the client and records a `template_commitments` row; committed totals are
  read from the `template_commit_counts` view (individual commitment rows are
  visible only to their owner).
- **Profile visibility**: `profiles` is self-only under RLS. All cross-user
  display (search, avatars, friends list) reads the 3-column
  `public_profiles` view (id, username, display_name), so `profiles.email`
  is structurally unreachable by other users. People search and mutual-friend
  counts go through the `search_people(text)` / `mutual_friends_count(uuid)`
  definer functions. All of these are revoked from `anon`.

## Client data model

`Task.completions: Date[]` stays exactly what it always was: **the current
user's** completions. Other members' completions arrive as
`Task.memberCompletions: Record<userId, string[]>` (yyyy-MM-dd day keys, the
same encoding as `completed_day`). This keeps every existing selector
(`getGoalProgress`, `getGoalStreak`, heatmaps, freeze days) working untouched
for "me"; member views are computed by swapping completions in via the
`goalAsSeenBy(goal, userId)` adapter and reusing the same selectors.

`Goal` gains `ownerUserId` and `members: GoalMember[]`
(`{userId, username, displayName, isOwner}`; members includes the owner so
avatar rows and "Doing this together" need no special-casing).

The store keeps two slices:

- `goals`: goals I own. Local-first source of truth, synced by the revision
  flush exactly as before.
- `sharedGoals`: goals I'm a member of. Server-authoritative and read-only
  on this device **except** toggling my own completions. Structural edits are
  not offered in the UI and would be rejected by RLS anyway.

## Sync rules (the invariants)

1. **The flush only writes what I own, plus my own completion rows.**
   `replaceRemoteGoalsForUser` upserts/deletes goals and tasks **owned by
   me** only. My completions are flushed (delete+reinsert of _my_ rows) for
   my tasks and shared-goal tasks. `visibility` is never written by sync.
2. **Pre-insert accessibility filter.** Before the completions
   delete+reinsert, one `tasks.select('id').in(taskIds)` drops rows for tasks
   I can no longer see (owner deleted the task, or I was removed from the
   goal). This is what prevents the flush from ever wedging on FK/RLS errors.
   Completions for dropped tasks are also pruned locally.
3. **Never heal by refetch.** A failed flush keeps local state and retries
   (next mutation or app foreground). Replacing local state to "recover"
   from a partial flush is how history gets erased.
4. **Flush before fetch.** No code path may `setGoals(remote)` while
   `syncRevision > lastSyncedRevision`. Hydrate and foreground refresh flush
   first, then fetch.
5. **Hydrate gates on owned goals only.** Shared goals can appear remotely
   with zero action on this device (a friend invited me), so
   `remoteGoals.length > 0` is no longer evidence that this account has cloud
   data: only **owned** remote goals enable cloud sync or replace local
   goals. The import prompt logic keys on owned goals; `sharedGoals` hydrates
   independently whenever there is a session.
6. **Social actions are online one-shots.** Friend requests,
   accept/decline/unfriend, invites, member removal/leave, search, and
   template commits call Supabase directly with optimistic UI where cheap and
   an error toast otherwise. They do not ride the revision flush. Inviting
   from an offline device is unavailable (the goal still gets created
   locally; invite once online).

## Ownership edge cases

- Owner removes a member (or member leaves): the goal disappears from the
  member's `sharedGoals` on their next fetch; their completion rows remain
  but are invisible to them. No orphan adoption.
- Owner deletes a goal: cascades tasks, completions (all members'), and
  memberships. Members lose that history; this is the documented trade-off.
- Owner deletes their account: `auth.users` deletion cascades through
  `profiles` to goals → tasks → completions → friendships → memberships →
  commitments. Shared goals they owned vanish for members.

## "Doing this together" metric

A member's bar is their **8-week adherence**: the mean of
`getGoalProgress(goalAsSeenBy(goal, member), day).percent` over the last 56
days (clamped to the goal's age, minimum 1 day). It matches the goal detail
heatmap's window and reuses the exact frequency semantics of the rest of the
app.

## No local-only mode

The app requires an account: `App.tsx` renders `AuthScreen` whenever there is
no session, so no tab is reachable signed out. The signed-out cards in Search
and Profile are future-proofing only and are currently unreachable. Goal data
is still local-first once signed in; freeze days, theme, reminders, and UI
preferences remain device-local and are never synced.
