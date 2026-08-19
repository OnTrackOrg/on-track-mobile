import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Claude proposes the draft through a forced tool call, so the response is
// structured; the app still sanitizes every field before using it.
const DRAFT_TOOL = {
  name: "propose_goal_draft",
  description:
    "Propose an editable habit-tracking goal draft for the user's described outcome.",
  input_schema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Concise, motivating goal title (max 60 characters)",
      },
      target: {
        type: "string",
        description:
          "Optional short measurable target, e.g. '10k race' or 'B1 level'",
      },
      durationDays: {
        type: "integer",
        minimum: 7,
        maximum: 365,
        description: "Suggested duration for the goal in days",
      },
      tasks: {
        type: "array",
        minItems: 1,
        maxItems: 5,
        description: "Small, actionable recurring tasks",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            frequency: {
              type: "string",
              enum: ["once", "daily", "weekly", "custom"],
            },
            customType: {
              type: "string",
              enum: ["weekly", "monthly"],
              description: "Only for frequency 'custom'",
            },
            customTarget: {
              type: "integer",
              minimum: 1,
              maximum: 31,
              description:
                "Times per period for frequency 'custom', e.g. 3 per week",
            },
            weekdays: {
              type: "array",
              items: { type: "integer", minimum: 0, maximum: 6 },
              description:
                "Explicit weekdays (0=Sunday..6=Saturday) when the user asked for specific days; implies frequency 'custom'",
            },
          },
          required: ["title", "frequency"],
        },
      },
    },
    required: ["title", "tasks"],
  },
} as const;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const authorization = request.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !authorization) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!anthropicKey) {
    return json({ error: "Drafting is not configured" }, 503);
  }

  // Signed-in users only, so the shared Anthropic key can't be farmed
  // anonymously.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return json({ error: "Invalid or expired session" }, 401);
  }

  let payload: { description?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  const description =
    typeof payload.description === "string" ? payload.description.trim() : "";
  if (description.length < 3 || description.length > 500) {
    return json(
      { error: "Describe the goal in 3 to 500 characters" },
      400,
    );
  }

  const anthropic = new Anthropic({ apiKey: anthropicKey });
  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 2048,
      output_config: { effort: "low" },
      tools: [DRAFT_TOOL],
      tool_choice: { type: "tool", name: "propose_goal_draft" },
      messages: [
        {
          role: "user",
          content: [
            "Draft a habit-tracking goal for this desired outcome:",
            `"${description}"`,
            "",
            "Guidelines:",
            "- 2 to 4 small, concrete recurring tasks the user can check off",
            "- 'daily' for anchor habits, 'weekly' for reviews, 'custom' with customType/customTarget for n-times-per-period habits",
            "- use 'weekdays' only when the outcome implies specific days",
            "- keep titles short and encouraging; suggest a realistic durationDays",
          ].join("\n"),
        },
      ],
    });

    const toolUse = response.content.find(
      (block) => block.type === "tool_use",
    );
    if (!toolUse || toolUse.type !== "tool_use") {
      return json({ error: "Could not draft this goal" }, 502);
    }
    return json({ draft: toolUse.input });
  } catch (_error) {
    return json({ error: "Could not draft this goal right now" }, 502);
  }
});
