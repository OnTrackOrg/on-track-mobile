// OnTrack MCP server.
//
// Exposes each user's goals, tasks, completions, friends, and nudges to MCP
// clients (ChatGPT connectors, Claude, etc.) over Streamable HTTP. Every
// request runs with the caller's own Supabase JWT, so row-level security
// decides what they can see — this function adds no service-role access.
//
// Routes (relative to /functions/v1/ontrack-mcp):
//   POST/GET/DELETE /mcp   MCP endpoint (Streamable HTTP transport)
//   GET /.well-known/oauth-protected-resource
//                          RFC 9728 metadata pointing clients at Supabase
//                          Auth's OAuth 2.1 server for sign-in
//   GET /consent           login + consent page for the OAuth flow (OnTrack
//                          has no web frontend, so it lives here)
import { createClient, SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { McpServer, StreamableHttpTransport } from "npm:mcp-lite@0.8.2";
import { z } from "npm:zod@4";
import { consentPage } from "./consent.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
// SUPABASE_URL is the internal gateway when running locally; hosted, it is
// already the public origin. Override for local end-to-end testing.
const publicSupabaseUrl =
  Deno.env.get("MCP_PUBLIC_SUPABASE_URL") ?? supabaseUrl;
const functionBaseUrl = `${publicSupabaseUrl}/functions/v1/ontrack-mcp`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, mcp-session-id, mcp-protocol-version",
  "Access-Control-Expose-Headers": "mcp-session-id, www-authenticate",
};

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...headers },
  });

const unauthorized = () =>
  json({ error: "Unauthorized" }, 401, {
    "WWW-Authenticate": `Bearer resource_metadata="${functionBaseUrl}/.well-known/oauth-protected-resource"`,
  });

const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

const isDayKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const todayUtc = () => new Date().toISOString().slice(0, 10);

const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface TaskRow {
  id: string;
  title: string;
  frequency: string;
  custom_type: string | null;
  custom_target: number | null;
  custom_weekdays: number[] | null;
  archived_at: string | null;
}

interface GoalRow {
  id: string;
  title: string;
  target: string | null;
  visibility: string;
  is_draft: boolean;
  start_day: string | null;
  due_day: string | null;
  completed_at: string | null;
  created_at: string;
  owner_user_id: string;
  tasks: TaskRow[];
}

const GOAL_COLUMNS =
  "id,title,target,visibility,is_draft,start_day,due_day,completed_at,created_at,owner_user_id," +
  "tasks(id,title,frequency,custom_type,custom_target,custom_weekdays,archived_at)";

const goalStatus = (goal: GoalRow) => {
  if (goal.completed_at) return "achieved";
  if (goal.is_draft) return "draft";
  if (goal.start_day && goal.start_day > todayUtc()) return "scheduled";
  return "active";
};

const describeFrequency = (task: TaskRow) => {
  if (task.frequency !== "custom") return task.frequency;
  if (task.custom_weekdays?.length) {
    return `weekly on ${task.custom_weekdays
      .map((d) => WEEKDAY_NAMES[d] ?? String(d))
      .join(", ")}`;
  }
  const unit = task.custom_type === "monthly" ? "month" : "week";
  return `${task.custom_target ?? "?"} times per ${unit}`;
};

const activeTasks = (goal: GoalRow) =>
  (goal.tasks ?? []).filter((task) => !task.archived_at);

type Profile = { id: string; username: string; display_name: string };

const fetchProfiles = async (db: SupabaseClient, userIds: string[]) => {
  const profiles = new Map<string, Profile>();
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return profiles;
  const { data, error } = await db
    .from("profiles")
    .select("id,username,display_name")
    .in("id", unique);
  if (error) throw new Error(`Could not load profiles: ${error.message}`);
  for (const profile of data ?? []) profiles.set(profile.id, profile);
  return profiles;
};

const displayName = (profiles: Map<string, Profile>, userId: string) =>
  profiles.get(userId)?.display_name ?? "Unknown";

const textResult = (text: string) => ({
  content: [{ type: "text" as const, text }],
});

// ChatGPT's search/fetch contract wants JSON in the text content plus
// structuredContent carrying the same object.
const structuredResult = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  structuredContent: payload as Record<string, unknown>,
});

const goalSummary = async (db: SupabaseClient, user: User, goals: GoalRow[]) => {
  const profiles = await fetchProfiles(
    db,
    goals.map((goal) => goal.owner_user_id),
  );
  return goals.map((goal) => ({
    id: goal.id,
    title: goal.title,
    target: goal.target,
    status: goalStatus(goal),
    visibility: goal.visibility,
    start_day: goal.start_day,
    due_day: goal.due_day,
    mine: goal.owner_user_id === user.id,
    owner:
      goal.owner_user_id === user.id
        ? "me"
        : displayName(profiles, goal.owner_user_id),
    tasks: activeTasks(goal).map((task) => ({
      id: task.id,
      title: task.title,
      frequency: describeFrequency(task),
    })),
  }));
};

const loadVisibleGoals = async (db: SupabaseClient) => {
  const { data, error } = await db
    .from("goals")
    .select(GOAL_COLUMNS)
    .order("position", { ascending: true });
  if (error) throw new Error(`Could not load goals: ${error.message}`);
  return (data ?? []) as unknown as GoalRow[];
};

const buildServer = (db: SupabaseClient, user: User, authorization: string) => {
  const mcp = new McpServer({
    name: "ontrack",
    version: "1.0.0",
    schemaAdapter: (schema) => z.toJSONSchema(schema as z.ZodType),
  });

  mcp.tool("list_goals", {
    description:
      "List the goals visible to the signed-in user: their own goals plus " +
      "goals shared by accepted friends. Each goal includes its tasks and " +
      "lifecycle status (draft, scheduled, active, achieved).",
    inputSchema: z.object({
      status: z
        .enum(["active", "draft", "scheduled", "achieved", "all"])
        .default("all")
        .describe("Only return goals in this lifecycle status."),
    }),
    handler: async (args: { status?: string }) => {
      const goals = await loadVisibleGoals(db);
      const summaries = await goalSummary(db, user, goals);
      const status = args.status ?? "all";
      const filtered =
        status === "all"
          ? summaries
          : summaries.filter((goal) => goal.status === status);
      return structuredResult({ goals: filtered });
    },
  });

  mcp.tool("get_goal", {
    description:
      "Get one goal in detail: tasks with schedules, members, and every " +
      "member's completions from the last 30 days.",
    inputSchema: z.object({
      goal_id: z.string().describe("Goal id (uuid) from list_goals or search."),
    }),
    handler: async (args: { goal_id: string }) => {
      if (!isUuid(args.goal_id)) throw new Error("goal_id must be a uuid");
      const detail = await loadGoalDetail(db, user, args.goal_id);
      return structuredResult(detail);
    },
  });

  mcp.tool("log_task_completion", {
    description:
      "Mark one of the user's tasks as completed for a day. Pass the user's " +
      "local calendar date; it defaults to today in UTC when omitted.",
    inputSchema: z.object({
      task_id: z.string().describe("Task id (uuid) from list_goals/get_goal."),
      day: z
        .string()
        .optional()
        .describe("Calendar day to log, formatted yyyy-MM-dd."),
    }),
    handler: async (args: { task_id: string; day?: string }) => {
      if (!isUuid(args.task_id)) throw new Error("task_id must be a uuid");
      const day = args.day ?? todayUtc();
      if (!isDayKey(day)) throw new Error("day must be formatted yyyy-MM-dd");
      // Allow one day ahead of UTC so users in timezones ahead of UTC can
      // log "today"; anything further is a mistake.
      if (day > addDays(todayUtc(), 1)) {
        throw new Error("day cannot be in the future");
      }
      const { data: task, error: taskError } = await db
        .from("tasks")
        .select("id,title,archived_at,goals(id,title,completed_at)")
        .eq("id", args.task_id)
        .maybeSingle();
      if (taskError) throw new Error(`Could not load task: ${taskError.message}`);
      if (!task) throw new Error("Task not found or not visible to this user");
      if (task.archived_at) throw new Error("This task has been archived");
      const { error } = await db.from("task_completions").insert({
        task_id: args.task_id,
        completed_by_user_id: user.id,
        completed_day: day,
      });
      if (error) {
        if (error.code === "23505") {
          return textResult(`"${task.title}" was already logged for ${day}.`);
        }
        throw new Error(`Could not log completion: ${error.message}`);
      }
      return textResult(`Logged "${task.title}" as completed for ${day}.`);
    },
  });

  mcp.tool("undo_task_completion", {
    description: "Remove a completion the user previously logged for a task.",
    inputSchema: z.object({
      task_id: z.string().describe("Task id (uuid)."),
      day: z
        .string()
        .optional()
        .describe("Day to un-log (yyyy-MM-dd); defaults to today in UTC."),
    }),
    handler: async (args: { task_id: string; day?: string }) => {
      if (!isUuid(args.task_id)) throw new Error("task_id must be a uuid");
      const day = args.day ?? todayUtc();
      if (!isDayKey(day)) throw new Error("day must be formatted yyyy-MM-dd");
      const { data, error } = await db
        .from("task_completions")
        .delete()
        .eq("task_id", args.task_id)
        .eq("completed_by_user_id", user.id)
        .eq("completed_day", day)
        .select("id");
      if (error) throw new Error(`Could not undo completion: ${error.message}`);
      if (!data?.length) {
        return textResult(`No completion of that task was logged for ${day}.`);
      }
      return textResult(`Removed the completion logged for ${day}.`);
    },
  });

  mcp.tool("create_goal", {
    description:
      "Create a new goal owned by the signed-in user, optionally with " +
      "recurring tasks. Use this to draft goals on their behalf — e.g. " +
      "turning 'get ready for a 10k' into a goal with a training cadence. " +
      "Set is_draft when they want to review it before it starts counting.",
    inputSchema: z.object({
      title: z.string().min(1).max(80).describe("Goal title."),
      target: z
        .string()
        .min(1)
        .max(80)
        .optional()
        .describe("Optional measurable target, e.g. '10k under an hour'."),
      is_draft: z
        .boolean()
        .default(false)
        .describe("Park the goal as a draft instead of starting it."),
      start_day: z
        .string()
        .optional()
        .describe(
          "First day tasks are due (yyyy-MM-dd). Omit to start right away; " +
            "ignored for drafts.",
        ),
      due_day: z
        .string()
        .optional()
        .describe("Day to reach the goal by (yyyy-MM-dd)."),
      tasks: z
        .array(
          z.object({
            title: z.string().min(1).max(80),
            frequency: z
              .enum(["once", "daily", "weekly", "custom"])
              .default("daily"),
            custom_type: z
              .enum(["weekly", "monthly"])
              .optional()
              .describe(
                "Required with frequency 'custom' unless custom_weekdays is set.",
              ),
            custom_target: z
              .number()
              .int()
              .min(1)
              .max(31)
              .optional()
              .describe("Times per custom period, e.g. 3 per week."),
            custom_weekdays: z
              .array(z.number().int().min(0).max(6))
              .min(1)
              .max(7)
              .optional()
              .describe(
                "Pin the task to explicit weekdays (0=Sunday..6=Saturday); " +
                  "implies a custom weekly schedule.",
              ),
          }),
        )
        .max(10)
        .default([])
        .describe("Recurring tasks to create with the goal."),
    }),
    handler: async (args: {
      title: string;
      target?: string;
      is_draft?: boolean;
      start_day?: string;
      due_day?: string;
      tasks?: Array<{
        title: string;
        frequency?: "once" | "daily" | "weekly" | "custom";
        custom_type?: "weekly" | "monthly";
        custom_target?: number;
        custom_weekdays?: number[];
      }>;
    }) => {
      for (const day of [args.start_day, args.due_day]) {
        if (day !== undefined && !isDayKey(day)) {
          throw new Error("start_day and due_day must be formatted yyyy-MM-dd");
        }
      }
      if (args.start_day && args.due_day && args.due_day < args.start_day) {
        throw new Error("due_day cannot be before start_day");
      }

      // Validate every task before touching the database so a bad task list
      // never leaves a half-created goal behind.
      const taskRows = (args.tasks ?? []).map((task, index) => {
        const title = task.title.trim();
        if (!title) throw new Error("Task titles cannot be empty");
        const weekdays = task.custom_weekdays
          ? [...new Set(task.custom_weekdays)].sort((a, b) => a - b)
          : null;
        if (weekdays) {
          // Weekday-pinned tasks are stored as custom weekly schedules whose
          // target always equals the number of pinned days.
          return {
            title,
            frequency: "custom",
            custom_type: "weekly",
            custom_target: weekdays.length,
            custom_weekdays: weekdays,
            position: index,
          };
        }
        const frequency = task.frequency ?? "daily";
        if (frequency === "custom") {
          if (!task.custom_type || !task.custom_target) {
            throw new Error(
              `Task "${title}": frequency 'custom' needs custom_type and ` +
                "custom_target (or custom_weekdays)",
            );
          }
          return {
            title,
            frequency,
            custom_type: task.custom_type,
            custom_target: Math.min(
              task.custom_target,
              task.custom_type === "weekly" ? 7 : 31,
            ),
            custom_weekdays: null,
            position: index,
          };
        }
        return {
          title,
          frequency,
          custom_type: null,
          custom_target: null,
          custom_weekdays: null,
          position: index,
        };
      });

      const { data: goal, error } = await db
        .from("goals")
        .insert({
          owner_user_id: user.id,
          title: args.title.trim(),
          target: args.target?.trim() || null,
          is_draft: args.is_draft ?? false,
          start_day: (args.is_draft ? null : args.start_day) ?? null,
          due_day: args.due_day ?? null,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Could not create the goal: ${error.message}`);

      if (taskRows.length > 0) {
        const { error: tasksError } = await db
          .from("tasks")
          .insert(taskRows.map((row) => ({ ...row, goal_id: goal.id })));
        if (tasksError) {
          throw new Error(
            `The goal was created but its tasks failed: ${tasksError.message}`,
          );
        }
      }

      const detail = await loadGoalDetail(db, user, goal.id);
      return structuredResult(detail);
    },
  });

  mcp.tool("list_friends", {
    description:
      "List the user's accepted friends (people whose shared goals they can " +
      "see and nudge).",
    inputSchema: z.object({}),
    handler: async () => {
      const { data, error } = await db
        .from("friendships")
        .select("requester_user_id,addressee_user_id,status,updated_at")
        .eq("status", "accepted");
      if (error) throw new Error(`Could not load friends: ${error.message}`);
      const friendIds = (data ?? []).map((row) =>
        row.requester_user_id === user.id
          ? row.addressee_user_id
          : row.requester_user_id,
      );
      const profiles = await fetchProfiles(db, friendIds);
      const friends = friendIds.map((id) => ({
        user_id: id,
        username: profiles.get(id)?.username ?? null,
        display_name: displayName(profiles, id),
      }));
      return structuredResult({ friends });
    },
  });

  mcp.tool("nudge_friend", {
    description:
      "Send a push-notification nudge to an accepted friend about a goal you " +
      "share with them. Optionally include a short supportive message.",
    inputSchema: z.object({
      recipient_user_id: z
        .string()
        .describe("The friend's user id (uuid) from list_friends."),
      goal_id: z.string().describe("The shared goal's id (uuid)."),
      message: z
        .string()
        .max(200)
        .optional()
        .describe("Optional short message shown in the notification."),
    }),
    handler: async (args: {
      recipient_user_id: string;
      goal_id: string;
      message?: string;
    }) => {
      if (!isUuid(args.recipient_user_id) || !isUuid(args.goal_id)) {
        throw new Error("recipient_user_id and goal_id must be uuids");
      }
      const response = await fetch(`${supabaseUrl}/functions/v1/send-nudge`, {
        method: "POST",
        headers: {
          Authorization: authorization,
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipientUserId: args.recipient_user_id,
          goalId: args.goal_id,
          message: args.message,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : `Nudge failed (${response.status})`,
        );
      }
      return textResult("Nudge sent.");
    },
  });

  // `search` and `fetch` follow ChatGPT's connector contract so the server
  // also works with deep research, which only calls these two tools.
  mcp.tool("search", {
    description:
      "Search the user's visible goals and tasks by keyword. Returns goal " +
      "results; pass a result id to fetch for full detail.",
    inputSchema: z.object({
      query: z.string().describe("Keywords to match against goal and task titles."),
    }),
    handler: async (args: { query: string }) => {
      const needle = args.query.trim().toLowerCase();
      const goals = await loadVisibleGoals(db);
      const summaries = await goalSummary(db, user, goals);
      const matches = needle
        ? summaries.filter(
            (goal) =>
              goal.title.toLowerCase().includes(needle) ||
              (goal.target ?? "").toLowerCase().includes(needle) ||
              goal.tasks.some((task) =>
                task.title.toLowerCase().includes(needle),
              ),
          )
        : summaries;
      return structuredResult({
        results: matches.map((goal) => ({
          id: goal.id,
          title:
            goal.owner === "me"
              ? goal.title
              : `${goal.title} (${goal.owner}'s goal)`,
          url: `ontrack://goal/${goal.id}`,
        })),
      });
    },
  });

  mcp.tool("fetch", {
    description:
      "Fetch the full detail of one goal by id, as returned by search.",
    inputSchema: z.object({
      id: z.string().describe("Goal id (uuid) from a search result."),
    }),
    handler: async (args: { id: string }) => {
      if (!isUuid(args.id)) throw new Error("id must be a uuid");
      const detail = await loadGoalDetail(db, user, args.id);
      const lines = [
        `# ${detail.title}`,
        detail.target ? `Target: ${detail.target}` : null,
        `Status: ${detail.status}`,
        detail.start_day ? `Starts: ${detail.start_day}` : null,
        detail.due_day ? `Due: ${detail.due_day}` : null,
        `Members: ${detail.members.map((m) => m.display_name).join(", ")}`,
        "",
        "## Tasks (completions from the last 30 days)",
        ...detail.tasks.map((task) => {
          const completions = task.completions
            .map((c) => `${c.display_name}: ${c.days.length}x`)
            .join(", ");
          return `- ${task.title} (${task.frequency}) — ${completions || "none"}`;
        }),
      ].filter((line): line is string => line !== null);
      return structuredResult({
        id: detail.id,
        title: detail.title,
        text: lines.join("\n"),
        url: `ontrack://goal/${detail.id}`,
        metadata: { status: detail.status },
      });
    },
  });

  return mcp;
};

const loadGoalDetail = async (
  db: SupabaseClient,
  user: User,
  goalId: string,
) => {
  const { data, error } = await db
    .from("goals")
    .select(GOAL_COLUMNS)
    .eq("id", goalId)
    .maybeSingle();
  if (error) throw new Error(`Could not load goal: ${error.message}`);
  if (!data) throw new Error("Goal not found or not visible to this user");
  const goal = data as unknown as GoalRow;

  const { data: memberships, error: membershipError } = await db
    .from("goal_memberships")
    .select("user_id,role")
    .eq("goal_id", goalId);
  if (membershipError) {
    throw new Error(`Could not load members: ${membershipError.message}`);
  }
  const memberIds = [
    goal.owner_user_id,
    ...(memberships ?? []).map((m) => m.user_id as string),
  ];
  const profiles = await fetchProfiles(db, memberIds);

  const tasks = activeTasks(goal);
  const taskIds = tasks.map((task) => task.id);
  let completions: {
    task_id: string;
    completed_by_user_id: string;
    completed_day: string;
  }[] = [];
  if (taskIds.length) {
    const since = addDays(todayUtc(), -30);
    const { data: rows, error: completionsError } = await db
      .from("task_completions")
      .select("task_id,completed_by_user_id,completed_day")
      .in("task_id", taskIds)
      .gte("completed_day", since)
      .order("completed_day", { ascending: false });
    if (completionsError) {
      throw new Error(
        `Could not load completions: ${completionsError.message}`,
      );
    }
    completions = rows ?? [];
  }

  return {
    id: goal.id,
    title: goal.title,
    target: goal.target,
    status: goalStatus(goal),
    visibility: goal.visibility,
    start_day: goal.start_day,
    due_day: goal.due_day,
    mine: goal.owner_user_id === user.id,
    members: [...new Set(memberIds)].map((id) => ({
      user_id: id,
      display_name: id === user.id ? "me" : displayName(profiles, id),
      is_owner: id === goal.owner_user_id,
    })),
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      frequency: describeFrequency(task),
      completions: memberIds
        .map((memberId) => ({
          user_id: memberId,
          display_name: memberId === user.id ? "me" : displayName(profiles, memberId),
          days: completions
            .filter(
              (row) =>
                row.task_id === task.id &&
                row.completed_by_user_id === memberId,
            )
            .map((row) => row.completed_day),
        }))
        .filter((entry) => entry.days.length > 0),
    })),
  };
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  const path = new URL(request.url).pathname;

  if (path.endsWith("/.well-known/oauth-protected-resource")) {
    return json({
      resource: `${functionBaseUrl}/mcp`,
      authorization_servers: [`${publicSupabaseUrl}/auth/v1`],
      bearer_methods_supported: ["header"],
      scopes_supported: ["openid", "email", "profile"],
    });
  }

  if (path.endsWith("/consent")) {
    // supabase.co rewrites HTML responses to text/plain (anti-phishing), so
    // the page is hosted on GitHub Pages (generated from consent.ts) and this
    // route just forwards there. Serving inline only works behind a custom
    // domain (MCP_CONSENT_URL=inline to opt in).
    const consentUrl =
      Deno.env.get("MCP_CONSENT_URL") ?? "https://ontrackorg.github.io/consent/";
    if (consentUrl !== "inline") {
      const target = new URL(consentUrl);
      for (const [key, value] of new URL(request.url).searchParams) {
        target.searchParams.set(key, value);
      }
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: target.toString() },
      });
    }
    return new Response(
      consentPage({ supabaseUrl: publicSupabaseUrl, anonKey }),
      { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  if (path.endsWith("/mcp")) {
    const authorization = request.headers.get("Authorization") ?? "";
    if (!/^Bearer .+/i.test(authorization)) return unauthorized();
    const db = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error,
    } = await db.auth.getUser();
    if (error || !user) return unauthorized();

    const transport = new StreamableHttpTransport();
    const handler = transport.bind(buildServer(db, user, authorization));
    const response = await handler(request);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
      headers.set(key, value);
    }
    return new Response(response.body, { status: response.status, headers });
  }

  return json({ error: "Not found" }, 404);
});
