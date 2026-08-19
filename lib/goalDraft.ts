import { CustomFrequency, Frequency } from "../types";
import { normalizeWeekdays } from "./taskSchedule";
import { supabase } from "./supabase";

/**
 * AI-assisted goal drafting (issue #161). The draft-goal edge function asks
 * Claude for a structured draft; everything it returns is sanitized here
 * before touching app state, and any failure (offline, signed out, function
 * not deployed) falls back to a deterministic local template so the flow
 * always produces an editable draft.
 */

export type GoalDraftTask = {
  title: string;
  frequency: Frequency;
  customFrequency?: CustomFrequency;
};

export type GoalDraft = {
  title: string;
  target?: string;
  durationDays?: number;
  tasks: GoalDraftTask[];
  // Whether the draft came from the AI endpoint or the bundled fallback.
  source: "ai" | "offline";
};

const FREQUENCIES: readonly Frequency[] = ["once", "daily", "weekly", "custom"];
const MAX_TASKS = 5;
const DEFAULT_DURATION_DAYS = 56;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

const cleanText = (value: unknown, maxLength: number): string =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

type RawDraftTask = {
  title?: unknown;
  frequency?: unknown;
  customType?: unknown;
  customTarget?: unknown;
  weekdays?: unknown;
};

const sanitizeTask = (raw: RawDraftTask): GoalDraftTask | null => {
  const title = cleanText(raw.title, 80);
  if (!title) return null;

  const weekdays = Array.isArray(raw.weekdays)
    ? normalizeWeekdays(
        raw.weekdays.filter((d): d is number => typeof d === "number"),
      )
    : [];
  if (weekdays.length > 0 && weekdays.length < 7) {
    return {
      title,
      frequency: "custom",
      customFrequency: {
        type: "weekly",
        target: weekdays.length,
        weekdays,
      },
    };
  }

  const frequency = FREQUENCIES.includes(raw.frequency as Frequency)
    ? (raw.frequency as Frequency)
    : "daily";
  if (frequency !== "custom") {
    return { title, frequency };
  }

  const type = raw.customType === "monthly" ? "monthly" : "weekly";
  const targetValue =
    typeof raw.customTarget === "number" ? raw.customTarget : NaN;
  if (!Number.isFinite(targetValue)) {
    return { title, frequency: "daily" };
  }
  return {
    title,
    frequency: "custom",
    customFrequency: {
      type,
      target: clamp(targetValue, 1, type === "weekly" ? 7 : 31),
    },
  };
};

export const sanitizeGoalDraft = (
  raw: unknown,
  source: GoalDraft["source"],
): GoalDraft | null => {
  if (!raw || typeof raw !== "object") return null;
  const draft = raw as {
    title?: unknown;
    target?: unknown;
    durationDays?: unknown;
    tasks?: unknown;
  };

  const title = cleanText(draft.title, 60);
  if (!title) return null;

  const tasks = (Array.isArray(draft.tasks) ? draft.tasks : [])
    .map((task) => sanitizeTask(task as RawDraftTask))
    .filter((task): task is GoalDraftTask => task !== null)
    .slice(0, MAX_TASKS);
  if (tasks.length === 0) return null;

  const target = cleanText(draft.target, 60) || undefined;
  const durationDays =
    typeof draft.durationDays === "number" &&
    Number.isFinite(draft.durationDays)
      ? clamp(draft.durationDays, 7, 365)
      : undefined;

  return { title, target, durationDays, tasks, source };
};

type OfflineTemplate = {
  keywords: string[];
  tasks: GoalDraftTask[];
};

const OFFLINE_TEMPLATES: OfflineTemplate[] = [
  {
    keywords: [
      "run",
      "gym",
      "workout",
      "work out",
      "exercise",
      "fitness",
      "marathon",
      "strength",
      "muscle",
      "weight",
    ],
    tasks: [
      {
        title: "Do a workout",
        frequency: "custom",
        customFrequency: { type: "weekly", target: 3 },
      },
      { title: "Stretch for 10 minutes", frequency: "daily" },
      { title: "Plan next week's sessions", frequency: "weekly" },
    ],
  },
  {
    keywords: [
      "read",
      "book",
      "learn",
      "study",
      "course",
      "language",
      "practice",
      "guitar",
      "piano",
      "code",
      "coding",
    ],
    tasks: [
      { title: "Practice for 20 minutes", frequency: "daily" },
      {
        title: "Do a longer deep-dive session",
        frequency: "custom",
        customFrequency: { type: "weekly", target: 2 },
      },
      { title: "Review what you learned", frequency: "weekly" },
    ],
  },
  {
    keywords: ["save", "saving", "budget", "money", "spend", "debt"],
    tasks: [
      { title: "Log today's spending", frequency: "daily" },
      { title: "Review the budget", frequency: "weekly" },
      {
        title: "Move savings aside",
        frequency: "custom",
        customFrequency: { type: "monthly", target: 1 },
      },
    ],
  },
  {
    keywords: [
      "sleep",
      "meditat",
      "journal",
      "stress",
      "mindful",
      "health",
      "water",
      "habit",
    ],
    tasks: [
      { title: "Do a 10-minute check-in", frequency: "daily" },
      { title: "Reflect on the week", frequency: "weekly" },
    ],
  },
];

const toTitleCase = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1);

/**
 * Deterministic template-based draft used whenever the AI endpoint can't be
 * reached. Keyword buckets keep the suggestions relevant enough to edit.
 */
export const generateLocalGoalDraft = (description: string): GoalDraft => {
  const trimmed = description.trim().replace(/[.!?\s]+$/, "");
  const lower = trimmed.toLowerCase();

  const template = OFFLINE_TEMPLATES.find((candidate) =>
    candidate.keywords.some((keyword) => lower.includes(keyword)),
  );

  const tasks: GoalDraftTask[] = template
    ? template.tasks.map((task) => ({ ...task }))
    : [
        {
          title: `Work toward "${trimmed.slice(0, 40) || "this goal"}" for 15 minutes`,
          frequency: "daily",
        },
        { title: "Check in on progress", frequency: "weekly" },
      ];

  return {
    title: toTitleCase(trimmed.slice(0, 60)) || "New goal",
    durationDays: DEFAULT_DURATION_DAYS,
    tasks,
    source: "offline",
  };
};

export const generateGoalDraft = async (
  description: string,
): Promise<GoalDraft> => {
  try {
    const { data, error } = await supabase.functions.invoke("draft-goal", {
      body: { description },
    });
    if (!error) {
      const draft = sanitizeGoalDraft(
        (data as { draft?: unknown } | null)?.draft,
        "ai",
      );
      if (draft) return draft;
    }
  } catch {
    // Offline/signed-out/undeployed: fall through to the local template.
  }
  return generateLocalGoalDraft(description);
};
