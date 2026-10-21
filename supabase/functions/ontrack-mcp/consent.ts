// Login + consent page for the Supabase OAuth 2.1 flow. OnTrack is a mobile
// app with no web frontend, so this function hosts the page the OAuth server
// redirects to (Dashboard → Authentication → OAuth Server → authorization
// path). Users sign in with Apple or their OnTrack email/password, review the
// requesting client, and approve or deny access.
//
// Sign in with Apple uses Supabase's web OAuth flow (PKCE): Apple posts back
// to <supabaseUrl>/auth/v1/callback, which redirects to this page with a
// ?code= that supabase-js exchanges on load. That needs the Apple provider's
// Services ID + secret configured in Supabase Auth and this page's URL in the
// redirect allow list (see docs/mcp-server.md).
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
  .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
  .brand svg { width: 36px; height: 36px; flex: none; }
  h1 { font-size: 1.25rem; margin: 0; }
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
  .apple {
    background: #000; color: #fff; margin-top: 0;
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .apple svg { width: 16px; height: 16px; fill: currentColor; }
  @media (prefers-color-scheme: dark) { .apple { background: #fff; color: #000; } }
  .divider {
    display: flex; align-items: center; gap: 12px; margin: 14px 0 6px;
    color: #8e8e93; font-size: .8125rem;
  }
  .divider::before, .divider::after {
    content: ""; flex: 1; border-top: 1px solid #d1d1d6;
  }
  .error { color: #ff3b30; font-size: .875rem; min-height: 1.2em; }
  .hidden { display: none; }
  .scopes { padding-left: 20px; margin: 8px 0; }
</style>
</head>
<body>
<div class="card">
  <div class="brand">
    <!-- Ember Grid mark, mirrors components/BrandMark.tsx -->
    <svg viewBox="0 0 78 78" aria-hidden="true"><defs><radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#f5b453" stop-opacity="0.55"/><stop offset="1" stop-color="#f5b453" stop-opacity="0"/></radialGradient></defs><rect x="0" y="0" width="22" height="22" rx="6" fill="#5c3a12"/><rect x="28" y="0" width="22" height="22" rx="6" fill="#7a4d17"/><rect x="56" y="0" width="22" height="22" rx="6" fill="#a3661f"/><rect x="0" y="28" width="22" height="22" rx="6" fill="#7a4d17"/><rect x="28" y="28" width="22" height="22" rx="6" fill="#a3661f"/><rect x="56" y="28" width="22" height="22" rx="6" fill="#c8792a"/><rect x="0" y="56" width="22" height="22" rx="6" fill="#a3661f"/><rect x="28" y="56" width="22" height="22" rx="6" fill="#c8792a"/><rect x="42.8" y="42.8" width="48.4" height="48.4" fill="url(#glow)"/><rect x="56" y="56" width="22" height="22" rx="6" fill="#e8a33c" stroke="#f8d68a" stroke-width="1.8"/></svg>
    <h1>OnTrack</h1>
  </div>
  <div id="loading"><p class="muted">Loading…</p></div>

  <div id="login" class="hidden">
    <p>Sign in to connect an app to your OnTrack account.</p>
    <button class="apple" id="sign-in-apple" type="button">
      <svg viewBox="0 0 814 1000" aria-hidden="true"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/></svg>
      Sign in with Apple
    </button>
    <div class="divider">or</div>
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
    { auth: { flowType: "pkce" } },
  );
  const params = new URLSearchParams(location.search);
  const authorizationId = params.get("authorization_id");
  // Where Apple's redirect should land: this page, same authorization, minus
  // any leftover ?code= / ?error= from a previous round trip.
  const returnUrl = authorizationId
    ? location.origin + location.pathname +
      "?authorization_id=" + encodeURIComponent(authorizationId)
    : location.origin + location.pathname;
  // supabase-js exchanges ?code= on load; surface a provider error ourselves
  // and tidy the address bar either way.
  const oauthError = params.get("error_description") || params.get("error");
  if (params.has("code") || oauthError) {
    history.replaceState(null, "", returnUrl);
  }

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

  document.getElementById("sign-in-apple").addEventListener("click", async () => {
    const errorEl = document.getElementById("login-error");
    errorEl.textContent = "";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: returnUrl },
    });
    if (error) errorEl.textContent = error.message;
  });

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
    showConsent().then(() => {
      if (oauthError) {
        document.getElementById("login-error").textContent = oauthError;
      }
    });
  }
</script>
</body>
</html>`;
