// Login + consent page for the Supabase OAuth 2.1 flow. OnTrack is a mobile
// app with no web frontend, so this function hosts the page the OAuth server
// redirects to (Dashboard → Authentication → OAuth Server → authorization
// path). Users sign in with Apple, Google, or their OnTrack email/password,
// review the requesting client, and approve or deny access.
//
// Visual design follows the app's AuthScreen (Claude Design "MCP Auth"
// mockup, Oct 2026): Ocean accent, surface card, pill buttons, labeled
// fields, light + dark via prefers-color-scheme.
//
// Apple and Google use Supabase's web OAuth flow (PKCE): the provider posts
// back to <supabaseUrl>/auth/v1/callback, which redirects to this page with a
// ?code= that supabase-js exchanges on load. That needs each provider's web
// client configured in Supabase Auth and this page's URL in the redirect
// allow list (see docs/mcp-server.md).
export const consentPage = (config: {
  supabaseUrl: string;
  anonKey: string;
}) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<title>OnTrack — Connect an app</title>
<link rel="icon" href="icon.png" />
<style>
  :root {
    --bg: #e9eef8; --surface: #fbfcff; --text: #111827; --muted: #6b7280;
    --border: #d7dfec; --card-border: #fbfcff; --row: #f9fafb;
    --shadow: 0 4px 12px rgba(15,23,42,.06);
    --accent: #3b82f6; --accent-fg: #fbfcff;
    --success: #10b981; --success-soft: #e3f6ee;
    --danger: #ef4444; --danger-soft: #fdecec;
    --apple-bg: #000; --apple-fg: #fff;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #101a2b; --surface: #192334; --text: #f5f7fa; --muted: #9aa4b5;
      --border: #2c3b56; --card-border: #2c3b56; --row: #1d2a40;
      --shadow: none;
      --success-soft: #163a2e; --danger-soft: #3a1f28;
      --apple-bg: #fff; --apple-fg: #000;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; padding: 24px 16px;
    background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI",
      Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    display: flex; align-items: center; justify-content: center;
  }
  .wrap { width: 100%; max-width: 342px; }
  .brand {
    display: flex; flex-direction: column; align-items: center; gap: 12px;
    margin-bottom: 28px;
  }
  .brand svg { width: 64px; height: 64px; }
  .brand .word { font-size: 15px; font-weight: 800; letter-spacing: 4px; }
  .card {
    background: var(--surface); border: 1px solid var(--card-border);
    box-shadow: var(--shadow); border-radius: 16px; padding: 24px;
    display: flex; flex-direction: column;
  }
  .card.center { align-items: center; text-align: center; gap: 8px; padding: 28px 24px; }
  h1 { font-size: 20px; font-weight: 800; line-height: 26px; margin: 0 0 6px; text-wrap: pretty; }
  .lead { font-size: 14px; line-height: 20px; color: var(--muted); margin: 0 0 20px; text-wrap: pretty; }
  .btn {
    height: 50px; border-radius: 999px; border: 0; width: 100%;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    font: inherit; font-size: 16px; font-weight: 600; cursor: pointer;
    color: var(--text); background: var(--surface);
  }
  .btn:disabled { opacity: .6; cursor: default; }
  .btn svg { width: 18px; height: 18px; flex: none; }
  .btn.apple { background: var(--apple-bg); color: var(--apple-fg); }
  .btn.apple svg { width: 16px; height: 16px; fill: currentColor; }
  .btn.google { border: 1px solid var(--border); }
  .btn.primary { background: var(--accent); color: var(--accent-fg); font-weight: 700; margin-top: 4px; }
  .btn.primary.idle { background: var(--border); color: var(--muted); }
  .btn.outline { border: 1px solid var(--border); font-weight: 700; }
  .stack { display: flex; flex-direction: column; gap: 10px; }
  .divider { display: flex; align-items: center; gap: 12px; margin: 22px 0; color: var(--muted); font-size: 12px; }
  .divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: var(--border); }
  .fields { display: flex; flex-direction: column; gap: 12px; }
  label { display: flex; flex-direction: column; gap: 8px; font-weight: 700; font-size: 16px; }
  .field {
    display: flex; align-items: center; border: 1px solid var(--border);
    border-radius: 8px; background: var(--surface); padding-right: 12px;
  }
  .field.invalid { border-color: var(--danger); }
  .field input {
    flex: 1; min-width: 0; border: 0; background: transparent; padding: 12px;
    font: inherit; font-size: 16px; font-weight: 400; color: var(--text); outline: none;
  }
  .field input::placeholder { color: var(--muted); }
  .field:focus-within { border-color: var(--accent); }
  .toggle { font-size: 13px; font-weight: 600; color: var(--muted); cursor: pointer; background: none; border: 0; font-family: inherit; padding: 0; }
  .error { color: var(--danger); font-size: 13px; line-height: 18px; min-height: 0; }
  .error:empty { display: none; }
  .info { color: var(--muted); font-size: 13px; line-height: 18px; }
  .info:empty { display: none; }
  .link { background: none; border: 0; padding: 0; font: inherit; font-size: 14px; font-weight: 600; color: var(--muted); cursor: pointer; }
  .link.accent { color: var(--accent); font-weight: 700; }
  .center-row { display: flex; justify-content: center; align-items: center; gap: 16px; margin-top: 18px; font-size: 14px; color: var(--muted); }
  .center-row .sep { width: 1px; height: 14px; background: var(--border); }
  .foot { text-align: center; font-size: 12px; line-height: 18px; color: var(--muted); margin-top: 18px; text-wrap: pretty; }
  .scopes { display: flex; flex-direction: column; gap: 10px; margin: 0 0 20px; padding: 0; list-style: none; }
  .scopes li {
    display: flex; gap: 12px; align-items: center; padding: 12px 14px;
    border-radius: 12px; background: var(--row); border: 1px solid var(--border);
    font-size: 15px; font-weight: 600;
  }
  .scopes li::before { content: ""; width: 8px; height: 8px; border-radius: 999px; background: var(--accent); flex: none; }
  .badge {
    width: 48px; height: 48px; border-radius: 999px; display: flex;
    align-items: center; justify-content: center; font-size: 22px; font-weight: 800;
    margin-bottom: 8px;
  }
  .badge.ok { background: var(--success-soft); color: var(--success); }
  .badge.no { background: var(--danger-soft); color: var(--danger); font-size: 24px; }
  .spin {
    width: 18px; height: 18px; border-radius: 999px; flex: none;
    border: 2px solid rgba(255,255,255,.35); border-top-color: var(--accent-fg);
    animation: otspin .8s linear infinite;
  }
  .spin.lg { width: 28px; height: 28px; border-width: 3px; border-color: var(--border); border-top-color: var(--accent); }
  .spin.xs { width: 14px; height: 14px; border-color: var(--border); border-top-color: var(--muted); }
  .loading { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 40px 0; color: var(--muted); font-size: 14px; }
  .returning { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 13px; color: var(--muted); }
  .hidden { display: none !important; }
  @keyframes otspin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">
    <!-- Ember Grid mark, mirrors components/BrandMark.tsx -->
    <svg viewBox="0 0 78 78" aria-hidden="true"><defs><radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#f5b453" stop-opacity="0.55"/><stop offset="1" stop-color="#f5b453" stop-opacity="0"/></radialGradient></defs><rect x="0" y="0" width="22" height="22" rx="6" fill="#5c3a12"/><rect x="28" y="0" width="22" height="22" rx="6" fill="#7a4d17"/><rect x="56" y="0" width="22" height="22" rx="6" fill="#a3661f"/><rect x="0" y="28" width="22" height="22" rx="6" fill="#7a4d17"/><rect x="28" y="28" width="22" height="22" rx="6" fill="#a3661f"/><rect x="56" y="28" width="22" height="22" rx="6" fill="#c8792a"/><rect x="0" y="56" width="22" height="22" rx="6" fill="#a3661f"/><rect x="28" y="56" width="22" height="22" rx="6" fill="#c8792a"/><rect x="42.8" y="42.8" width="48.4" height="48.4" fill="url(#glow)"/><rect x="56" y="56" width="22" height="22" rx="6" fill="#e8a33c" stroke="#f8d68a" stroke-width="1.8"/></svg>
    <div class="word">ONTRACK</div>
  </div>

  <div id="loading" class="loading"><div class="spin lg"></div><div>Loading…</div></div>

  <div id="login" class="hidden">
    <div class="card">
      <h1>Connect an app</h1>
      <p class="lead">Sign in to let an AI app read and update your goals and tasks.</p>
      <div class="stack">
        <button class="btn apple" id="sign-in-apple" type="button">
          <svg viewBox="0 0 814 1000" aria-hidden="true"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/></svg>
          Sign in with Apple
        </button>
        <button class="btn google" id="sign-in-google" type="button">
          <svg viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>
          Sign in with Google
        </button>
      </div>
      <div class="divider">or</div>
      <form class="fields" id="login-form" novalidate>
        <label>Email
          <div class="field"><input id="email" type="email" placeholder="you@example.com" autocomplete="email" /></div>
        </label>
        <label>Password
          <div class="field" id="password-field">
            <input id="password" type="password" placeholder="Your password" autocomplete="current-password" />
            <button class="toggle" id="toggle-password" type="button">Show</button>
          </div>
        </label>
        <p class="error" id="login-error"></p>
        <p class="info" id="login-info"></p>
        <button class="btn primary idle" id="sign-in" type="submit"><span class="spin hidden" id="sign-in-spin"></span><span id="sign-in-label">Sign in</span></button>
        <div style="display:flex;justify-content:center;margin-top:6px">
          <button class="link" id="forgot" type="button">Forgot password?</button>
        </div>
      </form>
    </div>
    <p class="foot">You'll review what the app can access before anything is shared.</p>
  </div>

  <div id="consent" class="hidden">
    <div class="card">
      <h1><span id="client-name">An app</span> wants to access your OnTrack account</h1>
      <p class="lead" style="margin-bottom:18px">It will be able to:</p>
      <ul class="scopes">
        <li>See your goals, tasks, and progress</li>
        <li>Create goals, log completions, and edit tasks</li>
        <li>See your friends and send nudges</li>
      </ul>
      <p class="error" id="consent-error" style="margin:0 0 12px"></p>
      <div class="stack">
        <button class="btn primary" id="approve" type="button">Allow access</button>
        <button class="btn outline" id="deny" type="button">Deny</button>
      </div>
    </div>
    <div class="center-row">
      <span id="signed-in-as">Signed in</span>
      <div class="sep"></div>
      <button class="link accent" id="switch-user" type="button">Switch</button>
    </div>
  </div>

  <div id="done" class="hidden">
    <div class="card center">
      <div class="badge" id="done-badge">✓</div>
      <h1 id="done-title" style="margin:0"></h1>
      <p class="lead" id="done-body" style="margin:0"></p>
      <div class="returning"><span class="spin xs"></span><span id="done-returning">Returning you to the app…</span></div>
    </div>
  </div>

  <div id="bad-request" class="hidden">
    <div class="card center">
      <div class="badge no">!</div>
      <h1 style="margin:0">This link isn't valid</h1>
      <p class="lead" style="margin:0">It may have expired or already been used. Start the connection again from your AI app.</p>
    </div>
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
  // Where a provider redirect should land: this page, same authorization,
  // minus any leftover ?code= / ?error= from a previous round trip.
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

  const $ = (id) => document.getElementById(id);
  const show = (id) => {
    for (const section of ["loading", "login", "consent", "done", "bad-request"]) {
      $(section).classList.toggle("hidden", section !== id);
    }
  };
  let clientName = "the app";

  const showConsent = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return show("login");
    const { data, error } =
      await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
    $("signed-in-as").textContent =
      "Signed in as " + (user.email || "your account");
    if (error) {
      show("consent");
      $("consent-error").textContent = error.message;
      return;
    }
    clientName = data?.client?.name || "An app";
    $("client-name").textContent = clientName;
    $("consent-error").textContent = "";
    show("consent");
  };

  const showDone = (approved, redirectUrl) => {
    $("done-badge").className = "badge " + (approved ? "ok" : "no");
    $("done-badge").textContent = approved ? "✓" : "×";
    $("done-title").textContent = approved
      ? clientName + " is connected"
      : "Access denied";
    $("done-body").textContent = approved
      ? "You can disconnect it anytime from the app's settings."
      : "Nothing was shared. You can connect again anytime.";
    $("done-returning").textContent = "Returning you to " + clientName + "…";
    show("done");
    setTimeout(() => { location.href = redirectUrl; }, 900);
  };

  // --- Login ---------------------------------------------------------------
  const setBusy = (busy) => {
    for (const id of ["sign-in", "sign-in-apple", "sign-in-google", "forgot"]) {
      $(id).disabled = busy;
    }
    $("sign-in-spin").classList.toggle("hidden", !busy);
    $("sign-in-label").textContent = busy ? "Signing in…" : "Sign in";
  };
  const refreshIdle = () => {
    const ready = $("email").value.trim() && $("password").value;
    $("sign-in").classList.toggle("idle", !ready);
  };
  $("email").addEventListener("input", refreshIdle);
  $("password").addEventListener("input", refreshIdle);

  $("toggle-password").addEventListener("click", () => {
    const input = $("password");
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    $("toggle-password").textContent = showing ? "Show" : "Hide";
  });

  const oauth = async (provider) => {
    $("login-error").textContent = "";
    $("login-info").textContent = "";
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: returnUrl },
    });
    if (error) {
      $("login-error").textContent = error.message;
      setBusy(false);
    }
  };
  $("sign-in-apple").addEventListener("click", () => oauth("apple"));
  $("sign-in-google").addEventListener("click", () => oauth("google"));

  $("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("login-error").textContent = "";
    $("login-info").textContent = "";
    $("password-field").classList.remove("invalid");
    const email = $("email").value.trim();
    const password = $("password").value;
    if (!email || !password) {
      $("login-error").textContent = "Enter your email and password.";
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      $("password-field").classList.add("invalid");
      $("login-error").textContent =
        /invalid login credentials/i.test(error.message)
          ? "Incorrect email or password."
          : error.message;
      setBusy(false);
      return;
    }
    await showConsent();
    setBusy(false);
  });

  $("forgot").addEventListener("click", async () => {
    $("login-error").textContent = "";
    $("login-info").textContent = "";
    const email = $("email").value.trim();
    if (!email) {
      $("login-error").textContent = "Enter your email first, then tap Forgot password.";
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "ontrack://auth/callback",
    });
    if (error) {
      $("login-error").textContent = error.message;
      return;
    }
    $("login-info").textContent =
      "Check your email for a reset link. It opens in the OnTrack app; come back here afterwards.";
  });

  // --- Consent -------------------------------------------------------------
  $("approve").addEventListener("click", async () => {
    $("approve").disabled = true;
    const { data, error } =
      await supabase.auth.oauth.approveAuthorization(authorizationId);
    if (error) {
      $("consent-error").textContent = error.message;
      $("approve").disabled = false;
      return;
    }
    showDone(true, data.redirect_url);
  });

  $("deny").addEventListener("click", async () => {
    $("deny").disabled = true;
    const { data, error } =
      await supabase.auth.oauth.denyAuthorization(authorizationId);
    if (error) {
      $("consent-error").textContent = error.message;
      $("deny").disabled = false;
      return;
    }
    showDone(false, data.redirect_url);
  });

  $("switch-user").addEventListener("click", async () => {
    await supabase.auth.signOut();
    show("login");
  });

  if (!authorizationId) {
    show("bad-request");
  } else {
    showConsent().then(() => {
      if (oauthError) $("login-error").textContent = oauthError;
    });
  }
</script>
</body>
</html>`;
