import {
  buildDefaultUsername,
  getAccountDraftErrors,
  isValidAccountDraft,
  isValidEmail,
  isValidPassword,
  isValidUsername,
  normalizeAccountDraft,
  passwordsMatch,
  sanitizeUsername,
  sanitizeUsernameInput,
  shouldPromptForAccountSetup,
} from "./account";

describe("account helpers", () => {
  it("builds a stable default username from a display name", () => {
    expect(buildDefaultUsername(" Adam Lin ")).toBe("adam-lin");
    expect(buildDefaultUsername("@@@")).toBe("ontrack-user");
  });

  it("normalizes display names, usernames, and emails for storage", () => {
    expect(
      normalizeAccountDraft(" Adam Lin ", " Adam.Chat ", " Adam@Example.COM "),
    ).toEqual({
      displayName: "Adam Lin",
      username: "adam.chat",
      email: "adam@example.com",
    });
  });

  it("accepts standard generous usernames", () => {
    expect(isValidUsername("adam")).toBe(true);
    expect(isValidUsername("adam.chat_10")).toBe(true);
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername(".adam")).toBe(false);
  });

  it("sanitizes username input as the user types", () => {
    expect(sanitizeUsernameInput(" Adam Name ")).toBe("adamname");
    expect(sanitizeUsernameInput("Adam.Chat 99")).toBe("adam.chat99");
    expect(sanitizeUsernameInput("adam-")).toBe("adam-");
    expect(sanitizeUsernameInput("adam–")).toBe("adam-");
  });

  it("normalizes username edges before storage", () => {
    expect(sanitizeUsername("___adam___")).toBe("adam");
    expect(sanitizeUsername("adam-")).toBe("adam");
  });

  it("validates email format", () => {
    expect(isValidEmail("adam@example.com")).toBe(true);
    expect(isValidEmail("adam+ontrack@example.co")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("adam@")).toBe(false);
  });

  it("requires a secure but reasonable password", () => {
    expect(isValidPassword("longenough1")).toBe(true);
    expect(isValidPassword("alllettersss")).toBe(false);
    expect(isValidPassword("1234567890")).toBe(false);
    expect(isValidPassword("short1")).toBe(false);
  });

  it("requires matching passwords", () => {
    expect(passwordsMatch("longenough1", "longenough1")).toBe(true);
    expect(passwordsMatch("longenough1", "longenough2")).toBe(false);
    expect(passwordsMatch("", "")).toBe(false);
  });

  it("requires a valid display name, username, email, and password", () => {
    expect(
      isValidAccountDraft(
        "",
        "adam",
        "adam@example.com",
        "longenough1",
        "longenough1",
      ),
    ).toBe(false);
    expect(
      isValidAccountDraft(
        "Adam",
        "ab",
        "adam@example.com",
        "longenough1",
        "longenough1",
      ),
    ).toBe(false);
    expect(
      isValidAccountDraft(
        "Adam",
        "adam",
        "bad-email",
        "longenough1",
        "longenough1",
      ),
    ).toBe(false);
    expect(
      isValidAccountDraft(
        "Adam",
        "adam",
        "adam@example.com",
        "short1",
        "short1",
      ),
    ).toBe(false);
    expect(
      isValidAccountDraft(
        "Adam",
        "adam",
        "adam@example.com",
        "longenough1",
        "different1",
      ),
    ).toBe(false);
    expect(
      isValidAccountDraft(
        "Adam",
        "adam",
        "adam@example.com",
        "longenough1",
        "longenough1",
      ),
    ).toBe(true);
  });

  it("returns clear validation messages", () => {
    expect(
      getAccountDraftErrors("", "a", "bad-email", "short", "different"),
    ).toEqual({
      displayName: "Enter a display name.",
      username:
        "Username must be 3-32 characters and use letters, numbers, periods, underscores, or hyphens.",
      email: "Enter a valid email address.",
      password:
        "Password must be at least 10 characters and include at least one letter and one number.",
      confirmPassword: "Passwords must match.",
    });
  });

  it("prompts for setup only when no account exists", () => {
    expect(shouldPromptForAccountSetup(null)).toBe(true);
    expect(
      shouldPromptForAccountSetup({
        id: "account-1",
        displayName: "Adam",
        username: "adam",
        email: "adam@example.com",
        createdAt: 1,
      }),
    ).toBe(false);
  });
});
