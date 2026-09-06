import { Session, User } from "@supabase/supabase-js";
import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import {
  buildDefaultUsername,
  normalizeAccountDraft,
  sanitizeUsername,
} from "../account";
import { UserAccount } from "../types";
import { supabase } from "./supabase";
import { deleteRemoteAccountDataForUser } from "./dataSync";

export type AuthFormPayload = {
  email: string;
  password: string;
};

export type AuthMode = "sign-up" | "sign-in";
export type SsoProvider = "apple" | "google";

export const AUTH_CALLBACK_URL = "ontrack://auth/callback";

/**
 * Where OAuth / email links come back to. A release build gets the custom
 * scheme; Expo Go gets exp://<host>/--/auth/callback so Google sign-in can
 * be exercised in development too (both must be in Supabase's redirect
 * allow list).
 */
export const getAuthRedirectUrl = (): string =>
  Linking.createURL("auth/callback");

type ProfileRow = {
  id: string;
  display_name?: string | null;
  username?: string | null;
  email?: string | null;
  created_at?: string | null;
};

const metadataString = (user: User, key: string): string | undefined => {
  const value = user.user_metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

/** "adam.lin" → "Adam Lin": a readable name from an email local part. */
export const displayNameFromEmail = (email: string): string => {
  const local = email.split("@")[0] ?? "";
  const words = local
    .replace(/\d+$/g, "")
    .split(/[._\-+]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.join(" ") || "OnTrack User";
};

/**
 * The best display name we know for a user: what they set in-app, else what
 * the identity provider told us (Google: full_name/name; Apple: only on the
 * first sign-in, stored into metadata by signInWithApple), else their email.
 */
const resolveDisplayName = (user: User): string =>
  metadataString(user, "display_name") ??
  metadataString(user, "full_name") ??
  metadataString(user, "name") ??
  displayNameFromEmail(user.email ?? "");

const buildAccountFromUser = (user: User): UserAccount => {
  const rawDisplayName = resolveDisplayName(user);
  const rawUsername =
    metadataString(user, "username") ?? buildDefaultUsername(rawDisplayName);

  const normalized = normalizeAccountDraft(
    rawDisplayName,
    rawUsername,
    user.email ?? "",
  );

  return {
    id: user.id,
    displayName: normalized.displayName,
    username: normalized.username,
    email: normalized.email,
    createdAt: user.created_at
      ? new Date(user.created_at).getTime()
      : Date.now(),
  };
};

const buildAccountFromProfile = (
  profile: ProfileRow,
  fallbackUser: User,
): UserAccount => {
  const fallback = buildAccountFromUser(fallbackUser);
  const normalized = normalizeAccountDraft(
    profile.display_name ?? fallback.displayName,
    profile.username ?? fallback.username,
    profile.email ?? fallback.email,
  );

  return {
    id: profile.id,
    displayName: normalized.displayName,
    username: normalized.username,
    email: normalized.email,
    createdAt: profile.created_at
      ? new Date(profile.created_at).getTime()
      : Date.now(),
  };
};

/**
 * Email sign-up asks for nothing but email + password. The display name and
 * username are derived from the email and can be changed from Profile.
 */
export const signUpWithEmail = async ({ email, password }: AuthFormPayload) => {
  const displayName = displayNameFromEmail(email);
  const normalized = normalizeAccountDraft(displayName, undefined, email);

  const { data, error } = await supabase.auth.signUp({
    email: normalized.email,
    password,
    options: {
      emailRedirectTo: AUTH_CALLBACK_URL,
      data: {
        display_name: normalized.displayName,
        username: normalized.username,
      },
    },
  });

  if (error) {
    throw error;
  }

  return data;
};

export const signInWithEmail = async ({ email, password }: AuthFormPayload) => {
  const normalized = normalizeAccountDraft("OnTrack User", undefined, email);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalized.email,
    password,
  });

  if (error) {
    throw error;
  }

  return data;
};

// ---------------------------------------------------------------------------
// Sign in with Apple (native) and Google (system browser)
// ---------------------------------------------------------------------------

export const isAppleSignInAvailable = async (): Promise<boolean> => {
  if (Platform.OS !== "ios") return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
};

/** Thrown when the user backs out of a provider sheet; callers stay quiet. */
export class SsoCancelledError extends Error {
  constructor() {
    super("Sign-in cancelled");
    this.name = "SsoCancelledError";
  }
}

const isAppleCancel = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: string }).code === "ERR_REQUEST_CANCELED";

type AppleCredentialResult = {
  identityToken: string;
  rawNonce: string;
  fullName: string;
};

const requestAppleCredential = async (): Promise<AppleCredentialResult> => {
  // Supabase verifies the nonce inside the identity token against the raw
  // one we send; Apple wants the SHA-256 of it.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (error) {
    if (isAppleCancel(error)) throw new SsoCancelledError();
    throw error;
  }

  if (!credential.identityToken) {
    throw new Error("Apple didn't return a sign-in token. Try again.");
  }

  const fullName = [
    credential.fullName?.givenName,
    credential.fullName?.familyName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return { identityToken: credential.identityToken, rawNonce, fullName };
};

/**
 * Apple only shares the user's name on the very first authorization, so
 * capture it into auth metadata right away; ensureProfileForUser reads it
 * from there on every launch.
 */
const rememberAppleName = async (user: User | null, fullName: string) => {
  if (!fullName || !user || metadataString(user, "display_name")) return;
  await supabase.auth
    .updateUser({
      data: {
        display_name: fullName,
        username: buildDefaultUsername(fullName),
      },
    })
    .catch(() => {});
};

export const signInWithApple = async () => {
  const { identityToken, rawNonce, fullName } = await requestAppleCredential();
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;
  await rememberAppleName(data.user, fullName);
  return data;
};

const finishOAuthRedirect = async (url: string): Promise<Session | null> => {
  const parsed = new URL(url);
  const code = parsed.searchParams.get("code");
  if (code) return exchangeAuthCodeForSession(code);
  const description =
    parsed.searchParams.get("error_description") ??
    parsed.searchParams.get("error");
  throw new Error(
    description
      ? description.replace(/\+/g, " ")
      : "Google sign-in didn't complete. Try again.",
  );
};

export const signInWithGoogle = async (): Promise<Session | null> => {
  const redirectTo = getAuthRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error("Could not start Google sign-in.");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") throw new SsoCancelledError();
  return finishOAuthRedirect(result.url);
};

// ---------------------------------------------------------------------------
// Linked sign-in methods (Profile → Account)
// ---------------------------------------------------------------------------

export const getLinkedProviders = async (): Promise<string[]> => {
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) throw error;
  return (data?.identities ?? []).map((identity) => identity.provider);
};

/** Add Apple as a sign-in method for the signed-in account. */
export const linkAppleAccount = async (): Promise<void> => {
  const { identityToken, rawNonce } = await requestAppleCredential();
  const { error } = await supabase.auth.linkIdentity({
    provider: "apple",
    token: identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;
};

/** Add Google as a sign-in method for the signed-in account. */
export const linkGoogleAccount = async (): Promise<void> => {
  const redirectTo = getAuthRedirectUrl();
  const { data, error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error("Could not start Google sign-in.");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") throw new SsoCancelledError();
  await finishOAuthRedirect(result.url);
};

export const resendSignupVerification = async (email: string) => {
  const normalized = normalizeAccountDraft("OnTrack User", undefined, email);
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: normalized.email,
    options: {
      emailRedirectTo: AUTH_CALLBACK_URL,
    },
  });

  if (error) {
    throw error;
  }
};

export const requestPasswordReset = async (email: string) => {
  const normalized = normalizeAccountDraft("OnTrack User", undefined, email);
  const { error } = await supabase.auth.resetPasswordForEmail(
    normalized.email,
    {
      redirectTo: AUTH_CALLBACK_URL,
    },
  );

  if (error) {
    throw error;
  }
};

export const exchangeAuthCodeForSession = async (code: string) => {
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    throw error;
  }

  return data.session;
};

export const updateCurrentUserPassword = async (password: string) => {
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    throw error;
  }
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
};

export const getPersistedSession = async (): Promise<Session | null> => {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
};

export const deleteCurrentAccount = async () => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    throw new Error("No signed-in user found.");
  }

  await deleteRemoteAccountDataForUser(user);
  const { error: deleteAuthUserError } =
    await supabase.functions.invoke("delete-account");

  if (deleteAuthUserError) {
    throw deleteAuthUserError;
  }

  await signOut();
};

const isUsernameCollision = (error: { code?: string; message?: string }) =>
  error.code === "23505" && /username/i.test(error.message ?? "");

const withSuffix = (username: string): string => {
  const suffix = Math.floor(1000 + Math.random() * 9000).toString();
  return `${sanitizeUsername(username).slice(0, 32 - suffix.length - 1)}-${suffix}`;
};

/**
 * After the first verified sign-in we create or refresh the user's profile row.
 *
 * Auth owns identity and `profiles` owns app-specific user data like display
 * name and username. Names come from auth metadata (set at sign-up, by the
 * provider, or by updateProfileNames), so the upsert is idempotent. Derived
 * usernames can collide with someone else's; on collision we retry with a
 * numeric suffix and remember it in metadata.
 */
export const ensureProfileForUser = async (
  user: User,
): Promise<UserAccount> => {
  const fallbackAccount = buildAccountFromUser(user);

  const upsert = (username: string) =>
    supabase
      .from("profiles")
      .upsert(
        {
          id: fallbackAccount.id,
          email: fallbackAccount.email,
          display_name: fallbackAccount.displayName,
          username,
        },
        { onConflict: "id" },
      )
      .select("id, email, display_name, username, created_at")
      .single();

  let { data, error } = await upsert(fallbackAccount.username);
  for (
    let attempt = 0;
    attempt < 3 && error && isUsernameCollision(error);
    attempt++
  ) {
    const retryUsername = withSuffix(fallbackAccount.username);
    ({ data, error } = await upsert(retryUsername));
    if (!error) {
      await supabase.auth
        .updateUser({ data: { username: retryUsername } })
        .catch(() => {});
    }
  }

  if (error) {
    throw error;
  }

  return buildAccountFromProfile(data as ProfileRow, user);
};

/** Change display name / username from Profile (auth metadata + profile row). */
export const updateProfileNames = async (
  user: User,
  displayName: string,
  username: string,
): Promise<UserAccount> => {
  const normalized = normalizeAccountDraft(
    displayName,
    username,
    user.email ?? "",
  );

  const { data, error } = await supabase
    .from("profiles")
    .update({
      display_name: normalized.displayName,
      username: normalized.username,
    })
    .eq("id", user.id)
    .select("id, email, display_name, username, created_at")
    .single();
  if (error) {
    if (isUsernameCollision(error)) {
      throw new Error("That username is taken.");
    }
    throw error;
  }

  const { error: metadataError } = await supabase.auth.updateUser({
    data: {
      display_name: normalized.displayName,
      username: normalized.username,
    },
  });
  if (metadataError) throw metadataError;

  return buildAccountFromProfile(data as ProfileRow, user);
};
