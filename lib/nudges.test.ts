jest.mock("./supabase", () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

import { Goal } from "../types";
import { getNudgeCandidates } from "./nudges";

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
  it("returns active shared goals where the friend needs encouragement", () => {
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

  it("excludes completed, private, and consistently completed goals", () => {
    const completed = {
      ...sharedGoal("1", "Completed"),
      completedAt: new Date(2026, 6, 22).getTime(),
    };
    const privateGoal: Goal = {
      ...sharedGoal("2", "Private"),
      members: undefined,
    };
    const consistent = sharedGoal("3", "Consistent", [
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
      "2026-07-23",
    ]);

    expect(
      getNudgeCandidates(
        [completed, privateGoal, consistent],
        FRIEND_ID,
        REFERENCE_DATE,
      ),
    ).toEqual([]);
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
