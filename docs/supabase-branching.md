# Supabase Branch Safety

OnTrack treats `main` as the only branch allowed to target production Supabase resources.

## Required Dashboard Setup

Configure Supabase Branching and GitHub integration in the Supabase dashboard so preview branches use isolated database branches instead of the production database.

Minimum production guardrails:

- Production project is linked only to `main`.
- Pull request and feature branch work uses Supabase preview branches.
- Migrations are reviewed in GitHub before they are applied to production.
- The service-role key is never committed and is only available to deployed Supabase Edge Functions.

## Local Agent Rules

- Do not run production database migrations from local development.
- Add schema changes as timestamped SQL files in `supabase/migrations/`.
- Keep Edge Functions under `supabase/functions/` and deploy them through the approved Supabase project workflow.
- For account deletion, deploy `supabase/functions/delete-account` before enabling release builds that expose the Delete Account button.

## Current Repo-Side Safeguards

- The app uses a publishable key only.
- Full Auth user deletion is isolated behind a Supabase Edge Function that needs `SUPABASE_SERVICE_ROLE_KEY` at runtime.
- The completed-goal schema change is represented as a migration instead of an ad hoc dashboard edit.
