import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// One nudge per sender + recipient + goal per hour, enforced against the
// nudges log so it holds across devices and app restarts.
const NUDGE_WINDOW_MS = 60 * 60 * 1000;

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
  const recipientUserId = payload.recipientUserId;
  if (recipientUserId === user.id) {
    return json({ error: "You cannot nudge yourself" }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: friendship, error: friendshipError } = await adminClient
    .from("friendships")
    .select("id")
    .eq("status", "accepted")
    .or(
      `and(requester_user_id.eq.${user.id},addressee_user_id.eq.${recipientUserId}),and(requester_user_id.eq.${recipientUserId},addressee_user_id.eq.${user.id})`,
    )
    .limit(1);
  if (friendshipError) return json({ error: "Could not verify friendship" }, 500);
  if (!friendship?.length) {
    return json({ error: "You can only nudge an accepted friend" }, 403);
  }

  const { data: goal, error: goalError } = await adminClient
    .from("goals")
    .select("id, title, owner_user_id, completed_at, visibility")
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
    .in("user_id", [user.id, recipientUserId]);
  if (membershipError) {
    return json({ error: "Could not verify goal membership" }, 500);
  }
  const participantIds = new Set([
    goal.owner_user_id as string,
    ...(memberships ?? []).map((membership) => membership.user_id as string),
  ]);
  if (!participantIds.has(recipientUserId)) {
    return json({ error: "Your friend isn't part of this goal" }, 403);
  }

  // Members can always nudge each other. Anyone else needs the goal to be
  // public and to be friends with its owner (the same rule that lets them
  // see it).
  if (!participantIds.has(user.id)) {
    let allowed = goal.visibility === "public";
    if (allowed && goal.owner_user_id !== recipientUserId) {
      const { data: friendsWithOwner, error: ownerFriendError } =
        await adminClient.rpc("are_users_friends", {
          left_user_id: user.id,
          right_user_id: goal.owner_user_id,
        });
      if (ownerFriendError) {
        return json({ error: "Could not verify goal access" }, 500);
      }
      allowed = friendsWithOwner === true;
    }
    if (!allowed) {
      return json({ error: "You can't see this goal" }, 403);
    }
  }

  const windowStart = new Date(Date.now() - NUDGE_WINDOW_MS);
  const { data: recentNudges, error: recentError } = await adminClient
    .from("nudges")
    .select("created_at")
    .eq("sender_user_id", user.id)
    .eq("recipient_user_id", recipientUserId)
    .eq("goal_id", goal.id)
    .gte("created_at", windowStart.toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  if (recentError) return json({ error: "Could not check recent nudges" }, 500);
  const lastNudge = recentNudges?.[0]?.created_at as string | undefined;
  if (lastNudge) {
    const elapsed = Date.now() - new Date(lastNudge).getTime();
    const retryAfterMinutes = Math.max(
      1,
      Math.ceil((NUDGE_WINDOW_MS - elapsed) / 60_000),
    );
    return json({ error: "Nudged recently", retryAfterMinutes }, 429);
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
    .eq("user_id", recipientUserId)
    .limit(100);
  if (tokensError) return json({ error: "Could not find a device" }, 500);
  if (!tokens?.length) {
    return json({ error: "This friend hasn't turned on notifications yet" }, 409);
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
        title: `${senderName} nudged you`,
        body: goal.title,
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

  // Log after delivery so a failed send never burns the hourly slot.
  await adminClient.from("nudges").insert({
    sender_user_id: user.id,
    recipient_user_id: recipientUserId,
    goal_id: goal.id,
  });

  return json({ delivered });
});
