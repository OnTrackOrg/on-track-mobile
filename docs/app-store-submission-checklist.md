# App Store Submission Checklist

This repository now avoids the main repo-side review risks for the current app:

- Production builds no longer ship seeded demo data.
- Internal debug storage tools are hidden from release builds.
- The app includes an in-app Privacy & Data screen.
- Account deletion removes local app data, synced account data, friendships, memberships, and template commitments.

## User-generated and social content (App Review Guideline 1.2)

The app now includes social features: friend requests, shared goals (member names and completion activity are visible to other members), and a public goal template catalog.

- Templates are curated (no user publishing path in the app), which limits UGC exposure, but usernames and display names are user-entered and visible to other users via search and shared goals.
- There is currently NO in-app mechanism to report or block another user. Guideline 1.2 expects filtering, reporting, blocking, and published contact info for apps with user-generated content. Pre-submission TODO: add block/report (or at minimum unfriend plus a support contact for abuse reports, and be ready to justify scope to App Review).
- Username/display-name moderation is another 1.2 consideration; document the plan (manual takedown via support) in review notes.

## Manual items still required before submitting

- Add a real privacy policy URL in App Store Connect metadata.
- Add real support contact information and a Support URL.
- Set your final iOS bundle identifier, signing, and build metadata before creating the App Store build.
- Capture screenshots from the production build, not from development mode.
- Answer the age rating questionnaire accurately, accounting for user interaction (social features usually push the "unrestricted web/user interaction" questions; confirm in App Store Connect).
- App Privacy answers must now cover the social graph: email, username, display name, friendships, shared-goal membership, and completion activity visible to goal members, all linked to identity. Not just "habit data synced for backup".
- Test the release build on a physical iPhone and iPad through TestFlight for layout, persistence, and navigation.
- Verify the hosted privacy policy describes Supabase account auth, cloud sync, social features (friends, shared goals, people search), and optional local notifications.
- Deploy the `delete-account` Supabase Edge Function before submitting any build with account deletion enabled.
- If you add analytics, ads, or purchases later, update the privacy policy, App Privacy answers, and review notes before submission.

## Recommended App Review notes for this version

- An account is required; sign-in gates the whole app.
- No in-app purchases or subscriptions.
- Social features: users can send/accept friend requests and share goals with friends. Cross-user visibility is limited to username, display name, and shared-goal completion activity.
- Goal templates are curated by the developer; users cannot publish content to the catalog.
- Reporting/blocking is handled via the support contact for this version (see TODO above).
- Habit data is stored locally for offline use and synced to the user's OnTrack account through Supabase.
