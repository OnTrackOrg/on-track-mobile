// Login + consent page for the Supabase OAuth 2.1 flow. OnTrack is a mobile
// app with no web frontend, so this function hosts the page the OAuth server
// redirects to (Dashboard → Authentication → OAuth Server → authorization
// path). Users sign in with their existing OnTrack email/password, review the
// requesting client, and approve or deny access.
export const consentPage = (config: {
  supabaseUrl: string;
  anonKey: string;
}) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>OnTrack — Connect an app</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #f4f5f7; color: #1c1c1e; margin: 0; padding: 24px;
    display: flex; justify-content: center; align-items: flex-start;
    min-height: 100vh;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #111; color: #f2f2f7; }
    .card { background: #1c1c1e !important; }
    input { background: #2c2c2e !important; color: #f2f2f7 !important; border-color: #3a3a3c !important; }
  }
  .card {
    background: #fff; border-radius: 16px; padding: 28px; max-width: 380px;
    width: 100%; margin-top: 8vh; box-shadow: 0 8px 30px rgba(0,0,0,.08);
  }
  h1 { font-size: 1.25rem; margin: 0 0 4px; }
  p { margin: 8px 0; line-height: 1.45; }
  .muted { color: #8e8e93; font-size: .875rem; }
  input {
    width: 100%; box-sizing: border-box; padding: 12px; margin: 6px 0;
    border: 1px solid #d1d1d6; border-radius: 10px; font-size: 1rem;
  }
  button {
    width: 100%; padding: 12px; margin-top: 10px; border: none;
    border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer;
  }
  .primary { background: #34c759; color: #fff; }
  .secondary { background: transparent; color: #8e8e93; }
  .error { color: #ff3b30; font-size: .875rem; min-height: 1.2em; }
  .hidden { display: none; }
  .scopes { padding-left: 20px; margin: 8px 0; }
</style>
</head>
<body>
<div class="card">
  <h1>OnTrack</h1>
  <div id="loading"><p class="muted">Loading…</p></div>

  <div id="login" class="hidden">
    <p>Sign in to connect an app to your OnTrack account.</p>
    <input id="email" type="email" placeholder="Email" autocomplete="email" />
    <input id="password" type="password" placeholder="Password" autocomplete="current-password" />
    <p class="error" id="login-error"></p>
    <button class="primary" id="sign-in">Sign in</button>
  </div>

  <div id="consent" class="hidden">
    <p><strong id="client-name">An app</strong> wants to access your OnTrack
    account — your goals, tasks, progress, and friends.</p>
    <ul class="scopes" id="scope-list"></ul>
    <p class="muted" id="signed-in-as"></p>
    <p class="error" id="consent-error"></p>
    <button class="primary" id="approve">Allow access</button>
    <button class="secondary" id="deny">Deny</button>
    <button class="secondary" id="switch-user">Use a different account</button>
  </div>

  <div id="bad-request" class="hidden">
    <p class="error">This page was opened without a valid authorization
    request. Start the connection again from your AI app.</p>
  </div>
</div>

<script type="module">
  import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

  const supabase = createClient(
    ${JSON.stringify(config.supabaseUrl)},
    ${JSON.stringify(config.anonKey)},
  );
  const authorizationId = new URLSearchParams(location.search).get(
    "authorization_id",
  );

  const show = (id) => {
    for (const section of ["loading", "login", "consent", "bad-request"]) {
      document.getElementById(section).classList.toggle("hidden", section !== id);
    }
  };

  const showConsent = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return show("login");
    const { data, error } =
      await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
    if (error) {
      show("consent");
      document.getElementById("consent-error").textContent = error.message;
      return;
    }
    document.getElementById("client-name").textContent =
      data?.client?.name || "An app";
    const scopeList = document.getElementById("scope-list");
    scopeList.innerHTML = "";
    for (const scope of (data?.scope || "").split(" ").filter(Boolean)) {
      const item = document.createElement("li");
      item.textContent = scope;
      scopeList.appendChild(item);
    }
    document.getElementById("signed-in-as").textContent =
      "Signed in as " + (user.email || "your account");
    show("consent");
  };

  document.getElementById("sign-in").addEventListener("click", async () => {
    const errorEl = document.getElementById("login-error");
    errorEl.textContent = "";
    const { error } = await supabase.auth.signInWithPassword({
      email: document.getElementById("email").value.trim(),
      password: document.getElementById("password").value,
    });
    if (error) {
      errorEl.textContent = error.message;
      return;
    }
    await showConsent();
  });

  document.getElementById("approve").addEventListener("click", async () => {
    const { data, error } =
      await supabase.auth.oauth.approveAuthorization(authorizationId);
    if (error) {
      document.getElementById("consent-error").textContent = error.message;
      return;
    }
    location.href = data.redirect_url;
  });

  document.getElementById("deny").addEventListener("click", async () => {
    const { data, error } =
      await supabase.auth.oauth.denyAuthorization(authorizationId);
    if (error) {
      document.getElementById("consent-error").textContent = error.message;
      return;
    }
    location.href = data.redirect_url;
  });

  document.getElementById("switch-user").addEventListener("click", async () => {
    await supabase.auth.signOut();
    show("login");
  });

  if (!authorizationId) {
    show("bad-request");
  } else {
    showConsent();
  }
</script>
</body>
</html>`;
