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
    "Once connected you'll have these tools: list_goals, get_goal, create_goal, log_task_completion, undo_task_completion, list_friends, and nudge_friend. Everything runs as my account, so you'll only see data I can already see. When I describe something I want to achieve, you can draft it yourself and save it with create_goal (use is_draft when I should review it first).",
    "",
    "To confirm it works, connect and then list my goals.",
  ].join("\n");
};
