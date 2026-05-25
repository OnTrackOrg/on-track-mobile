import { Session, User } from "@supabase/supabase-js";
import { buildDefaultUsername, normalizeAccountDraft } from "../account";
import { UserAccount } from "../types";
import { supabase } from "./supabase";
import { deleteRemoteAccountDataForUser } from "./dataSync";

export type AuthFormPayload = {
  displayName: string;
  username: string;
  email: string;
  password: string;
};

export type AuthMode = "sign-up" | "sign-in";

export const AUTH_CALLBACK_URL = "ontrack://auth/callback";

type ProfileRow = {
  id: string;
  display_name?: string | null;
  username?: string | null;
  email?: string | null;
  created_at?: string | null;
};

const buildAccountFromUser = (user: User): UserAccount => {
  const rawDisplayName =
    typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : (user.email?.split("@")[0] ?? "OnTrack User");
  const rawUsername =
    typeof user.user_metadata?.username === "string"
      ? user.user_metadata.username
      : buildDefaultUsername(rawDisplayName);

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
  const normalized = normalizeAccountDraft(
    profile.display_name ??
      fallbackUser.user_metadata?.display_name ??
      fallbackUser.email?.split("@")[0] ??
      "OnTrack User",
    profile.username ??
      fallbackUser.user_metadata?.username ??
      buildDefaultUsername(fallbackUser.email?.split("@")[0] ?? "OnTrack User"),
    profile.email ?? fallbackUser.email ?? "",
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

export const signUpWithEmail = async ({
  displayName,
  username,
  email,
  password,
}: AuthFormPayload) => {
  const normalized = normalizeAccountDraft(displayName, username, email);

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

export const signInWithEmail = async ({
  email,
  password,
}: Pick<AuthFormPayload, "email" | "password">) => {
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

/**
 * After the first verified sign-in we create or refresh the user's profile row.
 *
 * This keeps the app aligned with the long-term backend design where Auth owns
 * identity and `profiles` owns app-specific user data like display name and
 * username. If the row already exists, upsert makes this idempotent.
 */
export const ensureProfileForUser = async (
  user: User,
): Promise<UserAccount> => {
  const fallbackAccount = buildAccountFromUser(user);

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: fallbackAccount.id,
        email: fallbackAccount.email,
        display_name: fallbackAccount.displayName,
        username: fallbackAccount.username,
      },
      { onConflict: "id" },
    )
    .select("id, email, display_name, username, created_at")
    .single();

  if (error) {
    throw error;
  }

  return buildAccountFromProfile(data as ProfileRow, user);
};
