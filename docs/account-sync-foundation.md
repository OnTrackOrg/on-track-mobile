# Account Foundation

How OnTrack handles auth, sessions, and first-sign-in data import. For goal
sync, sharing, and the multi-user invariants, see `docs/social-model.md`.

## Current stance

- A Supabase account is required before entering the main app. `App.tsx`
  renders `AuthScreen` whenever there is no session.
- Goal data is written locally first (AsyncStorage via the Zustand store) and
  flushed to Supabase in the background.
- Existing local data is never uploaded silently. The import prompt
  (`ImportLocalDataScreen`) asks before copying device data into the account.

## Auth flow (lib/auth.ts, orchestrated in App.tsx)

- **Sign up** creates a Supabase Auth user with display name and username
  metadata; the user verifies their email, then signs in.
- **Deep-link callback**: `ontrack://auth/callback?code=...&type=...` links
  (email verification, password recovery) are handled by
  `handleAuthCallbackUrl`, which calls `exchangeAuthCodeForSession`. A
  `type=recovery` callback routes to `UpdatePasswordScreen`.
- **Session persistence**: `getPersistedSession` restores the auth token pair
  on launch, separately from the Zustand rehydrate. `onAuthStateChange` keeps
  the in-memory session current afterward.
- **Profile row**: every session start runs `ensureProfileForUser`, which
  upserts the `profiles` row and returns the account shown in the app.
- **Password reset** and **verification resend** are one-shot email flows
  from `AuthScreen`.

## Import prompt

Shown when a session exists, cloud sync is not yet enabled, and the device
has local goals. Importing runs the same flush path as normal sync
(`replaceRemoteGoalsForUser`), enables cloud sync, and marks the current
revision synced. Skipping leaves data device-only until the prompt is
accepted or owned cloud data appears.

## Account deletion

Delete Account removes local app data, synced OnTrack rows, and the Supabase
Auth user through the `delete-account` edge function. Auth-user deletion
cascades through `profiles` to goals, tasks, completions, friendships,
memberships, and commitments.
