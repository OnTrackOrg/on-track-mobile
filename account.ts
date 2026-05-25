import { UserAccount } from "./types";

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 32;
const PASSWORD_MIN_LENGTH = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^(?=.{3,32}$)[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const PASSWORD_LETTER_PATTERN = /[a-z]/i;
const PASSWORD_NUMBER_PATTERN = /\d/;

export const buildDefaultUsername = (displayName: string): string => {
  const normalized = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);

  return normalized || "ontrack-user";
};

export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

export const sanitizeUsernameInput = (username: string): string =>
  username
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_.-]/g, "")
    .slice(0, USERNAME_MAX_LENGTH);

export const sanitizeUsername = (username: string): string =>
  sanitizeUsernameInput(username).replace(/^[._-]+|[._-]+$/g, "");

export const normalizeAccountDraft = (
  displayName: string,
  username?: string,
  email?: string,
) => {
  const trimmedDisplayName = displayName.trim();
  const trimmedUsername = username?.trim() ?? "";
  const normalizedUsername = sanitizeUsername(
    trimmedUsername || buildDefaultUsername(trimmedDisplayName),
  );

  return {
    displayName: trimmedDisplayName,
    username: normalizedUsername || "ontrack-user",
    email: normalizeEmail(email ?? ""),
  };
};

export const isValidUsername = (username: string) =>
  USERNAME_PATTERN.test(username.trim().toLowerCase());

export const isValidEmail = (email: string) =>
  EMAIL_PATTERN.test(normalizeEmail(email));

export const isValidPassword = (password: string) => {
  const trimmedPassword = password.trim();

  return (
    trimmedPassword.length >= PASSWORD_MIN_LENGTH &&
    PASSWORD_LETTER_PATTERN.test(trimmedPassword) &&
    PASSWORD_NUMBER_PATTERN.test(trimmedPassword)
  );
};

export const passwordsMatch = (password: string, confirmPassword: string) =>
  password.length > 0 && password === confirmPassword;

export const getAccountDraftErrors = (
  displayName: string,
  username?: string,
  email?: string,
  password?: string,
  confirmPassword?: string,
) => {
  const normalized = normalizeAccountDraft(displayName, username, email);

  return {
    displayName:
      normalized.displayName.length > 0 ? "" : "Enter a display name.",
    username: isValidUsername(normalized.username)
      ? ""
      : `Username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters and use letters, numbers, periods, underscores, or hyphens.`,
    email: isValidEmail(normalized.email) ? "" : "Enter a valid email address.",
    password: isValidPassword(password ?? "")
      ? ""
      : `Password must be at least ${PASSWORD_MIN_LENGTH} characters and include at least one letter and one number.`,
    confirmPassword: passwordsMatch(password ?? "", confirmPassword ?? "")
      ? ""
      : "Passwords must match.",
  };
};

export const isValidAccountDraft = (
  displayName: string,
  username?: string,
  email?: string,
  password?: string,
  confirmPassword?: string,
) => {
  const errors = getAccountDraftErrors(
    displayName,
    username,
    email,
    password,
    confirmPassword,
  );
  return Object.values(errors).every((error) => !error);
};

export const shouldPromptForAccountSetup = (
  account: UserAccount | null | undefined,
) => !account;
