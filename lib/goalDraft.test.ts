jest.mock("./supabase", () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

import { generateLocalGoalDraft, sanitizeGoalDraft } from "./goalDraft";

describe("sanitizeGoalDraft", () => {
  it("keeps a well-formed AI draft", () => {
    const draft = sanitizeGoalDraft(
      {
        title: "Run a 10k",
        target: "10k in under an hour",
        durationDays: 84,
        tasks: [
          { title: "Easy run", frequency: "custom", weekdays: [2, 4] },
          {
            title: "Long run",
            frequency: "custom",
            customType: "weekly",
            customTarget: 1,
          },
          { title: "Stretch", frequency: "daily" },
        ],
      },
      "ai",
    );

    expect(draft).not.toBeNull();
    expect(draft?.title).toBe("Run a 10k");
    expect(draft?.durationDays).toBe(84);
    expect(draft?.tasks[0].customFrequency).toEqual({
      type: "weekly",
      target: 2,
      weekdays: [2, 4],
    });
    expect(draft?.tasks[1].customFrequency).toEqual({
      type: "weekly",
      target: 1,
    });
    expect(draft?.tasks[2]).toEqual({ title: "Stretch", frequency: "daily" });
  });

  it("coerces junk frequencies and clamps targets", () => {
    const draft = sanitizeGoalDraft(
      {
        title: "X",
        tasks: [
          { title: "A", frequency: "hourly" },
          {
            title: "B",
            frequency: "custom",
            customType: "weekly",
            customTarget: 99,
          },
          { title: "C", frequency: "custom" },
        ],
      },
      "ai",
    );

    expect(draft?.tasks[0].frequency).toBe("daily");
    expect(draft?.tasks[1].customFrequency?.target).toBe(7);
    // custom without any custom config degrades to daily
    expect(draft?.tasks[2].frequency).toBe("daily");
  });

  it("rejects drafts without a title or tasks", () => {
    expect(sanitizeGoalDraft({ title: "", tasks: [] }, "ai")).toBeNull();
    expect(sanitizeGoalDraft({ title: "T", tasks: [] }, "ai")).toBeNull();
    expect(sanitizeGoalDraft(null, "ai")).toBeNull();
  });
});

describe("generateLocalGoalDraft", () => {
  it("matches a fitness template", () => {
    const draft = generateLocalGoalDraft("train for a marathon");
    expect(draft.source).toBe("offline");
    expect(draft.title).toBe("Train for a marathon");
    expect(draft.tasks.length).toBeGreaterThanOrEqual(2);
    expect(draft.tasks[0].customFrequency?.target).toBe(3);
  });

  it("falls back to a generic scaffold", () => {
    const draft = generateLocalGoalDraft("become a beekeeper");
    expect(draft.tasks).toHaveLength(2);
    expect(draft.tasks[0].frequency).toBe("daily");
    expect(draft.durationDays).toBe(56);
  });
});
