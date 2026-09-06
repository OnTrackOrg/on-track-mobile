import { Goal } from "../types";

// Every goal gets a stable accent color used for its edge bar, ring, strip,
// and heatmap (per the redesign mockups). Owners can pick one from the
// palette; otherwise it is derived from the goal id so it needs no schema
// change and matches across devices/members.
export const GOAL_PALETTE = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#84cc16", // lime
  "#10b981", // emerald
  "#0d9488", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#78716c", // stone
] as const;

// The pre-picker palette, kept so goals without an explicit color keep the
// exact accent they have always had.
const LEGACY_PALETTE = [
  "#ef4444",
  "#8b5cf6",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ec4899",
  "#0d9488",
  "#f97316",
] as const;

export const goalColor = (goalId: string): string => {
  let hash = 0;
  for (let i = 0; i < goalId.length; i++) {
    hash = (hash * 31 + goalId.charCodeAt(i)) >>> 0;
  }
  return LEGACY_PALETTE[hash % LEGACY_PALETTE.length];
};

const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

/** The goal's accent: the owner's pick when set, else the id-derived one. */
export const getGoalColor = (goal: Pick<Goal, "id" | "color">): string =>
  isHexColor(goal.color) ? goal.color.toLowerCase() : goalColor(goal.id);
