jest.mock("./supabase", () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

import { Goal } from "../types";
import {
  getFriendPublicGoals,
  markNudgeSent,
  nudgeRetryMinutes,
  wasRecentlyNudged,
  resetNudgeHistory,
  NUDGE_COOLDOWN_MS,
} from "./nudges";

const FRIEND_ID = "00000000-0000-4000-8000-000000000002";
const OTHER_ID = "00000000-0000-4000-8000-000000000003";
const REFERENCE_DATE = new Date(2026, 6, 23);

const friendGoal = (id: string, overrides: Partial<Goal> = {}): Goal => ({
  id,
  title: `Goal ${id}`,
  createdAt: new Date(2026, 6, 20).getTime(),
  ownerUserId: FRIEND_ID,
  isPublic: true,
  tasks: [
    { id: `${id}-task`, title: "Run", frequency: "daily", completions: [] },
  ],
  ...overrides,
});

describe("getFriendPublicGoals", () => {
  it("keeps the friend's started, unachieved public goals in their order", () => {
    const result = getFriendPublicGoals(
      [
        friendGoal("1"),
        friendGoal("2", { completedAt: new Date(2026, 6, 22).getTime() }),
        friendGoal("3", { isPublic: undefined }),
        friendGoal("4", { isDraft: true }),
        friendGoal("5", { startDay: "2026-08-01" }),
        friendGoal("6", { ownerUserId: OTHER_ID }),
        friendGoal("7"),
      ],
      FRIEND_ID,
      REFERENCE_DATE,
    );

    expect(result.map((goal) => goal.id)).toEqual(["1", "7"]);
  });
});

describe("nudge cooldown", () => {
  beforeEach(() => resetNudgeHistory());

  it("reports a recent nudge for the same friend and goal", () => {
    markNudgeSent("friend-1", "goal-1", 1_000);
    expect(wasRecentlyNudged("friend-1", "goal-1", 2_000)).toBe(true);
  });

  it("does not block other goals or friends", () => {
    markNudgeSent("friend-1", "goal-1", 1_000);
    expect(wasRecentlyNudged("friend-1", "goal-2", 2_000)).toBe(false);
    expect(wasRecentlyNudged("friend-2", "goal-1", 2_000)).toBe(false);
  });

  it("is a one-hour window and reports minutes left", () => {
    expect(NUDGE_COOLDOWN_MS).toBe(60 * 60 * 1000);
    markNudgeSent("friend-1", "goal-1", 0);
    expect(nudgeRetryMinutes("friend-1", "goal-1", 20 * 60_000)).toBe(40);
    expect(nudgeRetryMinutes("friend-1", "goal-1", NUDGE_COOLDOWN_MS)).toBe(0);
    expect(nudgeRetryMinutes("friend-2", "goal-1", 0)).toBe(0);
  });

  it("expires after the cooldown window", () => {
    markNudgeSent("friend-1", "goal-1", 1_000);
    expect(
      wasRecentlyNudged("friend-1", "goal-1", 1_000 + NUDGE_COOLDOWN_MS + 1),
    ).toBe(false);
  });
});
