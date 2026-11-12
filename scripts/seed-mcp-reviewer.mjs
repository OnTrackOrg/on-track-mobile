// Create and populate the OnTrack reviewer account (plus two friends) on prod
// via the admin API and the live MCP tools. SERVICE_KEY + REVIEWER_PASSWORD env.
const PROJECT = "https://plwzrlwwqyrcvhaehrzm.supabase.co";
const KEY = process.env.SERVICE_KEY; const PW = process.env.REVIEWER_PASSWORD;
if (!KEY || !PW) throw new Error("env missing");
const admin = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const log = (...a) => console.log(...a);
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const dow = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.getUTCDay(); }; // 0=Sun
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

const makeUser = async ({ email, username, display, password }) => {
  let r = await fetch(`${PROJECT}/auth/v1/admin/users`, { method: "POST", headers: admin, body: JSON.stringify({ email, email_confirm: true, ...(password ? { password } : {}) }) });
  const u = await r.json(); if (!r.ok) throw new Error("create user: " + JSON.stringify(u));
  r = await fetch(`${PROJECT}/rest/v1/profiles`, { method: "POST", headers: { ...admin, Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ id: u.id, username, display_name: display, email }) });
  if (!r.ok) throw new Error("profile: " + await r.text());
  r = await fetch(`${PROJECT}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email }) });
  const link = await r.json(); if (!r.ok) throw new Error("generate_link: " + JSON.stringify(link));
  r = await fetch(`${PROJECT}/auth/v1/verify`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) });
  const session = await r.json(); if (!r.ok || !session.access_token) throw new Error("verify: " + JSON.stringify(session));
  return { id: u.id, jwt: session.access_token };
};
const makeClient = (jwt) => {
  const endpoint = `${PROJECT}/functions/v1/ontrack-mcp/mcp`; let sessionId = null; let nextId = 1;
  const rpc = async (method, params = {}) => {
    const headers = { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
    if (sessionId) headers["mcp-session-id"] = sessionId;
    const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }) });
    sessionId = res.headers.get("mcp-session-id") ?? sessionId;
    const text = await res.text(); let body;
    if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) body = JSON.parse(text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join(""));
    else body = JSON.parse(text);
    if (body.error) throw new Error(`${method}: ${body.error.message}`); return body.result;
  };
  const call = async (name, args = {}) => { const r = await rpc("tools/call", { name, arguments: args }); if (r.isError) throw new Error(`${name}: ${r.content?.[0]?.text}`); return r.structuredContent ?? r.content?.[0]?.text; };
  return { rpc, call };
};
const taskByTitle = (goal, title) => { const t = goal.tasks.find((x) => x.title === title); if (!t) throw new Error("no task " + title); return t.id; };
const backfill = async (c, entries) => { for (let i = 0; i < entries.length; i += 400) await c.call("backfill_task_completions", { completions: entries.slice(i, i + 400) }); };

const riley = await makeUser({ email: "adamnlin+mcp-reviewer@gmail.com", username: "riley.reviewer", display: "Riley Reviewer", password: PW });
const sam = await makeUser({ email: "adamnlin+mcp-sam@gmail.com", username: "sam.okafor", display: "Sam Okafor" });
const jordan = await makeUser({ email: "adamnlin+mcp-jordan@gmail.com", username: "jordan.lee", display: "Jordan Lee" });
log("users", riley.id, sam.id, jordan.id);
const R = makeClient(riley.jwt), S = makeClient(sam.jwt), J = makeClient(jordan.jwt);
for (const c of [R, S, J]) await c.rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "seed", version: "0" } });

// --- Riley's goals -----------------------------------------------------------
const fit = await R.call("create_goal", { title: "Get fit for the 10k", target: "Finish the city 10k in under 60 minutes", start_day: day(42), due_day: day(-56), color: "#3B82F6", is_public: false, tasks: [
  { title: "Run", custom_weekdays: [1, 3, 5] },
  { title: "Stretch", frequency: "daily", reminders: ["07:30"] },
  { title: "Long run", frequency: "custom", custom_type: "weekly", custom_target: 1 },
  { title: "Buy running shoes", frequency: "once", once_day: day(21) },
] });
{
  const e = [];
  for (let n = 0; n <= 42; n++) {
    const d = dow(n);
    if ([1, 3, 5].includes(d) && rnd() < 0.85) e.push({ task_id: taskByTitle(fit, "Run"), day: day(n), count: 1 });
    if (rnd() < 0.7) e.push({ task_id: taskByTitle(fit, "Stretch"), day: day(n), count: 1 });
    if (d === 0 && rnd() < 0.9) e.push({ task_id: taskByTitle(fit, "Long run"), day: day(n), count: 1 });
  }
  e.push({ task_id: taskByTitle(fit, "Buy running shoes"), day: day(21), count: 1 });
  await backfill(R, e);
}
const books = await R.call("create_goal", { title: "Read 12 books this year", target: "One book a month, 20 pages a day", start_day: day(60), color: "#F59E0B", is_public: true, tasks: [
  { title: "Read 20 pages", frequency: "daily", reminders: ["21:30"] },
  { title: "Finish a book", frequency: "custom", custom_type: "weekly", custom_target: 1 },
] });
{
  const e = [];
  for (let n = 0; n <= 60; n++) { if (rnd() < 0.75) e.push({ task_id: taskByTitle(books, "Read 20 pages"), day: day(n), count: 1 }); }
  for (const n of [4, 13, 24, 33, 47, 58]) e.push({ task_id: taskByTitle(books, "Finish a book"), day: day(n), count: 1 });
  await backfill(R, e);
}
const water = await R.call("create_goal", { title: "Drink more water", target: "Three glasses a day", start_day: day(30), color: "#10B981", tasks: [
  { title: "Glass of water", frequency: "daily", times_per_day: 3, reminders: ["09:00", "13:00", "18:00"] },
] });
{
  const e = [];
  for (let n = 0; n <= 30; n++) { const c = Math.min(3, Math.floor(rnd() * 4.3)); if (c > 0) e.push({ task_id: taskByTitle(water, "Glass of water"), day: day(n), count: c }); }
  await backfill(R, e);
}
const spanish = await R.call("create_goal", { title: "Learn Spanish", target: "Hold a 10-minute conversation by spring", is_draft: true, color: "#8B5CF6", tasks: [
  { title: "Duolingo lesson", frequency: "daily" },
  { title: "Conversation practice", frequency: "custom", custom_type: "weekly", custom_target: 2 },
] });
const declutter = await R.call("create_goal", { title: "Declutter the apartment", target: "One shelf, drawer or box a day for two weeks", start_day: day(28), color: "#EC4899", tasks: [
  { title: "Clear one shelf or drawer", frequency: "daily" },
] });
{
  const e = [];
  for (let n = 14; n <= 28; n++) { if (rnd() < 0.9) e.push({ task_id: taskByTitle(declutter, "Clear one shelf or drawer"), day: day(n), count: 1 }); }
  await backfill(R, e);
  await R.call("set_goal_achieved", { goal_id: declutter.id, achieved: true });
}
await R.call("set_goal_order", { goal_ids: [fit.id, books.id, water.id, spanish.id, declutter.id] });

// --- Sam: public goal, accepted friend; Jordan: pending incoming request -----
const half = await S.call("create_goal", { title: "Run a half marathon", target: "Spring half, 2:10 or better", start_day: day(35), color: "#EF4444", is_public: true, tasks: [
  { title: "Easy run", custom_weekdays: [2, 4] },
  { title: "Long run", frequency: "custom", custom_type: "weekly", custom_target: 1 },
  { title: "Strength", frequency: "custom", custom_type: "weekly", custom_target: 2 },
] });
{
  const e = [];
  for (let n = 0; n <= 35; n++) { const d = dow(n);
    if ([2, 4].includes(d) && rnd() < 0.85) e.push({ task_id: taskByTitle(half, "Easy run"), day: day(n), count: 1 });
    if (d === 6 && rnd() < 0.9) e.push({ task_id: taskByTitle(half, "Long run"), day: day(n), count: 1 });
    if ([1, 5].includes(d) && rnd() < 0.7) e.push({ task_id: taskByTitle(half, "Strength"), day: day(n), count: 1 });
  }
  await backfill(S, e);
}
await S.call("create_goal", { title: "Meditate daily", is_public: false, tasks: [{ title: "10 minutes", frequency: "daily" }] });
await R.call("send_friend_request", { user_id: sam.id });
const samFriends = await S.call("list_friends");
const req = samFriends.incoming_requests.find((x) => x.from.user_id === riley.id);
await S.call("respond_to_friend_request", { friendship_id: req.friendship_id, accept: true });
await J.call("create_goal", { title: "Sleep by 11", is_public: true, tasks: [{ title: "Lights out", frequency: "daily" }] });
await J.call("send_friend_request", { user_id: riley.id });

// --- Summary ----------------------------------------------------------------
const goals = await R.call("list_goals");
for (const g of goals.goals) log(`goal: ${g.title} [${g.status}] owner=${g.owner} tasks=${g.tasks.length}`);
const friends = await R.call("list_friends");
log(`friends=${friends.friends.length} incoming=${friends.incoming_requests.length} outgoing=${friends.outgoing_requests.length}`);
const comps = await R.call("list_completions", { goal_id: fit.id, since: day(42), until: day(0) });
log(`fit completions rows=${(comps.completions ?? comps.rows ?? []).length}`);
log("DONE");
