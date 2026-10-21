import { buildMcpConnectPrompt, mcpEndpointForSupabaseUrl } from "./mcpPrompt";

describe("mcpEndpointForSupabaseUrl", () => {
  it("appends the function path", () => {
    expect(mcpEndpointForSupabaseUrl("https://abc.supabase.co")).toBe(
      "https://abc.supabase.co/functions/v1/ontrack-mcp/mcp",
    );
  });

  it("tolerates a trailing slash", () => {
    expect(mcpEndpointForSupabaseUrl("https://abc.supabase.co/")).toBe(
      "https://abc.supabase.co/functions/v1/ontrack-mcp/mcp",
    );
  });
});

describe("buildMcpConnectPrompt", () => {
  const prompt = buildMcpConnectPrompt("https://abc.supabase.co");

  it("includes the endpoint, transport, and auth story", () => {
    expect(prompt).toContain(
      "https://abc.supabase.co/functions/v1/ontrack-mcp/mcp",
    );
    expect(prompt).toContain("Streamable HTTP");
    expect(prompt).toContain("OAuth 2.1");
  });

  it("names the exposed tools", () => {
    for (const tool of [
      "list_goals",
      "get_goal",
      "list_completions",
      "create_goal",
      "update_goal",
      "set_goal_achieved",
      "delete_goal",
      "set_goal_order",
      "add_task",
      "update_task",
      "delete_task",
      "set_task_order",
      "log_task_completion",
      "undo_task_completion",
      "backfill_task_completions",
      "list_friends",
      "search_people",
      "send_friend_request",
      "respond_to_friend_request",
      "unfriend",
      "nudge_friend",
      "get_profile",
      "update_profile",
    ]) {
      expect(prompt).toContain(tool);
    }
  });
});
