# App Store Submission Checklist

This repository now avoids the main repo-side review risks for the current app:

- Production builds no longer ship seeded demo data.
- Internal debug storage tools are hidden from release builds.
- The app includes an in-app Privacy & Data screen.
- Account deletion removes local app data and synced OnTrack account data.

Manual items still required before submitting to App Review:

- Add a real privacy policy URL in App Store Connect metadata.
- Add real support contact information and a Support URL.
- Set your final iOS bundle identifier, signing, and build metadata before creating the App Store build.
- Capture screenshots from the production build, not from development mode.
- Answer the age rating questionnaire accurately. Based on the current source audit, `4+` is the likely result, but confirm in App Store Connect.
- Test the release build on a physical iPhone and iPad through TestFlight for layout, persistence, and navigation.
- Verify the hosted privacy policy describes Supabase account auth, cloud sync, and optional local notifications.
- Deploy the `delete-account` Supabase Edge Function before submitting any build with account deletion enabled.
- If you add analytics, ads, purchases, or sharing later, update the privacy policy, App Privacy answers, and review notes before submission.

Recommended App Review notes for this version:

- Account sign-in is required for cloud sync and backup.
- No in-app purchases or subscriptions.
- No user-generated content.
- Habit data is stored locally for offline use and synced to the user's OnTrack account through Supabase.
