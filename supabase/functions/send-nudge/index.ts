import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return json({ error: "Unauthorized" }, 401);
  }

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

  let payload: { recipientUserId?: unknown; goalId?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  if (!isUuid(payload.recipientUserId) || !isUuid(payload.goalId)) {
    return json({ error: "A valid recipient and goal are required" }, 400);
  }
  if (payload.recipientUserId === user.id) {
    return json({ error: "You cannot nudge yourself" }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: friendship, error: friendshipError } = await adminClient
    .from("friendships")
    .select("id")
    .eq("status", "accepted")
    .or(
      `and(requester_user_id.eq.${user.id},addressee_user_id.eq.${payload.recipientUserId}),and(requester_user_id.eq.${payload.recipientUserId},addressee_user_id.eq.${user.id})`,
    )
    .limit(1);
  if (friendshipError) return json({ error: "Could not verify friendship" }, 500);
  if (!friendship?.length) {
    return json({ error: "You can only nudge an accepted friend" }, 403);
  }

  const { data: goal, error: goalError } = await adminClient
    .from("goals")
    .select("id, title, owner_user_id, completed_at")
    .eq("id", payload.goalId)
    .maybeSingle();
  if (goalError) return json({ error: "Could not verify the goal" }, 500);
  if (!goal) return json({ error: "Goal not found" }, 404);
  if (goal.completed_at) {
    return json({ error: "Completed goals cannot be nudged" }, 400);
  }

  const { data: memberships, error: membershipError } = await adminClient
    .from("goal_memberships")
    .select("user_id")
    .eq("goal_id", goal.id)
    .in("user_id", [user.id, payload.recipientUserId]);
  if (membershipError) {
    return json({ error: "Could not verify goal membership" }, 500);
  }
  const participantIds = new Set([
    goal.owner_user_id,
    ...(memberships ?? []).map((membership) => membership.user_id as string),
  ]);
  if (
    !participantIds.has(user.id) ||
    !participantIds.has(payload.recipientUserId)
  ) {
    return json({ error: "You can only nudge a friend on a shared goal" }, 403);
  }

  const { data: sender, error: senderError } = await adminClient
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  if (senderError) return json({ error: "Could not prepare the nudge" }, 500);
  const senderName = sender?.display_name?.trim() || "A friend";

  const { data: tokens, error: tokensError } = await adminClient
    .from("push_tokens")
    .select("token")
    .eq("user_id", payload.recipientUserId)
    .limit(100);
  if (tokensError) return json({ error: "Could not find a device" }, 500);
  if (!tokens?.length) {
    return json({ error: "This friend has not enabled push notifications yet" }, 409);
  }

  const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      tokens.map(({ token }) => ({
        to: token,
        sound: "default",
        title: `${senderName} sent a nudge`,
        body: `${senderName} is nudging you to do ${goal.title}.`,
        data: {
          goalId: goal.id,
          senderUserId: user.id,
          type: "nudge",
        },
      })),
    ),
  });
  if (!expoResponse.ok) {
    return json({ error: "Could not deliver the nudge" }, 502);
  }

  const expoResult = (await expoResponse.json()) as {
    data?: Array<{ status?: string }>;
  };
  const delivered = expoResult.data?.filter((ticket) => ticket.status === "ok")
    .length;
  if (!delivered) {
    return json({ error: "Could not deliver the nudge" }, 502);
  }

  return json({ delivered });
});
