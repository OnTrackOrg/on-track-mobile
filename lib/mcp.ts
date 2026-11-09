/** The deployed OnTrack MCP endpoint, ready to paste into a client’s URL field. */
export const mcpEndpointForSupabaseUrl = (supabaseUrl: string): string =>
  `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/ontrack-mcp/mcp`;
