// OnTrack MCP server.
//
// Exposes each user's goals, tasks, completions, friends, and nudges to MCP
// clients (ChatGPT connectors, Claude, etc.) over Streamable HTTP. Every
// request runs with the caller's own Supabase JWT, so row-level security
// decides what they can see — this function adds no service-role access.
//
// The tool set mirrors what the app can do, so an assistant can set a user
// up from scratch and backfill history: create/edit/delete goals and tasks
// (schedules, doses per day, reminders, color, visibility), log or bulk-set
// completions for any past day, reorder, manage friends, and edit the
// profile.
//
// Routes (relative to /functions/v1/ontrack-mcp):
//   POST/GET/DELETE /mcp   MCP endpoint (Streamable HTTP transport)
//   GET /.well-known/oauth-protected-resource
//                          RFC 9728 metadata pointing clients at Supabase
//                          Auth's OAuth 2.1 server for sign-in
//   GET /consent           login + consent page for the OAuth flow (OnTrack
//                          has no web frontend, so it lives here)
import { createClient, SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { McpServer, StreamableHttpTransport } from "npm:mcp-lite@0.10.0";
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
const isClockTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const isHexColor = (value: string) => /^#[0-9a-f]{6}$/.test(value);
// Same rule as account.ts in the app.
const USERNAME_PATTERN = /^(?=.{3,32}$)[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

const todayUtc = () => new Date().toISOString().slice(0, 10);

const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const requireUuid = (value: string, name: string) => {
  if (!isUuid(value)) throw new Error(`${name} must be a uuid`);
};

const requireDay = (value: string, name: string) => {
  if (!isDayKey(value)) throw new Error(`${name} must be formatted yyyy-MM-dd`);
};

// Allow one day ahead of UTC so users in timezones ahead of UTC can log
// "today"; anything further is a mistake.
const requireNotFuture = (day: string) => {
  if (day > addDays(todayUtc(), 1)) throw new Error(`${day} is in the future`);
};

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface TaskRow {
  id: string;
  title: string;
  frequency: string;
  custom_type: string | null;
  custom_target: number | null;
  custom_weekdays: number[] | null;
  times_per_day: number;
  times: { at: string; remind: boolean }[] | null;
  once_day: string | null;
  position: number;
  archived_at: string | null;
}

interface GoalRow {
  id: string;
  title: string;
  target: string | null;
  visibility: string;
  color: string | null;
  is_draft: boolean;
  start_day: string | null;
  due_day: string | null;
  completed_at: string | null;
  created_at: string;
  position: number;
  owner_user_id: string;
  tasks: TaskRow[];
}

const TASK_COLUMNS =
  "id,title,frequency,custom_type,custom_target,custom_weekdays,times_per_day,times,once_day,position,archived_at";
const GOAL_COLUMNS =
  "id,title,target,visibility,color,is_draft,start_day,due_day,completed_at,created_at,position,owner_user_id," +
  `tasks(${TASK_COLUMNS})`;

const goalStatus = (goal: GoalRow) => {
  if (goal.completed_at) return "achieved";
  if (goal.is_draft) return "draft";
  if (goal.start_day && goal.start_day > todayUtc()) return "scheduled";
  return "active";
};

const describeCadence = (task: TaskRow) => {
  if (task.frequency === "once") {
    return task.once_day ? `once, on ${task.once_day}` : "once";
  }
  if (task.frequency !== "custom") return task.frequency;
  if (task.custom_weekdays?.length) {
    return `weekly on ${task.custom_weekdays
      .map((d) => WEEKDAY_NAMES[d] ?? String(d))
      .join(", ")}`;
  }
  const unit = task.custom_type === "monthly" ? "month" : "week";
  return `${task.custom_target ?? "?"} times per ${unit}`;
};

const reminderTimes = (task: TaskRow) =>
  (task.times ?? []).filter((time) => time.remind).map((time) => time.at);

// e.g. "daily, 3 times a day, reminders at 08:00, 21:00". tasks.times holds
// the task's reminder times; unbelled entries are leftovers from when it
// held times of day.
const describeFrequency = (task: TaskRow) => {
  const parts = [describeCadence(task)];
  if (task.times_per_day > 1) parts.push(`${task.times_per_day} times a day`);
  const reminders = reminderTimes(task);
  if (reminders.length > 0) parts.push(`reminders at ${reminders.join(", ")}`);
  return parts.join(", ");
};

// Structured counterpart of describeFrequency, in the same vocabulary the
// task-editing tools accept, so an assistant can read a schedule and write
// it back unchanged.
const taskSchedule = (task: TaskRow) => ({
  frequency: task.frequency,
  custom_type: task.custom_type,
  custom_target: task.custom_target,
  custom_weekdays: task.custom_weekdays,
  times_per_day: task.times_per_day ?? 1,
  reminders: reminderTimes(task),
  once_day: task.once_day,
});

const taskSummary = (task: TaskRow) => ({
  id: task.id,
  title: task.title,
  frequency: describeFrequency(task),
  schedule: taskSchedule(task),
});

const activeTasks = (goal: GoalRow) =>
  (goal.tasks ?? [])
    .filter((task) => !task.archived_at)
    .sort((a, b) => a.position - b.position);

// ---------------------------------------------------------------------------
// Task input normalization (shared by create_goal, add_task, update_task)
// ---------------------------------------------------------------------------

const taskInputSchema = {
  title: z.string().min(1).max(80).describe("Task title."),
  frequency: z
    .enum(["once", "daily", "weekly", "custom"])
    .default("daily")
    .describe(
      "'daily'; 'weekly' (once a week, any day); 'custom' (N times per " +
        "week/month, or pinned weekdays); 'once' (a single to-do).",
    ),
  custom_type: z
    .enum(["weekly", "monthly"])
    .optional()
    .describe("Required with frequency 'custom' unless custom_weekdays is set."),
  custom_target: z
    .number()
    .int()
    .min(1)
    .max(31)
    .optional()
    .describe("Times per custom period, e.g. 3 per week (max 7) or 10 per month (max 31)."),
  custom_weekdays: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7)
    .optional()
    .describe(
      "Pin the task to explicit weekdays (0=Sunday..6=Saturday); implies a " +
        "custom weekly schedule.",
    ),
  times_per_day: z
    .number()
    .int()
    .min(1)
    .max(24)
    .optional()
    .describe("Doses per day for X-a-day habits (default 1). A day counts once all doses are logged."),
  reminders: z
    .array(z.string())
    .max(24)
    .optional()
    .describe("Local-time reminder notifications, formatted HH:mm (24h), e.g. ['08:00','21:00']. Empty array clears them."),
  once_day: z
    .string()
    .optional()
    .describe("For frequency 'once': the day it is due (yyyy-MM-dd)."),
};

type TaskInput = {
  title?: string;
  frequency?: "once" | "daily" | "weekly" | "custom";
  custom_type?: "weekly" | "monthly";
  custom_target?: number;
  custom_weekdays?: number[];
  times_per_day?: number;
  reminders?: string[];
  once_day?: string;
};

type TaskWrite = {
  title?: string;
  frequency?: string;
  custom_type?: string | null;
  custom_target?: number | null;
  custom_weekdays?: number[] | null;
  times_per_day?: number;
  times?: { at: string; remind: boolean }[];
  once_day?: string | null;
};

// Turn the schedule part of a task input into table columns. `partial`
// leaves out anything the caller didn't mention (for updates); otherwise
// every schedule column is set so the row is internally consistent.
const scheduleColumns = (
  task: TaskInput,
  partial: boolean,
  currentFrequency?: string,
): TaskWrite => {
  const write: TaskWrite = {};
  const touchesCadence =
    task.frequency !== undefined ||
    task.custom_type !== undefined ||
    task.custom_target !== undefined ||
    task.custom_weekdays !== undefined;
  if (!partial || touchesCadence) {
    const weekdays = task.custom_weekdays
      ? [...new Set(task.custom_weekdays)].sort((a, b) => a - b)
      : null;
    if (weekdays) {
      // Weekday-pinned tasks are stored as custom weekly schedules whose
      // target always equals the number of pinned days.
      Object.assign(write, {
        frequency: "custom",
        custom_type: "weekly",
        custom_target: weekdays.length,
        custom_weekdays: weekdays,
      });
    } else {
      const frequency = task.frequency ?? (partial ? currentFrequency : "daily") ?? "daily";
      if (frequency === "custom") {
        if (!task.custom_type || !task.custom_target) {
          throw new Error(
            "frequency 'custom' needs custom_type and custom_target (or custom_weekdays)",
          );
        }
        Object.assign(write, {
          frequency,
          custom_type: task.custom_type,
          custom_target: Math.min(
            task.custom_target,
            task.custom_type === "weekly" ? 7 : 31,
          ),
          custom_weekdays: null,
        });
      } else {
        Object.assign(write, {
          frequency,
          custom_type: null,
          custom_target: null,
          custom_weekdays: null,
        });
      }
    }
  }
  const frequency = write.frequency ?? currentFrequency ?? "daily";
  if (task.once_day !== undefined) {
    requireDay(task.once_day, "once_day");
    if (frequency !== "once") {
      throw new Error("once_day only applies to tasks with frequency 'once'");
    }
    write.once_day = task.once_day;
  } else if (!partial || (write.frequency && write.frequency !== "once")) {
    write.once_day = null;
  }
  if (task.times_per_day !== undefined) write.times_per_day = task.times_per_day;
  else if (!partial) write.times_per_day = 1;
  if (task.reminders !== undefined) {
    const unique = [...new Set(task.reminders.map((time) => time.trim()))];
    for (const time of unique) {
      if (!isClockTime(time)) {
        throw new Error(`Reminder "${time}" must be formatted HH:mm (24h)`);
      }
    }
    write.times = unique.sort().map((at) => ({ at, remind: true }));
  } else if (!partial) {
    write.times = [];
  }
  return write;
};

const fullTaskRow = (task: TaskInput, position: number) => {
  const title = task.title?.trim();
  if (!title) throw new Error("Task titles cannot be empty");
  return { title, position, ...scheduleColumns(task, false) };
};

// ---------------------------------------------------------------------------
// Profiles, personal order, ownership checks
// ---------------------------------------------------------------------------

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
};

// public_profiles is the view every signed-in user may read; the profiles
// table itself is owner-only under RLS.
const fetchProfiles = async (db: SupabaseClient, userIds: string[]) => {
  const profiles = new Map<string, Profile>();
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return profiles;
  const { data, error } = await db
    .from("public_profiles")
    .select("id,username,display_name")
    .in("id", unique);
  if (error) throw new Error(`Could not load profiles: ${error.message}`);
  for (const profile of data ?? []) profiles.set(profile.id, profile);
  return profiles;
};

const displayName = (profiles: Map<string, Profile>, userId: string) =>
  profiles.get(userId)?.display_name ?? "Unknown";

type PersonalOrder = { goals: string[]; tasks: Record<string, string[]> };

const loadPersonalOrder = async (
  db: SupabaseClient,
  user: User,
): Promise<PersonalOrder> => {
  const { data, error } = await db
    .from("user_orderings")
    .select("goal_order,task_order")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(`Could not load your order: ${error.message}`);
  const goals = Array.isArray(data?.goal_order)
    ? data.goal_order.filter(isUuid)
    : [];
  const tasks: Record<string, string[]> = {};
  if (data?.task_order && typeof data.task_order === "object") {
    for (const [goalId, ids] of Object.entries(data.task_order)) {
      if (Array.isArray(ids)) tasks[goalId] = ids.filter(isUuid);
    }
  }
  return { goals, tasks };
};

const savePersonalOrder = async (
  db: SupabaseClient,
  user: User,
  order: PersonalOrder,
) => {
  const { error } = await db.from("user_orderings").upsert({
    user_id: user.id,
    goal_order: order.goals,
    task_order: order.tasks,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Could not save your order: ${error.message}`);
};

// Items listed in `orderedIds` first, then the rest in their default order
// (same rule as lib/personalOrder.ts in the app).
const applyOrder = <T extends { id: string }>(
  items: T[],
  orderedIds: string[] | undefined,
): T[] => {
  if (!orderedIds?.length) return items;
  const byId = new Map(items.map((item) => [item.id, item] as const));
  const placed = new Set<string>();
  const result: T[] = [];
  for (const id of orderedIds) {
    const item = byId.get(id);
    if (item && !placed.has(id)) {
      placed.add(id);
      result.push(item);
    }
  }
  for (const item of items) if (!placed.has(item.id)) result.push(item);
  return result;
};

const loadGoalRow = async (db: SupabaseClient, goalId: string) => {
  const { data, error } = await db
    .from("goals")
    .select(GOAL_COLUMNS)
    .eq("id", goalId)
    .maybeSingle();
  if (error) throw new Error(`Could not load goal: ${error.message}`);
  if (!data) throw new Error("Goal not found or not visible to this user");
  return data as unknown as GoalRow;
};

const requireOwnGoal = async (db: SupabaseClient, user: User, goalId: string) => {
  requireUuid(goalId, "goal_id");
  const goal = await loadGoalRow(db, goalId);
  if (goal.owner_user_id !== user.id) {
    throw new Error("You can only change your own goals");
  }
  return goal;
};

type OwnTask = TaskRow & {
  goals: { id: string; title: string; completed_at: string | null; owner_user_id: string };
};

const requireOwnTask = async (db: SupabaseClient, user: User, taskId: string) => {
  requireUuid(taskId, "task_id");
  const { data, error } = await db
    .from("tasks")
    .select(`${TASK_COLUMNS},goals(id,title,completed_at,owner_user_id)`)
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw new Error(`Could not load task: ${error.message}`);
  if (!data) throw new Error("Task not found or not visible to this user");
  const task = data as unknown as OwnTask;
  if (task.goals?.owner_user_id !== user.id) {
    throw new Error("You can only change tasks on your own goals");
  }
  if (task.archived_at) throw new Error("This task has been archived");
  return task;
};

const textResult = (text: string) => ({
  content: [{ type: "text" as const, text }],
});

// ChatGPT's search/fetch contract wants JSON in the text content plus
// structuredContent carrying the same object.
const structuredResult = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  structuredContent: payload as Record<string, unknown>,
});

const goalSummary = async (
  db: SupabaseClient,
  user: User,
  goals: GoalRow[],
  order: PersonalOrder,
) => {
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
    is_public: goal.visibility === "public",
    color: goal.color,
    start_day: goal.start_day,
    due_day: goal.due_day,
    created_at: goal.created_at,
    completed_at: goal.completed_at,
    mine: goal.owner_user_id === user.id,
    owner:
      goal.owner_user_id === user.id
        ? "me"
        : displayName(profiles, goal.owner_user_id),
    tasks: applyOrder(activeTasks(goal), order.tasks[goal.id]).map(taskSummary),
  }));
};

// Own goals in the user's personal order, then friends' goals.
const loadVisibleGoals = async (
  db: SupabaseClient,
  user: User,
  order: PersonalOrder,
) => {
  const { data, error } = await db
    .from("goals")
    .select(GOAL_COLUMNS)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load goals: ${error.message}`);
  const goals = (data ?? []) as unknown as GoalRow[];
  const mine = applyOrder(
    goals.filter((goal) => goal.owner_user_id === user.id),
    order.goals,
  );
  const theirs = goals.filter((goal) => goal.owner_user_id !== user.id);
  return [...mine, ...theirs];
};

const completionsSchema = {
  since: z
    .string()
    .optional()
    .describe("Earliest day to include (yyyy-MM-dd). Default: 30 days ago."),
  until: z
    .string()
    .optional()
    .describe("Latest day to include (yyyy-MM-dd). Default: today."),
};

const completionRange = (args: { since?: string; until?: string }) => {
  const until = args.until ?? addDays(todayUtc(), 1);
  const since = args.since ?? addDays(todayUtc(), -30);
  requireDay(since, "since");
  requireDay(until, "until");
  if (until < since) throw new Error("until cannot be before since");
  return { since, until };
};

// Completion rows for the given tasks, folded to {day, count} per task.
const loadCompletions = async (
  db: SupabaseClient,
  ownerId: string,
  taskIds: string[],
  since: string,
  until: string,
) => {
  const byTask = new Map<string, Map<string, number>>();
  if (taskIds.length === 0) return byTask;
  const { data, error } = await db
    .from("task_completions")
    .select("task_id,completed_day")
    .in("task_id", taskIds)
    .eq("completed_by_user_id", ownerId)
    .gte("completed_day", since)
    .lte("completed_day", until)
    .order("completed_day", { ascending: false });
  if (error) throw new Error(`Could not load completions: ${error.message}`);
  for (const row of data ?? []) {
    const days = byTask.get(row.task_id) ?? new Map<string, number>();
    days.set(row.completed_day, (days.get(row.completed_day) ?? 0) + 1);
    byTask.set(row.task_id, days);
  }
  return byTask;
};

const loadGoalDetail = async (
  db: SupabaseClient,
  user: User,
  goalId: string,
  range?: { since: string; until: string },
) => {
  const goal = await loadGoalRow(db, goalId);
  const profiles = await fetchProfiles(db, [goal.owner_user_id]);
  const order = goal.owner_user_id === user.id
    ? await loadPersonalOrder(db, user)
    : { goals: [], tasks: {} };
  const tasks = applyOrder(activeTasks(goal), order.tasks[goal.id]);
  const { since, until } = range ?? completionRange({});
  const completions = await loadCompletions(
    db,
    goal.owner_user_id,
    tasks.map((task) => task.id),
    since,
    until,
  );

  return {
    id: goal.id,
    title: goal.title,
    target: goal.target,
    status: goalStatus(goal),
    visibility: goal.visibility,
    is_public: goal.visibility === "public",
    color: goal.color,
    start_day: goal.start_day,
    due_day: goal.due_day,
    created_at: goal.created_at,
    completed_at: goal.completed_at,
    mine: goal.owner_user_id === user.id,
    owner:
      goal.owner_user_id === user.id
        ? "me"
        : displayName(profiles, goal.owner_user_id),
    completions_since: since,
    completions_until: until,
    tasks: tasks.map((task) => {
      const days = completions.get(task.id) ?? new Map<string, number>();
      return {
        ...taskSummary(task),
        completed_days: [...days.keys()],
        completions: [...days.entries()].map(([day, count]) => ({ day, count })),
      };
    }),
  };
};

const REOPEN_NOTE =
  " The OnTrack app picks up changes when it is next opened; if the user " +
  "has it open right now, ask them to close and reopen it before making " +
  "changes there.";

const buildServer = (db: SupabaseClient, user: User, authorization: string) => {
  const mcp = new McpServer({
    name: "ontrack",
    version: "1.2.0",
    schemaAdapter: (schema) => z.toJSONSchema(schema as z.ZodType),
  });
  // mcp-lite 0.10 only forwards name/version in `serverInfo`; the MCP spec
  // (2025-11-25) also lets a server advertise a title, website and icons,
  // which clients use for the connector listing. Clients that predate it
  // ignore the extra fields. (ChatGPT's connector icon is uploaded in its own
  // "Manage" dialog, not read from here.)
  (mcp as unknown as { serverInfo: Record<string, unknown> }).serverInfo = {
    name: "ontrack",
    title: "OnTrack",
    version: "1.2.0",
    websiteUrl: "https://ontrackorg.github.io/consent/",
    icons: [
      {
        src: "https://ontrackorg.github.io/consent/icon.png",
        mimeType: "image/png",
        sizes: ["1024x1024"],
      },
    ],
  };

  // Every tool carries a display `title` and the MCP behaviour hints
  // (readOnlyHint / destructiveHint / idempotentHint / openWorldHint). The
  // Claude and ChatGPT/Codex directories require them, and clients use them
  // to decide when to ask the user before calling a tool. (mcp-lite doesn't
  // re-export its ToolAnnotations type, hence the local shape.)
  type ToolAnnotations = {
    readOnlyHint: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint: boolean;
  };

  // A handler that throws (bad input, not found, RLS refusal) is a tool
  // error the assistant should read and act on, so it goes back as an
  // isError result with the message — not as a JSON-RPC "Internal error"
  // with the message buried in a stack trace, which is what mcp-lite does
  // with uncaught exceptions.
  const defineTool = (
    name: string,
    def: {
      title: string;
      annotations: ToolAnnotations;
      description: string;
      // deno-lint-ignore no-explicit-any
      inputSchema: any;
      // deno-lint-ignore no-explicit-any
      handler: (args: any) => Promise<unknown>;
    },
  ) =>
    mcp.tool(name, {
      title: def.title,
      annotations: def.annotations,
      description: def.description,
      inputSchema: def.inputSchema,
      handler: async (args: unknown) => {
        try {
          // deno-lint-ignore no-explicit-any
          return (await def.handler(args)) as any;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { content: [{ type: "text" as const, text: message }], isError: true };
        }
      },
    });

  // ---- Reading --------------------------------------------------------------

  defineTool("list_goals", {
    title: "List goals",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description:
      "List the goals visible to the signed-in user: their own goals (in " +
      "their personal order) plus accepted friends' public goals. Each goal " +
      "includes its tasks with structured schedules and its lifecycle " +
      "status (draft, scheduled, active, achieved).",
    inputSchema: z.object({
      status: z
        .enum(["active", "draft", "scheduled", "achieved", "all"])
        .default("all")
        .describe("Only return goals in this lifecycle status."),
    }),
    handler: async (args: { status?: string }) => {
      const order = await loadPersonalOrder(db, user);
      const goals = await loadVisibleGoals(db, user, order);
      const summaries = await goalSummary(db, user, goals, order);
      const status = args.status ?? "all";
      const filtered =
        status === "all"
          ? summaries
          : summaries.filter((goal) => goal.status === status);
      return structuredResult({ goals: filtered });
    },
  });

  defineTool("get_goal", {
    title: "Get goal",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description:
      "Get one goal in detail: its owner, tasks with schedules, and the " +
      "owner's completions per day (default: the last 30 days; pass since/" +
      "until for other ranges).",
    inputSchema: z.object({
      goal_id: z.string().describe("Goal id (uuid) from list_goals or search."),
      ...completionsSchema,
    }),
    handler: async (args: { goal_id: string; since?: string; until?: string }) => {
      requireUuid(args.goal_id, "goal_id");
      const detail = await loadGoalDetail(db, user, args.goal_id, completionRange(args));
      return structuredResult(detail);
    },
  });

  defineTool("list_completions", {
    title: "List completions",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description:
      "The user's completion history for one goal or one task over a date " +
      "range, as {task_id, day, count} rows (count = doses logged that " +
      "day). Use it to check what is already logged before backfilling.",
    inputSchema: z.object({
      goal_id: z.string().optional().describe("Goal id (uuid); all its tasks."),
      task_id: z.string().optional().describe("Or a single task id (uuid)."),
      ...completionsSchema,
    }),
    handler: async (args: {
      goal_id?: string;
      task_id?: string;
      since?: string;
      until?: string;
    }) => {
      const { since, until } = completionRange(args);
      let taskIds: string[];
      let ownerId = user.id;
      if (args.task_id) {
        requireUuid(args.task_id, "task_id");
        taskIds = [args.task_id];
      } else if (args.goal_id) {
        requireUuid(args.goal_id, "goal_id");
        const goal = await loadGoalRow(db, args.goal_id);
        ownerId = goal.owner_user_id;
        taskIds = activeTasks(goal).map((task) => task.id);
      } else {
        throw new Error("Pass goal_id or task_id");
      }
      const completions = await loadCompletions(db, ownerId, taskIds, since, until);
      const rows: { task_id: string; day: string; count: number }[] = [];
      for (const [taskId, days] of completions) {
        for (const [day, count] of days) rows.push({ task_id: taskId, day, count });
      }
      rows.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
      return structuredResult({ since, until, completions: rows });
    },
  });

  // ---- Completions ------------------------------------------------------------

  defineTool("log_task_completion", {
    title: "Log task completion",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    description:
      "Log one dose of one of the user's tasks for a day (today or any past " +
      "day). Pass the user's local calendar date; it defaults to today in " +
      "UTC when omitted. For many days or tasks at once, use " +
      "backfill_task_completions instead." + REOPEN_NOTE,
    inputSchema: z.object({
      task_id: z.string().describe("Task id (uuid) from list_goals/get_goal."),
      day: z
        .string()
        .optional()
        .describe("Calendar day to log, formatted yyyy-MM-dd."),
    }),
    handler: async (args: { task_id: string; day?: string }) => {
      const day = args.day ?? todayUtc();
      requireDay(day, "day");
      requireNotFuture(day);
      const task = await requireOwnTask(db, user, args.task_id);
      // Multi-dose tasks log one row per dose, numbered from 0 each day.
      const { count, error: countError } = await db
        .from("task_completions")
        .select("id", { count: "exact", head: true })
        .eq("task_id", task.id)
        .eq("completed_by_user_id", user.id)
        .eq("completed_day", day);
      if (countError) {
        throw new Error(`Could not load completions: ${countError.message}`);
      }
      const logged = count ?? 0;
      const perDay = task.times_per_day ?? 1;
      if (logged >= perDay) {
        return textResult(
          perDay > 1
            ? `All ${perDay} of "${task.title}" were already logged for ${day}.`
            : `"${task.title}" was already logged for ${day}.`,
        );
      }
      const { error } = await db.from("task_completions").insert({
        task_id: task.id,
        completed_by_user_id: user.id,
        completed_day: day,
        completed_at: `${day}T12:00:00Z`,
        occurrence: logged,
      });
      if (error) {
        if (error.code === "23505") {
          return textResult(`"${task.title}" was already logged for ${day}.`);
        }
        throw new Error(`Could not log completion: ${error.message}`);
      }
      if (perDay > 1) {
        return textResult(
          `Logged "${task.title}" for ${day} (${logged + 1} of ${perDay}).`,
        );
      }
      return textResult(`Logged "${task.title}" as completed for ${day}.`);
    },
  });

  defineTool("undo_task_completion", {
    title: "Undo task completion",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    description:
      "Remove the latest dose the user logged for a task on a day. To clear " +
      "or set an exact number of doses, use backfill_task_completions with " +
      "the wanted count." + REOPEN_NOTE,
    inputSchema: z.object({
      task_id: z.string().describe("Task id (uuid)."),
      day: z
        .string()
        .optional()
        .describe("Day to un-log (yyyy-MM-dd); defaults to today in UTC."),
    }),
    handler: async (args: { task_id: string; day?: string }) => {
      requireUuid(args.task_id, "task_id");
      const day = args.day ?? todayUtc();
      requireDay(day, "day");
      // Undo the latest dose only; earlier doses that day stay logged.
      const { data: latest, error: findError } = await db
        .from("task_completions")
        .select("id")
        .eq("task_id", args.task_id)
        .eq("completed_by_user_id", user.id)
        .eq("completed_day", day)
        .order("occurrence", { ascending: false })
        .limit(1);
      if (findError) {
        throw new Error(`Could not load completions: ${findError.message}`);
      }
      if (!latest?.length) {
        return textResult(`No completion of that task was logged for ${day}.`);
      }
      const { error } = await db
        .from("task_completions")
        .delete()
        .eq("id", latest[0].id);
      if (error) throw new Error(`Could not undo completion: ${error.message}`);
      return textResult(`Removed the completion logged for ${day}.`);
    },
  });

  defineTool("backfill_task_completions", {
    title: "Backfill task completions",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    description:
      "Set the user's completions for many task-days in one call — the way " +
      "to backfill history. Each entry sets the exact number of doses logged " +
      "for that task on that day (count 0 clears it; count is capped at the " +
      "task's times_per_day). Days must be the user's local calendar dates, " +
      "today or earlier. Only the listed task-days change; everything else " +
      "is left as is. Tip: a goal's heatmap starts at its start_day, so set " +
      "start_day to the earliest backfilled day (update_goal) for the " +
      "history to be visible." + REOPEN_NOTE,
    inputSchema: z.object({
      completions: z
        .array(
          z.object({
            task_id: z.string().describe("Task id (uuid)."),
            day: z.string().describe("Calendar day, yyyy-MM-dd."),
            count: z
              .number()
              .int()
              .min(0)
              .max(24)
              .default(1)
              .describe("Doses logged that day after this call (default 1)."),
          }),
        )
        .min(1)
        .max(500)
        .describe("Task-days to set."),
    }),
    handler: async (args: {
      completions: { task_id: string; day: string; count?: number }[];
    }) => {
      // Validate everything first so a bad entry changes nothing.
      const wanted = new Map<string, Map<string, number>>();
      for (const entry of args.completions) {
        requireUuid(entry.task_id, "task_id");
        requireDay(entry.day, "day");
        requireNotFuture(entry.day);
        const days = wanted.get(entry.task_id) ?? new Map<string, number>();
        days.set(entry.day, entry.count ?? 1);
        wanted.set(entry.task_id, days);
      }
      const tasks = new Map<string, OwnTask>();
      for (const taskId of wanted.keys()) {
        tasks.set(taskId, await requireOwnTask(db, user, taskId));
      }

      let logged = 0;
      let cleared = 0;
      const touched: string[] = [];
      for (const [taskId, days] of wanted) {
        const task = tasks.get(taskId)!;
        const perDay = task.times_per_day ?? 1;
        const dayKeys = [...days.keys()];
        // Replace the listed days wholesale: delete, then insert the wanted
        // doses. The owner may delete and insert their own rows under RLS.
        const { error: deleteError } = await db
          .from("task_completions")
          .delete()
          .eq("task_id", taskId)
          .eq("completed_by_user_id", user.id)
          .in("completed_day", dayKeys);
        if (deleteError) {
          throw new Error(`Could not clear completions: ${deleteError.message}`);
        }
        const rows: Record<string, unknown>[] = [];
        for (const [day, count] of days) {
          const doses = Math.min(count, perDay);
          if (doses === 0) cleared += 1;
          for (let occurrence = 0; occurrence < doses; occurrence += 1) {
            rows.push({
              task_id: taskId,
              completed_by_user_id: user.id,
              completed_day: day,
              completed_at: `${day}T12:00:00Z`,
              occurrence,
            });
          }
        }
        if (rows.length > 0) {
          const { error } = await db.from("task_completions").insert(rows);
          if (error) {
            throw new Error(`Could not log completions: ${error.message}`);
          }
          logged += rows.length;
        }
        touched.push(`"${task.title}": ${dayKeys.length} day${dayKeys.length === 1 ? "" : "s"}`);
      }
      return textResult(
        `Set completions for ${touched.join("; ")} — ${logged} dose${logged === 1 ? "" : "s"} logged` +
          (cleared ? `, ${cleared} day${cleared === 1 ? "" : "s"} cleared` : "") +
          ".",
      );
    },
  });

  // ---- Goals ------------------------------------------------------------------

  defineTool("create_goal", {
    title: "Create goal",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    description:
      "Create a new goal owned by the signed-in user, optionally with " +
      "tasks. Use this to set goals up on their behalf — e.g. turning 'get " +
      "ready for a 10k' into a goal with a training cadence. Set is_draft " +
      "when they want to review it before it starts counting. When " +
      "backfilling history, set start_day to the earliest day you will log." +
      REOPEN_NOTE,
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
          "First day tasks are due (yyyy-MM-dd); may be in the past for " +
            "backfill. Omit to start right away; ignored for drafts.",
        ),
      due_day: z
        .string()
        .optional()
        .describe("Day to reach the goal by (yyyy-MM-dd)."),
      color: z
        .string()
        .optional()
        .describe("Accent color as #rrggbb. Omit for the app's default."),
      is_public: z
        .boolean()
        .default(false)
        .describe("Public goals are visible to accepted friends, who can nudge."),
      tasks: z
        .array(z.object(taskInputSchema))
        .max(20)
        .default([])
        .describe("Tasks to create with the goal, in order."),
    }),
    handler: async (args: {
      title: string;
      target?: string;
      is_draft?: boolean;
      start_day?: string;
      due_day?: string;
      color?: string;
      is_public?: boolean;
      tasks?: TaskInput[];
    }) => {
      for (const [name, day] of [["start_day", args.start_day], ["due_day", args.due_day]] as const) {
        if (day !== undefined) requireDay(day, name);
      }
      if (args.start_day && args.due_day && args.due_day < args.start_day) {
        throw new Error("due_day cannot be before start_day");
      }
      const color = args.color?.trim().toLowerCase();
      if (color !== undefined && !isHexColor(color)) {
        throw new Error("color must be formatted #rrggbb");
      }

      // Validate every task before touching the database so a bad task list
      // never leaves a half-created goal behind.
      const taskRows = (args.tasks ?? []).map((task, index) => fullTaskRow(task, index));

      const { data: goal, error } = await db
        .from("goals")
        .insert({
          owner_user_id: user.id,
          title: args.title.trim(),
          target: args.target?.trim() || null,
          is_draft: args.is_draft ?? false,
          start_day: (args.is_draft ? null : args.start_day) ?? null,
          due_day: args.due_day ?? null,
          color: color ?? null,
          visibility: args.is_public ? "public" : "private",
        })
        .select("id")
        .single();
      if (error) throw new Error(`Could not create the goal: ${error.message}`);

      if (taskRows.length > 0) {
        const { error: tasksError } = await db
          .from("tasks")
          .insert(taskRows.map((row) => ({ ...row, goal_id: goal.id })));
        if (tasksError) {
          // Don't leave an empty goal behind.
          await db.from("goals").delete().eq("id", goal.id);
          throw new Error(`Could not create the tasks: ${tasksError.message}`);
        }
      }

      const detail = await loadGoalDetail(db, user, goal.id);
      return structuredResult(detail);
    },
  });

  defineTool("update_goal", {
    title: "Update goal",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    description:
      "Edit one of the user's goals: title, target, start/due day, color, " +
      "public/private, or start a draft (is_draft false). Only the fields " +
      "passed change; pass null to clear target, due_day or color." +
      REOPEN_NOTE,
    inputSchema: z.object({
      goal_id: z.string().describe("Goal id (uuid)."),
      title: z.string().min(1).max(80).optional(),
      target: z.string().max(80).nullable().optional(),
      start_day: z.string().optional().describe("yyyy-MM-dd; may be in the past."),
      due_day: z.string().nullable().optional().describe("yyyy-MM-dd, or null to clear."),
      color: z.string().nullable().optional().describe("#rrggbb, or null for default."),
      is_public: z.boolean().optional(),
      is_draft: z
        .boolean()
        .optional()
        .describe("false starts a draft goal (its start_day defaults to today)."),
    }),
    handler: async (args: {
      goal_id: string;
      title?: string;
      target?: string | null;
      start_day?: string;
      due_day?: string | null;
      color?: string | null;
      is_public?: boolean;
      is_draft?: boolean;
    }) => {
      const goal = await requireOwnGoal(db, user, args.goal_id);
      const write: Record<string, unknown> = {};
      if (args.title !== undefined) {
        const title = args.title.trim();
        if (!title) throw new Error("title cannot be empty");
        write.title = title;
      }
      if (args.target !== undefined) write.target = args.target?.trim() || null;
      if (args.start_day !== undefined) {
        requireDay(args.start_day, "start_day");
        write.start_day = args.start_day;
      }
      if (args.due_day !== undefined) {
        if (args.due_day !== null) requireDay(args.due_day, "due_day");
        write.due_day = args.due_day;
      }
      if (args.color !== undefined) {
        const color = args.color?.trim().toLowerCase() ?? null;
        if (color !== null && !isHexColor(color)) {
          throw new Error("color must be formatted #rrggbb");
        }
        write.color = color;
      }
      if (args.is_public !== undefined) {
        write.visibility = args.is_public ? "public" : "private";
      }
      if (args.is_draft !== undefined) {
        write.is_draft = args.is_draft;
        if (!args.is_draft && goal.is_draft && write.start_day === undefined) {
          write.start_day = goal.start_day ?? todayUtc();
        }
      }
      const startDay = (write.start_day as string | undefined) ?? goal.start_day;
      const dueDay = write.due_day === undefined ? goal.due_day : (write.due_day as string | null);
      if (startDay && dueDay && dueDay < startDay) {
        throw new Error("due_day cannot be before start_day");
      }
      if (Object.keys(write).length === 0) throw new Error("Nothing to update");
      write.updated_at = new Date().toISOString();
      const { error } = await db.from("goals").update(write).eq("id", goal.id);
      if (error) throw new Error(`Could not update the goal: ${error.message}`);
      return structuredResult(await loadGoalDetail(db, user, goal.id));
    },
  });

  defineTool("set_goal_achieved", {
    title: "Set goal achieved",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    description:
      "Mark one of the user's goals as achieved (it moves to the achieved " +
      "stack and stops counting) or reactivate an achieved goal." + REOPEN_NOTE,
    inputSchema: z.object({
      goal_id: z.string().describe("Goal id (uuid)."),
      achieved: z.boolean().describe("true = achieved, false = back to active."),
    }),
    handler: async (args: { goal_id: string; achieved: boolean }) => {
      const goal = await requireOwnGoal(db, user, args.goal_id);
      const { error } = await db
        .from("goals")
        .update({
          completed_at: args.achieved ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", goal.id);
      if (error) throw new Error(`Could not update the goal: ${error.message}`);
      return textResult(
        args.achieved
          ? `"${goal.title}" is now achieved.`
          : `"${goal.title}" is active again.`,
      );
    },
  });

  defineTool("delete_goal", {
    title: "Delete goal",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    description:
      "Permanently delete one of the user's goals with all its tasks and " +
      "completion history. Irreversible: confirm with the user first and " +
      "pass confirm=true." + REOPEN_NOTE,
    inputSchema: z.object({
      goal_id: z.string().describe("Goal id (uuid)."),
      confirm: z.boolean().describe("Must be true; the user has confirmed."),
    }),
    handler: async (args: { goal_id: string; confirm: boolean }) => {
      if (!args.confirm) throw new Error("Deletion not confirmed");
      const goal = await requireOwnGoal(db, user, args.goal_id);
      const { error } = await db.from("goals").delete().eq("id", goal.id);
      if (error) throw new Error(`Could not delete the goal: ${error.message}`);
      const order = await loadPersonalOrder(db, user);
      if (order.goals.includes(goal.id) || order.tasks[goal.id]) {
        order.goals = order.goals.filter((id) => id !== goal.id);
        delete order.tasks[goal.id];
        await savePersonalOrder(db, user, order);
      }
      return textResult(`Deleted "${goal.title}" and its tasks.`);
    },
  });

  defineTool("set_goal_order", {
    title: "Set goal order",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    description:
      "Set the order the user's own goals appear in (their personal order, " +
      "top to bottom). Goals not listed keep their place after the listed " +
      "ones." + REOPEN_NOTE,
    inputSchema: z.object({
      goal_ids: z.array(z.string()).min(1).max(200).describe("Goal ids (uuid), top to bottom."),
    }),
    handler: async (args: { goal_ids: string[] }) => {
      for (const id of args.goal_ids) requireUuid(id, "goal_ids[]");
      const order = await loadPersonalOrder(db, user);
      order.goals = [...new Set(args.goal_ids)];
      await savePersonalOrder(db, user, order);
      return textResult("Goal order saved.");
    },
  });

  // ---- Tasks ------------------------------------------------------------------

  defineTool("add_task", {
    title: "Add task",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    description:
      "Add a task to one of the user's goals, with its schedule, doses per " +
      "day and reminders." + REOPEN_NOTE,
    inputSchema: z.object({
      goal_id: z.string().describe("Goal id (uuid)."),
      ...taskInputSchema,
    }),
    handler: async (args: TaskInput & { goal_id: string }) => {
      const goal = await requireOwnGoal(db, user, args.goal_id);
      const position =
        Math.max(-1, ...(goal.tasks ?? []).map((task) => task.position ?? 0)) + 1;
      const row = fullTaskRow(args, position);
      const { data, error } = await db
        .from("tasks")
        .insert({ ...row, goal_id: goal.id })
        .select("id")
        .single();
      if (error) throw new Error(`Could not add the task: ${error.message}`);
      const detail = await loadGoalDetail(db, user, goal.id);
      return structuredResult({ task_id: data.id, goal: detail });
    },
  });

  defineTool("update_task", {
    title: "Update task",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    description:
      "Edit a task on one of the user's goals: title, schedule (frequency, " +
      "custom cadence, pinned weekdays), doses per day, reminders, or the " +
      "day of a one-off task. Only the fields passed change." + REOPEN_NOTE,
    inputSchema: z.object({
      task_id: z.string().describe("Task id (uuid)."),
      ...taskInputSchema,
      title: taskInputSchema.title.optional(),
      frequency: z.enum(["once", "daily", "weekly", "custom"]).optional(),
    }),
    handler: async (args: TaskInput & { task_id: string }) => {
      const task = await requireOwnTask(db, user, args.task_id);
      const write: TaskWrite & { updated_at?: string } = scheduleColumns(
        args,
        true,
        task.frequency,
      );
      if (args.title !== undefined) {
        const title = args.title.trim();
        if (!title) throw new Error("title cannot be empty");
        write.title = title;
      }
      if (Object.keys(write).length === 0) throw new Error("Nothing to update");
      write.updated_at = new Date().toISOString();
      const { error } = await db.from("tasks").update(write).eq("id", task.id);
      if (error) throw new Error(`Could not update the task: ${error.message}`);
      return structuredResult(await loadGoalDetail(db, user, task.goals.id));
    },
  });

  defineTool("delete_task", {
    title: "Delete task",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    description:
      "Permanently delete a task and its completion history from one of the " +
      "user's goals." + REOPEN_NOTE,
    inputSchema: z.object({
      task_id: z.string().describe("Task id (uuid)."),
    }),
    handler: async (args: { task_id: string }) => {
      const task = await requireOwnTask(db, user, args.task_id);
      const { error } = await db.from("tasks").delete().eq("id", task.id);
      if (error) throw new Error(`Could not delete the task: ${error.message}`);
      return textResult(`Deleted "${task.title}" from "${task.goals.title}".`);
    },
  });

  defineTool("set_task_order", {
    title: "Set task order",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    description:
      "Set the order of the tasks inside one of the user's goals (top to " +
      "bottom). Tasks not listed keep their place after the listed ones." +
      REOPEN_NOTE,
    inputSchema: z.object({
      goal_id: z.string().describe("Goal id (uuid)."),
      task_ids: z.array(z.string()).min(1).max(100).describe("Task ids (uuid), top to bottom."),
    }),
    handler: async (args: { goal_id: string; task_ids: string[] }) => {
      const goal = await requireOwnGoal(db, user, args.goal_id);
      const known = new Set((goal.tasks ?? []).map((task) => task.id));
      for (const id of args.task_ids) {
        requireUuid(id, "task_ids[]");
        if (!known.has(id)) throw new Error(`Task ${id} is not on this goal`);
      }
      const order = await loadPersonalOrder(db, user);
      order.tasks[goal.id] = [...new Set(args.task_ids)];
      await savePersonalOrder(db, user, order);
      return textResult("Task order saved.");
    },
  });

  // ---- Friends ----------------------------------------------------------------

  type FriendshipRow = {
    id: string;
    requester_user_id: string;
    addressee_user_id: string;
    status: string;
    created_at: string;
  };

  const loadFriendships = async () => {
    const { data, error } = await db
      .from("friendships")
      .select("id,requester_user_id,addressee_user_id,status,created_at")
      .in("status", ["accepted", "pending"]);
    if (error) throw new Error(`Could not load friends: ${error.message}`);
    return (data ?? []) as FriendshipRow[];
  };

  const otherUser = (row: FriendshipRow) =>
    row.requester_user_id === user.id ? row.addressee_user_id : row.requester_user_id;

  defineTool("list_friends", {
    title: "List friends",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description:
      "The user's accepted friends (whose public goals they can see and " +
      "nudge), plus pending friend requests they received and sent.",
    inputSchema: z.object({}),
    handler: async () => {
      const rows = await loadFriendships();
      const profiles = await fetchProfiles(db, rows.map(otherUser));
      const person = (row: FriendshipRow) => {
        const id = otherUser(row);
        return {
          user_id: id,
          username: profiles.get(id)?.username ?? null,
          display_name: displayName(profiles, id),
        };
      };
      return structuredResult({
        friends: rows.filter((row) => row.status === "accepted").map(person),
        incoming_requests: rows
          .filter((row) => row.status === "pending" && row.addressee_user_id === user.id)
          .map((row) => ({ friendship_id: row.id, from: person(row), sent_at: row.created_at })),
        outgoing_requests: rows
          .filter((row) => row.status === "pending" && row.requester_user_id === user.id)
          .map((row) => ({ friendship_id: row.id, to: person(row), sent_at: row.created_at })),
      });
    },
  });

  defineTool("search_people", {
    title: "Search people",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description:
      "Find OnTrack users by username or display name, to send a friend " +
      "request. Returns up to 50 matches with mutual-friend counts.",
    inputSchema: z.object({
      query: z.string().min(1).max(64).describe("Part of a username or name."),
    }),
    handler: async (args: { query: string }) => {
      const { data, error } = await db.rpc("search_people", {
        search_text: args.query.trim(),
      });
      if (error) throw new Error(`Search failed: ${error.message}`);
      const rows = await loadFriendships();
      const relation = new Map<string, string>();
      for (const row of rows) {
        relation.set(
          otherUser(row),
          row.status === "accepted"
            ? "friend"
            : row.requester_user_id === user.id
              ? "request_sent"
              : "request_received",
        );
      }
      const people = ((data ?? []) as {
        id: string;
        username: string | null;
        display_name: string | null;
        mutual_friends: number | null;
      }[]).slice(0, 50).map((row) => ({
        user_id: row.id,
        username: row.username,
        display_name: row.display_name ?? "Unknown",
        mutual_friends: row.mutual_friends ?? 0,
        relationship: relation.get(row.id) ?? "none",
      }));
      return structuredResult({ people });
    },
  });

  defineTool("send_friend_request", {
    title: "Send friend request",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    description: "Send a friend request to another OnTrack user (from search_people).",
    inputSchema: z.object({
      user_id: z.string().describe("Their user id (uuid)."),
    }),
    handler: async (args: { user_id: string }) => {
      requireUuid(args.user_id, "user_id");
      if (args.user_id === user.id) throw new Error("That is you");
      const existing = (await loadFriendships()).find(
        (row) => otherUser(row) === args.user_id,
      );
      if (existing?.status === "accepted") return textResult("You are already friends.");
      if (existing) {
        return textResult(
          existing.requester_user_id === user.id
            ? "A request to them is already pending."
            : "They already sent you a request — accept it with respond_to_friend_request.",
        );
      }
      const { error } = await db.from("friendships").insert({
        requester_user_id: user.id,
        addressee_user_id: args.user_id,
        status: "pending",
      });
      if (error) throw new Error(`Could not send the request: ${error.message}`);
      return textResult("Friend request sent.");
    },
  });

  defineTool("respond_to_friend_request", {
    title: "Respond to friend request",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    description:
      "Accept or decline a friend request the user received (friendship_id " +
      "from list_friends.incoming_requests).",
    inputSchema: z.object({
      friendship_id: z.string().describe("The request's friendship id (uuid)."),
      accept: z.boolean().describe("true to accept, false to decline."),
    }),
    handler: async (args: { friendship_id: string; accept: boolean }) => {
      requireUuid(args.friendship_id, "friendship_id");
      const request = (await loadFriendships()).find(
        (row) =>
          row.id === args.friendship_id &&
          row.status === "pending" &&
          row.addressee_user_id === user.id,
      );
      if (!request) throw new Error("No pending request with that id was sent to you");
      const query = args.accept
        ? db.from("friendships").update({ status: "accepted" }).eq("id", request.id).select("id")
        : db.from("friendships").delete().eq("id", request.id).select("id");
      const { data, error } = await query;
      if (error) throw new Error(`Could not respond: ${error.message}`);
      if (!data?.length) throw new Error("This request is no longer available.");
      return textResult(args.accept ? "Friend request accepted." : "Friend request declined.");
    },
  });

  defineTool("unfriend", {
    title: "Unfriend",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    description:
      "Remove a friend, or cancel a friend request the user sent. Confirm " +
      "with the user first.",
    inputSchema: z.object({
      user_id: z.string().describe("Their user id (uuid)."),
    }),
    handler: async (args: { user_id: string }) => {
      requireUuid(args.user_id, "user_id");
      const row = (await loadFriendships()).find(
        (candidate) => otherUser(candidate) === args.user_id,
      );
      if (!row) return textResult("You are not connected to that user.");
      const { error } = await db.from("friendships").delete().eq("id", row.id);
      if (error) throw new Error(`Could not remove: ${error.message}`);
      return textResult(
        row.status === "accepted" ? "Friend removed." : "Friend request cancelled.",
      );
    },
  });

  defineTool("nudge_friend", {
    title: "Nudge friend",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    description:
      "Send a push-notification nudge to an accepted friend about one of " +
      "their public goals. The notification just says who nudged them and " +
      "which goal; one nudge per friend and goal per hour.",
    inputSchema: z.object({
      recipient_user_id: z
        .string()
        .describe("The friend's user id (uuid) from list_friends."),
      goal_id: z.string().describe("Their goal's id (uuid) from list_goals."),
    }),
    handler: async (args: { recipient_user_id: string; goal_id: string }) => {
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

  // ---- Profile ----------------------------------------------------------------

  defineTool("get_profile", {
    title: "Get profile",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description: "The signed-in user's own profile: display name, username, email.",
    inputSchema: z.object({}),
    handler: async () => {
      const { data, error } = await db
        .from("profiles")
        .select("id,username,display_name,email")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw new Error(`Could not load profile: ${error.message}`);
      return structuredResult({
        user_id: user.id,
        username: data?.username ?? null,
        display_name: data?.display_name ?? null,
        email: data?.email ?? user.email ?? null,
      });
    },
  });

  defineTool("update_profile", {
    title: "Update profile",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    description:
      "Change the user's display name and/or username (3-32 characters: " +
      "lowercase letters, digits, '.', '_' or '-'; must be unique).",
    inputSchema: z.object({
      display_name: z.string().min(1).max(60).optional(),
      username: z.string().min(3).max(32).optional(),
    }),
    handler: async (args: { display_name?: string; username?: string }) => {
      const write: Record<string, string> = {};
      if (args.display_name !== undefined) {
        const name = args.display_name.trim();
        if (!name) throw new Error("display_name cannot be empty");
        write.display_name = name;
      }
      if (args.username !== undefined) {
        const username = args.username.trim().toLowerCase();
        if (!USERNAME_PATTERN.test(username)) {
          throw new Error(
            "username must be 3-32 characters of lowercase letters, digits, '.', '_' or '-', starting and ending with a letter or digit",
          );
        }
        write.username = username;
      }
      if (Object.keys(write).length === 0) throw new Error("Nothing to update");
      const { error } = await db
        .from("profiles")
        .update({ ...write, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) {
        if (error.code === "23505") throw new Error("That username is taken");
        throw new Error(`Could not update profile: ${error.message}`);
      }
      // Keep the auth metadata the app reads for the account card in step.
      const meta: Record<string, string> = {};
      if (write.display_name) meta.display_name = write.display_name;
      if (write.username) meta.username = write.username;
      await db.auth.updateUser({ data: meta }).catch(() => {});
      return textResult("Profile updated.");
    },
  });

  // ---- ChatGPT connector contract --------------------------------------------

  // `search` and `fetch` follow ChatGPT's connector contract so the server
  // also works with deep research, which only calls these two tools.
  defineTool("search", {
    title: "Search",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description:
      "Search the user's visible goals and tasks by keyword. Returns goal " +
      "results; pass a result id to fetch for full detail.",
    inputSchema: z.object({
      query: z.string().describe("Keywords to match against goal and task titles."),
    }),
    handler: async (args: { query: string }) => {
      const needle = args.query.trim().toLowerCase();
      const order = await loadPersonalOrder(db, user);
      const goals = await loadVisibleGoals(db, user, order);
      const summaries = await goalSummary(db, user, goals, order);
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

  defineTool("fetch", {
    title: "Fetch",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description:
      "Fetch the full detail of one goal by id, as returned by search.",
    inputSchema: z.object({
      id: z.string().describe("Goal id (uuid) from a search result."),
    }),
    handler: async (args: { id: string }) => {
      requireUuid(args.id, "id");
      const detail = await loadGoalDetail(db, user, args.id);
      const lines = [
        `# ${detail.title}`,
        detail.target ? `Target: ${detail.target}` : null,
        `Status: ${detail.status}`,
        detail.start_day ? `Starts: ${detail.start_day}` : null,
        detail.due_day ? `Due: ${detail.due_day}` : null,
        `Owner: ${detail.owner}`,
        "",
        "## Tasks (completions from the last 30 days)",
        ...detail.tasks.map((task) => {
          const count = task.completed_days.length;
          return `- ${task.title} (${task.frequency}) — ${count ? `${count}x` : "none"}`;
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
