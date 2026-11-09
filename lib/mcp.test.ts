import { mcpEndpointForSupabaseUrl } from "./mcp";

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
