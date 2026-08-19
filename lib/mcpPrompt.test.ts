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
      "create_goal",
      "get_goal",
      "log_task_completion",
      "undo_task_completion",
      "list_friends",
      "nudge_friend",
    ]) {
      expect(prompt).toContain(tool);
    }
  });
});
