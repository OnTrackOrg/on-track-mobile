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
  The function's `/consent` route 302-redirects to the hosted page.

## Tools

| Tool | What it does |
| --- | --- |
| `list_goals` | Own + friends' shared goals, with tasks and lifecycle status |
| `get_goal` | One goal in detail: tasks, members, last-30-day completions |
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

- **ChatGPT**: Settings → Apps & Connectors → enable developer mode → create a
  connector with the `/mcp` URL above and OAuth authentication. ChatGPT walks
  the user through the OnTrack sign-in and consent page. (Custom connectors
  require a paid ChatGPT plan.)
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
  completions and sending nudges (which re-checks friendship + shared-goal
  membership server-side in `send-nudge`). Goal/task creation and edits stay
  in the app for now.
- OAuth access tokens are ordinary Supabase JWTs; revoking a connection from
  the OAuth server dashboard stops refresh, and short JWT expiry bounds the
  rest.
