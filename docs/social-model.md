# Social model

How OnTrack's social features work: friends, public goals, nudges, public
goal templates, and the sync rules that keep each account's data safe.

Shared goals (several members logging on one goal) were retired in Oct 2026
(`20261021000000_retire_shared_goals.sql`): every goal has exactly one owner,
and friends follow each other through public goals. The migration gave each
member their own copy of every shared goal, with their completion history
moved onto it.

## Concepts

- **Friendship**: one row per pair in `friendships`. `pending` (request) or
  `accepted`. Decline, cancel, and unfriend are all row deletion; there is no
  denied/tombstone state. Accepting can only flip `status` (column-level
  grant), never the participants.
- **Public goal**: `goals.visibility = 'public'`. A public goal (its tasks
  and its owner's completions) is readable by all accepted friends of the
  owner, who follow it on the Friends page and nudge. Goals default to
  private; the owner toggles this at creation or from the goal's ⋯ menu. On
  the client it is `Goal.isPublic` and the flush writes `visibility`
  ('public' / 'private'). The store keeps friends' public goals in
  `friendGoals` (read-only, replaced on every fetch).
- **Goal color**: `goals.color` is an optional owner-chosen accent
  (`#rrggbb`); NULL keeps the id-derived color (`utils/goalColors.ts`).
- **Nudge**: a push saying "<name> nudged you" with the goal title, nothing
  else. Allowed from any accepted friend on the owner's public goal. The
  `send-nudge` function logs each delivery in `nudges` and enforces one
  nudge per sender + recipient + goal per hour (429 with
  `retryAfterMinutes`); the client only surfaces the wait when it is hit.
- **Public goal template**: a curated row in `goal_templates` (title,
  tagline, author, jsonb task snapshots). Not a goal row: browsing templates
  can never expose anyone's activity, and templates never enter a device's
  sync graph. Committing copies the template into a normal private goal on
  the client and records a `template_commitments` row; committed totals are
  read from the `template_commit_counts` view (individual commitment rows are
  visible only to their owner).
- **Profile visibility**: `profiles` is self-only under RLS. All cross-user
  display (search, avatars, friends list) reads the `public_profiles` view
  (id, username, display_name, avatar_uri), so `profiles.email` is
  structurally unreachable by other users. People search and mutual-friend
  counts go through the `search_people(text)` / `mutual_friends_count(uuid)`
  definer functions. All of these are revoked from `anon`.
- **Profile photo**: `profiles.avatar_uri` (a small data URI) is the source
  of truth. The device keeps a copy for offline display and one shared store
  (`lib/avatar.ts`) so every screen updates at once. On sign-in the profile
  photo wins, unless a photo picked on this device never finished uploading,
  which is uploaded instead.

## Client data model

`Task.completions: Date[]` holds the goal owner's completions: mine on my
goals, my friend's on theirs. Every selector (`getGoalProgress`,
`getGoalStreak`, heatmaps) works the same on both.

The store keeps two slices:

- `goals`: goals I own. Local-first source of truth, synced by the revision
  flush.
- `friendGoals`: friends' public goals. Server-authoritative and read-only.

## Sync rules (the invariants)

1. **The flush only writes what I own.** `replaceRemoteGoalsForUser`
   upserts/deletes goals and tasks owned by me and replaces my completion
   rows on them (delete + reinsert of my rows only). `visibility` and
   `color` are written like any other column. Only a goal's owner can log
   completions on it (RLS).
2. **Never heal by refetch.** A failed flush keeps local state and retries
   (next mutation or app foreground). Replacing local state to "recover"
   from a partial flush is how history gets erased.
3. **Flush before fetch.** No code path may `setGoals(remote)` while
   `syncRevision > lastSyncedRevision`. Hydrate and foreground refresh flush
   first, then fetch.
4. **Hydrate gates on owned goals.** Only owned remote goals enable cloud
   sync or replace local goals; `friendGoals` is replaced on every fetch.
5. **Social actions are online one-shots.** Friend requests,
   accept/decline/unfriend, search, nudges, and template commits call
   Supabase directly with optimistic UI where cheap and an error toast
   otherwise. They do not ride the revision flush.

## Edge cases

- A friend makes a goal private or unfriends me: it disappears from my
  Friends page on the next fetch.
- A user deletes their account: `auth.users` deletion cascades through
  `profiles` to goals → tasks → completions → friendships → commitments.
- `goal_memberships` is empty and closed (no policies) but still exists so
  builds from before the retirement keep getting an empty, error-free
  answer. Drop it once those builds are gone.

## Sign-in methods

Sign in with Apple (native `signInWithIdToken`, nonce-checked) and Google
(Supabase OAuth in the system browser, PKCE, redirect
`ontrack://auth/callback` or `exp://…/--/auth/callback` in Expo Go) sit
above email + password. Email sign-up asks for nothing but email and
password; display name and username are derived from the email and edited
from Profile. Supabase links a provider sign-in to an existing account
automatically when the verified email matches; Profile → Account also lists
sign-in methods with Link buttons (`linkIdentity`, manual linking enabled
in the auth config) so an email-and-password user can add Apple or Google
without creating a second account. An account can have all three.

## No local-only mode

The app requires an account: `App.tsx` renders `AuthScreen` whenever there is
no session, so no tab is reachable signed out. The signed-out cards in Search
and Profile are future-proofing only and are currently unreachable. Goal data
is still local-first once signed in; theme and UI
preferences remain device-local and are never synced.
