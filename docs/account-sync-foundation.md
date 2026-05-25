# Account And Sync Foundation

OnTrack is now account-backed and local-first.

## Current Stance

- A Supabase account is required before entering the main app.
- Goal data is still written locally first so the app remains responsive and offline-tolerant.
- When cloud sync is enabled, local goal data is flushed to Supabase in a last-write-wins model.
- Existing local data is not uploaded silently. The import prompt asks before copying local device data into the account.

## Data Lifecycle

- Sign up creates or refreshes a Supabase Auth user and profile row.
- Goal and task changes update AsyncStorage immediately and then sync in the background.
- Delete Account removes local app data, synced OnTrack rows, and the Supabase Auth user through the `delete-account` Edge Function.

## Follow-Up Boundaries

Safe now:

- Polishing account copy and auth screens.
- Improving import and sync failure handling.
- Adding local UI preferences such as radar mode, consistency mode, reminders, and theme.

Requires a sync/product design pass:

- Shared goals.
- Full web UI parity.
- Multi-user permissions.
- Conflict resolution beyond last-write-wins.
