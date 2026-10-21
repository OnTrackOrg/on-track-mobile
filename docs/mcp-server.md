# OnTrack MCP server

`supabase/functions/ontrack-mcp` exposes OnTrack to MCP clients — ChatGPT
connectors, Claude, and anything else speaking MCP over Streamable HTTP — so
users can ask an AI assistant about their goals, log completions, and nudge
friends.

## How it works

- **Endpoint**: `https://<project-ref>.supabase.co/functions/v1/ontrack-mcp/mcp`
- **Auth**: every MCP request must carry a Supabase user JWT as a bearer
  token. The function validates it with `auth.getUser()` and runs all queries
  through a client scoped to that token, so **row-level security is the only
  authorization layer** — the function holds no service-role key.
- **Sign-in**: Supabase Auth acts as an OAuth 2.1 server (built-in feature,
  Dashboard → Authentication → OAuth Server). MCP clients discover it via the
  `/.well-known/oauth-protected-resource` route this function serves, register
  themselves through dynamic client registration, and send the user through a
  login + consent page.
- **Consent page**: hosted at <https://ontrackorg.github.io/consent/> (repo
  `OnTrackOrg/consent`, generated from `consent.ts` — regenerate and push when
  editing). It can't be served by the function itself: supabase.co rewrites
  Edge Function HTML to `text/plain` unless the project has a custom domain.
  The function's `/consent` route 302-redirects to the hosted page. The same
  repo hosts `icon.png` (a copy of `assets/icon.png`), which the server
  advertises in `serverInfo.icons`.

  Regenerate with (anon key from `supabase projects api-keys`):

  ```bash
  deno eval 'import { consentPage } from "./supabase/functions/ontrack-mcp/consent.ts"; await Deno.writeTextFile("../consent/index.html", consentPage({ supabaseUrl: "https://plwzrlwwqyrcvhaehrzm.supabase.co", anonKey: Deno.env.get("ANON_KEY")! }))'
  ```

- **Sign-in options on the consent page**: email/password, or Sign in with
  Apple through Supabase's web OAuth flow (PKCE; Apple posts back to
  `https://<project-ref>.supabase.co/auth/v1/callback`, which redirects to
  the consent page with `?code=`). The web flow needs more than the native
  app's id-token flow:
  1. Apple Developer → Identifiers → **Services ID** (e.g.
     `com.adamlincodesexpo.ontrack.web`) with Sign In with Apple enabled,
     primary App ID `com.adamlincodesexpo.ontrack`, domain
     `<project-ref>.supabase.co`, return URL
     `https://<project-ref>.supabase.co/auth/v1/callback`.
  2. Apple Developer → Keys → a **Sign in with Apple** key (download the
     `.p8` once; note Key ID and Team ID).
  3. `node scripts/apple-client-secret.mjs --team-id … --key-id …
     --services-id … --key …/AuthKey_….p8` prints the client secret JWT.
     Apple caps it at 6 months — rotate before it expires.
  4. Supabase Auth → Apple provider: put the Services ID **first** in Client
     IDs (the web flow uses the first one; keep the app bundle id and
     `host.exp.Exponent` after it) and paste the JWT as the Secret Key.
  5. `https://ontrackorg.github.io/consent/**` must be in the redirect
     allow list (Authentication → URL Configuration). Done 2026-10-21.

## Tools

| Tool | What it does |
| --- | --- |
| `list_goals` | Own + friends' public goals, with tasks and lifecycle status |
| `get_goal` | One goal in detail: owner, tasks, the owner's last-30-day completions |
| `create_goal` | Create a goal (optionally with tasks, drafts, weekday schedules) |
| `log_task_completion` | Log a task done for a day (own completions only) |
| `undo_task_completion` | Remove a previously logged completion |
| `list_friends` | Accepted friends |
| `nudge_friend` | Push-notification nudge via the `send-nudge` function |
| `search` / `fetch` | ChatGPT connector contract (also used by deep research) |

## Deploying

1. Deploy the function (config.toml already sets `verify_jwt = false` for it):

   ```bash
   supabase functions deploy ontrack-mcp
   ```

2. In the Dashboard → **Authentication → OAuth Server**:
   - Enable the OAuth 2.1 server (beta, free on all plans).
   - Enable **dynamic client registration** (ChatGPT registers itself).
   - The authorization path is appended to the project's **Site URL**
     (Authentication → URL Configuration), so set Site URL to
     `https://ontrackorg.github.io` and the authorization path to
     `/consent/` (trailing slash — GitHub Pages redirects the bare path).
     The app never depends on Site URL (all email flows pass an explicit
     `ontrack://auth/callback` redirect), but `ontrack://auth/callback` must
     stay in the additional redirect URLs allowlist.

## Connecting a client

- **ChatGPT**: Settings → Apps & Connectors → Advanced settings → Developer
  mode on, then Settings → Apps & Connectors → Create: name OnTrack, the
  `/mcp` URL above, OAuth authentication. Upload `assets/icon.png` as the
  connector icon there — ChatGPT shows its own placeholder otherwise and does
  not read `serverInfo.icons`. ChatGPT walks the user through the OnTrack
  sign-in and consent page; the app's Profile → "AI assistant" prompt
  carries the same steps for end users. (Custom connectors require a paid
  ChatGPT plan.)
- **Claude** (web/desktop): Settings → Connectors → Add custom connector with
  the `/mcp` URL.
- **Claude Code**:

  ```bash
  claude mcp add ontrack -t http https://<project-ref>.supabase.co/functions/v1/ontrack-mcp/mcp
  ```

## Local testing

The OAuth browser flow needs the hosted consent URL, but the MCP endpoint
itself accepts any valid Supabase user JWT, so locally you can mint one with
password sign-in and call the endpoint directly:

```bash
supabase start
supabase functions serve ontrack-mcp
# Grab an access_token via /auth/v1/token?grant_type=password, then:
curl -X POST http://127.0.0.1:54321/functions/v1/ontrack-mcp/mcp \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Set `MCP_PUBLIC_SUPABASE_URL` when the function's `SUPABASE_URL` env var (the
internal gateway URL in local dev) differs from the URL browsers and MCP
clients should see in discovery metadata and the consent page.

## Security notes

- No service-role access: a bug in a tool can never show a user rows RLS
  would hide from their own session.
- Write surface is deliberately small: logging/undoing the user's own
  completions on their own goals and sending nudges (which re-checks the
  friendship and that the goal is the friend's public goal, server-side in
  `send-nudge`). Goal/task creation and edits stay
  in the app for now.
- OAuth access tokens are ordinary Supabase JWTs; revoking a connection from
  the OAuth server dashboard stops refresh, and short JWT expiry bounds the
  rest.
