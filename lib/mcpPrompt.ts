/**
 * The copy-paste prompt Profile offers for wiring an AI assistant up to the
 * deployed OnTrack MCP server (supabase/functions/ontrack-mcp). Kept as a
 * pure builder so the wording and URL derivation are testable.
 */

export const mcpEndpointForSupabaseUrl = (supabaseUrl: string): string =>
  `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/ontrack-mcp/mcp`;

export const buildMcpConnectPrompt = (supabaseUrl: string): string => {
  const endpoint = mcpEndpointForSupabaseUrl(supabaseUrl);
  return [
    "Please connect to my OnTrack habit tracker's MCP server so you can help me manage my goals.",
    "",
    "Server details:",
    "- Name: ontrack",
    "- Transport: MCP over Streamable HTTP",
    `- URL: ${endpoint}`,
    "- Auth: OAuth 2.1. The server advertises its authorization server via the standard /.well-known/oauth-protected-resource metadata. Use dynamic client registration and open the sign-in page when prompted so I can log in and approve access.",
    "",
    "If you can't add MCP servers yourself, walk me through adding it in your app instead:",
    "- ChatGPT: Settings → Apps & Connectors → Advanced settings → turn on Developer mode. Then Settings → Apps & Connectors → Create. Name it OnTrack, paste the URL above as the MCP server URL, choose OAuth for authentication, and create it. ChatGPT opens the OnTrack sign-in page; sign in with Apple or email and tap Allow access. In a new chat, add OnTrack from the + menu (Apps / Connectors) to use it. Custom connectors need a paid ChatGPT plan.",
    "- Claude (web or desktop): Settings → Connectors → Add custom connector, paste the URL above, then connect and sign in when prompted.",
    `- Claude Code: run \`claude mcp add ontrack -t http ${endpoint}\`, then use /mcp to sign in.`,
    "",
    "Once connected you'll have tools for everything the app can do: list_goals, get_goal, list_completions, create_goal, update_goal, set_goal_achieved, delete_goal, set_goal_order, add_task, update_task, delete_task, set_task_order, log_task_completion, undo_task_completion, backfill_task_completions, list_friends, search_people, send_friend_request, respond_to_friend_request, unfriend, nudge_friend, get_profile, and update_profile. Everything runs as my account, so you'll only see data I can already see. When I describe something I want to achieve, you can draft it yourself and save it with create_goal (use is_draft when I should review it first). When I tell you about things I already did, backfill them with backfill_task_completions and set the goal's start_day to the earliest day so the history shows. After you change anything, remind me to reopen the app so it refreshes.",
    "",
    "To confirm it works, connect and then list my goals.",
  ].join("\n");
};
