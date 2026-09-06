jest.mock("./supabase", () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

import { Goal } from "../types";
import {
  getNudgeCandidates,
  markNudgeSent,
  nudgeRetryMinutes,
  wasRecentlyNudged,
  resetNudgeHistory,
  NUDGE_COOLDOWN_MS,
} from "./nudges";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const ME_ID = "00000000-0000-4000-8000-000000000009";

const FRIEND_ID = "00000000-0000-4000-8000-000000000002";
const REFERENCE_DATE = new Date(2026, 6, 23);

const sharedGoal = (
  id: string,
  title: string,
  memberCompletions: string[] = [],
): Goal => ({
  id,
  title,
  createdAt: new Date(2026, 6, 20).getTime(),
  members: [
    {
      userId: "00000000-0000-4000-8000-000000000001",
      username: "owner",
      displayName: "Owner",
      isOwner: true,
    },
    {
      userId: FRIEND_ID,
      username: "friend",
      displayName: "Friend",
      isOwner: false,
    },
  ],
  tasks: [
    {
      id: `${id}-task`,
      title: "Daily task",
      frequency: "daily",
      completions: [],
      memberCompletions: {
        [FRIEND_ID]: memberCompletions,
      },
    },
  ],
});

describe("getNudgeCandidates", () => {
  it("returns active shared goals", () => {
    const result = getNudgeCandidates(
      [sharedGoal("1", "Drink water")],
      FRIEND_ID,
      REFERENCE_DATE,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      goal: { id: "1", title: "Drink water" },
      adherence: 0,
    });
  });

  it("excludes completed and private goals but keeps consistent ones", () => {
    const completed = {
      ...sharedGoal("1", "Completed"),
      completedAt: new Date(2026, 6, 22).getTime(),
    };
    const privateGoal: Goal = {
      ...sharedGoal("2", "Private"),
      members: undefined,
    };
    // High adherence no longer hides a goal — friends can always be nudged.
    const consistent = sharedGoal("3", "Consistent", [
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
      "2026-07-23",
    ]);

    const result = getNudgeCandidates(
      [completed, privateGoal, consistent],
      FRIEND_ID,
      REFERENCE_DATE,
    );
    expect(result.map(({ goal }) => goal.title)).toEqual(["Consistent"]);
    expect(result[0].adherence).toBe(1);
  });

  it("includes a friend's public goal I am not a member of, flagged public-only", () => {
    const publicGoal: Goal = {
      id: "4",
      title: "Public run",
      createdAt: new Date(2026, 6, 20).getTime(),
      ownerUserId: FRIEND_ID,
      isPublic: true,
      members: [
        {
          userId: FRIEND_ID,
          username: "friend",
          displayName: "Friend",
          isOwner: true,
        },
      ],
      tasks: [
        {
          id: "4-task",
          title: "Run",
          frequency: "daily",
          completions: [],
          memberCompletions: { [FRIEND_ID]: ["2026-07-23"] },
        },
      ],
    };

    const result = getNudgeCandidates(
      [publicGoal, sharedGoal("1", "Shared")],
      FRIEND_ID,
      REFERENCE_DATE,
      ME_ID,
    );

    expect(result.map(({ goal }) => goal.id)).toEqual(["1", "4"]);
    expect(result.find(({ goal }) => goal.id === "4")?.isPublicOnly).toBe(true);
    expect(result.find(({ goal }) => goal.id === "1")?.isPublicOnly).toBe(true);
  });

  it("marks goals I am part of as not public-only", () => {
    const result = getNudgeCandidates(
      [sharedGoal("1", "Shared")],
      FRIEND_ID,
      REFERENCE_DATE,
      OWNER_ID,
    );
    expect(result[0].isPublicOnly).toBe(false);
  });

  it("puts the least-adherent shared goal first", () => {
    const result = getNudgeCandidates(
      [
        sharedGoal("1", "Some progress", ["2026-07-23"]),
        sharedGoal("2", "No progress"),
      ],
      FRIEND_ID,
      REFERENCE_DATE,
    );

    expect(result.map(({ goal }) => goal.title)).toEqual([
      "No progress",
      "Some progress",
    ]);
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
